import { parseArgs } from 'node:util'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { verifyApiRelease } from './release-api.mjs'
import { backfillCurriculum, validateCurriculumBackfill } from '../worker/db/curriculum-backfill.js'
import { getCurriculumCutoverStatus, getCurriculumMappingSha256 } from '../worker/db/curriculum-cutover.js'

function privatePath(value, option) {
  const path = resolve(value)
  if (!path.startsWith(resolve('.amp/in') + sep) || !path.endsWith('.json')) {
    throw new Error(`${option} must be a JSON file under .amp/in`)
  }
  return path
}

export function parseCurriculumArgs(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    local: { type: 'boolean' }, remote: { type: 'boolean' },
    'persist-to': { type: 'string' }, mapping: { type: 'string' },
    output: { type: 'string' }, commit: { type: 'string' },
    'confirm-production': { type: 'boolean' }, 'api-mode': { type: 'string' },
  } })
  const command = positionals[0]
  if (positionals.length !== 1 || !['inspect', 'validate', 'apply', 'check'].includes(command)) {
    throw new Error('Expected inspect, validate, apply or check command')
  }
  const apiMode = values['api-mode'] ?? 'closed'
  if (!['open', 'closed'].includes(apiMode)) throw new Error('--api-mode must be open or closed')
  if (apiMode === 'open' && command !== 'check') throw new Error('--api-mode open is allowed only for check')
  if (Boolean(values.local) === Boolean(values.remote)) throw new Error('Select exactly one target: --local or --remote')
  if (values.local && !values['persist-to']) throw new Error('--local requires --persist-to')
  if (values.remote && values['persist-to']) throw new Error('--persist-to is local-only')
  if (values.remote && !/^[a-f0-9]{40}$/.test(values.commit ?? '')) throw new Error('--remote requires a full --commit')
  if (['validate', 'apply'].includes(command) && !values.mapping) throw new Error('A reviewed --mapping is required')
  if (command === 'apply' && values.remote && !values['confirm-production']) throw new Error('Remote writes require --confirm-production after approval')
  if (['inspect', 'validate'].includes(command) && !values.output) throw new Error(`${command} requires a private --output file`)
  return {
    command, remote: Boolean(values.remote), commit: values.commit, apiMode, persistTo: values['persist-to'],
    mapping: values.mapping ? privatePath(values.mapping, '--mapping') : undefined,
    output: values.output ? privatePath(values.output, '--output') : undefined,
  }
}

export async function runCurriculumRelease(args, {
  verify = verifyApiRelease,
  connect = async (options) => (await import('wrangler')).getPlatformProxy(options),
} = {}) {
  const options = parseCurriculumArgs(args)
  const mapping = options.mapping ? JSON.parse(await readFile(options.mapping, 'utf8')) : undefined
  if (options.remote) await verify(options.apiMode, options.commit)
  const platform = await connect({
    configPath: fileURLToPath(new URL('./workspace-operator.toml', import.meta.url)),
    envFiles: [], remoteBindings: options.remote,
    persist: options.remote ? false : { path: resolve(options.persistTo, 'v3') },
  })
  try {
    const db = platform.env.DB
    let result
    if (options.command === 'inspect') {
      result = { commit: options.commit ?? null, captured_at: new Date().toISOString() }
      for (const [key, sql] of Object.entries({
        lectures: 'select id, workspace_id, title, youtube_url, order_index, is_visible, minimum_access_tier from lectures order by order_index, id',
        lecture_grades: 'select lecture_id, grade from lecture_grades order by lecture_id, grade',
        exercises: 'select id, workspace_id, minimum_access_tier from exercises order by id',
        workspaces: 'select id, curriculum_revision from workspaces order by id',
      })) result[key] = (await db.prepare(sql).all()).results
      result.cutover = await getCurriculumCutoverStatus(db)
    } else if (options.command === 'validate') {
      result = { commit: options.commit ?? null, mapping_sha256: await getCurriculumMappingSha256(mapping),
        ...await validateCurriculumBackfill(db, mapping) }
    } else {
      // Recheck maintenance immediately before the one atomic write, not just before proxy setup.
      if (options.command === 'apply') {
        if (options.remote) await verify('closed', options.commit)
        await backfillCurriculum(db, mapping)
      }
      result = await getCurriculumCutoverStatus(db)
      if (!result.complete) throw new Error('Curriculum cutover is incomplete. Keep maintenance enabled and inspect before recovery.')
    }
    if (options.remote) await verify(options.apiMode, options.commit)
    if (options.output) {
      await mkdir(dirname(options.output), { recursive: true })
      await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      console.log(`Private ${options.command} report written to ${options.output}. No maintenance setting changed.`)
    } else {
      console.log(JSON.stringify({ command: options.command, ...result }))
    }
    return result
  } finally {
    await platform.dispose()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCurriculumRelease(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

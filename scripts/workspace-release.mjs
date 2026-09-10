import { parseArgs } from 'node:util'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { verifyApiRelease } from './release-api.mjs'

function privatePath(value, option) {
  const root = resolve('.amp/in') + sep
  const path = resolve(value)
  if (!path.startsWith(root) || !path.endsWith('.json')) throw new Error(`${option} must be a JSON file under .amp/in`)
  return path
}

export function parseOperatorArgs(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    local: { type: 'boolean' }, remote: { type: 'boolean' },
    'persist-to': { type: 'string' }, mapping: { type: 'string' },
    output: { type: 'string' }, commit: { type: 'string' },
    'confirm-production': { type: 'boolean' },
  } })
  const command = positionals[0]
  if (positionals.length !== 1 || !['inspect', 'apply', 'finalize', 'check'].includes(command)) throw new Error('Expected inspect, apply, finalize or check command')
  if (Boolean(values.local) === Boolean(values.remote)) throw new Error('Select exactly one target: --local or --remote')
  if (values.local && !values['persist-to']) throw new Error('--local requires --persist-to')
  if (values.remote && values['persist-to']) throw new Error('--persist-to is local-only')
  if (values.remote && !/^[a-f0-9]{40}$/.test(values.commit ?? '')) throw new Error('--remote requires a full --commit')
  if (['apply', 'finalize'].includes(command)) {
    if (!values.mapping) throw new Error('A reviewed --mapping is required')
    if (values.remote && !values['confirm-production']) throw new Error('Remote writes require --confirm-production after approval')
  }
  if (command === 'inspect' && !values.output) throw new Error('inspect requires a private --output file')
  return {
    command, remote: Boolean(values.remote), commit: values.commit,
    persistTo: values['persist-to'],
    mapping: values.mapping ? privatePath(values.mapping, '--mapping') : undefined,
    output: values.output ? privatePath(values.output, '--output') : undefined,
  }
}

async function main() {
  const options = parseOperatorArgs(process.argv.slice(2))
  // Validate input before starting a binding proxy or contacting Cloudflare.
  const mapping = options.mapping ? JSON.parse(await readFile(options.mapping, 'utf8')) : undefined
  if (options.remote) await verifyApiRelease('closed', options.commit)
  const { getPlatformProxy } = await import('wrangler')
  const { backfillWorkspaces } = await import('../worker/db/workspace-backfill.js')
  const { finalizeWorkspaceCutover, getWorkspaceCutoverStatus } = await import('../worker/db/workspace-cutover.js')
  const platform = await getPlatformProxy({
    configPath: fileURLToPath(new URL('./workspace-operator.toml', import.meta.url)),
    envFiles: [], remoteBindings: options.remote,
    persist: options.remote ? false : { path: resolve(options.persistTo, 'v3') },
  })
  try {
    const db = platform.env.DB
    if (options.command === 'inspect') {
      const inventory = {}
      for (const [key, sql] of Object.entries({
        users: 'select id, role, status, access_tier from users order by id',
        student_grades: 'select user_id, grade from student_grades order by user_id, grade',
        exercises: 'select id, workspace_id from exercises order by id',
        lectures: 'select id, workspace_id from lectures order by id',
      })) inventory[key] = (await db.prepare(sql).all()).results
      await mkdir(dirname(options.output), { recursive: true })
      await writeFile(options.output, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      console.log(`Private inventory written to ${options.output}; no database changes.`)
      return
    }
    if (options.command === 'apply') await backfillWorkspaces(db, mapping)
    if (['apply', 'finalize'].includes(options.command)) await finalizeWorkspaceCutover(db, mapping)
    const status = await getWorkspaceCutoverStatus(db)
    if (!status.complete) throw new Error('Workspace cutover is incomplete. Keep maintenance enabled and complete the reviewed backfill.')
    if (options.remote) await verifyApiRelease('closed', options.commit)
    console.log('Workspace cutover complete; ownership checks passed. Maintenance remains enabled.')
  } finally {
    await platform.dispose()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

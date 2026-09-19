import { execFile as execFileCallback } from 'node:child_process'
import { appendFile, readFile, readdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { getWorkspaceSites } from '../worker/lib/workspaces.js'

const execFile = promisify(execFileCallback)
const MAINTENANCE_GENERATION_FILE = '.github/production-maintenance-generation'

function isFullCommit(value) {
  return /^[a-f0-9]{40}$/.test(value ?? '')
}

function normalizeMigrationName(value) {
  return typeof value === 'string' ? value.replace(/\.sql$/, '') : value
}

function collectMigrationNames(value, names = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectMigrationNames(item, names)
  } else if (value && typeof value === 'object') {
    if (typeof value.name === 'string') names.push(normalizeMigrationName(value.name))
    for (const child of Object.values(value)) collectMigrationNames(child, names)
  }
  return names
}

export function parseAppliedMigrations(stdout) {
  const parsed = JSON.parse(stdout)
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error('Remote migration ledger response was not one Wrangler JSON result')
  const [result] = parsed
  if (result?.success !== true || !Array.isArray(result.results)) {
    throw new Error('Remote migration ledger query did not succeed')
  }
  const names = result.results.map((row) => normalizeMigrationName(row?.name))
  if (names.some((name) => !/^\d{4}_[A-Za-z0-9_-]+$/.test(name ?? ''))) {
    throw new Error('Remote migration ledger returned an invalid migration name')
  }
  if (new Set(names).size !== names.length) throw new Error('Remote migration ledger returned duplicate migration names')
  // Reject unexpected nested name fields rather than treating an unrelated JSON shape as a ledger.
  if (collectMigrationNames(parsed).length !== names.length) {
    throw new Error('Remote migration ledger response contained unexpected name fields')
  }
  return names.sort()
}

export async function getLocalMigrations({ migrationsDir = 'worker/db/migrations' } = {}) {
  const entries = await readdir(migrationsDir)
  return entries
    .filter((entry) => entry.endsWith('.sql'))
    .map((entry) => ({ name: normalizeMigrationName(entry), path: join(migrationsDir, entry) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function discoverProductionState(request = fetch) {
  const states = []
  for (const site of getWorkspaceSites({ APP_ENV: 'production' })) {
    const headers = { 'Cache-Control': 'no-cache', Origin: site.frontend_origin }
    const healthResponse = await request(`${site.api_origin}/api/health`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000), headers,
    })
    const health = await healthResponse.json()
    if (healthResponse.status !== 200 || health.success !== true
      || health.data?.service !== 'smartclass-api' || health.data?.environment !== 'production'
      || typeof health.data?.maintenance !== 'boolean') {
      throw new Error(`${site.id} health check did not return production state`)
    }

    const versionResponse = await request(`${site.api_origin}/api/version`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000), headers,
    })
    const version = await versionResponse.json()
    if (versionResponse.status !== 200 || version.success !== true || !isFullCommit(version.data?.commit)) {
      throw new Error(`${site.id} version check did not return a full commit`)
    }
    states.push({ site: site.id, commit: version.data.commit, maintenance: health.data.maintenance })
  }

  const [first] = states
  if (states.some((state) => state.commit !== first.commit)) throw new Error('Production sites report different commits')
  if (states.some((state) => state.maintenance !== first.maintenance)) throw new Error('Production sites report different maintenance states')
  return { liveCommit: first.commit, maintenance: first.maintenance, sites: states }
}

async function assertCandidateDescendsFromLive({ candidateCommit, liveCommit, exec = execFile, cwd = process.cwd() }) {
  try {
    await exec('git', ['merge-base', '--is-ancestor', liveCommit, candidateCommit], { cwd })
  } catch {
    throw new Error(`Candidate ${candidateCommit} does not descend from live production commit ${liveCommit}`)
  }
}

async function getChangedMigrationNames({ liveCommit, candidateCommit, migrationsDir, exec = execFile, cwd = process.cwd() }) {
  const { stdout } = await exec('git', ['diff', '--name-only', `${liveCommit}..${candidateCommit}`, '--', migrationsDir], { cwd })
  return stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.sql'))
    .map((line) => normalizeMigrationName(basename(line)))
}

async function getRemoteAppliedMigrations({ exec = execFile, cwd = process.cwd() }) {
  const { stdout } = await exec('npx', [
    'wrangler', 'd1', 'execute', 'smartclass', '--remote',
    '--config', 'wrangler.production.toml',
    '--command', 'select name from d1_migrations order by id', '--json',
  ], { cwd })
  return parseAppliedMigrations(stdout)
}

function parseMaintenanceGeneration(value, source) {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) throw new Error(`${source} must contain one non-negative integer`)
  const generation = Number(trimmed)
  if (!Number.isSafeInteger(generation)) throw new Error(`${source} must contain a safe non-negative integer`)
  return generation
}

async function getCandidateMaintenanceGeneration({ path = MAINTENANCE_GENERATION_FILE } = {}) {
  try {
    return parseMaintenanceGeneration(await readFile(path, 'utf8'), path)
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

async function getLiveMaintenanceGeneration({ liveCommit, path = MAINTENANCE_GENERATION_FILE, exec = execFile, cwd = process.cwd() }) {
  try {
    const { stdout } = await exec('git', ['show', `${liveCommit}:${path}`], { cwd })
    return parseMaintenanceGeneration(stdout, `${liveCommit}:${path}`)
  } catch (error) {
    if (error.stderr?.includes('exists on disk, but not in') || error.stderr?.includes('Path') || error.message?.includes('not exist')) return 0
    throw error
  }
}

export async function planRelease({
  candidateCommit,
  forceMaintenance = false,
  maintenanceOnly = false,
  request = fetch,
  exec = execFile,
  migrationsDir = 'worker/db/migrations',
  maintenanceGenerationFile = MAINTENANCE_GENERATION_FILE,
  cwd = process.cwd(),
} = {}) {
  if (!isFullCommit(candidateCommit)) throw new Error('A full candidate commit is required')
  if (maintenanceOnly && !forceMaintenance) forceMaintenance = true

  const production = await discoverProductionState(request)
  await assertCandidateDescendsFromLive({ candidateCommit, liveCommit: production.liveCommit, exec, cwd })
  const liveMaintenanceGeneration = await getLiveMaintenanceGeneration({
    liveCommit: production.liveCommit, path: maintenanceGenerationFile, exec, cwd,
  })
  const candidateMaintenanceGeneration = await getCandidateMaintenanceGeneration({ path: maintenanceGenerationFile })
  if (candidateMaintenanceGeneration < liveMaintenanceGeneration) {
    throw new Error('Production maintenance generation cannot decrease')
  }

  if (production.maintenance && !forceMaintenance) {
    throw new Error('Production is already in maintenance; use an approved manual maintenance run')
  }

  const localMigrations = await getLocalMigrations({ migrationsDir })
  const localNames = new Set(localMigrations.map((migration) => migration.name))
  const appliedNames = new Set(await getRemoteAppliedMigrations({ exec, cwd }))
  const missingLocal = [...appliedNames].filter((name) => !localNames.has(name)).sort()
  if (missingLocal.length > 0) {
    throw new Error(`Remote migration ledger contains migrations missing from this checkout: ${missingLocal.join(', ')}`)
  }

  const pendingMigrations = localMigrations.map((migration) => migration.name)
    .filter((name) => !appliedNames.has(name))
  const changedAppliedMigrations = (await getChangedMigrationNames({
    liveCommit: production.liveCommit, candidateCommit, migrationsDir, exec, cwd,
  })).filter((name) => appliedNames.has(name)).sort()
  if (changedAppliedMigrations.length > 0) {
    throw new Error(`Applied migrations changed since the live commit: ${changedAppliedMigrations.join(', ')}`)
  }

  const maintenance = forceMaintenance || pendingMigrations.length > 0 || candidateMaintenanceGeneration > liveMaintenanceGeneration
  return {
    candidateCommit,
    liveCommit: production.liveCommit,
    productionMaintenance: production.maintenance,
    maintenance,
    maintenanceOnly,
    liveMaintenanceGeneration,
    candidateMaintenanceGeneration,
    pendingMigrations,
  }
}

function parseCliArgs(args) {
  const options = { forceMaintenance: false, maintenanceOnly: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--candidate') options.candidateCommit = args[++index]
    else if (arg === '--force-maintenance') options.forceMaintenance = true
    else if (arg === '--maintenance-only') options.maintenanceOnly = true
    else if (arg === '--github-output') options.githubOutput = args[++index]
    else throw new Error(`Unknown release planner argument: ${arg}`)
  }
  return options
}

export async function writeGithubOutput(plan, path) {
  const lines = [
    `maintenance=${plan.maintenance}`,
    `maintenance_only=${plan.maintenanceOnly}`,
    `live_commit=${plan.liveCommit}`,
    `pending_migrations=${plan.pendingMigrations.join(',')}`,
  ]
  await appendFile(path, `${lines.join('\n')}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseCliArgs(process.argv.slice(2))
  planRelease(options).then(async (plan) => {
    if (options.githubOutput) await writeGithubOutput(plan, options.githubOutput)
    console.log(JSON.stringify(plan, null, 2))
  }).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

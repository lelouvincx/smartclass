import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverProductionState, parseAppliedMigrations, planRelease } from './release-plan.mjs'

const liveCommit = 'a'.repeat(40)
const candidateCommit = 'b'.repeat(40)

function productionResponder({ commit = liveCommit, maintenance = false, englishCommit = commit, englishMaintenance = maintenance } = {}) {
  return async (input, options) => {
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    const url = new URL(input)
    const isEnglish = url.hostname === 'api.tienganhcothuy.com'
    if (url.pathname === '/api/health') {
      return Response.json({ success: true, data: {
        service: 'smartclass-api', environment: 'production', maintenance: isEnglish ? englishMaintenance : maintenance,
      } })
    }
    if (url.pathname === '/api/version') {
      return Response.json({ success: true, data: { commit: isEnglish ? englishCommit : commit } })
    }
    throw new Error(`Unexpected request ${url.href}`)
  }
}

async function withMigrations(names, callback) {
  const directory = await mkdtemp(join(tmpdir(), 'smartclass-release-plan-'))
  try {
    for (const name of names) await writeFile(join(directory, `${name}.sql`), '-- migration\n')
    return await callback(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function withGeneration(value, callback) {
  const directory = await mkdtemp(join(tmpdir(), 'smartclass-release-generation-'))
  const path = join(directory, 'production-maintenance-generation')
  try {
    await writeFile(path, `${value}\n`)
    return await callback(path)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function execResponder({ applied = [], changed = [], ancestor = true, liveGeneration = 0 } = {}) {
  return async (command, args) => {
    if (command === 'git' && args[0] === 'merge-base') {
      if (!ancestor) throw new Error('not ancestor')
      return { stdout: '' }
    }
    if (command === 'git' && args[0] === 'show') return { stdout: `${liveGeneration}\n` }
    if (command === 'git' && args[0] === 'diff') return { stdout: changed.map((name) => `worker/db/migrations/${name}.sql`).join('\n') }
    if (command === 'npx' && args.includes('d1') && args.includes('execute')) {
      return { stdout: JSON.stringify([{ success: true, results: applied.map((name) => ({ name })) }]) }
    }
    throw new Error(`Unexpected command ${command} ${args.join(' ')}`)
  }
}

test('parses Wrangler JSON migration output without using human table text', () => {
  assert.deepEqual(parseAppliedMigrations(JSON.stringify([{ success: true, results: [
    { name: '0001_initial' }, { name: '0002_more.sql' },
  ] }])), ['0001_initial', '0002_more'])
  for (const value of [{}, [], [{ success: false, results: [] }], [{ success: true }], [{ success: true, results: [{ name: '' }] }]]) {
    assert.throws(() => parseAppliedMigrations(JSON.stringify(value)), /ledger|migration name|succeed/)
  }
  assert.throws(() => parseAppliedMigrations(JSON.stringify([{ success: true, results: [{ name: '0001_initial' }, { name: '0001_initial' }] }])), /duplicate/)
})

test('discovers one open live production commit across both sites', async () => {
  assert.deepEqual(await discoverProductionState(productionResponder()), {
    liveCommit,
    maintenance: false,
    sites: [
      { site: 'maths', commit: liveCommit, maintenance: false },
      { site: 'english', commit: liveCommit, maintenance: false },
    ],
  })
  await assert.rejects(discoverProductionState(productionResponder({ englishCommit: 'c'.repeat(40) })), /different commits/)
  await assert.rejects(discoverProductionState(productionResponder({ englishMaintenance: true })), /different maintenance/)
})

test('plans routine release only when production is open, candidate descends and migrations are current', async () => {
  await withMigrations(['0001_initial', '0002_more'], async (migrationsDir) => {
    await withGeneration(0, async (maintenanceGenerationFile) => {
      const plan = await planRelease({
        candidateCommit,
        request: productionResponder(),
        exec: execResponder({ applied: ['0001_initial', '0002_more'] }),
        migrationsDir,
        maintenanceGenerationFile,
      })
      assert.equal(plan.maintenance, false)
      assert.equal(plan.maintenanceOnly, false)
      assert.equal(plan.liveCommit, liveCommit)
      assert.deepEqual(plan.pendingMigrations, [])
    })
  })
})

test('forces maintenance when a local migration is pending', async () => {
  await withMigrations(['0001_initial', '0002_more'], async (migrationsDir) => {
    await withGeneration(0, async (maintenanceGenerationFile) => {
      const plan = await planRelease({
        candidateCommit,
        request: productionResponder(),
        exec: execResponder({ applied: ['0001_initial'] }),
        migrationsDir,
        maintenanceGenerationFile,
      })
      assert.equal(plan.maintenance, true)
      assert.deepEqual(plan.pendingMigrations, ['0002_more'])
    })
  })
})

test('forces maintenance when the candidate increments the production maintenance generation', async () => {
  await withMigrations(['0001_initial'], async (migrationsDir) => {
    await withGeneration(1, async (maintenanceGenerationFile) => {
      const plan = await planRelease({
        candidateCommit,
        request: productionResponder(),
        exec: execResponder({ applied: ['0001_initial'], liveGeneration: 0 }),
        migrationsDir,
        maintenanceGenerationFile,
      })
      assert.equal(plan.maintenance, true)
      assert.equal(plan.liveMaintenanceGeneration, 0)
      assert.equal(plan.candidateMaintenanceGeneration, 1)
    })
  })
})

test('fails closed for rollback, missing local migrations, and edited applied migrations', async () => {
  await withMigrations(['0001_initial', '0002_more'], async (migrationsDir) => {
    await withGeneration(0, async (maintenanceGenerationFile) => {
      await assert.rejects(planRelease({
        candidateCommit,
        request: productionResponder(),
        exec: execResponder({ ancestor: false, applied: ['0001_initial', '0002_more'] }),
        migrationsDir,
        maintenanceGenerationFile,
      }), /does not descend/)
      await assert.rejects(planRelease({
        candidateCommit,
        request: productionResponder(),
        exec: execResponder({ applied: ['0001_initial', '0002_more', '0003_remote_only'] }),
        migrationsDir,
        maintenanceGenerationFile,
      }), /missing from this checkout/)
      await assert.rejects(planRelease({
        candidateCommit,
        request: productionResponder(),
        exec: execResponder({ applied: ['0001_initial', '0002_more'], changed: ['0001_initial'] }),
        migrationsDir,
        maintenanceGenerationFile,
      }), /Applied migrations changed/)
      await assert.rejects(planRelease({
        candidateCommit,
        request: productionResponder(),
        exec: execResponder({ applied: ['0001_initial', '0002_more'], liveGeneration: 2 }),
        migrationsDir,
        maintenanceGenerationFile,
      }), /generation cannot decrease/)
      await withGeneration('9007199254740992', async (unsafeGenerationFile) => {
        await assert.rejects(planRelease({
          candidateCommit,
          request: productionResponder(),
          exec: execResponder({ applied: ['0001_initial', '0002_more'] }),
          migrationsDir,
          maintenanceGenerationFile: unsafeGenerationFile,
        }), /safe non-negative integer/)
      })
    })
  })
})

test('automatic releases stop when production is already closed unless maintenance was approved', async () => {
  await withMigrations(['0001_initial'], async (migrationsDir) => {
    await withGeneration(0, async (maintenanceGenerationFile) => {
      await assert.rejects(planRelease({
        candidateCommit,
        request: productionResponder({ maintenance: true }),
        exec: execResponder({ applied: ['0001_initial'] }),
        migrationsDir,
        maintenanceGenerationFile,
      }), /already in maintenance/)
      const plan = await planRelease({
        candidateCommit,
        forceMaintenance: true,
        maintenanceOnly: true,
        request: productionResponder({ maintenance: true }),
        exec: execResponder({ applied: ['0001_initial'] }),
        migrationsDir,
        maintenanceGenerationFile,
      })
      assert.equal(plan.maintenance, true)
      assert.equal(plan.maintenanceOnly, true)
    })
  })
})

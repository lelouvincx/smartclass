import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { parseCurriculumArgs, runCurriculumRelease } from './curriculum-release.mjs'

const commit = 'a'.repeat(40)

test('curriculum operator rejects ambiguous targets and unapproved remote writes', () => {
  for (const args of [
    ['check'], ['check', '--local'], ['check', '--remote'],
    ['check', '--remote', '--local', '--commit', commit],
    ['check', '--remote', '--commit', commit, '--persist-to', '.amp/in/local'],
    ['apply', '--remote', '--commit', commit, '--mapping', '.amp/in/map.json'],
    ['finalize', '--local', '--persist-to', '.amp/in/local'],
  ]) assert.throws(() => parseCurriculumArgs(args))
  assert.equal(parseCurriculumArgs(['apply', '--remote', '--commit', commit,
    '--mapping', '.amp/in/map.json', '--confirm-production']).command, 'apply')
})

test('validation requires a reviewed private mapping and non-overwriting private report destination', () => {
  const base = ['validate', '--local', '--persist-to', '.amp/in/local']
  assert.throws(() => parseCurriculumArgs(base), /mapping/)
  assert.throws(() => parseCurriculumArgs([...base, '--mapping', '.amp/in/map.json']), /output/)
  assert.throws(() => parseCurriculumArgs([...base, '--mapping', 'map.json', '--output', '.amp/in/report.json']), /\.amp\/in/)
  assert.throws(() => parseCurriculumArgs([...base, '--mapping', '.amp/in/map.json', '--output', '.amp/in/../../public/report.json']), /\.amp\/in/)
  assert.equal(parseCurriculumArgs([...base, '--mapping', '.amp/in/map.json', '--output', '.amp/in/report.json']).remote, false)
})

test('remote readiness cannot acquire a database binding unless both APIs are closed at the commit', async () => {
  let connected = false
  await assert.rejects(runCurriculumRelease(['check', '--remote', '--commit', commit], {
    verify: async (mode, hash) => {
      assert.equal(mode, 'closed')
      assert.equal(hash, commit)
      throw new Error('maintenance mismatch')
    },
    connect: async () => { connected = true },
  }), /maintenance mismatch/)
  assert.equal(connected, false)
})

test('incomplete local readiness releases its DB-only proxy without contacting production', async () => {
  let disposed = false
  await assert.rejects(runCurriculumRelease(['check', '--local', '--persist-to', '.amp/in/local'], {
    verify: async () => assert.fail('local operation must not probe production'),
    connect: async (options) => {
      assert.equal(options.remoteBindings, false)
      assert.deepEqual(options.envFiles, [])
      return { env: { DB: { prepare: () => ({ first: async () => null }) } }, dispose: async () => { disposed = true } }
    },
  }), /incomplete/)
  assert.equal(disposed, true)
})

test('inspection never overwrites a prior release report and always disposes the proxy', async () => {
  await mkdir('.amp/in', { recursive: true })
  const directory = await mkdtemp('.amp/in/curriculum-operator-test-')
  const output = `${directory}/inventory.json`
  let disposed = false
  try {
    await writeFile(output, 'existing reviewed evidence', { mode: 0o600 })
    await assert.rejects(runCurriculumRelease(['inspect', '--local', '--persist-to', directory, '--output', output], {
      verify: async () => assert.fail('local operation must not probe production'),
      connect: async () => ({
        env: { DB: { prepare: () => ({ all: async () => ({ results: [] }), first: async () => null }) } },
        dispose: async () => { disposed = true },
      }),
    }), { code: 'EEXIST' })
    assert.equal(await readFile(output, 'utf8'), 'existing reviewed evidence')
    assert.equal(disposed, true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

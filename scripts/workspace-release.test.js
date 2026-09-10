import assert from 'node:assert/strict'
import test from 'node:test'
import { parseOperatorArgs } from './workspace-release.mjs'

test('operator requires an explicit local or remote target before connecting', () => {
  assert.throws(() => parseOperatorArgs(['check']), /target/)
  assert.throws(() => parseOperatorArgs(['check', '--local', '--remote']), /target/)
  assert.throws(() => parseOperatorArgs(['check', '--local']), /persist-to/)
  assert.throws(() => parseOperatorArgs(['check', '--remote']), /commit/)
  assert.equal(parseOperatorArgs(['check', '--remote', '--commit', 'a'.repeat(40)]).remote, true)
})

test('remote writes require a reviewed mapping, commit and explicit confirmation', () => {
  const base = ['apply', '--remote', '--commit', 'a'.repeat(40)]
  assert.throws(() => parseOperatorArgs(base), /mapping/)
  assert.throws(() => parseOperatorArgs([...base, '--mapping', '.amp/in/reviewed.json']), /confirm-production/)
  assert.equal(parseOperatorArgs([...base, '--mapping', '.amp/in/reviewed.json', '--confirm-production']).command, 'apply')
  assert.throws(() => parseOperatorArgs(['reset', '--remote', '--commit', 'a'.repeat(40)]), /command/)
})

test('private inventory output and reviewed mappings stay in the ignored input directory', () => {
  const base = ['inspect', '--local', '--persist-to', '.amp/in/rehearsal']
  assert.throws(() => parseOperatorArgs(base), /output/)
  assert.throws(() => parseOperatorArgs([...base, '--output', 'inventory.json']), /\.amp\/in/)
  assert.throws(() => parseOperatorArgs([...base, '--output', '.amp/in/../../inventory.json']), /\.amp\/in/)
  assert.ok(parseOperatorArgs([...base, '--output', '.amp/in/inventory.json']).output.endsWith('inventory.json'))
})

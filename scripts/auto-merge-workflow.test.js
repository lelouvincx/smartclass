import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/merge-ready-pr.yml', import.meta.url), 'utf8')

test('pull requests auto-merge after checks without a separate approval workflow', () => {
  assert.equal(existsSync(new URL('../.github/workflows/post-pr.yml', import.meta.url)), false)
  assert.match(workflow, /name: Merge Ready PR/)
  assert.match(workflow, /workflows: \["Test", "Changelog"\]/)
  assert.doesNotMatch(workflow, /pull_request_review|reviewDecision|APPROVED|approving review|Post PR Approval/)
})

test('auto-merge waits for tests and changelog audit check on the current PR head', () => {
  assert.match(workflow, /expectedChecks = \['unit-tests', 'integration-tests', 'require-changelog-update'\]/)
  assert.match(workflow, /pr\.head\.sha !== run\.head_sha/)
  assert.match(workflow, /ref: pr\.head\.sha/)
  assert.match(workflow, /latest\.status !== 'completed' \|\| latest\.conclusion !== 'success'/)
  assert.match(workflow, /merge_method: 'squash'/)
})

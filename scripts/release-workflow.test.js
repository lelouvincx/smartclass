import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/deploy-worker.yml', import.meta.url), 'utf8')
const testWorkflow = readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8')

function stepIndex(name) {
  return workflow.indexOf(`\n      - name: ${name}\n`)
}

function stepSection(name) {
  return workflow.split(`\n      - name: ${name}\n`)[1]?.split('\n\n      - name:')[0] ?? ''
}

test('routine deployment verifies open production and deploys without maintenance or migrations', () => {
  const steps = [
    'Build frontend', 'Plan release mode',
    'Require completed workspace cutover before routine deployment',
    'Require completed curriculum cutover before routine deployment',
    'Deploy frontend', 'Deploy open API', 'Verify open API',
  ]
  let previous = -1
  for (const step of steps) {
    const index = stepIndex(step)
    assert.ok(index > previous, `${step} must exist in release order`)
    previous = index
  }
  assert.match(workflow, /node scripts\/workspace-release\.mjs check --remote --api-mode open --commit "\$\{\{ steps\.plan\.outputs\.live_commit \}\}"/)
  assert.match(workflow, /node scripts\/curriculum-release\.mjs check --remote --api-mode open --commit "\$\{\{ steps\.plan\.outputs\.live_commit \}\}"/)
  assert.match(workflow, /if: \$\{\{ steps\.plan\.outputs\.maintenance == 'false' \}\}/)
  assert.match(workflow, /cancel-in-progress: false/)
  assert.match(workflow, /APP_MAINTENANCE:false/)
  assert.doesNotMatch(workflow, /secret put|secrets\.JWT_SECRET|always\(\)/)
})

test('maintenance deployment closes traffic before backup and migrations, and checks readiness before reopening', () => {
  const steps = [
    'Enable application maintenance', 'Verify maintenance', 'Drain existing requests',
    'Record D1 restore bookmark', 'Apply remote D1 migrations',
    'Require completed workspace cutover', 'Require completed curriculum cutover',
    'Deploy frontend', 'Deploy open API', 'Verify open API',
  ]
  let previous = -1
  for (const step of steps) {
    const index = stepIndex(step)
    assert.ok(index > previous, `${step} must exist in maintenance release order`)
    previous = index
  }
  assert.match(workflow, /APP_MAINTENANCE:true/)
  for (const step of ['Enable application maintenance', 'Verify maintenance', 'Drain existing requests', 'Record D1 restore bookmark', 'Apply remote D1 migrations']) {
    const section = stepSection(step)
    assert.match(section ?? '', /if:.*steps\.plan\.outputs\.maintenance == 'true'/s)
  }
})

test('automatic deployment starts only after main branch tests pass and uses that tested commit', () => {
  assert.match(workflow, /workflow_run:\n\s+workflows: \["Test"\]\n\s+types: \[completed\]/)
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/)
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/)
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/)
  assert.match(workflow, /APP_COMMIT_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/)
  assert.match(workflow, /ref: \$\{\{ env\.APP_COMMIT_SHA \}\}/)
  assert.match(workflow, /fetch-depth: 0/)
  assert.doesNotMatch(workflow, /name: Run release checks|name: Run frontend tests|name: Run worker tests|name: Run integration tests/)
})

test('maintenance-only run and failed deployment cannot automatically reopen traffic', () => {
  assert.match(workflow, /maintenance_only:/)
  assert.match(workflow, /force_maintenance:/)
  for (const step of ['Deploy frontend', 'Deploy open API', 'Verify open API']) {
    const section = stepSection(step)
    assert.match(section ?? '', /if:.*steps\.plan\.outputs\.maintenance_only == 'false'/)
  }
  const recovery = stepSection('Leave failed release in maintenance')
  assert.match(recovery ?? '', /if:.*failure\(\)/s)
  assert.match(recovery, /steps\.deploy_api\.outcome == 'failure'/)
  assert.match(recovery, /APP_MAINTENANCE:true/)
  assert.doesNotMatch(recovery, /APP_MAINTENANCE:false/)
})

test('closed curriculum cutover is checked with the read-only remote operator before Pages deployment in maintenance mode', () => {
  const step = stepSection('Require completed curriculum cutover')
  assert.match(step ?? '', /node scripts\/curriculum-release\.mjs check --remote --commit "\$APP_COMMIT_SHA"/)
  assert.ok(stepIndex('Require completed workspace cutover') < stepIndex('Require completed curriculum cutover'))
  assert.ok(stepIndex('Require completed curriculum cutover') < stepIndex('Deploy frontend'))
})

test('docs-only pushes skip deployment by skipping main-branch Test workflow only', () => {
  assert.match(testWorkflow, /push:\n\s+branches: \[main\]\n\s+paths-ignore:/)
  assert.match(testWorkflow, /'\*\.md'/)
  assert.match(testWorkflow, /'\*\*\/\*\.md'/)
  assert.match(testWorkflow, /'docs\/\*\*'/)
  const pullRequestSection = testWorkflow.split('pull_request:')[1]?.split('push:')[0]
  assert.doesNotMatch(pullRequestSection ?? '', /paths-ignore/)
})

test('production configuration maps both sites and has safe manual-deploy defaults', () => {
  const config = readFileSync(new URL('../wrangler.production.toml', import.meta.url), 'utf8')
  assert.match(config, /^workers_dev = false$/m)
  assert.match(config, /^preview_urls = false$/m)
  assert.match(config, /^APP_ENV = "production"$/m)
  assert.match(config, /^APP_MAINTENANCE = "true"$/m)
  assert.match(config, /pattern = "api\.toanthaythanh\.com"/)
  assert.match(config, /pattern = "api\.tienganhcothuy\.com"/)
  assert.doesNotMatch(config, /localhost|APP_CORS_ORIGIN|JWT_SECRET|GOOGLE_CLIENT_SECRET/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/deploy-worker.yml', import.meta.url), 'utf8')

test('normal deployment closes traffic before backup and migrations, and checks readiness before reopening', () => {
  const steps = [
    'Build frontend', 'Enable application maintenance',
    'Verify maintenance', 'Drain existing requests', 'Record D1 restore bookmark',
    'Apply remote D1 migrations', 'Require completed workspace cutover',
    'Require completed curriculum cutover', 'Deploy frontend', 'Reopen API', 'Verify open API',
  ]
  let previous = -1
  for (const step of steps) {
    const index = workflow.indexOf(`name: ${step}`)
    assert.ok(index > previous, `${step} must exist in release order`)
    previous = index
  }
  assert.match(workflow, /cancel-in-progress: false/)
  assert.match(workflow, /APP_MAINTENANCE:true/)
  assert.match(workflow, /APP_MAINTENANCE:false/)
  assert.doesNotMatch(workflow, /secret put|secrets\.JWT_SECRET|always\(\)/)
})

test('automatic deployment starts only after main branch tests pass and uses that tested commit', () => {
  assert.match(workflow, /workflow_run:\n\s+workflows: \["Test"\]\n\s+types: \[completed\]/)
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/)
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/)
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/)
  assert.match(workflow, /APP_COMMIT_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/)
  assert.match(workflow, /ref: \$\{\{ env\.APP_COMMIT_SHA \}\}/)
  assert.doesNotMatch(workflow, /name: Run release checks|name: Run frontend tests|name: Run worker tests|name: Run integration tests/)
})

test('maintenance-only run and failed deployment cannot automatically reopen traffic', () => {
  assert.match(workflow, /maintenance_only:/)
  for (const step of ['Require completed workspace cutover', 'Require completed curriculum cutover', 'Deploy frontend', 'Reopen API', 'Verify open API']) {
    const section = workflow.split(`name: ${step}`)[1]?.split('\n      - ')[0]
    assert.match(section ?? '', /if:.*!inputs\.maintenance_only/)
  }
  const recovery = workflow.split('name: Leave failed release in maintenance')[1]
  assert.match(recovery ?? '', /if:.*failure\(\)/)
  assert.match(recovery, /APP_MAINTENANCE:true/)
  assert.doesNotMatch(recovery, /APP_MAINTENANCE:false/)
})

test('curriculum cutover is checked with the read-only remote operator before Pages deployment', () => {
  const step = workflow.split('name: Require completed curriculum cutover')[1]?.split('\n\n      - name: Deploy frontend')[0]
  assert.match(step ?? '', /node scripts\/curriculum-release\.mjs check --remote --commit "\$APP_COMMIT_SHA"/)
  assert.ok(workflow.indexOf('name: Require completed workspace cutover') < workflow.indexOf('name: Require completed curriculum cutover'))
  assert.ok(workflow.indexOf('name: Require completed curriculum cutover') < workflow.indexOf('name: Deploy frontend'))
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

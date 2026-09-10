import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/deploy-worker.yml', import.meta.url), 'utf8')

test('normal deployment closes traffic before backup and migrations, and checks readiness before reopening', () => {
  const steps = [
    'Run integration tests', 'Build frontend', 'Enable application maintenance',
    'Verify maintenance', 'Drain existing requests', 'Record D1 restore bookmark',
    'Apply remote D1 migrations', 'Require completed workspace cutover',
    'Deploy frontend', 'Reopen API', 'Verify open API',
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

test('maintenance-only run and failed deployment cannot automatically reopen traffic', () => {
  assert.match(workflow, /maintenance_only:/)
  for (const step of ['Require completed workspace cutover', 'Deploy frontend', 'Reopen API', 'Verify open API']) {
    const section = workflow.split(`name: ${step}`)[1]?.split('\n      - ')[0]
    assert.match(section ?? '', /if:.*!inputs\.maintenance_only/)
  }
  const recovery = workflow.split('name: Leave failed release in maintenance')[1]
  assert.match(recovery ?? '', /if:.*failure\(\)/)
  assert.match(recovery, /APP_MAINTENANCE:true/)
  assert.doesNotMatch(recovery, /APP_MAINTENANCE:false/)
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

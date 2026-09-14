import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const workflow = readFileSync(new URL('../.github/workflows/dbdocs.yml', import.meta.url), 'utf8')

test('schema publishing uses the unified CLI and an explicit existing document destination', () => {
  assert.equal(pkg.scripts['db:docs'], 'dbdiagram build document --from-file docs/schema.dbml --project lelouvincx/smartclass')
  assert.ok(pkg.devDependencies.dbdiagram)
  assert.equal(pkg.devDependencies.dbdocs, undefined)
})

test('schema publishing uses the new CI token and reruns when its tooling changes', () => {
  const publish = workflow.split('run: npm run db:docs')[1]
  assert.match(publish, /DBDIAGRAM_TOKEN: \$\{\{ secrets\.DBDIAGRAM_TOKEN \}\}/)
  assert.doesNotMatch(workflow, /DBDOCS_TOKEN/)
  for (const path of ['docs/schema.dbml', 'worker/db/migrations/**', '.github/workflows/dbdocs.yml', 'package.json', 'package-lock.json']) {
    assert.ok(workflow.split('jobs:')[0].includes(`- "${path}"`), `missing publishing trigger: ${path}`)
  }
})

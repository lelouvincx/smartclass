import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const attemptLimitsMigration = readFileSync(
  `${process.cwd()}/worker/db/migrations/0017_add_exercise_attempt_limits.sql`,
  'utf8',
)

describe('D1 migration compatibility', () => {
  it('uses the trigger syntax accepted by the remote migration parser', () => {
    expect(attemptLimitsMigration).not.toContain('\r')
    expect(attemptLimitsMigration).toMatch(/create trigger[\s\S]+\nBEGIN\n/)
  })
})

import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const attemptLimitsMigration = readFileSync(
  `${process.cwd()}/worker/db/migrations/0017_add_exercise_attempt_limits.sql`,
  'utf8',
)
const accessTiersMigration = readFileSync(
  `${process.cwd()}/worker/db/migrations/0019_add_access_tiers.sql`,
  'utf8',
)

describe('D1 migration compatibility', () => {
  it('uses the trigger syntax accepted by the remote migration parser', () => {
    expect(attemptLimitsMigration).not.toContain('\r')
    expect(attemptLimitsMigration).toMatch(/create trigger[\s\S]+\nBEGIN\n/)
  })

  it('preserves existing users and lectures as Standard while constraining new tier values', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, phone TEXT NOT NULL);
        CREATE TABLE lectures (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
        CREATE TABLE student_grades (user_id INTEGER NOT NULL, grade);
        CREATE TABLE lecture_grades (lecture_id INTEGER NOT NULL, grade);
        INSERT INTO users (phone) VALUES ('+84900000001');
        INSERT INTO lectures (title) VALUES ('Existing lecture');
        INSERT INTO student_grades (user_id, grade) VALUES (1, 12), (1, 'dgnl');
        INSERT INTO lecture_grades (lecture_id, grade) VALUES (1, 10), (1, 'dgnl');
      `)

      db.exec(accessTiersMigration)

      expect(db.prepare('SELECT access_tier FROM users WHERE id = 1').get()).toEqual({
        access_tier: 'standard',
      })
      expect(db.prepare('SELECT minimum_access_tier FROM lectures WHERE id = 1').get()).toEqual({
        minimum_access_tier: 'standard',
      })
      expect(() => db.exec("UPDATE users SET access_tier = 'guest' WHERE id = 1")).toThrow()
      expect(() => db.exec("UPDATE lectures SET minimum_access_tier = 'gold' WHERE id = 1")).toThrow()
      expect(db.prepare('SELECT grade FROM student_grades ORDER BY grade').all()).toEqual([
        { grade: 12 },
        { grade: 'dgnl' },
      ])
      expect(db.prepare('SELECT grade FROM lecture_grades ORDER BY grade').all()).toEqual([
        { grade: 10 },
        { grade: 'dgnl' },
      ])
    } finally {
      db.close()
    }
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'

it('adds Standard exercise access without changing existing data and reserves Guest in storage only', () => {
  const directory = `${process.cwd()}/worker/db/migrations`
  const migration = '0025_add_exercise_access_tier.sql'
  const db = new DatabaseSync(':memory:')
  try {
    for (const name of readdirSync(directory).filter(name => /^\d{4}_.*\.sql$/.test(name) && name < migration).sort()) {
      db.exec(readFileSync(`${directory}/${name}`, 'utf8'))
    }
    db.exec(`
      insert into users (id, phone, password_hash, role, status)
      values (1, '+84900000001', 'synthetic-hash', 'teacher', 'active');
      insert into exercises (id, title, duration_minutes, created_by, workspace_id)
      values (41, 'Maths assessment', 45, 1, 'maths')
        , (82, 'English assessment', 0, 1, 'english');
      insert into exercise_grades (exercise_id, grade)
      values (41, 10), (82, 11);
    `)
    const exercises = db.prepare('select * from exercises order by id').all()
    const grades = db.prepare('select * from exercise_grades order by exercise_id, grade').all()
    const users = db.prepare('select * from users').all()

    db.exec(readFileSync(`${directory}/${migration}`, 'utf8'))

    expect(db.prepare('select * from exercises order by id').all()).toEqual(
      exercises.map(exercise => ({ ...exercise, minimum_access_tier: 'standard' })),
    )
    expect(db.prepare('select * from exercise_grades order by exercise_id, grade').all()).toEqual(grades)
    expect(db.prepare('select * from users').all()).toEqual(users)
    for (const tier of ['vip', 'guest', 'standard']) {
      db.prepare('update exercises set minimum_access_tier = ? where id = 41').run(tier)
      expect(db.prepare('select minimum_access_tier from exercises where id = 41').get().minimum_access_tier).toBe(tier)
    }
    for (const tier of [null, '', 'VIP', 'premium']) {
      expect(() => db.prepare('update exercises set minimum_access_tier = ? where id = 41').run(tier)).toThrow()
    }
    expect(db.prepare('pragma foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})

import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'

it('adds THPT to active membership and exercise programme tables without changing legacy grants', () => {
  const directory = `${process.cwd()}/worker/db/migrations`
  const migration = '0026_add_thpt_programmes.sql'
  const db = new DatabaseSync(':memory:')
  try {
    for (const name of readdirSync(directory).filter(name => /^\d{4}_.*\.sql$/.test(name) && name < migration).sort()) {
      db.exec(readFileSync(`${directory}/${name}`, 'utf8'))
    }
    db.exec(`
      insert into users (id, phone, password_hash, role, status)
      values (1, '+84900000001', 'hash', 'student', 'active')
        , (2, '+84900000002', 'hash', 'teacher', 'active');
      insert into workspace_memberships (id, workspace_id, user_id, role, status, access_tier)
      values (10, 'maths', 1, 'student', 'active', 'standard')
        , (11, 'english', 1, 'student', 'active', 'standard');
      insert into workspace_membership_grades (membership_id, grade)
      values (10, 10), (10, 'dgnl'), (11, 11);
      insert into exercises (id, title, duration_minutes, created_by, workspace_id, minimum_access_tier)
      values (20, 'Maths', 0, 2, 'maths', 'standard')
        , (21, 'English', 0, 2, 'english', 'standard');
      insert into exercise_grades (exercise_id, grade)
      values (20, 12), (21, 'dgnl');
      insert into student_grades (user_id, grade)
      values (1, 10), (1, 'dgnl');
      insert into lectures (id, title, section_name, youtube_url, created_by, workspace_id)
      values (30, 'Lecture', 'Section', 'https://www.youtube.com/watch?v=abc123', 2, 'maths');
      insert into lecture_grades (lecture_id, grade)
      values (30, 12);
    `)
    const beforeStudentGrades = db.prepare('select * from student_grades order by user_id, grade').all()
    const beforeLectureGrades = db.prepare('select * from lecture_grades order by lecture_id, grade').all()
    const beforeMembershipGrades = db.prepare('select * from workspace_membership_grades order by membership_id, grade').all()
    const beforeExerciseGrades = db.prepare('select * from exercise_grades order by exercise_id, grade').all()

    db.exec(readFileSync(`${directory}/${migration}`, 'utf8'))

    expect(db.prepare('select * from workspace_membership_grades order by membership_id, grade').all()).toEqual(beforeMembershipGrades)
    expect(db.prepare('select * from exercise_grades order by exercise_id, grade').all()).toEqual(beforeExerciseGrades)
    expect(db.prepare("select name from sqlite_master where type = 'index' and name in ('idx_workspace_membership_grades_grade_membership', 'idx_exercise_grades_grade_exercise') order by name").all()).toEqual([
      { name: 'idx_exercise_grades_grade_exercise' },
      { name: 'idx_workspace_membership_grades_grade_membership' },
    ])
    db.prepare("insert into workspace_membership_grades (membership_id, grade) values (10, 'thpt')").run()
    db.prepare("insert into exercise_grades (exercise_id, grade) values (20, 'thpt')").run()
    expect(db.prepare('select grade from workspace_membership_grades where membership_id = 10 order by grade').all()).toEqual([
      { grade: 10 }, { grade: 'dgnl' }, { grade: 'thpt' },
    ])
    expect(db.prepare('select grade from exercise_grades where exercise_id = 20 order by grade').all()).toEqual([
      { grade: 12 }, { grade: 'thpt' },
    ])
    expect(() => db.prepare("insert into student_grades (user_id, grade) values (1, 'thpt')").run()).toThrow()
    expect(() => db.prepare("insert into lecture_grades (lecture_id, grade) values (30, 'thpt')").run()).toThrow()
    expect(db.prepare('select * from student_grades order by user_id, grade').all()).toEqual(beforeStudentGrades)
    expect(db.prepare('select * from lecture_grades order by lecture_id, grade').all()).toEqual(beforeLectureGrades)
    expect(db.prepare('pragma foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})

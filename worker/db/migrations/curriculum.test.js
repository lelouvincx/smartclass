import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const migrationDir = `${process.cwd()}/worker/db/migrations`

function readMigration(name) {
  return readFileSync(`${migrationDir}/${name}`, 'utf8')
}

function migrationNamesThrough0023() {
  return readdirSync(migrationDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right))
    .filter((name) => name <= '0023_add_teaching_workspaces.sql')
}

function setupCurrentSchema(db) {
  for (const name of migrationNamesThrough0023()) {
    db.exec(readMigration(name))
  }
}

function applyCurriculumMigration(db) {
  db.exec(readMigration('0024_add_curriculum.sql'))
}

function setupCurriculumSchema(db) {
  setupCurrentSchema(db)
  applyCurriculumMigration(db)
}

function seedUsersAndLectures(db) {
  db.exec(`
    insert into users (id, phone, password_hash, role, status)
    values
      (1, '+84865481769', 'hash-teacher', 'teacher', 'active')
      , (2, '+84900000001', 'hash-student', 'student', 'active');

    insert into lectures (id, workspace_id, title, section_name, youtube_url, order_index, created_by)
    values
      (1, 'maths', 'Maths video 1', 'Legacy section', 'https://www.youtube.com/watch?v=aaa111', 0, 1)
      , (2, 'maths', 'Maths video 2', 'Legacy section', 'https://www.youtube.com/watch?v=bbb222', 1, 1)
      , (3, 'english', 'English video', 'Legacy section', 'https://www.youtube.com/watch?v=ccc333', 0, 1)
      , (4, null, 'Unowned legacy video', 'Legacy section', 'https://www.youtube.com/watch?v=ddd444', 2, 1);
  `)
}

function seedCurriculum(db) {
  db.exec(`
    insert into curriculum_topics (id, workspace_id, programme, title, order_index)
    values
      (10, 'maths', 10, 'Vectors', 0)
      , (11, 'maths', 'thpt', 'Functions', 0)
      , (20, 'english', 10, 'Grammar', 0);

    insert into curriculum_lessons (id, workspace_id, topic_id, title, order_index)
    values
      (100, 'maths', 10, 'Vector operations', 0)
      , (101, 'maths', 10, 'Vector review', 0)
      , (200, 'english', 20, 'Tenses', 0);

    insert into lecture_placements (id, workspace_id, lesson_id, lecture_id, order_index)
    values
      (1000, 'maths', 100, 1, 0)
      , (1001, 'maths', 100, 2, 0);
  `)
}

function tableRows(db, table) {
  return db.prepare(`select * from ${table} order by id`).all()
}

describe('RFC-18 additive curriculum storage foundation', () => {
  it('adds only curriculum storage and preserves existing rows', () => {
    const db = new DatabaseSync(':memory:')
    try {
      setupCurrentSchema(db)
      seedUsersAndLectures(db)
      const before = {
        users: tableRows(db, 'users'),
        workspaces: tableRows(db, 'workspaces'),
        lectures: tableRows(db, 'lectures'),
      }

      applyCurriculumMigration(db)

      expect(tableRows(db, 'users')).toEqual(before.users)
      expect(tableRows(db, 'lectures')).toEqual(before.lectures)
      expect(tableRows(db, 'workspaces')).toEqual(
        before.workspaces.map((workspace) => ({ ...workspace, curriculum_revision: 0 })),
      )
      expect(db.prepare('pragma foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })

  it('validates programmes, positive ids, non-empty titles and integer positions', () => {
    const db = new DatabaseSync(':memory:')
    try {
      setupCurriculumSchema(db)

      db.exec(`
        insert into curriculum_topics (id, workspace_id, programme, title, order_index)
        values (1, 'maths', 10, 'Grade 10', 0), (2, 'maths', 'thpt', 'THPT', 1), (3, 'maths', 'dgnl', 'ĐGNL', 2);
      `)

      expect(() => db.exec("insert into curriculum_topics (id, workspace_id, programme, title, order_index) values (0, 'maths', 10, 'Broken', 0)")).toThrow()
      expect(() => db.exec("insert into curriculum_topics (workspace_id, programme, title, order_index) values ('maths', 9, 'Broken', 0)")).toThrow()
      expect(() => db.exec("insert into curriculum_topics (workspace_id, programme, title, order_index) values ('maths', 10, '   ', 0)")).toThrow()
      expect(() => db.exec("insert into curriculum_topics (workspace_id, programme, title, order_index) values ('maths', 10, 'Broken', -1)")).toThrow()
      expect(() => db.exec("insert into curriculum_topics (workspace_id, programme, title, order_index) values ('maths', 10, 'Broken', 1.5)")).toThrow()
      expect(() => db.exec("insert into curriculum_lessons (id, workspace_id, topic_id, title, order_index) values (0, 'maths', 1, 'Broken', 0)")).toThrow()
      expect(() => db.exec("insert into lecture_placements (id, workspace_id, lesson_id, lecture_id, order_index) values (0, 'maths', 1, 1, 0)")).toThrow()
    } finally {
      db.close()
    }
  })

  it('enforces same-workspace parents, lecture ownership and required parents', () => {
    const db = new DatabaseSync(':memory:')
    try {
      setupCurriculumSchema(db)
      seedUsersAndLectures(db)
      seedCurriculum(db)

      expect(() => db.exec("insert into curriculum_lessons (workspace_id, topic_id, title, order_index) values ('english', 10, 'Wrong workspace', 0)")).toThrow()
      expect(() => db.exec("insert into curriculum_lessons (workspace_id, topic_id, title, order_index) values ('maths', 999, 'Missing topic', 0)")).toThrow()
      expect(() => db.exec("insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index) values ('english', 100, 3, 0)")).toThrow()
      expect(() => db.exec("insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index) values ('maths', 200, 1, 0)")).toThrow()
      expect(() => db.exec("insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index) values ('maths', 100, 3, 0)")).toThrow()
      expect(() => db.exec("insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index) values ('maths', 100, 4, 0)")).toThrow()
      expect(() => db.exec("insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index) values ('maths', 100, 999, 0)")).toThrow()
      expect(db.prepare('pragma foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })

  it('allows swap-friendly sibling order indexes but prevents duplicate videos in one lesson', () => {
    const db = new DatabaseSync(':memory:')
    try {
      setupCurriculumSchema(db)
      seedUsersAndLectures(db)
      seedCurriculum(db)

      expect(db.prepare('select id, order_index from curriculum_lessons where topic_id = 10 order by id').all()).toEqual([
        { id: 100, order_index: 0 },
        { id: 101, order_index: 0 },
      ])
      expect(db.prepare('select id, order_index from lecture_placements where lesson_id = 100 order by id').all()).toEqual([
        { id: 1000, order_index: 0 },
        { id: 1001, order_index: 0 },
      ])
      expect(() => db.exec("insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index) values ('maths', 100, 1, 1)")).toThrow()

      db.exec("insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index) values ('maths', 101, 1, 0)")
      expect(db.prepare('select count(*) as count from lecture_placements where lecture_id = 1').get()).toEqual({ count: 2 })
    } finally {
      db.close()
    }
  })

  it('restricts non-empty curriculum parents and cascades deleted videos to placements', () => {
    const db = new DatabaseSync(':memory:')
    try {
      setupCurriculumSchema(db)
      seedUsersAndLectures(db)
      seedCurriculum(db)

      expect(() => db.exec('delete from curriculum_topics where id = 10')).toThrow()
      expect(() => db.exec('delete from curriculum_lessons where id = 100')).toThrow()

      db.exec('delete from lectures where id = 1')
      expect(db.prepare('select id, lecture_id from lecture_placements order by id').all()).toEqual([
        { id: 1001, lecture_id: 2 },
      ])

      db.exec('delete from lecture_placements where id = 1001')
      db.exec('delete from curriculum_lessons where id = 100')
      db.exec('delete from curriculum_lessons where id = 101')
      db.exec('delete from curriculum_topics where id = 10')
      expect(db.prepare('pragma foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})

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

function applyMigrations(db) {
  for (const name of migrationNamesThrough0023()) {
    db.exec(readMigration(name))
  }
}

function setupCurrentSchema(db) {
  for (const name of migrationNamesThrough0023().filter((name) => name < '0023_add_teaching_workspaces.sql')) {
    db.exec(readMigration(name))
  }
}

function seedSyntheticCurrentData(db) {
  db.exec(`
    insert into users (
      id, phone, password_hash, role, status, created_at, updated_at,
      email, google_sub, google_email, name, access_tier
    ) values
      (1, '+84865481769', 'hash-teacher', 'teacher', 'active', '2026-09-01 01:00:00', '2026-09-01 02:00:00', 'teacher@example.test', 'google-teacher', 'teacher@gmail.test', 'Teacher One', 'standard'),
      (2, '+84900000001', 'hash-student', 'student', 'active', '2026-09-02 01:00:00', '2026-09-02 02:00:00', 'student@example.test', 'google-student', 'student@gmail.test', 'Student One', 'vip');

    insert into student_grades (user_id, grade) values
      (2, 10),
      (2, 12),
      (2, 'dgnl');

    insert into exercises (
      id, title, duration_minutes, pdf_key, created_by, created_at, updated_at,
      extract_model, active_question_asset_set_id, max_attempts, allow_answer_pdf_download
    ) values
      (10, 'Synthetic exercise', 90, 'legacy/exercise.pdf', 1, '2026-09-03 01:00:00', '2026-09-03 02:00:00', 'deepseek-v4-flash-vision-exp', null, 3, 1);

    insert into exercise_grades (exercise_id, grade) values
      (10, 10),
      (10, 'dgnl');

    insert into exercise_files (id, exercise_id, file_type, r2_key, file_name, file_size, uploaded_at) values
      (20, 10, 'exercise_pdf', 'r2/exercise.pdf', 'exercise.pdf', 1234, '2026-09-03 03:00:00'),
      (21, 10, 'solution_pdf', 'r2/answer.pdf', 'answer.pdf', 2345, '2026-09-03 03:10:00');

    insert into exercise_question_asset_sets (
      id, exercise_id, source_file_id, answer_source_file_id, answer_parser_status,
      detector_version, detection_method, confirmed_by, confirmed_at, created_at
    ) values
      (30, 10, 20, 21, 'parsed', 'detector-test', 'text', 1, '2026-09-03 04:00:00', '2026-09-03 03:30:00');

    update exercises set active_question_asset_set_id = 30 where id = 10;

    insert into exercise_question_assets (
      id, asset_set_id, q_id, segment_index, source_kind, source_page,
      x, y, width, height, r2_key, mime_type, file_size, pixel_width, pixel_height,
      accessible_text, confidence, rejected_by, rejected_at, created_at
    ) values
      (40, 30, 1, 0, 'pdf_crop', 1, 0.1, 0.2, 0.3, 0.4, 'r2/q1.webp', 'image/webp', 3456, 800, 600, 'Question text', 0.95, null, null, '2026-09-03 04:10:00');

    insert into exercise_question_answer_assets (
      id, asset_set_id, q_id, segment_index, r2_key, mime_type,
      file_size, pixel_width, pixel_height, created_at
    ) values
      (41, 30, 1, 0, 'r2/q1-answer.webp', 'image/webp', 2222, 700, 500, '2026-09-03 04:11:00');

    insert into answer_schemas (
      id, exercise_id, q_id, sub_id, type, correct_answer, created_at, updated_at,
      section_key, section_title, local_number, max_score_hundredths
    ) values
      (50, 10, 1, null, 'mcq', 'A', '2026-09-03 04:20:00', '2026-09-03 04:21:00', 'main', null, 1, 1000);

    insert into exercise_question_answer_schemas (
      id, asset_set_id, q_id, sub_id, type, correct_answer, created_at,
      section_key, section_title, local_number, max_score_hundredths
    ) values
      (51, 30, 1, null, 'mcq', 'A', '2026-09-03 04:22:00', 'main', null, 1, 1000);

    insert into exercise_question_answer_candidates (
      id, asset_set_id, q_id, sub_id, type, proposed_answer, source_kind,
      source_file_id, extractor_version, model_id, source_page, source_x,
      source_y, source_width, source_height, confidence, created_at
    ) values
      (52, 30, 1, null, 'mcq', 'A', 'answer_pdf_text', 21, 'extractor-test', 'model-test', null, null, null, null, null, null, '2026-09-03 04:23:00');

    insert into submissions (
      id, exercise_id, user_id, mode, score, total_questions, started_at, submitted_at,
      created_at, updated_at, question_asset_set_id, attempt_number
    ) values
      (60, 10, 2, 'timed', 9.5, 1, '2026-09-04 01:00:00', '2026-09-04 02:00:00', '2026-09-04 01:00:00', '2026-09-04 02:00:00', 30, 1);

    insert into submission_answers (id, submission_id, q_id, sub_id, submitted_answer, is_correct, created_at) values
      (70, 60, 1, null, 'A', 1, '2026-09-04 01:30:00');

    insert into submission_files (id, submission_id, file_type, r2_key, file_name, file_size, uploaded_at) values
      (80, 60, 'answer_sheet', 'r2/submission.png', 'submission.png', 4567, '2026-09-04 01:35:00');

    insert into lectures (
      id, title, section_name, youtube_url, order_index, created_by, created_at, updated_at,
      is_visible, minimum_access_tier
    ) values
      (90, 'Synthetic lecture', 'Section A', 'https://www.youtube.com/watch?v=abc123', 5, 1, '2026-09-05 01:00:00', '2026-09-05 02:00:00', 1, 'guest');

    insert into lecture_grades (lecture_id, grade) values
      (90, 12),
      (90, 'dgnl');
  `)
}

function tableRows(db, table) {
  return db.prepare(`select * from ${table} order by id`).all()
}

function userIndexNames(db) {
  return db
    .prepare("select name from sqlite_master where type = 'index' and name not like 'sqlite_%' order by name")
    .all()
    .map(({ name }) => name)
}

describe('RFC-17 additive workspace schema preparation', () => {
  it('applies after the full current schema and preserves existing account, content and attempt data exactly', () => {
    const db = new DatabaseSync(':memory:')
    try {
      setupCurrentSchema(db)
      seedSyntheticCurrentData(db)

      const before = {
        users: tableRows(db, 'users'),
        student_grades: db.prepare('select * from student_grades order by user_id, grade').all(),
        exercises: tableRows(db, 'exercises'),
        exercise_grades: db.prepare('select * from exercise_grades order by exercise_id, grade').all(),
        exercise_files: tableRows(db, 'exercise_files'),
        asset_sets: tableRows(db, 'exercise_question_asset_sets'),
        question_assets: tableRows(db, 'exercise_question_assets'),
        answer_assets: tableRows(db, 'exercise_question_answer_assets'),
        answer_schemas: tableRows(db, 'answer_schemas'),
        pinned_schemas: tableRows(db, 'exercise_question_answer_schemas'),
        answer_candidates: tableRows(db, 'exercise_question_answer_candidates'),
        submissions: tableRows(db, 'submissions'),
        submission_answers: tableRows(db, 'submission_answers'),
        submission_files: tableRows(db, 'submission_files'),
        lectures: tableRows(db, 'lectures'),
        lecture_grades: db.prepare('select * from lecture_grades order by lecture_id, grade').all(),
      }

      db.exec(readMigration('0023_add_teaching_workspaces.sql'))

      expect(tableRows(db, 'users')).toEqual(
        before.users.map((user) => ({ ...user, platform_role: 'user', disabled_at: null })),
      )
      expect(db.prepare('select * from student_grades order by user_id, grade').all()).toEqual(before.student_grades)
      expect(tableRows(db, 'exercises')).toEqual(
        before.exercises.map((exercise) => ({ ...exercise, workspace_id: null })),
      )
      expect(db.prepare('select * from exercise_grades order by exercise_id, grade').all()).toEqual(before.exercise_grades)
      expect(tableRows(db, 'exercise_files')).toEqual(before.exercise_files)
      expect(tableRows(db, 'exercise_question_asset_sets')).toEqual(before.asset_sets)
      expect(tableRows(db, 'exercise_question_assets')).toEqual(before.question_assets)
      expect(tableRows(db, 'exercise_question_answer_assets')).toEqual(before.answer_assets)
      expect(tableRows(db, 'answer_schemas')).toEqual(before.answer_schemas)
      expect(tableRows(db, 'exercise_question_answer_schemas')).toEqual(before.pinned_schemas)
      expect(tableRows(db, 'exercise_question_answer_candidates')).toEqual(before.answer_candidates)
      expect(tableRows(db, 'submissions')).toEqual(before.submissions)
      expect(tableRows(db, 'submission_answers')).toEqual(before.submission_answers)
      expect(tableRows(db, 'submission_files')).toEqual(before.submission_files)
      expect(tableRows(db, 'lectures')).toEqual(
        before.lectures.map((lecture) => ({ ...lecture, workspace_id: null })),
      )
      expect(db.prepare('select * from lecture_grades order by lecture_id, grade').all()).toEqual(before.lecture_grades)
      expect(db.prepare('pragma foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })

  it('creates only the two configured workspaces and keeps ownership nullable during preparation', () => {
    const db = new DatabaseSync(':memory:')
    try {
      applyMigrations(db)

      expect(db.prepare('select id, slug, display_name, subject_code from workspaces order by id').all()).toEqual([
        { id: 'english', slug: 'english', display_name: 'Tiếng Anh Cô Thuỳ', subject_code: 'english' },
        { id: 'maths', slug: 'maths', display_name: 'Toán Thầy Thành', subject_code: 'maths' },
      ])
      expect(userIndexNames(db)).toEqual(
        expect.arrayContaining([
          'idx_workspaces_display_name',
          'idx_workspace_memberships_workspace_role_status',
          'idx_workspace_memberships_user_status',
          'idx_workspace_memberships_workspace_status_tier',
          'idx_workspace_membership_grades_grade_membership',
          'idx_exercises_workspace_created',
          'idx_lectures_workspace_order',
          'idx_lectures_workspace_visibility',
        ]),
      )

      db.exec(`
        insert into users (id, phone, password_hash, role, status)
        values (1, '+84900000001', 'hash', 'student', 'active');
        insert into exercises (id, title, duration_minutes, created_by)
        values (1, 'No workspace yet', 0, 1);
        insert into lectures (id, title, section_name, youtube_url, created_by)
        values (1, 'No workspace yet', 'Section', 'https://www.youtube.com/watch?v=abc123', 1);
      `)

      expect(db.prepare('select workspace_id from exercises where id = 1').get()).toEqual({ workspace_id: null })
      expect(db.prepare('select workspace_id from lectures where id = 1').get()).toEqual({ workspace_id: null })
      expect(() => db.exec("insert into exercises (title, duration_minutes, created_by, workspace_id) values ('Broken', 0, 1, 'science')")).toThrow()
      expect(() => db.exec("insert into lectures (title, section_name, youtube_url, created_by, workspace_id) values ('Broken', 'Section', 'https://www.youtube.com/watch?v=def456', 1, 'science')")).toThrow()
    } finally {
      db.close()
    }
  })

  it('enforces workspace, membership and programme constraints', () => {
    const db = new DatabaseSync(':memory:')
    try {
      applyMigrations(db)
      db.exec(`
        insert into users (id, phone, password_hash, role, status)
        values
          (1, '+84865481769', 'hash-teacher', 'teacher', 'active'),
          (2, '+84900000001', 'hash-student', 'student', 'active');
      `)

      expect(() => db.exec("update users set platform_role = 'owner' where id = 1")).toThrow()
      expect(() => db.exec("insert into workspaces (id, slug, display_name, subject_code) values (null, 'missing', 'Missing ID', 'missing')")).toThrow()
      expect(() => db.exec("insert into workspaces (id, slug, display_name, subject_code) values ('duplicate', 'maths', 'Other', 'other')")).toThrow()
      expect(() => db.exec("insert into workspaces (id, slug, display_name, subject_code) values ('duplicate', 'other', 'Other', 'maths')")).toThrow()

      db.exec(`
        insert into workspace_memberships (id, workspace_id, user_id, role, status, access_tier, display_name)
        values (1, 'maths', 1, 'teacher', 'active', 'standard', 'Local teacher');
      `)

      expect(db.prepare('select * from workspace_memberships where id = 1').get()).toMatchObject({
        workspace_id: 'maths',
        user_id: 1,
        role: 'teacher',
        status: 'active',
        access_tier: 'standard',
        display_name: 'Local teacher',
      })
      expect(() => db.exec("insert into workspace_memberships (workspace_id, user_id, role) values ('maths', 1, 'teacher')")).toThrow()
      expect(() => db.exec("insert into workspace_memberships (workspace_id, user_id, role) values ('science', 2, 'student')")).toThrow()
      expect(() => db.exec("insert into workspace_memberships (workspace_id, user_id, role) values ('maths', 999, 'student')")).toThrow()
      expect(() => db.exec("insert into workspace_memberships (workspace_id, user_id, role) values ('maths', 2, 'assistant')")).toThrow()
      expect(() => db.exec("insert into workspace_memberships (workspace_id, user_id, role, status) values ('maths', 2, 'student', 'approved')")).toThrow()
      expect(() => db.exec("insert into workspace_memberships (workspace_id, user_id, role, access_tier) values ('maths', 2, 'student', 'guest')")).toThrow()

      db.exec(`
        insert into workspace_membership_grades (membership_id, grade)
        values (1, 10), (1, 11), (1, 12), (1, 'dgnl');
      `)

      expect(db.prepare('select grade from workspace_membership_grades order by grade').all()).toEqual([
        { grade: 10 },
        { grade: 11 },
        { grade: 12 },
        { grade: 'dgnl' },
      ])
      expect(() => db.exec("insert into workspace_membership_grades (membership_id, grade) values (1, 9)")).toThrow()
      expect(() => db.exec("insert into workspace_membership_grades (membership_id, grade) values (999, 10)")).toThrow()

      db.exec('delete from workspace_memberships where id = 1')
      expect(db.prepare('select * from workspace_membership_grades').all()).toEqual([])
      expect(db.prepare('pragma foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})

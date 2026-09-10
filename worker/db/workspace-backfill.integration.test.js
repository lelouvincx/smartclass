import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { backfillWorkspaces } from './workspace-backfill.js'

const PASSWORD_HASH = 'synthetic-password-hash'

async function resetData() {
  for (const statement of [
    'delete from workspace_membership_grades',
    'delete from workspace_memberships',
    'update exercises set active_question_asset_set_id = null',
    'update submissions set question_asset_set_id = null',
    'delete from exercise_question_answer_assets',
    'delete from exercise_question_answer_candidates',
    'delete from exercise_question_answer_schemas',
    'delete from exercise_question_assets',
    'delete from exercise_question_asset_sets',
    'delete from submission_answers',
    'delete from submission_files',
    'delete from submissions',
    'delete from exercise_files',
    'delete from answer_schemas',
    'delete from exercise_grades',
    'delete from lecture_grades',
    'delete from exercises',
    'delete from lectures',
    'delete from student_grades',
    'delete from users',
  ]) {
    await env.DB.prepare(statement).run()
  }
}

async function seedUser({ id, role, status = 'active', accessTier = 'standard', name }) {
  await env.DB.prepare(`
    insert into users (
      id, phone, password_hash, role, status, name, email, google_sub, google_email,
      access_tier, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    `+84900000${String(id).padStart(3, '0')}`,
    PASSWORD_HASH,
    role,
    status,
    name,
    `${name.replace(/\s+/g, '.').toLowerCase()}@example.test`,
    `google-${id}`,
    `${name.replace(/\s+/g, '.').toLowerCase()}@gmail.test`,
    accessTier,
    `2026-09-0${Math.min(id, 9)} 01:00:00`,
    `2026-09-0${Math.min(id, 9)} 02:00:00`,
  ).run()
}

async function setStudentGrades(userId, grades) {
  await env.DB.batch(grades.map((grade) => env.DB.prepare(
    'insert into student_grades (user_id, grade) values (?, ?)'
  ).bind(userId, grade)))
}

async function seedExercise(id, createdBy, title, grades) {
  await env.DB.prepare(`
    insert into exercises (
      id, title, duration_minutes, pdf_key, created_by, created_at, updated_at,
      extract_model, max_attempts, allow_answer_pdf_download
    ) values (?, ?, 75, ?, ?, ?, ?, 'deepseek-v4-flash-vision-exp', 2, 1)
  `).bind(id, title, `legacy/${id}.pdf`, createdBy, '2026-09-08 01:00:00', '2026-09-08 02:00:00').run()
  await env.DB.batch(grades.map((grade) => env.DB.prepare(
    'insert into exercise_grades (exercise_id, grade) values (?, ?)'
  ).bind(id, grade)))
}

async function seedLecture(id, createdBy, title, grades) {
  await env.DB.prepare(`
    insert into lectures (
      id, title, section_name, youtube_url, order_index, created_by, created_at, updated_at,
      is_visible, minimum_access_tier
    ) values (?, ?, 'Synthetic section', ?, ?, ?, '2026-09-08 03:00:00', '2026-09-08 04:00:00', 1, 'guest')
  `).bind(id, title, `https://www.youtube.com/watch?v=${id}abcabcabc`, id, createdBy).run()
  await env.DB.batch(grades.map((grade) => env.DB.prepare(
    'insert into lecture_grades (lecture_id, grade) values (?, ?)'
  ).bind(id, grade)))
}

async function seedPinnedExerciseData({ exerciseId, teacherId, studentId }) {
  const exerciseKey = `exercises/${exerciseId}/source.pdf`
  const answerKey = `exercises/${exerciseId}/answer.pdf`
  const questionKey = `exercises/${exerciseId}/questions/q1.webp`
  const answerAssetKey = `exercises/${exerciseId}/answers/q1.webp`
  const submittedSheetKey = `submissions/${exerciseId}/sheet.png`
  await env.BUCKET.put(exerciseKey, 'source pdf')
  await env.BUCKET.put(answerKey, 'answer pdf')
  await env.BUCKET.put(questionKey, 'question image')
  await env.BUCKET.put(answerAssetKey, 'answer image')
  await env.BUCKET.put(submittedSheetKey, 'submitted sheet')

  await env.DB.prepare(`
    insert into exercise_files (id, exercise_id, file_type, r2_key, file_name, file_size, uploaded_at)
    values
      (?, ?, 'exercise_pdf', ?, 'source.pdf', 111, '2026-09-08 05:00:00'),
      (?, ?, 'solution_pdf', ?, 'answer.pdf', 222, '2026-09-08 05:01:00')
  `).bind(exerciseId * 10, exerciseId, exerciseKey, exerciseId * 10 + 1, exerciseId, answerKey).run()
  await env.DB.prepare(`
    insert into exercise_question_asset_sets (
      id, exercise_id, source_file_id, answer_source_file_id, answer_parser_status,
      detector_version, detection_method, confirmed_by, confirmed_at, created_at
    ) values (?, ?, ?, ?, 'parsed', 'synthetic-detector', 'text', ?, '2026-09-08 06:00:00', '2026-09-08 05:30:00')
  `).bind(exerciseId * 10 + 2, exerciseId, exerciseId * 10, exerciseId * 10 + 1, teacherId).run()
  await env.DB.prepare('update exercises set active_question_asset_set_id = ? where id = ?')
    .bind(exerciseId * 10 + 2, exerciseId).run()
  await env.DB.prepare(`
    insert into exercise_question_assets (
      id, asset_set_id, q_id, segment_index, source_kind, source_page, x, y, width, height,
      r2_key, mime_type, file_size, pixel_width, pixel_height, accessible_text, confidence, created_at
    ) values (?, ?, 1, 0, 'pdf_crop', 1, 0.1, 0.1, 0.2, 0.2, ?, 'image/webp', 333, 800, 600, 'Question 1', 0.9, '2026-09-08 06:01:00')
  `).bind(exerciseId * 10 + 3, exerciseId * 10 + 2, questionKey).run()
  await env.DB.prepare(`
    insert into exercise_question_answer_assets (
      id, asset_set_id, q_id, segment_index, r2_key, mime_type, file_size, pixel_width, pixel_height, created_at
    ) values (?, ?, 1, 0, ?, 'image/webp', 444, 700, 500, '2026-09-08 06:02:00')
  `).bind(exerciseId * 10 + 4, exerciseId * 10 + 2, answerAssetKey).run()
  await env.DB.prepare(`
    insert into answer_schemas (
      id, exercise_id, q_id, sub_id, type, correct_answer, created_at, updated_at, section_key, local_number, max_score_hundredths
    ) values (?, ?, 1, null, 'mcq', 'B', '2026-09-08 06:03:00', '2026-09-08 06:04:00', 'main', 1, 1000)
  `).bind(exerciseId * 10 + 5, exerciseId).run()
  await env.DB.prepare(`
    insert into exercise_question_answer_schemas (
      id, asset_set_id, q_id, sub_id, type, correct_answer, created_at, section_key, local_number, max_score_hundredths
    ) values (?, ?, 1, null, 'mcq', 'B', '2026-09-08 06:05:00', 'main', 1, 1000)
  `).bind(exerciseId * 10 + 6, exerciseId * 10 + 2).run()
  await env.DB.prepare(`
    insert into submissions (
      id, exercise_id, user_id, mode, score, total_questions, started_at, submitted_at,
      created_at, updated_at, question_asset_set_id, attempt_number
    ) values
      (?, ?, ?, 'timed', 10, 1, '2026-09-08 07:00:00', '2026-09-08 08:00:00', '2026-09-08 07:00:00', '2026-09-08 08:00:00', ?, 1),
      (?, ?, ?, 'untimed', null, 1, '2026-09-08 09:00:00', null, '2026-09-08 09:00:00', '2026-09-08 09:00:00', ?, 2)
  `).bind(exerciseId * 10 + 7, exerciseId, studentId, exerciseId * 10 + 2, exerciseId * 10 + 8, exerciseId, studentId, exerciseId * 10 + 2).run()
  await env.DB.prepare(`
    insert into submission_answers (id, submission_id, q_id, sub_id, submitted_answer, is_correct, created_at)
    values (?, ?, 1, null, 'B', 1, '2026-09-08 07:30:00')
  `).bind(exerciseId * 10 + 9, exerciseId * 10 + 7).run()
  await env.DB.prepare(`
    insert into submission_files (id, submission_id, file_type, r2_key, file_name, file_size, uploaded_at)
    values (?, ?, 'answer_sheet', ?, 'sheet.png', 555, '2026-09-08 07:35:00')
  `).bind(exerciseId * 10 + 11, exerciseId * 10 + 7, submittedSheetKey).run()
}

async function seedSyntheticCurrentData() {
  await seedUser({ id: 101, role: 'teacher', name: 'Maths Teacher' })
  await seedUser({ id: 102, role: 'teacher', name: 'English Teacher' })
  await seedUser({ id: 103, role: 'teacher', name: 'Explicit Admin' })
  await seedUser({ id: 201, role: 'student', status: 'active', accessTier: 'vip', name: 'Active Vip Grade 10' })
  await seedUser({ id: 202, role: 'student', status: 'active', accessTier: 'vip', name: 'Active Vip Dgnl' })
  await seedUser({ id: 203, role: 'student', status: 'pending', name: 'Pending Empty' })
  await seedUser({ id: 204, role: 'student', status: 'pending', name: 'Pending Programmes' })
  await seedUser({ id: 205, role: 'student', status: 'disabled', name: 'Disabled Student' })
  await setStudentGrades(201, [10, 12])
  await setStudentGrades(202, ['dgnl'])
  await setStudentGrades(204, [11])
  await setStudentGrades(205, [12])
  await seedExercise(301, 101, 'Maths exercise', [10, 12])
  await seedExercise(302, 102, 'English exercise', ['dgnl'])
  await seedLecture(401, 101, 'Maths lecture', [10])
  await seedLecture(402, 102, 'English lecture', ['dgnl'])
  await seedPinnedExerciseData({ exerciseId: 301, teacherId: 101, studentId: 201 })
}

function completeManifest(overrides = {}) {
  return {
    users: [
      { id: 101, platform_role: 'user', memberships: [{ workspace_id: 'maths', role: 'teacher', status: 'active', access_tier: 'standard', grades: [], display_name: null }] },
      { id: 102, platform_role: 'user', memberships: [{ workspace_id: 'english', role: 'teacher', status: 'active', access_tier: 'standard', grades: [], display_name: null }] },
      { id: 103, platform_role: 'platform_admin', memberships: [] },
      { id: 201, platform_role: 'user', memberships: [
        { workspace_id: 'maths', role: 'student', status: 'active', access_tier: 'vip', grades: [10, 12], display_name: 'Maths local name' },
        { workspace_id: 'english', role: 'student', status: 'pending', access_tier: 'standard', grades: [], display_name: null },
      ] },
      { id: 202, platform_role: 'user', memberships: [{ workspace_id: 'english', role: 'student', status: 'active', access_tier: 'vip', grades: ['dgnl'], display_name: null }] },
      { id: 203, platform_role: 'user', memberships: [{ workspace_id: 'maths', role: 'student', status: 'pending', access_tier: 'standard', grades: [], display_name: null }] },
      { id: 204, platform_role: 'user', memberships: [{ workspace_id: 'english', role: 'student', status: 'pending', access_tier: 'standard', grades: [11], display_name: null }] },
      { id: 205, platform_role: 'user', memberships: [{ workspace_id: 'maths', role: 'student', status: 'disabled', access_tier: 'standard', grades: [12], display_name: null }] },
    ],
    exercises: [
      { id: 301, workspace_id: 'maths' },
      { id: 302, workspace_id: 'english' },
    ],
    lectures: [
      { id: 401, workspace_id: 'maths' },
      { id: 402, workspace_id: 'english' },
    ],
    ...overrides,
  }
}

async function readBackfillState() {
  const [
    workspaces,
    users,
    studentGrades,
    exercises,
    exerciseGrades,
    lectures,
    lectureGrades,
    exerciseFiles,
    exerciseQuestionAssetSets,
    exerciseQuestionAssets,
    exerciseQuestionAnswerCandidates,
    exerciseQuestionAnswerAssets,
    answerSchemas,
    exerciseQuestionAnswerSchemas,
    submissions,
    submissionAnswers,
    submissionFiles,
    memberships,
    grades,
    fk,
  ] = await Promise.all([
    env.DB.prepare('select * from workspaces order by id').all(),
    env.DB.prepare('select * from users order by id').all(),
    env.DB.prepare('select * from student_grades order by user_id, grade').all(),
    env.DB.prepare('select * from exercises order by id').all(),
    env.DB.prepare('select * from exercise_grades order by exercise_id, grade').all(),
    env.DB.prepare('select * from lectures order by id').all(),
    env.DB.prepare('select * from lecture_grades order by lecture_id, grade').all(),
    env.DB.prepare('select * from exercise_files order by id').all(),
    env.DB.prepare('select * from exercise_question_asset_sets order by id').all(),
    env.DB.prepare('select * from exercise_question_assets order by id').all(),
    env.DB.prepare('select * from exercise_question_answer_candidates order by id').all(),
    env.DB.prepare('select * from exercise_question_answer_assets order by id').all(),
    env.DB.prepare('select * from answer_schemas order by id').all(),
    env.DB.prepare('select * from exercise_question_answer_schemas order by id').all(),
    env.DB.prepare('select * from submissions order by id').all(),
    env.DB.prepare('select * from submission_answers order by id').all(),
    env.DB.prepare('select * from submission_files order by id').all(),
    env.DB.prepare('select * from workspace_memberships order by user_id, workspace_id').all(),
    env.DB.prepare(`
      select m.user_id, m.workspace_id, g.grade
      from workspace_membership_grades g
      join workspace_memberships m on m.id = g.membership_id
      order by m.user_id, m.workspace_id, g.grade
    `).all(),
    env.DB.prepare('pragma foreign_key_check').all(),
  ])
  return {
    workspaces: workspaces.results,
    users: users.results,
    studentGrades: studentGrades.results,
    exercises: exercises.results,
    exerciseGrades: exerciseGrades.results,
    lectures: lectures.results,
    lectureGrades: lectureGrades.results,
    exerciseFiles: exerciseFiles.results,
    exerciseQuestionAssetSets: exerciseQuestionAssetSets.results,
    exerciseQuestionAssets: exerciseQuestionAssets.results,
    exerciseQuestionAnswerCandidates: exerciseQuestionAnswerCandidates.results,
    exerciseQuestionAnswerAssets: exerciseQuestionAnswerAssets.results,
    answerSchemas: answerSchemas.results,
    exerciseQuestionAnswerSchemas: exerciseQuestionAnswerSchemas.results,
    submissions: submissions.results,
    submissionAnswers: submissionAnswers.results,
    submissionFiles: submissionFiles.results,
    memberships: memberships.results.map(({ id, created_at, updated_at, ...row }) => row),
    grades: grades.results,
    fk: fk.results,
  }
}

async function readR2Bytes(keys) {
  const entries = []
  for (const key of keys) {
    const object = await env.BUCKET.get(key)
    entries.push([key, object ? Array.from(new Uint8Array(await object.arrayBuffer())) : null])
  }
  return Object.fromEntries(entries)
}

function withExpectedBackfillChanges(before) {
  return {
    ...before,
    users: before.users.map((user) => ({
      ...user,
      platform_role: user.id === 103 ? 'platform_admin' : 'user',
    })),
    exercises: before.exercises.map((exercise) => ({
      ...exercise,
      workspace_id: exercise.id === 301 ? 'maths' : 'english',
    })),
    lectures: before.lectures.map((lecture) => ({
      ...lecture,
      workspace_id: lecture.id === 401 ? 'maths' : 'english',
    })),
    memberships: [
      { workspace_id: 'maths', user_id: 101, role: 'teacher', status: 'active', access_tier: 'standard', display_name: null },
      { workspace_id: 'english', user_id: 102, role: 'teacher', status: 'active', access_tier: 'standard', display_name: null },
      { workspace_id: 'english', user_id: 201, role: 'student', status: 'pending', access_tier: 'standard', display_name: null },
      { workspace_id: 'maths', user_id: 201, role: 'student', status: 'active', access_tier: 'vip', display_name: 'Maths local name' },
      { workspace_id: 'english', user_id: 202, role: 'student', status: 'active', access_tier: 'vip', display_name: null },
      { workspace_id: 'maths', user_id: 203, role: 'student', status: 'pending', access_tier: 'standard', display_name: null },
      { workspace_id: 'english', user_id: 204, role: 'student', status: 'pending', access_tier: 'standard', display_name: null },
      { workspace_id: 'maths', user_id: 205, role: 'student', status: 'disabled', access_tier: 'standard', display_name: null },
    ],
    grades: [
      { user_id: 201, workspace_id: 'maths', grade: 10 },
      { user_id: 201, workspace_id: 'maths', grade: 12 },
      { user_id: 202, workspace_id: 'english', grade: 'dgnl' },
      { user_id: 204, workspace_id: 'english', grade: 11 },
      { user_id: 205, workspace_id: 'maths', grade: 12 },
    ],
  }
}

describe('bounded reviewed workspace data backfill', () => {
  beforeEach(async () => {
    await resetData()
    await seedSyntheticCurrentData()
  })

  it('backfills only explicit reviewed memberships and content ownership while preserving existing records', async () => {
    const r2Keys = [
      'exercises/301/source.pdf',
      'exercises/301/answer.pdf',
      'exercises/301/questions/q1.webp',
      'exercises/301/answers/q1.webp',
      'submissions/301/sheet.png',
    ]
    const before = await readBackfillState()
    const r2Before = await readR2Bytes(r2Keys)

    await backfillWorkspaces(env.DB, completeManifest())

    await expect(readBackfillState()).resolves.toEqual(withExpectedBackfillChanges(before))
    await expect(readR2Bytes(r2Keys)).resolves.toEqual(r2Before)
  })

  it('uses the reviewed mapping even if the caller mutates input during database reads', async () => {
    const mapping = completeManifest()
    const before = await readBackfillState()
    const dbWithMutatingRead = {
      prepare: (...args) => {
        mapping.users.find((user) => user.id === 101).platform_role = 'platform_admin'
        mapping.exercises.find((exercise) => exercise.id === 301).workspace_id = 'english'
        mapping.lectures.find((lecture) => lecture.id === 401).workspace_id = 'english'
        return env.DB.prepare(...args)
      },
      batch: (statements) => env.DB.batch(statements),
    }

    await backfillWorkspaces(dbWithMutatingRead, mapping)

    const state = await readBackfillState()
    expect(state.users.find((user) => user.id === 101).platform_role).toBe('user')
    expect(state.users.find((user) => user.id === 103).platform_role).toBe('platform_admin')
    expect(state.exercises.find((exercise) => exercise.id === 301).workspace_id).toBe('maths')
    expect(state.lectures.find((lecture) => lecture.id === 401).workspace_id).toBe('maths')
    expect(state).toEqual(withExpectedBackfillChanges(before))
  })

  it('rejects incomplete manifests before mutation', async () => {
    const before = await readBackfillState()
    await expect(backfillWorkspaces(env.DB, completeManifest({
      users: completeManifest().users.filter((user) => user.id !== 205),
    }))).rejects.toThrow(/existing user ids exactly once/i)
    await expect(readBackfillState()).resolves.toEqual(before)
  })

  it('keeps D1 batch atomic if a later statement fails', async () => {
    const before = await readBackfillState()
    const dbWithFailingBatch = {
      prepare: (...args) => env.DB.prepare(...args),
      batch: (statements) => env.DB.batch([
        ...statements,
        env.DB.prepare(`
          insert into workspace_memberships (
            workspace_id, user_id, role, status, access_tier, display_name
          ) values ('maths', 999999, 'student', 'active', 'standard', null)
        `),
      ]),
    }

    await expect(backfillWorkspaces(dbWithFailingBatch, completeManifest())).rejects.toThrow()
    await expect(readBackfillState()).resolves.toEqual(before)
  })

  it('rejects invalid reviewed mappings before mutation', async () => {
    const cases = [
      ['unknown workspace', { exercises: [{ id: 301, workspace_id: 'science' }, { id: 302, workspace_id: 'english' }] }],
      ['duplicate user', { users: [...completeManifest().users, completeManifest().users[0]] }],
      ['missing exercise', { exercises: completeManifest().exercises.filter((exercise) => exercise.id !== 302) }],
      ['missing lecture', { lectures: completeManifest().lectures.filter((lecture) => lecture.id !== 402) }],
      ['duplicate membership', { users: completeManifest().users.map((user) => user.id === 201 ? { ...user, memberships: [...user.memberships, { ...user.memberships[0] }] } : user) }],
      ['active student empty grades', { users: completeManifest().users.map((user) => user.id === 202 ? { ...user, memberships: [{ ...user.memberships[0], grades: [] }] } : user) }],
      ['promoted pending empty student', { users: completeManifest().users.map((user) => user.id === 203 ? { ...user, memberships: [{ ...user.memberships[0], status: 'active', grades: [10] }] } : user) }],
      ['teacher grades', { users: completeManifest().users.map((user) => user.id === 101 ? { ...user, memberships: [{ ...user.memberships[0], grades: [10] }] } : user) }],
      ['lost VIP access', { users: completeManifest().users.map((user) => user.id === 201 ? { ...user, memberships: [{ workspace_id: 'maths', role: 'student', status: 'active', access_tier: 'standard', grades: [10, 12], display_name: null }] } : user) }],
    ]

    const before = await readBackfillState()
    for (const [label, override] of cases) {
      await expect(backfillWorkspaces(env.DB, completeManifest(override)), label).rejects.toThrow()
      await expect(readBackfillState(), label).resolves.toEqual(before)
    }
  })

  it('refuses repeat or unsafe nondefault state instead of resetting migrated access', async () => {
    await backfillWorkspaces(env.DB, completeManifest())
    await expect(backfillWorkspaces(env.DB, completeManifest())).rejects.toThrow(/already populated/i)

    await resetData()
    await seedSyntheticCurrentData()
    await env.DB.prepare("update users set platform_role = 'platform_admin' where id = 101").run()
    await expect(backfillWorkspaces(env.DB, completeManifest())).rejects.toThrow(/nondefault platform/i)
  })
})

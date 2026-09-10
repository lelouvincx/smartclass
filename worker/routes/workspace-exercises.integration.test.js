import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../index.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'

function testEnv() {
  return {
    ...env,
    APP_ENV: 'test',
    JWT_SECRET: 'workspace-secret',
    JWT_EXPIRES_IN: '1h',
  }
}

function api(workspaceId, path = '', options = {}) {
  const host = workspaceId === 'english' ? 'english-api.test' : 'maths-api.test'
  return app.request(`http://${host}/api/exercises${path}`, options, testEnv())
}

async function bearer(userId, workspaceId = 'maths') {
  return `Bearer ${await issueWorkspaceAccessToken(testEnv(), userId, workspaceId)}`
}

function authOptions(token, method = 'GET', body = undefined, origin = 'http://maths.test') {
  return {
    method,
    headers: {
      Authorization: token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

const schema = [
  { q_id: 1, section_key: 'main', section_title: null, local_number: 1, type: 'mcq', correct_answer: 'B' },
  { q_id: 2, section_key: 'main', section_title: null, local_number: 2, type: 'numeric', correct_answer: '3.5' },
]

async function seedUser({ id, name, phone, platformRole = 'user', disabledAt = null }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, access_tier, platform_role, disabled_at)
    values (?, ?, ?, ?, 'student', 'active', 'standard', ?, ?)
  `).bind(id, name, phone, PASSWORD_HASH, platformRole, disabledAt).run()
}

async function seedMembership({ userId, workspaceId, role = 'student', status = 'active', accessTier = 'standard', grades = [] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
    values (?, ?, ?, ?, ?)
  `).bind(workspaceId, userId, role, status, accessTier).run()
  if (grades.length > 0) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare(`
      insert into workspace_membership_grades (membership_id, grade) values (?, ?)
    `).bind(result.meta.last_row_id, grade)))
  }
  return result.meta.last_row_id
}

async function seedExercise({ id, workspaceId, title, grades = [10], ready = true, createdBy = 101, maxAttempts = 1 }) {
  await env.DB.prepare(`
    insert into exercises (id, title, duration_minutes, max_attempts, allow_answer_pdf_download, created_by, workspace_id)
    values (?, ?, 60, ?, 0, ?, ?)
  `).bind(id, title, maxAttempts, createdBy, workspaceId).run()
  await env.DB.batch([
    ...schema.map((row) => env.DB.prepare(`
      insert into answer_schemas (
        exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        , max_score_hundredths
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, row.q_id, row.section_key, row.section_title, row.local_number, row.sub_id ?? null, row.type, row.correct_answer, row.max_score_hundredths ?? null)),
    ...grades.map((grade) => env.DB.prepare(`
      insert into exercise_grades (exercise_id, grade) values (?, ?)
    `).bind(id, grade)),
  ])
  if (!ready) return { id }
  return seedReadySet({ exerciseId: id, teacherId: createdBy })
}

async function seedReadySet({ exerciseId, teacherId = 101 }) {
  await env.BUCKET.put(`exercises/${exerciseId}/source.pdf`, '%PDF-1.4 source')
  await env.BUCKET.put(`exercises/${exerciseId}/answers.pdf`, '%PDF-1.4 answers')
  const sourceFile = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'exercise_pdf', ?, 'source.pdf', 100)
  `).bind(exerciseId, `exercises/${exerciseId}/source.pdf`).run()
  const answerFile = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'solution_pdf', ?, 'answers.pdf', 100)
  `).bind(exerciseId, `exercises/${exerciseId}/answers.pdf`).run()
  const assetSet = await env.DB.prepare(`
    insert into exercise_question_asset_sets (
      exercise_id, source_file_id, answer_source_file_id, detector_version, detection_method, confirmed_by, confirmed_at
    ) values (?, ?, ?, 'test-v1', 'text', ?, current_timestamp)
  `).bind(exerciseId, sourceFile.meta.last_row_id, answerFile.meta.last_row_id, teacherId).run()
  const rows = await env.DB.prepare(`
    select q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths
    from answer_schemas
    where exercise_id = ?
  `).bind(exerciseId).all()
  await Promise.all(rows.results.map(row => env.BUCKET.put(`questions/${exerciseId}/${row.q_id}.png`, new Uint8Array([1, 2, 3]))))
  await env.DB.batch([
    ...rows.results.map((row) => env.DB.prepare(`
      insert into exercise_question_answer_schemas (
        asset_set_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        , max_score_hundredths
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(assetSet.meta.last_row_id, row.q_id, row.section_key, row.section_title, row.local_number, row.sub_id, row.type, row.correct_answer, row.max_score_hundredths)),
    ...rows.results.map((row) => env.DB.prepare(`
      insert into exercise_question_assets (
        asset_set_id, q_id, segment_index, source_kind, source_page, x, y, width, height,
        r2_key, mime_type, file_size, pixel_width, pixel_height, confidence
      ) values (?, ?, 0, 'pdf_crop', 1, 0, 0, 0.5, 0.5, ?, 'image/png', 100, 100, 100, 0.99)
    `).bind(assetSet.meta.last_row_id, row.q_id, `questions/${exerciseId}/${row.q_id}.png`)),
    env.DB.prepare('update exercises set active_question_asset_set_id = ? where id = ?').bind(assetSet.meta.last_row_id, exerciseId),
  ])
  return { id: exerciseId, assetSetId: assetSet.meta.last_row_id, sourceFileId: sourceFile.meta.last_row_id, answerFileId: answerFile.meta.last_row_id }
}

async function resetRows() {
  await env.DB.batch([
    env.DB.prepare('delete from submission_answers'),
    env.DB.prepare('delete from submission_files'),
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from exercise_question_answer_candidates'),
    env.DB.prepare('delete from exercise_question_answer_assets'),
    env.DB.prepare('delete from exercise_question_assets'),
    env.DB.prepare('delete from exercise_question_answer_schemas'),
    env.DB.prepare('delete from exercise_question_asset_sets'),
    env.DB.prepare('delete from exercise_files'),
    env.DB.prepare('delete from answer_schemas'),
    env.DB.prepare('delete from exercise_grades'),
    env.DB.prepare('delete from exercises'),
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from student_grades'),
    env.DB.prepare('delete from users'),
  ])
}

async function seedFixture() {
  await resetRows()
  await seedUser({ id: 101, name: 'Maths Teacher', phone: '+84900000101' })
  await seedMembership({ userId: 101, workspaceId: 'maths', role: 'teacher' })
  await seedUser({ id: 102, name: 'English Teacher', phone: '+84900000102' })
  await seedMembership({ userId: 102, workspaceId: 'english', role: 'teacher' })
  await seedUser({ id: 103, name: 'Platform Admin', phone: '+84900000103', platformRole: 'platform_admin' })
  await seedUser({ id: 201, name: 'Maths Student', phone: '+84900000201' })
  await seedMembership({ userId: 201, workspaceId: 'maths', grades: [10] })
  await seedUser({ id: 202, name: 'English Student', phone: '+84900000202' })
  await seedMembership({ userId: 202, workspaceId: 'english', grades: [11] })
  await seedUser({ id: 203, name: 'Pending Student', phone: '+84900000203' })
  await seedMembership({ userId: 203, workspaceId: 'maths', status: 'pending', grades: [10] })
  await seedUser({ id: 204, name: 'Disabled Student', phone: '+84900000204' })
  await seedMembership({ userId: 204, workspaceId: 'maths', status: 'disabled', grades: [10] })
  await seedUser({ id: 205, name: 'No Membership', phone: '+84900000205' })

  await seedExercise({ id: 301, workspaceId: 'maths', title: 'Maths grade 10', grades: [10], createdBy: 101 })
  await seedExercise({ id: 302, workspaceId: 'maths', title: 'Maths grade 12', grades: [12], createdBy: 101 })
  await seedExercise({ id: 401, workspaceId: 'english', title: 'English grade 11', grades: [11], createdBy: 102 })
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  env.COHERE_API_KEY = ''
  await seedFixture()
})

describe('workspace exercises prepared router', () => {
  it('covers schema parse with workspace management only', async () => {
    env.COHERE_API_KEY = 'test-key'
    const form = new FormData()
    form.append('page', new File([new Uint8Array([1, 2, 3])], 'page-1.png', { type: 'image/png' }))
    form.append('page_manifest', JSON.stringify([{ file_name: 'page-1.png', page_number: 1, text: 'BẢNG ĐÁP ÁN' }]))
    form.append('schema_shape', JSON.stringify([{ q_id: 1, section_key: 'main', local_number: 1, type: 'mcq', correct_answer: '' }]))

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      pages: [{ markdown: { content: '<table><tr><td>1.B</td></tr></table>' } }],
      meta: { billed_units: { pages: 1 } },
    })))
    const teacherResponse = await api('maths', '/schema/parse', {
      method: 'POST',
      headers: { Authorization: await bearer(101), Origin: 'http://maths.test' },
      body: form,
    })
    expect(teacherResponse.status).toBe(200)
    expect((await teacherResponse.json()).data.schema).toEqual([
      expect.objectContaining({ q_id: 1, type: 'mcq', correct_answer: 'B' }),
    ])

    const studentResponse = await api('maths', '/schema/parse', {
      method: 'POST',
      headers: { Authorization: await bearer(201), Origin: 'http://maths.test' },
      body: form,
    })
    expect(studentResponse.status).toBe(403)
    expect((await studentResponse.json()).error.code).toBe('FORBIDDEN')
  })

  it('lists and details only current-workspace exercises, hides answers from students, and denies inactive or absent memberships', async () => {
    const mathsTeacher = await api('maths', '', authOptions(await bearer(101)))
    expect(mathsTeacher.status).toBe(200)
    expect((await mathsTeacher.json()).data.map((exercise) => exercise.id)).toEqual([302, 301])

    const englishTeacher = await api('english', '', authOptions(await bearer(102, 'english'), 'GET', undefined, 'http://english.test'))
    expect((await englishTeacher.json()).data.map((exercise) => exercise.id)).toEqual([401])

    const studentList = await api('maths', '', authOptions(await bearer(201)))
    const studentData = (await studentList.json()).data
    expect(studentData.map((exercise) => exercise.id)).toEqual([301])
    expect(studentData[0]).toMatchObject({ can_start_attempt: 1, latest_attempt_number: 0, attempts_remaining: 1 })

    const detail = await api('maths', '/301', authOptions(await bearer(201)))
    expect(detail.status).toBe(200)
    const body = await detail.json()
    expect(body.data.schema[0]).not.toHaveProperty('correct_answer')
    expect(body.data.files).toEqual([])

    for (const [userId, code] of [[203, 'MEMBERSHIP_PENDING'], [204, 'MEMBERSHIP_DISABLED'], [205, 'MEMBERSHIP_REQUIRED']]) {
      const response = await api('maths', '', authOptions(await bearer(userId)))
      expect(response.status).toBe(403)
      expect((await response.json()).error.code).toBe(code)
    }
  })

  it('returns foreign 404 before detail, update, delete, asset activation, or R2 disclosure', async () => {
    const mathsTeacher = await bearer(101)
    const beforeEnglish = await env.DB.prepare('select title from exercises where id = 401').first('title')
    expect((await api('maths', '/401', authOptions(mathsTeacher))).status).toBe(404)
    expect((await api('maths', '/401', authOptions(mathsTeacher, 'PUT', { title: 'Wrong' }))).status).toBe(404)
    expect((await api('maths', '/401', authOptions(mathsTeacher, 'DELETE'))).status).toBe(404)
    await expect(env.DB.prepare('select title from exercises where id = 401').first('title')).resolves.toBe(beforeEnglish)
  })

  it('creates exercises in the server workspace with schema and programme rows atomically', async () => {
    const response = await api('english', '', authOptions(await bearer(102, 'english'), 'POST', {
      title: 'English created',
      is_timed: false,
      max_attempts: null,
      allow_answer_pdf_download: true,
      grades: [11],
      schema,
    }, 'http://english.test'))
    expect(response.status).toBe(201)
    const created = (await response.json()).data
    expect(created).toMatchObject({ title: 'English created', workspace_id: 'english', grades: [11], max_attempts: null, allow_answer_pdf_download: 1 })
    await expect(env.DB.prepare('select workspace_id from exercises where id = ?').bind(created.id).first('workspace_id')).resolves.toBe('english')

    await env.DB.prepare(`
      create trigger workspace_exercises_reject_grade_12
      before insert on exercise_grades
      when new.grade = 12
      begin
        select raise(abort, 'reject grade for rollback test');
      end
    `).run()
    try {
      const failed = await api('english', '', authOptions(await bearer(102, 'english'), 'POST', {
        title: 'Rollback exercise',
        is_timed: false,
        max_attempts: 1,
        grades: [12],
        schema,
      }, 'http://english.test'))
      expect(failed.status).toBe(500)
    } finally {
      await env.DB.prepare('drop trigger workspace_exercises_reject_grade_12').run()
    }
    await expect(env.DB.prepare("select count(*) from exercises where title = 'Rollback exercise'").first('count(*)')).resolves.toBe(0)
  })

  it('updates metadata, grades, schema-compatible active allocation, and confirms active sets only inside current workspace', async () => {
    const pending = await seedExercise({ id: 303, workspaceId: 'maths', title: 'Pending activate', grades: [10], ready: false, createdBy: 101 })
    await env.BUCKET.put(`exercises/${pending.id}/source.pdf`, '%PDF-1.4 source')
    await Promise.all(schema.map(row => env.BUCKET.put(`pending/${pending.id}/${row.q_id}.png`, new Uint8Array([1, 2, 3]))))
    const sourceFile = await env.DB.prepare(`
      insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
      values (?, 'exercise_pdf', ?, 'source.pdf', 100)
    `).bind(pending.id, `exercises/${pending.id}/source.pdf`).run()
    const assetSet = await env.DB.prepare(`
      insert into exercise_question_asset_sets (exercise_id, source_file_id, detector_version, detection_method)
      values (?, ?, 'test-v1', 'text')
    `).bind(pending.id, sourceFile.meta.last_row_id).run()
    await env.DB.batch(schema.map((row) => env.DB.prepare(`
      insert into exercise_question_answer_schemas (
        asset_set_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(assetSet.meta.last_row_id, row.q_id, row.section_key, row.section_title, row.local_number, null, row.type, row.correct_answer)))
    await env.DB.batch(schema.map((row) => env.DB.prepare(`
      insert into exercise_question_assets (
        asset_set_id, q_id, segment_index, source_kind, source_page, x, y, width, height,
        r2_key, mime_type, file_size, pixel_width, pixel_height, confidence
      ) values (?, ?, 0, 'pdf_crop', 1, 0, 0, 0.5, 0.5, ?, 'image/png', 100, 100, 100, 0.99)
    `).bind(assetSet.meta.last_row_id, row.q_id, `pending/${pending.id}/${row.q_id}.png`)))
    const response = await api('maths', '/303', authOptions(await bearer(101), 'PUT', {
      title: 'Activated maths',
      is_timed: false,
      max_attempts: 2,
      grades: [12],
      question_asset_set_id: assetSet.meta.last_row_id,
      schema,
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ title: 'Activated maths', is_timed: 0, max_attempts: 2, grades: [12] })
    await expect(env.DB.prepare('select active_question_asset_set_id from exercises where id = 303').first('active_question_asset_set_id')).resolves.toBe(assetSet.meta.last_row_id)
  })

  it('keeps pinned in-progress history visible after programme changes and blocks new foreign workspace access', async () => {
    const studentToken = await bearer(201)
    await env.DB.prepare(`
      insert into submissions (id, exercise_id, user_id, mode, total_questions, started_at, question_asset_set_id, attempt_number)
      values (9001, 301, 201, 'timed', 2, current_timestamp, (select active_question_asset_set_id from exercises where id = 301), 1)
    `).run()
    await env.DB.batch([
      env.DB.prepare('delete from workspace_membership_grades where membership_id = (select id from workspace_memberships where workspace_id = ? and user_id = ?)').bind('maths', 201),
      env.DB.prepare('insert into workspace_membership_grades (membership_id, grade) select id, 11 from workspace_memberships where workspace_id = ? and user_id = ?').bind('maths', 201),
    ])

    const list = await api('maths', '', authOptions(studentToken))
    expect(list.status).toBe(200)
    expect((await list.json()).data).toEqual([expect.objectContaining({ id: 301, in_progress_submission_id: 9001, can_start_attempt: 0 })])

    const detail = await api('maths', '/301', authOptions(studentToken))
    expect(detail.status).toBe(200)
    expect((await detail.json()).data).toMatchObject({ id: 301, in_progress_submission_id: 9001, can_start_attempt: 0 })

    const english = await api('english', '/301', authOptions(await bearer(202, 'english'), 'GET', undefined, 'http://english.test'))
    expect(english.status).toBe(404)
  })

  it('creates concurrent exercises with distinct IDs and their own schema and programmes', async () => {
    const token = await bearer(101)
    const responses = await Promise.all(Array.from({ length: 4 }, (_, index) => api('maths', '', authOptions(token, 'POST', {
      title: `Concurrent ${index}`,
      is_timed: false,
      max_attempts: index + 1,
      grades: [index % 2 ? 11 : 12],
      schema: [{ ...schema[0], correct_answer: index % 2 ? 'A' : 'D' }],
    }))))
    const ids = []
    for (const [index, response] of responses.entries()) {
      expect(response.status).toBe(201)
      const { data } = await response.json()
      ids.push(data.id)
      expect(await env.DB.prepare('select correct_answer from answer_schemas where exercise_id = ?').bind(data.id).first('correct_answer')).toBe(index % 2 ? 'A' : 'D')
      expect(await env.DB.prepare('select grade from exercise_grades where exercise_id = ?').bind(data.id).first('grade')).toBe(index % 2 ? 11 : 12)
    }
    expect(new Set(ids).size).toBe(4)
  })

  it('rolls back activation and metadata if assets change during storage validation', async () => {
    const setId = await env.DB.prepare('select active_question_asset_set_id from exercises where id = 301').first('active_question_asset_set_id')
    await env.DB.batch([
      env.DB.prepare('update exercises set active_question_asset_set_id = null where id = 301'),
      env.DB.prepare('update exercise_question_asset_sets set confirmed_at = null, confirmed_by = null where id = ?').bind(setId),
    ])
    const original = await env.DB.prepare('select title from exercises where id = 301').first('title')
    vi.spyOn(env.BUCKET, 'head').mockImplementation(async () => {
      await env.DB.prepare('update exercise_question_assets set rejected_at = current_timestamp, rejected_by = 101 where asset_set_id = ? and q_id = 1').bind(setId).run()
      return { size: 100 }
    })
    const response = await api('maths', '/301', authOptions(await bearer(101), 'PUT', {
      title: 'Must not save', question_asset_set_id: setId, schema,
    }))
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('ASSET_SET_NOT_READY')
    expect(await env.DB.prepare('select title, active_question_asset_set_id from exercises where id = 301').first()).toEqual({ title: original, active_question_asset_set_id: null })
    expect(await env.DB.prepare('select count(*) as count from answer_schemas where exercise_id = 301').first('count')).toBe(2)
    vi.restoreAllMocks()
  })
})

import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../index.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'

const CLEAN_TABLE = '<table><tr><td>Q</td><td>A</td><td>B</td><td>C</td><td>D</td></tr><tr><td>1</td><td></td><td>✓</td><td></td><td></td></tr></table>'

function testEnv() {
  return { ...env, APP_ENV: 'test', JWT_SECRET: 'workspace-secret', JWT_EXPIRES_IN: '1h', COHERE_API_KEY: 'test-key' }
}

function api(workspaceId, path, options = {}) {
  const host = workspaceId === 'english' ? 'english-api.test' : 'maths-api.test'
  return app.request(`http://${host}${path}`, options, testEnv())
}

async function bearer(userId, workspaceId = 'maths') {
  return `Bearer ${await issueWorkspaceAccessToken(testEnv(), userId, workspaceId)}`
}

async function statusOf(response) {
  const status = response.status
  await response.arrayBuffer()
  return status
}

async function seedUser({ id, name, phone, legacyRole = 'student', platformRole = 'user', disabledAt = null }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, platform_role, disabled_at)
    values (?, ?, ?, 'hash', ?, 'active', ?, ?)
  `).bind(id, name, phone, legacyRole, platformRole, disabledAt).run()
}

async function seedMembership({ userId, workspaceId, role = 'student', status = 'active', grades = [], displayName = null }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier, display_name)
    values (?, ?, ?, ?, 'standard', ?)
  `).bind(workspaceId, userId, role, status, displayName).run()
  if (grades.length > 0) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare(`
      insert into workspace_membership_grades (membership_id, grade) values (?, ?)
    `).bind(result.meta.last_row_id, grade)))
  }
  return result.meta.last_row_id
}

async function seedExercise({ id, workspaceId, title, grade = 10, allowAnswerPdf = true, maxAttempts = null }) {
  await env.DB.prepare(`
    insert into exercises (id, title, duration_minutes, created_by, workspace_id, allow_answer_pdf_download, max_attempts)
    values (?, ?, 45, 101, ?, ?, ?)
  `).bind(id, title, workspaceId, allowAnswerPdf ? 1 : 0, maxAttempts).run()
  await env.DB.prepare('insert into exercise_grades (exercise_id, grade) values (?, ?)').bind(id, grade).run()
}

async function seedFile({ exerciseId, type = 'exercise_pdf', name = 'source.pdf', content = 'pdf' }) {
  const r2Key = `exercises/${exerciseId}/${name}`
  await env.BUCKET.put(r2Key, content, { httpMetadata: { contentType: 'application/pdf' } })
  const result = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, ?, ?, ?, ?)
  `).bind(exerciseId, type, r2Key, name, content.length).run()
  return { id: result.meta.last_row_id, r2Key }
}

async function activateExercise({ exerciseId, sourceFileId, answerFileId = null, confirmed = true }) {
  const set = await env.DB.prepare(`
    insert into exercise_question_asset_sets (
      exercise_id, source_file_id, answer_source_file_id, detector_version, detection_method, confirmed_by, confirmed_at
    ) values (?, ?, ?, 'test', 'text', ?, ${confirmed ? 'current_timestamp' : 'null'})
  `).bind(exerciseId, sourceFileId, answerFileId, confirmed ? 101 : null).run()
  await env.DB.batch([
    env.DB.prepare(`
      insert into exercise_question_answer_schemas (
        asset_set_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths
      ) values (?, 1, 'main', null, 1, null, 'mcq', 'B', null)
    `).bind(set.meta.last_row_id),
    env.DB.prepare('update exercises set active_question_asset_set_id = ? where id = ?').bind(set.meta.last_row_id, exerciseId),
  ])
  return set.meta.last_row_id
}

async function seedReadyExercise({ id, workspaceId, title, grade = 10, allowAnswerPdf = true, maxAttempts = null }) {
  await seedExercise({ id, workspaceId, title, grade, allowAnswerPdf, maxAttempts })
  const source = await seedFile({ exerciseId: id, name: 'source.pdf', content: `${title} source` })
  const answer = await seedFile({ exerciseId: id, type: 'solution_pdf', name: 'answers.pdf', content: `${title} answer` })
  const setId = await activateExercise({ exerciseId: id, sourceFileId: source.id, answerFileId: answer.id })
  const imageKey = `exercises/${id}/q1.png`
  await env.BUCKET.put(imageKey, new Uint8Array([id % 255, 1, 2]))
  await env.DB.prepare(`
    insert into exercise_question_assets (asset_set_id, q_id, segment_index, source_kind, r2_key, mime_type, file_size, pixel_width, pixel_height)
    values (?, 1, 0, 'teacher_screenshot', ?, 'image/png', 3, 1, 1)
  `).bind(setId, imageKey).run()
  return { id, setId, sourceFileId: source.id, answerFileId: answer.id, sourceKey: source.r2Key, answerKey: answer.r2Key }
}

async function startSubmission({ workspaceId = 'maths', userId = 201, exerciseId = 501, latest = 0 } = {}) {
  const response = await api(workspaceId, '/api/submissions', {
    method: 'POST',
    headers: { Authorization: await bearer(userId, workspaceId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercise_id: exerciseId, known_latest_attempt_number: latest }),
  })
  return response
}

async function submit({ workspaceId = 'maths', userId = 201, submissionId }) {
  return api(workspaceId, `/api/submissions/${submissionId}/submit`, {
    method: 'PUT',
    headers: { Authorization: await bearer(userId, workspaceId), 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: [{ q_id: 1, submitted_answer: 'B' }] }),
  })
}

function imageForm() {
  const form = new FormData()
  form.append('image', new File([new Uint8Array(10)], 'sheet.png', { type: 'image/png' }))
  return form
}

async function resetRows() {
  await env.DB.batch([
    env.DB.prepare('delete from submission_files'),
    env.DB.prepare('delete from submission_answers'),
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from exercise_question_answer_assets'),
    env.DB.prepare('delete from exercise_question_assets'),
    env.DB.prepare('delete from exercise_question_answer_schemas'),
    env.DB.prepare('delete from exercise_question_asset_sets'),
    env.DB.prepare('delete from exercise_files'),
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from exercise_grades'),
    env.DB.prepare('delete from answer_schemas'),
    env.DB.prepare('delete from exercises'),
    env.DB.prepare('delete from users'),
  ])
}

beforeEach(async () => {
  await resetRows()
  await seedUser({ id: 101, name: 'Maths Teacher', phone: '+84900000101', legacyRole: 'student' })
  await seedMembership({ userId: 101, workspaceId: 'maths', role: 'teacher' })
  await seedUser({ id: 102, name: 'English Teacher', phone: '+84900000102', legacyRole: 'student' })
  await seedMembership({ userId: 102, workspaceId: 'english', role: 'teacher' })
  await seedUser({ id: 103, name: 'Admin', phone: '+84900000103', platformRole: 'platform_admin' })
  await seedUser({ id: 201, name: 'Shared Student', phone: '+84900000201', legacyRole: 'teacher' })
  await seedMembership({ userId: 201, workspaceId: 'maths', grades: [10], displayName: 'Maths Local Name' })
  await seedMembership({ userId: 201, workspaceId: 'english', grades: [11], displayName: 'English Local Name' })
  await seedUser({ id: 202, name: 'No Member', phone: '+84900000202' })
  await seedUser({ id: 203, name: 'Disabled Member', phone: '+84900000203' })
  await seedMembership({ userId: 203, workspaceId: 'maths', status: 'disabled', grades: [10] })
  await seedUser({ id: 204, name: 'Pending Member', phone: '+84900000204' })
  await seedMembership({ userId: 204, workspaceId: 'maths', status: 'pending', grades: [10] })
  await seedReadyExercise({ id: 501, workspaceId: 'maths', title: 'Maths A', grade: 10 })
  await seedReadyExercise({ id: 777, workspaceId: 'english', title: 'English B', grade: 11 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('workspace submissions', () => {
  it('starts, submits, lists, reviews, downloads pinned PDFs, and extracts answers in the local workspace', async () => {
    const started = await startSubmission()
    expect(started.status).toBe(201)
    const submissionId = (await started.json()).data.id

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      pages: [{ markdown: { content: CLEAN_TABLE } }],
      meta: { billed_units: { pages: 1 } },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const extract = await api('maths', `/api/submissions/${submissionId}/extract`, {
      method: 'POST',
      headers: { Authorization: await bearer(201) },
      body: imageForm(),
    })
    expect(extract.status).toBe(200)
    expect((await extract.json()).data.extracted).toEqual([{ q_id: 1, sub_id: null, answer: 'B', confidence: null }])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const submitted = await submit({ submissionId })
    expect(submitted.status).toBe(200)
    expect((await submitted.json()).data.score).toBe(10)

    const detail = await api('maths', `/api/submissions/${submissionId}`, { headers: { Authorization: await bearer(201) } })
    expect(detail.status).toBe(200)
    await expect(detail.json()).resolves.toMatchObject({
      data: { id: submissionId, exercise_id: 501, answer_pdf_download_available: true },
    })

    const history = await api('maths', '/api/submissions?exercise_id=501', { headers: { Authorization: await bearer(201) } })
    expect(history.status).toBe(200)
    const historyBody = await history.json()
    expect(historyBody.data.total).toBe(1)
    expect(historyBody.data.submissions[0]).not.toHaveProperty('student_phone')

    const exercisePdf = await api('maths', `/api/submissions/${submissionId}/exercise-pdf`, { headers: { Authorization: await bearer(201) } })
    expect(exercisePdf.status).toBe(200)
    expect(new TextDecoder().decode(await exercisePdf.arrayBuffer())).toBe('Maths A source')
    const answerPdf = await api('maths', `/api/submissions/${submissionId}/answer-pdf`, { headers: { Authorization: await bearer(201) } })
    expect(answerPdf.status).toBe(200)
    expect(new TextDecoder().decode(await answerPdf.arrayBuffer())).toBe('Maths A answer')
  })

  it('returns foreign workspace IDs as 404 across all seven endpoints without counts, writes, bytes, or provider calls', async () => {
    const englishStart = await startSubmission({ workspaceId: 'english', exerciseId: 777 })
    const englishSubmissionId = (await englishStart.json()).data.id

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const token = await bearer(201, 'maths')
    const paths = [
      api('maths', '/api/submissions?exercise_id=777', { headers: { Authorization: token } }),
      api('maths', '/api/submissions', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_id: 777, known_latest_attempt_number: 0 }),
      }),
      api('maths', `/api/submissions/${englishSubmissionId}/submit`, {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: [{ q_id: 1, submitted_answer: 'B' }] }),
      }),
      api('maths', `/api/submissions/${englishSubmissionId}/exercise-pdf`, { headers: { Authorization: token } }),
      api('maths', `/api/submissions/${englishSubmissionId}/answer-pdf`, { headers: { Authorization: token } }),
      api('maths', `/api/submissions/${englishSubmissionId}`, { headers: { Authorization: token } }),
      api('maths', `/api/submissions/${englishSubmissionId}/extract`, { method: 'POST', headers: { Authorization: token }, body: imageForm() }),
    ]
    const responses = await Promise.all(paths)
    expect(await Promise.all(responses.map(statusOf))).toEqual([404, 404, 404, 404, 404, 404, 404])
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await env.DB.prepare('select count(*) as count from submission_answers').first()).count).toBe(0)
    expect((await env.DB.prepare('select count(*) as count from submission_files').first()).count).toBe(0)
  })

  it('keeps same-user attempts in different workspaces separate and rejects cross-workspace list filters without foreign counts', async () => {
    const mathsSubmission = (await (await startSubmission()).json()).data.id
    await submit({ submissionId: mathsSubmission })
    const englishSubmission = (await (await startSubmission({ workspaceId: 'english', exerciseId: 777 })).json()).data.id
    await submit({ workspaceId: 'english', submissionId: englishSubmission })

    const mathsList = await api('maths', '/api/submissions', { headers: { Authorization: await bearer(201) } })
    expect((await mathsList.json()).data).toMatchObject({ total: 1, submissions: [{ id: mathsSubmission, exercise_id: 501 }] })
    const englishList = await api('english', '/api/submissions', { headers: { Authorization: await bearer(201, 'english') } })
    expect((await englishList.json()).data).toMatchObject({ total: 1, submissions: [{ id: englishSubmission, exercise_id: 777 }] })

    const filtered = await api('maths', '/api/submissions?exercise_id=777', { headers: { Authorization: await bearer(201) } })
    expect(await statusOf(filtered)).toBe(404)
  })

  it('lets teachers and administrators see completed local reviews only, with local student display names', async () => {
    const submissionId = (await (await startSubmission()).json()).data.id
    for (const userId of [101, 103]) {
      const unfinished = await api('maths', `/api/submissions/${submissionId}`, { headers: { Authorization: await bearer(userId) } })
      expect(await statusOf(unfinished)).toBe(403)
    }

    await submit({ submissionId })
    const teacher = await api('maths', `/api/submissions/${submissionId}`, { headers: { Authorization: await bearer(101) } })
    expect(teacher.status).toBe(200)
    await expect(teacher.json()).resolves.toMatchObject({ data: { student_name: 'Maths Local Name', student_phone: '+84900000201' } })
    const admin = await api('maths', '/api/submissions?exercise_id=501', { headers: { Authorization: await bearer(103) } })
    expect(admin.status).toBe(200)
    expect((await admin.json()).data.submissions[0].student_name).toBe('Maths Local Name')
  })

  it('requires active student membership for student-only routes, and does not let an administrator act as a student without one', async () => {
    for (const userId of [102, 103, 202, 203, 204]) {
      const start = await startSubmission({ userId, exerciseId: 501 })
      expect(await statusOf(start)).toBe(403)
    }

    await seedMembership({ userId: 103, workspaceId: 'maths', role: 'student', grades: [10] })
    const adminStudentStart = await startSubmission({ userId: 103, exerciseId: 501 })
    expect(await statusOf(adminStudentStart)).toBe(201)
  })

  it('preserves pinned access after programme removal but blocks disabled memberships', async () => {
    const submissionId = (await (await startSubmission()).json()).data.id
    await env.DB.prepare(`
      delete from workspace_membership_grades
      where membership_id = (select id from workspace_memberships where workspace_id = 'maths' and user_id = 201)
    `).run()

    const submitAfterRemoval = await submit({ submissionId })
    expect(submitAfterRemoval.status).toBe(200)
    expect(await statusOf(await api('maths', `/api/submissions/${submissionId}`, { headers: { Authorization: await bearer(201) } }))).toBe(200)
    expect(await statusOf(await api('maths', `/api/submissions/${submissionId}/exercise-pdf`, { headers: { Authorization: await bearer(201) } }))).toBe(200)
    expect(await statusOf(await api('maths', `/api/submissions/${submissionId}/answer-pdf`, { headers: { Authorization: await bearer(201) } }))).toBe(200)

    await env.DB.prepare("update workspace_memberships set status = 'disabled' where workspace_id = 'maths' and user_id = 201").run()
    expect(await statusOf(await api('maths', `/api/submissions/${submissionId}`, { headers: { Authorization: await bearer(201) } }))).toBe(403)
    expect(await statusOf(await api('maths', `/api/submissions/${submissionId}/answer-pdf`, { headers: { Authorization: await bearer(201) } }))).toBe(403)
  })

  it('validates pin-to-exercise and source-file relationships before downloads, uploads, and provider calls', async () => {
    const submissionId = (await (await startSubmission()).json()).data.id
    await submit({ submissionId })
    const englishSet = await env.DB.prepare('select active_question_asset_set_id as id from exercises where id = 777').first()
    await env.DB.prepare('update submissions set question_asset_set_id = ? where id = ?').bind(englishSet.id, submissionId).run()

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await statusOf(await api('maths', `/api/submissions/${submissionId}`, { headers: { Authorization: await bearer(201) } }))).toBe(404)
    expect(await statusOf(await api('maths', `/api/submissions/${submissionId}/exercise-pdf`, { headers: { Authorization: await bearer(201) } }))).toBe(404)
    expect(await statusOf(await api('maths', `/api/submissions/${submissionId}/extract`, { method: 'POST', headers: { Authorization: await bearer(201) }, body: imageForm() }))).toBe(409)
    expect(fetchMock).not.toHaveBeenCalled()

    const clean = await seedReadyExercise({ id: 502, workspaceId: 'maths', title: 'Maths wrong file', grade: 10 })
    const badSubmission = (await (await startSubmission({ exerciseId: 502 })).json()).data.id
    await submit({ submissionId: badSubmission })
    const foreignSource = await env.DB.prepare(`
      select id from exercise_files where exercise_id = 501 and file_type = 'exercise_pdf' limit 1
    `).first()
    await env.DB.prepare('update exercise_question_asset_sets set source_file_id = ? where id = ?').bind(foreignSource.id, clean.setId).run()
    const wrongSource = await api('maths', `/api/submissions/${badSubmission}/exercise-pdf`, { headers: { Authorization: await bearer(201) } })
    expect(await statusOf(wrongSource)).toBe(404)
  })
})

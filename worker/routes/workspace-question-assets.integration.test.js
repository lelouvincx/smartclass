import { env } from 'cloudflare:test'
import { describe, expect, it, beforeEach } from 'vitest'
import app from '../index.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'
const WEBP_BYTES = Uint8Array.from(atob('UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoDAAIAAUAmJZQCdAFAAAD+/DeBV/fU6D4r4AAA'), c => c.charCodeAt(0))
const PNG_BYTES = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGPgEpGDIAY4CwANrAFp+FF+3AAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))

let mathsTeacherToken
let englishTeacherToken
let adminMathsToken
let mathsStudentToken

function requestEnv() {
  return { ...env, APP_ENV: 'test', JWT_SECRET: 'test-secret-key-for-integration-tests', JWT_EXPIRES_IN: '1h' }
}

async function bearer(userId, workspaceId) {
  return `Bearer ${await issueWorkspaceAccessToken(requestEnv(), userId, workspaceId)}`
}

function api(workspaceId, path, init = {}) {
  const origin = workspaceId === 'english' ? 'http://english-api.test' : 'http://maths-api.test'
  const frontend = workspaceId === 'english' ? 'http://english.test' : 'http://maths.test'
  return app.request(`${origin}${path}`, {
    ...init,
    headers: { Origin: frontend, ...(init.headers || {}) },
  }, requestEnv())
}

function auth(token, headers = {}) {
  return { Authorization: token, ...headers }
}

async function seedUser(id, name, phone, { platformRole = 'user', legacyRole = 'student' } = {}) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, platform_role)
    values (?, ?, ?, ?, ?, 'active', ?)
  `).bind(id, name, phone, PASSWORD_HASH, legacyRole, platformRole).run()
}

async function seedMembership(userId, workspaceId, role) {
  await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
    values (?, ?, ?, 'active', 'standard')
  `).bind(workspaceId, userId, role).run()
}

async function seedExercise(id, workspaceId, createdBy) {
  await env.DB.prepare(`
    insert into exercises (id, title, duration_minutes, created_by, workspace_id)
    values (?, ?, 60, ?, ?)
  `).bind(id, `${workspaceId} exercise ${id}`, createdBy, workspaceId).run()
  await env.DB.batch([
    env.DB.prepare(`
      insert into answer_schemas (
        exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
      ) values (?, 1, 'main', null, 1, null, 'mcq', 'B')
    `).bind(id),
    env.DB.prepare(`
      insert into answer_schemas (
        exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
      ) values (?, 2, 'main', null, 2, null, 'numeric', '42')
    `).bind(id),
  ])
}

async function seedFile(exerciseId, type, suffix) {
  const key = `exercises/${exerciseId}/${suffix}.pdf`
  await env.BUCKET.put(key, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'application/pdf' } })
  const result = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, ?, ?, ?, 3)
  `).bind(exerciseId, type, key, `${suffix}.pdf`).run()
  return result.meta.last_row_id
}

async function createSet(exerciseId, sourceFileId, token = mathsTeacherToken, overrides = {}) {
  return api('maths', `/api/exercises/${exerciseId}/question-asset-sets`, {
    method: 'POST',
    headers: auth(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      source_file_id: sourceFileId,
      detector_version: 'detector-v1',
      detection_method: 'text',
      ...overrides,
    }),
  })
}

async function createSetData(exerciseId, sourceFileId, overrides = {}) {
  const res = await createSet(exerciseId, sourceFileId, mathsTeacherToken, overrides)
  expect(res.status).toBe(201)
  return (await res.json()).data
}

function generatedForm(overrides = {}) {
  const values = {
    q_id: 1,
    segment_index: 0,
    source_page: 1,
    x: 0.1,
    y: 0.1,
    width: 0.5,
    height: 0.5,
    pixel_width: 3,
    pixel_height: 2,
    accessible_text: 'Question text',
    confidence: 0.9,
    ...overrides,
  }
  const form = new FormData()
  form.append('image', new File([WEBP_BYTES], 'q.webp', { type: 'image/webp' }))
  for (const [key, value] of Object.entries(values)) form.append(key, String(value))
  return form
}

function screenshotForm() {
  const form = new FormData()
  form.append('image', new File([PNG_BYTES], 'q.png', { type: 'image/png' }))
  form.append('pixel_width', '3')
  form.append('pixel_height', '2')
  return form
}

function retryForm() {
  const form = new FormData()
  form.append('image_0', new File([WEBP_BYTES], 'q.webp', { type: 'image/webp' }))
  form.append('segments', JSON.stringify([{
    segment_index: 0,
    source_page: 1,
    x: 0.1,
    y: 0.1,
    width: 0.5,
    height: 0.5,
    pixel_width: 3,
    pixel_height: 2,
    confidence: 0.9,
  }]))
  return form
}

function candidate(answerFileId) {
  return {
    q_id: 1,
    type: 'mcq',
    proposed_answer: 'b',
    source_kind: 'answer_pdf_text',
    source_file_id: answerFileId,
    confidence: null,
  }
}

async function storedObjectExists(r2Key) {
  const object = await env.BUCKET.get(r2Key)
  if (!object) return false
  await object.arrayBuffer()
  return true
}

async function seedReadyMathsSet() {
  const source = await seedFile(101, 'exercise_pdf', `source-${crypto.randomUUID()}`)
  const answer = await seedFile(101, 'solution_pdf', `answer-${crypto.randomUUID()}`)
  const set = await createSetData(101, source, { answer_source_file_id: answer, answer_parser_status: 'parsed' })
  const uploaded = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/assets`, {
    method: 'POST',
    headers: auth(mathsTeacherToken),
    body: generatedForm(),
  })
  expect(uploaded.status).toBe(201)
  return { set, source, answer, asset: (await uploaded.json()).data }
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('delete from submission_answers'),
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from exercise_question_answer_assets'),
    env.DB.prepare('delete from exercise_question_answer_candidates'),
    env.DB.prepare('delete from exercise_question_assets'),
    env.DB.prepare('delete from exercise_question_answer_schemas'),
    env.DB.prepare('delete from exercise_question_asset_sets'),
    env.DB.prepare('update exercises set active_question_asset_set_id = null'),
    env.DB.prepare('delete from answer_schemas'),
    env.DB.prepare('delete from exercise_files'),
    env.DB.prepare('delete from exercises'),
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from users'),
  ])

  await seedUser(11, 'Maths teacher', '+84900000011', { legacyRole: 'student' })
  await seedMembership(11, 'maths', 'teacher')
  await seedUser(12, 'English teacher', '+84900000012')
  await seedMembership(12, 'english', 'teacher')
  await seedUser(13, 'Admin', '+84900000013', { platformRole: 'platform_admin' })
  await seedUser(14, 'Maths student', '+84900000014')
  await seedMembership(14, 'maths', 'student')

  mathsTeacherToken = await bearer(11, 'maths')
  englishTeacherToken = await bearer(12, 'english')
  adminMathsToken = await bearer(13, 'maths')
  mathsStudentToken = await bearer(14, 'maths')

  await seedExercise(101, 'maths', 11)
  await seedExercise(102, 'maths', 11)
  await seedExercise(201, 'english', 12)
})

describe('workspace question asset management routes', () => {
  it('allows current-workspace teachers and platform admins to manage all question asset endpoints', async () => {
    const source = await seedFile(101, 'exercise_pdf', 'source-ok')
    const answer = await seedFile(101, 'solution_pdf', 'answer-ok')
    const created = await createSet(101, source, mathsTeacherToken, {
      answer_source_file_id: answer,
      answer_parser_status: 'parsed',
    })
    expect(created.status).toBe(201)
    const set = (await created.json()).data
    expect(set.id).toBeGreaterThan(0)
    expect(set.exercise_id).toBe(101)

    const candidates = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/answer-candidates`, {
      method: 'POST',
      headers: auth(mathsTeacherToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ candidates: [candidate(answer)] }),
    })
    expect(candidates.status).toBe(201)
    expect((await candidates.json()).data[0]).toMatchObject({ proposed_answer: 'B', source_file_id: answer })

    const upload = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/assets`, {
      method: 'POST',
      headers: auth(mathsTeacherToken),
      body: generatedForm(),
    })
    expect(upload.status).toBe(201)
    const uploadedAsset = (await upload.json()).data
    const uploadedRow = await env.DB.prepare('select r2_key from exercise_question_assets where id = ?').bind(uploadedAsset.id).first()
    expect(await storedObjectExists(uploadedRow.r2_key)).toBe(true)

    const get = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}`, {
      headers: auth(mathsTeacherToken),
    })
    expect(get.status).toBe(200)
    expect((await get.json()).data).toMatchObject({
      asset_set: { id: set.id, exercise_id: 101 },
      assets: [expect.objectContaining({ file_url: expect.stringMatching(/^\/api\/question-assets\/\d+$/) })],
      answer_candidates: [expect.objectContaining({ source_file_id: answer })],
    })

    const reject = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/1/reject`, {
      method: 'POST',
      headers: auth(mathsTeacherToken),
    })
    expect(reject.status).toBe(200)

    const retry = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/1/assets`, {
      method: 'PUT',
      headers: auth(mathsTeacherToken),
      body: retryForm(),
    })
    expect(retry.status).toBe(200)
    expect(await storedObjectExists(uploadedRow.r2_key)).toBe(false)

    const screenshot = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/2/screenshot`, {
      method: 'PUT',
      headers: auth(mathsTeacherToken),
      body: screenshotForm(),
    })
    expect(screenshot.status).toBe(200)
    expect((await screenshot.json()).data).toMatchObject({ q_id: 2, source_kind: 'teacher_screenshot' })

    const answerScreenshot = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/2/answer-screenshot`, {
      method: 'PUT',
      headers: auth(mathsTeacherToken),
      body: screenshotForm(),
    })
    expect(answerScreenshot.status).toBe(200)
    const answerAsset = (await answerScreenshot.json()).data
    expect(answerAsset.file_url).toMatch(/^\/api\/question-assets\/answer\/\d+$/)

    const adminSource = await seedFile(102, 'exercise_pdf', 'admin-source')
    const adminCreated = await createSet(102, adminSource, adminMathsToken)
    expect(adminCreated.status).toBe(201)

    const deletableSource = await seedFile(102, 'exercise_pdf', 'delete-source')
    const deletable = await createSetData(102, deletableSource)
    const deleteUpload = await api('maths', `/api/exercises/102/question-asset-sets/${deletable.id}/assets`, {
      method: 'POST',
      headers: auth(mathsTeacherToken),
      body: generatedForm(),
    })
    expect(deleteUpload.status).toBe(201)
    const deleteKey = (await env.DB.prepare(
      'select r2_key from exercise_question_assets where asset_set_id = ?'
    ).bind(deletable.id).first()).r2_key
    const deleted = await api('maths', `/api/exercises/102/question-asset-sets/${deletable.id}`, {
      method: 'DELETE',
      headers: auth(mathsTeacherToken),
    })
    expect(deleted.status).toBe(200)
    expect(await storedObjectExists(deleteKey)).toBe(false)
  })

  it('denies students on every endpoint with otherwise valid request payloads', async () => {
    const { set, answer } = await seedReadyMathsSet()
    await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/1/reject`, {
      method: 'POST',
      headers: auth(mathsTeacherToken),
    })
    const source = await seedFile(102, 'exercise_pdf', 'student-create-source')
    const cases = [
      createSet(102, source, mathsStudentToken),
      api('maths', `/api/exercises/101/question-asset-sets/${set.id}/answer-candidates`, {
        method: 'POST', headers: auth(mathsStudentToken, { 'Content-Type': 'application/json' }), body: JSON.stringify({ candidates: [candidate(answer)] }),
      }),
      api('maths', `/api/exercises/101/question-asset-sets/${set.id}/assets`, { method: 'POST', headers: auth(mathsStudentToken), body: generatedForm({ q_id: 2 }) }),
      api('maths', `/api/exercises/101/question-asset-sets/${set.id}`, { headers: auth(mathsStudentToken) }),
      api('maths', `/api/exercises/101/question-asset-sets/${set.id}`, { method: 'DELETE', headers: auth(mathsStudentToken) }),
      api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/1/reject`, { method: 'POST', headers: auth(mathsStudentToken) }),
      api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/1/assets`, { method: 'PUT', headers: auth(mathsStudentToken), body: retryForm() }),
      api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/2/screenshot`, { method: 'PUT', headers: auth(mathsStudentToken), body: screenshotForm() }),
      api('maths', `/api/exercises/101/question-asset-sets/${set.id}/questions/2/answer-screenshot`, { method: 'PUT', headers: auth(mathsStudentToken), body: screenshotForm() }),
    ]
    for (const response of await Promise.all(cases)) {
      expect(response.status).toBe(403)
    }
  })

  it('returns 404 for foreign exercises or sets before D1 mutation, R2 change, provider work, or reads', async () => {
    const { set, answer } = await seedReadyMathsSet()
    const beforeRows = await env.DB.prepare('select count(*) as count from exercise_question_assets').first()
    expect(await storedObjectExists(`exercise-question-assets/101/${set.id}/foreign.webp`)).toBe(false)

    const foreignSource = await seedFile(101, 'exercise_pdf', 'foreign-valid-source')
    const responses = await Promise.all([
      api('english', '/api/exercises/101/question-asset-sets', {
        method: 'POST', headers: auth(englishTeacherToken, { 'Content-Type': 'application/json' }), body: JSON.stringify({ source_file_id: foreignSource, detector_version: 'detector-v1', detection_method: 'text' }),
      }),
      api('english', `/api/exercises/101/question-asset-sets/${set.id}/answer-candidates`, {
        method: 'POST', headers: auth(englishTeacherToken, { 'Content-Type': 'application/json' }), body: JSON.stringify({ candidates: [candidate(answer)] }),
      }),
      api('english', `/api/exercises/101/question-asset-sets/${set.id}/assets`, { method: 'POST', headers: auth(englishTeacherToken), body: generatedForm({ q_id: 2 }) }),
      api('english', `/api/exercises/101/question-asset-sets/${set.id}`, { headers: auth(englishTeacherToken) }),
      api('english', `/api/exercises/101/question-asset-sets/${set.id}`, { method: 'DELETE', headers: auth(englishTeacherToken) }),
      api('english', `/api/exercises/101/question-asset-sets/${set.id}/questions/1/reject`, { method: 'POST', headers: auth(englishTeacherToken) }),
      api('english', `/api/exercises/101/question-asset-sets/${set.id}/questions/1/assets`, { method: 'PUT', headers: auth(englishTeacherToken), body: retryForm() }),
      api('english', `/api/exercises/101/question-asset-sets/${set.id}/questions/2/screenshot`, { method: 'PUT', headers: auth(englishTeacherToken), body: screenshotForm() }),
      api('english', `/api/exercises/101/question-asset-sets/${set.id}/questions/2/answer-screenshot`, { method: 'PUT', headers: auth(englishTeacherToken), body: screenshotForm() }),
    ])

    for (const response of responses) expect(response.status).toBe(404)
    expect(await env.DB.prepare('select count(*) as count from exercise_question_assets').first()).toEqual(beforeRows)
    const mathsSet = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}`, { headers: auth(mathsTeacherToken) })
    expect(mathsSet.status).toBe(200)
  })

  it('rejects mixed exercise source files, answer files, candidate files, and exercise/set ID pairs', async () => {
    const source101 = await seedFile(101, 'exercise_pdf', 'source-101')
    const source102 = await seedFile(102, 'exercise_pdf', 'source-102')
    const answer101 = await seedFile(101, 'solution_pdf', 'answer-101')
    const answer102 = await seedFile(102, 'solution_pdf', 'answer-102')

    const wrongSource = await createSet(101, source102)
    expect(wrongSource.status).toBe(400)
    expect((await wrongSource.json()).error.code).toBe('INVALID_SOURCE_FILE')

    const wrongAnswer = await createSet(101, source101, mathsTeacherToken, {
      answer_source_file_id: answer102,
      answer_parser_status: 'parsed',
    })
    expect(wrongAnswer.status).toBe(400)
    expect((await wrongAnswer.json()).error.code).toBe('INVALID_ANSWER_SOURCE_FILE')

    const set = await createSetData(101, source101, { answer_source_file_id: answer101, answer_parser_status: 'parsed' })
    const wrongCandidate = await api('maths', `/api/exercises/101/question-asset-sets/${set.id}/answer-candidates`, {
      method: 'POST',
      headers: auth(mathsTeacherToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ candidates: [candidate(answer102)] }),
    })
    expect(wrongCandidate.status).toBe(400)
    expect((await wrongCandidate.json()).error.code).toBe('INVALID_ANSWER_CANDIDATE')

    const wrongPair = await api('maths', `/api/exercises/102/question-asset-sets/${set.id}`, {
      headers: auth(mathsTeacherToken),
    })
    expect(wrongPair.status).toBe(404)
  })

  it('rolls back set creation when there is no answer schema to pin', async () => {
    const source = await seedFile(101, 'exercise_pdf', 'empty-schema')
    await env.DB.prepare('delete from answer_schemas where exercise_id = 101').run()
    const response = await createSet(101, source)
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe('SCHEMA_PIN_FAILED')
    expect(await env.DB.prepare('select count(*) as count from exercise_question_asset_sets where exercise_id = 101').first()).toEqual({ count: 0 })
  })

  it('pins every schema row to its own set during concurrent creation', async () => {
    const source101 = await seedFile(101, 'exercise_pdf', 'concurrent-101')
    const source102 = await seedFile(102, 'exercise_pdf', 'concurrent-102')
    await env.DB.prepare("update answer_schemas set correct_answer = 'A' where exercise_id = 102 and q_id = 1").run()
    const responses = await Promise.all([createSet(101, source101), createSet(102, source102)])
    const sets = []
    for (const response of responses) {
      expect(response.status).toBe(201)
      sets.push((await response.json()).data)
    }
    expect(sets[0].id).not.toBe(sets[1].id)
    for (const [index, set] of sets.entries()) {
      const rows = await env.DB.prepare('select q_id, correct_answer from exercise_question_answer_schemas where asset_set_id = ? order by q_id').bind(set.id).all()
      expect(rows.results).toEqual([{ q_id: 1, correct_answer: index === 0 ? 'B' : 'A' }, { q_id: 2, correct_answer: '42' }])
    }
  })
})

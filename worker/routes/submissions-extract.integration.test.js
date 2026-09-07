import { env } from 'cloudflare:test'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../index.js'
import {
  createStudentReadyExercise,
  loginAsStudent,
  loginAsTeacher,
  seedStudent,
  seedTeacher,
} from '../test/helpers.js'

let teacherToken
let studentToken

const CLEAN_TABLES = [
  '<table><tr><td>Q</td><td>A</td><td>B</td><td>C</td><td>D</td></tr><tr><td>1</td><td></td><td>✓</td><td></td><td></td></tr></table>',
  '<table><tr><td>Câu</td><td>Ý</td><td>Đúng / Sai</td></tr><tr><td>2</td><td>a</td><td>Đ</td></tr><tr><td>2</td><td>b</td><td>S</td></tr><tr><td>2</td><td>c</td><td>S</td></tr><tr><td>2</td><td>d</td><td>Đ</td></tr></table>',
].join('\n')

beforeAll(async () => {
  await seedTeacher()
  await seedStudent()
  teacherToken = await loginAsTeacher()
  studentToken = await loginAsStudent()
})

beforeEach(() => {
  env.COHERE_API_KEY = 'test-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mockCohere(markdown = CLEAN_TABLES, status = 200) {
  const spy = vi.fn(async () => new Response(JSON.stringify(status === 200 ? {
    pages: [{ markdown: { content: markdown } }],
    meta: { billed_units: { pages: 1 } },
  } : { private_provider_body: 'must not be logged' }), { status }))
  vi.stubGlobal('fetch', spy)
  return spy
}

function imageForm({ mime = 'image/png', name = 'sheet.png', size = 256, model } = {}) {
  const form = new FormData()
  form.append('image', new File([new Uint8Array(size)], name, { type: mime }))
  if (model) form.append('model', model)
  return form
}

async function startSubmission() {
  const exercise = await createStudentReadyExercise(teacherToken)
  const response = await app.request('/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ exercise_id: exercise.id, known_latest_attempt_number: 0 }),
  }, env)
  return (await response.json()).data.id
}

function extract(submissionId, form = imageForm(), token = studentToken) {
  return app.request(`/api/submissions/${submissionId}/extract`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  }, env)
}

describe('POST /api/submissions/:id/extract with Cohere', () => {
  it('maps HTML tables in pinned order, persists R2 metadata, and ignores model', async () => {
    const fetchMock = mockCohere()
    const submissionId = await startSubmission()
    const response = await extract(submissionId, imageForm({ model: 'student-selected-model' }))

    expect(response.status).toBe(200)
    const data = (await response.json()).data
    expect(data.model_used).toBe('parse-v5.0')
    expect(data.warnings).toEqual([])
    expect(data.extracted).toEqual([
      { q_id: 1, sub_id: null, answer: 'B', confidence: null },
      { q_id: 2, sub_id: 'a', answer: '1', confidence: null },
      { q_id: 2, sub_id: 'b', answer: '0', confidence: null },
      { q_id: 2, sub_id: 'c', answer: '0', confidence: null },
      { q_id: 2, sub_id: 'd', answer: '1', confidence: null },
    ])
    const row = await env.DB.prepare('select * from submission_files where id = ?')
      .bind(data.file_id).first()
    expect(row).toMatchObject({ submission_id: submissionId, file_type: 'answer_sheet', file_name: 'sheet.png', file_size: 256 })
    const storedImage = await env.BUCKET.get(row.r2_key)
    expect(storedImage).not.toBeNull()
    expect((await storedImage.arrayBuffer()).byteLength).toBe(256)

    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.cohere.com/v2/parse')
    const requestBody = JSON.parse(request.body)
    expect(requestBody.model).toBe('parse-v5.0')
    expect(requestBody).not.toHaveProperty('expected_schema')
    expect(requestBody.document.image_url).toMatch(/^data:image\/png;base64,/)
  })

  it.each([
    ['malformed prose', 'not a table'],
    ['perspective table', '<table><tr><td>broken</td><td>shape</td></tr></table>'],
    ['unknown and duplicate cells', '<table><tr><td>Câu</td><td>Answer</td></tr><tr><td>99</td><td>4</td></tr><tr><td>99</td><td>5</td></tr></table>'],
  ])('returns complete null answers for %s', async (_name, markdown) => {
    mockCohere(markdown)
    const response = await extract(await startSubmission())
    expect(response.status).toBe(200)
    const data = (await response.json()).data
    expect(data.extracted).toHaveLength(5)
    expect(data.extracted.every(row => row.answer === null && row.confidence === null)).toBe(true)
    expect(data.warnings).toHaveLength(1)
  })

  it('preserves the upload record and logs no provider body when Cohere fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCohere('', 503)
    const submissionId = await startSubmission()
    const before = await env.DB.prepare('select count(*) count from submission_files where submission_id = ?').bind(submissionId).first()
    const response = await extract(submissionId)

    expect(response.status).toBe(502)
    expect((await response.json()).error.code).toBe('EXTRACTION_FAILED')
    const after = await env.DB.prepare('select count(*) count from submission_files where submission_id = ?').bind(submissionId).first()
    expect(after.count).toBe(before.count + 1)
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('private_provider_body')
  })

  it('enforces authentication, ownership, and in-progress state', async () => {
    const submissionId = await startSubmission()
    expect((await extract(submissionId, imageForm(), '')).status).toBe(401)

    await seedStudent('+84900000082', 'Other Student')
    const otherToken = await loginAsStudent('+84900000082')
    expect((await extract(submissionId, imageForm(), otherToken)).status).toBe(403)
    expect((await extract(999999)).status).toBe(404)

    await env.DB.prepare('update submissions set submitted_at = current_timestamp where id = ?').bind(submissionId).run()
    expect((await extract(submissionId)).status).toBe(409)
  })

  it('validates image presence, media type, and 20 MiB limit before Cohere', async () => {
    const submissionId = await startSubmission()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await extract(submissionId, new FormData())).status).toBe(400)
    expect((await extract(submissionId, imageForm({ mime: 'text/plain' }))).status).toBe(415)
    expect((await extract(submissionId, imageForm({ size: 20 * 1024 * 1024 + 1 }))).status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import app from '../index.js'
import { seedTeacher, loginAsTeacher, seedStudent, loginAsStudent, createExercise } from '../test/helpers.js'
import { DEFAULT_EXTRACT_MODEL, EXTRACT_MODELS } from '../lib/extract-models.js'

let teacherToken
let studentToken

beforeAll(async () => {
  await seedTeacher()
  await seedStudent()
  teacherToken = await loginAsTeacher()
  studentToken = await loginAsStudent()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Default LLM payload that maps the helper exercise schema:
 *   q_id=1 (mcq, B) + q_id=2 boolean (a=1,b=0,c=0,d=1)
 */
const DEFAULT_LLM_ANSWERS = {
  answers: [
    { q_id: 1, answer: 'B', confidence: 0.9 },
    { q_id: 2, sub_id: 'a', answer: '1', confidence: 0.85 },
    { q_id: 2, sub_id: 'b', answer: '0', confidence: 0.85 },
    { q_id: 2, sub_id: 'c', answer: '0', confidence: 0.85 },
    { q_id: 2, sub_id: 'd', answer: '1', confidence: 0.85 },
  ],
}

/**
 * Stub global fetch so any OpenRouter call from the worker returns `payload`
 * (object → JSON.stringify'd into the chat completion content) or `raw`
 * (raw string for content). When `status` is given (≥ 400), errors out.
 *
 * Returns the spy so tests can introspect calls.
 */
function mockOpenRouter({ payload, raw, status = 200, errorMessage } = {}) {
  const content = raw ?? JSON.stringify(payload ?? DEFAULT_LLM_ANSWERS)
  const spy = vi.fn(async () => {
    if (status >= 400) {
      return new Response(JSON.stringify({ error: { message: errorMessage || 'Upstream failed' } }), { status })
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200 })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

/**
 * Create an in-progress submission for the given exercise as the student.
 */
async function startSubmission(exerciseId, token = studentToken) {
  const res = await app.request('/api/submissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ exercise_id: exerciseId }),
  }, env)
  const body = await res.json()
  return body.data.id
}

/**
 * Build a multipart FormData body with a fake image file.
 */
function buildExtractForm({ filename = 'sheet.png', mime = 'image/png', size = 256, extra = {} } = {}) {
  const bytes = new Uint8Array(size).fill(0xab)
  const blob = new Blob([bytes], { type: mime })
  const form = new FormData()
  form.append('image', new File([blob], filename, { type: mime }))
  for (const [k, v] of Object.entries(extra)) {
    form.append(k, v)
  }
  return form
}

async function postExtract(submissionId, form, token = studentToken, extraHeaders = {}) {
  return app.request(`/api/submissions/${submissionId}/extract`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...extraHeaders,
    },
    body: form,
  }, env)
}

beforeEach(() => {
  // Tests rely on the LLM call going through; ensure a key is present.
  env.OPENROUTER_API_KEY = 'test-key'
})

describe('POST /api/submissions/:id/extract', () => {
  describe('happy path', () => {
    it('uploads image, persists submission_files row, returns extracted answers', async () => {
      mockOpenRouter()

      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toMatchObject({
        file_id: expect.any(Number),
        model_used: DEFAULT_EXTRACT_MODEL,
        warnings: expect.any(Array),
      })

      // Extracted matches the schema shape (1 mcq + 4 boolean rows = 5 entries)
      expect(body.data.extracted).toHaveLength(5)
      const mcq = body.data.extracted.find((a) => a.q_id === 1 && a.sub_id === null)
      expect(mcq).toMatchObject({ q_id: 1, sub_id: null, answer: 'B' })
      expect(mcq.confidence).toBeGreaterThan(0)

      const boolA = body.data.extracted.find((a) => a.q_id === 2 && a.sub_id === 'a')
      expect(boolA).toMatchObject({ q_id: 2, sub_id: 'a', answer: '1' })

      // File row exists in DB and is linked to this submission
      const row = await env.DB.prepare(
        'SELECT submission_id, file_type, r2_key, file_name, file_size FROM submission_files WHERE id = ?'
      ).bind(body.data.file_id).first()
      expect(row).toMatchObject({
        submission_id: submissionId,
        file_type: 'answer_sheet',
        file_name: 'sheet.png',
      })
      expect(row.r2_key).toMatch(new RegExp(`^submissions/${submissionId}/\\d+-sheet\\.png$`))

      // R2 object is actually present
      const obj = await env.BUCKET.get(row.r2_key)
      expect(obj).not.toBeNull()
      const arrBuf = await obj.arrayBuffer()
      expect(arrBuf.byteLength).toBe(256)
    })

    it("passes the exercise's teacher-configured extract_model to OpenRouter", async () => {
      const altModel = EXTRACT_MODELS.find((m) => m.id !== DEFAULT_EXTRACT_MODEL)
      const spy = mockOpenRouter()

      const { id: exerciseId } = await createExercise(teacherToken, { extract_model: altModel.id })
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(200)

      // Inspect the OpenRouter call body
      const [, init] = spy.mock.calls.find(([url]) => String(url).includes('openrouter.ai'))
      const body = JSON.parse(init.body)
      expect(body.model).toBe(altModel.id)

      // Vision message format: image_url with data: URI
      const userMsg = body.messages[0]
      expect(Array.isArray(userMsg.content)).toBe(true)
      const imagePart = userMsg.content.find((p) => p.type === 'image_url')
      expect(imagePart).toBeDefined()
      expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/)
    })

    it('drops out-of-schema rows from the LLM response with a warning', async () => {
      mockOpenRouter({
        payload: {
          answers: [
            { q_id: 1, answer: 'A', confidence: 0.9 },
            { q_id: 99, answer: 'C', confidence: 0.9 }, // not in schema
          ],
        },
      })

      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.extracted.find((a) => a.q_id === 99)).toBeUndefined()
      expect(body.data.warnings.some((w) => w.includes('Q99'))).toBe(true)
    })
  })

  describe('auth + ownership', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await app.request(`/api/submissions/${submissionId}/extract`, {
        method: 'POST',
        body: buildExtractForm(),
      }, env)
      expect(res.status).toBe(401)
    })

    it('returns 404 for unknown submission id', async () => {
      const res = await postExtract(999999, buildExtractForm())
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('NOT_FOUND')
    })

    it('returns 403 when caller is not the submission owner', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      await seedStudent('+84111222333')
      const otherToken = await loginAsStudent('+84111222333')

      const res = await postExtract(submissionId, buildExtractForm(), otherToken)
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })
  })

  describe('submission state', () => {
    it('returns 409 when submission is already submitted', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      // Submit the submission
      await app.request(`/api/submissions/${submissionId}/submit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${studentToken}`,
        },
        body: JSON.stringify({ answers: [{ q_id: 1, sub_id: null, submitted_answer: 'B' }] }),
      }, env)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('ALREADY_SUBMITTED')
    })
  })

  describe('image validation', () => {
    it('returns 400 when image field is missing', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const form = new FormData()
      form.append('model', DEFAULT_EXTRACT_MODEL)

      const res = await postExtract(submissionId, form)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.message).toMatch(/image/i)
    })

    it('returns 415 for non-image content type', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const form = buildExtractForm({ mime: 'text/plain', filename: 'sheet.txt' })
      const res = await postExtract(submissionId, form)
      expect(res.status).toBe(415)
      const body = await res.json()
      expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    })

    it('accepts image/jpeg', async () => {
      mockOpenRouter()
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm({ mime: 'image/jpeg', filename: 'sheet.jpg' }))
      expect(res.status).toBe(200)
    })

    it('returns 413 when image exceeds 20 MB cap', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const oversize = 20 * 1024 * 1024 + 1
      const form = buildExtractForm({ size: oversize })

      const res = await postExtract(submissionId, form)
      expect(res.status).toBe(413)
      const body = await res.json()
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE')
    })
  })

  describe('model selection (teacher-configured per exercise)', () => {
    it("echoes back the exercise's extract_model in model_used", async () => {
      mockOpenRouter()
      const altModel = EXTRACT_MODELS.find((m) => m.id !== DEFAULT_EXTRACT_MODEL)

      const { id: exerciseId } = await createExercise(teacherToken, { extract_model: altModel.id })
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.model_used).toBe(altModel.id)
    })

    it('falls back to default when the exercise has no extract_model', async () => {
      mockOpenRouter()
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.model_used).toBe(DEFAULT_EXTRACT_MODEL)
    })

    it('ignores any client-supplied model field (security: students cannot pick)', async () => {
      const spy = mockOpenRouter()
      const altModel = EXTRACT_MODELS.find((m) => m.id !== DEFAULT_EXTRACT_MODEL)

      // Exercise has NO extract_model — server default should win.
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      // Student tries to override via the form field — must be ignored.
      const res = await postExtract(submissionId, buildExtractForm({ extra: { model: altModel.id } }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.model_used).toBe(DEFAULT_EXTRACT_MODEL)

      const [, init] = spy.mock.calls.find(([url]) => String(url).includes('openrouter.ai'))
      expect(JSON.parse(init.body).model).toBe(DEFAULT_EXTRACT_MODEL)
    })
  })

  describe('LLM failure modes', () => {
    it('returns 502 when OpenRouter responds with an upstream error', async () => {
      mockOpenRouter({ status: 500, errorMessage: 'upstream exploded' })

      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(502)
      const body = await res.json()
      expect(body.error.code).toBe('EXTRACTION_FAILED')
    })

    it('returns 422 when the LLM returns non-JSON content', async () => {
      mockOpenRouter({ raw: 'sorry, I cannot help with that' })

      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('EXTRACT_PARSE_ERROR')
    })

    it('returns 422 when the LLM JSON has no answers array', async () => {
      mockOpenRouter({ raw: JSON.stringify({ result: 'ok' }) })

      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('EXTRACT_PARSE_ERROR')
    })

    it('still persists the file row even when extraction fails', async () => {
      mockOpenRouter({ status: 503, errorMessage: 'overloaded' })

      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const before = await env.DB.prepare(
        'SELECT COUNT(*) AS c FROM submission_files WHERE submission_id = ?'
      ).bind(submissionId).first()

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(502)

      const after = await env.DB.prepare(
        'SELECT COUNT(*) AS c FROM submission_files WHERE submission_id = ?'
      ).bind(submissionId).first()
      // The file is still uploaded — auditable record of the attempt.
      expect(after.c).toBe(before.c + 1)
    })
  })

  describe('cascade delete', () => {
    it('deletes submission_files when its submission is deleted', async () => {
      mockOpenRouter()

      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      const { file_id } = (await res.json()).data

      await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(submissionId).run()

      const row = await env.DB.prepare(
        'SELECT id FROM submission_files WHERE id = ?'
      ).bind(file_id).first()
      expect(row).toBeNull()
    })
  })
})

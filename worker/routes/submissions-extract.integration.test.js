import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
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

/**
 * Create an in-progress submission for the given exercise as the student.
 * Returns the submission id.
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
 * Build a multipart FormData body with a fake PNG file (1×1 transparent pixel).
 * `extra` may include a `model` field.
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

describe('POST /api/submissions/:id/extract — PR A scaffold', () => {
  describe('happy path', () => {
    it('uploads image, persists submission_files row, returns stub response', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toMatchObject({
        file_id: expect.any(Number),
        model_used: DEFAULT_EXTRACT_MODEL,
        extracted: [],
        warnings: expect.arrayContaining([expect.stringMatching(/PR A stub/i)]),
      })

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
      // Submission owned by the default student
      const submissionId = await startSubmission(exerciseId)

      // Different student tries to extract
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

  describe('model selection', () => {
    it('echoes back a valid model id', async () => {
      const altModel = EXTRACT_MODELS.find((m) => m.id !== DEFAULT_EXTRACT_MODEL)
      expect(altModel).toBeDefined()

      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm({ extra: { model: altModel.id } }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.model_used).toBe(altModel.id)
    })

    it('substitutes default for unknown model id', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm({ extra: { model: 'made-up/model' } }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.model_used).toBe(DEFAULT_EXTRACT_MODEL)
    })

    it('uses default when model is omitted', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const submissionId = await startSubmission(exerciseId)

      const res = await postExtract(submissionId, buildExtractForm())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.model_used).toBe(DEFAULT_EXTRACT_MODEL)
    })
  })

  describe('cascade delete', () => {
    it('deletes submission_files when its submission is deleted', async () => {
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

import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import app from '../index.js'
import { seedTeacher, loginAsTeacher, seedStudent, loginAsStudent, createExercise } from '../test/helpers.js'

let teacherToken
let studentToken

beforeAll(async () => {
  await seedTeacher()
  await seedStudent()
  teacherToken = await loginAsTeacher()
  studentToken = await loginAsStudent()
})

/**
 * Helper: Upload a file to R2 and create an exercise_files record.
 * Returns { fileId, r2Key, fileName, fileType }.
 */
async function uploadFile(exerciseId, fileType, fileName, fileContent) {
  const timestamp = Date.now()
  const r2Key = `exercises/${exerciseId}/${timestamp}-${fileName}`

  // Upload directly to R2 (bypass the upload API for simplicity in tests)
  await env.BUCKET.put(r2Key, fileContent, {
    httpMetadata: { contentType: fileType === 'exercise_pdf' ? 'application/pdf' : 'image/png' },
  })

  // Insert exercise_files record
  const result = await env.DB.prepare(`
    INSERT INTO exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    VALUES (?, ?, ?, ?, ?)
  `).bind(exerciseId, fileType, r2Key, fileName, fileContent.length).run()

  return {
    fileId: result.meta.last_row_id,
    r2Key,
    fileName,
    fileType,
  }
}

describe('GET /api/files/:fileId', () => {
  describe('exercise_pdf (public access)', () => {
    it('serves exercise_pdf without auth', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const testContent = 'PDF content for exercise'
      const { fileId } = await uploadFile(exerciseId, 'exercise_pdf', 'test.pdf', testContent)

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
      }, env)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/pdf')
      expect(res.headers.get('content-disposition')).toBe('inline')
      expect(res.headers.get('cache-control')).toMatch(/max-age=3600/)

      const body = await res.text()
      expect(body).toBe(testContent)
    })

    it('serves exercise_pdf with student auth', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const testContent = 'PDF for student'
      const { fileId } = await uploadFile(exerciseId, 'exercise_pdf', 'student-test.pdf', testContent)

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${studentToken}` },
      }, env)

      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toBe(testContent)
    })
  })

  describe('solution_pdf (teacher-only)', () => {
    it('blocks solution_pdf without auth (403)', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const { fileId } = await uploadFile(exerciseId, 'solution_pdf', 'solution.pdf', 'Solution content')

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
      }, env)

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('blocks solution_pdf for student (403)', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const { fileId } = await uploadFile(exerciseId, 'solution_pdf', 'solution.pdf', 'Solution content')

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${studentToken}` },
      }, env)

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })

    it('allows solution_pdf for teacher', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const testContent = 'Solution PDF content'
      const { fileId } = await uploadFile(exerciseId, 'solution_pdf', 'solution.pdf', testContent)

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${teacherToken}` },
      }, env)

      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toBe(testContent)
    })
  })

  describe('reference_image (teacher-only)', () => {
    it('blocks reference_image for student (403)', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const { fileId } = await uploadFile(exerciseId, 'reference_image', 'ref.png', 'PNG data')

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${studentToken}` },
      }, env)

      expect(res.status).toBe(403)
    })

    it('allows reference_image for teacher', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const testContent = 'PNG image data'
      const { fileId } = await uploadFile(exerciseId, 'reference_image', 'ref.png', testContent)

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${teacherToken}` },
      }, env)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      const body = await res.text()
      expect(body).toBe(testContent)
    })
  })

  describe('error cases', () => {
    it('returns 404 for unknown file id', async () => {
      const res = await app.request('/api/files/999999', {
        method: 'GET',
      }, env)

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 when R2 object is missing', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const { fileId, r2Key } = await uploadFile(exerciseId, 'exercise_pdf', 'missing.pdf', 'content')

      // Delete the R2 object but leave the DB record
      await env.BUCKET.delete(r2Key)

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
      }, env)

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('NOT_FOUND')
    })
  })
})

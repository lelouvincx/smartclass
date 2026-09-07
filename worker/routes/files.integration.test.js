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

async function activateExercise(exerciseId, sourceFileId) {
  const assetSet = await env.DB.prepare(`
    INSERT INTO exercise_question_asset_sets (
      exercise_id, source_file_id, detector_version, detection_method,
      confirmed_by, confirmed_at
    ) VALUES (?, ?, 'test-v1', 'text',
      (SELECT id FROM users WHERE role = 'teacher' LIMIT 1), CURRENT_TIMESTAMP)
  `).bind(exerciseId, sourceFileId).run()
  await env.DB.prepare(
    'UPDATE exercises SET active_question_asset_set_id = ? WHERE id = ?',
  ).bind(assetSet.meta.last_row_id, exerciseId).run()
}

describe('GET /api/files/:fileId', () => {
  describe('exercise_pdf (grade access)', () => {
    it('requires authentication for exercise PDFs', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const testContent = 'PDF content for exercise'
      const { fileId } = await uploadFile(exerciseId, 'exercise_pdf', 'test.pdf', testContent)

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
      }, env)

      expect(res.status).toBe(401)
    })

    it('serves exercise_pdf with student auth', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const testContent = 'PDF for student'
      const { fileId } = await uploadFile(exerciseId, 'exercise_pdf', 'student-test.pdf', testContent)
      await activateExercise(exerciseId, fileId)

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${studentToken}` },
      }, env)

      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      const body = await res.text()
      expect(body).toBe(testContent)
    })

    it('blocks an exercise PDF that is not the source of a confirmed active question set', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const { fileId } = await uploadFile(exerciseId, 'exercise_pdf', 'unfinished.pdf', 'unfinished')

      const res = await app.request(`/api/files/${fileId}`, {
        headers: { 'Authorization': `Bearer ${studentToken}` },
      }, env)

      expect(res.status).toBe(403)
      await expect(res.json()).resolves.toMatchObject({
        error: { code: 'FORBIDDEN' },
      })
    })

    it('blocks a student whose grades do not overlap the exercise', async () => {
      const { id: exerciseId } = await createExercise(teacherToken, { grades: [12] })
      const { fileId } = await uploadFile(exerciseId, 'exercise_pdf', 'restricted.pdf', 'restricted')
      await activateExercise(exerciseId, fileId)
      const student = await env.DB.prepare(
        "SELECT id FROM users WHERE phone = '+84123456789'",
      ).first()
      await env.DB.batch([
        env.DB.prepare('DELETE FROM student_grades WHERE user_id = ?').bind(student.id),
        env.DB.prepare('INSERT INTO student_grades (user_id, grade) VALUES (?, 10)').bind(student.id),
      ])

      const res = await app.request(`/api/files/${fileId}`, {
        headers: { 'Authorization': `Bearer ${studentToken}` },
      }, env)
      expect(res.status).toBe(403)
      await expect(res.json()).resolves.toMatchObject({
        error: { code: 'GRADE_ACCESS_DENIED' },
      })
    })
  })

  describe('solution_pdf (teacher-only)', () => {
    it('blocks solution_pdf without auth', async () => {
      const { id: exerciseId } = await createExercise(teacherToken)
      const { fileId } = await uploadFile(exerciseId, 'solution_pdf', 'solution.pdf', 'Solution content')

      const res = await app.request(`/api/files/${fileId}`, {
        method: 'GET',
      }, env)

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('UNAUTHORIZED')
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
        headers: { 'Authorization': `Bearer ${teacherToken}` },
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
        headers: { 'Authorization': `Bearer ${teacherToken}` },
      }, env)

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.code).toBe('NOT_FOUND')
    })
  })
})

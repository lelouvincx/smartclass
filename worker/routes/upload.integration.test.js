import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import app from '../index.js'
import { seedTeacher, loginAsTeacher, createExercise } from '../test/helpers.js'

let token

beforeAll(async () => {
  await seedTeacher()
  token = await loginAsTeacher()
})

// Helper to make upload request with ArrayBuffer body (avoids stream isolation issues)
async function uploadFile(exerciseId, r2Key, content = 'fake PDF content') {
  const encoded = new TextEncoder().encode(content)
  return app.request(`/api/upload/exercises/${exerciseId}/files`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/pdf',
      'Content-Length': String(encoded.byteLength),
      'x-r2-key': r2Key,
      'x-file-type': 'exercise_pdf',
      'x-file-name': 'quiz.pdf',
    },
    body: encoded.buffer,
  }, env)
}

describe('POST /api/upload/exercises/:id/files/upload', () => {
  it('returns upload URL and r2_key', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/upload/exercises/${id}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ file_type: 'exercise_pdf', file_name: 'quiz.pdf' }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.upload_url).toContain(`/exercises/${id}/files`)
    expect(body.data.r2_key).toContain(`exercises/${id}/`)
    expect(body.data.file_type).toBe('exercise_pdf')
    expect(body.data.file_name).toBe('quiz.pdf')
    // No file_id yet — record created after upload
    expect(body.data.file_id).toBeUndefined()
  })

  it('rejects invalid file_type', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/upload/exercises/${id}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ file_type: 'invalid', file_name: 'test.pdf' }),
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_FILE_TYPE')
  })

  it('rejects missing file_name', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/upload/exercises/${id}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ file_type: 'exercise_pdf' }),
    }, env)

    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent exercise', async () => {
    const res = await app.request('/api/upload/exercises/99999/files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ file_type: 'exercise_pdf', file_name: 'test.pdf' }),
    }, env)

    expect(res.status).toBe(404)
  })

  it('requires auth', async () => {
    const res = await app.request('/api/upload/exercises/1/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_type: 'exercise_pdf', file_name: 'test.pdf' }),
    }, env)

    expect(res.status).toBe(401)
  })
})

// Disable isolated storage for R2 write tests (known Miniflare limitation with R2 + isolated storage)
// See: https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#isolated-storage
describe('PUT /api/upload/exercises/:exerciseId/files', () => {
  it('uploads file and creates DB record', async () => {
    const { id } = await createExercise(token)

    // Step 1: get upload URL
    const step1Res = await app.request(`/api/upload/exercises/${id}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ file_type: 'exercise_pdf', file_name: 'quiz.pdf' }),
    }, env)
    const step1Body = await step1Res.json()
    const r2Key = step1Body.data.r2_key

    // Step 2: upload file content
    const res = await uploadFile(id, r2Key, 'fake PDF content for testing')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.uploaded).toBe(true)
    expect(body.data.file_id).toBeDefined()
    expect(body.data.r2_key).toBe(r2Key)

    // Verify DB record was created
    const files = await env.DB.prepare(
      'SELECT * FROM exercise_files WHERE exercise_id = ?'
    ).bind(id).all()
    expect(files.results).toHaveLength(1)
    expect(files.results[0].file_name).toBe('quiz.pdf')

    // Verify R2 object exists (consume body to avoid isolated storage cleanup failure)
    const r2Object = await env.BUCKET.get(r2Key)
    expect(r2Object).not.toBeNull()
    await r2Object.text()
  })

  it('rejects missing metadata headers', async () => {
    const { id } = await createExercise(token)
    const encoded = new TextEncoder().encode('some bytes')
    const res = await app.request(`/api/upload/exercises/${id}/files`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/pdf',
        'Content-Length': String(encoded.byteLength),
      },
      body: encoded.buffer,
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects r2_key that does not match exercise', async () => {
    const { id } = await createExercise(token)
    const encoded = new TextEncoder().encode('some bytes')
    const res = await app.request(`/api/upload/exercises/${id}/files`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/pdf',
        'Content-Length': String(encoded.byteLength),
        'x-r2-key': 'exercises/99999/fake-key',
        'x-file-type': 'exercise_pdf',
        'x-file-name': 'quiz.pdf',
      },
      body: encoded.buffer,
    }, env)

    expect(res.status).toBe(400)
  })
})

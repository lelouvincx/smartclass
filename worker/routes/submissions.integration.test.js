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

describe('POST /api/submissions', () => {
  it('creates submission for timed exercise', async () => {
    const { id: exerciseId } = await createExercise(teacherToken, {
      is_timed: true,
      duration_minutes: 60,
    })

    const res = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({
      exercise_id: exerciseId,
      mode: 'timed',
      total_questions: 2,
    })
    expect(body.data.id).toBeDefined()
    expect(body.data.started_at).toBeDefined()
    expect(body.data.submitted_at).toBeNull()
  })

  it('creates submission for untimed exercise', async () => {
    const { id: exerciseId } = await createExercise(teacherToken, {
      is_timed: false,
      duration_minutes: 0,
    })

    const res = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.mode).toBe('untimed')
  })

  it('requires authentication', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)

    const res = await app.request('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)

    expect(res.status).toBe(401)
  })

  it('rejects when exercise does not exist', async () => {
    const res = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: 99999 }),
    }, env)

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('rejects when exercise_id is missing', async () => {
    const res = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({}),
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('PUT /api/submissions/:id/submit', () => {
  it('submits answers and updates submission', async () => {
    // Create exercise and submission
    const { id: exerciseId } = await createExercise(teacherToken)
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    // Submit answers
    const answers = [
      { q_id: 1, submitted_answer: 'A' },
      { q_id: 2, submitted_answer: 'true' },
    ]

    const res = await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.submitted_at).toBeDefined()
    expect(body.data.answers).toHaveLength(2)
    expect(body.data.answers[0]).toMatchObject({
      q_id: 1,
      submitted_answer: 'A',
    })
    expect(body.data.answers[1]).toMatchObject({
      q_id: 2,
      submitted_answer: 'true',
    })
  })

  it('allows skipped questions (null answers)', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    // Submit with one skipped question
    const answers = [
      { q_id: 1, submitted_answer: 'B' },
      { q_id: 2, submitted_answer: null },
    ]

    const res = await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.answers[1].submitted_answer).toBeNull()
  })

  it('requires authentication', async () => {
    const res = await app.request('/api/submissions/1/submit', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [] }),
    }, env)

    expect(res.status).toBe(401)
  })

  it('rejects when submission does not exist', async () => {
    const res = await app.request('/api/submissions/99999/submit', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers: [] }),
    }, env)

    expect(res.status).toBe(404)
  })

  it('rejects when submission belongs to another user', async () => {
    // Create submission as first student
    const { id: exerciseId } = await createExercise(teacherToken)
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    // Try to submit as different student
    await seedStudent('+84987654321')
    const otherStudentToken = await loginAsStudent('+84987654321')

    const res = await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${otherStudentToken}`,
      },
      body: JSON.stringify({ answers: [{ q_id: 1, submitted_answer: 'A' }] }),
    }, env)

    expect(res.status).toBe(403)
  })

  it('rejects when submission already submitted', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    // Submit once
    await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers: [{ q_id: 1, submitted_answer: 'A' }] }),
    }, env)

    // Try to submit again
    const res = await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers: [{ q_id: 1, submitted_answer: 'B' }] }),
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('ALREADY_SUBMITTED')
  })

  it('rejects when answers is not an array', async () => {
    const { id: exerciseId } = await createExercise(teacherToken)
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    const res = await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ answers: 'not-an-array' }),
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/submissions/:id', () => {
  it('returns submission with answers', async () => {
    // Create and submit
    const { id: exerciseId } = await createExercise(teacherToken)
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        answers: [
          { q_id: 1, submitted_answer: 'B' },
          { q_id: 2, submitted_answer: 'false' },
        ],
      }),
    }, env)

    // Get submission
    const res = await app.request(`/api/submissions/${submissionId}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(submissionId)
    expect(body.data.exercise_id).toBe(exerciseId)
    expect(body.data.answers).toHaveLength(2)
  })

  it('requires authentication', async () => {
    const res = await app.request('/api/submissions/1', {}, env)
    expect(res.status).toBe(401)
  })

  it('rejects when submission does not exist', async () => {
    const res = await app.request('/api/submissions/99999', {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    expect(res.status).toBe(404)
  })

  it('rejects when submission belongs to another user', async () => {
    // Create submission as first student
    const { id: exerciseId } = await createExercise(teacherToken)
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    // Try to get as different student
    await seedStudent('+84111222333')
    const otherStudentToken = await loginAsStudent('+84111222333')

    const res = await app.request(`/api/submissions/${submissionId}`, {
      headers: { 'Authorization': `Bearer ${otherStudentToken}` },
    }, env)

    expect(res.status).toBe(403)
  })
})

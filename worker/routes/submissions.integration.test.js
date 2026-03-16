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

// Default helper schema: q_id=1 (mcq) + q_id=2 (boolean 4 sub-rows) = 2 distinct questions.
// total_questions should be 2 (count distinct q_ids).

describe('POST /api/submissions', () => {
  it('creates submission for timed exercise with correct total_questions', async () => {
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
      total_questions: 2, // 2 distinct q_ids, not 5 rows
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
  it('submits mcq and boolean sub-question answers', async () => {
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

    // Submit mcq answer + 4 boolean sub-answers
    const answers = [
      { q_id: 1, submitted_answer: 'A' },
      { q_id: 2, sub_id: 'a', submitted_answer: '1' },
      { q_id: 2, sub_id: 'b', submitted_answer: '0' },
      { q_id: 2, sub_id: 'c', submitted_answer: '0' },
      { q_id: 2, sub_id: 'd', submitted_answer: '1' },
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
    expect(body.data.answers).toHaveLength(5)

    const mcqAns = body.data.answers.find((a) => a.q_id === 1)
    expect(mcqAns).toMatchObject({ q_id: 1, sub_id: null, submitted_answer: 'A' })

    const boolAns = body.data.answers.filter((a) => a.q_id === 2)
    expect(boolAns).toHaveLength(4)
    expect(boolAns.map((a) => a.sub_id).sort()).toEqual(['a', 'b', 'c', 'd'])
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

    // Submit with skipped questions (null)
    const answers = [
      { q_id: 1, submitted_answer: 'B' },
      { q_id: 2, sub_id: 'a', submitted_answer: null },
      { q_id: 2, sub_id: 'b', submitted_answer: null },
      { q_id: 2, sub_id: 'c', submitted_answer: null },
      { q_id: 2, sub_id: 'd', submitted_answer: null },
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
    const boolAnswers = body.data.answers.filter((a) => a.q_id === 2)
    boolAnswers.forEach((a) => expect(a.submitted_answer).toBeNull())
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

  it('rejects when q_id is out of range', async () => {
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
      body: JSON.stringify({ answers: [{ q_id: 9999, submitted_answer: 'A' }] }),
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects when duplicate (q_id, sub_id) pairs in payload', async () => {
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
      body: JSON.stringify({
        answers: [
          { q_id: 1, submitted_answer: 'A' },
          { q_id: 1, submitted_answer: 'B' }, // duplicate q_id=1 (no sub_id)
        ],
      }),
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('Duplicate')
  })

  it('rejects when duplicate (q_id, sub_id) for boolean answers', async () => {
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
      body: JSON.stringify({
        answers: [
          { q_id: 2, sub_id: 'a', submitted_answer: '1' },
          { q_id: 2, sub_id: 'a', submitted_answer: '0' }, // duplicate (2, a)
        ],
      }),
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('Duplicate')
  })

  it('accepts answers for exercises with non-contiguous q_ids', async () => {
    // Create exercise with q_ids 1, 3 (gap at 2) — total_questions = 2
    const { id: exerciseId } = await createExercise(teacherToken, {
      schema: [
        { q_id: 1, type: 'mcq', correct_answer: 'A' },
        { q_id: 3, type: 'mcq', correct_answer: 'B' },
      ],
    })
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    // This should succeed but currently fails because validation checks q_id <= totalQuestions (2)
    // and q_id=3 > 2
    const res = await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
      body: JSON.stringify({ answers: [
        { q_id: 1, submitted_answer: 'A' },
        { q_id: 3, submitted_answer: 'B' },
      ] }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.score).toBe(10)
  })

  it('rejects q_id not present in the exercise schema', async () => {
    const { id: exerciseId } = await createExercise(teacherToken, {
      schema: [
        { q_id: 1, type: 'mcq', correct_answer: 'A' },
      ],
    })
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const createBody = await createRes.json()
    const submissionId = createBody.data.id

    const res = await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
      body: JSON.stringify({ answers: [{ q_id: 5, submitted_answer: 'A' }] }),
    }, env)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
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
  it('returns submission with answers including sub_id', async () => {
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
          { q_id: 2, sub_id: 'a', submitted_answer: '1' },
          { q_id: 2, sub_id: 'b', submitted_answer: '0' },
          { q_id: 2, sub_id: 'c', submitted_answer: '0' },
          { q_id: 2, sub_id: 'd', submitted_answer: '1' },
        ],
      }),
    }, env)

    const res = await app.request(`/api/submissions/${submissionId}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(submissionId)
    expect(body.data.exercise_id).toBe(exerciseId)
    expect(body.data.answers).toHaveLength(5)

    const mcqAns = body.data.answers.find((a) => a.q_id === 1)
    expect(mcqAns.sub_id).toBeNull()

    const boolAns = body.data.answers.filter((a) => a.q_id === 2)
    expect(boolAns).toHaveLength(4)
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

    await seedStudent('+84111222333')
    const otherStudentToken = await loginAsStudent('+84111222333')

    const res = await app.request(`/api/submissions/${submissionId}`, {
      headers: { 'Authorization': `Bearer ${otherStudentToken}` },
    }, env)

    expect(res.status).toBe(403)
  })
})

// Default schema: q_id=1 mcq correct_answer='B', q_id=2 boolean a='1' b='0' c='0' d='1'
// All correct → score 10.0 (1.0 + 1.0 points / 2 questions * 10)
// All wrong   → score 0.0
// Mixed       → partial credit

describe('Grading — auto-grade on submit', () => {
  async function createAndStartSubmission() {
    const { id: exerciseId } = await createExercise(teacherToken)
    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const { data } = await createRes.json()
    return data.id
  }

  async function submitAnswers(submissionId, answers) {
    const res = await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
      body: JSON.stringify({ answers }),
    }, env)
    return res.json()
  }

  it('sets is_correct=1 and score=10 when all answers are correct', async () => {
    const submissionId = await createAndStartSubmission()
    const body = await submitAnswers(submissionId, [
      { q_id: 1, submitted_answer: 'B' },           // MCQ correct
      { q_id: 2, sub_id: 'a', submitted_answer: '1' },
      { q_id: 2, sub_id: 'b', submitted_answer: '0' },
      { q_id: 2, sub_id: 'c', submitted_answer: '0' },
      { q_id: 2, sub_id: 'd', submitted_answer: '1' },
    ])

    expect(body.data.score).toBe(10)
    const mcqAns = body.data.answers.find((a) => a.q_id === 1)
    expect(mcqAns.is_correct).toBe(1)
    body.data.answers.filter((a) => a.q_id === 2).forEach((a) => {
      expect(a.is_correct).toBe(1)
    })
  })

  it('sets is_correct=0 and score=0 when all answers are wrong', async () => {
    const submissionId = await createAndStartSubmission()
    const body = await submitAnswers(submissionId, [
      { q_id: 1, submitted_answer: 'A' },           // MCQ wrong (correct='B')
      { q_id: 2, sub_id: 'a', submitted_answer: '0' }, // wrong (correct='1')
      { q_id: 2, sub_id: 'b', submitted_answer: '1' }, // wrong (correct='0')
      { q_id: 2, sub_id: 'c', submitted_answer: '1' }, // wrong (correct='0')
      { q_id: 2, sub_id: 'd', submitted_answer: '0' }, // wrong (correct='1')
    ])

    expect(body.data.score).toBe(0)
    body.data.answers.forEach((a) => expect(a.is_correct).toBe(0))
  })

  it('gives score=2 when MCQ correct and boolean all wrong', async () => {
    const submissionId = await createAndStartSubmission()
    const body = await submitAnswers(submissionId, [
      { q_id: 1, submitted_answer: 'B' },           // MCQ correct → 0.25 pts
      { q_id: 2, sub_id: 'a', submitted_answer: '0' }, // wrong
      { q_id: 2, sub_id: 'b', submitted_answer: '1' }, // wrong
      { q_id: 2, sub_id: 'c', submitted_answer: '1' }, // wrong
      { q_id: 2, sub_id: 'd', submitted_answer: '0' }, // wrong
      // boolean 0/4 correct → 0 pts. max_possible = 0.25 + 1.0 = 1.25
      // score = (0.25 + 0) / 1.25 * 10 = 2.0
    ])
    expect(body.data.score).toBe(2)
  })

  it('gives partial credit for boolean — 3/4 correct yields score=4', async () => {
    const submissionId = await createAndStartSubmission()
    const body = await submitAnswers(submissionId, [
      { q_id: 1, submitted_answer: 'A' },           // MCQ wrong → 0 pts
      { q_id: 2, sub_id: 'a', submitted_answer: '1' }, // correct
      { q_id: 2, sub_id: 'b', submitted_answer: '0' }, // correct
      { q_id: 2, sub_id: 'c', submitted_answer: '0' }, // correct
      { q_id: 2, sub_id: 'd', submitted_answer: '0' }, // wrong (correct='1')
      // boolean 3/4 → 0.5 pts. max_possible = 0.25 + 1.0 = 1.25
      // score = (0 + 0.5) / 1.25 * 10 = 4.0
    ])
    expect(body.data.score).toBe(4)
  })

  it('treats skipped (null) answers as wrong', async () => {
    const submissionId = await createAndStartSubmission()
    const body = await submitAnswers(submissionId, [
      { q_id: 1, submitted_answer: null },
      { q_id: 2, sub_id: 'a', submitted_answer: null },
      { q_id: 2, sub_id: 'b', submitted_answer: null },
      { q_id: 2, sub_id: 'c', submitted_answer: null },
      { q_id: 2, sub_id: 'd', submitted_answer: null },
    ])
    expect(body.data.score).toBe(0)
    body.data.answers.forEach((a) => expect(a.is_correct).toBe(0))
  })

  it('score and is_correct persist and are returned by GET /submissions/:id', async () => {
    const submissionId = await createAndStartSubmission()
    await submitAnswers(submissionId, [
      { q_id: 1, submitted_answer: 'B' },
      { q_id: 2, sub_id: 'a', submitted_answer: '1' },
      { q_id: 2, sub_id: 'b', submitted_answer: '0' },
      { q_id: 2, sub_id: 'c', submitted_answer: '0' },
      { q_id: 2, sub_id: 'd', submitted_answer: '1' },
    ])

    const res = await app.request(`/api/submissions/${submissionId}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)
    const body = await res.json()

    expect(body.data.score).toBe(10)
    body.data.answers.forEach((a) => expect(a.is_correct).toBe(1))
  })
})

describe('GET /api/submissions (list)', () => {
  /**
   * Helper: Create and submit a complete submission for an exercise.
   * Returns { submissionId, exerciseId, exerciseTitle }.
   */
  async function createAndSubmitExercise(title = 'Test Exercise') {
    const { id: exerciseId } = await createExercise(teacherToken, { title })

    const createRes = await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId }),
    }, env)
    const { id: submissionId } = (await createRes.json()).data

    // Submit answers
    await app.request(`/api/submissions/${submissionId}/submit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        answers: [
          { q_id: 1, submitted_answer: 'B' },
          { q_id: 2, sub_id: 'a', submitted_answer: '1' },
          { q_id: 2, sub_id: 'b', submitted_answer: '0' },
          { q_id: 2, sub_id: 'c', submitted_answer: '0' },
          { q_id: 2, sub_id: 'd', submitted_answer: '1' },
        ],
      }),
    }, env)

    return { submissionId, exerciseId, exerciseTitle: title }
  }

  it('returns empty array for student with no submissions', async () => {
    const res = await app.request('/api/submissions', {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.submissions).toEqual([])
    expect(body.data.total).toBe(0)
  })

  it('returns submitted submissions ordered by newest first', async () => {
    await createAndSubmitExercise('Exercise A')
    // Small delay to ensure different submitted_at timestamps
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await createAndSubmitExercise('Exercise B')

    const res = await app.request('/api/submissions', {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    const body = await res.json()
    expect(body.data.submissions).toHaveLength(2)
    expect(body.data.total).toBe(2)

    // Verify ordered by submitted_at DESC (newest first)
    expect(body.data.submissions[0].exercise_title).toBe('Exercise B')
    expect(body.data.submissions[1].exercise_title).toBe('Exercise A')

    // Verify response shape
    const sub = body.data.submissions[0]
    expect(sub).toMatchObject({
      id: expect.any(Number),
      exercise_id: expect.any(Number),
      exercise_title: 'Exercise B',
      mode: 'timed',
      score: expect.any(Number),
      total_questions: 2,
      started_at: expect.any(String),
      submitted_at: expect.any(String),
    })
  })

  it('excludes in-progress (unsubmitted) submissions', async () => {
    // Create submitted submission
    await createAndSubmitExercise('Submitted Exercise')

    // Create in-progress submission (no submit)
    const { id: exerciseId2 } = await createExercise(teacherToken, { title: 'In Progress' })
    await app.request('/api/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ exercise_id: exerciseId2 }),
    }, env)

    const res = await app.request('/api/submissions', {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    const body = await res.json()
    expect(body.data.submissions).toHaveLength(1)
    expect(body.data.submissions[0].exercise_title).toBe('Submitted Exercise')
  })

  it('filters by exercise_id when provided', async () => {
    const { exerciseId: ex1 } = await createAndSubmitExercise('Exercise 1')
    await createAndSubmitExercise('Exercise 2')

    const res = await app.request(`/api/submissions?exercise_id=${ex1}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    const body = await res.json()
    expect(body.data.submissions).toHaveLength(1)
    expect(body.data.submissions[0].exercise_title).toBe('Exercise 1')
    expect(body.data.total).toBe(1)
  })

  it('respects limit param', async () => {
    await createAndSubmitExercise('Ex 1')
    await createAndSubmitExercise('Ex 2')
    await createAndSubmitExercise('Ex 3')

    const res = await app.request('/api/submissions?limit=2', {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    const body = await res.json()
    expect(body.data.submissions).toHaveLength(2)
    expect(body.data.total).toBe(3) // Total count ignores limit
  })

  it('enforces cross-user isolation', async () => {
    // Student A submits
    await createAndSubmitExercise('Student A Exercise')

    // Student B (different student) queries
    await seedStudent('+84999999999')
    const studentBToken = await loginAsStudent('+84999999999')

    const res = await app.request('/api/submissions', {
      headers: { 'Authorization': `Bearer ${studentBToken}` },
    }, env)

    const body = await res.json()
    expect(body.data.submissions).toEqual([])
    expect(body.data.total).toBe(0)
  })
})

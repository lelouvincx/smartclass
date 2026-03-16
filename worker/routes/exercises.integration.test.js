import { env } from 'cloudflare:test'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import app from '../index.js'
import { seedTeacher, loginAsTeacher, createExercise } from '../test/helpers.js'

let token

beforeAll(async () => {
  await seedTeacher()
  token = await loginAsTeacher()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Default helper schema: q_id=1 (mcq, B) + q_id=2 (boolean, a=1,b=0,c=0,d=1)
// That's 5 rows in answer_schemas but 2 distinct q_ids.

describe('GET /api/exercises', () => {
  it('returns empty list initially', async () => {
    const res = await app.request('/api/exercises', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('counts distinct q_ids as question_count', async () => {
    await createExercise(token)
    const res = await app.request('/api/exercises', {}, env)
    const body = await res.json()
    // q_id 1 (mcq) + q_id 2 (boolean with 4 sub-rows) = 2 distinct questions
    const created = body.data.find((e) => e.title === 'Test Quiz')
    expect(created).toBeDefined()
    expect(created.question_count).toBe(2)
  })
})

describe('POST /api/exercises/schema/parse', () => {
  it('requires auth', async () => {
    const res = await app.request('/api/exercises/schema/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_text: 'Q1 A\nQ2 true' }),
    }, env)

    expect(res.status).toBe(401)
  })

  it('returns normalized schema from model output including boolean sub-questions', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                schema: [
                  { q_id: '1', type: 'multiple_choice', correct_answer: 'b', confidence: 0.92 },
                  { q_id: 2, type: 'bool', sub_id: 'a', correct_answer: 'T', confidence: 0.85 },
                  { q_id: 2, type: 'bool', sub_id: 'b', correct_answer: 'F', confidence: 0.85 },
                  { q_id: 2, type: 'bool', sub_id: 'c', correct_answer: 'T', confidence: 0.6 },
                  { q_id: 2, type: 'bool', sub_id: 'd', correct_answer: 'F', confidence: 0.85 },
                ],
              }),
            },
          },
        ],
      }), { status: 200 })),
    )

    const res = await app.request('/api/exercises/schema/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ source_text: 'Q1. B\nQ2 a.T b.F c.T d.F' }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.schema).toEqual([
      { q_id: 1, type: 'mcq', sub_id: null, correct_answer: 'B', confidence: 0.92 },
      { q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1', confidence: 0.85 },
      { q_id: 2, type: 'boolean', sub_id: 'b', correct_answer: '0', confidence: 0.85 },
      { q_id: 2, type: 'boolean', sub_id: 'c', correct_answer: '1', confidence: 0.6 },
      { q_id: 2, type: 'boolean', sub_id: 'd', correct_answer: '0', confidence: 0.85 },
    ])
    expect(body.data.warnings).toEqual(['1 question(s) were parsed with confidence below 0.75'])
  })

  it('returns PARSE_ERROR when model response is not valid json', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: 'not-json',
            },
          },
        ],
      }), { status: 200 })),
    )

    const res = await app.request('/api/exercises/schema/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ source_text: 'Q1. B\nQ2. TRUE' }),
    }, env)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('PARSE_ERROR')
  })

  it('returns INVALID_SCHEMA when parsed rows are invalid', async () => {
    env.OPENROUTER_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                schema: [
                  { q_id: 1, type: 'mcq', correct_answer: 'E', confidence: 0.9 },
                ],
              }),
            },
          },
        ],
      }), { status: 200 })),
    )

    const res = await app.request('/api/exercises/schema/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ source_text: 'Question 1 answer is E' }),
    }, env)

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('returns PARSE_ERROR when openrouter key is missing', async () => {
    env.OPENROUTER_API_KEY = ''

    const res = await app.request('/api/exercises/schema/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ source_text: 'Q1. B\nQ2. TRUE' }),
    }, env)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('PARSE_ERROR')
  })
})

describe('POST /api/exercises', () => {
  it('creates exercise with valid schema including boolean sub-questions', async () => {
    const { res, body } = await createExercise(token)
    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('Test Quiz')
    expect(body.data.is_timed).toBe(1)
    expect(body.data.duration_minutes).toBe(60)
    // 5 rows: 1 mcq + 4 boolean sub-rows
    expect(body.data.schema).toHaveLength(5)
    expect(body.data.files).toHaveLength(0)

    // Verify boolean sub-rows have sub_id
    const booleanRows = body.data.schema.filter((r) => r.type === 'boolean')
    expect(booleanRows).toHaveLength(4)
    expect(booleanRows.map((r) => r.sub_id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('creates untimed exercise with zero duration', async () => {
    const { res, body } = await createExercise(token, {
      is_timed: false,
      duration_minutes: 0,
    })

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.is_timed).toBe(0)
    expect(body.data.duration_minutes).toBe(0)
  })

  it('rejects string duration_minutes', async () => {
    const { res, body } = await createExercise(token, { duration_minutes: 'bad' })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects negative duration_minutes', async () => {
    const { res, body } = await createExercise(token, { duration_minutes: -5 })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects missing duration_minutes when exercise is timed', async () => {
    const { res, body } = await createExercise(token, {
      is_timed: true,
      duration_minutes: undefined,
    })

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects empty schema', async () => {
    const { res, body } = await createExercise(token, { schema: [] })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects invalid schema type', async () => {
    const { res, body } = await createExercise(token, {
      schema: [{ q_id: 1, type: 'invalid', correct_answer: 'A' }],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects boolean row without sub_id', async () => {
    const { res, body } = await createExercise(token, {
      schema: [{ q_id: 1, type: 'boolean', correct_answer: '1' }],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects boolean row with invalid sub_id', async () => {
    const { res, body } = await createExercise(token, {
      schema: [
        { q_id: 1, type: 'boolean', sub_id: 'e', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'a', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'b', correct_answer: '0' },
        { q_id: 1, type: 'boolean', sub_id: 'c', correct_answer: '0' },
      ],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects boolean row with answer other than 0 or 1', async () => {
    const { res, body } = await createExercise(token, {
      schema: [
        { q_id: 1, type: 'boolean', sub_id: 'a', correct_answer: 'true' },
        { q_id: 1, type: 'boolean', sub_id: 'b', correct_answer: '0' },
        { q_id: 1, type: 'boolean', sub_id: 'c', correct_answer: '0' },
        { q_id: 1, type: 'boolean', sub_id: 'd', correct_answer: '0' },
      ],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('rejects boolean question with incomplete sub-questions', async () => {
    const { res, body } = await createExercise(token, {
      schema: [
        { q_id: 1, type: 'boolean', sub_id: 'a', correct_answer: '1' },
        { q_id: 1, type: 'boolean', sub_id: 'b', correct_answer: '0' },
        // missing c and d
      ],
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_SCHEMA')
  })

  it('requires auth', async () => {
    const res = await app.request('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No Auth', duration_minutes: 30, schema: [] }),
    }, env)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/exercises/:id', () => {
  it('returns exercise detail with files and schema', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe(id)
    expect(body.data.schema).toHaveLength(5) // 1 mcq + 4 boolean sub-rows
    expect(body.data.files).toHaveLength(0)
  })

  it('returns 404 for non-existent exercise', async () => {
    const res = await app.request('/api/exercises/99999', {}, env)
    expect(res.status).toBe(404)
  })

  it('includes correct_answer and sub_id in schema for teacher requests', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    const schema = body.data.schema
    expect(schema).toHaveLength(5)

    const mcqRow = schema.find((r) => r.type === 'mcq')
    expect(mcqRow).toMatchObject({ q_id: 1, type: 'mcq', correct_answer: 'B', sub_id: null })

    const boolRowA = schema.find((r) => r.type === 'boolean' && r.sub_id === 'a')
    expect(boolRowA).toMatchObject({ q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1' })
  })

  it('strips correct_answer from schema for unauthenticated requests', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {}, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.schema).toHaveLength(5)
    body.data.schema.forEach((row) => {
      expect(row).not.toHaveProperty('correct_answer')
      expect(row).toHaveProperty('q_id')
      expect(row).toHaveProperty('type')
      expect(row).toHaveProperty('sub_id')
    })
  })

  it('strips correct_answer from schema for student requests', async () => {
    const studentPhone = '+84123456789'
    await env.DB.prepare(`
      INSERT INTO users (phone, password_hash, role, status)
      VALUES (?, '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'active')
      ON CONFLICT(phone) DO UPDATE SET status = 'active'
    `).bind(studentPhone).run()

    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: studentPhone, password: '123' }),
    }, env)
    const loginBody = await loginRes.json()
    const studentToken = loginBody.data.token

    const { id } = await createExercise(token)

    const res = await app.request(`/api/exercises/${id}`, {
      headers: { 'Authorization': `Bearer ${studentToken}` },
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.schema).toHaveLength(5)
    body.data.schema.forEach((row) => {
      expect(row).not.toHaveProperty('correct_answer')
    })

    const mcqRow = body.data.schema.find((r) => r.type === 'mcq')
    expect(mcqRow).toMatchObject({ q_id: 1, type: 'mcq', sub_id: null })

    const boolRowB = body.data.schema.find((r) => r.type === 'boolean' && r.sub_id === 'b')
    expect(boolRowB).toMatchObject({ q_id: 2, type: 'boolean', sub_id: 'b' })
  })
})

describe('PUT /api/exercises/:id', () => {
  it('updates title', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ title: 'Updated Title' }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.title).toBe('Updated Title')
  })

  it('updates schema atomically', async () => {
    const { id } = await createExercise(token)
    const newSchema = [
      { q_id: 1, type: 'numeric', correct_answer: '42' },
    ]

    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ schema: newSchema }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.schema).toHaveLength(1)
    expect(body.data.schema[0].correct_answer).toBe('42')
  })

  it('rejects string duration_minutes on update', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ duration_minutes: 'invalid' }),
    }, env)

    expect(res.status).toBe(400)
  })

  it('forces duration_minutes to 0 when switching to untimed', async () => {
    const { id } = await createExercise(token)
    const res = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_timed: false }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.is_timed).toBe(0)
    expect(body.data.duration_minutes).toBe(0)
  })

  it('requires positive duration when switching untimed to timed', async () => {
    const { id } = await createExercise(token, {
      is_timed: false,
      duration_minutes: 0,
    })

    const invalidRes = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_timed: true }),
    }, env)

    expect(invalidRes.status).toBe(400)

    const validRes = await app.request(`/api/exercises/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_timed: true, duration_minutes: 45 }),
    }, env)

    expect(validRes.status).toBe(200)
    const validBody = await validRes.json()
    expect(validBody.data.is_timed).toBe(1)
    expect(validBody.data.duration_minutes).toBe(45)
  })
})

describe('DELETE /api/exercises/:id', () => {
  it('deletes exercise and cascades to schema', async () => {
    const { id } = await createExercise(token)

    const deleteRes = await app.request(`/api/exercises/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }, env)

    expect(deleteRes.status).toBe(200)
    const body = await deleteRes.json()
    expect(body.data.deleted).toBe(true)

    const getRes = await app.request(`/api/exercises/${id}`, {}, env)
    expect(getRes.status).toBe(404)

    const schemas = await env.DB.prepare(
      'SELECT * FROM answer_schemas WHERE exercise_id = ?'
    ).bind(id).all()
    expect(schemas.results).toHaveLength(0)
  })

  it('returns 404 for non-existent exercise', async () => {
    const res = await app.request('/api/exercises/99999', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }, env)
    expect(res.status).toBe(404)
  })
})

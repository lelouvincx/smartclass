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

describe('GET /api/exercises', () => {
  it('returns empty list initially', async () => {
    const res = await app.request('/api/exercises', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
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

  it('returns normalized schema from model output', async () => {
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
                  { q_id: 2, type: 'bool', correct_answer: 'TRUE', confidence: 0.6 },
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
      body: JSON.stringify({ source_text: 'Q1. B\nQ2. TRUE' }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.schema).toEqual([
      { q_id: 1, type: 'mcq', correct_answer: 'B', confidence: 0.92 },
      { q_id: 2, type: 'boolean', correct_answer: 'true', confidence: 0.6 },
    ])
    expect(body.data.warnings).toEqual(['1 question(s) were parsed with confidence below 0.75'])
  })
})

describe('POST /api/exercises', () => {
  it('creates exercise with valid schema', async () => {
    const { res, body } = await createExercise(token)
    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('Test Quiz')
    expect(body.data.is_timed).toBe(1)
    expect(body.data.duration_minutes).toBe(60)
    expect(body.data.schema).toHaveLength(2)
    expect(body.data.files).toHaveLength(0)
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
    expect(body.data.schema).toHaveLength(2)
    expect(body.data.files).toHaveLength(0)
  })

  it('returns 404 for non-existent exercise', async () => {
    const res = await app.request('/api/exercises/99999', {}, env)
    expect(res.status).toBe(404)
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

    // Verify exercise is gone
    const getRes = await app.request(`/api/exercises/${id}`, {}, env)
    expect(getRes.status).toBe(404)

    // Verify cascaded schema deletion
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

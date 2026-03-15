import { env } from 'cloudflare:test'
import app from '../index.js'

/**
 * Seed the teacher account used for authenticated requests.
 * Uses the same bcrypt hash as 0001_seed_teacher.sql (password: "123").
 */
export async function seedTeacher() {
  await env.DB.prepare(`
    INSERT INTO users (phone, password_hash, role, status)
    VALUES ('+84865481769', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'teacher', 'active')
    ON CONFLICT(phone) DO UPDATE SET
      password_hash = excluded.password_hash,
      role = 'teacher',
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `).run()
}

/**
 * Login as teacher and return the JWT token.
 */
export async function loginAsTeacher() {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+84865481769', password: '123' }),
  }, env)

  const body = await res.json()
  return body.data.token
}

/**
 * Seed a student account for testing.
 * Uses the same bcrypt hash as teacher (password: "123").
 */
export async function seedStudent(phone = '+84123456789') {
  await env.DB.prepare(`
    INSERT INTO users (phone, password_hash, role, status)
    VALUES (?, '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'active')
    ON CONFLICT(phone) DO UPDATE SET
      password_hash = excluded.password_hash,
      role = 'student',
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `).bind(phone).run()
}

/**
 * Login as student and return the JWT token.
 */
export async function loginAsStudent(phone = '+84123456789') {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: '123' }),
  }, env)

  const body = await res.json()
  return body.data.token
}

/**
 * Create an exercise and return { id, response body }.
 */
export async function createExercise(token, overrides = {}) {
  const payload = {
    title: 'Test Quiz',
    is_timed: true,
    duration_minutes: 60,
    schema: [
      { q_id: 1, type: 'mcq', correct_answer: 'B' },
      { q_id: 2, type: 'boolean', correct_answer: 'true' },
    ],
    ...overrides,
  }

  const res = await app.request('/api/exercises', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  }, env)

  const body = await res.json()
  return { id: body.data?.id, body, res }
}

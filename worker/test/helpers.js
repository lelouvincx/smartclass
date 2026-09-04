import { env } from 'cloudflare:test'
import app from '../index.js'

/**
 * Seed the teacher account used for authenticated requests.
 * Uses the same bcrypt hash as 0001_seed_teacher.sql (password: "123").
 */
export async function seedTeacher() {
  await env.DB.prepare(`
    INSERT INTO users (name, phone, password_hash, role, status)
    VALUES ('Test Teacher', '+84865481769', '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'teacher', 'active')
    ON CONFLICT(phone) DO UPDATE SET
      name = excluded.name,
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
export async function seedStudent(phone = '+84123456789', name = 'Test Student') {
  await env.DB.prepare(`
    INSERT INTO users (name, phone, password_hash, role, status)
    VALUES (?, ?, '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG', 'student', 'active')
    ON CONFLICT(phone) DO UPDATE SET
      name = excluded.name,
      password_hash = excluded.password_hash,
      role = 'student',
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `).bind(name, phone).run()

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM student_grades
      WHERE user_id = (SELECT id FROM users WHERE phone = ?)
    `).bind(phone),
    ...[10, 11, 12].map((grade) => env.DB.prepare(`
      INSERT INTO student_grades (user_id, grade)
      SELECT id, ? FROM users WHERE phone = ?
    `).bind(grade, phone)),
  ])
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
      { q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1' },
      { q_id: 2, type: 'boolean', sub_id: 'b', correct_answer: '0' },
      { q_id: 2, type: 'boolean', sub_id: 'c', correct_answer: '0' },
      { q_id: 2, type: 'boolean', sub_id: 'd', correct_answer: '1' },
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

/**
 * Create an exercise with a confirmed active set for tests that start submissions.
 */
export async function createStudentReadyExercise(token, overrides = {}) {
  const created = await createExercise(token, overrides)
  if (!created.id) return created

  const sourceFile = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'exercise_pdf', ?, 'source.pdf', 100)
  `).bind(created.id, `exercises/${created.id}/source.pdf`).run()
  const teacher = await env.DB.prepare(
    "select id from users where role = 'teacher' limit 1"
  ).first()
  const assetSet = await env.DB.prepare(`
    insert into exercise_question_asset_sets (
      exercise_id, source_file_id, detector_version, detection_method, confirmed_by, confirmed_at
    ) values (?, ?, 'test-v1', 'text', ?, current_timestamp)
  `).bind(created.id, sourceFile.meta.last_row_id, teacher.id).run()
  const schema = await env.DB.prepare(`
    select q_id, sub_id, type, correct_answer
    from answer_schemas
    where exercise_id = ?
  `).bind(created.id).all()

  await env.DB.batch([
    ...schema.results.map(row => env.DB.prepare(`
      insert into exercise_question_answer_schemas (
        asset_set_id, q_id, sub_id, type, correct_answer
      ) values (?, ?, ?, ?, ?)
    `).bind(assetSet.meta.last_row_id, row.q_id, row.sub_id, row.type, row.correct_answer)),
    env.DB.prepare(
      'update exercises set active_question_asset_set_id = ? where id = ?'
    ).bind(assetSet.meta.last_row_id, created.id),
  ])

  return { ...created, assetSetId: assetSet.meta.last_row_id }
}

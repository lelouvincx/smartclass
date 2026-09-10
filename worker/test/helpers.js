import { env } from 'cloudflare:test'
import realApp from '../index.js'
import { GRADES } from '../lib/grades.js'

// Transport only: every request exercises the final production router composition.
export const app = {
  request(path, init, bindings = env) {
    return realApp.request(new URL(path, 'http://maths-api.test').href, init, { ...bindings, APP_ENV: 'test' })
  },
}

export async function setStudentGrades(userId, grades) {
  const membership = await env.DB.prepare("select id from workspace_memberships where user_id = ? and workspace_id = 'maths'")
    .bind(userId).first()
  await env.DB.batch([
    env.DB.prepare('delete from workspace_membership_grades where membership_id = ?').bind(membership.id),
    ...grades.map(grade => env.DB.prepare('insert into workspace_membership_grades (membership_id, grade) values (?, ?)').bind(membership.id, grade)),
  ])
}

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
  await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status)
    select 'maths', id, 'teacher', 'active' from users where phone = '+84865481769'
    on conflict(workspace_id, user_id) do update set role = 'teacher', status = 'active'
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

  await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
    select 'maths', id, 'student', 'active', 'standard' from users where phone = ?
    on conflict(workspace_id, user_id) do update set role = 'student', status = 'active', access_tier = 'standard'
  `).bind(phone).run()
  await env.DB.batch([
    env.DB.prepare(`
      delete from workspace_membership_grades
      where membership_id = (select wm.id from workspace_memberships wm join users u on u.id = wm.user_id where u.phone = ? and wm.workspace_id = 'maths')
    `).bind(phone),
    ...GRADES.map((grade) => env.DB.prepare(`
      insert into workspace_membership_grades (membership_id, grade)
      select wm.id, ? from workspace_memberships wm join users u on u.id = wm.user_id where u.phone = ? and wm.workspace_id = 'maths'
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
    max_attempts: 1,
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

  await env.BUCKET.put(`exercises/${created.id}/source.pdf`, '%PDF-1.4 test source')
  const sourceFile = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'exercise_pdf', ?, 'source.pdf', 100)
  `).bind(created.id, `exercises/${created.id}/source.pdf`).run()
  const teacher = await env.DB.prepare(
    "select user_id as id from workspace_memberships where workspace_id = 'maths' and role = 'teacher' limit 1"
  ).first()
  const assetSet = await env.DB.prepare(`
    insert into exercise_question_asset_sets (
      exercise_id, source_file_id, detector_version, detection_method, confirmed_by, confirmed_at
    ) values (?, ?, 'test-v1', 'text', ?, current_timestamp)
  `).bind(created.id, sourceFile.meta.last_row_id, teacher.id).run()
  const schema = await env.DB.prepare(`
    select q_id, section_key, section_title, local_number, sub_id, type, correct_answer,
      max_score_hundredths
    from answer_schemas
    where exercise_id = ?
  `).bind(created.id).all()

  await env.DB.batch([
    ...schema.results.map(row => env.DB.prepare(`
      insert into exercise_question_answer_schemas (
        asset_set_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        , max_score_hundredths
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      assetSet.meta.last_row_id,
      row.q_id,
      row.section_key,
      row.section_title,
      row.local_number,
      row.sub_id,
      row.type,
      row.correct_answer,
      row.max_score_hundredths,
    )),
    env.DB.prepare(
      'update exercises set active_question_asset_set_id = ? where id = ?'
    ).bind(assetSet.meta.last_row_id, created.id),
  ])

  return { ...created, assetSetId: assetSet.meta.last_row_id }
}

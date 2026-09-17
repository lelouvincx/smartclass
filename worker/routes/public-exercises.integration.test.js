import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'

function testEnv() {
  return { ...env, APP_ENV: 'test', JWT_SECRET: 'workspace-secret', JWT_EXPIRES_IN: '1h' }
}

function api(path, options = {}, host = 'maths-api.test') {
  return app.request(`http://${host}/api/public${path}`, options, testEnv())
}

async function bearer(userId, workspaceId = 'maths') {
  return `Bearer ${await issueWorkspaceAccessToken(testEnv(), userId, workspaceId)}`
}

async function seedUser({ id, name, phone, platformRole = 'user', disabledAt = null }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, access_tier, platform_role, disabled_at)
    values (?, ?, ?, ?, 'student', 'active', 'standard', ?, ?)
  `).bind(id, name, phone, PASSWORD_HASH, platformRole, disabledAt).run()
}

async function seedMembership({ userId, workspaceId = 'maths', role = 'student', status = 'active', accessTier = 'standard', grades = [10] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
    values (?, ?, ?, ?, ?)
  `).bind(workspaceId, userId, role, status, accessTier).run()
  if (grades.length) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare('insert into workspace_membership_grades (membership_id, grade) values (?, ?)').bind(result.meta.last_row_id, grade)))
  }
}

const schema = [
  { q_id: 1, section_key: 'main', section_title: null, local_number: 1, sub_id: null, type: 'mcq', correct_answer: 'B', max_score_hundredths: 500 },
  { q_id: 2, section_key: 'main', section_title: null, local_number: 2, sub_id: null, type: 'numeric', correct_answer: '3.5', max_score_hundredths: 500 },
]

async function seedExercise({ id, title, workspaceId = 'maths', tier = 'guest', ready = true, createdBy = 101 }) {
  await env.DB.prepare(`
    insert into exercises (id, title, duration_minutes, max_attempts, allow_answer_pdf_download, minimum_access_tier, created_by, workspace_id)
    values (?, ?, 60, 1, 0, ?, ?, ?)
  `).bind(id, title, tier, createdBy, workspaceId).run()
  await env.DB.batch([
    env.DB.prepare('insert into exercise_grades (exercise_id, grade) values (?, 10)').bind(id),
    ...schema.map(row => env.DB.prepare(`
      insert into answer_schemas (exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, row.q_id, row.section_key, row.section_title, row.local_number, row.sub_id, row.type, row.correct_answer, row.max_score_hundredths)),
  ])
  if (!ready) return {}

  await env.BUCKET.put(`exercises/${id}/source.pdf`, `source ${id}`, { httpMetadata: { contentType: 'application/pdf' } })
  await env.BUCKET.put(`exercises/${id}/answer.pdf`, `answer ${id}`, { httpMetadata: { contentType: 'application/pdf' } })
  const source = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'exercise_pdf', ?, ?, 100)
  `).bind(id, `exercises/${id}/source.pdf`, `source-${id}.pdf`).run()
  const answer = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'solution_pdf', ?, ?, 100)
  `).bind(id, `exercises/${id}/answer.pdf`, `answer-${id}.pdf`).run()
  const set = await env.DB.prepare(`
    insert into exercise_question_asset_sets (exercise_id, source_file_id, answer_source_file_id, detector_version, detection_method, confirmed_by, confirmed_at)
    values (?, ?, ?, 'test', 'text', ?, current_timestamp)
  `).bind(id, source.meta.last_row_id, answer.meta.last_row_id, createdBy).run()
  await env.DB.batch([
    ...schema.map(row => env.DB.prepare(`
      insert into exercise_question_answer_schemas (asset_set_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(set.meta.last_row_id, row.q_id, row.section_key, row.section_title, row.local_number, row.sub_id, row.type, row.correct_answer, row.max_score_hundredths)),
    ...schema.map(row => env.DB.prepare(`
      insert into exercise_question_assets (asset_set_id, q_id, segment_index, source_kind, source_page, x, y, width, height, r2_key, mime_type, file_size, pixel_width, pixel_height, confidence)
      values (?, ?, 0, 'pdf_crop', 1, 0, 0, 1, 1, ?, 'image/png', 3, 100, 100, 0.99)
    `).bind(set.meta.last_row_id, row.q_id, `exercises/${id}/q${row.q_id}.png`)),
    env.DB.prepare('update exercises set active_question_asset_set_id = ? where id = ?').bind(set.meta.last_row_id, id),
  ])
  await Promise.all(schema.map(row => env.BUCKET.put(`exercises/${id}/q${row.q_id}.png`, new Uint8Array([id, row.q_id, 7]))))
  return { setId: set.meta.last_row_id }
}

async function resetRows() {
  await env.DB.batch([
    env.DB.prepare('delete from submission_answers'),
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from exercise_question_answer_assets'),
    env.DB.prepare('delete from exercise_question_assets'),
    env.DB.prepare('delete from exercise_question_answer_schemas'),
    env.DB.prepare('delete from exercise_question_asset_sets'),
    env.DB.prepare('delete from exercise_files'),
    env.DB.prepare('delete from answer_schemas'),
    env.DB.prepare('delete from exercise_grades'),
    env.DB.prepare('delete from exercises'),
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from users'),
  ])
}

beforeEach(async () => {
  await resetRows()
  await seedUser({ id: 101, name: 'Teacher', phone: '+84900000101' })
  await seedMembership({ userId: 101, role: 'teacher', grades: [] })
  await seedUser({ id: 102, name: 'English Teacher', phone: '+84900000102' })
  await seedMembership({ userId: 102, workspaceId: 'english', role: 'teacher', grades: [] })
  await seedUser({ id: 103, name: 'Admin', phone: '+84900000103', platformRole: 'platform_admin' })
  await seedMembership({ userId: 103, role: 'student' })
  await seedUser({ id: 201, name: 'Student', phone: '+84900000201' })
  await seedMembership({ userId: 201 })
  await seedUser({ id: 202, name: 'Pending', phone: '+84900000202' })
  await seedMembership({ userId: 202, status: 'pending' })
  await seedUser({ id: 203, name: 'Disabled member', phone: '+84900000203' })
  await seedMembership({ userId: 203, status: 'disabled' })
  await seedUser({ id: 204, name: 'No membership', phone: '+84900000204' })
  await seedUser({ id: 205, name: 'Globally disabled', phone: '+84900000205', disabledAt: '2026-01-01 00:00:00' })
  await seedMembership({ userId: 205 })

  await seedExercise({ id: 501, title: 'Guest ready' })
  await seedExercise({ id: 502, title: 'Standard ready', tier: 'standard' })
  await seedExercise({ id: 503, title: 'VIP ready', tier: 'vip' })
  await seedExercise({ id: 504, title: 'Guest unready', ready: false })
  await seedExercise({ id: 601, title: 'English guest', workspaceId: 'english', createdBy: 102 })
})

describe('public guest exercises', () => {
  it('lists and details only ready Guest exercises without credentials', async () => {
    const list = await api('/exercises')
    expect(list.status).toBe(200)
    expect(list.headers.get('Cache-Control')).toBe('private, no-store')
    const listBody = await list.json()
    expect(listBody.data).toEqual([expect.objectContaining({ id: 501, workspace_id: 'maths' })])

    const detail = await api('/exercises/501')
    expect(detail.status).toBe(200)
    const data = (await detail.json()).data
    expect(data).toMatchObject({ id: 501, workspace_id: 'maths', minimum_access_tier: 'guest', question_count: 2 })
    expect(data.schema[0]).toMatchObject({ q_id: 1, correct_answer: 'B', max_score_hundredths: 500 })
    expect(data.question_assets[0].file_url).toMatch(/^\/api\/public\/question-assets\//)
    expect(data).not.toHaveProperty('files')
    expect(data).not.toHaveProperty('can_start_attempt')
  })

  it('hides non-Guest, unready and foreign exercises from anonymous public reads', async () => {
    for (const id of [502, 503, 504, 601, 999]) {
      const res = await api(`/exercises/${id}`)
      expect(res.status).toBe(404)
    }
    const englishList = await api('/exercises', {}, 'english-api.test')
    expect((await englishList.json()).data.map(exercise => exercise.id)).toEqual([601])
  })

  it('streams only active Guest question images and source PDFs', async () => {
    const detail = await api('/exercises/501')
    const assetId = (await detail.json()).data.question_assets[0].id
    const image = await api(`/question-assets/${assetId}`)
    expect(image.status).toBe(200)
    expect(image.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([501 % 256, 1, 7]))

    const source = await api('/exercises/501/exercise-pdf')
    expect(source.status).toBe(200)
    expect(new TextDecoder().decode(await source.arrayBuffer())).toBe('source 501')
  })

  it('rejects public PDFs for restricted, unready, foreign, and missing exercises', async () => {
    for (const id of [502, 503, 504, 601, 999]) {
      const response = await api(`/exercises/${id}/exercise-pdf`)
      expect(response.status).toBe(404)
    }
  })

  it('rejects public images from inactive or restricted asset sets', async () => {
    const standardDetail = await env.DB.prepare(`
      select image.id from exercise_question_assets image
      join exercise_question_asset_sets asset_set on asset_set.id = image.asset_set_id
      where asset_set.exercise_id = 502 limit 1
    `).first()
    expect((await api(`/question-assets/${standardDetail.id}`)).status).toBe(404)

    const oldSet = await seedExercise({ id: 505, title: 'Replacement guest' })
    const oldAsset = await env.DB.prepare('select id from exercise_question_assets where asset_set_id = ? limit 1').bind(oldSet.setId).first()
    await seedExercise({ id: 506, title: 'Other guest' })
    await env.DB.prepare('update exercises set active_question_asset_set_id = (select active_question_asset_set_id from exercises where id = 506) where id = 505').run()
    expect((await api(`/question-assets/${oldAsset.id}`)).status).toBe(404)
  })

  it('preserves authentication and membership errors instead of falling back to Guest', async () => {
    const invalid = await api('/exercises', { headers: { Authorization: 'Bearer not-a-token' } })
    expect(invalid.status).toBe(401)

    const cases = [
      [202, 403, 'MEMBERSHIP_PENDING'],
      [203, 403, 'MEMBERSHIP_DISABLED'],
      [204, 403, 'MEMBERSHIP_REQUIRED'],
      [205, 403, 'ACCOUNT_DISABLED'],
    ]
    for (const [userId, status, code] of cases) {
      const response = await api('/exercises', { headers: { Authorization: await bearer(userId) } })
      expect(response.status).toBe(status)
      expect((await response.json()).error.code).toBe(code)
    }
  })

  it('returns the Guest-filtered response for active students, teachers and administrators', async () => {
    for (const userId of [101, 103, 201]) {
      const response = await api('/exercises', { headers: { Authorization: await bearer(userId) } })
      expect(response.status).toBe(200)
      expect((await response.json()).data.map(exercise => exercise.id)).toEqual([501])
    }
  })
})

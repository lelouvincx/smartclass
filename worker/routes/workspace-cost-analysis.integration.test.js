import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'

function testEnv() {
  return { ...env, APP_ENV: 'test', JWT_SECRET: 'workspace-secret', JWT_EXPIRES_IN: '1h' }
}

function api(path, options = {}, host = 'maths-api.test') {
  return app.request(`http://${host}/api/cost-analysis${path}`, options, testEnv())
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

async function seedReadyExercise({
  id,
  title,
  workspaceId = 'maths',
  tier = 'guest',
  confirmed = true,
  active = true,
  schemaRows = [
    { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'A', max_score_hundredths: 400 },
    { q_id: 2, sub_id: 'a', type: 'boolean', correct_answer: '1', max_score_hundredths: 150 },
    { q_id: 2, sub_id: 'b', type: 'boolean', correct_answer: '0', max_score_hundredths: 150 },
    { q_id: 2, sub_id: 'c', type: 'boolean', correct_answer: '1', max_score_hundredths: 150 },
    { q_id: 2, sub_id: 'd', type: 'boolean', correct_answer: '0', max_score_hundredths: 150 },
  ],
  assetSizes = [11, 13, 17],
  pdfSize = 101,
  createdBy = 101,
} = {}) {
  await env.DB.prepare(`
    insert into exercises (id, title, duration_minutes, max_attempts, allow_answer_pdf_download, minimum_access_tier, created_by, workspace_id)
    values (?, ?, 45, 1, 0, ?, ?, ?)
  `).bind(id, title, tier, createdBy, workspaceId).run()
  await env.DB.prepare('insert into exercise_grades (exercise_id, grade) values (?, 10)').bind(id).run()
  const source = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'exercise_pdf', ?, ?, ?)
  `).bind(id, `exercises/${id}/source.pdf`, `source-${id}.pdf`, pdfSize).run()
  const solution = await env.DB.prepare(`
    insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
    values (?, 'solution_pdf', ?, ?, 9999)
  `).bind(id, `exercises/${id}/solution.pdf`, `solution-${id}.pdf`).run()
  const assetSet = await env.DB.prepare(`
    insert into exercise_question_asset_sets (exercise_id, source_file_id, answer_source_file_id, detector_version, detection_method, confirmed_by, confirmed_at)
    values (?, ?, ?, 'test', 'text', ?, ${confirmed ? 'current_timestamp' : 'null'})
  `).bind(id, source.meta.last_row_id, solution.meta.last_row_id, confirmed ? createdBy : null).run()
  await env.DB.batch([
    ...schemaRows.map(row => env.DB.prepare(`
      insert into exercise_question_answer_schemas (asset_set_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths)
      values (?, ?, 'main', null, ?, ?, ?, ?, ?)
    `).bind(assetSet.meta.last_row_id, row.q_id, row.q_id, row.sub_id, row.type, row.correct_answer, row.max_score_hundredths)),
    ...assetSizes.map((size, index) => env.DB.prepare(`
      insert into exercise_question_assets (asset_set_id, q_id, segment_index, source_kind, source_page, x, y, width, height, r2_key, mime_type, file_size, pixel_width, pixel_height, confidence)
      values (?, ?, ?, 'pdf_crop', 1, 0, 0, 1, 1, ?, 'image/png', ?, 100, 100, 0.99)
    `).bind(assetSet.meta.last_row_id, index === 2 ? 2 : 1, index, `exercises/${id}/asset-${index}.png`, size)),
    env.DB.prepare(`
      insert into exercise_question_answer_assets (asset_set_id, q_id, segment_index, r2_key, mime_type, file_size, pixel_width, pixel_height)
      values (?, 1, 0, ?, 'image/png', 8888, 100, 100)
    `).bind(assetSet.meta.last_row_id, `exercises/${id}/answer-asset.png`),
  ])
  if (active) {
    await env.DB.prepare('update exercises set active_question_asset_set_id = ? where id = ?').bind(assetSet.meta.last_row_id, id).run()
  }
  return { assetSetId: assetSet.meta.last_row_id }
}

async function seedLecture({ id, workspaceId = 'maths', tier = 'guest', visible = 1, placed = true }) {
  await env.DB.prepare(`
    insert into lectures (id, title, section_name, youtube_url, order_index, created_by, is_visible, minimum_access_tier, workspace_id)
    values (?, ?, 'Section', 'https://youtu.be/abcdefghijk', ?, 101, ?, ?, ?)
  `).bind(id, `Lecture ${id}`, id, visible, tier, workspaceId).run()
  if (!placed) return
  const topic = await env.DB.prepare(`
    insert into curriculum_topics (workspace_id, programme, title, order_index)
    values (?, 10, ?, ?)
  `).bind(workspaceId, `Topic ${id}`, id).run()
  const lesson = await env.DB.prepare(`
    insert into curriculum_lessons (workspace_id, topic_id, title, order_index)
    values (?, ?, ?, ?)
  `).bind(workspaceId, topic.meta.last_row_id, `Lesson ${id}`, id).run()
  await env.DB.prepare(`
    insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index)
    values (?, ?, ?, 0)
  `).bind(workspaceId, lesson.meta.last_row_id, id).run()
}

async function resetRows() {
  await env.DB.prepare('update exercises set active_question_asset_set_id = null').run()
  await env.DB.prepare('update submissions set question_asset_set_id = null').run()
  await env.DB.batch([
    env.DB.prepare('delete from submission_answers'),
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from lecture_placements'),
    env.DB.prepare('delete from curriculum_lessons'),
    env.DB.prepare('delete from curriculum_topics'),
    env.DB.prepare('delete from lectures'),
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
  await seedUser({ id: 104, name: 'Disabled Admin', phone: '+84900000104', platformRole: 'platform_admin', disabledAt: '2026-01-01 00:00:00' })
  await seedUser({ id: 201, name: 'Student', phone: '+84900000201' })
  await seedMembership({ userId: 201 })

  await seedReadyExercise({ id: 501, title: 'Guest ready' })
  await seedReadyExercise({ id: 502, title: 'Standard ready', tier: 'standard' })
  await seedReadyExercise({ id: 503, title: 'Unconfirmed guest', confirmed: false })
  await seedReadyExercise({ id: 504, title: 'Inactive guest', active: false })
  await seedReadyExercise({ id: 601, title: 'English guest', workspaceId: 'english', createdBy: 102, pdfSize: null, assetSizes: [19] })
  await seedLecture({ id: 701 })
  await seedLecture({ id: 702 })
  await seedLecture({ id: 703, placed: false })
  await seedLecture({ id: 704, visible: 0 })
  await seedLecture({ id: 705, tier: 'standard' })
  await seedLecture({ id: 801, workspaceId: 'english' })
})

describe('workspace cost analysis', () => {
  it('returns Guest delivery inventory for the current workspace to administrators only', async () => {
    const response = await api('/guest-inventory', { headers: { Authorization: await bearer(103) } })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const data = (await response.json()).data
    expect(data).toMatchObject({
      version: 1,
      workspace_id: 'maths',
      guest_lectures: { public_placed_count: 2 },
      totals: {
        guest_exercise_count: 1,
        question_asset_count: 3,
        question_asset_recorded_bytes: 41,
        exercise_pdf_total_count: 1,
        exercise_pdf_known_count: 1,
        exercise_pdf_recorded_bytes: 101,
        exercise_pdf_unknown_count: 0,
        schema_row_count: 5,
        question_count: 2,
      },
    })
    expect(data.guest_exercises).toEqual([
      expect.objectContaining({
        id: 501,
        title: 'Guest ready',
        question_assets: { count: 3, recorded_bytes: 41 },
        exercise_pdf: { metadata_present: true, recorded_bytes: 101 },
        schema: { row_count: 5, question_count: 2 },
      }),
    ])
    expect(JSON.stringify(data)).not.toContain('9999')
    expect(JSON.stringify(data)).not.toContain('8888')
    expect(data.notes).toContain('estimate_not_invoice')
  })

  it('keeps workspace inventory isolated and preserves unknown PDF metadata', async () => {
    const response = await api('/guest-inventory', { headers: { Authorization: await bearer(103, 'english') } }, 'english-api.test')

    expect(response.status).toBe(200)
    const data = (await response.json()).data
    expect(data.workspace_id).toBe('english')
    expect(data.guest_exercises).toEqual([
      expect.objectContaining({
        id: 601,
        exercise_pdf: { metadata_present: false, recorded_bytes: null },
      }),
    ])
    expect(data.totals).toMatchObject({
      guest_exercise_count: 1,
      exercise_pdf_total_count: 1,
      exercise_pdf_known_count: 0,
      exercise_pdf_unknown_count: 1,
      question_asset_recorded_bytes: 19,
    })
    expect(data.guest_lectures.public_placed_count).toBe(1)
  })

  it('rejects teachers, students, missing, malformed and disabled credentials', async () => {
    const cases = [
      [{}, 401, 'UNAUTHORIZED'],
      [{ headers: { Authorization: 'Bearer not-a-token' } }, 401, 'UNAUTHORIZED'],
      [{ headers: { Authorization: await bearer(101) } }, 403, 'FORBIDDEN'],
      [{ headers: { Authorization: await bearer(201) } }, 403, 'FORBIDDEN'],
      [{ headers: { Authorization: await bearer(104) } }, 403, 'ACCOUNT_DISABLED'],
    ]

    for (const [options, status, code] of cases) {
      const response = await api('/guest-inventory', options)
      expect(response.status).toBe(status)
      expect((await response.json()).error.code).toBe(code)
    }
  })

  it('returns an empty inventory when the workspace has no ready Guest content', async () => {
    await resetRows()
    await seedUser({ id: 103, name: 'Admin', phone: '+84900000103', platformRole: 'platform_admin' })

    const response = await api('/guest-inventory', { headers: { Authorization: await bearer(103) } })

    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({
      guest_exercises: [],
      guest_lectures: { public_placed_count: 0 },
      totals: { guest_exercise_count: 0, question_asset_count: 0, exercise_pdf_total_count: 0, exercise_pdf_unknown_count: 0 },
    })
  })
})

import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'
import { app, setStudentGrades } from '../test/helpers.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'

async function token(userId, workspaceId = 'maths', overrides = {}) {
  return `Bearer ${await issueWorkspaceAccessToken({ ...env, JWT_SECRET: 'test-secret-key-for-integration-tests', JWT_EXPIRES_IN: '7d', ...overrides }, userId, workspaceId)}`
}

function jsonOptions(bearer, body, method = 'PUT') {
  return {
    method,
    headers: { Authorization: bearer, 'Content-Type': 'application/json', Origin: 'http://maths.test' },
    body: JSON.stringify(body),
  }
}

function teacherRequest(path, method, body, bearer) {
  return app.request(`/api/lectures${path === '/' ? '' : path}`, jsonOptions(bearer, body, method), env)
}

async function seedUser({ id, name, phone, role = 'student', disabledAt = null }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, access_tier, disabled_at)
    values (?, ?, ?, ?, ?, 'active', 'standard', ?)
  `).bind(id, name, phone, PASSWORD_HASH, role, disabledAt).run()
}

async function seedMembership({ userId, role = 'student', status = 'active', accessTier = 'standard', grades = [] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
    values ('maths', ?, ?, ?, ?)
  `).bind(userId, role, status, accessTier).run()
  if (grades.length > 0) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare(`
      insert into workspace_membership_grades (membership_id, grade) values (?, ?)
    `).bind(result.meta.last_row_id, grade)))
  }
}

async function seedLecture({ id, title, tier = 'standard', visible = true }) {
  await env.DB.prepare(`
    insert into lectures (id, workspace_id, title, section_name, youtube_url, order_index, is_visible, minimum_access_tier, created_by)
    values (?, 'maths', ?, 'Curriculum', ?, 0, ?, ?, 101)
  `).bind(id, title, `https://youtu.be/${String(id).padStart(11, 'a')}`, Number(visible), tier).run()
}

async function seedTopic({ id, programme, title, orderIndex }) {
  await env.DB.prepare('insert into curriculum_topics (id, workspace_id, programme, title, order_index) values (?, \'maths\', ?, ?, ?)')
    .bind(id, programme, title, orderIndex).run()
}

async function seedLesson({ id, topicId, title, orderIndex }) {
  await env.DB.prepare('insert into curriculum_lessons (id, workspace_id, topic_id, title, order_index) values (?, \'maths\', ?, ?, ?)')
    .bind(id, topicId, title, orderIndex).run()
}

async function seedPlacement({ id, lessonId, lectureId, orderIndex }) {
  await env.DB.prepare('insert into lecture_placements (id, workspace_id, lesson_id, lecture_id, order_index) values (?, \'maths\', ?, ?, ?)')
    .bind(id, lessonId, lectureId, orderIndex).run()
}

async function resetRows() {
  await env.DB.batch([
    env.DB.prepare('delete from lecture_placements'),
    env.DB.prepare('delete from curriculum_lessons'),
    env.DB.prepare('delete from curriculum_topics'),
    env.DB.prepare('delete from lecture_grades'),
    env.DB.prepare('delete from lectures'),
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from student_grades'),
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from answer_schemas'),
    env.DB.prepare('delete from exercises'),
    env.DB.prepare('delete from users'),
    env.DB.prepare("update workspaces set curriculum_revision = 0 where id = 'maths'"),
  ])
}

async function seedFixture() {
  await resetRows()
  await seedUser({ id: 101, name: 'Teacher', phone: '+84865481769', role: 'teacher' })
  await seedMembership({ userId: 101, role: 'teacher' })
  await seedUser({ id: 201, name: 'Student', phone: '+84911111111' })
  await seedMembership({ userId: 201, accessTier: 'standard', grades: [10] })

  await seedTopic({ id: 501, programme: 10, title: 'Grade 10', orderIndex: 0 })
  await seedTopic({ id: 502, programme: 12, title: 'Grade 12', orderIndex: 0 })
  await seedTopic({ id: 503, programme: 'dgnl', title: 'ĐGNL', orderIndex: 0 })
  await seedLesson({ id: 701, topicId: 501, title: 'Lesson 10', orderIndex: 0 })
  await seedLesson({ id: 702, topicId: 502, title: 'Lesson 12', orderIndex: 0 })
  await seedLesson({ id: 703, topicId: 503, title: 'Lesson ĐGNL', orderIndex: 0 })
  await seedLecture({ id: 301, title: 'Guest visible', tier: 'guest' })
  await seedLecture({ id: 302, title: 'Standard ten', tier: 'standard' })
  await seedLecture({ id: 303, title: 'VIP ten', tier: 'vip' })
  await seedLecture({ id: 304, title: 'Hidden guest', tier: 'guest', visible: false })
  await seedLecture({ id: 305, title: 'Standard twelve', tier: 'standard' })
  await seedLecture({ id: 306, title: 'Shared DGNL', tier: 'standard' })
  await seedPlacement({ id: 901, lessonId: 701, lectureId: 301, orderIndex: 0 })
  await seedPlacement({ id: 902, lessonId: 701, lectureId: 302, orderIndex: 1 })
  await seedPlacement({ id: 903, lessonId: 701, lectureId: 303, orderIndex: 2 })
  await seedPlacement({ id: 904, lessonId: 701, lectureId: 304, orderIndex: 3 })
  await seedPlacement({ id: 905, lessonId: 702, lectureId: 305, orderIndex: 0 })
  await seedPlacement({ id: 906, lessonId: 703, lectureId: 306, orderIndex: 0 })
}

beforeEach(seedFixture)

describe('lectures API', () => {
  it('uses RFC-18 shared-video and placement contracts for create, edit, reorder, and delete', async () => {
    const teacher = await token(101)
    const createdResponse = await teacherRequest('/', 'POST', {
      title: 'Orb Lecture A',
      youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk',
      expected_revision: 0,
    }, teacher)
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json()).data.lecture
    expect(created).toMatchObject({ title: 'Orb Lecture A', minimum_access_tier: 'standard', grades: [], placements: [] })

    const updateResponse = await teacherRequest(`/${created.id}`, 'PUT', {
      title: 'Orb Lecture A revised',
      is_visible: false,
      expected_revision: 1,
    }, teacher)
    expect(updateResponse.status).toBe(200)
    expect((await updateResponse.json()).data.lecture).toMatchObject({ title: 'Orb Lecture A revised', is_visible: 0 })

    const placementResponse = await app.request('/api/curriculum/placements', jsonOptions(teacher, {
      lesson_id: 701,
      lecture_id: created.id,
      expected_revision: 2,
    }, 'POST'), env)
    expect(placementResponse.status).toBe(201)
    const placement = (await placementResponse.json()).data.placement

    const orderResponse = await app.request('/api/curriculum/order', jsonOptions(teacher, {
      parent_type: 'lesson',
      parent_id: 701,
      ids: [placement.id, 901, 902, 903, 904],
      expected_revision: 3,
    }), env)
    expect(orderResponse.status).toBe(200)
    await expect(env.DB.prepare('select id from lecture_placements where lesson_id = 701 order by order_index, id').all())
      .resolves.toMatchObject({ results: [{ id: placement.id }, { id: 901 }, { id: 902 }, { id: 903 }, { id: 904 }] })

    expect((await app.request(`/api/lectures/${created.id}?placement=${placement.id}`, {}, env)).status).toBe(404)
    expect((await teacherRequest(`/${created.id}`, 'DELETE', { expected_revision: 4 }, teacher)).status).toBe(200)
  })

  it('rejects non-YouTube URLs, obsolete lecture fields, and student mutations', async () => {
    const teacher = await token(101)
    const invalidResponse = await teacherRequest('/', 'POST', {
      title: 'Invalid URL',
      youtube_url: 'https://example.com/video',
      expected_revision: 0,
    }, teacher)
    expect(invalidResponse.status).toBe(400)

    const obsoleteResponse = await teacherRequest('/', 'POST', {
      title: 'Old shape',
      section_name: 'Chapter 1',
      youtube_url: 'https://youtu.be/abcdefghijk',
      expected_revision: 0,
    }, teacher)
    expect(obsoleteResponse.status).toBe(409)
    expect((await obsoleteResponse.json()).error.code).toBe('CURRICULUM_RELOAD_REQUIRED')

    const studentResponse = await app.request('/api/lectures', jsonOptions(await token(201), {
      title: 'Forbidden',
      youtube_url: 'https://youtu.be/forbidden01',
      expected_revision: 0,
    }, 'POST'), env)
    expect(studentResponse.status).toBe(403)
  })

  it('serves public curriculum instead of a public flat list and rejects invalid credentials', async () => {
    const publicList = await app.request('/api/lectures', {}, env)
    expect(publicList.status).toBe(401)

    const curriculum = await app.request('/api/curriculum?programme=10', {}, env)
    expect(curriculum.status).toBe(200)
    expect(curriculum.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await curriculum.json()).data.topics[0].lessons[0]).toMatchObject({ id: 701, unit_count: 1 })

    const invalidResponse = await app.request('/api/curriculum?programme=10', {
      headers: { Authorization: 'Bearer invalid-token' },
    }, env)
    expect(invalidResponse.status).toBe(401)

    const expired = await token(201, 'maths', { JWT_EXPIRES_IN: '0s' })
    const expiredResponse = await app.request('/api/curriculum?programme=10', {
      headers: { Authorization: expired },
    }, env)
    expect(expiredResponse.status).toBe(401)
  })

  it('returns 404 when updating a missing lecture and rejects obsolete grade edits', async () => {
    const teacher = await token(101)
    const missing = await teacherRequest('/999999', 'PUT', {
      title: 'Missing lecture',
      expected_revision: 0,
    }, teacher)
    expect(missing.status).toBe(404)

    const obsolete = await teacherRequest('/302', 'PUT', {
      title: 'Old grades',
      grades: [10, 11],
      expected_revision: 0,
    }, teacher)
    expect(obsolete.status).toBe(409)
    expect((await obsolete.json()).error.code).toBe('CURRICULUM_RELOAD_REQUIRED')
  })

  it('derives lecture programmes from placements and filters student access by programme overlap', async () => {
    await setStudentGrades(201, ['dgnl'])
    const teacherLibrary = await app.request('/api/lectures', { headers: { Authorization: await token(101) } }, env)
    expect(teacherLibrary.status).toBe(200)
    const library = (await teacherLibrary.json()).data.lectures
    expect(library.find((lecture) => lecture.id === 306).grades).toEqual(['dgnl'])

    const matching = await app.request('/api/lectures/306?placement=906', { headers: { Authorization: await token(201) } }, env)
    expect(matching.status).toBe(200)
    expect((await matching.json()).data.breadcrumb.programme).toBe('dgnl')

    const excluded = await app.request('/api/lectures/305?placement=905', { headers: { Authorization: await token(201) } }, env)
    expect(excluded.status).toBe(404)
  })

  it('defaults lecture minimum access to Standard, preserves it on omission, and validates explicit values', async () => {
    const teacher = await token(101)
    const createResponse = await teacherRequest('/', 'POST', {
      title: 'Tier defaults',
      youtube_url: 'https://youtu.be/tierdefault',
      expected_revision: 0,
    }, teacher)
    expect(createResponse.status).toBe(201)
    const lecture = (await createResponse.json()).data.lecture
    expect(lecture.minimum_access_tier).toBe('standard')

    const invalidCreateResponse = await teacherRequest('/', 'POST', {
      title: 'Invalid tier',
      youtube_url: 'https://youtu.be/invalidtier',
      minimum_access_tier: null,
      expected_revision: 1,
    }, teacher)
    expect(invalidCreateResponse.status).toBe(400)

    const updateResponse = await teacherRequest(`/${lecture.id}`, 'PUT', {
      title: 'Tier defaults revised',
      expected_revision: 1,
    }, teacher)
    expect(updateResponse.status).toBe(200)
    expect((await updateResponse.json()).data.lecture.minimum_access_tier).toBe('standard')

    for (const tier of [null, 'gold']) {
      const invalidResponse = await teacherRequest(`/${lecture.id}`, 'PUT', {
        minimum_access_tier: tier,
        expected_revision: 2,
      }, teacher)
      expect(invalidResponse.status).toBe(400)
    }

    const vipResponse = await teacherRequest(`/${lecture.id}`, 'PUT', {
      minimum_access_tier: 'vip',
      expected_revision: 2,
    }, teacher)
    expect(vipResponse.status).toBe(200)
    expect((await vipResponse.json()).data.lecture.minimum_access_tier).toBe('vip')
  })

  it('enforces visibility, minimum tier, and programme overlap for Guest, Standard, and VIP audiences', async () => {
    await setStudentGrades(201, [10])
    await env.DB.prepare("update workspace_memberships set access_tier = 'standard', status = 'active' where user_id = 201 and workspace_id = 'maths'").run()
    const standard = await token(201)

    expect((await app.request('/api/lectures/301?placement=901', {}, env)).status).toBe(200)
    expect((await app.request('/api/lectures/304?placement=904', {}, env)).status).toBe(404)
    expect((await app.request('/api/lectures/302?placement=902', { headers: { Authorization: standard } }, env)).status).toBe(200)
    expect((await app.request('/api/lectures/303?placement=903', { headers: { Authorization: standard } }, env)).status).toBe(404)
    expect((await app.request('/api/lectures/305?placement=905', { headers: { Authorization: standard } }, env)).status).toBe(404)

    await env.DB.prepare("update workspace_memberships set access_tier = 'vip' where user_id = 201 and workspace_id = 'maths'").run()
    expect((await app.request('/api/lectures/303?placement=903', { headers: { Authorization: standard } }, env)).status).toBe(200)
    expect((await app.request('/api/lectures/304?placement=904', { headers: { Authorization: await token(101) } }, env)).status).toBe(200)
  })

  it('uses live D1 student tier and status without issuing a new token', async () => {
    await setStudentGrades(201, [10])
    await env.DB.prepare("update workspace_memberships set access_tier = 'standard', status = 'active' where user_id = 201 and workspace_id = 'maths'").run()
    const student = await token(201)
    const request = () => app.request('/api/lectures/303?placement=903', {
      headers: { Authorization: student },
    }, env)

    expect((await request()).status).toBe(404)
    await env.DB.prepare("update workspace_memberships set access_tier = 'vip' where user_id = 201 and workspace_id = 'maths'").run()
    expect((await request()).status).toBe(200)

    await env.DB.prepare("update workspace_memberships set status = 'disabled' where user_id = 201 and workspace_id = 'maths'").run()
    const disabledResponse = await request()
    expect(disabledResponse.status).toBe(403)
    await expect(disabledResponse.json()).resolves.toMatchObject({ error: { code: 'MEMBERSHIP_DISABLED' } })

    await env.DB.prepare("update workspace_memberships set status = 'pending' where user_id = 201 and workspace_id = 'maths'").run()
    expect((await request()).status).toBe(403)
    await env.DB.prepare('delete from workspace_memberships where user_id = 201').run()
    expect((await request()).status).toBe(403)
    await env.DB.prepare('delete from users where id = 201').run()
    expect((await request()).status).toBe(401)
  })
})

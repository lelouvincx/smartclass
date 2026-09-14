import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../test/helpers.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'

async function token(userId, workspaceId = 'maths') {
  return `Bearer ${await issueWorkspaceAccessToken({ ...env, JWT_SECRET: 'test-secret-key-for-integration-tests', JWT_EXPIRES_IN: '7d' }, userId, workspaceId)}`
}

async function seedUser({ id, name, phone, role = 'student' }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, access_tier)
    values (?, ?, ?, ?, ?, 'active', 'standard')
  `).bind(id, name, phone, PASSWORD_HASH, role).run()
}

async function seedMembership({ userId, role = 'student', accessTier = 'standard', grades = [] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
    values ('maths', ?, ?, 'active', ?)
  `).bind(userId, role, accessTier).run()
  if (grades.length) {
    await env.DB.batch(grades.map((grade) => (
      env.DB.prepare('insert into workspace_membership_grades (membership_id, grade) values (?, ?)').bind(result.meta.last_row_id, grade)
    )))
  }
}

async function seedLecture({ id, title, tier = 'standard', visible = true }) {
  await env.DB.prepare(`
    insert into lectures (id, workspace_id, title, section_name, youtube_url, order_index, is_visible, minimum_access_tier, created_by)
    values (?, 'maths', ?, 'Legacy section', ?, ?, ?, ?, 101)
  `).bind(id, title, `https://youtu.be/${String(id).padStart(11, 'a')}`, id, Number(visible), tier).run()
}

async function seedTopic({ id, programme = 10, title = 'Topic', orderIndex = 0 }) {
  await env.DB.prepare('insert into curriculum_topics (id, workspace_id, programme, title, order_index) values (?, \'maths\', ?, ?, ?)')
    .bind(id, programme, title, orderIndex).run()
}

async function seedLesson({ id, topicId, title = 'Lesson', orderIndex = 0 }) {
  await env.DB.prepare('insert into curriculum_lessons (id, workspace_id, topic_id, title, order_index) values (?, \'maths\', ?, ?, ?)')
    .bind(id, topicId, title, orderIndex).run()
}

async function seedPlacement({ id, lessonId, lectureId, orderIndex = 0 }) {
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
    env.DB.prepare('delete from users'),
    env.DB.prepare("update workspaces set curriculum_revision = 0 where id = 'maths'"),
  ])
}

async function seedFixture() {
  await resetRows()
  await seedUser({ id: 101, name: 'Teacher', phone: '+84900000101', role: 'teacher' })
  await seedMembership({ userId: 101, role: 'teacher' })
  await seedUser({ id: 201, name: 'Standard Grade 10', phone: '+84900000201' })
  await seedMembership({ userId: 201, accessTier: 'standard', grades: [10] })

  await seedLecture({ id: 301, title: 'Guest placed', tier: 'guest' })
  await seedLecture({ id: 302, title: 'Standard placed', tier: 'standard' })
  await seedLecture({ id: 303, title: 'VIP placed', tier: 'vip' })
  await seedLecture({ id: 304, title: 'Hidden guest', tier: 'guest', visible: false })
  await seedLecture({ id: 305, title: 'Unplaced guest', tier: 'guest' })

  await seedTopic({ id: 501, programme: 10, title: 'Algebra', orderIndex: 0 })
  await seedTopic({ id: 502, programme: 10, title: 'Hidden topic', orderIndex: 1 })
  await seedLesson({ id: 701, topicId: 501, title: 'Linear equations', orderIndex: 0 })
  await seedLesson({ id: 702, topicId: 502, title: 'Hidden only', orderIndex: 0 })
  await seedPlacement({ id: 901, lessonId: 701, lectureId: 301, orderIndex: 0 })
  await seedPlacement({ id: 902, lessonId: 701, lectureId: 302, orderIndex: 1 })
  await seedPlacement({ id: 903, lessonId: 701, lectureId: 303, orderIndex: 2 })
  await seedPlacement({ id: 904, lessonId: 702, lectureId: 304, orderIndex: 0 })
}

beforeEach(seedFixture)

describe('mounted RFC-18 curriculum routes', () => {
  it('serves placed Guest curriculum and player contracts through the final worker app', async () => {
    const curriculum = await app.request('/api/curriculum?programme=10', {}, env)
    expect(curriculum.status).toBe(200)
    const curriculumBody = await curriculum.json()
    expect(curriculumBody.data.topics.map((topic) => topic.id)).toEqual([501])
    expect(curriculumBody.data.topics[0].lessons).toMatchObject([{ id: 701, unit_count: 1 }])
    expect(JSON.stringify(curriculumBody)).not.toContain('Standard placed')
    expect(JSON.stringify(curriculumBody)).not.toContain('Hidden topic')

    const lesson = await app.request('/api/curriculum/lessons/701', {}, env)
    expect(lesson.status).toBe(200)
    expect((await lesson.json()).data.units.map((unit) => unit.placement_id)).toEqual([901])

    const player = await app.request('/api/lectures/301?placement=901', {}, env)
    expect(player.status).toBe(200)
    const body = (await player.json()).data
    expect(body).toMatchObject({
      lecture: { id: 301, title: 'Guest placed', minimum_access_tier: 'guest' },
      placement: { id: 901, lesson_id: 701, order_index: 0 },
      breadcrumb: { programme: 10, topic_id: 501, lesson_id: 701 },
    })
    expect(body).toHaveProperty('previous', null)
    expect(body).toHaveProperty('next', null)
    expect(body.lecture).not.toHaveProperty('section_name')
    expect(body).not.toHaveProperty('grades')
  })

  it('serves manager navigation and reusable-video library through mounted routes', async () => {
    const teacher = await token(101)
    const curriculum = await app.request('/api/curriculum?programme=10', { headers: { Authorization: teacher } }, env)
    expect(curriculum.status).toBe(200)
    const curriculumBody = (await curriculum.json()).data
    expect(curriculumBody.revision).toBe(0)
    expect(curriculumBody.topics.map((topic) => topic.id)).toEqual([501, 502])
    expect(curriculumBody.topics[0].lessons[0]).toMatchObject({ id: 701, unit_count: 3 })

    const lesson = await app.request('/api/curriculum/lessons/701', { headers: { Authorization: teacher } }, env)
    expect(lesson.status).toBe(200)
    expect((await lesson.json()).data.units.map((unit) => unit.placement_id)).toEqual([901, 902, 903])

    const library = await app.request('/api/lectures', { headers: { Authorization: teacher } }, env)
    expect(library.status).toBe(200)
    const libraryBody = (await library.json()).data
    expect(libraryBody.revision).toBe(0)
    expect(libraryBody.lectures.find((lecture) => lecture.id === 301)).toMatchObject({
      id: 301,
      grades: [10],
      placements: [{ placement_id: 901, lesson_id: 701, topic_id: 501, programme: 10 }],
    })
    expect(libraryBody.lectures.find((lecture) => lecture.id === 305)).toMatchObject({ id: 305, grades: [], placements: [] })
  })

  it('does not expose the old public flat lecture list or old direct-player shape', async () => {
    const publicList = await app.request('/api/lectures', {}, env)
    expect(publicList.status).toBe(401)
    expect((await publicList.json()).error.code).toBe('UNAUTHORIZED')

    const student = await token(201)
    const player = await app.request('/api/lectures/302', { headers: { Authorization: student } }, env)
    expect(player.status).toBe(200)
    const body = (await player.json()).data
    expect(body.placement.id).toBe(902)
    expect(body.breadcrumb).toMatchObject({ programme: 10, lesson_id: 701 })
    expect(body.previous).toMatchObject({ placement_id: 901, lecture_id: 301 })
    expect(body.next).toBeNull()
    expect(body.lecture).not.toHaveProperty('section_name')
    expect(body.lecture).not.toHaveProperty('grades')

    const vip = await app.request('/api/lectures/303', { headers: { Authorization: student } }, env)
    expect(vip.status).toBe(404)
  })
})

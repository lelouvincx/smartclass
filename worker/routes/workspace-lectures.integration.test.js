import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'

function testEnv() {
  return {
    ...env,
    APP_ENV: 'test',
    JWT_SECRET: 'workspace-secret',
    JWT_EXPIRES_IN: '1h',
  }
}

function api(workspaceId, path = '', options = {}) {
  const host = workspaceId === 'english' ? 'english-api.test' : 'maths-api.test'
  return app.request(`http://${host}/api${path}`, options, testEnv())
}

async function bearer(userId, workspaceId = 'maths') {
  return `Bearer ${await issueWorkspaceAccessToken(testEnv(), userId, workspaceId)}`
}

function jsonOptions(token, body, method = 'PUT', origin = 'http://maths.test') {
  return {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  }
}

async function seedUser({ id, name, phone, platformRole = 'user', disabledAt = null }) {
  await env.DB.prepare(`
    insert into users (id, name, phone, password_hash, role, status, access_tier, platform_role, disabled_at)
    values (?, ?, ?, ?, 'student', 'active', 'standard', ?, ?)
  `).bind(id, name, phone, PASSWORD_HASH, platformRole, disabledAt).run()
}

async function seedMembership({ userId, workspaceId, role = 'student', status = 'active', accessTier = 'standard', grades = [] }) {
  const result = await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
    values (?, ?, ?, ?, ?)
  `).bind(workspaceId, userId, role, status, accessTier).run()
  if (grades.length > 0) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare(`
      insert into workspace_membership_grades (membership_id, grade) values (?, ?)
    `).bind(result.meta.last_row_id, grade)))
  }
  return result.meta.last_row_id
}

async function seedLecture({ id, workspaceId, title, visible = true, tier = 'standard', createdBy }) {
  await env.DB.prepare(`
    insert into lectures (id, title, section_name, youtube_url, order_index, is_visible, minimum_access_tier, created_by, workspace_id)
    values (?, ?, 'Curriculum', ?, 0, ?, ?, ?, ?)
  `).bind(id, title, `https://youtu.be/${String(id).padStart(11, 'a')}`, Number(visible), tier, createdBy, workspaceId).run()
}

async function seedTopic({ id, workspaceId, programme, title, orderIndex }) {
  await env.DB.prepare('insert into curriculum_topics (id, workspace_id, programme, title, order_index) values (?, ?, ?, ?, ?)')
    .bind(id, workspaceId, programme, title, orderIndex).run()
}

async function seedLesson({ id, workspaceId, topicId, title, orderIndex }) {
  await env.DB.prepare('insert into curriculum_lessons (id, workspace_id, topic_id, title, order_index) values (?, ?, ?, ?, ?)')
    .bind(id, workspaceId, topicId, title, orderIndex).run()
}

async function seedPlacement({ id, workspaceId, lessonId, lectureId, orderIndex }) {
  await env.DB.prepare('insert into lecture_placements (id, workspace_id, lesson_id, lecture_id, order_index) values (?, ?, ?, ?, ?)')
    .bind(id, workspaceId, lessonId, lectureId, orderIndex).run()
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
    env.DB.prepare('update workspaces set curriculum_revision = 0'),
  ])
}

async function seedFixture() {
  await resetRows()
  await seedUser({ id: 101, name: 'Maths Teacher', phone: '+84900000101' })
  await seedMembership({ userId: 101, workspaceId: 'maths', role: 'teacher' })
  await seedUser({ id: 102, name: 'English Teacher', phone: '+84900000102' })
  await seedMembership({ userId: 102, workspaceId: 'english', role: 'teacher' })
  await seedUser({ id: 103, name: 'Platform Admin', phone: '+84900000103', platformRole: 'platform_admin' })
  await seedUser({ id: 201, name: 'Maths Student', phone: '+84900000201' })
  await seedMembership({ userId: 201, workspaceId: 'maths', accessTier: 'standard', grades: [10] })
  await seedUser({ id: 202, name: 'English Student', phone: '+84900000202' })
  await seedMembership({ userId: 202, workspaceId: 'english', accessTier: 'vip', grades: [11] })
  await seedUser({ id: 203, name: 'Pending Student', phone: '+84900000203' })
  await seedMembership({ userId: 203, workspaceId: 'maths', status: 'pending', grades: [10] })
  await seedUser({ id: 204, name: 'Disabled Student', phone: '+84900000204' })
  await seedMembership({ userId: 204, workspaceId: 'maths', status: 'disabled', grades: [10] })
  await seedUser({ id: 205, name: 'No Membership', phone: '+84900000205' })
  await seedUser({ id: 206, name: 'Disabled Identity', phone: '+84900000206', disabledAt: '2026-09-10T00:00:00Z' })
  await seedMembership({ userId: 206, workspaceId: 'maths', grades: [10] })

  await seedLecture({ id: 301, workspaceId: 'maths', title: 'Maths guest', tier: 'guest', createdBy: 101 })
  await seedLecture({ id: 302, workspaceId: 'maths', title: 'Maths standard grade 10', tier: 'standard', createdBy: 101 })
  await seedLecture({ id: 303, workspaceId: 'maths', title: 'Maths vip grade 10', tier: 'vip', createdBy: 101 })
  await seedLecture({ id: 304, workspaceId: 'maths', title: 'Maths hidden guest', tier: 'guest', visible: false, createdBy: 101 })
  await seedLecture({ id: 401, workspaceId: 'english', title: 'English guest', tier: 'guest', createdBy: 102 })
  await seedLecture({ id: 402, workspaceId: 'english', title: 'English vip grade 11', tier: 'vip', createdBy: 102 })

  await seedTopic({ id: 501, workspaceId: 'maths', programme: 10, title: 'Maths 10', orderIndex: 0 })
  await seedLesson({ id: 701, workspaceId: 'maths', topicId: 501, title: 'Maths lesson', orderIndex: 0 })
  await seedTopic({ id: 601, workspaceId: 'english', programme: 10, title: 'English 10', orderIndex: 0 })
  await seedTopic({ id: 602, workspaceId: 'english', programme: 11, title: 'English 11', orderIndex: 0 })
  await seedLesson({ id: 801, workspaceId: 'english', topicId: 601, title: 'English lesson 10', orderIndex: 0 })
  await seedLesson({ id: 802, workspaceId: 'english', topicId: 602, title: 'English lesson 11', orderIndex: 0 })
  await seedPlacement({ id: 901, workspaceId: 'maths', lessonId: 701, lectureId: 301, orderIndex: 0 })
  await seedPlacement({ id: 902, workspaceId: 'maths', lessonId: 701, lectureId: 302, orderIndex: 1 })
  await seedPlacement({ id: 903, workspaceId: 'maths', lessonId: 701, lectureId: 303, orderIndex: 2 })
  await seedPlacement({ id: 904, workspaceId: 'maths', lessonId: 701, lectureId: 304, orderIndex: 3 })
  await seedPlacement({ id: 990, workspaceId: 'english', lessonId: 801, lectureId: 401, orderIndex: 0 })
  await seedPlacement({ id: 991, workspaceId: 'english', lessonId: 802, lectureId: 402, orderIndex: 0 })
}

async function placementState(ids) {
  const rows = await env.DB.prepare(`
    select id, lesson_id, lecture_id, order_index, workspace_id
    from lecture_placements
    where id in (${ids.map(() => '?').join(',')})
    order by id
  `).bind(...ids).all()
  return rows.results
}

beforeEach(seedFixture)

describe('workspace curriculum lecture routes', () => {
  it('serves placed current-workspace guest curriculum for guests and rejects invalid or wrong-site requests', async () => {
    const mathsGuest = await api('maths', '/curriculum?programme=10')
    expect(mathsGuest.status).toBe(200)
    expect((await mathsGuest.json()).data.topics.map((topic) => topic.id)).toEqual([501])

    const englishGuest = await api('english', '/curriculum?programme=10')
    expect(englishGuest.status).toBe(200)
    expect((await englishGuest.json()).data.topics.map((topic) => topic.id)).toEqual([601])

    expect((await api('maths', '/curriculum?programme=10', { headers: { Authorization: 'Bearer invalid' } })).status).toBe(401)
    expect((await app.request('http://unknown-api.test/api/curriculum?programme=10', {}, testEnv())).status).toBe(404)
    expect((await api('maths', '/curriculum?programme=10', { headers: { Origin: 'http://english.test' } })).status).toBe(403)
  })

  it('denies authenticated pending, disabled, no-membership, and globally disabled users instead of guest fallback', async () => {
    for (const [userId, code] of [
      [203, 'MEMBERSHIP_PENDING'],
      [204, 'MEMBERSHIP_DISABLED'],
      [205, 'MEMBERSHIP_REQUIRED'],
      [206, 'ACCOUNT_DISABLED'],
    ]) {
      const response = await api('maths', '/lectures/301?placement=901', { headers: { Authorization: await bearer(userId) } })
      expect(response.status).toBe(403)
      expect((await response.json()).error.code).toBe(code)
    }
  })

  it('uses active student live membership tier and programmes, while managers get the workspace library only', async () => {
    const studentToken = await bearer(201)
    expect((await api('maths', '/lectures/302?placement=902', { headers: { Authorization: studentToken } })).status).toBe(200)
    expect((await api('maths', '/lectures/303?placement=903', { headers: { Authorization: studentToken } })).status).toBe(404)

    await env.DB.prepare(`
      update workspace_memberships set access_tier = 'vip'
      where workspace_id = 'maths' and user_id = 201
    `).run()
    expect((await api('maths', '/lectures/303?placement=903', { headers: { Authorization: studentToken } })).status).toBe(200)

    const publicLibrary = await api('maths', '/lectures')
    expect(publicLibrary.status).toBe(401)
    const studentLibrary = await api('maths', '/lectures', { headers: { Authorization: studentToken } })
    expect(studentLibrary.status).toBe(403)

    const teacherLibrary = await api('maths', '/lectures', { headers: { Authorization: await bearer(101) } })
    expect((await teacherLibrary.json()).data.lectures.map((lecture) => lecture.id)).toEqual([301, 304, 302, 303])
    const adminLibrary = await api('english', '/lectures', { headers: { Authorization: await bearer(103, 'english') } })
    expect((await adminLibrary.json()).data.lectures.map((lecture) => lecture.id)).toEqual([401, 402])
  })

  it('mutations are scoped: foreign IDs return 404, leave English rows unchanged, and keep lists scoped', async () => {
    const teacher = await bearer(101)
    const before = await placementState([990, 991])
    const mathsBefore = await api('maths', '/lectures', { headers: { Authorization: teacher } })
    expect((await mathsBefore.json()).data.lectures.map((lecture) => lecture.id)).toEqual([301, 304, 302, 303])

    expect((await api('maths', '/lectures/401', jsonOptions(teacher, {
      title: 'Wrong workspace',
      expected_revision: 0,
    }))).status).toBe(404)
    expect((await api('maths', '/curriculum/placements/990', jsonOptions(teacher, {
      lesson_id: 701,
      expected_revision: 0,
    }))).status).toBe(404)
    expect((await api('maths', '/lectures/401', {
      method: 'DELETE',
      headers: { Authorization: teacher, 'Content-Type': 'application/json', Origin: 'http://maths.test' },
      body: JSON.stringify({ expected_revision: 0 }),
    })).status).toBe(404)

    expect(await placementState([990, 991])).toEqual(before)
    const englishAfter = await api('english', '/lectures', { headers: { Authorization: await bearer(102, 'english') } })
    expect((await englishAfter.json()).data.lectures.map((lecture) => lecture.id)).toEqual([401, 402])
  })

  it('rejects incomplete, missing-ID, or mixed-workspace order writes without changing order, then saves a complete order', async () => {
    const teacher = await bearer(101)
    const before = await placementState([901, 902, 903, 904, 990])

    for (const ids of [[902, 901, 903], [902, 901, 903, 999], [902, 901, 903, 904, 990]]) {
      const response = await api('maths', '/curriculum/order', jsonOptions(teacher, {
        parent_type: 'lesson',
        parent_id: 701,
        ids,
        expected_revision: 0,
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).error.code).toBe('INVALID_ORDER')
      expect(await placementState([901, 902, 903, 904, 990])).toEqual(before)
    }

    const response = await api('maths', '/curriculum/order', jsonOptions(teacher, {
      parent_type: 'lesson',
      parent_id: 701,
      ids: [904, 903, 902, 901],
      expected_revision: 0,
    }))
    expect(response.status).toBe(200)
    expect((await placementState([901, 902, 903, 904])).map((placement) => placement.order_index)).toEqual([3, 2, 1, 0])
  })

  it('validates new placed videos, missing and foreign parent IDs, and manager-only mutations', async () => {
    const teacher = await bearer(102, 'english')
    const invalidVideo = await api('english', '/curriculum/placements', jsonOptions(teacher, {
      lesson_id: 801,
      lecture: { title: 'Invalid URL', youtube_url: 'https://example.com/not-youtube' },
      expected_revision: 0,
    }, 'POST', 'http://english.test'))
    expect(invalidVideo.status).toBe(400)
    await expect(env.DB.prepare("select count(*) as count from lectures where title = 'Invalid URL'").first('count')).resolves.toBe(0)

    const missingLesson = await api('english', '/curriculum/placements', jsonOptions(teacher, {
      lesson_id: 999,
      lecture_id: 401,
      expected_revision: 0,
    }, 'POST', 'http://english.test'))
    expect(missingLesson.status).toBe(404)

    const foreignLecture = await api('english', '/curriculum/placements', jsonOptions(teacher, {
      lesson_id: 801,
      lecture_id: 301,
      expected_revision: 0,
    }, 'POST', 'http://english.test'))
    expect(foreignLecture.status).toBe(404)

    const wrongWorkspaceTeacher = await api('maths', '/curriculum/placements', jsonOptions(await bearer(102, 'maths'), {
      lesson_id: 701,
      lecture_id: 301,
      expected_revision: 0,
    }, 'POST'))
    expect(wrongWorkspaceTeacher.status).toBe(403)
    expect((await wrongWorkspaceTeacher.json()).error.code).toBe('MEMBERSHIP_REQUIRED')

    const student = await api('maths', '/curriculum/placements', jsonOptions(await bearer(201), {
      lesson_id: 701,
      lecture_id: 301,
      expected_revision: 0,
    }, 'POST'))
    expect(student.status).toBe(403)
    expect((await student.json()).error.code).toBe('FORBIDDEN')
  })

  it('allows exactly one concurrent placement create at a revision and leaves no partial loser writes', async () => {
    const teacher = await bearer(102, 'english')
    const responses = await Promise.all(['Concurrent first', 'Concurrent second'].map((title) => (
      api('english', '/curriculum/placements', jsonOptions(teacher, {
        lesson_id: 801,
        lecture: { title, youtube_url: `https://youtu.be/${title.replace(/\s/g, '').padEnd(11, '0').slice(0, 11)}` },
        expected_revision: 0,
      }, 'POST', 'http://english.test'))
    )))

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
    const bodies = await Promise.all(responses.map((response) => response.json()))
    expect(bodies.find((body) => body.success).data.revision).toBe(1)
    expect(bodies.find((body) => !body.success).error.code).toBe('CURRICULUM_CHANGED')
    await expect(env.DB.prepare("select count(*) as count from lectures where title like 'Concurrent %'").first('count')).resolves.toBe(1)
    await expect(env.DB.prepare("select count(*) as count from lecture_placements where lesson_id = 801 and lecture_id in (select id from lectures where title like 'Concurrent %')").first('count')).resolves.toBe(1)
  })

  it('rolls back a new shared video when the later placement insert fails', async () => {
    const teacher = await bearer(102, 'english')
    await env.DB.prepare(`
      create trigger workspace_lectures_reject_placement
      before insert on lecture_placements
      when new.lesson_id = 801
      begin
        select raise(abort, 'reject placement for rollback test');
      end
    `).run()

    try {
      const response = await api('english', '/curriculum/placements', jsonOptions(teacher, {
        lesson_id: 801,
        lecture: { title: 'Rollback lecture', youtube_url: 'https://youtu.be/rollback001' },
        expected_revision: 0,
      }, 'POST', 'http://english.test'))
      expect(response.status).toBe(500)
    } finally {
      await env.DB.prepare('drop trigger workspace_lectures_reject_placement').run()
    }

    await expect(env.DB.prepare("select count(*) as count from lectures where title = 'Rollback lecture'").first('count')).resolves.toBe(0)
    await expect(env.DB.prepare("select curriculum_revision from workspaces where id = 'english'").first('curriculum_revision')).resolves.toBe(0)
  })
})

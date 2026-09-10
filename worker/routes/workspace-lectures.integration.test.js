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
  return app.request(`http://${host}/api/lectures${path}`, options, testEnv())
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

async function seedLecture({
  id,
  workspaceId,
  title,
  section = 'Foundations',
  orderIndex,
  visible = true,
  tier = 'standard',
  grades = [10],
  createdBy = 101,
}) {
  await env.DB.prepare(`
    insert into lectures (
      id, title, section_name, youtube_url, order_index, is_visible, minimum_access_tier, created_by, workspace_id
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    title,
    section,
    `https://youtu.be/${String(id).padStart(11, 'a')}`,
    orderIndex,
    Number(visible),
    tier,
    createdBy,
    workspaceId,
  ).run()
  if (grades.length > 0) {
    await env.DB.batch(grades.map((grade) => env.DB.prepare(`
      insert into lecture_grades (lecture_id, grade) values (?, ?)
    `).bind(id, grade)))
  }
}

async function resetRows() {
  await env.DB.batch([
    env.DB.prepare('delete from lecture_grades'),
    env.DB.prepare('delete from lectures'),
    env.DB.prepare('delete from workspace_membership_grades'),
    env.DB.prepare('delete from workspace_memberships'),
    env.DB.prepare('delete from student_grades'),
    env.DB.prepare('delete from submissions'),
    env.DB.prepare('delete from answer_schemas'),
    env.DB.prepare('delete from exercises'),
    env.DB.prepare('delete from users'),
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

  await seedLecture({ id: 301, workspaceId: 'maths', title: 'Maths guest', orderIndex: 0, tier: 'guest', grades: [12] })
  await seedLecture({ id: 302, workspaceId: 'maths', title: 'Maths standard grade 10', orderIndex: 1, tier: 'standard', grades: [10] })
  await seedLecture({ id: 303, workspaceId: 'maths', title: 'Maths vip grade 10', orderIndex: 2, tier: 'vip', grades: [10] })
  await seedLecture({ id: 304, workspaceId: 'maths', title: 'Maths hidden guest', orderIndex: 3, tier: 'guest', visible: false, grades: [10] })
  await seedLecture({ id: 401, workspaceId: 'english', title: 'English guest', section: 'Grammar', orderIndex: 0, tier: 'guest', grades: [10], createdBy: 102 })
  await seedLecture({ id: 402, workspaceId: 'english', title: 'English vip grade 11', section: 'Grammar', orderIndex: 1, tier: 'vip', grades: [11], createdBy: 102 })
}

function jsonOptions(token, body, method = 'PUT', origin = 'http://maths.test') {
  return {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  }
}

async function lectureState(ids) {
  const rows = await env.DB.prepare(`
    select id, title, order_index, workspace_id
    from lectures
    where id in (${ids.map(() => '?').join(',')})
    order by id
  `).bind(...ids).all()
  const grades = await env.DB.prepare(`
    select lecture_id, grade
    from lecture_grades
    where lecture_id in (${ids.map(() => '?').join(',')})
    order by lecture_id, grade
  `).bind(...ids).all()
  return { lectures: rows.results, grades: grades.results }
}

beforeEach(async () => {
  await seedFixture()
})

describe('workspace lectures prepared router', () => {
  it('lists only current-workspace guest lectures for guests and rejects invalid or wrong-site requests', async () => {
    const mathsGuest = await api('maths')
    expect(mathsGuest.status).toBe(200)
    expect((await mathsGuest.json()).data.map((lecture) => lecture.id)).toEqual([301])

    const englishGuest = await api('english')
    expect(englishGuest.status).toBe(200)
    expect((await englishGuest.json()).data.map((lecture) => lecture.id)).toEqual([401])

    expect((await api('maths', '', { headers: { Authorization: 'Bearer invalid' } })).status).toBe(401)
    expect((await app.request('http://unknown-api.test/api/lectures', {}, testEnv())).status).toBe(404)
    expect((await api('maths', '', { headers: { Origin: 'http://english.test' } })).status).toBe(403)
  })

  it('denies authenticated pending, disabled, no-membership, and globally disabled users instead of guest fallback', async () => {
    for (const [userId, code] of [
      [203, 'MEMBERSHIP_PENDING'],
      [204, 'MEMBERSHIP_DISABLED'],
      [205, 'MEMBERSHIP_REQUIRED'],
      [206, 'ACCOUNT_DISABLED'],
    ]) {
      const response = await api('maths', '', { headers: { Authorization: await bearer(userId) } })
      expect(response.status).toBe(403)
      expect((await response.json()).error.code).toBe(code)
    }
  })

  it('uses active student live membership tier and programmes, while active teachers and platform admins see all current workspace lectures', async () => {
    const studentToken = await bearer(201)
    const mathsStudent = await api('maths', '', { headers: { Authorization: studentToken } })
    expect((await mathsStudent.json()).data.map((lecture) => lecture.id)).toEqual([301, 302])

    await env.DB.prepare(`
      update workspace_memberships set access_tier = 'vip'
      where workspace_id = 'maths' and user_id = 201
    `).run()
    expect((await (await api('maths', '', { headers: { Authorization: studentToken } })).json()).data.map((lecture) => lecture.id)).toEqual([301, 302, 303])

    const teacherIds = (await (await api('maths', '', { headers: { Authorization: await bearer(101) } })).json()).data.map((lecture) => lecture.id)
    expect(teacherIds).toEqual([301, 302, 303, 304])
    const adminIds = (await (await api('english', '', { headers: { Authorization: await bearer(103, 'english') } })).json()).data.map((lecture) => lecture.id)
    expect(adminIds).toEqual([401, 402])
  })

  it('mutations are scoped: foreign IDs return 404, leave English rows unchanged, and keep lists scoped', async () => {
    const teacher = await bearer(101)
    const before = await lectureState([401, 402])
    const mathsBefore = await api('maths', '', { headers: { Authorization: teacher } })
    expect((await mathsBefore.json()).data.map((lecture) => lecture.id)).toEqual([301, 302, 303, 304])

    expect((await api('maths', '/401', jsonOptions(teacher, {
      title: 'Wrong workspace',
      section_name: 'Nope',
      youtube_url: 'https://youtu.be/wrongspace1',
      grades: [12],
    }))).status).toBe(404)
    expect((await api('maths', '/401', { method: 'DELETE', headers: { Authorization: teacher } })).status).toBe(404)

    expect(await lectureState([401, 402])).toEqual(before)
    const englishAfter = await api('english', '', { headers: { Authorization: await bearer(102, 'english') } })
    expect((await englishAfter.json()).data.map((lecture) => lecture.id)).toEqual([401, 402])
  })

  it('rejects reordered lists with omissions, missing IDs, or mixed workspace IDs without changing order', async () => {
    const teacher = await bearer(101)
    const before = await lectureState([301, 302, 303, 304, 401])

    for (const ids of [[302, 301, 303], [302, 301, 303, 999], [302, 301, 303, 304, 401]]) {
      const response = await api('maths', '/order', jsonOptions(teacher, { ids }))
      expect(response.status).toBe(400)
      expect((await response.json()).error.code).toBe('INVALID_LECTURE_ORDER')
      expect(await lectureState([301, 302, 303, 304, 401])).toEqual(before)
    }

    const response = await api('maths', '/order', jsonOptions(teacher, { ids: [304, 303, 302, 301] }))
    expect(response.status).toBe(200)
    expect((await lectureState([301, 302, 303, 304])).lectures.map((lecture) => lecture.order_index)).toEqual([3, 2, 1, 0])
  })

  it('creates lectures in the current workspace with local next order, default tier and grades atomically', async () => {
    const teacher = await bearer(102, 'english')
    const response = await api('english', '', jsonOptions(teacher, {
      title: 'English standard default',
      section_name: 'Grammar',
      youtube_url: 'https://youtu.be/createeng01',
    }, 'POST', 'http://english.test'))

    expect(response.status).toBe(201)
    const created = (await response.json()).data
    expect(created).toMatchObject({
      title: 'English standard default',
      workspace_id: 'english',
      order_index: 2,
      minimum_access_tier: 'standard',
      grades: [10, 11, 12, 'dgnl'],
    })
    await expect(env.DB.prepare('select max(order_index) from lectures where workspace_id = ?').bind('maths').first('max(order_index)')).resolves.toBe(3)
  })

  it('allows concurrent lecture creates to return distinct generated IDs and preserve each lecture grades', async () => {
    const teacher = await bearer(102, 'english')
    const [firstResponse, secondResponse] = await Promise.all([
      api('english', '', jsonOptions(teacher, {
        title: 'Concurrent grade 10',
        section_name: 'Grammar',
        youtube_url: 'https://youtu.be/concur00001',
        grades: [10],
      }, 'POST', 'http://english.test')),
      api('english', '', jsonOptions(teacher, {
        title: 'Concurrent DGNL',
        section_name: 'Grammar',
        youtube_url: 'https://youtu.be/concur00002',
        grades: ['dgnl'],
      }, 'POST', 'http://english.test')),
    ])

    expect(firstResponse.status).toBe(201)
    expect(secondResponse.status).toBe(201)
    const first = (await firstResponse.json()).data
    const second = (await secondResponse.json()).data
    expect(first.id).not.toBe(second.id)
    expect(first).toMatchObject({ title: 'Concurrent grade 10', grades: [10], workspace_id: 'english' })
    expect(second).toMatchObject({ title: 'Concurrent DGNL', grades: ['dgnl'], workspace_id: 'english' })

    const listResponse = await api('english', '', { headers: { Authorization: teacher } })
    const createdByTitle = new Map((await listResponse.json()).data.map((lecture) => [lecture.title, lecture]))
    expect(createdByTitle.get('Concurrent grade 10')).toMatchObject({ id: first.id, grades: [10] })
    expect(createdByTitle.get('Concurrent DGNL')).toMatchObject({ id: second.id, grades: ['dgnl'] })
  })

  it('rolls back the lecture insert when a later grade insert fails', async () => {
    const teacher = await bearer(102, 'english')
    await env.DB.prepare(`
      create trigger workspace_lectures_reject_grade_11
      before insert on lecture_grades
      when new.grade = 11
      begin
        select raise(abort, 'reject grade for rollback test');
      end
    `).run()

    try {
      const response = await api('english', '', jsonOptions(teacher, {
        title: 'Rollback lecture',
        section_name: 'Grammar',
        youtube_url: 'https://youtu.be/rollback001',
        grades: [10, 11],
      }, 'POST', 'http://english.test'))
      expect(response.status).toBe(500)
    } finally {
      await env.DB.prepare('drop trigger workspace_lectures_reject_grade_11').run()
    }

    await expect(env.DB.prepare(`
      select count(*) as count
      from lectures
      where title = 'Rollback lecture'
    `).first('count')).resolves.toBe(0)
  })

  it('requires workspace management membership and never grants access from a teacher token for the wrong workspace', async () => {
    const wrongWorkspaceTeacher = await api('maths', '', jsonOptions(await bearer(102, 'maths'), {
      title: 'Nope',
      section_name: 'Nope',
      youtube_url: 'https://youtu.be/noaccess001',
    }, 'POST'))
    expect(wrongWorkspaceTeacher.status).toBe(403)
    expect((await wrongWorkspaceTeacher.json()).error.code).toBe('MEMBERSHIP_REQUIRED')

    const student = await api('maths', '', jsonOptions(await bearer(201), {
      title: 'Nope',
      section_name: 'Nope',
      youtube_url: 'https://youtu.be/noaccess002',
    }, 'POST'))
    expect(student.status).toBe(403)
    expect((await student.json()).error.code).toBe('FORBIDDEN')
  })
})

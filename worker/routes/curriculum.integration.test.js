import { Hono } from 'hono'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { requireWorkspace } from '../middleware/workspace.js'
import { optionalWorkspaceIdentity, requireWorkspaceIdentity, requireWorkspaceManagement } from '../middleware/workspace-auth.js'
import { issueWorkspaceAccessToken } from '../lib/workspace-auth.js'
import { batchWithRevision } from '../lib/curriculum.js'
import curriculumRoutes from './workspace-curriculum.js'
import curriculumLectureRoutes from './curriculum-lectures.js'

const PASSWORD_HASH = '$2b$10$cjeRekzD2GzbtRoxaVXj9ebzER0KjObLyqL89LeJ.zbpKBZhQ4maG'

function testEnv() {
  return { ...env, APP_ENV: 'test', JWT_SECRET: 'workspace-secret', JWT_EXPIRES_IN: '1h' }
}

function app() {
  const testApp = new Hono()
  testApp.use('/api/*', requireWorkspace)
  testApp.route('/api/curriculum', curriculumRoutes)
  testApp.route('/api/lectures', curriculumLectureRoutes)
  testApp.get('/api/guarded', optionalWorkspaceIdentity, (c) => c.json({ ok: true, user: c.get('authUser')?.id ?? null }))
  testApp.get('/api/managed', requireWorkspaceIdentity, requireWorkspaceManagement, (c) => c.json({ ok: true }))
  return testApp
}

function api(path, init = {}, origin = 'http://maths-api.test') {
  return app().request(`${origin}/api${path}`, init, testEnv())
}

function apiWithEnv(path, requestEnv, init = {}, origin = 'http://maths-api.test') {
  return app().request(`${origin}/api${path}`, init, requestEnv)
}

async function bearer(userId, workspaceId = 'maths') {
  return `Bearer ${await issueWorkspaceAccessToken(testEnv(), userId, workspaceId)}`
}

function jsonOptions(token, body, method = 'PUT', origin = 'http://maths.test') {
  return { method, headers: { Authorization: token, 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }
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
  if (grades.length) await env.DB.batch(grades.map((grade) => env.DB.prepare('insert into workspace_membership_grades (membership_id, grade) values (?, ?)').bind(result.meta.last_row_id, grade)))
  return result.meta.last_row_id
}

async function seedLecture({ id, workspaceId = 'maths', title, visible = true, tier = 'standard', createdBy = 101 }) {
  await env.DB.prepare(`
    insert into lectures (id, workspace_id, title, section_name, youtube_url, order_index, is_visible, minimum_access_tier, created_by)
    values (?, ?, ?, 'legacy', ?, 0, ?, ?, ?)
  `).bind(id, workspaceId, title, `https://youtu.be/${String(id).padStart(11, 'a')}`, Number(visible), tier, createdBy).run()
}

async function seedTopic({ id, workspaceId = 'maths', programme = 10, title, orderIndex }) {
  await env.DB.prepare('insert into curriculum_topics (id, workspace_id, programme, title, order_index) values (?, ?, ?, ?, ?)')
    .bind(id, workspaceId, programme, title, orderIndex).run()
}

async function seedLesson({ id, workspaceId = 'maths', topicId, title, orderIndex }) {
  await env.DB.prepare('insert into curriculum_lessons (id, workspace_id, topic_id, title, order_index) values (?, ?, ?, ?, ?)')
    .bind(id, workspaceId, topicId, title, orderIndex).run()
}

async function seedPlacement({ id, workspaceId = 'maths', lessonId, lectureId, orderIndex }) {
  await env.DB.prepare('insert into lecture_placements (id, workspace_id, lesson_id, lecture_id, order_index) values (?, ?, ?, ?, ?)')
    .bind(id, workspaceId, lessonId, lectureId, orderIndex).run()
}

function interleavingDbWrapper({ afterFirstTopicRead = false, afterFirstLectureListRead = false }) {
  let topicReadDone = false
  let lectureListReadDone = false
  return {
    ...env.DB,
    prepare(sql) {
      const statement = env.DB.prepare(sql)
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      return {
        bind(...args) {
          const bound = statement.bind(...args)
          return {
            all: async () => {
              const result = await bound.all()
              if (afterFirstTopicRead && !topicReadDone && normalized.startsWith('select id, programme, title, order_index from curriculum_topics')) {
                topicReadDone = true
                await env.DB.prepare('update workspaces set curriculum_revision = curriculum_revision + 1 where id = ?').bind('maths').run()
              }
              if (afterFirstLectureListRead && !lectureListReadDone && normalized.startsWith('select id from lectures')) {
                lectureListReadDone = true
                await env.DB.prepare('update workspaces set curriculum_revision = curriculum_revision + 1 where id = ?').bind('maths').run()
              }
              return result
            },
            first: (...firstArgs) => bound.first(...firstArgs),
            run: () => bound.run(),
          }
        },
        all: () => statement.all(),
        first: (...args) => statement.first(...args),
        run: () => statement.run(),
      }
    },
    batch(statements) {
      return env.DB.batch(statements)
    },
  }
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
    env.DB.prepare('update workspaces set curriculum_revision = 0'),
  ])
}

async function seedFixture() {
  await resetRows()
  await seedUser({ id: 101, name: 'Maths Teacher', phone: '+84900000101' })
  await seedMembership({ userId: 101, workspaceId: 'maths', role: 'teacher' })
  await seedUser({ id: 102, name: 'English Teacher', phone: '+84900000102' })
  await seedMembership({ userId: 102, workspaceId: 'english', role: 'teacher' })
  await seedUser({ id: 103, name: 'Admin', phone: '+84900000103', platformRole: 'platform_admin' })
  await seedUser({ id: 201, name: 'Standard 10', phone: '+84900000201' })
  await seedMembership({ userId: 201, workspaceId: 'maths', accessTier: 'standard', grades: [10] })
  await seedUser({ id: 202, name: 'VIP 11', phone: '+84900000202' })
  await seedMembership({ userId: 202, workspaceId: 'maths', accessTier: 'vip', grades: [11] })
  await seedUser({ id: 203, name: 'Pending', phone: '+84900000203' })
  await seedMembership({ userId: 203, workspaceId: 'maths', status: 'pending', grades: [10] })
  await seedUser({ id: 204, name: 'Disabled', phone: '+84900000204' })
  await seedMembership({ userId: 204, workspaceId: 'maths', status: 'disabled', grades: [10] })
  await seedUser({ id: 205, name: 'No Member', phone: '+84900000205' })

  await seedLecture({ id: 301, title: 'Guest visible', tier: 'guest' })
  await seedLecture({ id: 302, title: 'Standard ten', tier: 'standard' })
  await seedLecture({ id: 303, title: 'VIP ten', tier: 'vip' })
  await seedLecture({ id: 304, title: 'Hidden guest', tier: 'guest', visible: false })
  await seedLecture({ id: 305, title: 'Shared neighbour', tier: 'standard' })
  await seedLecture({ id: 306, title: 'Unplaced guest', tier: 'guest' })
  await seedLecture({ id: 401, workspaceId: 'english', title: 'Foreign', tier: 'guest', createdBy: 102 })

  await seedTopic({ id: 501, programme: 10, title: 'Topic 10', orderIndex: 0 })
  await seedTopic({ id: 502, programme: 10, title: 'Hidden-only topic', orderIndex: 1 })
  await seedTopic({ id: 503, programme: 11, title: 'Topic 11', orderIndex: 0 })
  await seedTopic({ id: 601, workspaceId: 'english', programme: 10, title: 'Foreign topic', orderIndex: 0 })
  await seedLesson({ id: 701, topicId: 501, title: 'Lesson 10 A', orderIndex: 0 })
  await seedLesson({ id: 702, topicId: 501, title: 'Lesson 10 B', orderIndex: 1 })
  await seedLesson({ id: 703, topicId: 502, title: 'Hidden lesson', orderIndex: 0 })
  await seedLesson({ id: 704, topicId: 503, title: 'Lesson 11', orderIndex: 0 })
  await seedLesson({ id: 801, workspaceId: 'english', topicId: 601, title: 'Foreign lesson', orderIndex: 0 })
  await seedPlacement({ id: 901, lessonId: 701, lectureId: 301, orderIndex: 0 })
  await seedPlacement({ id: 902, lessonId: 701, lectureId: 302, orderIndex: 1 })
  await seedPlacement({ id: 903, lessonId: 701, lectureId: 303, orderIndex: 2 })
  await seedPlacement({ id: 904, lessonId: 703, lectureId: 304, orderIndex: 0 })
  await seedPlacement({ id: 905, lessonId: 702, lectureId: 305, orderIndex: 0 })
  await seedPlacement({ id: 906, lessonId: 704, lectureId: 305, orderIndex: 0 })
  await seedPlacement({ id: 990, workspaceId: 'english', lessonId: 801, lectureId: 401, orderIndex: 0 })
}

beforeEach(seedFixture)

describe('unmounted RFC-18 curriculum routers', () => {
  it('lists curriculum by audience without leaking forbidden titles or counts, while managers see empty parents and revision', async () => {
    const guest = await api('/curriculum?programme=10')
    expect(guest.status).toBe(200)
    expect(guest.headers.get('Cache-Control')).toBe('private, no-store')
    const guestData = (await guest.json()).data
    expect(guestData).not.toHaveProperty('revision')
    expect(guestData.topics.map((topic) => topic.id)).toEqual([501])
    expect(guestData.topics[0].lessons.map((lesson) => [lesson.id, lesson.unit_count])).toEqual([[701, 1]])
    expect(JSON.stringify(guestData)).not.toContain('Standard ten')
    expect(JSON.stringify(guestData)).not.toContain('VIP ten')
    expect(JSON.stringify(guestData)).not.toContain('Hidden-only topic')

    const teacher = await api('/curriculum?programme=10', { headers: { Authorization: await bearer(101) } })
    const managerData = (await teacher.json()).data
    expect(managerData.revision).toBe(0)
    expect(managerData.topics.map((topic) => topic.id)).toEqual([501, 502])
    expect(managerData.topics[0].lessons.map((lesson) => [lesson.id, lesson.unit_count])).toEqual([[701, 3], [702, 1]])
  })

  it('returns lesson units, breadcrumbs, direct lecture context, and programme-scoped neighbours', async () => {
    const studentTen = await bearer(201)
    const lesson = await api('/curriculum/lessons/701', { headers: { Authorization: studentTen } })
    expect(lesson.status).toBe(200)
    expect((await lesson.json()).data.units.map((unit) => unit.placement_id)).toEqual([901, 902])

    const detail10 = await api('/lectures/305?placement=905', { headers: { Authorization: studentTen } })
    expect(detail10.status).toBe(200)
    const ten = (await detail10.json()).data
    expect(ten.placement.id).toBe(905)
    expect(ten.breadcrumb).toMatchObject({ programme: 10, topic_id: 501, lesson_id: 702 })
    expect(ten.previous.placement_id).toBe(902)
    expect(ten.next).toBeNull()

    const studentEleven = await bearer(202)
    const detail11 = await api('/lectures/305?placement=906', { headers: { Authorization: studentEleven } })
    expect(detail11.status).toBe(200)
    const eleven = (await detail11.json()).data
    expect(eleven.placement.id).toBe(906)
    expect(eleven.breadcrumb.programme).toBe(11)
    expect(eleven.previous).toBeNull()
    expect(eleven.next).toBeNull()
  })

  it('preserves auth errors and denies unplaced guest content except manager preview', async () => {
    expect((await api('/lectures/301', { headers: { Authorization: 'Bearer invalid' } })).status).toBe(401)
    for (const [userId, code] of [[203, 'MEMBERSHIP_PENDING'], [204, 'MEMBERSHIP_DISABLED'], [205, 'MEMBERSHIP_REQUIRED']]) {
      const res = await api('/lectures/301', { headers: { Authorization: await bearer(userId) } })
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe(code)
    }
    expect((await api('/lectures/306')).status).toBe(404)
    const managerPreview = await api('/lectures/306', { headers: { Authorization: await bearer(101) } })
    expect(managerPreview.status).toBe(200)
    expect((await managerPreview.json()).data.placement).toBeNull()
  })

  it('performs revision-checked management mutations and rolls back stale or invalid batches', async () => {
    const teacher = await bearer(101)
    const createdTopic = await api('/curriculum/topics', jsonOptions(teacher, { programme: 'thpt', title: 'THPT Topic', expected_revision: 0 }, 'POST'))
    expect(createdTopic.status).toBe(201)
    expect((await createdTopic.json()).data.revision).toBe(1)

    const stale = await api('/curriculum/lessons', jsonOptions(teacher, { topic_id: 501, title: 'Stale', expected_revision: 0 }, 'POST'))
    expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe('CURRICULUM_CHANGED')
    await expect(env.DB.prepare("select count(*) as count from curriculum_lessons where title = 'Stale'").first()).resolves.toEqual({ count: 0 })

    const badParent = await api('/curriculum/lessons', jsonOptions(teacher, { topic_id: 601, title: 'Foreign parent', expected_revision: 1 }, 'POST'))
    expect(badParent.status).toBe(404)
    await expect(env.DB.prepare('select curriculum_revision from workspaces where id = ?').bind('maths').first('curriculum_revision')).resolves.toBe(1)
  })

  it('creates and moves placements atomically, rejects duplicates, and preserves shared-video fields', async () => {
    const teacher = await bearer(101)
    const duplicate = await api('/curriculum/placements', jsonOptions(teacher, { lesson_id: 701, lecture_id: 302, expected_revision: 0 }, 'POST'))
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error.code).toBe('PLACEMENT_EXISTS')

    const created = await api('/curriculum/placements', jsonOptions(teacher, { lesson_id: 702, lecture: { title: 'New video', youtube_url: 'https://youtu.be/newvideo001', minimum_access_tier: 'standard', is_visible: true }, expected_revision: 0 }, 'POST'))
    expect(created.status).toBe(201)
    const placement = (await created.json()).data.placement
    expect(placement.lesson_id).toBe(702)
    expect(placement.order_index).toBe(1)
    await expect(env.DB.prepare('select count(*) as count from lecture_grades where lecture_id = ?').bind(placement.lecture_id).first()).resolves.toEqual({ count: 0 })

    const move = await api('/curriculum/placements/905', jsonOptions(teacher, { lesson_id: 701, expected_revision: 1 }))
    expect(move.status).toBe(200)
    await expect(env.DB.prepare('select title from lectures where id = 305').first('title')).resolves.toBe('Shared neighbour')
  })

  it('supports scoped complete reorders, nonempty delete conflicts, and reload-required lecture legacy fields', async () => {
    const teacher = await bearer(101)
    expect((await api('/curriculum/order', jsonOptions(teacher, { parent_type: 'lesson', parent_id: 701, ids: [902, 901, 903], expected_revision: 0 }))).status).toBe(200)
    await expect(env.DB.prepare('select id from lecture_placements where lesson_id = 701 order by order_index, id').all()).resolves.toMatchObject({ results: [{ id: 902 }, { id: 901 }, { id: 903 }] })
    const bad = await api('/curriculum/order', jsonOptions(teacher, { parent_type: 'lesson', parent_id: 701, ids: [902, 901], expected_revision: 1 }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe('INVALID_ORDER')
    const deleteTopic = await api('/curriculum/topics/501', { method: 'DELETE', headers: { Authorization: teacher, Origin: 'http://maths.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_revision: 1 }) })
    expect(deleteTopic.status).toBe(409)
    expect((await deleteTopic.json()).error.code).toBe('PARENT_NOT_EMPTY')
    const deleteLesson = await api('/curriculum/lessons/701', { method: 'DELETE', headers: { Authorization: teacher, Origin: 'http://maths.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_revision: 1 }) })
    expect(deleteLesson.status).toBe(409)
    expect((await deleteLesson.json()).error.code).toBe('PARENT_NOT_EMPTY')

    const obsolete = await api('/lectures/301', jsonOptions(teacher, { title: 'X', youtube_url: 'https://youtu.be/abcdefghijk', section_name: 'old', grades: [10], expected_revision: 1 }))
    expect(obsolete.status).toBe(409)
    expect((await obsolete.json()).error.code).toBe('CURRICULUM_RELOAD_REQUIRED')
    expect((await api('/lectures/order', jsonOptions(teacher, { ids: [301], expected_revision: 1 }))).status).toBe(409)
  })

  it('rejects unsafe JSON ids and invalid shared-video updates without coercion', async () => {
    const teacher = await bearer(101)
    for (const body of [
      { lesson_id: true, lecture_id: 301, expected_revision: 0 },
      { lesson_id: [701], lecture_id: 301, expected_revision: 0 },
      { lesson_id: '01', lecture_id: 301, expected_revision: 0 },
      { lesson_id: 701, lecture_id: '0301', expected_revision: 0 },
      { lesson_id: 701, lecture_id: 'bad', lecture: { title: 'New', youtube_url: 'https://youtu.be/abcdefghijk' }, expected_revision: 0 },
    ]) {
      const res = await api('/curriculum/placements', jsonOptions(teacher, body, 'POST'))
      expect(res.status).toBe(400)
    }
    expect((await api('/lectures/301', jsonOptions(teacher, { expected_revision: true, title: 'Bad' }))).status).toBe(400)
    expect((await api('/lectures/301', jsonOptions(teacher, { expected_revision: 0 }))).status).toBe(400)
    expect((await api('/lectures/301', jsonOptions(teacher, { expected_revision: 0, minimum_access_tier: null }))).status).toBe(400)
  })

  it('returns current parent and stale-revision errors for complete order writes without mutating', async () => {
    const teacher = await bearer(101)
    const missingLesson = await api('/curriculum/order', jsonOptions(teacher, { parent_type: 'lesson', parent_id: 999999, ids: [], expected_revision: 0 }))
    expect(missingLesson.status).toBe(404)
    const missingTopic = await api('/curriculum/order', jsonOptions(teacher, { parent_type: 'topic', parent_id: 601, ids: [], expected_revision: 0 }))
    expect(missingTopic.status).toBe(404)

    await env.DB.prepare('update workspaces set curriculum_revision = 1 where id = ?').bind('maths').run()
    await seedPlacement({ id: 907, lessonId: 701, lectureId: 306, orderIndex: 3 })
    const stale = await api('/curriculum/order', jsonOptions(teacher, { parent_type: 'lesson', parent_id: 701, ids: [902, 901, 903], expected_revision: 0 }))
    expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe('CURRICULUM_CHANGED')
    await expect(env.DB.prepare('select id from lecture_placements where lesson_id = 701 order by order_index, id').all()).resolves.toMatchObject({ results: [{ id: 901 }, { id: 902 }, { id: 903 }, { id: 907 }] })
  })

  it('does not pair old manager resources with a newer revision when a writer interleaves GETs', async () => {
    const teacher = await bearer(101)
    const curriculum = await apiWithEnv('/curriculum?programme=10', { ...testEnv(), DB: interleavingDbWrapper({ afterFirstTopicRead: true }) }, { headers: { Authorization: teacher } })
    expect(curriculum.status).toBe(200)
    expect((await curriculum.json()).data.revision).toBe(0)
    await env.DB.prepare('update workspaces set curriculum_revision = 0 where id = ?').bind('maths').run()

    const lectures = await apiWithEnv('/lectures', { ...testEnv(), DB: interleavingDbWrapper({ afterFirstLectureListRead: true }) }, { headers: { Authorization: teacher } })
    expect(lectures.status).toBe(200)
    expect((await lectures.json()).data.revision).toBe(0)
    const detail = await api('/lectures/301', { headers: { Authorization: teacher } })
    expect((await detail.json()).data.revision).toBe(1)
  })

  it('compacts every same-workspace lesson affected by deleting a shared video without touching foreign lessons', async () => {
    const teacher = await bearer(101)
    await seedPlacement({ id: 907, lessonId: 702, lectureId: 301, orderIndex: 1 })
    await seedPlacement({ id: 908, lessonId: 702, lectureId: 306, orderIndex: 2 })
    await seedLecture({ id: 402, workspaceId: 'english', title: 'Foreign sibling', tier: 'guest', createdBy: 102 })
    await seedPlacement({ id: 991, workspaceId: 'english', lessonId: 801, lectureId: 402, orderIndex: 1 })
    const deleted = await api('/lectures/305', { method: 'DELETE', headers: { Authorization: teacher, Origin: 'http://maths.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_revision: 0 }) })
    expect(deleted.status).toBe(200)
    await expect(env.DB.prepare('select id, order_index from lecture_placements where lesson_id = 702 order by order_index, id').all()).resolves.toMatchObject({ results: [{ id: 907, order_index: 0 }, { id: 908, order_index: 1 }] })
    await expect(env.DB.prepare('select id, order_index from lecture_placements where lesson_id = 704 order by order_index, id').all()).resolves.toMatchObject({ results: [] })
    await expect(env.DB.prepare('select id, order_index from lecture_placements where lesson_id = 801 order by order_index, id').all()).resolves.toMatchObject({ results: [{ id: 990, order_index: 0 }, { id: 991, order_index: 1 }] })
  })

  it('keeps same-lesson placement moves in unit order while still revision-checking', async () => {
    const teacher = await bearer(101)
    const moved = await api('/curriculum/placements/902', jsonOptions(teacher, { lesson_id: 701, expected_revision: 0 }))
    expect(moved.status).toBe(200)
    expect((await moved.json()).data.revision).toBe(1)
    await expect(env.DB.prepare('select id from lecture_placements where lesson_id = 701 order by order_index, id').all()).resolves.toMatchObject({ results: [{ id: 901 }, { id: 902 }, { id: 903 }] })
  })

  it('reports derived grades and full placement metadata for management lecture reads', async () => {
    const teacher = await bearer(101)
    await env.DB.prepare('insert into lecture_grades (lecture_id, grade) values (?, ?)').bind(305, 12).run()
    const list = await api('/lectures', { headers: { Authorization: teacher } })
    const lecture = (await list.json()).data.lectures.find((item) => item.id === 305)
    expect(lecture).toHaveProperty('grades')
    expect(lecture).not.toHaveProperty('programmes')
    expect(lecture.grades).toEqual([10, 11])
    expect(lecture.placements[0]).toMatchObject({ placement_id: 905, lesson_id: 702, lesson_title: 'Lesson 10 B', topic_id: 501, topic_title: 'Topic 10', programme: 10, order_index: 0, lesson_order: 1, topic_order: 0 })
  })

  it('only translates actual stale revision guards and rolls back unrelated late constraint failures', async () => {
    const c = {
      env: testEnv(),
      get: (key) => (key === 'workspace' ? { id: 'maths' } : undefined),
      json: (body, status) => new Response(JSON.stringify(body), { status }),
    }
    const stale = await batchWithRevision(c, 99, [env.DB.prepare("insert into curriculum_topics (workspace_id, programme, title, order_index) values ('maths', 10, 'Never', 99)")])
    expect(stale.response.status).toBe(409)

    await expect(batchWithRevision(c, 0, [env.DB.prepare("insert into curriculum_topics (id, workspace_id, programme, title, order_index) values (0, 'maths', 10, 'Late guard-shaped failure', 9)")])).rejects.toThrow()
    await expect(env.DB.prepare('select curriculum_revision from workspaces where id = ?').bind('maths').first('curriculum_revision')).resolves.toBe(0)

    const first = await api('/curriculum/topics', jsonOptions(await bearer(101), { programme: 'thpt', title: 'Winner', expected_revision: 0 }, 'POST'))
    expect(first.status).toBe(201)
    const second = await api('/curriculum/topics', jsonOptions(await bearer(101), { programme: 'dgnl', title: 'Loser', expected_revision: 0 }, 'POST'))
    expect(second.status).toBe(409)
    await expect(env.DB.prepare("select count(*) as count from curriculum_topics where title in ('Winner', 'Loser')").first()).resolves.toEqual({ count: 1 })
  })

  it('does not translate an unrelated constraint failure after another writer advances the revision', async () => {
    const failure = new Error('D1_ERROR: CHECK constraint failed: id > 0')
    const c = {
      env: { ...testEnv(), DB: {
        prepare: (...args) => env.DB.prepare(...args),
        async batch() {
          await env.DB.prepare("update workspaces set curriculum_revision = 1 where id = 'maths'").run()
          throw failure
        },
      } },
      get: () => ({ id: 'maths' }),
      json: (body, status) => new Response(JSON.stringify(body), { status }),
    }
    await expect(batchWithRevision(c, 0, [])).rejects.toBe(failure)
  })

  it('does not disclose the management revision in public or student playback data', async () => {
    for (const headers of [{}, { Authorization: await bearer(201) }]) {
      const response = await api('/lectures/301', { headers })
      expect(response.status).toBe(200)
      expect((await response.json()).data).not.toHaveProperty('revision')
    }
  })

  it('adds THPT only to maths and preserves the English programme choices', async () => {
    const teacher = await bearer(102, 'english')
    const origin = 'http://english-api.test'
    const create = await api('/curriculum/topics', jsonOptions(teacher, { programme: 'thpt', title: 'Not English', expected_revision: 0 }, 'POST', 'http://english.test'), origin)
    expect(create.status).toBe(400)
    const move = await api('/curriculum/topics/601', jsonOptions(teacher, { programme: 'thpt', expected_revision: 0 }, 'PUT', 'http://english.test'), origin)
    expect(move.status).toBe(400)
    expect(await env.DB.prepare("select curriculum_revision from workspaces where id = 'english'").first('curriculum_revision')).toBe(0)
    const existing = await api('/curriculum?programme=10', { headers: { Authorization: teacher } }, origin)
    expect(existing.status).toBe(200)
    expect((await existing.json()).data.topics.map(topic => topic.id)).toEqual([601])
  })

  it('allows exactly one concurrent write at a given revision', async () => {
    const teacher = await bearer(101)
    const responses = await Promise.all(['First concurrent', 'Second concurrent'].map(title => (
      api('/curriculum/topics', jsonOptions(teacher, { programme: 12, title, expected_revision: 0 }, 'POST'))
    )))
    expect(responses.map(response => response.status).sort()).toEqual([201, 409])
    const bodies = await Promise.all(responses.map(response => response.json()))
    expect(bodies.find(body => body.success).data.revision).toBe(1)
    expect(bodies.find(body => !body.success).error.code).toBe('CURRICULUM_CHANGED')
    expect(await env.DB.prepare("select count(*) as count from curriculum_topics where title like '% concurrent'").first('count')).toBe(1)
  })

  it('moves parents with children and changes only the derived placement audiences', async () => {
    const teacher = await bearer(101)
    const topicMove = await api('/curriculum/topics/501', jsonOptions(teacher, { programme: 11, expected_revision: 0 }))
    expect(topicMove.status).toBe(200)
    expect((await topicMove.json()).data.topic).toMatchObject({ id: 501, programme: 11, order_index: 1 })
    expect(await env.DB.prepare('select order_index from curriculum_topics where id = 502').first('order_index')).toBe(0)
    const lessonMove = await api('/curriculum/lessons/701', jsonOptions(teacher, { topic_id: 502, expected_revision: 1 }))
    expect(lessonMove.status).toBe(200)
    expect((await lessonMove.json()).data.lesson).toMatchObject({ id: 701, topic_id: 502, order_index: 1 })
    expect(await env.DB.prepare('select order_index from curriculum_lessons where id = 702').first('order_index')).toBe(0)
    expect((await env.DB.prepare('select lecture_id from lecture_placements where lesson_id = 701 order by order_index').all()).results).toEqual([{ lecture_id: 301 }, { lecture_id: 302 }, { lecture_id: 303 }])
    const managed = await api('/lectures', { headers: { Authorization: teacher } })
    const lectures = (await managed.json()).data.lectures
    expect(lectures.find(lecture => lecture.id === 302).grades).toEqual([10])
    expect(lectures.find(lecture => lecture.id === 305).grades).toEqual([11])
  })

  it('preserves auth and hidden-content errors across new curriculum GET paths', async () => {
    expect((await api('/curriculum?programme=10', { headers: { Authorization: 'Bearer invalid' } })).status).toBe(401)
    expect((await api('/curriculum?programme=10', { headers: { Authorization: await bearer(101, 'english') } })).status).toBe(401)
    expect((await api('/curriculum/lessons/701', { headers: { Authorization: await bearer(102) } })).status).toBe(403)
    for (const [userId, code] of [[203, 'MEMBERSHIP_PENDING'], [204, 'MEMBERSHIP_DISABLED'], [205, 'MEMBERSHIP_REQUIRED']]) {
      const res = await api('/curriculum/lessons/701', { headers: { Authorization: await bearer(userId) } })
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe(code)
    }
    expect((await api('/curriculum/lessons/703')).status).toBe(404)
    const fallback = await api('/lectures/305?placement=904', { headers: { Authorization: await bearer(201) } })
    expect(fallback.status).toBe(200)
    expect((await fallback.json()).data.placement.id).toBe(905)
  })

  it('applies hidden and tier changes from shared-video edits to actual placement access', async () => {
    const teacher = await bearer(101)
    const standard = await bearer(201)
    expect((await api('/lectures/302', { headers: { Authorization: standard } })).status).toBe(200)

    const vipOnly = await api('/lectures/302', jsonOptions(teacher, { expected_revision: 0, minimum_access_tier: 'vip' }))
    expect(vipOnly.status).toBe(200)
    expect((await api('/lectures/302', { headers: { Authorization: standard } })).status).toBe(404)

    const hidden = await api('/lectures/302', jsonOptions(teacher, { expected_revision: 1, is_visible: false }))
    expect(hidden.status).toBe(200)
    expect((await api('/lectures/302', { headers: { Authorization: await bearer(101) } })).status).toBe(200)
  })
})

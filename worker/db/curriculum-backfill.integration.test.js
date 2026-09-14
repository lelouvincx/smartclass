import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import mapping from './curriculum-mapping.json'
import { backfillCurriculum, validateCurriculumBackfill } from './curriculum-backfill.js'
import { finalizeWorkspaceCutover } from './workspace-cutover.js'

const PASSWORD_HASH = 'synthetic-password-hash'

async function resetData() {
  for (const statement of [
    "drop trigger if exists workspace_cutover_exercises_insert",
    "drop trigger if exists workspace_cutover_exercises_update",
    "drop trigger if exists workspace_cutover_lectures_insert",
    "drop trigger if exists workspace_cutover_lectures_update",
    "drop table if exists workspace_cutover",
    'delete from lecture_placements',
    'delete from curriculum_lessons',
    'delete from curriculum_topics',
    'update workspaces set curriculum_revision = 0',
    'delete from lecture_grades',
    'delete from lectures',
    'delete from workspace_membership_grades',
    'delete from workspace_memberships',
    'delete from users',
  ]) {
    await env.DB.prepare(statement).run()
  }
}

async function seedReviewedLectures({ workspaceId = 'maths', order = [1, 2, 3, 4, 5, 6] } = {}) {
  await env.DB.prepare(`
    insert into users (id, phone, password_hash, role, status, access_tier)
    values (101, '+84865481769', ?, 'teacher', 'active', 'standard')
  `).bind(PASSWORD_HASH).run()
  await env.DB.prepare(`
    insert into workspace_memberships (workspace_id, user_id, role, status, access_tier, display_name)
    values ('maths', 101, 'teacher', 'active', 'standard', null)
  `).run()
  const orderById = new Map(order.map((id, index) => [id, index]))
  await env.DB.batch(mapping.lectures.map((lecture) => env.DB.prepare(`
    insert into lectures (
      id, workspace_id, title, section_name, youtube_url, order_index, created_by,
      is_visible, minimum_access_tier
    ) values (?, ?, ?, 'Reviewed section', ?, ?, 101, ?, ?)
  `).bind(
    lecture.id,
    workspaceId,
    lecture.title,
    lecture.youtube_url,
    orderById.get(lecture.id),
    lecture.is_visible,
    lecture.minimum_access_tier,
  )))
  const gradeStatements = []
  for (const lecture of mapping.lectures) {
    for (const programme of lecture.programmes) {
      gradeStatements.push(env.DB.prepare('insert into lecture_grades (lecture_id, grade) values (?, ?)')
        .bind(lecture.id, programme))
    }
  }
  await env.DB.batch(gradeStatements)
}

async function completeWorkspaceCutover() {
  await finalizeWorkspaceCutover(env.DB, {
    users: [
      { id: 101, platform_role: 'user', memberships: [{ workspace_id: 'maths', role: 'teacher', status: 'active', access_tier: 'standard', display_name: null, grades: [] }] },
    ],
    exercises: [],
    lectures: mapping.lectures.map((lecture) => ({ id: lecture.id, workspace_id: 'maths' })),
  })
}

async function seedReadyReviewedDatabase() {
  await seedReviewedLectures()
  await completeWorkspaceCutover()
}

async function readCoreState() {
  const [lectures, grades, topics, lessons, placements, workspace] = await Promise.all([
    env.DB.prepare('select id, workspace_id, title, youtube_url, order_index, is_visible, minimum_access_tier from lectures order by id').all(),
    env.DB.prepare('select lecture_id, grade from lecture_grades order by lecture_id, grade').all(),
    env.DB.prepare('select workspace_id, programme, title, order_index from curriculum_topics order by programme, order_index, id').all(),
    env.DB.prepare(`
      select l.workspace_id, t.programme, t.title as topic_title, l.title, l.order_index
      from curriculum_lessons l join curriculum_topics t on t.id = l.topic_id
      order by t.programme, t.order_index, l.order_index, l.id
    `).all(),
    env.DB.prepare(`
      select p.workspace_id, t.programme, t.title as topic_title, l.title as lesson_title,
        p.lecture_id, p.order_index
      from lecture_placements p
      join curriculum_lessons l on l.id = p.lesson_id
      join curriculum_topics t on t.id = l.topic_id
      order by t.programme, t.order_index, l.order_index, p.order_index, p.id
    `).all(),
    env.DB.prepare("select id, curriculum_revision from workspaces where id = 'maths'").first(),
  ])
  return {
    lectures: lectures.results,
    grades: grades.results,
    topics: topics.results,
    lessons: lessons.results,
    placements: placements.results,
    workspace,
  }
}

function withLecture(mutator) {
  const copy = structuredClone(mapping)
  mutator(copy.lectures[0], copy)
  return copy
}

describe('RFC-18 reviewed curriculum placement backfill', () => {
  beforeEach(async () => {
    await resetData()
  })

  it('dry-runs and atomically creates the reviewed hierarchy while preserving source lecture fields', async () => {
    await seedReadyReviewedDatabase()
    const before = await readCoreState()

    await expect(validateCurriculumBackfill(env.DB, mapping)).resolves.toMatchObject({
      workspace_id: 'maths',
      revision_before: 0,
      topics: 5,
      lessons: 5,
      placements: 7,
      audience: expect.arrayContaining([
        { lecture_id: 1, before: [10], after: [10], approved_change: null },
        { lecture_id: 2, before: [12, 'dgnl'], after: [12, 'dgnl'], approved_change: null },
      ]),
    })

    await backfillCurriculum(env.DB, mapping)
    const after = await readCoreState()
    expect(after.lectures).toEqual(before.lectures)
    expect(after.grades).toEqual(before.grades)
    expect(after.workspace).toEqual({ id: 'maths', curriculum_revision: 1 })
    expect(after.topics.map((topic) => [topic.programme, topic.title, topic.order_index])).toEqual([
      [10, 'Vectơ', 0],
      [10, 'Chuyên đề 1', 1],
      [11, 'Ôn tập và kiểm tra', 0],
      [12, 'Chuyên đề 1', 0],
      ['dgnl', 'Chuyên đề 1', 0],
    ])
    expect(after.lessons.map((lesson) => [lesson.programme, lesson.topic_title, lesson.title, lesson.order_index])).toContainEqual([
      10, 'Chuyên đề 1', 'Bài 5: Ôn kiểm tra 15 phút', 0,
    ])
    expect(after.placements.map((placement) => [placement.programme, placement.topic_title, placement.lesson_title, placement.lecture_id, placement.order_index])).toEqual([
      [10, 'Vectơ', 'Các phép toán trên vectơ', 1, 0],
      [10, 'Chuyên đề 1', 'Bài 5: Ôn kiểm tra 15 phút', 3, 0],
      [11, 'Ôn tập và kiểm tra', 'Ôn giữa kì 1', 4, 0],
      [11, 'Ôn tập và kiểm tra', 'Ôn giữa kì 1', 5, 1],
      [11, 'Ôn tập và kiểm tra', 'Ôn giữa kì 1', 6, 2],
      [12, 'Chuyên đề 1', 'Hàm số', 2, 0],
      ['dgnl', 'Chuyên đề 1', 'Hàm số', 2, 0],
    ])
  })

  it('refuses duplicate invocation and existing target curriculum without affecting another workspace', async () => {
    await seedReadyReviewedDatabase()
    await env.DB.prepare("insert into curriculum_topics (workspace_id, programme, title, order_index) values ('english', 10, 'Existing', 0)").run()
    await backfillCurriculum(env.DB, mapping)
    await expect(backfillCurriculum(env.DB, mapping)).rejects.toThrow(/target workspace curriculum is not empty|curriculum_revision/i)
    expect(await env.DB.prepare("select count(*) as count from curriculum_topics where workspace_id = 'english'").first()).toEqual({ count: 1 })
  })

  it('rejects source drift, malformed mappings and incomplete or duplicate source rows before mutation', async () => {
    await seedReadyReviewedDatabase()
    const before = await readCoreState()
    const malformedCases = [
      ['title drift', async () => env.DB.prepare("update lectures set title = 'Changed' where id = 1").run(), mapping],
      ['url drift', async () => env.DB.prepare("update lectures set youtube_url = 'https://youtu.be/changed' where id = 1").run(), mapping],
      ['tier drift', async () => env.DB.prepare("update lectures set minimum_access_tier = 'vip' where id = 2").run(), mapping],
      ['visibility drift', async () => env.DB.prepare('update lectures set is_visible = 0 where id = 2').run(), mapping],
      ['programme drift', async () => env.DB.prepare('delete from lecture_grades where lecture_id = 2 and grade = 12').run(), mapping],
      ['source order drift', async () => env.DB.prepare('update lectures set order_index = 99 where id = 1').run(), mapping],
      ['missing source row', async () => env.DB.prepare('delete from lecture_grades where lecture_id = 6').run().then(() => env.DB.prepare('delete from lectures where id = 6').run()), mapping],
      ['duplicate mapping row', async () => {}, { ...structuredClone(mapping), lectures: [...structuredClone(mapping).lectures, structuredClone(mapping).lectures[0]] }],
      ['unknown programme', async () => {}, { ...structuredClone(mapping), topics: [{ ...mapping.topics[0], programme: 'science' }] }],
      ['missing parent', async () => {}, { ...structuredClone(mapping), lessons: [{ ...mapping.lessons[0], topic_key: 'missing' }] }],
      ['duplicate placement', async () => {}, withLecture((lecture) => lecture.placements.push({ ...lecture.placements[0] }))],
      ['gapped topic order', async () => {}, { ...structuredClone(mapping), topics: mapping.topics.map((topic) => topic.key === 'g10-chuyen-de-1' ? { ...topic, order_index: 2 } : topic) }],
    ]

    for (const [label, mutate, badMapping] of malformedCases) {
      await resetData()
      await seedReadyReviewedDatabase()
      await mutate()
      const driftedBefore = await readCoreState()
      await expect(backfillCurriculum(env.DB, badMapping), label).rejects.toThrow(/curriculum backfill refused/i)
      await expect(readCoreState(), label).resolves.toEqual(driftedBefore)
      expect((await readCoreState()).workspace, label).toEqual(before.workspace)
    }
  })

  it('requires completed RFC-17 workspace cutover and exact maths ownership', async () => {
    await seedReviewedLectures()
    await expect(backfillCurriculum(env.DB, mapping)).rejects.toThrow(/workspace cutover/i)

    await resetData()
    await seedReviewedLectures({ workspaceId: 'english' })
    await expect(backfillCurriculum(env.DB, mapping)).rejects.toThrow(/workspace ownership/i)
  })

  it('refuses a newly added maths video absent from the reviewed mapping', async () => {
    await seedReadyReviewedDatabase()
    await env.DB.prepare(`
      insert into lectures (id, workspace_id, title, section_name, youtube_url, order_index, created_by)
      values (7, 'maths', 'New video', 'New section', 'https://youtu.be/123456789ab', 6, 101)
    `).run()
    const before = await readCoreState()
    await expect(backfillCurriculum(env.DB, mapping)).rejects.toThrow(/source.*(incomplete|order|mapping)/i)
    expect(await readCoreState()).toEqual(before)
  })

  it('resolves parents by reviewed keys and position, never by repeated or quoted titles', async () => {
    await seedReadyReviewedDatabase()
    const renamed = structuredClone(mapping)
    for (const topic of renamed.topics) topic.title = 'Chuyên đề "A" của thầy'
    for (const lesson of renamed.lessons) lesson.title = "Bài 'ôn tập'"
    renamed.lessons.push({ key: 'second-review', topic_key: 'g10-vecto', title: "Bài 'ôn tập'", order_index: 1 })
    renamed.lectures[0].placements.push({ lesson_key: 'second-review', order_index: 0 })

    await backfillCurriculum(env.DB, renamed)
    const actual = await env.DB.prepare(`
      select p.lecture_id, t.order_index as topic_order, l.order_index as lesson_order
      from lecture_placements p
      join curriculum_lessons l on l.id = p.lesson_id
      join curriculum_topics t on t.id = l.topic_id
      where t.programme = 10
      order by t.order_index, l.order_index
    `).all()
    expect(actual.results).toEqual([
      { lecture_id: 1, topic_order: 0, lesson_order: 0 },
      { lecture_id: 1, topic_order: 0, lesson_order: 1 },
      { lecture_id: 3, topic_order: 1, lesson_order: 0 },
    ])
  })

  it('rejects a revision change between validation and the atomic batch', async () => {
    await seedReadyReviewedDatabase()
    const before = await readCoreState()
    const db = {
      prepare: (...args) => env.DB.prepare(...args),
      batch: async (statements) => {
        await env.DB.prepare("update workspaces set curriculum_revision = 1 where id = 'maths'").run()
        return env.DB.batch(statements)
      },
    }
    await expect(backfillCurriculum(db, mapping)).rejects.toThrow()
    expect(await readCoreState()).toEqual({ ...before, workspace: { id: 'maths', curriculum_revision: 1 } })
  })

  it('requires explicit approved audience changes for both narrowing and expansion, including Guest lectures', async () => {
    await seedReadyReviewedDatabase()
    const narrowed = withLecture((lecture) => {
      lecture.placements = []
    })
    await expect(validateCurriculumBackfill(env.DB, narrowed)).rejects.toThrow(/audience change/i)

    const approvedNarrow = withLecture((lecture) => {
      lecture.placements = []
      lecture.approved_audience_change = { before: [10], after: [], reviewer: 'Chinh' }
    })
    await expect(validateCurriculumBackfill(env.DB, approvedNarrow)).resolves.toMatchObject({
      audience: expect.arrayContaining([{ lecture_id: 1, before: [10], after: [], approved_change: { before: [10], after: [], reviewer: 'Chinh' } }]),
    })

    const expandedGuest = withLecture((lecture, copy) => {
      const guestLecture = copy.lectures.find((item) => item.id === 4)
      guestLecture.placements.push({ lesson_key: 'g12-ham-so', order_index: 1 })
    })
    await expect(validateCurriculumBackfill(env.DB, expandedGuest)).rejects.toThrow(/audience change/i)

    const approvedExpansion = structuredClone(expandedGuest)
    approvedExpansion.lectures.find((lecture) => lecture.id === 4).approved_audience_change = { before: [11], after: [11, 12], reviewer: 'Chinh' }
    await expect(validateCurriculumBackfill(env.DB, approvedExpansion)).resolves.toMatchObject({
      audience: expect.arrayContaining([{ lecture_id: 4, before: [11], after: [11, 12], approved_change: { before: [11], after: [11, 12], reviewer: 'Chinh' } }]),
    })
  })

  it('rolls back all rows and the revision when a late batch statement fails', async () => {
    await seedReadyReviewedDatabase()
    const before = await readCoreState()
    const db = {
      prepare: (...args) => env.DB.prepare(...args),
      batch: (statements) => env.DB.batch([
        ...statements,
        env.DB.prepare("insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index) values ('maths', 999999, 1, 0)"),
      ]),
    }

    await expect(backfillCurriculum(db, mapping)).rejects.toThrow()
    await expect(readCoreState()).resolves.toEqual(before)
  })
})

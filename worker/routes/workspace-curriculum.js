import { Hono } from 'hono'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { optionalWorkspaceIdentity, requireWorkspaceIdentity, requireWorkspaceManagement } from '../middleware/workspace-auth.js'
import {
  audience,
  batchWithRevision,
  compactLessonPlacements,
  compactProgrammeTopics,
  compactTopicLessons,
  currentRevision,
  isManager,
  parseExpectedRevision,
  parsePositiveId,
  parseProgramme,
  revisionChanged,
  tierAllowed,
  toUnit,
  trimTitle,
  validateSharedVideo,
  workspace,
} from '../lib/curriculum.js'

const curriculumRoutes = new Hono()

function readBody(c) {
  return c.req.json().catch(() => null)
}

async function accessibleUnitRows(c, lessonId = null, programme = null) {
  const aud = await audience(c)
  if (aud.error) return aud
  const workspaceId = workspace(c).id
  const params = [workspaceId]
  let filter = ''
  if (lessonId !== null) { filter += ' and l.id = ?'; params.push(lessonId) }
  if (programme !== null) { filter += ' and t.programme = ?'; params.push(programme) }
  const rows = await c.env.DB.prepare(`
    select p.id as placement_id, p.order_index, p.lesson_id, l.title as lesson_title,
      t.id as topic_id, t.title as topic_title, t.programme,
      lecture.id as lecture_id, lecture.title, lecture.youtube_url, lecture.is_visible, lecture.minimum_access_tier
    from lecture_placements p
    join curriculum_lessons l on l.id = p.lesson_id and l.workspace_id = p.workspace_id
    join curriculum_topics t on t.id = l.topic_id and t.workspace_id = l.workspace_id
    join lectures lecture on lecture.id = p.lecture_id and lecture.workspace_id = p.workspace_id
    where p.workspace_id = ? ${filter}
    order by case t.programme when 10 then 0 when 11 then 1 when 12 then 2 when 'thpt' then 3 else 4 end,
      t.order_index, t.id, l.order_index, l.id, p.order_index, p.id
  `).bind(...params).all()
  const visible = rows.results.filter((row) => {
    if (aud.manager) return true
    if (!row.is_visible) return false
    if (row.minimum_access_tier === 'guest') return true
    return aud.programmes.includes(row.programme) && tierAllowed(row.minimum_access_tier, aud.membership)
  })
  return { aud, rows: visible }
}

curriculumRoutes.get('/', optionalWorkspaceIdentity, async (c) => {
  const programme = parseProgramme(c.req.query('programme'), workspace(c).id)
  if (!programme) return jsonError(c, 400, 'VALIDATION_ERROR', 'programme must be 10, 11, 12, thpt, or dgnl.')
  const aud = await audience(c)
  if (aud.error) return aud.error
  const workspaceId = workspace(c).id
  const revision = aud.manager ? await currentRevision(c.env.DB, workspaceId) : null
  const topics = await c.env.DB.prepare(`
    select id, programme, title, order_index from curriculum_topics
    where workspace_id = ? and programme = ? order by order_index, id
  `).bind(workspaceId, programme).all()
  const lessons = await c.env.DB.prepare(`
    select l.id, l.topic_id, l.title, l.order_index
    from curriculum_lessons l
    join curriculum_topics t on t.id = l.topic_id and t.workspace_id = l.workspace_id
    where l.workspace_id = ? and t.programme = ? order by t.order_index, t.id, l.order_index, l.id
  `).bind(workspaceId, programme).all()
  const unitRows = await accessibleUnitRows(c, null, programme)
  if (unitRows.error) return unitRows.error
  const countByLesson = new Map()
  for (const row of unitRows.rows) countByLesson.set(row.lesson_id, (countByLesson.get(row.lesson_id) || 0) + 1)
  const lessonsByTopic = new Map()
  for (const lesson of lessons.results) {
    const unitCount = countByLesson.get(lesson.id) || 0
    if (!aud.manager && unitCount === 0) continue
    const item = { id: lesson.id, topic_id: lesson.topic_id, title: lesson.title, order_index: lesson.order_index, unit_count: unitCount }
    lessonsByTopic.set(lesson.topic_id, [...(lessonsByTopic.get(lesson.topic_id) || []), item])
  }
  const data = topics.results
    .map((topic) => ({ ...topic, lessons: lessonsByTopic.get(topic.id) || [] }))
    .filter((topic) => aud.manager || topic.lessons.length > 0)
  const response = { programme, topics: data }
  if (aud.manager) response.revision = revision
  return jsonSuccess(c, response)
})

curriculumRoutes.get('/lessons/:id', optionalWorkspaceIdentity, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'INVALID_ID', 'Lesson id must be a positive integer.')
  const workspaceId = workspace(c).id
  const revision = isManager(c) ? await currentRevision(c.env.DB, workspaceId) : null
  const lesson = await c.env.DB.prepare(`
    select l.id, l.title, l.order_index, t.id as topic_id, t.title as topic_title, t.programme
    from curriculum_lessons l join curriculum_topics t on t.id = l.topic_id and t.workspace_id = l.workspace_id
    where l.workspace_id = ? and l.id = ?
  `).bind(workspaceId, id).first()
  if (!lesson) return jsonError(c, 404, 'NOT_FOUND', 'Lesson not found.')
  const unitRows = await accessibleUnitRows(c, id)
  if (unitRows.error) return unitRows.error
  if (!unitRows.aud.manager && unitRows.rows.length === 0) return jsonError(c, 404, 'NOT_FOUND', 'Lesson not found.')
  const response = {
    breadcrumb: { programme: lesson.programme, topic_id: lesson.topic_id, topic_title: lesson.topic_title, lesson_id: lesson.id, lesson_title: lesson.title },
    lesson: { id: lesson.id, title: lesson.title, order_index: lesson.order_index, topic_id: lesson.topic_id, programme: lesson.programme },
    units: unitRows.rows.map(toUnit),
  }
  if (unitRows.aud.manager) response.revision = revision
  return jsonSuccess(c, response)
})

curriculumRoutes.post('/topics', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  const programme = parseProgramme(body?.programme, workspace(c).id)
  const title = trimTitle(body?.title)
  if (expected === null || !programme || !title) return jsonError(c, 400, 'VALIDATION_ERROR', 'programme, title, and expected_revision are required.')
  const workspaceId = workspace(c).id
  const mutation = await batchWithRevision(c, expected, [c.env.DB.prepare(`
    insert into curriculum_topics (workspace_id, programme, title, order_index)
    values (?, ?, ?, (select coalesce(max(order_index), -1) + 1 from curriculum_topics where workspace_id = ? and programme = ?))
  `).bind(workspaceId, programme, title, workspaceId, programme)])
  if (mutation.response) return mutation.response
  const id = mutation.results[2].meta.last_row_id
  return jsonSuccess(c, { revision: mutation.revision, topic: await c.env.DB.prepare('select * from curriculum_topics where id = ?').bind(id).first() }, 201)
})

curriculumRoutes.post('/lessons', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  const topicId = parsePositiveId(body?.topic_id)
  const title = trimTitle(body?.title)
  if (expected === null || !topicId || !title) return jsonError(c, 400, 'VALIDATION_ERROR', 'topic_id, title, and expected_revision are required.')
  const workspaceId = workspace(c).id
  const topic = await c.env.DB.prepare('select id from curriculum_topics where id = ? and workspace_id = ?').bind(topicId, workspaceId).first()
  if (!topic) return jsonError(c, 404, 'NOT_FOUND', 'Topic not found.')
  const mutation = await batchWithRevision(c, expected, [c.env.DB.prepare(`
    insert into curriculum_lessons (workspace_id, topic_id, title, order_index)
    values (?, ?, ?, (select coalesce(max(order_index), -1) + 1 from curriculum_lessons where workspace_id = ? and topic_id = ?))
  `).bind(workspaceId, topicId, title, workspaceId, topicId)])
  if (mutation.response) return mutation.response
  const id = mutation.results[2].meta.last_row_id
  return jsonSuccess(c, { revision: mutation.revision, lesson: await c.env.DB.prepare('select * from curriculum_lessons where id = ?').bind(id).first() }, 201)
})

curriculumRoutes.put('/topics/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  const title = body?.title === undefined ? undefined : trimTitle(body.title)
  const programme = body?.programme === undefined ? undefined : parseProgramme(body.programme, workspace(c).id)
  if (!id || expected === null || (title === undefined && programme === undefined) || title === '' || programme === null) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'A valid title or programme and expected_revision are required.')
  }
  const workspaceId = workspace(c).id
  const topic = await c.env.DB.prepare('select id, programme from curriculum_topics where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!topic) return jsonError(c, 404, 'NOT_FOUND', 'Topic not found.')
  const destProgramme = programme ?? topic.programme
  const statements = [c.env.DB.prepare(`
    update curriculum_topics
    set title = coalesce(?, title),
      programme = ?,
      order_index = case when programme <> ? then (select coalesce(max(order_index), -1) + 1 from curriculum_topics where workspace_id = ? and programme = ?) else order_index end
    where id = ? and workspace_id = ?
  `).bind(title ?? null, destProgramme, destProgramme, workspaceId, destProgramme, id, workspaceId)]
  if (destProgramme !== topic.programme) statements.push(...await compactProgrammeTopics(c.env.DB, workspaceId, topic.programme))
  const mutation = await batchWithRevision(c, expected, statements)
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, topic: await c.env.DB.prepare('select * from curriculum_topics where id = ?').bind(id).first() })
})

curriculumRoutes.put('/lessons/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  const title = body?.title === undefined ? undefined : trimTitle(body.title)
  const topicId = body?.topic_id === undefined ? undefined : parsePositiveId(body.topic_id)
  if (!id || expected === null || (title === undefined && topicId === undefined) || title === '' || topicId === null) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'A valid title or topic_id and expected_revision are required.')
  }
  const workspaceId = workspace(c).id
  const lesson = await c.env.DB.prepare('select id, topic_id from curriculum_lessons where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!lesson) return jsonError(c, 404, 'NOT_FOUND', 'Lesson not found.')
  const destTopicId = topicId ?? lesson.topic_id
  const topic = await c.env.DB.prepare('select id from curriculum_topics where id = ? and workspace_id = ?').bind(destTopicId, workspaceId).first()
  if (!topic) return jsonError(c, 404, 'NOT_FOUND', 'Topic not found.')
  const statements = [c.env.DB.prepare(`
    update curriculum_lessons
    set title = coalesce(?, title),
      topic_id = ?,
      order_index = case when topic_id <> ? then (select coalesce(max(order_index), -1) + 1 from curriculum_lessons where workspace_id = ? and topic_id = ?) else order_index end
    where id = ? and workspace_id = ?
  `).bind(title ?? null, destTopicId, destTopicId, workspaceId, destTopicId, id, workspaceId)]
  if (destTopicId !== lesson.topic_id) statements.push(...await compactTopicLessons(c.env.DB, workspaceId, lesson.topic_id))
  const mutation = await batchWithRevision(c, expected, statements)
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, lesson: await c.env.DB.prepare('select * from curriculum_lessons where id = ?').bind(id).first() })
})

async function createPlacement(c, body, expected, status = 201) {
  const lessonId = parsePositiveId(body?.lesson_id)
  const lectureId = parsePositiveId(body?.lecture_id)
  const hasLectureId = Object.prototype.hasOwnProperty.call(body ?? {}, 'lecture_id')
  const hasNew = Object.prototype.hasOwnProperty.call(body ?? {}, 'lecture') && body?.lecture && typeof body.lecture === 'object'
  if (expected === null || !lessonId || (hasLectureId && !lectureId) || ((hasLectureId ? 1 : 0) + (hasNew ? 1 : 0) !== 1)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'lesson_id, exactly one of lecture_id or lecture, and expected_revision are required.')
  }
  const workspaceId = workspace(c).id
  const lesson = await c.env.DB.prepare('select id from curriculum_lessons where id = ? and workspace_id = ?').bind(lessonId, workspaceId).first()
  if (!lesson) return jsonError(c, 404, 'NOT_FOUND', 'Lesson not found.')
  if (lectureId) {
    const lecture = await c.env.DB.prepare('select id from lectures where id = ? and workspace_id = ?').bind(lectureId, workspaceId).first()
    if (!lecture) return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
    const dup = await c.env.DB.prepare('select id from lecture_placements where lesson_id = ? and lecture_id = ?').bind(lessonId, lectureId).first()
    if (dup) return jsonError(c, 409, 'PLACEMENT_EXISTS', 'This video is already placed in that lesson.')
    const mutation = await batchWithRevision(c, expected, [c.env.DB.prepare(`
      insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index)
      values (?, ?, ?, (select coalesce(max(order_index), -1) + 1 from lecture_placements where workspace_id = ? and lesson_id = ?))
    `).bind(workspaceId, lessonId, lectureId, workspaceId, lessonId)])
    if (mutation.response) return mutation.response
    return jsonSuccess(c, { revision: mutation.revision, placement: await c.env.DB.prepare('select * from lecture_placements where id = ?').bind(mutation.results[2].meta.last_row_id).first() }, status)
  }
  const valid = validateSharedVideo(body.lecture)
  if (valid.reload) return jsonError(c, 409, 'CURRICULUM_RELOAD_REQUIRED', 'Reload curriculum before editing videos.')
  if (valid.error) return jsonError(c, 400, 'VALIDATION_ERROR', valid.error)
  const user = c.get('authUser')
  const mutation = await batchWithRevision(c, expected, [
    c.env.DB.prepare(`
      insert into lectures (workspace_id, title, section_name, youtube_url, order_index, is_visible, minimum_access_tier, created_by)
      values (?, ?, 'Curriculum', ?, 0, ?, ?, ?)
    `).bind(workspaceId, valid.lecture.title, valid.lecture.youtube_url, Number(valid.lecture.is_visible ?? true), valid.lecture.minimum_access_tier, user.id),
    c.env.DB.prepare(`
      insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index)
      values (?, ?, last_insert_rowid(), (select coalesce(max(order_index), -1) + 1 from lecture_placements where workspace_id = ? and lesson_id = ?))
    `).bind(workspaceId, lessonId, workspaceId, lessonId),
  ])
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, placement: await c.env.DB.prepare('select * from lecture_placements where id = ?').bind(mutation.results[3].meta.last_row_id).first() }, status)
}

curriculumRoutes.post('/placements', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const body = await readBody(c)
  return createPlacement(c, body, parseExpectedRevision(body), 201)
})

curriculumRoutes.put('/placements/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  const destLessonId = parsePositiveId(body?.lesson_id)
  if (!id || expected === null || !destLessonId) return jsonError(c, 400, 'VALIDATION_ERROR', 'placement id, lesson_id, and expected_revision are required.')
  const workspaceId = workspace(c).id
  const existing = await c.env.DB.prepare('select id, lesson_id, lecture_id from lecture_placements where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!existing) return jsonError(c, 404, 'NOT_FOUND', 'Placement not found.')
  const lesson = await c.env.DB.prepare('select id from curriculum_lessons where id = ? and workspace_id = ?').bind(destLessonId, workspaceId).first()
  if (!lesson) return jsonError(c, 404, 'NOT_FOUND', 'Lesson not found.')
  if (destLessonId === existing.lesson_id) {
    const mutation = await batchWithRevision(c, expected, [c.env.DB.prepare('update lecture_placements set lesson_id = lesson_id where id = ? and workspace_id = ?').bind(id, workspaceId)])
    if (mutation.response) return mutation.response
    return jsonSuccess(c, { revision: mutation.revision, placement: await c.env.DB.prepare('select * from lecture_placements where id = ?').bind(id).first() })
  }
  const dup = await c.env.DB.prepare('select id from lecture_placements where lesson_id = ? and lecture_id = ? and id <> ?').bind(destLessonId, existing.lecture_id, id).first()
  if (dup) return jsonError(c, 409, 'PLACEMENT_EXISTS', 'This video is already placed in that lesson.')
  const statements = [c.env.DB.prepare(`
    update lecture_placements set lesson_id = ?, order_index = (select coalesce(max(order_index), -1) + 1 from lecture_placements where workspace_id = ? and lesson_id = ?) where id = ? and workspace_id = ?
  `).bind(destLessonId, workspaceId, destLessonId, id, workspaceId)]
  statements.push(...await compactLessonPlacements(c.env.DB, workspaceId, existing.lesson_id))
  const mutation = await batchWithRevision(c, expected, statements)
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, placement: await c.env.DB.prepare('select * from lecture_placements where id = ?').bind(id).first() })
})

curriculumRoutes.put('/order', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  const ids = body?.ids
  if (expected === null || !Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'ids must be unique positive integers and expected_revision is required.')
  }
  const workspaceId = workspace(c).id
  let rows
  let statements
  if (body?.parent_type === 'lesson') {
    const parentId = parsePositiveId(body.parent_id)
    if (!parentId) return jsonError(c, 400, 'VALIDATION_ERROR', 'parent_id must be valid.')
    const parent = await c.env.DB.prepare('select id from curriculum_lessons where id = ? and workspace_id = ?').bind(parentId, workspaceId).first()
    if (!parent) return jsonError(c, 404, 'NOT_FOUND', 'Lesson not found.')
    if (await revisionChanged(c.env.DB, workspaceId, expected)) return jsonError(c, 409, 'CURRICULUM_CHANGED', 'Curriculum has changed. Reload and try again.')
    rows = await c.env.DB.prepare('select id from lecture_placements where workspace_id = ? and lesson_id = ? order by id').bind(workspaceId, parentId).all()
    statements = ids.map((id, index) => c.env.DB.prepare('update lecture_placements set order_index = ? where id = ? and workspace_id = ?').bind(index, id, workspaceId))
  } else if (body?.parent_type === 'topic') {
    const parentId = parsePositiveId(body.parent_id)
    if (!parentId) return jsonError(c, 400, 'VALIDATION_ERROR', 'parent_id must be valid.')
    const parent = await c.env.DB.prepare('select id from curriculum_topics where id = ? and workspace_id = ?').bind(parentId, workspaceId).first()
    if (!parent) return jsonError(c, 404, 'NOT_FOUND', 'Topic not found.')
    if (await revisionChanged(c.env.DB, workspaceId, expected)) return jsonError(c, 409, 'CURRICULUM_CHANGED', 'Curriculum has changed. Reload and try again.')
    rows = await c.env.DB.prepare('select id from curriculum_lessons where workspace_id = ? and topic_id = ? order by id').bind(workspaceId, parentId).all()
    statements = ids.map((id, index) => c.env.DB.prepare('update curriculum_lessons set order_index = ? where id = ? and workspace_id = ?').bind(index, id, workspaceId))
  } else if (body?.parent_type === 'programme') {
    const programme = parseProgramme(body.parent_id, workspaceId)
    if (!programme) return jsonError(c, 400, 'VALIDATION_ERROR', 'parent_id must be valid.')
    if (await revisionChanged(c.env.DB, workspaceId, expected)) return jsonError(c, 409, 'CURRICULUM_CHANGED', 'Curriculum has changed. Reload and try again.')
    rows = await c.env.DB.prepare('select id from curriculum_topics where workspace_id = ? and programme = ? order by id').bind(workspaceId, programme).all()
    statements = ids.map((id, index) => c.env.DB.prepare('update curriculum_topics set order_index = ? where id = ? and workspace_id = ?').bind(index, id, workspaceId))
  } else {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'parent_type must be programme, topic, or lesson.')
  }
  const existing = rows.results.map((row) => row.id).sort((a, b) => a - b)
  const requested = [...ids].sort((a, b) => a - b)
  if (existing.length !== requested.length || existing.some((id, index) => id !== requested[index])) return jsonError(c, 400, 'INVALID_ORDER', 'ids must contain every sibling exactly once.')
  const mutation = await batchWithRevision(c, expected, statements)
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, ids })
})

curriculumRoutes.delete('/topics/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  if (!id || expected === null) return jsonError(c, 400, 'VALIDATION_ERROR', 'id and expected_revision are required.')
  const workspaceId = workspace(c).id
  const topic = await c.env.DB.prepare('select programme from curriculum_topics where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!topic) return jsonError(c, 404, 'NOT_FOUND', 'Topic not found.')
  const children = await c.env.DB.prepare('select count(*) as count from curriculum_lessons where topic_id = ? and workspace_id = ?').bind(id, workspaceId).first('count')
  if (children > 0) return jsonError(c, 409, 'PARENT_NOT_EMPTY', 'Topic is not empty.')
  const statements = [c.env.DB.prepare('delete from curriculum_topics where id = ? and workspace_id = ?').bind(id, workspaceId)]
  statements.push(...await compactProgrammeTopics(c.env.DB, workspaceId, topic.programme))
  const mutation = await batchWithRevision(c, expected, statements)
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, id })
})

curriculumRoutes.delete('/lessons/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  if (!id || expected === null) return jsonError(c, 400, 'VALIDATION_ERROR', 'id and expected_revision are required.')
  const workspaceId = workspace(c).id
  const lesson = await c.env.DB.prepare('select topic_id from curriculum_lessons where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!lesson) return jsonError(c, 404, 'NOT_FOUND', 'Lesson not found.')
  const children = await c.env.DB.prepare('select count(*) as count from lecture_placements where lesson_id = ? and workspace_id = ?').bind(id, workspaceId).first('count')
  if (children > 0) return jsonError(c, 409, 'PARENT_NOT_EMPTY', 'Lesson is not empty.')
  const statements = [c.env.DB.prepare('delete from curriculum_lessons where id = ? and workspace_id = ?').bind(id, workspaceId)]
  statements.push(...await compactTopicLessons(c.env.DB, workspaceId, lesson.topic_id))
  const mutation = await batchWithRevision(c, expected, statements)
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, id })
})

curriculumRoutes.delete('/placements/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  if (!id || expected === null) return jsonError(c, 400, 'VALIDATION_ERROR', 'id and expected_revision are required.')
  const workspaceId = workspace(c).id
  const placement = await c.env.DB.prepare('select lesson_id from lecture_placements where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!placement) return jsonError(c, 404, 'NOT_FOUND', 'Placement not found.')
  const statements = [c.env.DB.prepare('delete from lecture_placements where id = ? and workspace_id = ?').bind(id, workspaceId)]
  statements.push(...await compactLessonPlacements(c.env.DB, workspaceId, placement.lesson_id))
  const mutation = await batchWithRevision(c, expected, statements)
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, id })
})

export default curriculumRoutes

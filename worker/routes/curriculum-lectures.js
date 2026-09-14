import { Hono } from 'hono'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { optionalWorkspaceIdentity, requireWorkspaceIdentity, requireWorkspaceManagement } from '../middleware/workspace-auth.js'
import {
  audience,
  batchWithRevision,
  compactLessonPlacements,
  currentRevision,
  hasObsoleteLectureFields,
  isManager,
  parseExpectedRevision,
  parsePositiveId,
  tierAllowed,
  validateSharedVideo,
  workspace,
} from '../lib/curriculum.js'

const lectureRoutes = new Hono()

function readBody(c) {
  return c.req.json().catch(() => null)
}

async function allAuthorizedPlacements(c, lectureId = null) {
  const aud = await audience(c)
  if (aud.error) return aud
  const workspaceId = workspace(c).id
  const params = [workspaceId]
  let filter = ''
  if (lectureId !== null) { filter = ' and lecture.id = ?'; params.push(lectureId) }
  const rows = await c.env.DB.prepare(`
    select p.id as placement_id, p.order_index, p.lesson_id,
      l.title as lesson_title, l.order_index as lesson_order, t.id as topic_id, t.title as topic_title,
      t.programme, t.order_index as topic_order,
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

function unitSummary(row) {
  if (!row) return null
  return { placement_id: row.placement_id, lecture_id: row.lecture_id, title: row.title, lesson_id: row.lesson_id, topic_id: row.topic_id, programme: row.programme }
}

async function lectureWithDerivedProgrammes(db, workspaceId, id) {
  const lecture = await db.prepare(`
    select id, title, youtube_url, is_visible, minimum_access_tier, created_by, created_at, updated_at, workspace_id
    from lectures where id = ? and workspace_id = ?
  `).bind(id, workspaceId).first()
  if (!lecture) return null
  const placements = await db.prepare(`
    select p.id as placement_id
      , p.lesson_id
      , p.order_index
      , l.title as lesson_title
      , l.order_index as lesson_order
      , t.id as topic_id
      , t.title as topic_title
      , t.programme
      , t.order_index as topic_order
    from lecture_placements p
    join curriculum_lessons l on l.id = p.lesson_id and l.workspace_id = p.workspace_id
    join curriculum_topics t on t.id = l.topic_id and t.workspace_id = l.workspace_id
    where p.workspace_id = ? and p.lecture_id = ?
    order by case t.programme when 10 then 0 when 11 then 1 when 12 then 2 when 'thpt' then 3 else 4 end, t.order_index, l.order_index, p.order_index, p.id
  `).bind(workspaceId, id).all()
  const grades = [...new Set(placements.results.map((row) => row.programme))]
  return { ...lecture, grades, placements: placements.results }
}

lectureRoutes.get('/', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const workspaceId = workspace(c).id
  const revision = await currentRevision(c.env.DB, workspaceId)
  const q = typeof c.req.query('q') === 'string' ? `%${c.req.query('q').trim()}%` : '%'
  const rows = await c.env.DB.prepare(`
    select id from lectures where workspace_id = ? and title like ? order by title, id
  `).bind(workspaceId, q).all()
  const lectures = []
  for (const row of rows.results) lectures.push(await lectureWithDerivedProgrammes(c.env.DB, workspaceId, row.id))
  return jsonSuccess(c, { revision, lectures })
})

lectureRoutes.get('/:id', optionalWorkspaceIdentity, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  if (!id) return jsonError(c, 400, 'INVALID_ID', 'Lecture id must be a positive integer.')
  const workspaceId = workspace(c).id
  const revision = isManager(c) ? await currentRevision(c.env.DB, workspaceId) : undefined
  const lecture = await c.env.DB.prepare(`
    select id, title, youtube_url, is_visible, minimum_access_tier, workspace_id
    from lectures where id = ? and workspace_id = ?
  `).bind(id, workspaceId).first()
  if (!lecture) return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
  const placements = await allAuthorizedPlacements(c, id)
  if (placements.error) return placements.error
  let selected = null
  const placementId = c.req.query('placement') === undefined ? null : parsePositiveId(c.req.query('placement'))
  if (placementId) selected = placements.rows.find((row) => row.placement_id === placementId) || null
  if (!selected) selected = placements.rows[0] || null
  if (!selected && !placements.aud.manager) return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
  if (!selected && placements.aud.manager) return jsonSuccess(c, { revision, lecture, placement: null, breadcrumb: null, previous: null, next: null })

  const sequence = await allAuthorizedPlacements(c, null)
  if (sequence.error) return sequence.error
  const sameProgramme = sequence.rows.filter((row) => row.programme === selected.programme)
  const index = sameProgramme.findIndex((row) => row.placement_id === selected.placement_id)
  return jsonSuccess(c, {
    revision,
    lecture,
    placement: { id: selected.placement_id, lesson_id: selected.lesson_id, order_index: selected.order_index },
    breadcrumb: { programme: selected.programme, topic_id: selected.topic_id, topic_title: selected.topic_title, lesson_id: selected.lesson_id, lesson_title: selected.lesson_title },
    previous: unitSummary(index > 0 ? sameProgramme[index - 1] : null),
    next: unitSummary(index >= 0 && index < sameProgramme.length - 1 ? sameProgramme[index + 1] : null),
  })
})

lectureRoutes.post('/', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  if (hasObsoleteLectureFields(body)) return jsonError(c, 409, 'CURRICULUM_RELOAD_REQUIRED', 'Reload curriculum before editing videos.')
  const valid = validateSharedVideo(body)
  if (expected === null) return jsonError(c, 400, 'VALIDATION_ERROR', 'expected_revision is required.')
  if (valid.error) return jsonError(c, 400, 'VALIDATION_ERROR', valid.error)
  const workspaceId = workspace(c).id
  const user = c.get('authUser')
  const mutation = await batchWithRevision(c, expected, [c.env.DB.prepare(`
    insert into lectures (workspace_id, title, section_name, youtube_url, order_index, is_visible, minimum_access_tier, created_by)
    values (?, ?, 'Curriculum', ?, 0, ?, ?, ?)
  `).bind(workspaceId, valid.lecture.title, valid.lecture.youtube_url, Number(valid.lecture.is_visible ?? true), valid.lecture.minimum_access_tier, user.id)])
  if (mutation.response) return mutation.response
  const id = mutation.results[2].meta.last_row_id
  return jsonSuccess(c, { revision: mutation.revision, lecture: await lectureWithDerivedProgrammes(c.env.DB, workspaceId, id) }, 201)
})

lectureRoutes.put('/order', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  return jsonError(c, 409, 'CURRICULUM_RELOAD_REQUIRED', 'Reload curriculum and use curriculum ordering.')
})

lectureRoutes.put('/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  if (!id || expected === null) return jsonError(c, 400, 'VALIDATION_ERROR', 'id and expected_revision are required.')
  if (hasObsoleteLectureFields(body)) return jsonError(c, 409, 'CURRICULUM_RELOAD_REQUIRED', 'Reload curriculum before editing videos.')
  const valid = validateSharedVideo(body, { partial: true })
  if (valid.error) return jsonError(c, 400, 'VALIDATION_ERROR', valid.error)
  const workspaceId = workspace(c).id
  const lecture = await c.env.DB.prepare('select id from lectures where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!lecture) return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
  const mutation = await batchWithRevision(c, expected, [c.env.DB.prepare(`
    update lectures set
      title = coalesce(?, title),
      youtube_url = coalesce(?, youtube_url),
      minimum_access_tier = coalesce(?, minimum_access_tier),
      is_visible = coalesce(?, is_visible),
      updated_at = current_timestamp
    where id = ? and workspace_id = ?
  `).bind(
    body.title === undefined ? null : valid.lecture.title,
    body.youtube_url === undefined ? null : valid.lecture.youtube_url,
    valid.lecture.minimum_access_tier ?? null,
    valid.lecture.is_visible === undefined ? null : Number(valid.lecture.is_visible),
    id,
    workspaceId,
  )])
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, lecture: await lectureWithDerivedProgrammes(c.env.DB, workspaceId, id) })
})

lectureRoutes.delete('/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  const body = await readBody(c)
  const expected = parseExpectedRevision(body)
  if (!id || expected === null) return jsonError(c, 400, 'VALIDATION_ERROR', 'id and expected_revision are required.')
  const workspaceId = workspace(c).id
  const lecture = await c.env.DB.prepare('select id from lectures where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!lecture) return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
  const lessons = await c.env.DB.prepare('select distinct lesson_id from lecture_placements where workspace_id = ? and lecture_id = ?').bind(workspaceId, id).all()
  const statements = [c.env.DB.prepare('delete from lectures where id = ? and workspace_id = ?').bind(id, workspaceId)]
  for (const lesson of lessons.results) statements.push(...await compactLessonPlacements(c.env.DB, workspaceId, lesson.lesson_id))
  const mutation = await batchWithRevision(c, expected, statements)
  if (mutation.response) return mutation.response
  return jsonSuccess(c, { revision: mutation.revision, id })
})

export default lectureRoutes

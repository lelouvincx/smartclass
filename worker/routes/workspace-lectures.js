import { Hono } from 'hono'
import { attachGrades, parseGrades } from '../lib/grades.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import {
  optionalWorkspaceIdentity,
  requireWorkspaceIdentity,
  requireWorkspaceManagement,
} from '../middleware/workspace-auth.js'

const workspaceLecturesRoutes = new Hono()
const LECTURE_ACCESS_TIERS = new Set(['guest', 'standard', 'vip'])

function workspace(c) {
  return c.get('workspace')
}

function isYouTubeUrl(value) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    let videoId = null

    if (url.protocol !== 'https:') return false
    if (hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0]
    } else if (hostname === 'youtube.com') {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v')
      if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) {
        videoId = url.pathname.split('/').filter(Boolean)[1]
      }
    }

    return /^[\w-]{11}$/.test(videoId || '')
  } catch {
    return false
  }
}

function validateLecture(body, { defaultGrades = false, defaultAccessTier = false } = {}) {
  const parsedGrades = body?.grades === undefined && !defaultGrades
    ? null
    : parseGrades(body?.grades, { defaultToAll: defaultGrades })
  const lecture = {
    title: typeof body?.title === 'string' ? body.title.trim() : '',
    section_name: typeof body?.section_name === 'string' ? body.section_name.trim() : '',
    youtube_url: typeof body?.youtube_url === 'string' ? body.youtube_url.trim() : '',
    is_visible: body?.is_visible,
    minimum_access_tier: body?.minimum_access_tier === undefined && defaultAccessTier
      ? 'standard'
      : body?.minimum_access_tier,
    grades: parsedGrades?.grades,
  }

  if (!lecture.title || !lecture.section_name || !lecture.youtube_url) {
    return { error: 'Title, section, and YouTube URL are required.' }
  }

  if (!isYouTubeUrl(lecture.youtube_url)) {
    return { error: 'YouTube URL must link to a valid video.' }
  }

  if (lecture.is_visible !== undefined && typeof lecture.is_visible !== 'boolean') {
    return { error: 'Lecture visibility must be true or false.' }
  }

  if (lecture.minimum_access_tier !== undefined
    && !LECTURE_ACCESS_TIERS.has(lecture.minimum_access_tier)) {
    return { error: 'minimum_access_tier must be guest, standard, or vip.' }
  }

  if (parsedGrades?.error) {
    return { error: parsedGrades.error }
  }

  return { lecture }
}

function parsePositiveId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function getLecture(db, id, workspaceId) {
  const lecture = await db.prepare(`
    select id, title, section_name, youtube_url, order_index, is_visible
      , minimum_access_tier, created_by, created_at, updated_at, workspace_id
    from lectures
    where id = ? and workspace_id = ?
    limit 1
  `).bind(id, workspaceId).first()
  if (!lecture) return null

  const gradeResult = await db.prepare(`
    select grade
    from lecture_grades
    where lecture_id = ?
    order by grade
  `).bind(id).all()
  return { ...lecture, grades: gradeResult.results.map((row) => row.grade) }
}

function visibleStudentTiers(membership) {
  return membership.access_tier === 'vip' ? ['standard', 'vip'] : ['standard']
}

function authenticatedAudienceError(c) {
  const membership = c.get('workspaceMembership')
  if (!membership) {
    return jsonError(c, 403, 'MEMBERSHIP_REQUIRED', 'Workspace membership is required.')
  }
  if (membership.status === 'pending') {
    return jsonError(c, 403, 'MEMBERSHIP_PENDING', 'Workspace membership is pending approval.')
  }
  if (membership.status === 'disabled') {
    return jsonError(c, 403, 'MEMBERSHIP_DISABLED', 'Workspace membership is disabled.')
  }
  return null
}

workspaceLecturesRoutes.get('/', optionalWorkspaceIdentity, async (c) => {
  const workspaceId = workspace(c).id
  const authUser = c.get('authUser')
  const membership = c.get('workspaceMembership')
  const bindings = [workspaceId]
  let audienceClause = `where lecture.workspace_id = ?
    and lecture.is_visible = 1
    and lecture.minimum_access_tier = 'guest'`

  if (authUser) {
    if (authUser.platform_role === 'platform_admin') {
      audienceClause = 'where lecture.workspace_id = ?'
    } else {
      const audienceError = authenticatedAudienceError(c)
      if (audienceError) return audienceError

      if (membership.role === 'teacher') {
        audienceClause = 'where lecture.workspace_id = ?'
      } else if (membership.role === 'student') {
        const allowedTiers = visibleStudentTiers(membership)
        audienceClause = `where lecture.workspace_id = ?
          and lecture.is_visible = 1
          and (
            lecture.minimum_access_tier = 'guest'
            or (
              lecture.minimum_access_tier in (${allowedTiers.map(() => '?').join(', ')})
              and exists (
                select 1
                from workspace_membership_grades membership_grade
                join lecture_grades lecture_grade on lecture_grade.grade = membership_grade.grade
                where membership_grade.membership_id = ?
                  and lecture_grade.lecture_id = lecture.id
              )
            )
          )`
        bindings.push(...allowedTiers, membership.id)
      } else {
        return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this resource.')
      }
    }
  }

  const result = await c.env.DB.prepare(`
    select id, title, section_name, youtube_url, order_index, is_visible
      , minimum_access_tier, created_by, created_at, updated_at, workspace_id
    from lectures lecture
    ${audienceClause}
    order by order_index asc, id asc
  `).bind(...bindings).all()
  const gradeResult = await c.env.DB.prepare(`
    select lecture_grades.lecture_id, lecture_grades.grade
    from lecture_grades
    join lectures on lectures.id = lecture_grades.lecture_id
    where lectures.workspace_id = ?
    order by lecture_grades.grade
  `).bind(workspaceId).all()

  return jsonSuccess(c, attachGrades(result.results, gradeResult.results, 'lecture_id'))
})

workspaceLecturesRoutes.post('/', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const body = await c.req.json().catch(() => null)
  const { lecture, error } = validateLecture(body, {
    defaultGrades: true,
    defaultAccessTier: true,
  })
  if (error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', error)
  }

  const workspaceId = workspace(c).id
  const authUser = c.get('authUser')
  const gradePlaceholders = lecture.grades.map(() => '(?)').join(', ')
  const [insertResult] = await c.env.DB.batch([
    c.env.DB.prepare(`
      insert into lectures (
        title, section_name, youtube_url, order_index, is_visible, minimum_access_tier, created_by, workspace_id
      ) values (
        ?, ?, ?,
        (select coalesce(max(order_index), -1) + 1 from lectures where workspace_id = ?),
        ?, ?, ?, ?
      )
    `).bind(
      lecture.title,
      lecture.section_name,
      lecture.youtube_url,
      workspaceId,
      lecture.is_visible === undefined ? 1 : Number(lecture.is_visible),
      lecture.minimum_access_tier,
      authUser.id,
      workspaceId,
    ),
    c.env.DB.prepare(`
      insert into lecture_grades (lecture_id, grade)
      with inserted_lecture as materialized (
        select last_insert_rowid() as id
      ), requested_grades(grade) as (
        values ${gradePlaceholders}
      )
      select inserted_lecture.id, requested_grades.grade
      from inserted_lecture
      cross join requested_grades
    `).bind(...lecture.grades),
  ])

  const id = insertResult.meta.last_row_id
  return jsonSuccess(c, await getLecture(c.env.DB, id, workspaceId), 201)
})

workspaceLecturesRoutes.put('/order', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const body = await c.req.json().catch(() => null)
  const ids = body?.ids

  if (!Array.isArray(ids)
    || ids.some((id) => !Number.isInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'ids must be an array of unique positive integers.')
  }

  const workspaceId = workspace(c).id
  const existing = await c.env.DB.prepare(`
    select id
    from lectures
    where workspace_id = ?
    order by id
  `).bind(workspaceId).all()
  const existingIds = existing.results.map((lecture) => lecture.id).sort((a, b) => a - b)
  const requestedIds = [...ids].sort((a, b) => a - b)
  if (existingIds.length !== requestedIds.length
    || existingIds.some((id, index) => id !== requestedIds[index])) {
    return jsonError(c, 400, 'INVALID_LECTURE_ORDER', 'ids must contain every lecture in this workspace exactly once.')
  }

  if (ids.length > 0) {
    await c.env.DB.batch(ids.map((id, orderIndex) => (
      c.env.DB.prepare(`
        update lectures
        set order_index = ?, updated_at = current_timestamp
        where id = ? and workspace_id = ?
      `).bind(orderIndex, id, workspaceId)
    )))
  }

  return jsonSuccess(c, { ids })
})

workspaceLecturesRoutes.put('/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  if (!id) {
    return jsonError(c, 400, 'INVALID_ID', 'Lecture id must be a positive integer.')
  }

  const body = await c.req.json().catch(() => null)
  const { lecture, error } = validateLecture(body)
  if (error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', error)
  }

  const workspaceId = workspace(c).id
  const statements = [
    c.env.DB.prepare(`
      update lectures
      set title = ?, section_name = ?, youtube_url = ?
        , is_visible = coalesce(?, is_visible)
        , minimum_access_tier = coalesce(?, minimum_access_tier)
        , updated_at = current_timestamp
      where id = ? and workspace_id = ?
    `).bind(
      lecture.title,
      lecture.section_name,
      lecture.youtube_url,
      lecture.is_visible === undefined ? null : Number(lecture.is_visible),
      lecture.minimum_access_tier ?? null,
      id,
      workspaceId,
    ),
  ]
  if (lecture.grades) {
    statements.push(c.env.DB.prepare(`
      delete from lecture_grades
      where lecture_id in (
        select id from lectures where id = ? and workspace_id = ?
      )
    `).bind(id, workspaceId))
    statements.push(...lecture.grades.map((grade) => c.env.DB.prepare(`
      insert into lecture_grades (lecture_id, grade)
      select id, ?
      from lectures
      where id = ? and workspace_id = ?
    `).bind(grade, id, workspaceId)))
  }
  const [result] = await c.env.DB.batch(statements)

  if (result.meta.changes === 0) {
    return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
  }

  return jsonSuccess(c, await getLecture(c.env.DB, id, workspaceId))
})

workspaceLecturesRoutes.delete('/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = parsePositiveId(c.req.param('id'))
  if (!id) {
    return jsonError(c, 400, 'INVALID_ID', 'Lecture id must be a positive integer.')
  }

  const result = await c.env.DB.prepare(`
    delete from lectures
    where id = ? and workspace_id = ?
  `).bind(id, workspace(c).id).run()
  if (result.meta.changes === 0) {
    return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
  }

  return jsonSuccess(c, { id })
})

export default workspaceLecturesRoutes

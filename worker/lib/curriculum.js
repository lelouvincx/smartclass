import { jsonError } from './response.js'

export const PROGRAMMES = [10, 11, 12, 'thpt', 'dgnl']
export const ACCESS_TIERS = ['guest', 'standard', 'vip']

export function workspace(c) {
  return c.get('workspace')
}

export function parsePositiveId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function parseProgramme(value, workspaceId) {
  const normalized = value === '10' ? 10 : value === '11' ? 11 : value === '12' ? 12 : value
  if (normalized === 'thpt' && workspaceId !== 'maths') return null
  return PROGRAMMES.includes(normalized) ? normalized : null
}

export function trimTitle(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isManager(c) {
  const authUser = c.get('authUser')
  const membership = c.get('workspaceMembership')
  return authUser?.platform_role === 'platform_admin'
    || (membership?.role === 'teacher' && membership.status === 'active')
}

export function authenticatedAudienceError(c) {
  const membership = c.get('workspaceMembership')
  if (!membership) return jsonError(c, 403, 'MEMBERSHIP_REQUIRED', 'Workspace membership is required.')
  if (membership.status === 'pending') return jsonError(c, 403, 'MEMBERSHIP_PENDING', 'Workspace membership is pending approval.')
  if (membership.status === 'disabled') return jsonError(c, 403, 'MEMBERSHIP_DISABLED', 'Workspace membership is disabled.')
  return null
}

export function tierAllowed(contentTier, membership) {
  if (contentTier === 'guest') return true
  if (!membership || membership.role !== 'student' || membership.status !== 'active') return false
  if (contentTier === 'standard') return membership.access_tier === 'standard' || membership.access_tier === 'vip'
  return membership.access_tier === 'vip'
}

export async function membershipProgrammes(db, membershipId) {
  if (!membershipId) return []
  const rows = await db.prepare(`
    select grade from workspace_membership_grades where membership_id = ?
  `).bind(membershipId).all()
  return rows.results.map((row) => row.grade)
}

export async function audience(c) {
  const authUser = c.get('authUser')
  if (!authUser) return { kind: 'guest', programmes: [], manager: false }
  if (isManager(c)) return { kind: 'manager', programmes: PROGRAMMES, manager: true }
  const error = authenticatedAudienceError(c)
  if (error) return { error }
  const membership = c.get('workspaceMembership')
  if (membership.role !== 'student') return { error: jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this resource.') }
  return {
    kind: 'student',
    programmes: await membershipProgrammes(c.env.DB, membership.id),
    membership,
    manager: false,
  }
}

export function isYouTubeUrl(value) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    let videoId = null
    if (url.protocol !== 'https:') return false
    if (hostname === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0]
    if (hostname === 'youtube.com') {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v')
      if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/').filter(Boolean)[1]
    }
    return /^[\w-]{11}$/.test(videoId || '')
  } catch {
    return false
  }
}

export function validateSharedVideo(body, { partial = false } = {}) {
  const obsolete = ['section_name', 'grades', 'order_index'].find((field) => Object.prototype.hasOwnProperty.call(body ?? {}, field))
  if (obsolete) return { reload: true }
  const hasTitle = Object.prototype.hasOwnProperty.call(body ?? {}, 'title')
  const hasYoutubeUrl = Object.prototype.hasOwnProperty.call(body ?? {}, 'youtube_url')
  const hasTier = Object.prototype.hasOwnProperty.call(body ?? {}, 'minimum_access_tier')
  const hasVisible = Object.prototype.hasOwnProperty.call(body ?? {}, 'is_visible')
  if (partial && !hasTitle && !hasYoutubeUrl && !hasTier && !hasVisible) return { error: 'At least one shared video field is required.' }
  const title = trimTitle(body?.title)
  const youtubeUrl = typeof body?.youtube_url === 'string' ? body.youtube_url.trim() : ''
  const tier = hasTier ? body.minimum_access_tier : (partial ? undefined : 'standard')
  const visible = body?.is_visible
  if (!partial || hasTitle) {
    if (!title) return { error: 'Title is required.' }
  }
  if (!partial || hasYoutubeUrl) {
    if (!isYouTubeUrl(youtubeUrl)) return { error: 'YouTube URL must link to a valid video.' }
  }
  if (tier !== undefined && !ACCESS_TIERS.includes(tier)) return { error: 'minimum_access_tier must be guest, standard, or vip.' }
  if (visible !== undefined && typeof visible !== 'boolean') return { error: 'Lecture visibility must be true or false.' }
  return { lecture: { title, youtube_url: youtubeUrl, minimum_access_tier: tier, is_visible: visible } }
}

export function parseExpectedRevision(body) {
  const value = body?.expected_revision
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null
  const revision = Number(value)
  return Number.isSafeInteger(revision) ? revision : null
}

export async function currentRevision(db, workspaceId) {
  return db.prepare('select curriculum_revision from workspaces where id = ?').bind(workspaceId).first('curriculum_revision')
}

export async function revisionChanged(db, workspaceId, expectedRevision) {
  return await currentRevision(db, workspaceId) !== expectedRevision
}

export function revisionStatements(db, workspaceId, expectedRevision) {
  return [
    db.prepare('update workspaces set curriculum_revision = curriculum_revision + 1 where id = ? and curriculum_revision = ?').bind(workspaceId, expectedRevision),
    // Only this guard assigns null to the non-null revision, giving conflicts a distinct error.
    db.prepare('update workspaces set curriculum_revision = null where id = ? and changes() <> 1').bind(workspaceId),
  ]
}

export function isRevisionGuardError(error) {
  const message = String(error?.message || error || '')
  return message.includes('NOT NULL constraint failed: workspaces.curriculum_revision')
}

export async function batchWithRevision(c, expectedRevision, statements) {
  const workspaceId = workspace(c).id
  try {
    const results = await c.env.DB.batch([
      ...revisionStatements(c.env.DB, workspaceId, expectedRevision),
      ...statements,
    ])
    return { results, revision: expectedRevision + 1 }
  } catch (error) {
    if (isRevisionGuardError(error) && await revisionChanged(c.env.DB, workspaceId, expectedRevision)) {
      return { response: jsonError(c, 409, 'CURRICULUM_CHANGED', 'Curriculum has changed. Reload and try again.') }
    }
    throw error
  }
}

export async function compactLessonPlacements(db, workspaceId, lessonId) {
  return [db.prepare(`
    update lecture_placements
    set order_index = (
      select ranked.new_order from (
        select id, row_number() over (order by order_index, id) - 1 as new_order
        from lecture_placements where workspace_id = ? and lesson_id = ?
      ) ranked where ranked.id = lecture_placements.id
    )
    where workspace_id = ? and lesson_id = ?
  `).bind(workspaceId, lessonId, workspaceId, lessonId)]
}

export async function compactTopicLessons(db, workspaceId, topicId) {
  return [db.prepare(`
    update curriculum_lessons
    set order_index = (
      select ranked.new_order from (
        select id, row_number() over (order by order_index, id) - 1 as new_order
        from curriculum_lessons where workspace_id = ? and topic_id = ?
      ) ranked where ranked.id = curriculum_lessons.id
    )
    where workspace_id = ? and topic_id = ?
  `).bind(workspaceId, topicId, workspaceId, topicId)]
}

export async function compactProgrammeTopics(db, workspaceId, programme) {
  return [db.prepare(`
    update curriculum_topics
    set order_index = (
      select ranked.new_order from (
        select id, row_number() over (order by order_index, id) - 1 as new_order
        from curriculum_topics where workspace_id = ? and programme = ?
      ) ranked where ranked.id = curriculum_topics.id
    )
    where workspace_id = ? and programme = ?
  `).bind(workspaceId, programme, workspaceId, programme)]
}

export function toUnit(row) {
  return {
    placement_id: row.placement_id,
    order_index: row.order_index,
    lecture: {
      id: row.lecture_id,
      title: row.title,
      youtube_url: row.youtube_url,
      minimum_access_tier: row.minimum_access_tier,
      is_visible: row.is_visible,
    },
  }
}

export function hasObsoleteLectureFields(body) {
  return ['section_name', 'grades', 'order_index'].some((field) => Object.prototype.hasOwnProperty.call(body ?? {}, field))
}

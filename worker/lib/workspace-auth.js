import { sign } from 'hono/jwt'
import { parseJwtDuration } from './auth.js'
import { GRADES } from './grades.js'
import { getWorkspaceSites } from './workspaces.js'

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function normalizeUserId(userId) {
  if (typeof userId === 'number' && isPositiveSafeInteger(userId)) {
    return userId
  }

  if (typeof userId === 'string' && /^\d+$/.test(userId)) {
    const parsed = Number(userId)
    if (isPositiveSafeInteger(parsed) && String(parsed) === userId) {
      return parsed
    }
  }

  throw new Error('invalid user id')
}

function assertWorkspaceId(workspaceId) {
  if (typeof workspaceId !== 'string' || workspaceId.trim() === '') {
    throw new Error('invalid workspace id')
  }
  return workspaceId
}

function sortGrades(grades) {
  return GRADES.filter((grade) => grades.includes(grade))
}

function configuredDestinations(env, workspaceIds) {
  const sitesById = new Map(getWorkspaceSites(env).map((site) => [site.id, site]))
  return workspaceIds.map((workspaceId) => {
    const site = sitesById.get(workspaceId)
    if (!site?.frontend_origin) {
      throw new Error(`Workspace ${workspaceId} is missing configured frontend origin`)
    }
    return { workspace_id: workspaceId, url: site.frontend_origin }
  })
}

export async function issueWorkspaceAccessToken(env, userId, workspaceId) {
  if (!env?.JWT_SECRET) {
    throw new Error('missing jwt secret')
  }

  const normalizedUserId = normalizeUserId(userId)
  const normalizedWorkspaceId = assertWorkspaceId(workspaceId)
  const now = Math.floor(Date.now() / 1000)
  const expiresInSeconds = parseJwtDuration(env.JWT_EXPIRES_IN || env.JWT_EXPIRE_IN)

  return sign({
    sub: String(normalizedUserId),
    workspace_id: normalizedWorkspaceId,
    iat: now,
    exp: now + expiresInSeconds,
  }, env.JWT_SECRET, 'HS256')
}

export async function loadWorkspaceAccount(db, userId, workspaceId) {
  const normalizedUserId = normalizeUserId(userId)
  const normalizedWorkspaceId = assertWorkspaceId(workspaceId)

  const user = await db.prepare(`
    select id, name, phone, email, google_email, platform_role, disabled_at
    from users
    where id = ?
    limit 1
  `).bind(normalizedUserId).first()

  if (!user) return null

  const membership = await db.prepare(`
    select id, workspace_id, user_id, role, status, access_tier, display_name
    from workspace_memberships
    where user_id = ? and workspace_id = ?
    limit 1
  `).bind(normalizedUserId, normalizedWorkspaceId).first()

  let membershipWithGrades = null
  if (membership) {
    const grades = await db.prepare(`
      select grade
      from workspace_membership_grades
      where membership_id = ?
    `).bind(membership.id).all()
    membershipWithGrades = {
      ...membership,
      grades: sortGrades(grades.results.map((row) => row.grade)),
    }
  }

  const teaching = await db.prepare(`
    select workspace_id
    from workspace_memberships
    where user_id = ? and role = 'teacher' and status = 'active'
    order by workspace_id
  `).bind(normalizedUserId).all()

  return {
    identity: user,
    membership: membershipWithGrades,
    activeTeachingWorkspaceIds: teaching.results.map((row) => row.workspace_id),
  }
}

export function getTeacherRouting(account, currentWorkspaceId, env) {
  if (!account || account.identity.disabled_at !== null || account.identity.platform_role === 'platform_admin') {
    return { action: 'stay' }
  }

  const activeTeachingWorkspaceIds = account.activeTeachingWorkspaceIds ?? []
  if (activeTeachingWorkspaceIds.length === 0 || activeTeachingWorkspaceIds.includes(currentWorkspaceId)) {
    return { action: 'stay' }
  }

  const destinations = configuredDestinations(env, activeTeachingWorkspaceIds)
  if (destinations.length === 1) {
    return { action: 'redirect', destinations }
  }

  return { action: 'choose', destinations }
}

export { normalizeUserId }

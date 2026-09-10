import { verifyAccessToken } from '../lib/auth.js'
import { getTeacherRouting, loadWorkspaceAccount, normalizeUserId } from '../lib/workspace-auth.js'
import { jsonError } from '../lib/response.js'

function noStore(c) {
  c.header('Cache-Control', 'private, no-store')
}

function bearerToken(c) {
  const authorization = c.req.header('Authorization')
  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new Error('missing bearer token')
  }

  const token = authorization.slice('Bearer '.length)
  if (!token) {
    throw new Error('empty bearer token')
  }

  return token
}

function validateWorkspaceClaims(payload, workspaceId) {
  const allowedClaims = new Set(['sub', 'workspace_id', 'iat', 'exp'])
  for (const claim of Object.keys(payload ?? {})) {
    if (!allowedClaims.has(claim)) {
      throw new Error('unexpected token claim')
    }
  }

  if (payload?.workspace_id !== workspaceId) {
    throw new Error('workspace claim mismatch')
  }

  if (typeof payload?.sub !== 'string') {
    throw new Error('invalid token subject')
  }
  const userId = normalizeUserId(payload.sub)
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat) {
    throw new Error('invalid token timestamps')
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.iat > now) {
    throw new Error('future token')
  }
  if (payload.exp <= now) {
    throw new Error('expired token')
  }

  return userId
}

export async function requireWorkspaceIdentity(c, next) {
  noStore(c)

  const workspace = c.get('workspace')
  if (!workspace?.id) {
    return jsonError(c, 500, 'WORKSPACE_NOT_RESOLVED', 'Workspace context was not resolved.')
  }

  if (!c.env.JWT_SECRET) {
    return jsonError(c, 500, 'MISSING_JWT_SECRET', 'Server auth configuration is missing.')
  }

  let userId
  try {
    const token = bearerToken(c)
    const payload = await verifyAccessToken(token, c.env)
    userId = validateWorkspaceClaims(payload, workspace.id)
  } catch {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Token is invalid or expired.')
  }

  const account = await loadWorkspaceAccount(c.env.DB, userId, workspace.id)
  if (!account) {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Authenticated user no longer exists.')
  }

  if (account.identity.disabled_at !== null) {
    return jsonError(c, 403, 'ACCOUNT_DISABLED', 'Your account has been disabled.')
  }

  c.set('authUser', account.identity)
  c.set('workspaceMembership', account.membership)
  c.set('activeTeachingWorkspaceIds', account.activeTeachingWorkspaceIds)
  c.set('teacherRouting', getTeacherRouting(account, workspace.id, c.env))

  await next()
}

export async function optionalWorkspaceIdentity(c, next) {
  noStore(c)
  const authorization = c.req.header('Authorization')
  if (authorization === undefined || authorization === null) {
    await next()
    return
  }

  return requireWorkspaceIdentity(c, next)
}

export async function requireWorkspaceStudent(c, next) {
  const authUser = c.get('authUser')
  if (!authUser) {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Authentication is required.')
  }

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
  if (membership.role !== 'student') {
    return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this resource.')
  }

  await next()
}

export async function requireWorkspaceManagement(c, next) {
  const authUser = c.get('authUser')
  if (!authUser) {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Authentication is required.')
  }

  if (authUser.platform_role === 'platform_admin') {
    await next()
    return
  }

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
  if (membership.role !== 'teacher') {
    return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this resource.')
  }

  await next()
}

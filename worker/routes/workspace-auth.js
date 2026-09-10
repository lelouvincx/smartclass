import { Hono } from 'hono'
import { hashPassword, isValidVietnamPhone, normalizeName, normalizePhone, verifyPassword } from '../lib/auth.js'
import { parseGrades } from '../lib/grades.js'
import { exchangeCode, verifyGoogleIdToken } from '../lib/google-oauth.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { getTeacherRouting, issueWorkspaceAccessToken, loadWorkspaceAccount } from '../lib/workspace-auth.js'
import { requireWorkspaceIdentity } from '../middleware/workspace-auth.js'

const authRoutes = new Hono()

function isUniqueConflict(error, needle) {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed') && error.message.includes(needle)
}

function googleConfigMissing(c) {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return jsonError(c, 500, 'MISSING_GOOGLE_CONFIG', 'Server Google OAuth config is missing.')
  }
  return null
}

function workspace(c) {
  return c.get('workspace')
}

function accountEnvelope(account, site, env, token) {
  const data = {
    user: account.identity,
    workspace: site,
    membership: account.membership,
    teacher_routing: getTeacherRouting(account, site.id, env),
  }
  if (token) data.token = token
  return data
}

async function loadCurrentAccount(c, userId) {
  return loadWorkspaceAccount(c.env.DB, userId, workspace(c).id)
}

async function tokenEnvelope(c, account) {
  const token = await issueWorkspaceAccessToken(c.env, account.identity.id, workspace(c).id)
  return accountEnvelope(account, workspace(c), c.env, token)
}

async function exchangeAndVerify(c, body) {
  const site = workspace(c)
  const { code, code_verifier, redirect_uri, expected_nonce } = body ?? {}
  if (!code || !code_verifier || !redirect_uri || !expected_nonce) {
    return { error: jsonError(c, 400, 'VALIDATION_ERROR', 'code, code_verifier, redirect_uri, and expected_nonce are required.') }
  }
  if (redirect_uri !== site.google_redirect_uri) {
    return { error: jsonError(c, 400, 'INVALID_REDIRECT_URI', 'Google callback URL does not match this workspace.') }
  }

  let tokens
  try {
    tokens = await exchangeCode(c.env, { code, codeVerifier: code_verifier, redirectUri: redirect_uri })
  } catch (error) {
    if (error.code === 'GOOGLE_UNAVAILABLE') {
      return { error: jsonError(c, 502, 'GOOGLE_UNAVAILABLE', 'Google is temporarily unavailable.') }
    }
    return { error: jsonError(c, 400, 'INVALID_GOOGLE_CODE', 'Google rejected the authorization code.') }
  }

  if (!tokens?.id_token) {
    return { error: jsonError(c, 502, 'GOOGLE_UNAVAILABLE', 'Google did not return an id_token.') }
  }

  try {
    return { claims: await verifyGoogleIdToken(c.env, tokens.id_token, { expectedNonce: expected_nonce }) }
  } catch (error) {
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      return { error: jsonError(c, 401, 'EMAIL_NOT_VERIFIED', 'Google reports your email is not verified.') }
    }
    if (error.code === 'GOOGLE_UNAVAILABLE') {
      return { error: jsonError(c, 502, 'GOOGLE_UNAVAILABLE', 'Google JWKS is temporarily unavailable.') }
    }
    return { error: jsonError(c, 401, 'INVALID_ID_TOKEN', 'Google id_token failed verification.') }
  }
}

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = normalizeName(body?.name)
  const phone = normalizePhone(body?.phone)
  const password = body?.password
  const parsedGrades = parseGrades(body?.grades)

  if (!name || typeof phone !== 'string' || !phone || typeof password !== 'string' || !password) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Name, phone, and password are required.')
  }
  if (parsedGrades.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }
  if (!isValidVietnamPhone(phone)) {
    return jsonError(c, 400, 'INVALID_PHONE', 'Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
  }
  if (password.length < 3) {
    return jsonError(c, 400, 'WEAK_PASSWORD', 'Password must be at least 3 characters long.')
  }

  const existingUser = await c.env.DB.prepare('select id from users where phone = ? limit 1').bind(phone).first()
  if (existingUser) {
    return jsonError(c, 409, 'PHONE_EXISTS', 'Phone number is already registered. Sign in, then request to join this workspace.')
  }

  const passwordHash = await hashPassword(password)
  let result
  try {
    const batchResults = await c.env.DB.batch([
      c.env.DB.prepare(`
        insert into users (name, phone, password_hash, role, status, platform_role)
        values (?, ?, ?, 'student', 'pending', 'user')
      `).bind(name, phone, passwordHash),
      c.env.DB.prepare(`
        insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
        select ?, id, 'student', 'pending', 'standard' from users where phone = ?
      `).bind(workspace(c).id, phone),
      ...parsedGrades.grades.map((grade) => c.env.DB.prepare(`
        insert into workspace_membership_grades (membership_id, grade)
        select wm.id, ?
        from workspace_memberships wm
        join users u on u.id = wm.user_id
        where u.phone = ? and wm.workspace_id = ?
      `).bind(grade, phone, workspace(c).id)),
    ])
    result = batchResults[0]
  } catch (error) {
    if (isUniqueConflict(error, 'users.phone')) {
      return jsonError(c, 409, 'PHONE_EXISTS', 'Phone number is already registered. Sign in, then request to join this workspace.')
    }
    throw error
  }

  const account = await loadCurrentAccount(c, result.meta.last_row_id)
  return jsonSuccess(c, accountEnvelope(account, workspace(c), c.env), 201)
})

authRoutes.post('/login', async (c) => {
  if (!c.env.JWT_SECRET) {
    return jsonError(c, 500, 'MISSING_JWT_SECRET', 'Server auth configuration is missing.')
  }

  const body = await c.req.json().catch(() => null)
  const phone = normalizePhone(body?.phone)
  const password = body?.password
  if (typeof phone !== 'string' || !phone || typeof password !== 'string' || !password) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Phone and password are required.')
  }

  const user = await c.env.DB.prepare(`
    select id, password_hash, disabled_at
    from users
    where phone = ?
    limit 1
  `).bind(phone).first()
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return jsonError(c, 401, 'INVALID_CREDENTIALS', 'Invalid phone or password.')
  }
  if (user.disabled_at !== null) {
    return jsonError(c, 403, 'ACCOUNT_DISABLED', 'Your account has been disabled.')
  }

  const account = await loadCurrentAccount(c, user.id)
  return jsonSuccess(c, await tokenEnvelope(c, account))
})

authRoutes.get('/me', requireWorkspaceIdentity, async (c) => {
  const account = await loadCurrentAccount(c, c.get('authUser').id)
  return jsonSuccess(c, accountEnvelope(account, workspace(c), c.env))
})

authRoutes.put('/name', requireWorkspaceIdentity, async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = normalizeName(body?.name)
  if (!name) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Name is required.')
  }
  await c.env.DB.prepare('update users set name = ?, updated_at = current_timestamp where id = ?')
    .bind(name, c.get('authUser').id)
    .run()
  const account = await loadCurrentAccount(c, c.get('authUser').id)
  return jsonSuccess(c, accountEnvelope(account, workspace(c), c.env))
})

authRoutes.put('/password', requireWorkspaceIdentity, async (c) => {
  const authUser = c.get('authUser')
  const activeTeachingWorkspaceIds = c.get('activeTeachingWorkspaceIds') ?? []
  if (authUser.platform_role !== 'platform_admin' && activeTeachingWorkspaceIds.length === 0) {
    return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to change this password.')
  }

  const body = await c.req.json().catch(() => null)
  const currentPassword = body?.current_password
  const newPassword = body?.new_password
  if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || !newPassword) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Current password and new password are required.')
  }
  if (newPassword.length < 3) {
    return jsonError(c, 400, 'WEAK_PASSWORD', 'Password must be at least 3 characters long.')
  }

  const user = await c.env.DB.prepare('select password_hash from users where id = ? limit 1')
    .bind(authUser.id)
    .first()
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    return jsonError(c, 401, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.')
  }

  await c.env.DB.prepare('update users set password_hash = ?, updated_at = current_timestamp where id = ?')
    .bind(await hashPassword(newPassword), authUser.id)
    .run()
  return jsonSuccess(c, { password_changed: true })
})

authRoutes.post('/google/login', async (c) => {
  if (!c.env.JWT_SECRET) {
    return jsonError(c, 500, 'MISSING_JWT_SECRET', 'Server auth configuration is missing.')
  }
  const cfgErr = googleConfigMissing(c)
  if (cfgErr) return cfgErr

  const body = await c.req.json().catch(() => null)
  const result = await exchangeAndVerify(c, body)
  if (result.error) return result.error

  const user = await c.env.DB.prepare(`
    select id, google_email, disabled_at
    from users
    where google_sub = ?
    limit 1
  `).bind(result.claims.sub).first()
  if (!user) {
    return jsonError(c, 404, 'NO_LINKED_ACCOUNT', 'No SmartClass account is linked to this Google account. Sign in with your phone first, then link Google in Settings.')
  }
  if (user.disabled_at !== null) {
    return jsonError(c, 403, 'ACCOUNT_DISABLED', 'Your account has been disabled.')
  }

  if (result.claims.email && user.google_email !== result.claims.email) {
    await c.env.DB.prepare('update users set google_email = ?, updated_at = current_timestamp where id = ?')
      .bind(result.claims.email, user.id)
      .run()
  }

  const account = await loadCurrentAccount(c, user.id)
  return jsonSuccess(c, await tokenEnvelope(c, account))
})

authRoutes.post('/google/link', requireWorkspaceIdentity, async (c) => {
  const cfgErr = googleConfigMissing(c)
  if (cfgErr) return cfgErr

  const body = await c.req.json().catch(() => null)
  const result = await exchangeAndVerify(c, body)
  if (result.error) return result.error

  const authUser = c.get('authUser')
  const conflict = await c.env.DB.prepare('select id from users where google_sub = ? and id != ? limit 1')
    .bind(result.claims.sub, authUser.id)
    .first()
  if (conflict) {
    return jsonError(c, 409, 'GOOGLE_SUB_TAKEN', 'This Google account is already linked to another SmartClass account.')
  }

  try {
    await c.env.DB.prepare('update users set google_sub = ?, google_email = ?, updated_at = current_timestamp where id = ?')
      .bind(result.claims.sub, result.claims.email ?? null, authUser.id)
      .run()
  } catch (error) {
    if (isUniqueConflict(error, 'users.google_sub') || isUniqueConflict(error, 'idx_users_google_sub')) {
      return jsonError(c, 409, 'GOOGLE_SUB_TAKEN', 'This Google account is already linked to another SmartClass account.')
    }
    throw error
  }

  const account = await loadCurrentAccount(c, authUser.id)
  return jsonSuccess(c, accountEnvelope(account, workspace(c), c.env))
})

authRoutes.delete('/google/link', requireWorkspaceIdentity, async (c) => {
  const authUser = c.get('authUser')
  await c.env.DB.prepare('update users set google_sub = null, google_email = null, updated_at = current_timestamp where id = ?')
    .bind(authUser.id)
    .run()
  const account = await loadCurrentAccount(c, authUser.id)
  return jsonSuccess(c, accountEnvelope(account, workspace(c), c.env))
})

authRoutes.post('/join', requireWorkspaceIdentity, async (c) => {
  const authUser = c.get('authUser')
  if (authUser.disabled_at !== null) {
    return jsonError(c, 403, 'ACCOUNT_DISABLED', 'Your account has been disabled.')
  }

  const existing = c.get('workspaceMembership')
  if (existing) {
    return jsonSuccess(c, accountEnvelope(await loadCurrentAccount(c, authUser.id), workspace(c), c.env))
  }

  const body = await c.req.json().catch(() => null)
  const parsedGrades = parseGrades(body?.grades)
  if (parsedGrades.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }

  let created = false
  try {
    const [membershipResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        insert into workspace_memberships (workspace_id, user_id, role, status, access_tier)
        values (?, ?, 'student', 'pending', 'standard')
      `).bind(workspace(c).id, authUser.id),
      ...parsedGrades.grades.map((grade) => c.env.DB.prepare(`
        insert into workspace_membership_grades (membership_id, grade)
        select id, ? from workspace_memberships where workspace_id = ? and user_id = ?
      `).bind(grade, workspace(c).id, authUser.id)),
    ])
    created = Boolean(membershipResult.meta.last_row_id)
  } catch (error) {
    if (!isUniqueConflict(error, 'workspace_memberships.workspace_id')) {
      throw error
    }
  }

  const account = await loadCurrentAccount(c, authUser.id)
  return jsonSuccess(c, accountEnvelope(account, workspace(c), c.env), created ? 201 : 200)
})

export default authRoutes

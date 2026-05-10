import { Hono } from 'hono'
import { hashPassword, isValidVietnamPhone, issueAccessToken, normalizePhone, verifyPassword } from '../lib/auth.js'
import { exchangeCode, verifyGoogleIdToken } from '../lib/google-oauth.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { requireAuth } from '../middleware/auth.js'

const authRoutes = new Hono()

function googleConfigMissing(c) {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return jsonError(c, 500, 'MISSING_GOOGLE_CONFIG', 'Server Google OAuth config is missing.')
  }
  return null
}

async function exchangeAndVerify(c, body) {
  const { code, code_verifier, redirect_uri, expected_nonce } = body ?? {}
  if (!code || !code_verifier || !redirect_uri) {
    return { error: jsonError(c, 400, 'VALIDATION_ERROR', 'code, code_verifier, and redirect_uri are required.') }
  }

  let tokens
  try {
    tokens = await exchangeCode(c.env, { code, codeVerifier: code_verifier, redirectUri: redirect_uri })
  } catch (e) {
    if (e.code === 'GOOGLE_UNAVAILABLE') {
      return { error: jsonError(c, 502, 'GOOGLE_UNAVAILABLE', 'Google is temporarily unavailable.') }
    }
    return { error: jsonError(c, 400, 'INVALID_GOOGLE_CODE', 'Google rejected the authorization code.') }
  }

  if (!tokens?.id_token) {
    return { error: jsonError(c, 502, 'GOOGLE_UNAVAILABLE', 'Google did not return an id_token.') }
  }

  let claims
  try {
    claims = await verifyGoogleIdToken(c.env, tokens.id_token, { expectedNonce: expected_nonce })
  } catch (e) {
    if (e.code === 'EMAIL_NOT_VERIFIED') {
      return { error: jsonError(c, 401, 'EMAIL_NOT_VERIFIED', 'Google reports your email is not verified.') }
    }
    if (e.code === 'GOOGLE_UNAVAILABLE') {
      return { error: jsonError(c, 502, 'GOOGLE_UNAVAILABLE', 'Google JWKS is temporarily unavailable.') }
    }
    return { error: jsonError(c, 401, 'INVALID_ID_TOKEN', 'Google id_token failed verification.') }
  }

  return { claims }
}

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const phone = normalizePhone(body?.phone)
  const password = body?.password

  if (!phone || !password) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Phone and password are required.')
  }

  if (!isValidVietnamPhone(phone)) {
    return jsonError(c, 400, 'INVALID_PHONE', 'Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
  }

  if (String(password).length < 3) {
    return jsonError(c, 400, 'WEAK_PASSWORD', 'Password must be at least 3 characters long.')
  }

  const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first()
  if (existingUser) {
    return jsonError(c, 409, 'PHONE_EXISTS', 'Phone number is already registered.')
  }

  const passwordHash = await hashPassword(password)

  const result = await c.env.DB.prepare(
    'INSERT INTO users (phone, password_hash, role, status) VALUES (?, ?, ?, ?)',
  )
    .bind(phone, passwordHash, 'student', 'pending')
    .run()

  return c.json(
    {
      success: true,
      data: {
        id: result.meta.last_row_id,
        phone,
        role: 'student',
        status: 'pending',
      },
      message: 'Registration submitted. Please wait for teacher approval.',
    },
    201,
  ) // Keep message field for this endpoint
})

authRoutes.post('/login', async (c) => {
  if (!c.env.JWT_SECRET) {
    return jsonError(c, 500, 'MISSING_JWT_SECRET', 'Server auth configuration is missing.')
  }

  const body = await c.req.json().catch(() => null)
  const phone = normalizePhone(body?.phone)
  const password = body?.password

  if (!phone || !password) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Phone and password are required.')
  }

  const user = await c.env.DB.prepare(
    'SELECT id, phone, password_hash, role, status FROM users WHERE phone = ? LIMIT 1',
  )
    .bind(phone)
    .first()

  if (!user) {
    return jsonError(c, 401, 'INVALID_CREDENTIALS', 'Invalid phone or password.')
  }

  const isPasswordValid = await verifyPassword(password, user.password_hash)
  if (!isPasswordValid) {
    return jsonError(c, 401, 'INVALID_CREDENTIALS', 'Invalid phone or password.')
  }

  if (user.status !== 'active') {
    return jsonError(c, 403, 'ACCOUNT_PENDING', 'Your account is pending approval.')
  }

  const token = await issueAccessToken(c.env, user)

  return jsonSuccess(c, {
    token,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
    },
  })
})

authRoutes.get('/me', requireAuth, async (c) => {
  const authUser = c.get('authUser')
  const user = await c.env.DB.prepare(
    'SELECT id, phone, email, google_email, role, status FROM users WHERE id = ? LIMIT 1',
  )
    .bind(authUser.id)
    .first()

  if (!user) {
    return jsonError(c, 404, 'NOT_FOUND', 'User not found.')
  }

  return jsonSuccess(c, user)
})

// ── Google OIDC (RFC-7) ──────────────────────────────────────────────────────
// Login-only: account must already be linked. Auto-provisioning is intentionally
// not supported — accounts are created via phone (teacher or self-register).

authRoutes.post('/google/login', async (c) => {
  if (!c.env.JWT_SECRET) {
    return jsonError(c, 500, 'MISSING_JWT_SECRET', 'Server auth configuration is missing.')
  }
  const cfgErr = googleConfigMissing(c)
  if (cfgErr) return cfgErr

  const body = await c.req.json().catch(() => null)
  const result = await exchangeAndVerify(c, body)
  if (result.error) return result.error

  const { claims } = result

  const user = await c.env.DB.prepare(
    'SELECT id, phone, role, status, google_email FROM users WHERE google_sub = ? LIMIT 1',
  )
    .bind(claims.sub)
    .first()

  if (!user) {
    return jsonError(
      c,
      404,
      'NO_LINKED_ACCOUNT',
      'No SmartClass account is linked to this Google account. Sign in with your phone first, then link Google in Settings.',
    )
  }

  if (user.status === 'pending') {
    return jsonError(c, 403, 'ACCOUNT_PENDING', 'Your account is pending approval.')
  }
  if (user.status === 'disabled') {
    return jsonError(c, 403, 'ACCOUNT_DISABLED', 'Your account has been disabled.')
  }

  // Refresh google_email if Google now reports a different one.
  if (claims.email && user.google_email !== claims.email) {
    await c.env.DB.prepare(
      'UPDATE users SET google_email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    )
      .bind(claims.email, user.id)
      .run()
  }

  const token = await issueAccessToken(c.env, user)

  return jsonSuccess(c, {
    token,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
    },
  })
})

authRoutes.post('/google/link', requireAuth, async (c) => {
  const cfgErr = googleConfigMissing(c)
  if (cfgErr) return cfgErr

  const body = await c.req.json().catch(() => null)
  const result = await exchangeAndVerify(c, body)
  if (result.error) return result.error

  const { claims } = result
  const authUser = c.get('authUser')

  const conflict = await c.env.DB.prepare(
    'SELECT id FROM users WHERE google_sub = ? AND id != ? LIMIT 1',
  )
    .bind(claims.sub, authUser.id)
    .first()

  if (conflict) {
    return jsonError(
      c,
      409,
      'GOOGLE_SUB_TAKEN',
      'This Google account is already linked to another SmartClass account.',
    )
  }

  await c.env.DB.prepare(
    'UPDATE users SET google_sub = ?, google_email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  )
    .bind(claims.sub, claims.email ?? null, authUser.id)
    .run()

  const updated = await c.env.DB.prepare(
    'SELECT id, phone, email, google_email, role, status FROM users WHERE id = ? LIMIT 1',
  )
    .bind(authUser.id)
    .first()

  return jsonSuccess(c, updated)
})

authRoutes.delete('/google/link', requireAuth, async (c) => {
  const authUser = c.get('authUser')

  await c.env.DB.prepare(
    'UPDATE users SET google_sub = NULL, google_email = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  )
    .bind(authUser.id)
    .run()

  const updated = await c.env.DB.prepare(
    'SELECT id, phone, email, google_email, role, status FROM users WHERE id = ? LIMIT 1',
  )
    .bind(authUser.id)
    .first()

  return jsonSuccess(c, updated)
})

export default authRoutes

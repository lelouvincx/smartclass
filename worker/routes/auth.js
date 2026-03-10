import { Hono } from 'hono'
import { hashPassword, isValidVietnamPhone, issueAccessToken, verifyPassword } from '../lib/auth.js'
import { requireAuth } from '../middleware/auth.js'

const authRoutes = new Hono()

function jsonError(c, status, code, message) {
  return c.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    status,
  )
}

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const phone = body?.phone?.trim()
  const password = body?.password

  if (!phone || !password) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Phone and password are required.')
  }

  if (!isValidVietnamPhone(phone)) {
    return jsonError(c, 400, 'INVALID_PHONE', 'Phone must match +84xxxxxxxxx format.')
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
  )
})

authRoutes.post('/login', async (c) => {
  if (!c.env.JWT_SECRET) {
    return jsonError(c, 500, 'MISSING_JWT_SECRET', 'Server auth configuration is missing.')
  }

  const body = await c.req.json().catch(() => null)
  const phone = body?.phone?.trim()
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

  return c.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    },
  })
})

authRoutes.get('/me', requireAuth, async (c) => {
  const authUser = c.get('authUser')
  const user = await c.env.DB.prepare('SELECT id, phone, role, status FROM users WHERE id = ? LIMIT 1')
    .bind(authUser.id)
    .first()

  if (!user) {
    return jsonError(c, 404, 'NOT_FOUND', 'User not found.')
  }

  return c.json({
    success: true,
    data: user,
  })
})

export default authRoutes

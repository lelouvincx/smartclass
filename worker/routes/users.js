import { Hono } from 'hono'
import { hashPassword, isValidVietnamPhone } from '../lib/auth.js'
import { jsonError } from '../lib/response.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const usersRoutes = new Hono()

usersRoutes.use('*', requireAuth, requireRole('teacher'))

usersRoutes.get('/', async (c) => {
  const status = c.req.query('status')
  const allowedStatus = new Set(['pending', 'active', 'disabled'])

  let sql = 'SELECT id, phone, role, status, created_at, updated_at FROM users WHERE role = ?'
  const params = ['student']

  if (status) {
    if (!allowedStatus.has(status)) {
      return jsonError(c, 400, 'INVALID_STATUS_FILTER', 'Status must be pending, active, or disabled.')
    }
    sql += ' AND status = ?'
    params.push(status)
  }

  sql += ' ORDER BY created_at DESC'

  const result = await c.env.DB.prepare(sql)
    .bind(...params)
    .all()

  return c.json({
    success: true,
    data: result.results,
  })
})

usersRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const phone = body?.phone?.trim()

  if (!phone) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Phone is required.')
  }

  if (!isValidVietnamPhone(phone)) {
    return jsonError(c, 400, 'INVALID_PHONE', 'Phone must match +84xxxxxxxxx format.')
  }

  const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first()
  if (existingUser) {
    return jsonError(c, 409, 'PHONE_EXISTS', 'Phone number is already registered.')
  }

  const defaultPassword = '123'
  const passwordHash = await hashPassword(defaultPassword)

  const result = await c.env.DB.prepare(
    'INSERT INTO users (phone, password_hash, role, status) VALUES (?, ?, ?, ?)',
  )
    .bind(phone, passwordHash, 'student', 'active')
    .run()

  return c.json(
    {
      success: true,
      data: {
        id: result.meta.last_row_id,
        phone,
        role: 'student',
        status: 'active',
        defaultPassword,
      },
      message: 'Student account created with default password 123.',
    },
    201,
  )
})

usersRoutes.put('/:id/approve', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(c, 400, 'INVALID_ID', 'User id must be a positive integer.')
  }

  const user = await c.env.DB.prepare('SELECT id, role, status FROM users WHERE id = ? LIMIT 1').bind(id).first()
  if (!user) {
    return jsonError(c, 404, 'NOT_FOUND', 'User not found.')
  }

  if (user.role !== 'student') {
    return jsonError(c, 400, 'INVALID_ROLE', 'Only student accounts can be approved.')
  }

  if (user.status === 'active') {
    return c.json({
      success: true,
      data: {
        id,
        status: 'active',
      },
      message: 'User is already active.',
    })
  }

  await c.env.DB.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind('active', id)
    .run()

  return c.json({
    success: true,
    data: {
      id,
      status: 'active',
    },
    message: 'Student approved successfully.',
  })
})

export default usersRoutes

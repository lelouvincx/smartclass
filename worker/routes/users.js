import { Hono } from 'hono'
import { hashPassword, isValidVietnamPhone, normalizeName, normalizePhone } from '../lib/auth.js'
import { attachGrades, parseGrades } from '../lib/grades.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const usersRoutes = new Hono()

usersRoutes.use('*', requireAuth, requireRole('teacher'))

usersRoutes.get('/', async (c) => {
  const status = c.req.query('status')
  const allowedStatus = new Set(['pending', 'active', 'disabled'])

  let sql = 'SELECT id, name, phone, role, status, created_at, updated_at FROM users WHERE role = ?'
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

  const gradeResult = await c.env.DB.prepare(`
    SELECT user_id, grade
    FROM student_grades
    ORDER BY grade
  `).all()

  return jsonSuccess(c, attachGrades(result.results, gradeResult.results, 'user_id'))
})

usersRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const name = normalizeName(body?.name)
  const phone = normalizePhone(body?.phone)
  const parsedGrades = parseGrades(body?.grades, { defaultToAll: true })

  if (!name || !phone) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Name and phone are required.')
  }

  if (parsedGrades.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }

  if (!isValidVietnamPhone(phone)) {
    return jsonError(c, 400, 'INVALID_PHONE', 'Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
  }

  const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first()
  if (existingUser) {
    return jsonError(c, 409, 'PHONE_EXISTS', 'Phone number is already registered.')
  }

  const defaultPassword = '123'
  const passwordHash = await hashPassword(defaultPassword)

  const [result] = await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO users (name, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
    ).bind(name, phone, passwordHash, 'student', 'active'),
    ...parsedGrades.grades.map((grade) => c.env.DB.prepare(`
      INSERT INTO student_grades (user_id, grade)
      SELECT id, ? FROM users WHERE phone = ?
    `).bind(grade, phone)),
  ])

  return c.json(
    {
      success: true,
      data: {
        id: result.meta.last_row_id,
        name,
        phone,
        role: 'student',
        status: 'active',
        grades: parsedGrades.grades,
        defaultPassword,
      },
      message: 'Student account created with default password 123.',
    },
    201,
  ) // Keep message field for this endpoint
})

usersRoutes.put('/grades', async (c) => {
  const body = await c.req.json().catch(() => null)
  const studentIds = body?.student_ids
  const parsedGrades = parseGrades(body?.grades)

  if (
    !Array.isArray(studentIds)
    || studentIds.length === 0
    || studentIds.some((id) => !Number.isInteger(id) || id <= 0)
    || new Set(studentIds).size !== studentIds.length
  ) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'student_ids must be a non-empty array of unique positive integers.')
  }

  if (parsedGrades.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }

  const placeholders = studentIds.map(() => '?').join(', ')
  const students = await c.env.DB.prepare(`
    SELECT id
    FROM users
    WHERE role = 'student' AND id IN (${placeholders})
  `).bind(...studentIds).all()

  if (students.results.length !== studentIds.length) {
    return jsonError(c, 400, 'INVALID_STUDENTS', 'Every target must be an existing student account.')
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`
      DELETE FROM student_grades
      WHERE user_id IN (${placeholders})
    `).bind(...studentIds),
    ...studentIds.flatMap((studentId) => parsedGrades.grades.map((grade) => (
      c.env.DB.prepare(
        'INSERT INTO student_grades (user_id, grade) VALUES (?, ?)',
      ).bind(studentId, grade)
    ))),
  ])

  return jsonSuccess(c, {
    student_ids: studentIds,
    grades: parsedGrades.grades,
  })
})

usersRoutes.put('/:id/name', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(c, 400, 'INVALID_ID', 'User id must be a positive integer.')
  }

  const body = await c.req.json().catch(() => null)
  const name = normalizeName(body?.name)
  if (!name) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Name is required.')
  }

  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ? LIMIT 1').bind(id).first()
  if (!user) {
    return jsonError(c, 404, 'NOT_FOUND', 'User not found.')
  }
  if (user.role !== 'student') {
    return jsonError(c, 400, 'INVALID_ROLE', 'Only student accounts can be renamed here.')
  }

  await c.env.DB.prepare(
    'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  )
    .bind(name, id)
    .run()

  return jsonSuccess(c, { id, name })
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
    }) // Keep message field
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
  }) // Keep message field
})

export default usersRoutes

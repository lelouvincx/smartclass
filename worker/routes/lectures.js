import { Hono } from 'hono'
import { attachGrades, parseGrades } from '../lib/grades.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const lecturesRoutes = new Hono()

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

function validateLecture(body, { defaultGrades = false } = {}) {
  const parsedGrades = body?.grades === undefined && !defaultGrades
    ? null
    : parseGrades(body?.grades, { defaultToAll: defaultGrades })
  const lecture = {
    title: typeof body?.title === 'string' ? body.title.trim() : '',
    section_name: typeof body?.section_name === 'string' ? body.section_name.trim() : '',
    youtube_url: typeof body?.youtube_url === 'string' ? body.youtube_url.trim() : '',
    is_visible: body?.is_visible,
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

  if (parsedGrades?.error) {
    return { error: parsedGrades.error }
  }

  return { lecture }
}

async function getLecture(db, id) {
  const lecture = await db.prepare(`
    SELECT id, title, section_name, youtube_url, order_index, is_visible, created_by, created_at, updated_at
    FROM lectures
    WHERE id = ?
  `).bind(id).first()
  if (!lecture) return null

  const gradeResult = await db.prepare(`
    SELECT grade
    FROM lecture_grades
    WHERE lecture_id = ?
    ORDER BY grade
  `).bind(id).all()
  return { ...lecture, grades: gradeResult.results.map((row) => row.grade) }
}

lecturesRoutes.get('/', requireAuth, async (c) => {
  const authUser = c.get('authUser')
  const studentAccessClause = authUser.role === 'teacher'
    ? ''
    : `WHERE lecture.is_visible = 1
        AND EXISTS (
          SELECT 1
          FROM student_grades student_grade
          JOIN lecture_grades lecture_grade ON lecture_grade.grade = student_grade.grade
          WHERE student_grade.user_id = ?
            AND lecture_grade.lecture_id = lecture.id
        )`
  const statement = c.env.DB.prepare(`
    SELECT id, title, section_name, youtube_url, order_index, is_visible, created_by, created_at, updated_at
    FROM lectures lecture
    ${studentAccessClause}
    ORDER BY order_index ASC, id ASC
  `)
  const result = authUser.role === 'teacher'
    ? await statement.all()
    : await statement.bind(authUser.id).all()
  const gradeResult = await c.env.DB.prepare(`
    SELECT lecture_id, grade
    FROM lecture_grades
    ORDER BY grade
  `).all()

  return jsonSuccess(c, attachGrades(result.results, gradeResult.results, 'lecture_id'))
})

lecturesRoutes.post('/', requireAuth, requireRole('teacher'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const { lecture, error } = validateLecture(body, { defaultGrades: true })
  if (error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', error)
  }

  const nextOrder = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS value FROM lectures',
  ).first('value')
  const authUser = c.get('authUser')
  const result = await c.env.DB.prepare(`
    INSERT INTO lectures (title, section_name, youtube_url, order_index, is_visible, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    lecture.title,
    lecture.section_name,
    lecture.youtube_url,
    nextOrder,
    lecture.is_visible === undefined ? 1 : Number(lecture.is_visible),
    authUser.id,
  ).run()

  try {
    await c.env.DB.batch(lecture.grades.map((grade) => c.env.DB.prepare(`
      INSERT INTO lecture_grades (lecture_id, grade)
      VALUES (?, ?)
    `).bind(result.meta.last_row_id, grade)))
  } catch (gradeError) {
    await c.env.DB.prepare('DELETE FROM lectures WHERE id = ?')
      .bind(result.meta.last_row_id)
      .run()
    throw gradeError
  }

  return jsonSuccess(c, await getLecture(c.env.DB, result.meta.last_row_id), 201)
})

lecturesRoutes.put('/order', requireAuth, requireRole('teacher'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const ids = body?.ids

  if (!Array.isArray(ids)
    || ids.some((id) => !Number.isInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'ids must be an array of unique positive integers.')
  }

  const existing = await c.env.DB.prepare('SELECT id FROM lectures ORDER BY id').all()
  const existingIds = existing.results.map((lecture) => lecture.id).sort((a, b) => a - b)
  const requestedIds = [...ids].sort((a, b) => a - b)
  if (existingIds.length !== requestedIds.length
    || existingIds.some((id, index) => id !== requestedIds[index])) {
    return jsonError(c, 400, 'INVALID_LECTURE_ORDER', 'ids must contain every lecture exactly once.')
  }

  if (ids.length > 0) {
    await c.env.DB.batch(ids.map((id, orderIndex) => (
      c.env.DB.prepare(`
        UPDATE lectures
        SET order_index = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(orderIndex, id)
    )))
  }

  return jsonSuccess(c, { ids })
})

lecturesRoutes.put('/:id', requireAuth, requireRole('teacher'), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(c, 400, 'INVALID_ID', 'Lecture id must be a positive integer.')
  }

  const body = await c.req.json().catch(() => null)
  const { lecture, error } = validateLecture(body)
  if (error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', error)
  }

  const statements = [
    c.env.DB.prepare(`
      UPDATE lectures
      SET title = ?, section_name = ?, youtube_url = ?,
          is_visible = COALESCE(?, is_visible), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      lecture.title,
      lecture.section_name,
      lecture.youtube_url,
      lecture.is_visible === undefined ? null : Number(lecture.is_visible),
      id,
    ),
  ]
  if (lecture.grades) {
    statements.push(c.env.DB.prepare(
      'DELETE FROM lecture_grades WHERE lecture_id = ?',
    ).bind(id))
    statements.push(...lecture.grades.map((grade) => c.env.DB.prepare(`
      INSERT INTO lecture_grades (lecture_id, grade)
      SELECT id, ? FROM lectures WHERE id = ?
    `).bind(grade, id)))
  }
  const [result] = await c.env.DB.batch(statements)

  if (result.meta.changes === 0) {
    return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
  }

  return jsonSuccess(c, await getLecture(c.env.DB, id))
})

lecturesRoutes.delete('/:id', requireAuth, requireRole('teacher'), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(c, 400, 'INVALID_ID', 'Lecture id must be a positive integer.')
  }

  const result = await c.env.DB.prepare('DELETE FROM lectures WHERE id = ?').bind(id).run()
  if (result.meta.changes === 0) {
    return jsonError(c, 404, 'NOT_FOUND', 'Lecture not found.')
  }

  return jsonSuccess(c, { id })
})

export default lecturesRoutes

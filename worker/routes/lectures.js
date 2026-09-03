import { Hono } from 'hono'
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

function validateLecture(body) {
  const lecture = {
    title: typeof body?.title === 'string' ? body.title.trim() : '',
    section_name: typeof body?.section_name === 'string' ? body.section_name.trim() : '',
    youtube_url: typeof body?.youtube_url === 'string' ? body.youtube_url.trim() : '',
  }

  if (!lecture.title || !lecture.section_name || !lecture.youtube_url) {
    return { error: 'Title, section, and YouTube URL are required.' }
  }

  if (!isYouTubeUrl(lecture.youtube_url)) {
    return { error: 'YouTube URL must link to a valid video.' }
  }

  return { lecture }
}

async function getLecture(db, id) {
  return db.prepare(`
    SELECT id, title, section_name, youtube_url, order_index, created_by, created_at, updated_at
    FROM lectures
    WHERE id = ?
  `).bind(id).first()
}

lecturesRoutes.get('/', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, title, section_name, youtube_url, order_index, created_by, created_at, updated_at
    FROM lectures
    ORDER BY order_index ASC, id ASC
  `).all()

  return jsonSuccess(c, result.results)
})

lecturesRoutes.post('/', requireAuth, requireRole('teacher'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const { lecture, error } = validateLecture(body)
  if (error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', error)
  }

  const nextOrder = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS value FROM lectures',
  ).first('value')
  const authUser = c.get('authUser')
  const result = await c.env.DB.prepare(`
    INSERT INTO lectures (title, section_name, youtube_url, order_index, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    lecture.title,
    lecture.section_name,
    lecture.youtube_url,
    nextOrder,
    authUser.id,
  ).run()

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

  const result = await c.env.DB.prepare(`
    UPDATE lectures
    SET title = ?, section_name = ?, youtube_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(lecture.title, lecture.section_name, lecture.youtube_url, id).run()

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

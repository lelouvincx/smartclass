import { Hono } from 'hono'
import { jsonError } from '../lib/response.js'
import { requireAuth } from '../middleware/auth.js'

const filesRoutes = new Hono()

// Serve files to teachers or students who can access the active student-safe PDF.
filesRoutes.get('/:fileId', requireAuth, async (c) => {
  const fileId = c.req.param('fileId')

  // Lookup file metadata
  const file = await c.env.DB.prepare(
    'SELECT id, exercise_id, r2_key, file_name, file_type FROM exercise_files WHERE id = ?'
  ).bind(fileId).first()

  if (!file) {
    return jsonError(c, 404, 'NOT_FOUND', 'File not found')
  }

  const authUser = c.get('authUser')
  if (authUser.role !== 'teacher' && file.file_type !== 'exercise_pdf') {
    return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this file')
  }

  if (authUser.role === 'student') {
    const isActiveSource = await c.env.DB.prepare(`
      SELECT 1
      FROM exercise_question_asset_sets active_set
      JOIN exercises exercise ON exercise.active_question_asset_set_id = active_set.id
      WHERE active_set.exercise_id = ?
        AND active_set.source_file_id = ?
        AND active_set.confirmed_at IS NOT NULL
      LIMIT 1
    `).bind(file.exercise_id, file.id).first()
    if (!isActiveSource) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this file')
    }

    const access = await c.env.DB.prepare(`
      SELECT 1
      FROM student_grades student_grade
      JOIN exercise_grades exercise_grade ON exercise_grade.grade = student_grade.grade
      WHERE student_grade.user_id = ? AND exercise_grade.exercise_id = ?
      LIMIT 1
    `).bind(authUser.id, file.exercise_id).first()
    if (!access) {
      return jsonError(c, 403, 'GRADE_ACCESS_DENIED', 'This exercise file is not available for your grades')
    }
  }

  // Fetch file from R2
  const r2Object = await c.env.BUCKET.get(file.r2_key)

  if (!r2Object) {
    return jsonError(c, 404, 'NOT_FOUND', 'File content not found in storage')
  }

  // Use stored R2 httpMetadata.contentType, fallback to extension-based derivation
  const contentType = r2Object.httpMetadata?.contentType || deriveContentType(file.file_name)

  // Stream the file with appropriate headers
  return new Response(r2Object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    },
  })
})

/**
 * Derive Content-Type from file extension.
 * Fallback used only if R2 httpMetadata is missing.
 */
function deriveContentType(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const map = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}

export default filesRoutes

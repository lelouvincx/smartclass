import { Hono } from 'hono'
import { jsonError } from '../lib/response.js'

const filesRoutes = new Hono()

// Serve file from R2 with tiered auth based on file_type
filesRoutes.get('/:fileId', async (c) => {
  const fileId = c.req.param('fileId')

  // Lookup file metadata
  const file = await c.env.DB.prepare(
    'SELECT id, r2_key, file_name, file_type FROM exercise_files WHERE id = ?'
  ).bind(fileId).first()

  if (!file) {
    return jsonError(c, 404, 'NOT_FOUND', 'File not found')
  }

  // Tiered auth based on file_type
  // exercise_pdf: public (no auth required)
  // solution_pdf, reference_image: teacher-only
  if (file.file_type !== 'exercise_pdf') {
    // Require teacher auth for non-public file types
    let isTeacher = false
    const authorization = c.req.header('Authorization') || ''

    if (authorization.startsWith('Bearer ') && c.env.JWT_SECRET) {
      const token = authorization.slice(7)
      try {
        const { verifyAccessToken } = await import('../lib/auth.js')
        const payload = await verifyAccessToken(token, c.env)
        isTeacher = payload.role === 'teacher'
      } catch {
        isTeacher = false
      }
    }

    if (!isTeacher) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this file')
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
      'Cache-Control': 'public, max-age=3600',
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

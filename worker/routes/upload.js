import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { jsonError, jsonSuccess } from '../lib/response.js'

const uploadRoutes = new Hono()

// Teacher upload for exercise files
uploadRoutes.post(
  '/exercises/:id/files/upload',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    const { file_type, file_name } = body || {}

    // Validation
    const validTypes = new Set(['exercise_pdf', 'solution_pdf', 'reference_image'])
    if (!validTypes.has(file_type)) {
      return jsonError(
        c,
        400,
        'INVALID_FILE_TYPE',
        `file_type must be one of: ${[...validTypes].join(', ')}`
      )
    }

    if (!file_name) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'file_name is required')
    }

    // Check exercise exists
    const exercise = await c.env.DB.prepare(
      'SELECT id FROM exercises WHERE id = ?'
    ).bind(exerciseId).first()

    if (!exercise) {
      return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    }

    // Generate R2 key for teacher uploads: exercises/{exercise_id}/{timestamp}-{filename}
    const timestamp = Date.now()
    const r2Key = `exercises/${exerciseId}/${timestamp}-${file_name}`

    // Return upload URL for client (no DB record yet — created after successful upload)
    const uploadUrl = `/api/upload/exercises/${exerciseId}/files`

    return jsonSuccess(c, {
      upload_url: uploadUrl,
      r2_key: r2Key,
      file_type,
      file_name,
    })
  }
)

// Actual file upload endpoint — creates DB record only after successful R2 upload
uploadRoutes.put(
  '/exercises/:exerciseId/files',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = c.req.param('exerciseId')

    // Metadata passed via headers (from step 1 response)
    const r2Key = c.req.header('x-r2-key')
    const fileType = c.req.header('x-file-type')
    const fileName = c.req.header('x-file-name')

    if (!r2Key || !fileType || !fileName) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'x-r2-key, x-file-type, and x-file-name headers are required')
    }

    // Verify exercise exists
    const exercise = await c.env.DB.prepare(
      'SELECT id FROM exercises WHERE id = ?'
    ).bind(exerciseId).first()

    if (!exercise) {
      return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    }

    // Verify R2 key belongs to this exercise
    if (!r2Key.startsWith(`exercises/${exerciseId}/`)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'R2 key does not match exercise')
    }

    try {
      // Stream request body directly to R2 to avoid buffering in Worker memory
      const body = c.req.raw.body
      if (!body) {
        return jsonError(c, 400, 'VALIDATION_ERROR', 'File content is required')
      }

      const contentLength = parseInt(c.req.header('content-length') || '0', 10)
      if (contentLength === 0) {
        return jsonError(c, 400, 'VALIDATION_ERROR', 'File content is required')
      }

      // Upload to R2 using stream (no memory buffering)
      await c.env.BUCKET.put(r2Key, body, {
        httpMetadata: { contentType: c.req.header('content-type') || 'application/octet-stream' },
      })

      // Create file record only after successful upload
      const fileResult = await c.env.DB.prepare(`
        INSERT INTO exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
        VALUES (?, ?, ?, ?, ?)
      `).bind(exerciseId, fileType, r2Key, fileName, contentLength).run()

      const fileId = fileResult.meta.last_row_id

      return jsonSuccess(c, {
        file_id: fileId,
        r2_key: r2Key,
        file_size: contentLength,
        uploaded: true,
      })
    } catch (error) {
      console.error('R2 upload error:', error)
      return jsonError(c, 500, 'UPLOAD_ERROR', 'Failed to upload file to storage')
    }
  }
)

// Note: Student upload endpoint will be added in PR3 (Submission API)
// POST /submissions/:id/upload - for answer sheet images

export default uploadRoutes

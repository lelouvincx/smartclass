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

    // Create file record
    const fileResult = await c.env.DB.prepare(`
      INSERT INTO exercise_files (exercise_id, file_type, r2_key, file_name)
      VALUES (?, ?, ?, ?)
    `).bind(exerciseId, file_type, r2Key, file_name).run()

    const fileId = fileResult.meta.last_row_id

    // Return upload URL for client
    // Note: Client will upload via multipart form data to /api/upload/exercises/:id/files/:fileId
    const uploadUrl = `/api/upload/exercises/${exerciseId}/files/${fileId}`

    return jsonSuccess(c, {
      file_id: fileId,
      upload_url: uploadUrl,
      r2_key: r2Key,
    })
  }
)

// Actual file upload endpoint
uploadRoutes.put(
  '/exercises/:exerciseId/files/:fileId',
  requireAuth,
  requireRole('teacher'),
  async (c) => {
    const exerciseId = c.req.param('exerciseId')
    const fileId = c.req.param('fileId')

    // Verify file record exists and belongs to exercise
    const fileRecord = await c.env.DB.prepare(
      'SELECT * FROM exercise_files WHERE id = ? AND exercise_id = ?'
    ).bind(fileId, exerciseId).first()

    if (!fileRecord) {
      return jsonError(c, 404, 'NOT_FOUND', 'File record not found')
    }

    try {
      // Get file content from request
      const fileContent = await c.req.arrayBuffer()

      if (!fileContent || fileContent.byteLength === 0) {
        return jsonError(c, 400, 'VALIDATION_ERROR', 'File content is required')
      }

      // Upload to R2
      await c.env.BUCKET.put(fileRecord.r2_key, fileContent)

      // Update file size in database
      await c.env.DB.prepare(
        'UPDATE exercise_files SET file_size = ? WHERE id = ?'
      ).bind(fileContent.byteLength, fileId).run()

      return jsonSuccess(c, {
        file_id: fileId,
        r2_key: fileRecord.r2_key,
        file_size: fileContent.byteLength,
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

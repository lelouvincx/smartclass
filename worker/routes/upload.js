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

    // Generate presigned URL (expires in 1 hour)
    const presignedUrl = await c.env.BUCKET.createPresignedUrl({
      method: 'PUT',
      pathname: r2Key,
      expiresIn: 3600,
    })

    return jsonSuccess(c, {
      file_id: fileId,
      presigned_url: presignedUrl,
      r2_key: r2Key,
      expires_in: 3600,
    })
  }
)

// Note: Student upload endpoint will be added in PR3 (Submission API)
// POST /submissions/:id/upload - for answer sheet images

export default uploadRoutes

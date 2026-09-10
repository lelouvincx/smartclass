import { Hono } from 'hono'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { requireWorkspaceIdentity, requireWorkspaceManagement } from '../middleware/workspace-auth.js'

const uploadRoutes = new Hono()
const VALID_TYPES = new Set(['exercise_pdf', 'solution_pdf', 'reference_image'])

uploadRoutes.post(
  '/exercises/:id/files/upload',
  requireWorkspaceIdentity,
  requireWorkspaceManagement,
  async (c) => {
    const exerciseId = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    const { file_type: fileType, file_name: fileName } = body || {}

    const validation = validateFileMetadata(fileType, fileName)
    if (validation) return validation(c)

    const exercise = await currentWorkspaceExercise(c, exerciseId)
    if (!exercise) {
      return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    }

    const timestamp = Date.now()
    const r2Key = `exercises/${exerciseId}/${timestamp}-${fileName}`
    return jsonSuccess(c, {
      upload_url: `/api/upload/exercises/${exerciseId}/files`,
      r2_key: r2Key,
      file_type: fileType,
      file_name: fileName,
    })
  },
)

uploadRoutes.put(
  '/exercises/:exerciseId/files',
  requireWorkspaceIdentity,
  requireWorkspaceManagement,
  async (c) => {
    const exerciseId = c.req.param('exerciseId')
    const r2Key = decodeURIComponent(c.req.header('x-r2-key') || '')
    const fileType = c.req.header('x-file-type')
    const fileName = decodeURIComponent(c.req.header('x-file-name') || '')

    if (!r2Key || !fileType || !fileName) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'x-r2-key, x-file-type, and x-file-name headers are required')
    }

    const metadataValidation = validateFileMetadata(fileType, fileName)
    if (metadataValidation) return metadataValidation(c)

    const exercise = await currentWorkspaceExercise(c, exerciseId)
    if (!exercise) {
      return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    }

    if (!r2Key.startsWith(`exercises/${exerciseId}/`)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'R2 key does not match exercise')
    }

    const contentLength = parseInt(c.req.header('content-length') || '0', 10)
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'File content is required')
    }

    const body = c.req.raw.body
    if (!body) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'File content is required')
    }

    try {
      await c.env.BUCKET.put(r2Key, body, {
        httpMetadata: { contentType: c.req.header('content-type') || 'application/octet-stream' },
      })

      const fileResult = await c.env.DB.prepare(`
        insert into exercise_files (exercise_id, file_type, r2_key, file_name, file_size)
        values (?, ?, ?, ?, ?)
      `).bind(exerciseId, fileType, r2Key, fileName, contentLength).run()

      return jsonSuccess(c, {
        file_id: fileResult.meta.last_row_id,
        r2_key: r2Key,
        file_size: contentLength,
        uploaded: true,
      })
    } catch (error) {
      console.error('R2 upload error:', error)
      return jsonError(c, 500, 'UPLOAD_ERROR', 'Failed to upload file to storage')
    }
  },
)

async function currentWorkspaceExercise(c, exerciseId) {
  const workspace = c.get('workspace')
  return c.env.DB.prepare(`
    select id
    from exercises
    where id = ? and workspace_id = ?
    limit 1
  `).bind(exerciseId, workspace.id).first()
}

function validateFileMetadata(fileType, fileName) {
  if (!VALID_TYPES.has(fileType)) {
    return (c) => jsonError(
      c,
      400,
      'INVALID_FILE_TYPE',
      `file_type must be one of: ${[...VALID_TYPES].join(', ')}`,
    )
  }

  if (typeof fileName !== 'string' || fileName.trim() === '') {
    return (c) => jsonError(c, 400, 'VALIDATION_ERROR', 'file_name is required')
  }

  return null
}

export default uploadRoutes

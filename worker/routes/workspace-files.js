import { Hono } from 'hono'
import { jsonError } from '../lib/response.js'
import { requireWorkspaceIdentity } from '../middleware/workspace-auth.js'

const filesRoutes = new Hono()

filesRoutes.get('/:fileId', requireWorkspaceIdentity, async (c) => {
  const fileId = c.req.param('fileId')
  const workspace = c.get('workspace')

  const file = await c.env.DB.prepare(`
    select
      file.id
      , file.exercise_id
      , file.r2_key
      , file.file_name
      , file.file_type
      , exercise.workspace_id
    from exercise_files file
    join exercises exercise on exercise.id = file.exercise_id
    where file.id = ? and exercise.workspace_id = ?
    limit 1
  `).bind(fileId, workspace.id).first()

  if (!file) {
    return jsonError(c, 404, 'NOT_FOUND', 'File not found')
  }

  const authUser = c.get('authUser')
  const membership = c.get('workspaceMembership')
  const canManage = authUser.platform_role === 'platform_admin'
    || (membership?.role === 'teacher' && membership.status === 'active')

  if (file.file_type !== 'exercise_pdf') {
    if (!canManage) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this file')
    }
  } else if (!canManage) {
    if (!membership) {
      return jsonError(c, 403, 'MEMBERSHIP_REQUIRED', 'Workspace membership is required.')
    }
    if (membership.status === 'pending') {
      return jsonError(c, 403, 'MEMBERSHIP_PENDING', 'Workspace membership is pending approval.')
    }
    if (membership.status === 'disabled') {
      return jsonError(c, 403, 'MEMBERSHIP_DISABLED', 'Workspace membership is disabled.')
    }
    if (membership.role !== 'student') {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this file')
    }

    const isActiveSource = await c.env.DB.prepare(`
      select 1
      from exercise_question_asset_sets active_set
      join exercises exercise on exercise.id = active_set.exercise_id
      where exercise.id = ?
        and exercise.workspace_id = ?
        and exercise.active_question_asset_set_id = active_set.id
        and exercise.id = active_set.exercise_id
        and active_set.source_file_id = ?
        and active_set.confirmed_at is not null
      limit 1
    `).bind(file.exercise_id, workspace.id, file.id).first()
    if (!isActiveSource) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this file')
    }

    const grades = membership.grades ?? []
    if (grades.length === 0) {
      return jsonError(c, 403, 'GRADE_ACCESS_DENIED', 'This exercise file is not available for your classes')
    }
    const placeholders = grades.map(() => '?').join(', ')
    const access = await c.env.DB.prepare(`
      select 1
      from exercise_grades exercise_grade
      where exercise_grade.exercise_id = ?
        and exercise_grade.grade in (${placeholders})
      limit 1
    `).bind(file.exercise_id, ...grades).first()
    if (!access) {
      return jsonError(c, 403, 'GRADE_ACCESS_DENIED', 'This exercise file is not available for your classes')
    }
  }

  const r2Object = await c.env.BUCKET.get(file.r2_key)
  if (!r2Object) {
    return jsonError(c, 404, 'NOT_FOUND', 'File content not found in storage')
  }

  return new Response(r2Object.body, {
    status: 200,
    headers: {
      'Content-Type': r2Object.httpMetadata?.contentType || deriveContentType(file.file_name),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    },
  })
})

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

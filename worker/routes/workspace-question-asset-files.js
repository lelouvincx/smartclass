import { Hono } from 'hono'
import { jsonError } from '../lib/response.js'
import { requireWorkspaceIdentity } from '../middleware/workspace-auth.js'

const questionAssetFilesRoutes = new Hono()

function canManage(c) {
  const membership = c.get('workspaceMembership')
  return c.get('authUser').platform_role === 'platform_admin'
    || (membership?.role === 'teacher' && membership.status === 'active')
}

async function streamAsset(c, asset) {
  const object = await c.env.BUCKET.get(asset.r2_key)
  if (!object) return jsonError(c, 404, 'NOT_FOUND', 'Question image content not found')
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.mime_type,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    },
  })
}

questionAssetFilesRoutes.get('/:assetId', requireWorkspaceIdentity, async (c) => {
  const assetId = Number(c.req.param('assetId'))
  if (!Number.isSafeInteger(assetId) || assetId < 1) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'assetId must be a positive integer')
  }
  const asset = await c.env.DB.prepare(`
    select image.r2_key, image.mime_type, asset_set.id as asset_set_id
      , asset_set.exercise_id, asset_set.confirmed_at, exercise.active_question_asset_set_id
    from exercise_question_assets image
    join exercise_question_asset_sets asset_set on asset_set.id = image.asset_set_id
    join exercises exercise on exercise.id = asset_set.exercise_id
    where image.id = ? and exercise.workspace_id = ?
  `).bind(assetId, c.get('workspace').id).first()
  if (!asset) return jsonError(c, 404, 'NOT_FOUND', 'Question image not found')

  if (!canManage(c)) {
    const membership = c.get('workspaceMembership')
    if (membership?.role !== 'student' || membership.status !== 'active' || !asset.confirmed_at) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this question image')
    }
    const ownedSubmission = await c.env.DB.prepare(`
      select 1 from submissions
      where user_id = ? and exercise_id = ? and question_asset_set_id = ?
      limit 1
    `).bind(c.get('authUser').id, asset.exercise_id, asset.asset_set_id).first()
    const currentGradeAccess = asset.active_question_asset_set_id === asset.asset_set_id
      ? await c.env.DB.prepare(`
          select 1
          from workspace_membership_grades membership_grade
          join exercise_grades exercise_grade on exercise_grade.grade = membership_grade.grade
          where membership_grade.membership_id = ? and exercise_grade.exercise_id = ?
          limit 1
        `).bind(membership.id, asset.exercise_id).first()
      : null
    if (!ownedSubmission && !currentGradeAccess) {
      const code = asset.active_question_asset_set_id === asset.asset_set_id ? 'GRADE_ACCESS_DENIED' : 'FORBIDDEN'
      return jsonError(c, 403, code, 'You do not have access to this question image')
    }
  }
  return streamAsset(c, asset)
})

questionAssetFilesRoutes.get('/answer/:assetId', requireWorkspaceIdentity, async (c) => {
  const assetId = Number(c.req.param('assetId'))
  if (!Number.isSafeInteger(assetId) || assetId < 1) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'assetId must be a positive integer')
  }
  const asset = await c.env.DB.prepare(`
    select image.r2_key, image.mime_type
    from exercise_question_answer_assets image
    join exercise_question_asset_sets asset_set on asset_set.id = image.asset_set_id
    join exercises exercise on exercise.id = asset_set.exercise_id
    where image.id = ? and exercise.workspace_id = ?
  `).bind(assetId, c.get('workspace').id).first()
  if (!asset) return jsonError(c, 404, 'NOT_FOUND', 'Answer question image not found')
  if (!canManage(c)) {
    return jsonError(c, 403, 'FORBIDDEN', 'Only teachers and administrators can view answer question images')
  }
  return streamAsset(c, asset)
})

export default questionAssetFilesRoutes

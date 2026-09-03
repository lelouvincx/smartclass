import { Hono } from 'hono'
import { verifyAccessToken } from '../lib/auth.js'
import { jsonError } from '../lib/response.js'

const questionAssetFilesRoutes = new Hono()

async function isTeacherRequest(c) {
  const authorization = c.req.header('Authorization') || ''
  if (!authorization.startsWith('Bearer ') || !c.env.JWT_SECRET) {
    return false
  }

  try {
    const payload = await verifyAccessToken(authorization.slice(7), c.env)
    return payload.role === 'teacher'
  } catch {
    return false
  }
}

questionAssetFilesRoutes.get('/:assetId', async (c) => {
  const assetId = Number.parseInt(c.req.param('assetId'), 10)
  if (!Number.isInteger(assetId) || assetId < 1) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'assetId must be a positive integer')
  }

  const asset = await c.env.DB.prepare(`
    select
      question_asset.id
      , question_asset.r2_key
      , question_asset.mime_type
      , asset_set.id as asset_set_id
      , asset_set.confirmed_at
      , exercise.active_question_asset_set_id
      , exists (
          select 1
          from submissions submission
          where submission.question_asset_set_id = asset_set.id
        ) as is_submission_pinned
    from exercise_question_assets question_asset
    join exercise_question_asset_sets asset_set on asset_set.id = question_asset.asset_set_id
    join exercises exercise on exercise.id = asset_set.exercise_id
    where question_asset.id = ?
  `).bind(assetId).first()

  if (!asset) {
    return jsonError(c, 404, 'NOT_FOUND', 'Question asset not found')
  }

  const isPublicConfirmedAsset = asset.confirmed_at
    && (
      asset.active_question_asset_set_id === asset.asset_set_id
      || asset.is_submission_pinned === 1
    )

  if (!isPublicConfirmedAsset && !(await isTeacherRequest(c))) {
    return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this question asset')
  }

  const object = await c.env.BUCKET.get(asset.r2_key)
  if (!object) {
    return jsonError(c, 404, 'NOT_FOUND', 'Question asset content not found')
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': asset.mime_type,
      'Content-Disposition': 'inline',
      'Cache-Control': isPublicConfirmedAsset
        ? 'public, max-age=31536000, immutable'
        : 'private, no-store',
    },
  })
})

export default questionAssetFilesRoutes

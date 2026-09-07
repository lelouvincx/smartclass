import { Hono } from 'hono'
import { jsonError } from '../lib/response.js'
import { requireAuth } from '../middleware/auth.js'

const questionAssetFilesRoutes = new Hono()

questionAssetFilesRoutes.get('/:assetId', requireAuth, async (c) => {
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
      , asset_set.exercise_id
      , asset_set.confirmed_at
      , exercise.active_question_asset_set_id
    from exercise_question_assets question_asset
    join exercise_question_asset_sets asset_set on asset_set.id = question_asset.asset_set_id
    join exercises exercise on exercise.id = asset_set.exercise_id
    where question_asset.id = ?
  `).bind(assetId).first()

  if (!asset) {
    return jsonError(c, 404, 'NOT_FOUND', 'Question asset not found')
  }

  const authUser = c.get('authUser')
  if (authUser.role !== 'teacher') {
    const ownedSubmission = asset.confirmed_at
      ? await c.env.DB.prepare(`
          SELECT 1
          FROM submissions
          WHERE user_id = ? AND question_asset_set_id = ?
          LIMIT 1
        `).bind(authUser.id, asset.asset_set_id).first()
      : null
    const currentGradeAccess = asset.confirmed_at
      && asset.active_question_asset_set_id === asset.asset_set_id
      ? await c.env.DB.prepare(`
          SELECT 1
          FROM student_grades student_grade
          JOIN exercise_grades exercise_grade ON exercise_grade.grade = student_grade.grade
          WHERE student_grade.user_id = ? AND exercise_grade.exercise_id = ?
          LIMIT 1
        `).bind(authUser.id, asset.exercise_id).first()
      : null

    if (!ownedSubmission && !currentGradeAccess) {
      const code = asset.confirmed_at && asset.active_question_asset_set_id === asset.asset_set_id
        ? 'GRADE_ACCESS_DENIED'
        : 'FORBIDDEN'
      return jsonError(c, 403, code, 'You do not have access to this question asset')
    }
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
      'Cache-Control': 'private, no-store',
    },
  })
})

export default questionAssetFilesRoutes

import { Hono } from 'hono'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { optionalWorkspaceIdentity } from '../middleware/workspace-auth.js'

const publicExercisesRoutes = new Hono()

function workspaceId(c) {
  return c.get('workspace')?.id
}

function positiveParam(value, name) {
  if (!/^\d+$/.test(value ?? '')) return { error: `${name} must be a positive integer` }
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) return { error: `${name} must be a positive integer` }
  return { id }
}

function authenticatedAudienceError(c) {
  if (!c.get('authUser')) return null
  const membership = c.get('workspaceMembership')
  if (!membership) return jsonError(c, 403, 'MEMBERSHIP_REQUIRED', 'Workspace membership is required.')
  if (membership.status === 'pending') return jsonError(c, 403, 'MEMBERSHIP_PENDING', 'Workspace membership is pending approval.')
  if (membership.status === 'disabled') return jsonError(c, 403, 'MEMBERSHIP_DISABLED', 'Workspace membership is disabled.')
  return null
}

function toPublicExercise(row) {
  return {
    id: row.id,
    title: row.title,
    duration_minutes: row.duration_minutes,
    is_timed: row.duration_minutes > 0 ? 1 : 0,
    minimum_access_tier: row.minimum_access_tier,
    question_asset_set_id: row.question_asset_set_id,
    question_count: row.question_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function toPublicQuestionAsset(asset) {
  const { r2_key: _r2Key, ...data } = asset
  return { ...data, file_url: `/api/public/question-assets/${asset.id}` }
}

async function findReadyGuestExercise(c, exerciseId) {
  return c.env.DB.prepare(`
    select
      exercise.id
      , exercise.title
      , exercise.duration_minutes
      , exercise.minimum_access_tier
      , exercise.active_question_asset_set_id as question_asset_set_id
      , exercise.created_at
      , exercise.updated_at
      , count(distinct schema.q_id) as question_count
    from exercises exercise
    join exercise_question_asset_sets asset_set
      on asset_set.id = exercise.active_question_asset_set_id
      and asset_set.exercise_id = exercise.id
      and asset_set.confirmed_at is not null
    join exercise_question_answer_schemas schema
      on schema.asset_set_id = asset_set.id
    where exercise.id = ?
      and exercise.workspace_id = ?
      and exercise.minimum_access_tier = 'guest'
    group by exercise.id
    limit 1
  `).bind(exerciseId, workspaceId(c)).first()
}

function encodeAttachmentFileName(fileName) {
  return encodeURIComponent(fileName).replace(/['()*]/g, character => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
}

publicExercisesRoutes.use('*', optionalWorkspaceIdentity, async (c, next) => {
  const error = authenticatedAudienceError(c)
  if (error) return error
  await next()
})

publicExercisesRoutes.get('/exercises', async (c) => {
  const exercises = await c.env.DB.prepare(`
    select
      exercise.id
      , exercise.title
      , exercise.duration_minutes
      , exercise.minimum_access_tier
      , exercise.active_question_asset_set_id as question_asset_set_id
      , exercise.created_at
      , exercise.updated_at
      , count(distinct schema.q_id) as question_count
    from exercises exercise
    join exercise_question_asset_sets asset_set
      on asset_set.id = exercise.active_question_asset_set_id
      and asset_set.exercise_id = exercise.id
      and asset_set.confirmed_at is not null
    join exercise_question_answer_schemas schema
      on schema.asset_set_id = asset_set.id
    where exercise.workspace_id = ?
      and exercise.minimum_access_tier = 'guest'
    group by exercise.id
    order by exercise.created_at desc, exercise.id desc
  `).bind(workspaceId(c)).all()

  return jsonSuccess(c, exercises.results.map(toPublicExercise))
})

publicExercisesRoutes.get('/exercises/:id', async (c) => {
  const parsed = positiveParam(c.req.param('id'), 'exerciseId')
  if (parsed.error) return jsonError(c, 400, 'VALIDATION_ERROR', parsed.error)
  const exercise = await findReadyGuestExercise(c, parsed.id)
  if (!exercise) return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')

  const schema = await c.env.DB.prepare(`
    select q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths
    from exercise_question_answer_schemas
    where asset_set_id = ?
    order by q_id asc, sub_id asc
  `).bind(exercise.question_asset_set_id).all()

  const assets = await c.env.DB.prepare(`
    select *
    from exercise_question_assets
    where asset_set_id = ?
    order by q_id asc, segment_index asc
  `).bind(exercise.question_asset_set_id).all()

  return jsonSuccess(c, {
    ...toPublicExercise(exercise),
    schema: schema.results,
    question_assets: assets.results.map(toPublicQuestionAsset),
  })
})

publicExercisesRoutes.get('/question-assets/:id', async (c) => {
  const parsed = positiveParam(c.req.param('id'), 'assetId')
  if (parsed.error) return jsonError(c, 400, 'VALIDATION_ERROR', parsed.error)

  const asset = await c.env.DB.prepare(`
    select image.r2_key, image.mime_type
    from exercise_question_assets image
    join exercise_question_asset_sets asset_set
      on asset_set.id = image.asset_set_id
      and asset_set.confirmed_at is not null
    join exercises exercise
      on exercise.id = asset_set.exercise_id
      and exercise.active_question_asset_set_id = asset_set.id
      and exercise.workspace_id = ?
      and exercise.minimum_access_tier = 'guest'
    where image.id = ?
    limit 1
  `).bind(workspaceId(c), parsed.id).first()

  if (!asset) return jsonError(c, 404, 'NOT_FOUND', 'Question image not found')
  const object = await c.env.BUCKET.get(asset.r2_key)
  if (!object) return jsonError(c, 404, 'NOT_FOUND', 'Question image content not found')
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.mime_type,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    },
  })
})

publicExercisesRoutes.get('/exercises/:id/exercise-pdf', async (c) => {
  const parsed = positiveParam(c.req.param('id'), 'exerciseId')
  if (parsed.error) return jsonError(c, 400, 'VALIDATION_ERROR', parsed.error)

  const file = await c.env.DB.prepare(`
    select source_file.r2_key, source_file.file_name
    from exercises exercise
    join exercise_question_asset_sets asset_set
      on asset_set.id = exercise.active_question_asset_set_id
      and asset_set.exercise_id = exercise.id
      and asset_set.confirmed_at is not null
    join exercise_files source_file
      on source_file.id = asset_set.source_file_id
      and source_file.exercise_id = exercise.id
      and source_file.file_type = 'exercise_pdf'
    where exercise.id = ?
      and exercise.workspace_id = ?
      and exercise.minimum_access_tier = 'guest'
    limit 1
  `).bind(parsed.id, workspaceId(c)).first()

  if (!file) return jsonError(c, 404, 'NOT_FOUND', 'Exercise PDF not found')
  const object = await c.env.BUCKET.get(file.r2_key)
  if (!object) return jsonError(c, 404, 'NOT_FOUND', 'Exercise PDF content not found')
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/pdf',
      'Content-Disposition': `attachment; filename="exercise.pdf"; filename*=UTF-8''${encodeAttachmentFileName(file.file_name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
})

export default publicExercisesRoutes

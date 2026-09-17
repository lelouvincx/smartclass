import { Hono } from 'hono'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { requireWorkspaceIdentity } from '../middleware/workspace-auth.js'

const costAnalysisRoutes = new Hono()

function workspaceId(c) {
  return c.get('workspace')?.id
}

async function requireWorkspaceAdministrator(c, next) {
  const authUser = c.get('authUser')
  if (!authUser) {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Authentication is required.')
  }
  if (authUser.platform_role !== 'platform_admin') {
    return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this resource.')
  }

  await next()
}

function toNumber(value) {
  return Number(value ?? 0)
}

function toNullableNumber(value) {
  if (value === null || value === undefined) return null
  return Number(value)
}

costAnalysisRoutes.use('*', requireWorkspaceIdentity, requireWorkspaceAdministrator)

costAnalysisRoutes.get('/guest-inventory', async (c) => {
  const workspace = workspaceId(c)
  const exercises = await c.env.DB.prepare(`
    with ready_guest_exercises as (
      select
        exercise.id
        , exercise.title
        , exercise.active_question_asset_set_id as asset_set_id
        , source_file.file_size as exercise_pdf_bytes
      from exercises exercise
      join exercise_question_asset_sets asset_set
        on asset_set.id = exercise.active_question_asset_set_id
        and asset_set.exercise_id = exercise.id
        and asset_set.confirmed_at is not null
      left join exercise_files source_file
        on source_file.id = asset_set.source_file_id
        and source_file.exercise_id = exercise.id
        and source_file.file_type = 'exercise_pdf'
      where exercise.workspace_id = ?
        and exercise.minimum_access_tier = 'guest'
        and exists (
          select 1
          from exercise_question_answer_schemas schema
          where schema.asset_set_id = asset_set.id
          limit 1
        )
    )
    , question_asset_totals as (
      select
        asset.asset_set_id
        , count(*) as count
        , coalesce(sum(asset.file_size), 0) as recorded_bytes
      from exercise_question_assets asset
      join ready_guest_exercises ready
        on ready.asset_set_id = asset.asset_set_id
      group by asset.asset_set_id
    )
    , schema_totals as (
      select
        schema.asset_set_id
        , count(*) as row_count
        , count(distinct schema.q_id) as question_count
      from exercise_question_answer_schemas schema
      join ready_guest_exercises ready
        on ready.asset_set_id = schema.asset_set_id
      group by schema.asset_set_id
    )
    select
      ready.id
      , ready.title
      , ready.asset_set_id as question_asset_set_id
      , coalesce(question_assets.count, 0) as question_asset_count
      , coalesce(question_assets.recorded_bytes, 0) as question_asset_recorded_bytes
      , ready.exercise_pdf_bytes
      , schema_totals.row_count as schema_row_count
      , schema_totals.question_count as question_count
    from ready_guest_exercises ready
    join schema_totals
      on schema_totals.asset_set_id = ready.asset_set_id
    left join question_asset_totals question_assets
      on question_assets.asset_set_id = ready.asset_set_id
    order by ready.id asc
  `).bind(workspace).all()

  const lectureRow = await c.env.DB.prepare(`
    select count(distinct lecture.id) as count
    from lectures lecture
    join lecture_placements placement
      on placement.lecture_id = lecture.id
      and placement.workspace_id = lecture.workspace_id
    where lecture.workspace_id = ?
      and lecture.is_visible = 1
      and lecture.minimum_access_tier = 'guest'
  `).bind(workspace).first()

  const guestExercises = exercises.results.map(row => ({
    id: row.id,
    title: row.title,
    question_asset_set_id: row.question_asset_set_id,
    question_assets: {
      count: toNumber(row.question_asset_count),
      recorded_bytes: toNumber(row.question_asset_recorded_bytes),
    },
    exercise_pdf: {
      metadata_present: row.exercise_pdf_bytes !== null && row.exercise_pdf_bytes !== undefined,
      recorded_bytes: toNullableNumber(row.exercise_pdf_bytes),
    },
    schema: {
      row_count: toNumber(row.schema_row_count),
      question_count: toNumber(row.question_count),
    },
  }))

  const totals = guestExercises.reduce((accumulator, exercise) => {
    accumulator.question_asset_count += exercise.question_assets.count
    accumulator.question_asset_recorded_bytes += exercise.question_assets.recorded_bytes
    accumulator.schema_row_count += exercise.schema.row_count
    accumulator.question_count += exercise.schema.question_count
    accumulator.exercise_pdf_total_count += 1
    if (exercise.exercise_pdf.metadata_present) {
      accumulator.exercise_pdf_known_count += 1
      accumulator.exercise_pdf_recorded_bytes += exercise.exercise_pdf.recorded_bytes
    } else {
      accumulator.exercise_pdf_unknown_count += 1
    }
    return accumulator
  }, {
    guest_exercise_count: guestExercises.length,
    question_asset_count: 0,
    question_asset_recorded_bytes: 0,
    exercise_pdf_total_count: 0,
    exercise_pdf_known_count: 0,
    exercise_pdf_recorded_bytes: 0,
    exercise_pdf_unknown_count: 0,
    schema_row_count: 0,
    question_count: 0,
  })

  return jsonSuccess(c, {
    version: 1,
    workspace_id: workspace,
    guest_exercises: guestExercises,
    guest_lectures: {
      public_placed_count: toNumber(lectureRow?.count),
    },
    totals,
    notes: [
      'estimate_not_invoice',
      'guest_attempts_local',
      'youtube_excluded',
    ],
  })
})

export default costAnalysisRoutes

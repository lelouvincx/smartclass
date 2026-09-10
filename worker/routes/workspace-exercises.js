import { Hono } from 'hono'
import { COHERE_MODEL, parseImageWithCohere } from '../lib/cohere.js'
import { parseAnswerPdfPages } from '../lib/cohere-table-parser.js'
import { attachGrades, parseGrades } from '../lib/grades.js'
import {
  MIN_QUESTION_ASSET_CONFIDENCE,
  toQuestionAssetResponse,
  validateQuestionAssetSetForActivation,
} from '../lib/question-assets.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { validateSchemaRows } from '../lib/schema-parser.js'
import {
  requireWorkspaceIdentity,
  requireWorkspaceManagement,
} from '../middleware/workspace-auth.js'

const exercisesRoutes = new Hono()
const MAX_PARSE_PAGES = 10
const MAX_PARSE_PAGE_BYTES = 3 * 1024 * 1024
const MAX_PARSE_PAYLOAD_BYTES = 25 * 1024 * 1024
const MAX_MANIFEST_TEXT_BYTES = 120_000
const MAX_SCHEMA_SHAPE_BYTES = 120_000
const PARSE_CONCURRENCY = 3
const UNSCORED_WARNING = 'Cohere does not provide confidence scores. Review every extracted answer.'

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await operation(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function workspace(c) {
  return c.get('workspace')
}

function membership(c) {
  return c.get('workspaceMembership')
}

function isManager(c) {
  const authUser = c.get('authUser')
  const currentMembership = membership(c)
  return authUser?.platform_role === 'platform_admin'
    || (currentMembership?.role === 'teacher' && currentMembership.status === 'active')
}

function inactiveMembershipError(c) {
  const currentMembership = membership(c)
  if (!currentMembership) return jsonError(c, 403, 'MEMBERSHIP_REQUIRED', 'Workspace membership is required.')
  if (currentMembership.status === 'pending') return jsonError(c, 403, 'MEMBERSHIP_PENDING', 'Workspace membership is pending approval.')
  if (currentMembership.status === 'disabled') return jsonError(c, 403, 'MEMBERSHIP_DISABLED', 'Workspace membership is disabled.')
  return null
}

function isValidMaxAttempts(value) {
  return value === null || (Number.isInteger(value) && value > 0)
}

function isBooleanSetting(value) {
  return typeof value === 'boolean'
}

function toExerciseWithTiming(exercise) {
  if (!exercise) return exercise
  const { extract_model: _deprecatedExtractModel, ...currentExercise } = exercise
  return { ...currentExercise, is_timed: exercise.duration_minutes > 0 ? 1 : 0 }
}

function withStudentAttemptState(exercise) {
  const { has_grade_access: hasGradeAccess, ...publicExercise } = exercise
  const latestAttemptNumber = exercise.latest_attempt_number ?? 0
  const attemptsRemaining = exercise.max_attempts === null
    ? null
    : Math.max(exercise.max_attempts - latestAttemptNumber, 0)
  return {
    ...publicExercise,
    latest_attempt_number: latestAttemptNumber,
    next_attempt_number: latestAttemptNumber + 1,
    attempts_remaining: attemptsRemaining,
    can_start_attempt: hasGradeAccess && exercise.is_student_ready && (attemptsRemaining === null || attemptsRemaining > 0) ? 1 : 0,
  }
}

function validateSchemaItems(schema) {
  if (!Array.isArray(schema) || schema.length === 0) return 'Schema must be a non-empty array'
  const rows = schema.map((item) => ({
    q_id: Number.isInteger(item.q_id) ? item.q_id : Number.parseInt(String(item.q_id ?? ''), 10),
    section_key: item.section_key ?? 'main',
    section_title: item.section_title ?? null,
    local_number: item.local_number ?? (Number.isInteger(item.q_id) ? item.q_id : Number.parseInt(String(item.q_id ?? ''), 10)),
    type: item.type ?? '',
    sub_id: item.sub_id ?? null,
    correct_answer: item.correct_answer === undefined || item.correct_answer === null ? '' : String(item.correct_answer),
  }))
  const errors = validateSchemaRows(rows)
  if (errors.length > 0) return errors[0]

  const values = schema.map(item => item.max_score_hundredths ?? null)
  const custom = values.some(value => value !== null)
  if (!custom) return null
  if (values.some(value => value === null)) return 'Score allocation must be automatic for every row or custom for every row'

  const maximumByQuestion = new Map()
  for (const item of schema) {
    const value = item.max_score_hundredths
    if (!Number.isInteger(value) || value < 1 || value > 1000) return 'max_score_hundredths must be an integer from 1 to 1000'
    const existing = maximumByQuestion.get(item.q_id)
    if (existing !== undefined && existing !== value) return `Question ${item.q_id} must use one max_score_hundredths value across all rows`
    maximumByQuestion.set(item.q_id, value)
  }
  const total = [...maximumByQuestion.values()].reduce((sum, value) => sum + value, 0)
  return total === 1000 ? null : 'Distinct question max_score_hundredths values must total 1000'
}

function allocationsMatch(left, right) {
  if (left.length !== right.length) return false
  const normalize = rows => rows
    .map(row => ({ q_id: Number(row.q_id), sub_id: row.sub_id ?? null, max_score_hundredths: row.max_score_hundredths ?? null }))
    .sort((a, b) => a.q_id - b.q_id || String(a.sub_id ?? '').localeCompare(String(b.sub_id ?? '')))
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function schemasMatch(left, right) {
  const normalize = rows => normalizeSchema(rows)
    .map(row => ({ ...row, q_id: Number(row.q_id), correct_answer: String(row.correct_answer) }))
    .sort((a, b) => a.q_id - b.q_id || String(a.sub_id ?? '').localeCompare(String(b.sub_id ?? '')))
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function questionIdentity(item) {
  return {
    sectionKey: item.section_key ?? 'main',
    sectionTitle: item.section_title ?? null,
    localNumber: Number(item.local_number ?? item.q_id),
  }
}

function normalizeSchema(schema) {
  return schema.map((item) => {
    const identity = questionIdentity(item)
    return {
      q_id: item.q_id,
      section_key: identity.sectionKey,
      section_title: identity.sectionTitle,
      local_number: identity.localNumber,
      sub_id: item.sub_id ?? null,
      type: item.type,
      correct_answer: item.correct_answer,
      max_score_hundredths: item.max_score_hundredths ?? null,
    }
  })
}

async function getExerciseGrades(db, exerciseIds, workspaceId) {
  if (!exerciseIds.length) return []
  const rows = await db.prepare(`
    select exercise_grades.exercise_id, exercise_grades.grade
    from exercise_grades
    join exercises on exercises.id = exercise_grades.exercise_id
    where exercises.workspace_id = ?
      and exercise_grades.exercise_id in (${exerciseIds.map(() => '?').join(',')})
    order by exercise_grades.grade
  `).bind(workspaceId, ...exerciseIds).all()
  return rows.results
}

exercisesRoutes.post('/schema/parse', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const started = performance.now()
  const contentType = c.req.header('content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Request must be multipart/form-data')
  const contentLength = Number(c.req.header('content-length') || 0)
  if (contentLength > MAX_PARSE_PAYLOAD_BYTES) return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'Multipart request must be at most 25 MiB')

  let form
  try { form = await c.req.raw.formData() } catch { return jsonError(c, 400, 'VALIDATION_ERROR', 'Multipart request is malformed') }
  const pages = form.getAll('page')
  if (pages.length < 1 || pages.length > MAX_PARSE_PAGES || pages.some(page => !(page instanceof File))) return jsonError(c, 400, 'VALIDATION_ERROR', 'Provide 1 to 10 page files')
  if (pages.some(page => page.type !== 'image/png')) return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Every page must be an image/png file')
  if (pages.some(page => page.size > MAX_PARSE_PAGE_BYTES)) return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'Each page must be at most 3 MiB')
  if ([...form].some(([name, value]) => value instanceof File && name !== 'page')) return jsonError(c, 400, 'VALIDATION_ERROR', 'Unexpected file field')

  const manifestValue = form.get('page_manifest')
  const schemaShapeValue = form.get('schema_shape')
  if (form.getAll('page_manifest').length !== 1 || form.getAll('expected_question_count').length > 1 || form.getAll('schema_shape').length > 1) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Multipart metadata fields must not be repeated')
  }
  let manifest
  try {
    if (typeof manifestValue !== 'string') throw new TypeError('page_manifest must be text')
    manifest = JSON.parse(manifestValue)
  } catch {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'page_manifest must be valid JSON')
  }
  const textBytes = Array.isArray(manifest) ? manifest.reduce((total, entry) => total + (typeof entry?.text === 'string' ? new TextEncoder().encode(entry.text).byteLength : 0), 0) : 0
  const validManifest = Array.isArray(manifest) && manifest.length === pages.length && manifest.every((entry, index) => (
    entry && typeof entry === 'object'
    && typeof entry.file_name === 'string'
    && entry.file_name === pages[index].name
    && Number.isInteger(entry.page_number)
    && entry.page_number >= 1
    && (index === 0 || entry.page_number > manifest[index - 1].page_number)
    && typeof entry.text === 'string'
  )) && new Set(manifest.map(entry => entry?.file_name)).size === manifest.length && textBytes <= MAX_MANIFEST_TEXT_BYTES
  if (!validManifest) return jsonError(c, 400, 'VALIDATION_ERROR', 'page_manifest entries are invalid or too large')

  let schemaShape
  if (schemaShapeValue !== null) {
    try {
      if (typeof schemaShapeValue !== 'string' || new TextEncoder().encode(schemaShapeValue).byteLength > MAX_SCHEMA_SHAPE_BYTES) throw new TypeError('schema_shape must be bounded text')
      const rawShape = JSON.parse(schemaShapeValue)
      if (!Array.isArray(rawShape) || rawShape.length === 0) throw new TypeError('schema_shape must be a non-empty array')
      schemaShape = rawShape.map(row => ({ q_id: row?.q_id, section_key: row?.section_key, section_title: row?.section_title ?? null, local_number: row?.local_number, type: row?.type, sub_id: row?.sub_id ?? null, correct_answer: '' }))
      if (validateSchemaRows(schemaShape, { allowBlankAnswers: true }).length) throw new TypeError('schema_shape is invalid')
    } catch {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'schema_shape must be a valid schema descriptor array')
    }
  }

  const expectedRaw = form.get('expected_question_count')
  const expectedQuestionCount = expectedRaw === null ? undefined : Number(expectedRaw)
  if (expectedRaw !== null && (typeof expectedRaw !== 'string' || !/^[1-9]\d*$/.test(expectedRaw) || !Number.isSafeInteger(expectedQuestionCount))) return jsonError(c, 400, 'VALIDATION_ERROR', 'expected_question_count must be a positive integer')
  const measuredPayloadBytes = pages.reduce((total, page) => total + page.size, 0)
    + new TextEncoder().encode(manifestValue).byteLength
    + (typeof expectedRaw === 'string' ? new TextEncoder().encode(expectedRaw).byteLength : 0)
    + (typeof schemaShapeValue === 'string' ? new TextEncoder().encode(schemaShapeValue).byteLength : 0)
  if (measuredPayloadBytes > MAX_PARSE_PAYLOAD_BYTES) return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'Multipart payload must be at most 25 MiB')

  const providerStarted = performance.now()
  const providerResults = await mapWithConcurrency(pages, PARSE_CONCURRENCY, async (page, index) => {
    try {
      const parsed = await parseImageWithCohere(c.env, { imageBytes: await page.arrayBuffer(), contentType: page.type })
      return { ok: true, ...parsed, manifest: manifest[index] }
    } catch (error) {
      console.error('Cohere page parse failed', { category: error?.message?.includes('timed out') ? 'timeout' : 'provider', page_number: manifest[index].page_number, page_count: pages.length })
      return { ok: false, manifest: manifest[index] }
    }
  })
  const providerMs = Math.round(performance.now() - providerStarted)
  const successful = providerResults.filter(result => result.ok)
  if (!successful.length) return jsonError(c, 502, 'PARSE_FAILED', 'Answer pages could not be read. Retry or enter answers manually.')

  const parseStarted = performance.now()
  const parsed = parseAnswerPdfPages(successful.map(result => ({ page_number: result.manifest.page_number, text: result.manifest.text, markdown: result.markdown })), { expectedQuestionCount, schemaShape })
  if (parsed.schema.length === 0) return jsonError(c, 422, 'UNSUPPORTED_DOCUMENT', 'No supported answer table could be extracted from the supplied pages. Retry or enter answers manually.')
  const errors = validateSchemaRows(parsed.schema, { allowBlankAnswers: true })
  if (errors.length) return jsonError(c, 422, 'INVALID_SCHEMA', errors.join('; '))
  const parseMs = Math.round(performance.now() - parseStarted)
  const failureWarnings = providerResults.filter(result => !result.ok).map(result => `Page ${result.manifest.page_number} could not be read and was skipped.`)

  return jsonSuccess(c, {
    schema: parsed.schema,
    warnings: [UNSCORED_WARNING, ...failureWarnings, ...parsed.warnings],
    confidence: null,
    model_id: COHERE_MODEL,
    timings_ms: { provider: providerMs, parse: parseMs, total: Math.round(performance.now() - started) },
    pages_processed: successful.length,
  })
})

exercisesRoutes.get('/', requireWorkspaceIdentity, async (c) => {
  const currentMembership = membership(c)
  const activeError = isManager(c) ? null : inactiveMembershipError(c)
  if (activeError) return activeError
  const isStudent = currentMembership?.role === 'student' && currentMembership.status === 'active' && c.get('authUser')?.platform_role !== 'platform_admin'
  const workspaceId = workspace(c).id
  const bindings = []
  const studentSubmissionJoin = isStudent
    ? `left join submissions in_progress
        on in_progress.exercise_id = e.id
        and in_progress.user_id = ?
        and in_progress.submitted_at is null
        and in_progress.id = (
          select active_submission.id
          from submissions active_submission
          where active_submission.exercise_id = e.id
            and active_submission.user_id = in_progress.user_id
            and active_submission.submitted_at is null
          order by active_submission.attempt_number desc, active_submission.id desc
          limit 1
        )`
    : ''
  if (isStudent) bindings.push(c.get('authUser').id)
  let whereClause = 'where e.workspace_id = ?'
  bindings.push(workspaceId)
  if (isStudent) {
    whereClause += ` and ((
      exists (
        select 1
        from workspace_membership_grades membership_grade
        join exercise_grades exercise_grade on exercise_grade.grade = membership_grade.grade
        where membership_grade.membership_id = ?
          and exercise_grade.exercise_id = e.id
      )
      and exists (
        select 1
        from exercise_question_asset_sets student_active_set
        where student_active_set.id = e.active_question_asset_set_id
          and student_active_set.exercise_id = e.id
          and student_active_set.confirmed_at is not null
      )
    ) or in_progress.id is not null)`
    bindings.push(currentMembership.id)
  }
  const selectBindings = []
  if (isStudent) selectBindings.push(c.get('authUser').id, currentMembership.id)
  const exercises = await c.env.DB.prepare(`
    select
      e.*
      , count(distinct ef.id) as file_count
      , count(distinct ans.q_id) as question_count
      , ${isStudent ? 'in_progress.id' : 'null'} as in_progress_submission_id
      , ${isStudent ? 'in_progress.attempt_number' : 'null'} as in_progress_attempt_number
      , ${isStudent ? `coalesce((
          select max(student_submission.attempt_number)
          from submissions student_submission
          where student_submission.exercise_id = e.id
            and student_submission.user_id = ?
        ), 0)` : '0'} as latest_attempt_number
      , ${isStudent ? `exists (
          select 1
          from workspace_membership_grades state_membership_grade
          join exercise_grades state_exercise_grade on state_exercise_grade.grade = state_membership_grade.grade
          where state_membership_grade.membership_id = ?
            and state_exercise_grade.exercise_id = e.id
        )` : '0'} as has_grade_access
      , case when exists (
          select 1
          from exercise_question_asset_sets active_set
          where active_set.id = e.active_question_asset_set_id
            and active_set.exercise_id = e.id
            and active_set.confirmed_at is not null
        ) then 1 else 0 end as is_student_ready
    from exercises e
    ${studentSubmissionJoin}
    left join exercise_files ef on e.id = ef.exercise_id
    left join answer_schemas ans on e.id = ans.exercise_id
    ${whereClause}
    group by e.id
    order by e.created_at desc, e.id desc
  `).bind(...selectBindings, ...bindings).all()
  const gradeResult = await getExerciseGrades(c.env.DB, exercises.results.map((exercise) => exercise.id), workspaceId)
  return jsonSuccess(c, attachGrades(exercises.results.map(exercise => (isStudent ? withStudentAttemptState(toExerciseWithTiming(exercise)) : toExerciseWithTiming(exercise))), gradeResult, 'exercise_id'))
})

exercisesRoutes.get('/:id', requireWorkspaceIdentity, async (c) => {
  const id = c.req.param('id')
  const workspaceId = workspace(c).id
  const exercise = await c.env.DB.prepare('select * from exercises where id = ? and workspace_id = ?').bind(id, workspaceId).first()
  if (!exercise) return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')

  const manager = isManager(c)
  const currentMembership = membership(c)
  const isStudent = currentMembership?.role === 'student' && currentMembership.status === 'active' && c.get('authUser')?.platform_role !== 'platform_admin'
  if (!manager) {
    const activeError = inactiveMembershipError(c)
    if (activeError) return activeError
    if (!isStudent) return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this resource.')
  }

  let studentAttemptState = null
  if (isStudent) {
    const access = await c.env.DB.prepare(`
      select
        (select submission.id from submissions submission where submission.user_id = ? and submission.exercise_id = ? and submission.submitted_at is null order by submission.attempt_number desc, submission.id desc limit 1) as in_progress_submission_id
        , (select submission.attempt_number from submissions submission where submission.user_id = ? and submission.exercise_id = ? and submission.submitted_at is null order by submission.attempt_number desc, submission.id desc limit 1) as in_progress_attempt_number
        , coalesce((select max(submission.attempt_number) from submissions submission where submission.user_id = ? and submission.exercise_id = ?), 0) as latest_attempt_number
        , exists (
            select 1
            from workspace_membership_grades membership_grade
            join exercise_grades exercise_grade on exercise_grade.grade = membership_grade.grade
            where membership_grade.membership_id = ? and exercise_grade.exercise_id = ?
          ) as has_grade_access
        , exists (
            select 1
            from exercise_question_asset_sets student_active_set
            where student_active_set.id = ?
              and student_active_set.exercise_id = ?
              and student_active_set.confirmed_at is not null
          ) as is_ready
    `).bind(c.get('authUser').id, id, c.get('authUser').id, id, c.get('authUser').id, id, currentMembership.id, id, exercise.active_question_asset_set_id, id).first()
    studentAttemptState = withStudentAttemptState({ max_attempts: exercise.max_attempts, ...access, is_student_ready: access.is_ready })
    if (!access.in_progress_submission_id && !(access.has_grade_access && access.is_ready)) {
      return access.has_grade_access
        ? jsonError(c, 403, 'EXERCISE_NOT_READY', 'This exercise is not ready for students')
        : jsonError(c, 403, 'GRADE_ACCESS_DENIED', 'This exercise is not available for your classes')
    }
  }

  const files = await c.env.DB.prepare('select * from exercise_files where exercise_id = ? order by uploaded_at desc, id desc').bind(id).all()
  const schema = manager || !exercise.active_question_asset_set_id
    ? await c.env.DB.prepare(`
        select q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths
        from answer_schemas
        where exercise_id = ?
        order by q_id asc, sub_id asc
      `).bind(id).all()
    : await c.env.DB.prepare(`
        select snapshot.q_id, snapshot.section_key, snapshot.section_title, snapshot.local_number, snapshot.sub_id, snapshot.type, snapshot.correct_answer, snapshot.max_score_hundredths
        from exercise_question_answer_schemas snapshot
        join exercise_question_asset_sets asset_set on asset_set.id = snapshot.asset_set_id
        where snapshot.asset_set_id = ?
          and asset_set.exercise_id = ?
          and asset_set.confirmed_at is not null
        order by snapshot.q_id asc, snapshot.sub_id asc
      `).bind(exercise.active_question_asset_set_id, id).all()

  let questionAssetSetId = null
  let questionAssets = []
  if (exercise.active_question_asset_set_id) {
    const activeSet = await c.env.DB.prepare(`
      select id
      from exercise_question_asset_sets
      where id = ? and exercise_id = ? and confirmed_at is not null
    `).bind(exercise.active_question_asset_set_id, id).first()
    if (activeSet) {
      const assets = await c.env.DB.prepare(`
        select *
        from exercise_question_assets
        where asset_set_id = ?
        order by q_id asc, segment_index asc
      `).bind(activeSet.id).all()
      questionAssetSetId = activeSet.id
      questionAssets = assets.results.map(toQuestionAssetResponse)
    }
  }

  const sanitizedSchema = manager ? schema.results : schema.results.map(({ q_id, section_key, section_title, local_number, sub_id, type }) => ({ q_id, section_key, section_title, local_number, sub_id, type }))
  const pendingQuestionAssetSet = manager ? await c.env.DB.prepare(`
    select id
    from exercise_question_asset_sets
    where exercise_id = ? and confirmed_at is null
    order by created_at desc, id desc
    limit 1
  `).bind(id).first() : null
  const highestAttempt = manager ? await c.env.DB.prepare('select coalesce(max(attempt_number), 0) as highest_attempt_number from submissions where exercise_id = ?').bind(id).first() : null
  const gradeResult = await c.env.DB.prepare('select grade from exercise_grades where exercise_id = ? order by grade').bind(id).all()

  return jsonSuccess(c, {
    ...toExerciseWithTiming(exercise),
    is_student_ready: questionAssetSetId === null ? 0 : 1,
    files: manager ? files.results : [],
    grades: gradeResult.results.map((row) => row.grade),
    schema: sanitizedSchema,
    question_asset_set_id: questionAssetSetId,
    question_assets: questionAssets,
    ...(!manager ? {
      latest_attempt_number: studentAttemptState.latest_attempt_number,
      next_attempt_number: studentAttemptState.next_attempt_number,
      in_progress_submission_id: studentAttemptState.in_progress_submission_id,
      in_progress_attempt_number: studentAttemptState.in_progress_attempt_number,
      attempts_remaining: studentAttemptState.attempts_remaining,
      can_start_attempt: studentAttemptState.can_start_attempt,
    } : {}),
    ...(manager ? { pending_question_asset_set_id: pendingQuestionAssetSet?.id ?? null, highest_attempt_number: highestAttempt.highest_attempt_number } : {}),
  })
})

exercisesRoutes.post('/', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const body = await c.req.json().catch(() => null)
  const { title, duration_minutes, schema, is_timed = true, max_attempts, allow_answer_pdf_download = false } = body || {}
  const parsedGrades = parseGrades(body?.grades, { defaultToAll: true })
  if (!title || schema === undefined || !Object.hasOwn(body || {}, 'max_attempts')) return jsonError(c, 400, 'VALIDATION_ERROR', 'Title, is_timed, max_attempts, and schema are required')
  if (!isValidMaxAttempts(max_attempts)) return jsonError(c, 400, 'VALIDATION_ERROR', 'max_attempts must be null or a positive integer')
  if (!isBooleanSetting(allow_answer_pdf_download)) return jsonError(c, 400, 'VALIDATION_ERROR', 'allow_answer_pdf_download must be boolean')
  if (parsedGrades.error) return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  if (typeof is_timed !== 'boolean') return jsonError(c, 400, 'VALIDATION_ERROR', 'is_timed must be boolean')
  let normalizedDuration = duration_minutes
  if (is_timed) {
    if (typeof normalizedDuration !== 'number' || normalizedDuration <= 0) return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be a positive number when is_timed is true')
  } else {
    if (normalizedDuration !== undefined && (typeof normalizedDuration !== 'number' || normalizedDuration < 0)) return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be 0 or omitted when is_timed is false')
    normalizedDuration = 0
  }
  const schemaError = validateSchemaItems(schema)
  if (schemaError) return jsonError(c, 400, 'INVALID_SCHEMA', schemaError)

  try {
    const normalizedSchema = normalizeSchema(schema)
    // The generated exercise ID remains the largest ID throughout this atomic
    // batch. No other exercise insertion can interleave with its child writes.
    const statements = [c.env.DB.prepare(`
      insert into exercises (title, duration_minutes, max_attempts, allow_answer_pdf_download, created_by, workspace_id)
      values (?, ?, ?, ?, ?, ?)
    `).bind(title, normalizedDuration, max_attempts, allow_answer_pdf_download ? 1 : 0, c.get('authUser').id, workspace(c).id)]
    statements.push(...normalizedSchema.map((item) => c.env.DB.prepare(`
      insert into answer_schemas (
        exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        , max_score_hundredths
      ) values ((select max(id) from exercises), ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(item.q_id, item.section_key, item.section_title, item.local_number, item.sub_id, item.type, item.correct_answer, item.max_score_hundredths)))
    statements.push(...parsedGrades.grades.map((grade) => c.env.DB.prepare(`
      insert into exercise_grades (exercise_id, grade)
      values ((select max(id) from exercises), ?)
    `).bind(grade)))
    const [insertResult] = await c.env.DB.batch(statements)
    const exerciseId = insertResult.meta.last_row_id
    const created = await c.env.DB.prepare('select * from exercises where id = ? and workspace_id = ?').bind(exerciseId, workspace(c).id).first()
    return jsonSuccess(c, { ...toExerciseWithTiming(created), files: [], grades: parsedGrades.grades, schema: normalizedSchema }, 201)
  } catch (error) {
    console.error('Exercise creation error:', error)
    return jsonError(c, 500, 'DATABASE_ERROR', 'Failed to create exercise')
  }
})

exercisesRoutes.put('/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const { title, duration_minutes, is_timed, question_asset_set_id, resolved_answer_candidate_keys, grades, max_attempts, allow_answer_pdf_download } = body || {}
  let schema = body?.schema
  if (!title && duration_minutes === undefined && !schema && is_timed === undefined && question_asset_set_id === undefined && resolved_answer_candidate_keys === undefined && grades === undefined && max_attempts === undefined && allow_answer_pdf_download === undefined) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'At least one update field is required')
  }
  if (is_timed !== undefined && typeof is_timed !== 'boolean') return jsonError(c, 400, 'VALIDATION_ERROR', 'is_timed must be boolean')
  if (max_attempts !== undefined && !isValidMaxAttempts(max_attempts)) return jsonError(c, 400, 'VALIDATION_ERROR', 'max_attempts must be null or a positive integer')
  if (allow_answer_pdf_download !== undefined && !isBooleanSetting(allow_answer_pdf_download)) return jsonError(c, 400, 'VALIDATION_ERROR', 'allow_answer_pdf_download must be boolean')
  const parsedGrades = grades === undefined ? null : parseGrades(grades)
  if (parsedGrades?.error) return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  if (question_asset_set_id !== undefined && (!Number.isInteger(question_asset_set_id) || question_asset_set_id < 1)) return jsonError(c, 400, 'VALIDATION_ERROR', 'question_asset_set_id must be a positive integer')
  if (question_asset_set_id !== undefined && !schema) return jsonError(c, 400, 'VALIDATION_ERROR', 'schema is required when activating a question asset set')
  if (resolved_answer_candidate_keys !== undefined && question_asset_set_id === undefined) return jsonError(c, 400, 'VALIDATION_ERROR', 'question_asset_set_id is required with answer candidate resolutions')
  if (resolved_answer_candidate_keys !== undefined && (!Array.isArray(resolved_answer_candidate_keys) || resolved_answer_candidate_keys.some(key => (!Number.isInteger(key?.q_id) || key.q_id < 1 || (key.sub_id !== null && key.sub_id !== undefined && typeof key.sub_id !== 'string'))))) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'resolved_answer_candidate_keys is invalid')
  }

  try {
    const currentExercise = await c.env.DB.prepare('select * from exercises where id = ? and workspace_id = ?').bind(id, workspace(c).id).first()
    if (!currentExercise) return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    const nextIsTimed = is_timed === undefined ? currentExercise.duration_minutes > 0 : is_timed
    let nextDuration = duration_minutes
    if (nextIsTimed) {
      if (nextDuration === undefined) nextDuration = currentExercise.duration_minutes
      if (typeof nextDuration !== 'number' || nextDuration <= 0) return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be a positive number when is_timed is true')
    } else {
      if (nextDuration !== undefined && (typeof nextDuration !== 'number' || nextDuration < 0)) return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be 0 or omitted when is_timed is false')
      nextDuration = 0
    }
    if (schema) {
      if (!Array.isArray(schema)) return jsonError(c, 400, 'INVALID_SCHEMA', 'Schema must be a non-empty array')
      const currentSchema = await c.env.DB.prepare(`
        select q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths
        from answer_schemas
        where exercise_id = ?
      `).bind(id).all()
      const currentByKey = new Map(currentSchema.results.map(row => [`${row.q_id}:${row.sub_id ?? ''}`, row]))
      schema = schema.map(item => {
        const current = currentByKey.get(`${item.q_id}:${item.sub_id ?? ''}`)
        if (!current) return item
        return {
          ...item,
          section_key: Object.hasOwn(item, 'section_key') ? item.section_key : current.section_key,
          section_title: Object.hasOwn(item, 'section_title') ? item.section_title : current.section_title,
          local_number: Object.hasOwn(item, 'local_number') ? item.local_number : current.local_number,
          max_score_hundredths: Object.hasOwn(item, 'max_score_hundredths') ? item.max_score_hundredths : current.max_score_hundredths,
        }
      })
      const schemaError = validateSchemaItems(schema)
      if (schemaError) return jsonError(c, 400, 'INVALID_SCHEMA', schemaError)
    }

    let shouldReplaceSchema = Boolean(schema)
    if (schema && currentExercise.active_question_asset_set_id && question_asset_set_id === undefined) {
      const currentSchema = await c.env.DB.prepare('select * from answer_schemas where exercise_id = ?').bind(id).all()
      shouldReplaceSchema = !schemasMatch(schema, currentSchema.results)
      if (shouldReplaceSchema) return jsonError(c, 409, 'ACTIVE_ASSET_SET_REQUIRES_REPLACEMENT', 'Activate a replacement question asset set to change this exercise schema')
    }

    let allocationChanged = false
    if (schema) {
      const currentAllocation = await c.env.DB.prepare('select q_id, sub_id, max_score_hundredths from answer_schemas where exercise_id = ?').bind(id).all()
      allocationChanged = !allocationsMatch(schema, currentAllocation.results)
      if (allocationChanged) {
        const legacySubmission = await c.env.DB.prepare('select 1 from submissions where exercise_id = ? and question_asset_set_id is null limit 1').bind(id).first()
        if (legacySubmission) return jsonError(c, 409, 'LEGACY_SUBMISSIONS_REQUIRE_PINNING', 'Pin legacy submissions before changing score allocation')
      }
    }

    let activation = null
    if (question_asset_set_id !== undefined) {
      activation = await validateQuestionAssetSetForActivation(c.env, { exerciseId: Number(id), setId: question_asset_set_id, schemaRows: schema, resolvedAnswerCandidateKeys: resolved_answer_candidate_keys || [] })
      if (activation.error) return jsonError(c, 409, 'ASSET_SET_NOT_READY', activation.error)
    }

    const batchStmts = []
    const updates = []
    const params = []
    if (title) { updates.push('title = ?'); params.push(title) }
    if (duration_minutes !== undefined || is_timed !== undefined) { updates.push('duration_minutes = ?'); params.push(nextDuration) }
    if (max_attempts !== undefined) { updates.push('max_attempts = ?'); params.push(max_attempts) }
    if (allow_answer_pdf_download !== undefined) { updates.push('allow_answer_pdf_download = ?'); params.push(allow_answer_pdf_download ? 1 : 0) }
    if (updates.length > 0) {
      params.push(id, workspace(c).id)
      batchStmts.push(c.env.DB.prepare(`update exercises set ${updates.join(', ')}, updated_at = current_timestamp where id = ? and workspace_id = ?`).bind(...params))
    }
    if (shouldReplaceSchema && !activation) {
      batchStmts.push(c.env.DB.prepare('delete from answer_schemas where exercise_id = ?').bind(id))
      for (const item of normalizeSchema(schema)) {
        batchStmts.push(c.env.DB.prepare(`
          insert into answer_schemas (exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, item.q_id, item.section_key, item.section_title, item.local_number, item.sub_id, item.type, item.correct_answer, item.max_score_hundredths))
      }
    }
    if (parsedGrades) {
      batchStmts.push(c.env.DB.prepare('delete from exercise_grades where exercise_id = ?').bind(id))
      batchStmts.push(...parsedGrades.grades.map((grade) => c.env.DB.prepare('insert into exercise_grades (exercise_id, grade) values (?, ?)').bind(id, grade)))
    }
    if (activation) {
      const confirmedAt = new Date().toISOString()
      batchStmts.push(c.env.DB.prepare(`
        with proposed_schema as (
          select
            cast(json_extract(value, '$.q_id') as integer) as q_id
            , json_extract(value, '$.section_key') as section_key
            , json_extract(value, '$.section_title') as section_title
            , cast(json_extract(value, '$.local_number') as integer) as local_number
            , json_extract(value, '$.sub_id') as sub_id
            , json_extract(value, '$.type') as type
            , json_extract(value, '$.correct_answer') as correct_answer
          from json_each(?)
        )
        , resolved as (
          select cast(json_extract(value, '$.q_id') as integer) as q_id
            , json_extract(value, '$.sub_id') as sub_id
          from json_each(?)
        )
        update exercise_question_asset_sets as s
        set confirmed_by = ?, confirmed_at = ?
        where s.id = ? and s.exercise_id = ? and s.confirmed_at is null
          and exists (select 1 from exercises where id = s.exercise_id and workspace_id = ?)
          and s.source_file_id = (
            select id from exercise_files
            where exercise_id = s.exercise_id and file_type = 'exercise_pdf'
            order by uploaded_at desc, id desc limit 1
          )
          and s.answer_source_file_id is (
            select id from exercise_files
            where exercise_id = s.exercise_id and file_type = 'solution_pdf'
            order by uploaded_at desc, id desc limit 1
          )
          and s.detection_method <> 'vision'
          and (? = 0 or not exists (
            select 1 from submissions
            where exercise_id = s.exercise_id and question_asset_set_id is null
          ))
          and not exists (
            select 1 from proposed_schema proposed
            left join exercise_question_answer_schemas pinned
              on pinned.asset_set_id = s.id and pinned.q_id = proposed.q_id
              and coalesce(pinned.sub_id, '') = coalesce(proposed.sub_id, '')
            where pinned.id is null
              or pinned.section_key <> proposed.section_key
              or pinned.section_title is not proposed.section_title
              or pinned.local_number <> proposed.local_number
              or pinned.type <> proposed.type
          )
          and not exists (
            select 1 from exercise_question_answer_schemas pinned
            left join proposed_schema proposed
              on proposed.q_id = pinned.q_id
              and coalesce(proposed.sub_id, '') = coalesce(pinned.sub_id, '')
            where pinned.asset_set_id = s.id and proposed.q_id is null
          )
          and (select count(distinct q_id) from exercise_question_assets where asset_set_id = s.id)
            = (select count(distinct q_id) from proposed_schema)
          and not exists (
            select 1 from exercise_question_assets asset
            where asset.asset_set_id = s.id and (
              asset.rejected_at is not null
              or (asset.source_kind = 'pdf_crop' and asset.confidence < ?)
              or asset.q_id not in (select distinct q_id from proposed_schema)
            )
          )
          and not exists (
            select 1 from exercise_question_assets asset
            where asset.asset_set_id = s.id and asset.segment_index <> (
              select count(*) from exercise_question_assets earlier
              where earlier.asset_set_id = asset.asset_set_id and earlier.q_id = asset.q_id
                and earlier.segment_index < asset.segment_index
            )
          )
          and not exists (
            select 1 from exercise_question_answer_candidates candidate
            left join proposed_schema proposed
              on proposed.q_id = candidate.q_id
              and coalesce(proposed.sub_id, '') = coalesce(candidate.sub_id, '')
            where candidate.asset_set_id = s.id and (
              proposed.q_id is null or proposed.type <> candidate.type
              or (candidate.type = 'numeric' and cast(proposed.correct_answer as real) <> cast(candidate.proposed_answer as real))
              or (candidate.type = 'mcq' and upper(trim(proposed.correct_answer)) <> upper(trim(candidate.proposed_answer)))
              or (candidate.type = 'boolean' and trim(proposed.correct_answer) <> trim(candidate.proposed_answer))
            )
            and not exists (
              select 1 from resolved where resolved.q_id = candidate.q_id
                and coalesce(resolved.sub_id, '') = coalesce(candidate.sub_id, '')
            )
          )
      `).bind(JSON.stringify(normalizeSchema(schema)), JSON.stringify(resolved_answer_candidate_keys || []), c.get('authUser').id, confirmedAt, question_asset_set_id, id, workspace(c).id, allocationChanged ? 1 : 0, MIN_QUESTION_ASSET_CONFIDENCE))
      // Force rollback of every edit when activation loses the conditional update.
      batchStmts.push(c.env.DB.prepare(`
        insert into exercise_question_answer_schemas (
          asset_set_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        )
        select null, 1, 'main', null, 1, null, 'mcq', '' where changes() <> 1
      `))
      batchStmts.push(c.env.DB.prepare('delete from answer_schemas where exercise_id = ?').bind(id))
      for (const item of normalizeSchema(schema)) {
        batchStmts.push(c.env.DB.prepare(`
          update exercise_question_answer_schemas
          set correct_answer = ?, max_score_hundredths = ?
          where asset_set_id = ? and q_id = ? and coalesce(sub_id, '') = coalesce(?, '')
        `).bind(item.correct_answer, item.max_score_hundredths, question_asset_set_id, item.q_id, item.sub_id))
        batchStmts.push(c.env.DB.prepare(`
          insert into answer_schemas (exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, item.q_id, item.section_key, item.section_title, item.local_number, item.sub_id, item.type, item.correct_answer, item.max_score_hundredths))
      }
      batchStmts.push(c.env.DB.prepare('update exercises set active_question_asset_set_id = ?, updated_at = current_timestamp where id = ? and workspace_id = ?').bind(question_asset_set_id, id, workspace(c).id))
    }
    if (batchStmts.length > 0) {
      try {
        await c.env.DB.batch(batchStmts)
      } catch (error) {
        if (activation) return jsonError(c, 409, 'ASSET_SET_NOT_READY', 'Question asset set changed before activation')
        throw error
      }
    }

    const exercise = await c.env.DB.prepare('select * from exercises where id = ? and workspace_id = ?').bind(id, workspace(c).id).first()
    const files = await c.env.DB.prepare('select * from exercise_files where exercise_id = ? order by uploaded_at desc').bind(id).all()
    const schemaResult = await c.env.DB.prepare(`
      select q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths
      from answer_schemas
      where exercise_id = ?
      order by q_id asc, sub_id asc
    `).bind(id).all()
    const gradeResult = await c.env.DB.prepare('select grade from exercise_grades where exercise_id = ? order by grade').bind(id).all()
    const highestAttempt = await c.env.DB.prepare('select coalesce(max(attempt_number), 0) as highest_attempt_number from submissions where exercise_id = ?').bind(id).first()
    return jsonSuccess(c, { ...toExerciseWithTiming(exercise), highest_attempt_number: highestAttempt.highest_attempt_number, files: files.results, grades: gradeResult.results.map((row) => row.grade), schema: schemaResult.results })
  } catch (error) {
    console.error('Exercise update error:', error)
    return jsonError(c, 500, 'DATABASE_ERROR', 'Failed to update exercise')
  }
})

exercisesRoutes.delete('/:id', requireWorkspaceIdentity, requireWorkspaceManagement, async (c) => {
  const id = c.req.param('id')
  const exercise = await c.env.DB.prepare('select id from exercises where id = ? and workspace_id = ?').bind(id, workspace(c).id).first()
  if (!exercise) return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
  const questionAssets = await c.env.DB.prepare(`
    select question_asset.r2_key
    from exercise_question_assets question_asset
    join exercise_question_asset_sets asset_set on asset_set.id = question_asset.asset_set_id
    join exercises exercise on exercise.id = asset_set.exercise_id
    where asset_set.exercise_id = ? and exercise.workspace_id = ?
  `).bind(id, workspace(c).id).all()
  await c.env.DB.batch([
    c.env.DB.prepare('pragma foreign_keys = on'),
    c.env.DB.prepare('delete from exercises where id = ? and workspace_id = ?').bind(id, workspace(c).id),
  ])
  await Promise.allSettled(questionAssets.results.map((asset) => c.env.BUCKET.delete(asset.r2_key)))
  return jsonSuccess(c, { deleted: true })
})

export default exercisesRoutes

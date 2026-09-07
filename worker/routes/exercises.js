import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import {
  validateSchemaRows,
} from '../lib/schema-parser.js'
import { COHERE_MODEL, parseImageWithCohere } from '../lib/cohere.js'
import { parseAnswerPdfPages } from '../lib/cohere-table-parser.js'
import { attachGrades, parseGrades } from '../lib/grades.js'
import {
  MIN_QUESTION_ASSET_CONFIDENCE,
  toQuestionAssetResponse,
  validateQuestionAssetSetForActivation,
} from '../lib/question-assets.js'

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

function isValidMaxAttempts(value) {
  return value === null || (Number.isInteger(value) && value > 0)
}

function isBooleanSetting(value) {
  return typeof value === 'boolean'
}

function toExerciseWithTiming(exercise) {
  if (!exercise) {
    return exercise
  }
  const { extract_model: _deprecatedExtractModel, ...currentExercise } = exercise

  return {
    ...currentExercise,
    is_timed: exercise.duration_minutes > 0 ? 1 : 0,
  }
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
    can_start_attempt: hasGradeAccess
      && exercise.is_student_ready
      && (attemptsRemaining === null || attemptsRemaining > 0)
      ? 1
      : 0,
  }
}

/**
 * Validate schema items for POST/PUT routes.
 * Delegates to the shared validateSchemaRows from schema-parser.
 * Returns an error message string if invalid, or null if valid.
 */
function validateSchemaItems(schema) {
  if (!Array.isArray(schema) || schema.length === 0) {
    return 'Schema must be a non-empty array'
  }

  // Normalize into the shape validateSchemaRows expects
  const rows = schema.map((item) => ({
    q_id: Number.isInteger(item.q_id) ? item.q_id : Number.parseInt(String(item.q_id ?? ''), 10),
    section_key: item.section_key ?? 'main',
    section_title: item.section_title ?? null,
    local_number: item.local_number ?? (
      Number.isInteger(item.q_id) ? item.q_id : Number.parseInt(String(item.q_id ?? ''), 10)
    ),
    type: item.type ?? '',
    sub_id: item.sub_id ?? null,
    correct_answer: item.correct_answer === undefined || item.correct_answer === null
      ? ''
      : String(item.correct_answer),
  }))

  const errors = validateSchemaRows(rows)
  if (errors.length > 0) return errors[0]

  const values = schema.map(item => item.max_score_hundredths ?? null)
  const custom = values.some(value => value !== null)
  if (!custom) return null
  if (values.some(value => value === null)) {
    return 'Score allocation must be automatic for every row or custom for every row'
  }

  const maximumByQuestion = new Map()
  for (const item of schema) {
    const value = item.max_score_hundredths
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      return 'max_score_hundredths must be an integer from 1 to 1000'
    }
    const existing = maximumByQuestion.get(item.q_id)
    if (existing !== undefined && existing !== value) {
      return `Question ${item.q_id} must use one max_score_hundredths value across all rows`
    }
    maximumByQuestion.set(item.q_id, value)
  }

  const total = [...maximumByQuestion.values()].reduce((sum, value) => sum + value, 0)
  return total === 1000 ? null : 'Distinct question max_score_hundredths values must total 1000'
}

function schemasMatch(left, right) {
  if (left.length !== right.length) return false

  const normalize = rows => rows
    .map(row => ({
      q_id: Number(row.q_id),
      section_key: row.section_key ?? 'main',
      section_title: row.section_title ?? null,
      local_number: Number(row.local_number ?? row.q_id),
      sub_id: row.sub_id ?? null,
      type: row.type,
      correct_answer: String(row.correct_answer),
      max_score_hundredths: row.max_score_hundredths ?? null,
    }))
    .sort((a, b) => (
      a.q_id - b.q_id
      || String(a.sub_id ?? '').localeCompare(String(b.sub_id ?? ''))
    ))

  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function allocationsMatch(left, right) {
  if (left.length !== right.length) return false
  const normalize = rows => rows
    .map(row => ({
      q_id: Number(row.q_id),
      sub_id: row.sub_id ?? null,
      max_score_hundredths: row.max_score_hundredths ?? null,
    }))
    .sort((a, b) => (
      a.q_id - b.q_id
      || String(a.sub_id ?? '').localeCompare(String(b.sub_id ?? ''))
    ))
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function questionIdentity(item) {
  return {
    sectionKey: item.section_key ?? 'main',
    sectionTitle: item.section_title ?? null,
    localNumber: Number(item.local_number ?? item.q_id),
  }
}

exercisesRoutes.post('/schema/parse', requireAuth, requireRole('teacher'), async (c) => {
  const started = performance.now()
  const contentType = c.req.header('content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Request must be multipart/form-data')
  }
  const contentLength = Number(c.req.header('content-length') || 0)
  if (contentLength > MAX_PARSE_PAYLOAD_BYTES) {
    return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'Multipart request must be at most 25 MiB')
  }

  let form
  try {
    form = await c.req.raw.formData()
  } catch {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Multipart request is malformed')
  }
  const pages = form.getAll('page')
  if (pages.length < 1 || pages.length > MAX_PARSE_PAGES || pages.some(page => !(page instanceof File))) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Provide 1 to 10 page files')
  }
  if (pages.some(page => page.type !== 'image/png')) {
    return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Every page must be an image/png file')
  }
  if (pages.some(page => page.size > MAX_PARSE_PAGE_BYTES)) {
    return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'Each page must be at most 3 MiB')
  }
  if ([...form].some(([name, value]) => value instanceof File && name !== 'page')) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Unexpected file field')
  }

  const manifestValue = form.get('page_manifest')
  const schemaShapeValue = form.get('schema_shape')
  if (form.getAll('page_manifest').length !== 1
    || form.getAll('expected_question_count').length > 1
    || form.getAll('schema_shape').length > 1) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Multipart metadata fields must not be repeated')
  }
  let manifest
  try {
    if (typeof manifestValue !== 'string') throw new TypeError('page_manifest must be text')
    manifest = JSON.parse(manifestValue)
  } catch {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'page_manifest must be valid JSON')
  }
  if (!Array.isArray(manifest) || manifest.length !== pages.length) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'page_manifest must match every page file')
  }
  const validManifest = manifest.every((entry, index) => (
    entry && typeof entry === 'object'
    && typeof entry.file_name === 'string'
    && entry.file_name === pages[index].name
    && Number.isInteger(entry.page_number)
    && entry.page_number >= 1
    && (index === 0 || entry.page_number > manifest[index - 1].page_number)
    && typeof entry.text === 'string'
  ))
  const uniqueNames = new Set(manifest.map(entry => entry?.file_name)).size === manifest.length
  const textBytes = manifest.reduce((total, entry) => (
    total + (typeof entry?.text === 'string' ? new TextEncoder().encode(entry.text).byteLength : 0)
  ), 0)
  if (!validManifest || !uniqueNames || textBytes > MAX_MANIFEST_TEXT_BYTES) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'page_manifest entries are invalid or too large')
  }

  let schemaShape
  if (schemaShapeValue !== null) {
    try {
      if (typeof schemaShapeValue !== 'string'
        || new TextEncoder().encode(schemaShapeValue).byteLength > MAX_SCHEMA_SHAPE_BYTES) {
        throw new TypeError('schema_shape must be bounded text')
      }
      const rawShape = JSON.parse(schemaShapeValue)
      if (!Array.isArray(rawShape) || rawShape.length === 0) {
        throw new TypeError('schema_shape must be a non-empty array')
      }
      schemaShape = rawShape.map(row => ({
        q_id: row?.q_id,
        section_key: row?.section_key,
        section_title: row?.section_title ?? null,
        local_number: row?.local_number,
        type: row?.type,
        sub_id: row?.sub_id ?? null,
        correct_answer: '',
      }))
      if (validateSchemaRows(schemaShape, { allowBlankAnswers: true }).length) {
        throw new TypeError('schema_shape is invalid')
      }
    } catch {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'schema_shape must be a valid schema descriptor array')
    }
  }

  const expectedRaw = form.get('expected_question_count')
  const expectedQuestionCount = expectedRaw === null ? undefined : Number(expectedRaw)
  if (expectedRaw !== null && (typeof expectedRaw !== 'string'
    || !/^[1-9]\d*$/.test(expectedRaw) || !Number.isSafeInteger(expectedQuestionCount))) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'expected_question_count must be a positive integer')
  }
  const measuredPayloadBytes = pages.reduce((total, page) => total + page.size, 0)
    + new TextEncoder().encode(manifestValue).byteLength
    + (typeof expectedRaw === 'string' ? new TextEncoder().encode(expectedRaw).byteLength : 0)
    + (typeof schemaShapeValue === 'string' ? new TextEncoder().encode(schemaShapeValue).byteLength : 0)
  if (measuredPayloadBytes > MAX_PARSE_PAYLOAD_BYTES) {
    return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'Multipart payload must be at most 25 MiB')
  }

  const providerStarted = performance.now()
  const providerResults = await mapWithConcurrency(pages, PARSE_CONCURRENCY, async (page, index) => {
    try {
      const parsed = await parseImageWithCohere(c.env, {
        imageBytes: await page.arrayBuffer(),
        contentType: page.type,
      })
      return { ok: true, ...parsed, manifest: manifest[index] }
    } catch (error) {
      console.error('Cohere page parse failed', {
        category: error?.message?.includes('timed out') ? 'timeout' : 'provider',
        page_number: manifest[index].page_number,
        page_count: pages.length,
      })
      return { ok: false, manifest: manifest[index] }
    }
  })
  const providerMs = Math.round(performance.now() - providerStarted)
  const successful = providerResults.filter(result => result.ok)
  if (!successful.length) {
    return jsonError(c, 502, 'PARSE_FAILED', 'Answer pages could not be read. Retry or enter answers manually.')
  }

  const parseStarted = performance.now()
  const parsed = parseAnswerPdfPages(successful.map(result => ({
    page_number: result.manifest.page_number,
    text: result.manifest.text,
    markdown: result.markdown,
  })), { expectedQuestionCount, schemaShape })
  if (parsed.schema.length === 0) {
    return jsonError(c, 422, 'UNSUPPORTED_DOCUMENT', 'No supported answer table could be extracted from the supplied pages. Retry or enter answers manually.')
  }
  const errors = validateSchemaRows(parsed.schema, { allowBlankAnswers: true })
  if (errors.length) {
    return jsonError(c, 422, 'INVALID_SCHEMA', errors.join('; '))
  }
  const parseMs = Math.round(performance.now() - parseStarted)
  const failureWarnings = providerResults
    .filter(result => !result.ok)
    .map(result => `Page ${result.manifest.page_number} could not be read and was skipped.`)

  return jsonSuccess(c, {
    schema: parsed.schema,
    warnings: [UNSCORED_WARNING, ...failureWarnings, ...parsed.warnings],
    confidence: null,
    model_id: COHERE_MODEL,
    timings_ms: {
      provider: providerMs,
      parse: parseMs,
      total: Math.round(performance.now() - started),
    },
    pages_processed: successful.length,
  })
})

// List exercises available to the authenticated user.
exercisesRoutes.get('/', requireAuth, async (c) => {
  const authUser = c.get('authUser')
  const isStudent = authUser.role === 'student'
  const studentSubmissionJoin = isStudent
    ? `LEFT JOIN submissions in_progress
        ON in_progress.exercise_id = e.id
        AND in_progress.user_id = ?
        AND in_progress.submitted_at IS NULL
        AND in_progress.id = (
          SELECT active_submission.id
          FROM submissions active_submission
          WHERE active_submission.exercise_id = e.id
            AND active_submission.user_id = in_progress.user_id
            AND active_submission.submitted_at IS NULL
          ORDER BY active_submission.attempt_number DESC, active_submission.id DESC
          LIMIT 1
        )`
    : ''
  const studentAccessClause = authUser.role === 'student'
    ? `WHERE (
        EXISTS (
          SELECT 1
          FROM student_grades student_grade
          JOIN exercise_grades exercise_grade ON exercise_grade.grade = student_grade.grade
          WHERE student_grade.user_id = ?
            AND exercise_grade.exercise_id = e.id
        )
        AND EXISTS (
          SELECT 1
          FROM exercise_question_asset_sets student_active_set
          WHERE student_active_set.id = e.active_question_asset_set_id
            AND student_active_set.exercise_id = e.id
            AND student_active_set.confirmed_at IS NOT NULL
        )
      ) OR in_progress.id IS NOT NULL`
    : ''
  const statement = c.env.DB.prepare(`
    SELECT 
      e.*,
      COUNT(DISTINCT ef.id) as file_count,
      COUNT(DISTINCT ans.q_id) as question_count,
      ${isStudent ? 'in_progress.id' : 'NULL'} AS in_progress_submission_id,
      ${isStudent ? 'in_progress.attempt_number' : 'NULL'} AS in_progress_attempt_number,
      ${isStudent ? `coalesce((
        select max(student_submission.attempt_number)
        from submissions student_submission
        where student_submission.exercise_id = e.id
          and student_submission.user_id = ?
      ), 0)` : '0'} AS latest_attempt_number,
      ${isStudent ? `exists (
        select 1
        from student_grades state_student_grade
        join exercise_grades state_exercise_grade
          on state_exercise_grade.grade = state_student_grade.grade
        where state_student_grade.user_id = ?
          and state_exercise_grade.exercise_id = e.id
      )` : '0'} AS has_grade_access,
      CASE WHEN EXISTS (
        SELECT 1
        FROM exercise_question_asset_sets active_set
        WHERE active_set.id = e.active_question_asset_set_id
          AND active_set.exercise_id = e.id
          AND active_set.confirmed_at IS NOT NULL
      ) THEN 1 ELSE 0 END AS is_student_ready
    FROM exercises e
    ${studentSubmissionJoin}
    LEFT JOIN exercise_files ef ON e.id = ef.exercise_id
    LEFT JOIN answer_schemas ans ON e.id = ans.exercise_id
    ${studentAccessClause}
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `)
  const exercises = authUser.role === 'student'
    ? await statement.bind(authUser.id, authUser.id, authUser.id, authUser.id).all()
    : await statement.all()
  const gradeResult = await c.env.DB.prepare(`
    SELECT exercise_id, grade
    FROM exercise_grades
    ORDER BY grade
  `).all()

  return jsonSuccess(c, attachGrades(
    exercises.results.map(exercise => (
      isStudent
        ? withStudentAttemptState(toExerciseWithTiming(exercise))
        : toExerciseWithTiming(exercise)
    )),
    gradeResult.results,
    'exercise_id',
  ))
})

// Get exercise detail with files and schema.
exercisesRoutes.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const authUser = c.get('authUser')

  const exercise = await c.env.DB.prepare(
    'SELECT * FROM exercises WHERE id = ?'
  ).bind(id).first()

  if (!exercise) {
    return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
  }

  let studentAttemptState = null
  if (authUser.role === 'student') {
    const access = await c.env.DB.prepare(`
      SELECT
        (
          SELECT submission.id
          FROM submissions submission
          WHERE submission.user_id = ?
            AND submission.exercise_id = ?
            AND submission.submitted_at IS NULL
          ORDER BY submission.attempt_number DESC, submission.id DESC
          LIMIT 1
        ) AS in_progress_submission_id,
        (
          SELECT submission.attempt_number
          FROM submissions submission
          WHERE submission.user_id = ?
            AND submission.exercise_id = ?
            AND submission.submitted_at IS NULL
          ORDER BY submission.attempt_number DESC, submission.id DESC
          LIMIT 1
        ) AS in_progress_attempt_number,
        COALESCE((
          SELECT MAX(submission.attempt_number)
          FROM submissions submission
          WHERE submission.user_id = ? AND submission.exercise_id = ?
        ), 0) AS latest_attempt_number,
        EXISTS (
          SELECT 1
          FROM student_grades student_grade
          JOIN exercise_grades exercise_grade ON exercise_grade.grade = student_grade.grade
          WHERE student_grade.user_id = ? AND exercise_grade.exercise_id = ?
        ) AS has_grade_access,
        EXISTS (
          SELECT 1
          FROM exercise_question_asset_sets student_active_set
          WHERE student_active_set.id = ?
            AND student_active_set.exercise_id = ?
            AND student_active_set.confirmed_at IS NOT NULL
        ) AS is_ready
    `).bind(
      authUser.id,
      id,
      authUser.id,
      id,
      authUser.id,
      id,
      authUser.id,
      id,
      exercise.active_question_asset_set_id,
      id,
    ).first()
    studentAttemptState = withStudentAttemptState({
      max_attempts: exercise.max_attempts,
      ...access,
      is_student_ready: access.is_ready,
    })
    if (!access.in_progress_submission_id && !(access.has_grade_access && access.is_ready)) {
      return access.has_grade_access
        ? jsonError(c, 403, 'EXERCISE_NOT_READY', 'This exercise is not ready for students')
        : jsonError(c, 403, 'GRADE_ACCESS_DENIED', 'This exercise is not available for your classes')
    }
  }

  const files = await c.env.DB.prepare(
    'SELECT * FROM exercise_files WHERE exercise_id = ? ORDER BY uploaded_at DESC, id DESC'
  ).bind(id).all()

  const isTeacher = authUser.role === 'teacher'

  const schema = isTeacher || !exercise.active_question_asset_set_id
    ? await c.env.DB.prepare(`
        select q_id, section_key, section_title, local_number, sub_id, type, correct_answer,
          max_score_hundredths
        from answer_schemas
        where exercise_id = ?
        order by q_id asc, sub_id asc
      `).bind(id).all()
    : await c.env.DB.prepare(`
        select snapshot.q_id, snapshot.section_key, snapshot.section_title,
          snapshot.local_number, snapshot.sub_id, snapshot.type, snapshot.correct_answer,
          snapshot.max_score_hundredths
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

  // Strip correct_answer from schema for non-teachers
  const sanitizedSchema = isTeacher
    ? schema.results
    : schema.results.map(({
        q_id,
        section_key,
        section_title,
        local_number,
        sub_id,
        type,
      }) => ({
        q_id,
        section_key,
        section_title,
        local_number,
        sub_id,
        type,
      }))

  const pendingQuestionAssetSet = isTeacher
    ? await c.env.DB.prepare(`
        select id
        from exercise_question_asset_sets
        where exercise_id = ? and confirmed_at is null
        order by created_at desc, id desc
        limit 1
      `).bind(id).first()
    : null
  const highestAttempt = isTeacher
    ? await c.env.DB.prepare(`
        SELECT COALESCE(MAX(attempt_number), 0) AS highest_attempt_number
        FROM submissions
        WHERE exercise_id = ?
      `).bind(id).first()
    : null
  const gradeResult = await c.env.DB.prepare(`
    SELECT grade
    FROM exercise_grades
    WHERE exercise_id = ?
    ORDER BY grade
  `).bind(id).all()

  return jsonSuccess(c, {
    ...toExerciseWithTiming(exercise),
    is_student_ready: questionAssetSetId === null ? 0 : 1,
    files: isTeacher ? files.results : [],
    grades: gradeResult.results.map((row) => row.grade),
    schema: sanitizedSchema,
    question_asset_set_id: questionAssetSetId,
    question_assets: questionAssets,
    ...(!isTeacher ? {
      latest_attempt_number: studentAttemptState.latest_attempt_number,
      next_attempt_number: studentAttemptState.next_attempt_number,
      in_progress_submission_id: studentAttemptState.in_progress_submission_id,
      in_progress_attempt_number: studentAttemptState.in_progress_attempt_number,
      attempts_remaining: studentAttemptState.attempts_remaining,
      can_start_attempt: studentAttemptState.can_start_attempt,
    } : {}),
    ...(isTeacher
      ? {
          pending_question_asset_set_id: pendingQuestionAssetSet?.id ?? null,
          highest_attempt_number: highestAttempt.highest_attempt_number,
        }
      : {}),
  })
})

// Create exercise with answer schema (teacher only)
exercisesRoutes.post('/', requireAuth, requireRole('teacher'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const {
    title,
    duration_minutes,
    schema,
    is_timed = true,
    max_attempts,
    allow_answer_pdf_download = false,
  } = body || {}
  const parsedGrades = parseGrades(body?.grades, { defaultToAll: true })

  if (!title || schema === undefined || !Object.hasOwn(body || {}, 'max_attempts')) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Title, is_timed, max_attempts, and schema are required')
  }

  if (!isValidMaxAttempts(max_attempts)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'max_attempts must be null or a positive integer')
  }

  if (!isBooleanSetting(allow_answer_pdf_download)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'allow_answer_pdf_download must be boolean')
  }

  if (parsedGrades.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }

  if (typeof is_timed !== 'boolean') {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'is_timed must be boolean')
  }

  let normalizedDuration = duration_minutes
  if (is_timed) {
    if (typeof normalizedDuration !== 'number' || normalizedDuration <= 0) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be a positive number when is_timed is true')
    }
  } else {
    if (normalizedDuration !== undefined && (typeof normalizedDuration !== 'number' || normalizedDuration < 0)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be 0 or omitted when is_timed is false')
    }
    normalizedDuration = 0
  }

  const schemaError = validateSchemaItems(schema)
  if (schemaError) {
    return jsonError(c, 400, 'INVALID_SCHEMA', schemaError)
  }

  const authUser = c.get('authUser')

  try {
    const exerciseResult = await c.env.DB.prepare(`
      INSERT INTO exercises (
        title, duration_minutes, max_attempts, allow_answer_pdf_download, created_by
      )
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      title,
      normalizedDuration,
      max_attempts,
      allow_answer_pdf_download ? 1 : 0,
      authUser.id,
    ).run()

    const exerciseId = exerciseResult.meta.last_row_id

    // Batch insert answer schemas (atomic) - include sub_id
    const schemaStmts = schema.map((item) => {
      const identity = questionIdentity(item)
      return c.env.DB.prepare(`
        INSERT INTO answer_schemas (
          exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
              , max_score_hundredths
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        exerciseId,
        item.q_id,
        identity.sectionKey,
        identity.sectionTitle,
        identity.localNumber,
        item.sub_id ?? null,
        item.type,
        item.correct_answer,
        item.max_score_hundredths ?? null,
      )
    })
    const gradeStmts = parsedGrades.grades.map((grade) => c.env.DB.prepare(`
      INSERT INTO exercise_grades (exercise_id, grade)
      VALUES (?, ?)
    `).bind(exerciseId, grade))

    try {
      await c.env.DB.batch([...schemaStmts, ...gradeStmts])
    } catch (schemaError) {
      // Compensating delete: remove orphan exercise row
      await c.env.DB.prepare('DELETE FROM exercises WHERE id = ?').bind(exerciseId).run()
      throw schemaError
    }

    const created = await c.env.DB.prepare(
      'SELECT * FROM exercises WHERE id = ?'
    ).bind(exerciseId).first()

    const schemaResult = await c.env.DB.prepare(
      `SELECT q_id, section_key, section_title, local_number, sub_id, type, correct_answer,
         max_score_hundredths
       FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC, sub_id ASC`
    ).bind(exerciseId).all()

    return jsonSuccess(c, {
      ...toExerciseWithTiming(created),
      files: [],
      grades: parsedGrades.grades,
      schema: schemaResult.results,
    }, 201)
  } catch (error) {
    console.error('Exercise creation error:', error)
    return jsonError(c, 500, 'DATABASE_ERROR', 'Failed to create exercise')
  }
})

// Update exercise metadata (teacher only)
exercisesRoutes.put('/:id', requireAuth, requireRole('teacher'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const {
    title,
    duration_minutes,
    is_timed,
    question_asset_set_id,
    resolved_answer_candidate_keys,
    grades,
    max_attempts,
    allow_answer_pdf_download,
  } = body || {}
  let schema = body?.schema

  if (
    !title
    && duration_minutes === undefined
    && !schema
    && is_timed === undefined
    && question_asset_set_id === undefined
    && resolved_answer_candidate_keys === undefined
    && grades === undefined
    && max_attempts === undefined
    && allow_answer_pdf_download === undefined
  ) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'At least one update field is required')
  }

  if (is_timed !== undefined && typeof is_timed !== 'boolean') {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'is_timed must be boolean')
  }

  if (max_attempts !== undefined && !isValidMaxAttempts(max_attempts)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'max_attempts must be null or a positive integer')
  }

  if (allow_answer_pdf_download !== undefined && !isBooleanSetting(allow_answer_pdf_download)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'allow_answer_pdf_download must be boolean')
  }

  const parsedGrades = grades === undefined ? null : parseGrades(grades)
  if (parsedGrades?.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }

  if (
    question_asset_set_id !== undefined
    && (!Number.isInteger(question_asset_set_id) || question_asset_set_id < 1)
  ) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'question_asset_set_id must be a positive integer')
  }

  if (question_asset_set_id !== undefined && !schema) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'schema is required when activating a question asset set')
  }

  if (resolved_answer_candidate_keys !== undefined && question_asset_set_id === undefined) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'question_asset_set_id is required with answer candidate resolutions')
  }

  if (
    resolved_answer_candidate_keys !== undefined
    && (
      !Array.isArray(resolved_answer_candidate_keys)
      || resolved_answer_candidate_keys.some(key => (
        !Number.isInteger(key?.q_id)
        || key.q_id < 1
        || (key.sub_id !== null && key.sub_id !== undefined && typeof key.sub_id !== 'string')
      ))
    )
  ) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'resolved_answer_candidate_keys is invalid')
  }

  try {
    const currentExercise = await c.env.DB.prepare(
      'SELECT * FROM exercises WHERE id = ?'
    ).bind(id).first()

    if (!currentExercise) {
      return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    }

    const nextIsTimed = is_timed === undefined ? currentExercise.duration_minutes > 0 : is_timed
    let nextDuration = duration_minutes

    if (nextIsTimed) {
      if (nextDuration === undefined) {
        nextDuration = currentExercise.duration_minutes
      }
      if (typeof nextDuration !== 'number' || nextDuration <= 0) {
        return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be a positive number when is_timed is true')
      }
    } else {
      if (nextDuration !== undefined && (typeof nextDuration !== 'number' || nextDuration < 0)) {
        return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be 0 or omitted when is_timed is false')
      }
      nextDuration = 0
    }

    if (schema) {
      if (Array.isArray(schema)) {
        const currentSchema = await c.env.DB.prepare(`
          select q_id, section_key, section_title, local_number, sub_id, type, correct_answer,
            max_score_hundredths
          from answer_schemas
          where exercise_id = ?
        `).bind(id).all()
        const currentByKey = new Map(currentSchema.results.map(row => [
          `${row.q_id}:${row.sub_id ?? ''}`,
          row,
        ]))
        schema = schema.map(item => {
          const current = currentByKey.get(`${item.q_id}:${item.sub_id ?? ''}`)
          if (!current) return item
          return {
            ...item,
            section_key: Object.hasOwn(item, 'section_key') ? item.section_key : current.section_key,
            section_title: Object.hasOwn(item, 'section_title') ? item.section_title : current.section_title,
            local_number: Object.hasOwn(item, 'local_number') ? item.local_number : current.local_number,
            max_score_hundredths: Object.hasOwn(item, 'max_score_hundredths')
              ? item.max_score_hundredths
              : current.max_score_hundredths,
          }
        })
      }
      const schemaError = validateSchemaItems(schema)
      if (schemaError) {
        return jsonError(c, 400, 'INVALID_SCHEMA', schemaError)
      }
    }

    let shouldReplaceSchema = Boolean(schema)
    if (schema && question_asset_set_id === undefined && currentExercise.active_question_asset_set_id) {
      const currentSchema = await c.env.DB.prepare(`
        select q_id, section_key, section_title, local_number, sub_id, type, correct_answer,
          max_score_hundredths
        from answer_schemas
        where exercise_id = ?
      `).bind(id).all()
      shouldReplaceSchema = !schemasMatch(schema, currentSchema.results)

      if (shouldReplaceSchema) {
        return jsonError(
          c,
          409,
          'ACTIVE_ASSET_SET_REQUIRES_REPLACEMENT',
          'Activate a replacement question asset set to change this exercise schema',
        )
      }
    }

    let allocationChanged = false
    if (schema) {
      const currentAllocation = await c.env.DB.prepare(`
        select q_id, sub_id, max_score_hundredths
        from answer_schemas
        where exercise_id = ?
      `).bind(id).all()
      allocationChanged = !allocationsMatch(schema, currentAllocation.results)
      if (allocationChanged) {
        const legacySubmission = await c.env.DB.prepare(`
          select 1 from submissions
          where exercise_id = ? and question_asset_set_id is null
          limit 1
        `).bind(id).first()
        if (legacySubmission) {
          return jsonError(
            c,
            409,
            'LEGACY_SUBMISSIONS_REQUIRE_PINNING',
            'Pin legacy submissions before changing score allocation',
          )
        }
      }
    }

    let activation = null
    if (question_asset_set_id !== undefined) {
      activation = await validateQuestionAssetSetForActivation(c.env, {
        exerciseId: Number(id),
        setId: question_asset_set_id,
        schemaRows: schema,
        resolvedAnswerCandidateKeys: resolved_answer_candidate_keys || [],
      })

      if (activation.error) {
        return jsonError(c, 409, 'ASSET_SET_NOT_READY', activation.error)
      }
    }

    // Build all statements and execute in one atomic batch
    const batchStmts = []

    const updates = []
    const params = []

    if (title) {
      updates.push('title = ?')
      params.push(title)
    }
    if (duration_minutes !== undefined || is_timed !== undefined) {
      updates.push('duration_minutes = ?')
      params.push(nextDuration)
    }
    if (max_attempts !== undefined) {
      updates.push('max_attempts = ?')
      params.push(max_attempts)
    }
    if (allow_answer_pdf_download !== undefined) {
      updates.push('allow_answer_pdf_download = ?')
      params.push(allow_answer_pdf_download ? 1 : 0)
    }
    if (updates.length > 0) {
      params.push(id)
      batchStmts.push(
        c.env.DB.prepare(
          `UPDATE exercises SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(...params)
      )
    }

    if (shouldReplaceSchema && question_asset_set_id === undefined) {
      batchStmts.push(c.env.DB.prepare('DELETE FROM answer_schemas WHERE exercise_id = ?').bind(id))
      for (const item of schema) {
        const identity = questionIdentity(item)
        batchStmts.push(
          c.env.DB.prepare(`
            INSERT INTO answer_schemas (
              exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
              , max_score_hundredths
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            item.q_id,
            identity.sectionKey,
            identity.sectionTitle,
            identity.localNumber,
            item.sub_id ?? null,
            item.type,
            item.correct_answer,
            item.max_score_hundredths ?? null,
          )
        )
      }
    }

    if (parsedGrades) {
      batchStmts.push(c.env.DB.prepare(
        'DELETE FROM exercise_grades WHERE exercise_id = ?',
      ).bind(id))
      for (const grade of parsedGrades.grades) {
        batchStmts.push(c.env.DB.prepare(`
          INSERT INTO exercise_grades (exercise_id, grade)
          VALUES (?, ?)
        `).bind(id, grade))
      }
    }

    if (activation) {
      const authUser = c.get('authUser')
      const confirmedAt = new Date().toISOString()
      const proposedSchemaJson = JSON.stringify(schema.map((item) => {
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
      }))
      const resolvedKeys = resolved_answer_candidate_keys || []
      const resolvedKeysJson = JSON.stringify(resolvedKeys.map(key => ({
        q_id: key.q_id,
        sub_id: key.sub_id ?? null,
      })))

      batchStmts.push(c.env.DB.prepare('delete from answer_schemas where exercise_id = ?').bind(id))
      batchStmts.push(c.env.DB.prepare(`
        with
          proposed_schema (
            q_id, section_key, section_title, local_number, sub_id, type, correct_answer
            , max_score_hundredths
          ) as (
            select
              cast(json_extract(value, '$.q_id') as integer),
              json_extract(value, '$.section_key'),
              json_extract(value, '$.section_title'),
              cast(json_extract(value, '$.local_number') as integer),
              json_extract(value, '$.sub_id'),
              json_extract(value, '$.type'),
              json_extract(value, '$.correct_answer')
              , cast(json_extract(value, '$.max_score_hundredths') as integer)
            from json_each(?)
          )
          , resolved (q_id, sub_id) as (
            select
              cast(json_extract(value, '$.q_id') as integer),
              json_extract(value, '$.sub_id')
            from json_each(?)
          )
        update exercise_question_asset_sets as s
        set confirmed_by = ?, confirmed_at = ?
        where s.id = ?
          and s.exercise_id = ?
          and s.confirmed_at is null
          and s.source_file_id = (
            select ef.id
            from exercise_files ef
            where ef.exercise_id = ? and ef.file_type = 'exercise_pdf'
            order by ef.uploaded_at desc, ef.id desc
            limit 1
          )
          and s.answer_source_file_id is (
            select ef.id
            from exercise_files ef
            where ef.exercise_id = ? and ef.file_type = 'solution_pdf'
            order by ef.uploaded_at desc, ef.id desc
            limit 1
          )
          and s.detection_method <> 'vision'
          and (
            ? = 0
            or not exists (
              select 1 from submissions legacy_submission
              where legacy_submission.exercise_id = s.exercise_id
                and legacy_submission.question_asset_set_id is null
            )
          )
          and not exists (
            select 1
            from proposed_schema proposed
            left join exercise_question_answer_schemas pinned
              on pinned.asset_set_id = s.id
              and pinned.q_id = proposed.q_id
              and coalesce(pinned.sub_id, '') = coalesce(proposed.sub_id, '')
            where pinned.id is null
              or pinned.section_key <> proposed.section_key
              or pinned.section_title is not proposed.section_title
              or pinned.local_number <> proposed.local_number
              or pinned.type <> proposed.type
          )
          and not exists (
            select 1
            from exercise_question_answer_schemas pinned
            left join proposed_schema proposed
              on proposed.q_id = pinned.q_id
              and coalesce(proposed.sub_id, '') = coalesce(pinned.sub_id, '')
            where pinned.asset_set_id = s.id and proposed.q_id is null
          )
          and (
            select count(distinct a.q_id)
            from exercise_question_assets a
            where a.asset_set_id = s.id
          ) = (select count(distinct q_id) from proposed_schema)
          and not exists (
            select 1
            from exercise_question_assets a
            where a.asset_set_id = s.id
              and (
                a.rejected_at is not null
                or (a.source_kind = 'pdf_crop' and a.confidence < ?)
                or a.q_id not in (select distinct q_id from proposed_schema)
              )
          )
          and not exists (
            select 1
            from exercise_question_assets a
            where a.asset_set_id = s.id
              and a.segment_index <> (
                select count(*)
                from exercise_question_assets earlier
                where earlier.asset_set_id = a.asset_set_id
                  and earlier.q_id = a.q_id
                  and earlier.segment_index < a.segment_index
              )
          )
          and not exists (
            select 1
            from exercise_question_answer_candidates candidate
            left join proposed_schema proposed
              on proposed.q_id = candidate.q_id
              and coalesce(proposed.sub_id, '') = coalesce(candidate.sub_id, '')
            where candidate.asset_set_id = s.id
              and (
                proposed.q_id is null
                or proposed.type <> candidate.type
                or (
                  candidate.type = 'numeric'
                  and cast(proposed.correct_answer as real) <> cast(candidate.proposed_answer as real)
                )
                or (
                  candidate.type = 'mcq'
                  and upper(trim(proposed.correct_answer)) <> upper(trim(candidate.proposed_answer))
                )
                or (
                  candidate.type = 'boolean'
                  and trim(proposed.correct_answer) <> trim(candidate.proposed_answer)
                )
              )
              and not exists (
                select 1
                from resolved
                where resolved.q_id = candidate.q_id
                  and coalesce(resolved.sub_id, '') = coalesce(candidate.sub_id, '')
              )
          )
      `).bind(
        proposedSchemaJson,
        resolvedKeysJson,
        authUser.id,
        confirmedAt,
        question_asset_set_id,
        id,
        id,
        id,
        allocationChanged ? 1 : 0,
        MIN_QUESTION_ASSET_CONFIDENCE,
      ))

      batchStmts.push(c.env.DB.prepare(`
        insert into exercise_question_answer_schemas (
          asset_set_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        )
        select null, 1, 'main', null, 1, null, 'mcq', '' where changes() <> 1
      `))

      for (const item of schema) {
        batchStmts.push(c.env.DB.prepare(`
          update exercise_question_answer_schemas
          set correct_answer = ?, max_score_hundredths = ?
          where asset_set_id = ? and q_id = ? and coalesce(sub_id, '') = coalesce(?, '')
        `).bind(
          item.correct_answer,
          item.max_score_hundredths ?? null,
          question_asset_set_id,
          item.q_id,
          item.sub_id ?? null,
        ))
      }

      for (const item of schema) {
        const identity = questionIdentity(item)
        batchStmts.push(c.env.DB.prepare(`
          insert into answer_schemas (
            exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
            , max_score_hundredths
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          item.q_id,
          identity.sectionKey,
          identity.sectionTitle,
          identity.localNumber,
          item.sub_id ?? null,
          item.type,
          item.correct_answer,
          item.max_score_hundredths ?? null,
        ))
      }

      batchStmts.push(c.env.DB.prepare(`
        update exercises
        set active_question_asset_set_id = ?, updated_at = current_timestamp
        where id = ?
      `).bind(question_asset_set_id, id))
    }

    if (batchStmts.length > 0) {
      let batchResults
      try {
        batchResults = await c.env.DB.batch(batchStmts)
      } catch (error) {
        if (activation) {
          console.error('Question asset activation error:', error)
          return jsonError(c, 409, 'ASSET_SET_NOT_READY', 'Question asset set changed before activation')
        }
        throw error
      }
      // If we had a metadata update, check it actually updated a row
      if (updates.length > 0 && batchResults[0].meta.changes === 0) {
        return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
      }
    }

    const exercise = await c.env.DB.prepare(
      'SELECT * FROM exercises WHERE id = ?'
    ).bind(id).first()

    const files = await c.env.DB.prepare(
      'SELECT * FROM exercise_files WHERE exercise_id = ? ORDER BY uploaded_at DESC'
    ).bind(id).all()

    const schemaResult = await c.env.DB.prepare(
      `SELECT q_id, section_key, section_title, local_number, sub_id, type, correct_answer,
         max_score_hundredths
       FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC, sub_id ASC`
    ).bind(id).all()
    const gradeResult = await c.env.DB.prepare(`
      SELECT grade
      FROM exercise_grades
      WHERE exercise_id = ?
      ORDER BY grade
    `).bind(id).all()
    const highestAttempt = await c.env.DB.prepare(`
      SELECT COALESCE(MAX(attempt_number), 0) AS highest_attempt_number
      FROM submissions
      WHERE exercise_id = ?
    `).bind(id).first()

    return jsonSuccess(c, {
      ...toExerciseWithTiming(exercise),
      highest_attempt_number: highestAttempt.highest_attempt_number,
      files: files.results,
      grades: gradeResult.results.map((row) => row.grade),
      schema: schemaResult.results,
    })
  } catch (error) {
    console.error('Exercise update error:', error)
    return jsonError(c, 500, 'DATABASE_ERROR', 'Failed to update exercise')
  }
})

// Delete exercise (teacher only)
exercisesRoutes.delete('/:id', requireAuth, requireRole('teacher'), async (c) => {
  const id = c.req.param('id')

  const questionAssets = await c.env.DB.prepare(`
    select question_asset.r2_key
    from exercise_question_assets question_asset
    join exercise_question_asset_sets asset_set on asset_set.id = question_asset.asset_set_id
    where asset_set.exercise_id = ?
  `).bind(id).all()

  const results = await c.env.DB.batch([
    c.env.DB.prepare('PRAGMA foreign_keys = ON'),
    c.env.DB.prepare('DELETE FROM exercises WHERE id = ?').bind(id),
  ])

  if (results[1].meta.changes === 0) {
    return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
  }

  await Promise.allSettled(
    questionAssets.results.map((asset) => c.env.BUCKET.delete(asset.r2_key)),
  )

  return jsonSuccess(c, { deleted: true })
})

export default exercisesRoutes

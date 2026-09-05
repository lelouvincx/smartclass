import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import {
  buildConfidence,
  buildWarnings,
  normalizeSchemaRows,
  parseModelSchemaContent,
  validateSchemaRows,
} from '../lib/schema-parser.js'
import { requestSchemaFromDeepSeek } from '../lib/deepseek.js'
import { isValidExtractModel } from '../lib/extract-models.js'
import { attachGrades, parseGrades } from '../lib/grades.js'
import {
  MIN_QUESTION_ASSET_CONFIDENCE,
  toQuestionAssetResponse,
  validateQuestionAssetSetForActivation,
} from '../lib/question-assets.js'

const exercisesRoutes = new Hono()
const MIN_ANSWER_CONFIDENCE = 0.75

function toExerciseWithTiming(exercise) {
  if (!exercise) {
    return exercise
  }

  return {
    ...exercise,
    is_timed: exercise.duration_minutes > 0 ? 1 : 0,
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
  return errors.length > 0 ? errors[0] : null
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
  const body = await c.req.json().catch(() => null)
  const { source_text, expected_question_count } = body || {}

  if (!source_text || typeof source_text !== 'string') {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'source_text is required')
  }

  if (source_text.trim().length < 10) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'source_text is too short to parse')
  }

  try {
    const modelContent = await requestSchemaFromDeepSeek(
      c.env,
      source_text.slice(0, 120000),
      expected_question_count,
    )

    const rawRows = parseModelSchemaContent(modelContent)
    const parsedRows = normalizeSchemaRows(rawRows)
    const normalizedRows = parsedRows.map((row) => {
      const invalidNumericAnswer = row.type === 'numeric'
        && row.correct_answer !== ''
        && Number.isNaN(Number(row.correct_answer))

      if (invalidNumericAnswer) {
        return { ...row, correct_answer: '', confidence: 0.3 }
      }

      return row.confidence < MIN_ANSWER_CONFIDENCE
        ? { ...row, correct_answer: '' }
        : row
    })
    const errors = validateSchemaRows(normalizedRows, { allowBlankAnswers: true })

    if (errors.length > 0) {
      return jsonError(c, 422, 'INVALID_SCHEMA', errors.join('; '))
    }

    return jsonSuccess(c, {
      schema: normalizedRows,
      warnings: buildWarnings(normalizedRows, MIN_ANSWER_CONFIDENCE),
      confidence: buildConfidence(normalizedRows, MIN_ANSWER_CONFIDENCE),
    })
  } catch (error) {
    console.error('Schema parse error:', error)
    return jsonError(c, 500, 'PARSE_ERROR', error.message || 'Failed to parse schema')
  }
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
          ORDER BY active_submission.started_at DESC, active_submission.id DESC
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
    ? await statement.bind(authUser.id, authUser.id).all()
    : await statement.all()
  const gradeResult = await c.env.DB.prepare(`
    SELECT exercise_id, grade
    FROM exercise_grades
    ORDER BY grade
  `).all()

  return jsonSuccess(c, attachGrades(
    exercises.results.map(toExerciseWithTiming),
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

  let inProgressSubmissionId = null
  if (authUser.role === 'student') {
    const access = await c.env.DB.prepare(`
      SELECT
        (
          SELECT submission.id
          FROM submissions submission
          WHERE submission.user_id = ?
            AND submission.exercise_id = ?
            AND submission.submitted_at IS NULL
          ORDER BY submission.started_at DESC, submission.id DESC
          LIMIT 1
        ) AS in_progress_submission_id,
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
      exercise.active_question_asset_set_id,
      id,
    ).first()
    inProgressSubmissionId = access.in_progress_submission_id
    if (!inProgressSubmissionId && !(access.has_grade_access && access.is_ready)) {
      return access.has_grade_access
        ? jsonError(c, 403, 'EXERCISE_NOT_READY', 'This exercise is not ready for students')
        : jsonError(c, 403, 'GRADE_ACCESS_DENIED', 'This exercise is not available for your grades')
    }
  }

  const files = await c.env.DB.prepare(
    'SELECT * FROM exercise_files WHERE exercise_id = ? ORDER BY uploaded_at DESC, id DESC'
  ).bind(id).all()

  const isTeacher = authUser.role === 'teacher'

  const schema = isTeacher || !exercise.active_question_asset_set_id
    ? await c.env.DB.prepare(`
        select q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        from answer_schemas
        where exercise_id = ?
        order by q_id asc, sub_id asc
      `).bind(id).all()
    : await c.env.DB.prepare(`
        select snapshot.q_id, snapshot.section_key, snapshot.section_title,
          snapshot.local_number, snapshot.sub_id, snapshot.type, snapshot.correct_answer
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
      }) => ({ q_id, section_key, section_title, local_number, sub_id, type }))

  const pendingQuestionAssetSet = isTeacher
    ? await c.env.DB.prepare(`
        select id
        from exercise_question_asset_sets
        where exercise_id = ? and confirmed_at is null
        order by created_at desc, id desc
        limit 1
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
    ...(!isTeacher ? { in_progress_submission_id: inProgressSubmissionId } : {}),
    ...(isTeacher
      ? { pending_question_asset_set_id: pendingQuestionAssetSet?.id ?? null }
      : {}),
  })
})

// Create exercise with answer schema (teacher only)
exercisesRoutes.post('/', requireAuth, requireRole('teacher'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const { title, duration_minutes, schema, is_timed = true, extract_model } = body || {}
  const parsedGrades = parseGrades(body?.grades, { defaultToAll: true })

  if (!title || schema === undefined) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Title, is_timed, and schema are required')
  }

  if (parsedGrades.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }

  if (typeof is_timed !== 'boolean') {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'is_timed must be boolean')
  }

  // extract_model is optional. null/undefined means "use server default".
  // A non-null value must be in the EXTRACT_MODELS allowlist.
  if (extract_model != null && !isValidExtractModel(extract_model)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'extract_model must be one of the allowed model ids')
  }
  const normalizedExtractModel = extract_model == null ? null : extract_model

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
      INSERT INTO exercises (title, duration_minutes, created_by, extract_model)
      VALUES (?, ?, ?, ?)
    `).bind(title, normalizedDuration, authUser.id, normalizedExtractModel).run()

    const exerciseId = exerciseResult.meta.last_row_id

    // Batch insert answer schemas (atomic) — include sub_id
    const schemaStmts = schema.map((item) => {
      const identity = questionIdentity(item)
      return c.env.DB.prepare(`
        INSERT INTO answer_schemas (
          exercise_id, q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        exerciseId,
        item.q_id,
        identity.sectionKey,
        identity.sectionTitle,
        identity.localNumber,
        item.sub_id ?? null,
        item.type,
        item.correct_answer,
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
      `SELECT q_id, section_key, section_title, local_number, sub_id, type, correct_answer
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
    extract_model,
    question_asset_set_id,
    resolved_answer_candidate_keys,
    grades,
  } = body || {}
  let schema = body?.schema

  if (
    !title
    && duration_minutes === undefined
    && !schema
    && is_timed === undefined
    && extract_model === undefined
    && question_asset_set_id === undefined
    && resolved_answer_candidate_keys === undefined
    && grades === undefined
  ) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'At least one update field is required')
  }

  if (is_timed !== undefined && typeof is_timed !== 'boolean') {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'is_timed must be boolean')
  }

  const parsedGrades = grades === undefined ? null : parseGrades(grades)
  if (parsedGrades?.error) {
    return jsonError(c, 400, 'VALIDATION_ERROR', parsedGrades.error)
  }

  // extract_model: undefined → leave alone; null → reset to default; string → must be in allowlist.
  if (extract_model !== undefined && extract_model !== null && !isValidExtractModel(extract_model)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'extract_model must be one of the allowed model ids')
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
          select q_id, section_key, section_title, local_number, sub_id, type, correct_answer
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
        select q_id, section_key, section_title, local_number, sub_id, type, correct_answer
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
    if (extract_model !== undefined) {
      updates.push('extract_model = ?')
      params.push(extract_model) // null clears it back to "use default"
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            item.q_id,
            identity.sectionKey,
            identity.sectionTitle,
            identity.localNumber,
            item.sub_id ?? null,
            item.type,
            item.correct_answer,
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
          ) as (
            select
              cast(json_extract(value, '$.q_id') as integer),
              json_extract(value, '$.section_key'),
              json_extract(value, '$.section_title'),
              cast(json_extract(value, '$.local_number') as integer),
              json_extract(value, '$.sub_id'),
              json_extract(value, '$.type'),
              json_extract(value, '$.correct_answer')
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
          set correct_answer = ?
          where asset_set_id = ? and q_id = ? and coalesce(sub_id, '') = coalesce(?, '')
        `).bind(
          item.correct_answer,
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
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          item.q_id,
          identity.sectionKey,
          identity.sectionTitle,
          identity.localNumber,
          item.sub_id ?? null,
          item.type,
          item.correct_answer,
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
      `SELECT q_id, section_key, section_title, local_number, sub_id, type, correct_answer
       FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC, sub_id ASC`
    ).bind(id).all()
    const gradeResult = await c.env.DB.prepare(`
      SELECT grade
      FROM exercise_grades
      WHERE exercise_id = ?
      ORDER BY grade
    `).bind(id).all()

    return jsonSuccess(c, {
      ...toExerciseWithTiming(exercise),
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

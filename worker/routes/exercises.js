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
import { requestSchemaFromOpenRouter } from '../lib/openrouter.js'
import { isValidExtractModel } from '../lib/extract-models.js'

const exercisesRoutes = new Hono()

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
    type: item.type ?? '',
    sub_id: item.sub_id ?? null,
    correct_answer: item.correct_answer === undefined || item.correct_answer === null
      ? ''
      : String(item.correct_answer),
  }))

  const errors = validateSchemaRows(rows)
  return errors.length > 0 ? errors[0] : null
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
    const modelContent = await requestSchemaFromOpenRouter(
      c.env,
      source_text.slice(0, 120000),
      expected_question_count,
    )

    const rawRows = parseModelSchemaContent(modelContent)
    const normalizedRows = normalizeSchemaRows(rawRows)
    const errors = validateSchemaRows(normalizedRows)

    if (errors.length > 0) {
      return jsonError(c, 422, 'INVALID_SCHEMA', errors.join('; '))
    }

    return jsonSuccess(c, {
      schema: normalizedRows,
      warnings: buildWarnings(normalizedRows, 0.75),
      confidence: buildConfidence(normalizedRows, 0.75),
    })
  } catch (error) {
    console.error('Schema parse error:', error)
    return jsonError(c, 500, 'PARSE_ERROR', error.message || 'Failed to parse schema')
  }
})

// List all exercises (public)
exercisesRoutes.get('/', async (c) => {
  const exercises = await c.env.DB.prepare(`
    SELECT 
      e.*,
      COUNT(DISTINCT ef.id) as file_count,
      COUNT(DISTINCT ans.q_id) as question_count
    FROM exercises e
    LEFT JOIN exercise_files ef ON e.id = ef.exercise_id
    LEFT JOIN answer_schemas ans ON e.id = ans.exercise_id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).all()

  return jsonSuccess(c, exercises.results.map(toExerciseWithTiming))
})

// Get exercise detail with files and schema (public)
exercisesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const exercise = await c.env.DB.prepare(
    'SELECT * FROM exercises WHERE id = ?'
  ).bind(id).first()

  if (!exercise) {
    return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
  }

  const files = await c.env.DB.prepare(
    'SELECT * FROM exercise_files WHERE exercise_id = ? ORDER BY uploaded_at DESC'
  ).bind(id).all()

  // Include sub_id in schema fetch
  const schema = await c.env.DB.prepare(
    'SELECT q_id, sub_id, type, correct_answer FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC, sub_id ASC'
  ).bind(id).all()

  // Determine if requester is a teacher (optional auth)
  let isTeacher = false
  const authorization = c.req.header('Authorization') || ''
  if (authorization.startsWith('Bearer ') && c.env.JWT_SECRET) {
    const token = authorization.slice(7)
    try {
      const { verifyAccessToken } = await import('../lib/auth.js')
      const payload = await verifyAccessToken(token, c.env)
      isTeacher = payload.role === 'teacher'
    } catch {
      isTeacher = false
    }
  }

  // Strip correct_answer from schema for non-teachers
  const sanitizedSchema = isTeacher
    ? schema.results
    : schema.results.map(({ q_id, sub_id, type }) => ({ q_id, sub_id, type }))

  return jsonSuccess(c, {
    ...toExerciseWithTiming(exercise),
    files: files.results,
    schema: sanitizedSchema,
  })
})

// Create exercise with answer schema (teacher only)
exercisesRoutes.post('/', requireAuth, requireRole('teacher'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const { title, duration_minutes, schema, is_timed = true, extract_model } = body || {}

  if (!title || schema === undefined) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Title, is_timed, and schema are required')
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
    const schemaStmts = schema.map((item) =>
      c.env.DB.prepare(`
        INSERT INTO answer_schemas (exercise_id, q_id, sub_id, type, correct_answer)
        VALUES (?, ?, ?, ?, ?)
      `).bind(exerciseId, item.q_id, item.sub_id ?? null, item.type, item.correct_answer)
    )

    try {
      await c.env.DB.batch(schemaStmts)
    } catch (schemaError) {
      // Compensating delete: remove orphan exercise row
      await c.env.DB.prepare('DELETE FROM exercises WHERE id = ?').bind(exerciseId).run()
      throw schemaError
    }

    const created = await c.env.DB.prepare(
      'SELECT * FROM exercises WHERE id = ?'
    ).bind(exerciseId).first()

    const schemaResult = await c.env.DB.prepare(
      'SELECT q_id, sub_id, type, correct_answer FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC, sub_id ASC'
    ).bind(exerciseId).all()

    return jsonSuccess(c, {
      ...toExerciseWithTiming(created),
      files: [],
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
  const { title, duration_minutes, schema, is_timed, extract_model } = body || {}

  if (!title && duration_minutes === undefined && !schema && is_timed === undefined && extract_model === undefined) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'At least one field (title, is_timed, duration_minutes, schema, or extract_model) is required')
  }

  if (is_timed !== undefined && typeof is_timed !== 'boolean') {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'is_timed must be boolean')
  }

  // extract_model: undefined → leave alone; null → reset to default; string → must be in allowlist.
  if (extract_model !== undefined && extract_model !== null && !isValidExtractModel(extract_model)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'extract_model must be one of the allowed model ids')
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
      const schemaError = validateSchemaItems(schema)
      if (schemaError) {
        return jsonError(c, 400, 'INVALID_SCHEMA', schemaError)
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

    if (schema) {
      batchStmts.push(c.env.DB.prepare('DELETE FROM answer_schemas WHERE exercise_id = ?').bind(id))
      for (const item of schema) {
        batchStmts.push(
          c.env.DB.prepare(`
            INSERT INTO answer_schemas (exercise_id, q_id, sub_id, type, correct_answer)
            VALUES (?, ?, ?, ?, ?)
          `).bind(id, item.q_id, item.sub_id ?? null, item.type, item.correct_answer)
        )
      }
    }

    if (batchStmts.length > 0) {
      const batchResults = await c.env.DB.batch(batchStmts)
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
      'SELECT q_id, sub_id, type, correct_answer FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC, sub_id ASC'
    ).bind(id).all()

    return jsonSuccess(c, {
      ...toExerciseWithTiming(exercise),
      files: files.results,
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

  const results = await c.env.DB.batch([
    c.env.DB.prepare('PRAGMA foreign_keys = ON'),
    c.env.DB.prepare('DELETE FROM exercises WHERE id = ?').bind(id),
  ])

  if (results[1].meta.changes === 0) {
    return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
  }

  return jsonSuccess(c, { deleted: true })
})

export default exercisesRoutes

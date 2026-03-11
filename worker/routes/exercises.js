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

const exercisesRoutes = new Hono()

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
      COUNT(DISTINCT ans.id) as question_count
    FROM exercises e
    LEFT JOIN exercise_files ef ON e.id = ef.exercise_id
    LEFT JOIN answer_schemas ans ON e.id = ans.exercise_id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).all()

  return jsonSuccess(c, exercises.results)
})

// Get exercise detail with files and schema (public)
exercisesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  // Get exercise
  const exercise = await c.env.DB.prepare(
    'SELECT * FROM exercises WHERE id = ?'
  ).bind(id).first()

  if (!exercise) {
    return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
  }

  // Get files
  const files = await c.env.DB.prepare(
    'SELECT * FROM exercise_files WHERE exercise_id = ? ORDER BY uploaded_at DESC'
  ).bind(id).all()

  // Get answer schema
  const schema = await c.env.DB.prepare(
    'SELECT q_id, type, correct_answer FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC'
  ).bind(id).all()

  return jsonSuccess(c, {
    ...exercise,
    files: files.results,
    schema: schema.results,
  })
})

// Create exercise with answer schema (teacher only)
exercisesRoutes.post('/', requireAuth, requireRole('teacher'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const { title, duration_minutes, schema } = body || {}

  // Validation
  if (!title || duration_minutes === undefined || schema === undefined) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'Title, duration_minutes, and schema are required')
  }

  if (typeof duration_minutes !== 'number' || duration_minutes <= 0) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be a positive number')
  }

  if (!Array.isArray(schema) || schema.length === 0) {
    return jsonError(c, 400, 'INVALID_SCHEMA', 'Schema must be a non-empty array')
  }

  // Validate each schema item
  const validTypes = new Set(['mcq', 'boolean', 'numeric'])
  for (const item of schema) {
    if (!item.q_id || !item.type || item.correct_answer === undefined || item.correct_answer === null || item.correct_answer === '') {
      return jsonError(c, 400, 'INVALID_SCHEMA', 'Each schema item must have q_id, type, and correct_answer')
    }
    if (!validTypes.has(item.type)) {
      return jsonError(c, 400, 'INVALID_SCHEMA', `Invalid type: ${item.type}. Must be mcq, boolean, or numeric`)
    }
  }

  const authUser = c.get('authUser')

  // Transaction: Insert exercise + answer schemas
  try {
    // Insert exercise
    const exerciseResult = await c.env.DB.prepare(`
      INSERT INTO exercises (title, duration_minutes, created_by)
      VALUES (?, ?, ?)
    `).bind(title, duration_minutes, authUser.id).run()

    const exerciseId = exerciseResult.meta.last_row_id

    // Batch insert answer schemas (atomic)
    const schemaStmts = schema.map((item) =>
      c.env.DB.prepare(`
        INSERT INTO answer_schemas (exercise_id, q_id, type, correct_answer)
        VALUES (?, ?, ?, ?)
      `).bind(exerciseId, item.q_id, item.type, item.correct_answer)
    )
    await c.env.DB.batch(schemaStmts)

    // Return created exercise with schema
    const created = await c.env.DB.prepare(
      'SELECT * FROM exercises WHERE id = ?'
    ).bind(exerciseId).first()

    const schemaResult = await c.env.DB.prepare(
      'SELECT q_id, type, correct_answer FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC'
    ).bind(exerciseId).all()

    return jsonSuccess(c, {
      ...created,
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
  const { title, duration_minutes, schema } = body || {}

  if (!title && duration_minutes === undefined && !schema) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'At least one field (title, duration_minutes, or schema) is required')
  }

  if (duration_minutes !== undefined && (typeof duration_minutes !== 'number' || duration_minutes <= 0)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'duration_minutes must be a positive number')
  }

  try {
    // Update exercise metadata
    const updates = []
    const params = []

    if (title) {
      updates.push('title = ?')
      params.push(title)
    }
    if (duration_minutes !== undefined) {
      updates.push('duration_minutes = ?')
      params.push(duration_minutes)
    }

    if (updates.length > 0) {
      params.push(id)
      const result = await c.env.DB.prepare(
        `UPDATE exercises SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(...params).run()

      if (result.meta.changes === 0) {
        return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
      }
    }

    // Update schema if provided
    if (schema) {
      if (!Array.isArray(schema) || schema.length === 0) {
        return jsonError(c, 400, 'INVALID_SCHEMA', 'Schema must be a non-empty array')
      }

      // Validate schema
      const validTypes = new Set(['mcq', 'boolean', 'numeric'])
      for (const item of schema) {
        if (!item.q_id || !item.type || item.correct_answer === undefined || item.correct_answer === null || item.correct_answer === '') {
          return jsonError(c, 400, 'INVALID_SCHEMA', 'Each schema item must have q_id, type, and correct_answer')
        }
        if (!validTypes.has(item.type)) {
          return jsonError(c, 400, 'INVALID_SCHEMA', `Invalid type: ${item.type}. Must be mcq, boolean, or numeric`)
        }
      }

      // Batch delete old + insert new schema (atomic)
      const deleteStmt = c.env.DB.prepare('DELETE FROM answer_schemas WHERE exercise_id = ?').bind(id)
      const insertStmts = schema.map((item) =>
        c.env.DB.prepare(`
          INSERT INTO answer_schemas (exercise_id, q_id, type, correct_answer)
          VALUES (?, ?, ?, ?)
        `).bind(id, item.q_id, item.type, item.correct_answer)
      )
      await c.env.DB.batch([deleteStmt, ...insertStmts])
    }

    // Return updated exercise
    const exercise = await c.env.DB.prepare(
      'SELECT * FROM exercises WHERE id = ?'
    ).bind(id).first()

    const files = await c.env.DB.prepare(
      'SELECT * FROM exercise_files WHERE exercise_id = ? ORDER BY uploaded_at DESC'
    ).bind(id).all()

    const schemaResult = await c.env.DB.prepare(
      'SELECT q_id, type, correct_answer FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC'
    ).bind(id).all()

    return jsonSuccess(c, {
      ...exercise,
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

  // Enable foreign keys so ON DELETE CASCADE fires
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

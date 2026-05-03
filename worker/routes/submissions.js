import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { gradeSubmission } from '../lib/grading.js'
import { resolveModel } from '../lib/extract-models.js'
import { requestAnswersFromImage } from '../lib/openrouter.js'
import { validateExtractedAnswers, ExtractParseError } from '../lib/extract-validator.js'

const submissionsRoutes = new Hono()

const MAX_IMAGE_BYTES = 20 * 1024 * 1024 // 20 MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png'])

// List submissions for authenticated user
submissionsRoutes.get('/', requireAuth, async (c) => {
  const authUser = c.get('authUser')

  // Parse query params
  const exerciseIdParam = c.req.query('exercise_id')
  const limitParam = c.req.query('limit')
  const offsetParam = c.req.query('offset')

  const exerciseId = exerciseIdParam ? parseInt(exerciseIdParam, 10) : null
  let limit = limitParam ? parseInt(limitParam, 10) : 50
  let offset = offsetParam ? parseInt(offsetParam, 10) : 0

  // Validate params
  if (limit < 0 || limit > 100) limit = 50
  if (offset < 0) offset = 0

  // Build WHERE clause
  const whereClauses = ['s.user_id = ?', 's.submitted_at IS NOT NULL']
  const bindings = [authUser.id]

  if (exerciseId) {
    whereClauses.push('s.exercise_id = ?')
    bindings.push(exerciseId)
  }

  const whereClause = whereClauses.join(' AND ')

  // Fetch submissions with pagination
  const submissions = await c.env.DB.prepare(`
    SELECT
      s.id,
      s.exercise_id,
      e.title AS exercise_title,
      s.mode,
      s.score,
      s.total_questions,
      s.started_at,
      s.submitted_at
    FROM submissions s
    JOIN exercises e ON e.id = s.exercise_id
    WHERE ${whereClause}
    ORDER BY s.submitted_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all()

  // Get total count
  const totalResult = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM submissions s
    WHERE ${whereClause}
  `).bind(...bindings).first()

  return jsonSuccess(c, {
    submissions: submissions.results,
    total: totalResult.total,
  })
})

// Create a new submission (start an exercise attempt)
submissionsRoutes.post('/', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const { exercise_id } = body || {}

  if (!exercise_id) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'exercise_id is required')
  }

  const authUser = c.get('authUser')

  const exercise = await c.env.DB.prepare(
    'SELECT id, duration_minutes FROM exercises WHERE id = ?'
  ).bind(exercise_id).first()

  if (!exercise) {
    return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
  }

  // Count distinct q_ids as total_questions (boolean has 4 sub-rows per q_id)
  const schemaCount = await c.env.DB.prepare(
    'SELECT COUNT(DISTINCT q_id) as count FROM answer_schemas WHERE exercise_id = ?'
  ).bind(exercise_id).first()

  const totalQuestions = schemaCount.count

  const mode = exercise.duration_minutes > 0 ? 'timed' : 'untimed'

  const result = await c.env.DB.prepare(`
    INSERT INTO submissions (exercise_id, user_id, mode, total_questions, started_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(exercise_id, authUser.id, mode, totalQuestions).run()

  const submissionId = result.meta.last_row_id

  const submission = await c.env.DB.prepare(
    'SELECT id, exercise_id, user_id, mode, total_questions, started_at, submitted_at FROM submissions WHERE id = ?'
  ).bind(submissionId).first()

  return c.json({
    success: true,
    data: submission,
  }, 201)
})

// Submit answers for a submission
submissionsRoutes.put('/:id/submit', requireAuth, async (c) => {
  try {
    const submissionId = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    const { answers } = body || {}

    if (!Array.isArray(answers)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'answers must be an array')
    }

    const authUser = c.get('authUser')

    const submission = await c.env.DB.prepare(
      'SELECT id, exercise_id, user_id, submitted_at, total_questions FROM submissions WHERE id = ?'
    ).bind(submissionId).first()

    if (!submission) {
      return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
    }

    if (submission.user_id !== authUser.id) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
    }

    if (submission.submitted_at) {
      return jsonError(c, 400, 'ALREADY_SUBMITTED', 'This submission has already been submitted')
    }

    // ── Fetch schema first — needed for both validation and grading ──────────
    const schemaRows = await c.env.DB.prepare(
      'SELECT q_id, sub_id, type, correct_answer FROM answer_schemas WHERE exercise_id = ? ORDER BY q_id ASC, sub_id ASC'
    ).bind(submission.exercise_id).all()

    // Build set of valid (q_id, sub_id) pairs from schema
    const validKeys = new Set()
    for (const row of schemaRows.results) {
      const key = row.sub_id !== null ? `${row.q_id}:${row.sub_id}` : `${row.q_id}:`
      validKeys.add(key)
    }

    // Validate answer entries against actual schema keys
    const seenKeys = new Set()

    for (const entry of answers) {
      const qId = entry.q_id
      if (!Number.isInteger(qId) || qId < 1) {
        return jsonError(c, 400, 'VALIDATION_ERROR', `Invalid q_id: ${qId}. Must be a positive integer`)
      }

      const subId = entry.sub_id ?? null
      const key = subId !== null ? `${qId}:${subId}` : `${qId}:`

      if (!validKeys.has(key)) {
        return jsonError(c, 400, 'VALIDATION_ERROR', `Invalid q_id: ${qId}${subId ? ` sub_id=${subId}` : ''}. Not found in exercise schema`)
      }

      if (seenKeys.has(key)) {
        return jsonError(c, 400, 'VALIDATION_ERROR', `Duplicate answer entry for q_id=${qId}${subId ? ` sub_id=${subId}` : ''}`)
      }
      seenKeys.add(key)
    }

    // ── Auto-grading (compute in-memory before any DB writes) ────────────────
    // Grade all submitted answers in-memory, then insert answers with
    // is_correct pre-populated, set score + submitted_at in a single
    // atomic DB.batch().

    const { gradedAnswers, score } = gradeSubmission(
      schemaRows.results,
      answers.map((a) => ({ q_id: a.q_id, sub_id: a.sub_id ?? null, submitted_answer: a.submitted_answer })),
    )

    // Build lookup: (q_id, sub_id) → is_correct
    const gradedMap = new Map()
    for (const ga of gradedAnswers) {
      gradedMap.set(`${ga.q_id}:${ga.sub_id ?? ''}`, ga.is_correct)
    }

    // Insert answers with is_correct already set
    const insertStatements = answers.map(({ q_id, sub_id, submitted_answer }) => {
      const key = `${q_id}:${sub_id ?? ''}`
      const is_correct = gradedMap.get(key) ?? 0
      return c.env.DB.prepare(`
        INSERT INTO submission_answers (submission_id, q_id, sub_id, submitted_answer, is_correct)
        VALUES (?, ?, ?, ?, ?)
      `).bind(submissionId, q_id, sub_id ?? null, submitted_answer, is_correct)
    })

    // Atomic: insert answers + set submitted_at + set score in one batch
    const updateStatement = c.env.DB.prepare(`
      UPDATE submissions
      SET submitted_at = datetime('now'), score = ?
      WHERE id = ? AND submitted_at IS NULL
    `).bind(score, submissionId)

    const batchResults = await c.env.DB.batch([...insertStatements, updateStatement])

    const updateResult = batchResults[batchResults.length - 1]
    if (updateResult.meta.changes === 0) {
      return jsonError(c, 400, 'ALREADY_SUBMITTED', 'This submission has already been submitted')
    }
    // ── End auto-grading ───────────────────────────────────────────────────────

    const updatedSubmission = await c.env.DB.prepare(
      'SELECT id, exercise_id, user_id, mode, total_questions, started_at, submitted_at, score FROM submissions WHERE id = ?'
    ).bind(submissionId).first()

    const submittedAnswers = await c.env.DB.prepare(
      'SELECT id, q_id, sub_id, submitted_answer, is_correct FROM submission_answers WHERE submission_id = ? ORDER BY q_id ASC, sub_id ASC'
    ).bind(submissionId).all()

    return jsonSuccess(c, {
      ...updatedSubmission,
      answers: submittedAnswers.results,
    })
  } catch (error) {
    console.error('Submit answers error:', error)
    return jsonError(c, 500, 'INTERNAL_ERROR', error.message || 'Failed to submit answers')
  }
})

// Get submission with enriched answers (includes type, correct_answer when submitted)
submissionsRoutes.get('/:id', requireAuth, async (c) => {
  try {
    const submissionId = c.req.param('id')
    const authUser = c.get('authUser')

    // Fetch submission + exercise title in one query
    const submission = await c.env.DB.prepare(`
      SELECT
        s.id, s.exercise_id, s.user_id, s.mode, s.total_questions,
        s.started_at, s.submitted_at, s.score,
        e.title AS exercise_title
      FROM submissions s
      JOIN exercises e ON e.id = s.exercise_id
      WHERE s.id = ?
    `).bind(submissionId).first()

    if (!submission) {
      return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
    }

    if (submission.user_id !== authUser.id) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
    }

    const isSubmitted = submission.submitted_at !== null

    // Schema-first left join: guarantees every schema question appears in the response
    // even if submission_answers is missing rows (legacy data, partial payloads, skipped Qs)
    const answersResult = await c.env.DB.prepare(`
      SELECT
        a.q_id,
        a.sub_id,
        a.type,
        a.correct_answer,
        sa.submitted_answer,
        COALESCE(sa.is_correct, 0) AS is_correct
      FROM answer_schemas a
      LEFT JOIN submission_answers sa
        ON sa.submission_id = ?
        AND sa.q_id = a.q_id
        AND COALESCE(sa.sub_id, '') = COALESCE(a.sub_id, '')
      WHERE a.exercise_id = ?
      ORDER BY a.q_id ASC, a.sub_id ASC
    `).bind(submissionId, submission.exercise_id).all()

    // Strip correct_answer for in-progress (unsubmitted) submissions
    const answers = answersResult.results.map((row) => {
      if (!isSubmitted) {
        const { correct_answer: _stripped, ...rest } = row
        return rest
      }
      return row
    })

    // Fetch exercise files (exercise_pdf and others for teachers)
    const filesResult = await c.env.DB.prepare(
      'SELECT id, file_type, file_name FROM exercise_files WHERE exercise_id = ? ORDER BY uploaded_at DESC'
    ).bind(submission.exercise_id).all()

    // Remove internal fields before returning
    const { user_id: _uid, ...submissionData } = submission

    return jsonSuccess(c, {
      ...submissionData,
      files: filesResult.results,
      answers,
    })
  } catch (error) {
    console.error('Get submission error:', error)
    return jsonError(c, 500, 'INTERNAL_ERROR', error.message || 'Failed to get submission')
  }
})

// Upload an answer-sheet image and extract answers via vision LLM (v0.4).
// PR A: scaffold only — performs upload + persistence; LLM extraction stubbed.
submissionsRoutes.post('/:id/extract', requireAuth, async (c) => {
  try {
    const submissionId = c.req.param('id')
    const authUser = c.get('authUser')

    // ── Ownership + state check ──────────────────────────────────────────────
    const submission = await c.env.DB.prepare(
      'SELECT id, user_id, submitted_at FROM submissions WHERE id = ?'
    ).bind(submissionId).first()

    if (!submission) {
      return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
    }

    if (submission.user_id !== authUser.id) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
    }

    if (submission.submitted_at) {
      return jsonError(c, 409, 'ALREADY_SUBMITTED', 'This submission has already been submitted')
    }

    // ── Size pre-check via Content-Length (cheap, before parsing body) ──────
    const contentLength = parseInt(c.req.header('content-length') || '0', 10)
    if (contentLength > MAX_IMAGE_BYTES) {
      return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', `Image must be ≤ ${MAX_IMAGE_BYTES / 1024 / 1024} MB`)
    }

    // ── Parse multipart form ────────────────────────────────────────────────
    let body
    try {
      body = await c.req.parseBody()
    } catch {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Request body must be multipart/form-data')
    }

    const image = body.image
    if (!(image instanceof File)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'image field is required')
    }

    // Re-check size after parsing (Content-Length might be missing on some clients)
    if (image.size > MAX_IMAGE_BYTES) {
      return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', `Image must be ≤ ${MAX_IMAGE_BYTES / 1024 / 1024} MB`)
    }

    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Only image/jpeg and image/png are accepted')
    }

    // ── Model selection ─────────────────────────────────────────────────────
    // Source of truth is the exercise's teacher-configured extract_model.
    // The student request is NOT allowed to override; any client-supplied
    // model field is intentionally ignored.
    const exerciseRow = await c.env.DB.prepare(
      'SELECT extract_model FROM exercises WHERE id = (SELECT exercise_id FROM submissions WHERE id = ?)'
    ).bind(submissionId).first()
    const modelUsed = resolveModel(exerciseRow?.extract_model ?? null)

    // ── Upload to R2 ────────────────────────────────────────────────────────
    const timestamp = Date.now()
    const safeName = image.name || `upload-${timestamp}`
    const r2Key = `submissions/${submissionId}/${timestamp}-${safeName}`

    try {
      await c.env.BUCKET.put(r2Key, image.stream(), {
        httpMetadata: { contentType: image.type },
      })
    } catch (error) {
      console.error('R2 upload error (extract):', error)
      return jsonError(c, 500, 'UPLOAD_ERROR', 'Failed to upload image to storage')
    }

    // ── Persist file record ─────────────────────────────────────────────────
    const fileResult = await c.env.DB.prepare(`
      INSERT INTO submission_files (submission_id, file_type, r2_key, file_name, file_size)
      VALUES (?, 'answer_sheet', ?, ?, ?)
    `).bind(submissionId, r2Key, safeName, image.size).run()

    const fileId = fileResult.meta.last_row_id

    // ── Fetch answer schema (constrains the LLM output) ─────────────────────
    // Loaded via a fresh query because the submission row was selected with
    // minimal columns above. We need (q_id, sub_id, type) only.
    const schemaResult = await c.env.DB.prepare(`
      SELECT a.q_id, a.sub_id, a.type
      FROM answer_schemas a
      JOIN submissions s ON s.exercise_id = a.exercise_id
      WHERE s.id = ?
      ORDER BY a.q_id ASC, a.sub_id ASC
    `).bind(submissionId).all()

    const schema = schemaResult.results

    // ── Vision LLM call ──────────────────────────────────────────────────────
    const imageBytes = await image.arrayBuffer()
    let rawContent
    try {
      rawContent = await requestAnswersFromImage(c.env, {
        imageBytes,
        contentType: image.type,
        schema,
        model: modelUsed,
      })
    } catch (error) {
      console.error('Vision extract error:', error)
      return jsonError(
        c,
        502,
        'EXTRACTION_FAILED',
        error.message || 'Failed to extract answers from image. Try a different model or use manual mode.',
      )
    }

    // ── Validate + normalize ─────────────────────────────────────────────────
    let extracted
    let warnings
    try {
      const result = validateExtractedAnswers(rawContent, schema)
      extracted = result.answers
      warnings = result.warnings
    } catch (error) {
      if (error instanceof ExtractParseError) {
        console.error('Extract parse error:', error.message, 'raw:', rawContent)
        return jsonError(
          c,
          422,
          'EXTRACT_PARSE_ERROR',
          'Could not parse model output. Please retry or switch to manual mode.',
        )
      }
      throw error
    }

    return jsonSuccess(c, {
      file_id: fileId,
      model_used: modelUsed,
      extracted,
      warnings,
    })
  } catch (error) {
    console.error('Extract answers error:', error)
    return jsonError(c, 500, 'INTERNAL_ERROR', error.message || 'Failed to extract answers')
  }
})

export default submissionsRoutes

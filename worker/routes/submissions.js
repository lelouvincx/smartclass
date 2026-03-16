import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { jsonError, jsonSuccess } from '../lib/response.js'

const submissionsRoutes = new Hono()

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
      'SELECT id, user_id, submitted_at, total_questions FROM submissions WHERE id = ?'
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

    // Validate answer entries
    const totalQuestions = submission.total_questions
    // Track uniqueness by (q_id, sub_id) composite key
    // For non-boolean answers: key = "q_id:" (no sub_id)
    // For boolean sub-answers: key = "q_id:sub_id"
    const seenKeys = new Set()

    for (const entry of answers) {
      const qId = entry.q_id
      if (!Number.isInteger(qId) || qId < 1 || qId > totalQuestions) {
        return jsonError(c, 400, 'VALIDATION_ERROR', `Invalid q_id: ${qId}. Must be an integer between 1 and ${totalQuestions}`)
      }

      const subId = entry.sub_id ?? null
      const key = subId !== null ? `${qId}:${subId}` : `${qId}:`
      if (seenKeys.has(key)) {
        return jsonError(c, 400, 'VALIDATION_ERROR', `Duplicate answer entry for q_id=${qId}${subId ? ` sub_id=${subId}` : ''}`)
      }
      seenKeys.add(key)
    }

    // Insert submission answers — include sub_id
    const insertStatements = answers.map(({ q_id, sub_id, submitted_answer }) => {
      return c.env.DB.prepare(`
        INSERT INTO submission_answers (submission_id, q_id, sub_id, submitted_answer)
        VALUES (?, ?, ?, ?)
      `).bind(submissionId, q_id, sub_id ?? null, submitted_answer)
    })

    // Atomic guard against double-submit
    const updateStatement = c.env.DB.prepare(`
      UPDATE submissions
      SET submitted_at = datetime('now')
      WHERE id = ? AND submitted_at IS NULL
    `).bind(submissionId)

    const batchResults = await c.env.DB.batch([...insertStatements, updateStatement])

    const updateResult = batchResults[batchResults.length - 1]
    if (updateResult.meta.changes === 0) {
      return jsonError(c, 400, 'ALREADY_SUBMITTED', 'This submission has already been submitted')
    }

    const updatedSubmission = await c.env.DB.prepare(
      'SELECT id, exercise_id, user_id, mode, total_questions, started_at, submitted_at FROM submissions WHERE id = ?'
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

// Get submission with answers
submissionsRoutes.get('/:id', requireAuth, async (c) => {
  try {
    const submissionId = c.req.param('id')
    const authUser = c.get('authUser')

    const submission = await c.env.DB.prepare(
      'SELECT id, exercise_id, user_id, mode, total_questions, started_at, submitted_at, score FROM submissions WHERE id = ?'
    ).bind(submissionId).first()

    if (!submission) {
      return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
    }

    if (submission.user_id !== authUser.id) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
    }

    const answers = await c.env.DB.prepare(
      'SELECT id, q_id, sub_id, submitted_answer, is_correct FROM submission_answers WHERE submission_id = ? ORDER BY q_id ASC, sub_id ASC'
    ).bind(submissionId).all()

    return jsonSuccess(c, {
      ...submission,
      answers: answers.results,
    })
  } catch (error) {
    console.error('Get submission error:', error)
    return jsonError(c, 500, 'INTERNAL_ERROR', error.message || 'Failed to get submission')
  }
})

export default submissionsRoutes

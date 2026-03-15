import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { jsonError, jsonSuccess } from '../lib/response.js'

const submissionsRoutes = new Hono()

// Create a new submission (start an exercise attempt)
submissionsRoutes.post('/', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const { exercise_id } = body || {}

  // Validation
  if (!exercise_id) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'exercise_id is required')
  }

  const authUser = c.get('authUser')

  // Get exercise and verify it exists
  const exercise = await c.env.DB.prepare(
    'SELECT id, duration_minutes FROM exercises WHERE id = ?'
  ).bind(exercise_id).first()

  if (!exercise) {
    return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
  }

  // Get question count from answer_schemas
  const schemaCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM answer_schemas WHERE exercise_id = ?'
  ).bind(exercise_id).first()

  const totalQuestions = schemaCount.count

  // Determine mode based on duration
  const mode = exercise.duration_minutes > 0 ? 'timed' : 'untimed'

  // Insert submission
  const result = await c.env.DB.prepare(`
    INSERT INTO submissions (exercise_id, user_id, mode, total_questions, started_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(exercise_id, authUser.id, mode, totalQuestions).run()

  const submissionId = result.meta.last_row_id

  // Get the created submission
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

    // Validation
    if (!Array.isArray(answers)) {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'answers must be an array')
    }

    const authUser = c.get('authUser')

    // Get submission and verify ownership
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
      return jsonError(c, 400, 'ALREADY_SUBMITTED', 'This submission has already been submitted')
    }

    // Insert submission answers using D1 batch
    const insertStatements = answers.map(({ q_id, submitted_answer }) => {
      return c.env.DB.prepare(`
        INSERT INTO submission_answers (submission_id, q_id, submitted_answer)
        VALUES (?, ?, ?)
      `).bind(submissionId, q_id, submitted_answer)
    })

    // Add update submission statement to batch
    const updateStatement = c.env.DB.prepare(`
      UPDATE submissions
      SET submitted_at = datetime('now')
      WHERE id = ?
    `).bind(submissionId)

    // Execute all statements in a single batch
    await c.env.DB.batch([...insertStatements, updateStatement])

    // Get updated submission with answers
    const updatedSubmission = await c.env.DB.prepare(
      'SELECT id, exercise_id, user_id, mode, total_questions, started_at, submitted_at FROM submissions WHERE id = ?'
    ).bind(submissionId).first()

    const submittedAnswers = await c.env.DB.prepare(
      'SELECT id, q_id, submitted_answer, is_correct FROM submission_answers WHERE submission_id = ? ORDER BY q_id ASC'
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

    // Get submission
    const submission = await c.env.DB.prepare(
      'SELECT id, exercise_id, user_id, mode, total_questions, started_at, submitted_at, score FROM submissions WHERE id = ?'
    ).bind(submissionId).first()

    if (!submission) {
      return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
    }

    if (submission.user_id !== authUser.id) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
    }

    // Get answers
    const answers = await c.env.DB.prepare(
      'SELECT id, q_id, submitted_answer, is_correct FROM submission_answers WHERE submission_id = ? ORDER BY q_id ASC'
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

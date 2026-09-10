import { Hono } from 'hono'
import { COHERE_MODEL, parseImageWithCohere } from '../lib/cohere.js'
import { parseStudentPhotoAnswers } from '../lib/cohere-table-parser.js'
import { gradeSubmission } from '../lib/grading.js'
import { toQuestionAssetResponse } from '../lib/question-assets.js'
import { jsonError, jsonSuccess } from '../lib/response.js'
import { requireWorkspaceIdentity } from '../middleware/workspace-auth.js'

const workspaceSubmissionsRoutes = new Hono()

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png'])

function encodeAttachmentFileName(fileName) {
  return encodeURIComponent(fileName).replace(/['()*]/g, character => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ))
}

function positiveParam(value) {
  if (!/^\d+$/.test(value ?? '')) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function currentWorkspaceId(c) {
  return c.get('workspace')?.id
}

function activeStudentMembership(c) {
  const membership = c.get('workspaceMembership')
  if (!membership) {
    return { error: jsonError(c, 403, 'MEMBERSHIP_REQUIRED', 'Workspace membership is required.') }
  }
  if (membership.status === 'pending') {
    return { error: jsonError(c, 403, 'MEMBERSHIP_PENDING', 'Workspace membership is pending approval.') }
  }
  if (membership.status === 'disabled') {
    return { error: jsonError(c, 403, 'MEMBERSHIP_DISABLED', 'Workspace membership is disabled.') }
  }
  if (membership.role !== 'student') {
    return { error: jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this resource.') }
  }
  return { membership }
}

function isWorkspaceManager(c) {
  const authUser = c.get('authUser')
  const membership = c.get('workspaceMembership')
  return authUser?.platform_role === 'platform_admin'
    || (membership?.role === 'teacher' && membership.status === 'active')
}

async function submissionInWorkspace(c, submissionId) {
  return c.env.DB.prepare(`
    select
      submission.id
      , submission.exercise_id
      , submission.user_id
      , submission.attempt_number
      , submission.mode
      , submission.total_questions
      , submission.started_at
      , submission.submitted_at
      , submission.score
      , submission.question_asset_set_id
      , exercise.title as exercise_title
      , exercise.allow_answer_pdf_download
      , users.phone as student_phone
      , coalesce(member.display_name, users.name) as student_name
    from submissions submission
    join exercises exercise
      on exercise.id = submission.exercise_id
      and exercise.workspace_id = ?
    join users on users.id = submission.user_id
    left join workspace_memberships member
      on member.workspace_id = exercise.workspace_id
      and member.user_id = submission.user_id
      and member.role = 'student'
    where submission.id = ?
    limit 1
  `).bind(currentWorkspaceId(c), submissionId).first()
}

async function schemaRowsForSubmission(c, submission) {
  if (submission.question_asset_set_id) {
    const assetSet = await c.env.DB.prepare(`
      select 1
      from exercise_question_asset_sets asset_set
      join exercises exercise
        on exercise.id = asset_set.exercise_id
        and exercise.workspace_id = ?
      where asset_set.id = ?
        and asset_set.exercise_id = ?
      limit 1
    `).bind(currentWorkspaceId(c), submission.question_asset_set_id, submission.exercise_id).first()
    if (!assetSet) return null

    return c.env.DB.prepare(`
      select q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths
      from exercise_question_answer_schemas
      where asset_set_id = ?
      order by q_id asc, sub_id asc
    `).bind(submission.question_asset_set_id).all()
  }

  return c.env.DB.prepare(`
    select q_id, section_key, section_title, local_number, sub_id, type, correct_answer, max_score_hundredths
    from answer_schemas
    where exercise_id = ?
    order by q_id asc, sub_id asc
  `).bind(submission.exercise_id).all()
}

workspaceSubmissionsRoutes.use('*', requireWorkspaceIdentity)

workspaceSubmissionsRoutes.get('/', async (c) => {
  const authUser = c.get('authUser')
  const exerciseIdParam = c.req.query('exercise_id')
  const limitParam = c.req.query('limit')
  const offsetParam = c.req.query('offset')

  const exerciseId = exerciseIdParam ? positiveParam(exerciseIdParam) : null
  if (exerciseIdParam && !exerciseId) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'exercise_id must be a positive integer')
  }

  let limit = limitParam ? parseInt(limitParam, 10) : 50
  let offset = offsetParam ? parseInt(offsetParam, 10) : 0
  if (limit < 0 || limit > 100) limit = 50
  if (offset < 0) offset = 0

  const manager = isWorkspaceManager(c)
  if (manager && !exerciseId) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'exercise_id is required for teacher submission lists')
  }

  if (!manager) {
    const { error } = activeStudentMembership(c)
    if (error) return error
  }

  const bindings = [currentWorkspaceId(c)]
  const whereClauses = ['exercise.workspace_id = ?', 'submission.submitted_at is not null']

  if (!manager) {
    whereClauses.push('submission.user_id = ?')
    bindings.push(authUser.id)
  }

  if (exerciseId) {
    const exercise = await c.env.DB.prepare(`
      select id from exercises where id = ? and workspace_id = ? limit 1
    `).bind(exerciseId, currentWorkspaceId(c)).first()
    if (!exercise) return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    whereClauses.push('submission.exercise_id = ?')
    bindings.push(exerciseId)
  }

  const whereClause = whereClauses.join(' and ')
  const submissions = await c.env.DB.prepare(`
    select
      submission.id
      , submission.exercise_id
      , submission.attempt_number
      , exercise.title as exercise_title
      , submission.mode
      , submission.score
      , submission.total_questions
      , submission.started_at
      , submission.submitted_at
      , coalesce(member.display_name, users.name) as student_name
      , users.phone as student_phone
    from submissions submission
    join exercises exercise on exercise.id = submission.exercise_id
    join users on users.id = submission.user_id
    left join workspace_memberships member
      on member.workspace_id = exercise.workspace_id
      and member.user_id = submission.user_id
      and member.role = 'student'
    where ${whereClause}
    order by submission.submitted_at desc
    limit ? offset ?
  `).bind(...bindings, limit, offset).all()

  const total = await c.env.DB.prepare(`
    select count(*) as total
    from submissions submission
    join exercises exercise on exercise.id = submission.exercise_id
    where ${whereClause}
  `).bind(...bindings).first()

  return jsonSuccess(c, {
    submissions: submissions.results.map((submission) => {
      if (manager) return submission
      const { student_name: _name, student_phone: _phone, ...studentSubmission } = submission
      return studentSubmission
    }),
    total: total.total,
  })
})

workspaceSubmissionsRoutes.post('/', async (c) => {
  const { membership, error } = activeStudentMembership(c)
  if (error) return error

  const body = await c.req.json().catch(() => null)
  const { exercise_id: exerciseId, known_latest_attempt_number: knownLatestAttemptNumber, replace_submission_id: replaceSubmissionId } = body || {}
  if (!Number.isInteger(exerciseId) || exerciseId < 1) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'exercise_id must be a positive integer')
  }
  if (!Number.isInteger(knownLatestAttemptNumber) || knownLatestAttemptNumber < 0) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'known_latest_attempt_number must be a non-negative integer')
  }
  if (replaceSubmissionId !== undefined && (!Number.isInteger(replaceSubmissionId) || replaceSubmissionId < 1)) {
    return jsonError(c, 400, 'VALIDATION_ERROR', 'replace_submission_id must be a positive integer')
  }

  const exercise = await c.env.DB.prepare(`
    select id, max_attempts from exercises where id = ? and workspace_id = ? limit 1
  `).bind(exerciseId, currentWorkspaceId(c)).first()
  if (!exercise) return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')

  const authUser = c.get('authUser')
  const selectSubmission = async (clause, ...bindings) => c.env.DB.prepare(`
    select
      submission.id
      , submission.exercise_id
      , submission.user_id
      , submission.attempt_number
      , submission.mode
      , submission.total_questions
      , submission.started_at
      , submission.submitted_at
      , submission.question_asset_set_id
    from submissions submission
    join exercises exercise
      on exercise.id = submission.exercise_id
      and exercise.workspace_id = ?
    where ${clause}
  `).bind(currentWorkspaceId(c), ...bindings).first()

  const currentResumable = await selectSubmission(
    `submission.user_id = ? and submission.exercise_id = ? and submission.submitted_at is null
     order by submission.attempt_number desc, submission.id desc limit 1`,
    authUser.id,
    exerciseId,
  )
  if (replaceSubmissionId === undefined && currentResumable) {
    return jsonSuccess(c, currentResumable)
  }

  const nextAttemptNumber = knownLatestAttemptNumber + 1
  const resumableCondition = replaceSubmissionId === undefined
    ? `not exists (
        select 1 from submissions resumable
        where resumable.user_id = ?
          and resumable.exercise_id = exercise.id
          and resumable.submitted_at is null
      )`
    : `? = (
        select resumable.id from submissions resumable
        where resumable.user_id = ?
          and resumable.exercise_id = exercise.id
          and resumable.submitted_at is null
        order by resumable.attempt_number desc, resumable.id desc
        limit 1
      )`
  const resumableBindings = replaceSubmissionId === undefined
    ? [authUser.id]
    : [replaceSubmissionId, authUser.id]

  const result = await c.env.DB.prepare(`
    insert into submissions (
      exercise_id, user_id, attempt_number, mode, total_questions, started_at, question_asset_set_id
    )
    select
      exercise.id
      , ?
      , ?
      , case when exercise.duration_minutes > 0 then 'timed' else 'untimed' end
      , (select count(distinct schema.q_id) from exercise_question_answer_schemas schema where schema.asset_set_id = exercise.active_question_asset_set_id)
      , datetime('now')
      , exercise.active_question_asset_set_id
    from exercises exercise
    join exercise_question_asset_sets active_set
      on active_set.id = exercise.active_question_asset_set_id
      and active_set.exercise_id = exercise.id
      and active_set.confirmed_at is not null
    where exercise.id = ?
      and exercise.workspace_id = ?
      and exists (
        select 1
        from workspace_membership_grades student_grade
        join exercise_grades exercise_grade on exercise_grade.grade = student_grade.grade
        where student_grade.membership_id = ?
          and exercise_grade.exercise_id = exercise.id
      )
      and coalesce((
        select max(existing.attempt_number)
        from submissions existing
        where existing.user_id = ? and existing.exercise_id = exercise.id
      ), 0) = ?
      and (exercise.max_attempts is null or ? <= exercise.max_attempts)
      and ${resumableCondition}
  `).bind(
    authUser.id,
    nextAttemptNumber,
    exerciseId,
    currentWorkspaceId(c),
    membership.id,
    authUser.id,
    knownLatestAttemptNumber,
    nextAttemptNumber,
    ...resumableBindings,
  ).run()

  if (result.meta.changes === 0) {
    const replay = await selectSubmission(
      'submission.user_id = ? and submission.exercise_id = ? and submission.attempt_number = ?',
      authUser.id,
      exerciseId,
      nextAttemptNumber,
    )
    if (replay) return jsonSuccess(c, replay)

    const state = await c.env.DB.prepare(`
      select
        exercise.id
        , exercise.max_attempts
        , coalesce((
            select max(existing.attempt_number)
            from submissions existing
            where existing.user_id = ? and existing.exercise_id = exercise.id
          ), 0) as latest_attempt_number
        , exists (
            select 1
            from workspace_membership_grades student_grade
            join exercise_grades exercise_grade on exercise_grade.grade = student_grade.grade
            where student_grade.membership_id = ? and exercise_grade.exercise_id = exercise.id
          ) as has_grade_access
        , exists (
            select 1
            from exercise_question_asset_sets active_set
            where active_set.id = exercise.active_question_asset_set_id
              and active_set.exercise_id = exercise.id
              and active_set.confirmed_at is not null
          ) as is_ready
      from exercises exercise
      where exercise.id = ? and exercise.workspace_id = ?
    `).bind(authUser.id, membership.id, exerciseId, currentWorkspaceId(c)).first()
    if (!state) return jsonError(c, 404, 'NOT_FOUND', 'Exercise not found')
    if (!state.has_grade_access) return jsonError(c, 403, 'GRADE_ACCESS_DENIED', 'This exercise is not available for your classes')
    if (!state.is_ready) return jsonError(c, 409, 'EXERCISE_NOT_READY', 'Exercise is not ready for students')
    if (state.max_attempts !== null && state.latest_attempt_number >= state.max_attempts) {
      return jsonError(c, 409, 'ATTEMPT_LIMIT_REACHED', 'The attempt limit has been reached')
    }
    const latestResumable = await selectSubmission(
      `submission.user_id = ? and submission.exercise_id = ? and submission.submitted_at is null
       order by submission.attempt_number desc, submission.id desc limit 1`,
      authUser.id,
      exerciseId,
    )
    if (replaceSubmissionId === undefined && latestResumable) return jsonSuccess(c, latestResumable)
    return jsonError(c, 409, 'ATTEMPT_STATE_CHANGED', 'Attempt state changed; reload the exercise')
  }

  const submission = await selectSubmission('submission.id = ?', result.meta.last_row_id)
  return jsonSuccess(c, submission, 201)
})

workspaceSubmissionsRoutes.put('/:id/submit', async (c) => {
  try {
    const { error } = activeStudentMembership(c)
    if (error) return error

    const submissionId = positiveParam(c.req.param('id'))
    if (!submissionId) return jsonError(c, 400, 'VALIDATION_ERROR', 'Submission ID must be a positive integer')

    const body = await c.req.json().catch(() => null)
    const { answers } = body || {}
    if (!Array.isArray(answers)) return jsonError(c, 400, 'VALIDATION_ERROR', 'answers must be an array')

    const authUser = c.get('authUser')
    const submission = await submissionInWorkspace(c, submissionId)
    if (!submission) return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
    if (submission.user_id !== authUser.id) return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
    if (submission.submitted_at) return jsonError(c, 400, 'ALREADY_SUBMITTED', 'This submission has already been submitted')

    const schemaRows = await schemaRowsForSubmission(c, submission)
    if (!schemaRows) return jsonError(c, 404, 'NOT_FOUND', 'Question set not found')

    const validKeys = new Set()
    for (const row of schemaRows.results) {
      validKeys.add(row.sub_id !== null ? `${row.q_id}:${row.sub_id}` : `${row.q_id}:`)
    }
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

    let grading
    try {
      grading = gradeSubmission(
        schemaRows.results,
        answers.map((a) => ({ q_id: a.q_id, sub_id: a.sub_id ?? null, submitted_answer: a.submitted_answer })),
      )
    } catch (err) {
      return jsonError(c, 409, 'INVALID_SCORE_ALLOCATION', err.message)
    }

    const gradedMap = new Map()
    for (const graded of grading.gradedAnswers) {
      gradedMap.set(`${graded.q_id}:${graded.sub_id ?? ''}`, graded.is_correct)
    }
    const insertStatements = answers.map(({ q_id, sub_id, submitted_answer }) => c.env.DB.prepare(`
      insert into submission_answers (submission_id, q_id, sub_id, submitted_answer, is_correct)
      values (?, ?, ?, ?, ?)
    `).bind(submissionId, q_id, sub_id ?? null, submitted_answer, gradedMap.get(`${q_id}:${sub_id ?? ''}`) ?? 0))
    const updateStatement = c.env.DB.prepare(`
      update submissions set submitted_at = datetime('now'), score = ? where id = ? and submitted_at is null
    `).bind(grading.score, submissionId)
    const batchResults = await c.env.DB.batch([...insertStatements, updateStatement])
    if (batchResults[batchResults.length - 1].meta.changes === 0) {
      return jsonError(c, 400, 'ALREADY_SUBMITTED', 'This submission has already been submitted')
    }

    const updated = await submissionInWorkspace(c, submissionId)
    const submittedAnswers = await c.env.DB.prepare(`
      select id, q_id, sub_id, submitted_answer, is_correct
      from submission_answers
      where submission_id = ?
      order by q_id asc, sub_id asc
    `).bind(submissionId).all()
    return jsonSuccess(c, { ...updated, answers: submittedAnswers.results })
  } catch (err) {
    console.error('Submit answers error:', err)
    return jsonError(c, 500, 'INTERNAL_ERROR', err.message || 'Failed to submit answers')
  }
})

workspaceSubmissionsRoutes.get('/:id/exercise-pdf', async (c) => {
  const { error } = activeStudentMembership(c)
  if (error) return error

  const submissionId = positiveParam(c.req.param('id'))
  if (!submissionId) return jsonError(c, 400, 'VALIDATION_ERROR', 'Submission ID must be a positive integer')

  const authUser = c.get('authUser')
  const submission = await c.env.DB.prepare(`
    select
      submission.user_id
      , source_file.r2_key
      , source_file.file_name
    from submissions submission
    join exercises exercise
      on exercise.id = submission.exercise_id
      and exercise.workspace_id = ?
    join exercise_question_asset_sets asset_set
      on asset_set.id = submission.question_asset_set_id
      and asset_set.exercise_id = submission.exercise_id
    join exercise_files source_file
      on source_file.id = asset_set.source_file_id
      and source_file.exercise_id = submission.exercise_id
      and source_file.file_type = 'exercise_pdf'
    where submission.id = ?
    limit 1
  `).bind(currentWorkspaceId(c), submissionId).first()
  if (!submission) return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
  if (submission.user_id !== authUser.id) return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')

  const object = await c.env.BUCKET.get(submission.r2_key)
  if (!object) return jsonError(c, 404, 'NOT_FOUND', 'Exercise PDF content not found')
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/pdf',
      'Content-Disposition': `attachment; filename="exercise.pdf"; filename*=UTF-8''${encodeAttachmentFileName(submission.file_name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
})

workspaceSubmissionsRoutes.get('/:id/answer-pdf', async (c) => {
  const { error } = activeStudentMembership(c)
  if (error) return error

  const submissionId = positiveParam(c.req.param('id'))
  if (!submissionId) return jsonError(c, 400, 'VALIDATION_ERROR', 'Submission ID must be a positive integer')

  const authUser = c.get('authUser')
  const submission = await c.env.DB.prepare(`
    select
      submission.user_id
      , submission.submitted_at
      , exercise.allow_answer_pdf_download
      , answer_file.r2_key
      , answer_file.file_name
    from submissions submission
    join exercises exercise
      on exercise.id = submission.exercise_id
      and exercise.workspace_id = ?
    join exercise_question_asset_sets asset_set
      on asset_set.id = submission.question_asset_set_id
      and asset_set.exercise_id = submission.exercise_id
    join exercise_files answer_file
      on answer_file.id = asset_set.answer_source_file_id
      and answer_file.exercise_id = submission.exercise_id
      and answer_file.file_type = 'solution_pdf'
    where submission.id = ?
    limit 1
  `).bind(currentWorkspaceId(c), submissionId).first()
  if (!submission) return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
  if (submission.user_id !== authUser.id) return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
  if (!submission.submitted_at) return jsonError(c, 403, 'FORBIDDEN', 'Answer PDF is available only after submission')
  if (submission.allow_answer_pdf_download !== 1) return jsonError(c, 403, 'FORBIDDEN', 'Answer PDF download is disabled for this exercise')

  const object = await c.env.BUCKET.get(submission.r2_key)
  if (!object) return jsonError(c, 404, 'NOT_FOUND', 'Answer PDF content not found')
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/pdf',
      'Content-Disposition': `attachment; filename="answer.pdf"; filename*=UTF-8''${encodeAttachmentFileName(submission.file_name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
})

workspaceSubmissionsRoutes.get('/:id', async (c) => {
  try {
    const submissionId = positiveParam(c.req.param('id'))
    if (!submissionId) return jsonError(c, 400, 'VALIDATION_ERROR', 'Submission ID must be a positive integer')

    const submission = await submissionInWorkspace(c, submissionId)
    if (!submission) return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')


    const manager = isWorkspaceManager(c)
    const authUser = c.get('authUser')
    if (!manager) {
      const { error } = activeStudentMembership(c)
      if (error) return error
      if (submission.user_id !== authUser.id) return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
    }

    const isSubmitted = submission.submitted_at !== null
    if (manager && !isSubmitted) return jsonError(c, 403, 'FORBIDDEN', 'Teachers can review only completed submissions')
    if (!manager && submission.user_id !== authUser.id) return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')

    const schemaRows = await schemaRowsForSubmission(c, submission)
    if (!schemaRows) return jsonError(c, 404, 'NOT_FOUND', 'Question set not found')

    const answersResult = await c.env.DB.prepare(`
      select
        schema.q_id
        , schema.section_key
        , schema.section_title
        , schema.local_number
        , schema.sub_id
        , schema.type
        , schema.correct_answer
        , submitted.submitted_answer
        , coalesce(submitted.is_correct, 0) as is_correct
      from (${submission.question_asset_set_id ? `
        select q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        from exercise_question_answer_schemas where asset_set_id = ?
      ` : `
        select q_id, section_key, section_title, local_number, sub_id, type, correct_answer
        from answer_schemas where exercise_id = ?
      `}) schema
      left join submission_answers submitted
        on submitted.submission_id = ?
        and submitted.q_id = schema.q_id
        and coalesce(submitted.sub_id, '') = coalesce(schema.sub_id, '')
      order by schema.q_id asc, schema.sub_id asc
    `).bind(submission.question_asset_set_id ?? submission.exercise_id, submissionId).all()
    const answers = answersResult.results.map((row) => {
      if (isSubmitted) return row
      const { correct_answer: _stripped, ...rest } = row
      return rest
    })

    let questionAssets = []
    if (submission.question_asset_set_id) {
      const assets = await c.env.DB.prepare(`
        select asset.*
        from exercise_question_assets asset
        join exercise_question_asset_sets asset_set
          on asset_set.id = asset.asset_set_id
          and asset_set.exercise_id = ?
          and asset_set.confirmed_at is not null
        join exercises exercise
          on exercise.id = asset_set.exercise_id
          and exercise.workspace_id = ?
        where asset.asset_set_id = ?
        order by asset.q_id asc, asset.segment_index asc
      `).bind(submission.exercise_id, currentWorkspaceId(c), submission.question_asset_set_id).all()
      questionAssets = assets.results.map(toQuestionAssetResponse)
    }

    const answerPdf = isSubmitted && submission.allow_answer_pdf_download === 1
      ? await c.env.DB.prepare(`
          select 1
          from exercise_question_asset_sets asset_set
          join exercise_files answer_file
            on answer_file.id = asset_set.answer_source_file_id
            and answer_file.exercise_id = asset_set.exercise_id
            and answer_file.file_type = 'solution_pdf'
          where asset_set.id = ?
            and asset_set.exercise_id = ?
          limit 1
        `).bind(submission.question_asset_set_id, submission.exercise_id).first()
      : null

    const {
      user_id: _userId,
      allow_answer_pdf_download: _allowAnswerPdfDownload,
      student_name: studentName,
      student_phone: studentPhone,
      ...submissionData
    } = submission
    return jsonSuccess(c, {
      ...submissionData,
      ...(manager ? { student_name: studentName, student_phone: studentPhone } : {}),
      files: [],
      question_assets: questionAssets,
      answer_pdf_download_available: Boolean(!manager && answerPdf),
      answers,
    })
  } catch (err) {
    console.error('Get submission error:', err)
    return jsonError(c, 500, 'INTERNAL_ERROR', err.message || 'Failed to get submission')
  }
})

workspaceSubmissionsRoutes.post('/:id/extract', async (c) => {
  try {
    const { error } = activeStudentMembership(c)
    if (error) return error

    const submissionId = positiveParam(c.req.param('id'))
    if (!submissionId) return jsonError(c, 400, 'VALIDATION_ERROR', 'Submission ID must be a positive integer')

    const authUser = c.get('authUser')
    const submission = await submissionInWorkspace(c, submissionId)
    if (!submission) return jsonError(c, 404, 'NOT_FOUND', 'Submission not found')
    if (submission.user_id !== authUser.id) return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this submission')
    if (submission.submitted_at) return jsonError(c, 409, 'ALREADY_SUBMITTED', 'This submission has already been submitted')

    const schemaRows = await schemaRowsForSubmission(c, submission)
    if (!schemaRows) return jsonError(c, 404, 'NOT_FOUND', 'Question set not found')

    const contentLength = parseInt(c.req.header('content-length') || '0', 10)
    if (contentLength > MAX_IMAGE_BYTES) {
      return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', `Image must be ≤ ${MAX_IMAGE_BYTES / 1024 / 1024} MB`)
    }

    let body
    try {
      body = await c.req.parseBody()
    } catch {
      return jsonError(c, 400, 'VALIDATION_ERROR', 'Request body must be multipart/form-data')
    }

    const image = body.image
    if (!(image instanceof File)) return jsonError(c, 400, 'VALIDATION_ERROR', 'image field is required')
    if (image.size > MAX_IMAGE_BYTES) {
      return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', `Image must be ≤ ${MAX_IMAGE_BYTES / 1024 / 1024} MB`)
    }
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return jsonError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Only image/jpeg and image/png are accepted')
    }

    const timestamp = Date.now()
    const safeName = image.name || `upload-${timestamp}`
    const r2Key = `submissions/${submissionId}/${timestamp}-${safeName}`
    try {
      await c.env.BUCKET.put(r2Key, image.stream(), { httpMetadata: { contentType: image.type } })
    } catch (err) {
      console.error('R2 upload error (extract):', err)
      return jsonError(c, 500, 'UPLOAD_ERROR', 'Failed to upload image to storage')
    }
    const fileResult = await c.env.DB.prepare(`
      insert into submission_files (submission_id, file_type, r2_key, file_name, file_size)
      values (?, 'answer_sheet', ?, ?, ?)
    `).bind(submissionId, r2Key, safeName, image.size).run()

    const schema = schemaRows.results.map(({ q_id, section_key, section_title, local_number, sub_id, type }) => ({
      q_id, section_key, section_title, local_number, sub_id, type,
    }))
    const imageBytes = await image.arrayBuffer()
    let markdown
    try {
      const parsed = await parseImageWithCohere(c.env, { imageBytes, contentType: image.type, requireHtmlTable: false })
      markdown = parsed.markdown
    } catch {
      console.error('Cohere submission extraction failed', { category: 'provider' })
      return jsonError(c, 502, 'EXTRACTION_FAILED', 'Failed to extract answers from image. Retry or use manual entry.')
    }

    const { answers: extracted, warnings } = parseStudentPhotoAnswers(markdown, schema)
    return jsonSuccess(c, {
      file_id: fileResult.meta.last_row_id,
      model_used: COHERE_MODEL,
      extracted,
      warnings,
    })
  } catch (err) {
    console.error('Extract answers error:', err)
    return jsonError(c, 500, 'INTERNAL_ERROR', err.message || 'Failed to extract answers')
  }
})

export default workspaceSubmissionsRoutes

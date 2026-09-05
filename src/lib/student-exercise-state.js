import { getSubmission, listMySubmissions } from '@/lib/api'
import {
  clearSubmissionState,
  getSubmissionPointer,
  setSubmissionPointer,
} from '@/lib/submission-draft'

export async function loadStudentExerciseStates({ accountId, exercises, token }) {
  const states = {}
  const submittedByExercise = new Map()

  try {
    const response = await listMySubmissions(token, { limit: 100 })
    for (const submission of response.data?.submissions || []) {
      if (!submittedByExercise.has(submission.exercise_id)) {
        submittedByExercise.set(submission.exercise_id, submission)
      }
    }
  } catch {
    // Exercise browsing still works if history is temporarily unavailable.
  }

  await Promise.all(exercises.map(async (exercise) => {
    const submissionId = getSubmissionPointer(accountId, exercise.id)
    const hasServerAttemptState = Object.hasOwn(exercise, 'latest_attempt_number')

    if (hasServerAttemptState) {
      if (exercise.in_progress_submission_id) {
        const serverSubmissionId = String(exercise.in_progress_submission_id)
        if (submissionId && submissionId !== serverSubmissionId) {
          clearSubmissionState(accountId, exercise.id, submissionId)
        }
        setSubmissionPointer(accountId, exercise.id, serverSubmissionId)
        states[exercise.id] = { type: 'resume', submissionId: serverSubmissionId }
        return
      }

      if (submissionId) clearSubmissionState(accountId, exercise.id, submissionId)
      if (exercise.can_start_attempt) return

      const submitted = submittedByExercise.get(exercise.id)
      if (submitted) {
        states[exercise.id] = { type: 'result', submissionId: submitted.id }
      }
      return
    }

    if (submissionId) {
      try {
        const response = await getSubmission(token, submissionId)
        if (response.data && !response.data.submitted_at) {
          states[exercise.id] = { type: 'resume', submissionId }
          return
        }
        clearSubmissionState(accountId, exercise.id, submissionId)
      } catch (error) {
        if ([403, 404].includes(error.status)) {
          clearSubmissionState(accountId, exercise.id, submissionId)
        } else {
          states[exercise.id] = { type: 'resume', submissionId }
          return
        }
      }
    }

    if (exercise.in_progress_submission_id) {
      const serverSubmissionId = String(exercise.in_progress_submission_id)
      setSubmissionPointer(accountId, exercise.id, serverSubmissionId)
      states[exercise.id] = { type: 'resume', submissionId: serverSubmissionId }
      return
    }

    const submitted = submittedByExercise.get(exercise.id)
    if (submitted) {
      states[exercise.id] = { type: 'result', submissionId: submitted.id }
    }
  }))

  return states
}

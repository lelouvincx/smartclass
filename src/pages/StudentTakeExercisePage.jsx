import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { createSubmission, getExercise, getSubmission, submitAnswers } from '../lib/api'
import { useAuth } from '../lib/auth-context'

// --- Timer helpers ---

function formatTime(totalSeconds) {
  const absSeconds = Math.abs(totalSeconds)
  const h = Math.floor(absSeconds / 3600)
  const m = Math.floor((absSeconds % 3600) / 60)
  const s = absSeconds % 60
  const hStr = h > 0 ? `${h}:` : ''
  const mStr = String(m).padStart(h > 0 ? 2 : 1, '0')
  const sStr = String(s).padStart(2, '0')
  return `${totalSeconds < 0 ? '+' : ''}${hStr}${mStr}:${sStr}`
}

// --- Question input components ---

function McqInput({ qId, value, onChange, submitted }) {
  const options = ['A', 'B', 'C', 'D']
  return (
    <div className="flex flex-wrap gap-4">
      {options.map((opt) => (
        <label key={opt} className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name={`q_${qId}`}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            disabled={submitted}
            aria-label={`Question ${qId} option ${opt}`}
          />
          <span className="text-sm font-medium text-slate-700">{opt}</span>
        </label>
      ))}
    </div>
  )
}

function BooleanInput({ qId, value, onChange, submitted }) {
  return (
    <div className="flex gap-6">
      {['true', 'false'].map((opt) => (
        <label key={opt} className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name={`q_${qId}`}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            disabled={submitted}
            aria-label={`Question ${qId} option ${opt === 'true' ? 'True' : 'False'}`}
          />
          <span className="text-sm font-medium text-slate-700">
            {opt === 'true' ? 'True' : 'False'}
          </span>
        </label>
      ))}
    </div>
  )
}

function NumericInput({ qId, value, onChange, submitted }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={submitted}
      placeholder="Enter a number"
      aria-label={`Question ${qId} numeric answer`}
      className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
    />
  )
}

// --- Read-only result row ---

function ResultRow({ question, answer }) {
  const display = answer !== '' && answer !== null && answer !== undefined ? answer : '—'
  return (
    <tr className="border-t border-slate-200">
      <td className="px-4 py-3 text-sm text-slate-700">Q{question.q_id}</td>
      <td className="px-4 py-3 text-xs text-slate-500">{question.type}</td>
      <td className="px-4 py-3 text-sm font-medium text-slate-900">{display}</td>
    </tr>
  )
}

// --- Main page ---

export default function StudentTakeExercisePage() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  // Loading / error
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Exercise + submission data
  const [exercise, setExercise] = useState(null)
  const [submission, setSubmission] = useState(null)

  // Answers: { [q_id]: string }
  const [answers, setAnswers] = useState({})

  // Timer state
  const [secondsLeft, setSecondsLeft] = useState(null) // null = untimed
  const [overtime, setOvertime] = useState(false)
  const timerRef = useRef(null)

  // Submission flow state
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submittedAnswers, setSubmittedAnswers] = useState([])

  // Navigation guard state
  const [showLeaveWarning, setShowLeaveWarning] = useState(false)

  // --- Init: fetch exercise and create submission ---
  useEffect(() => {
    async function init() {
      setIsLoading(true)
      setError('')

      try {
        const exRes = await getExercise(id, token)
        const ex = exRes.data
        setExercise(ex)

        // Initialise answers map
        const initial = {}
        for (const q of ex.schema || []) {
          initial[q.q_id] = ''
        }
        setAnswers(initial)

        // Reuse existing submission or create a new one
        const storageKey = `submission_${id}`
        let sub = null

        const savedSubId = sessionStorage.getItem(storageKey)
        if (savedSubId) {
          try {
            const existingRes = await getSubmission(token, savedSubId)
            if (existingRes.data && !existingRes.data.submitted_at) {
              sub = existingRes.data
            }
          } catch {
            // Submission not found or inaccessible, create new
          }
        }

        if (!sub) {
          const subRes = await createSubmission(token, { exercise_id: Number(id) })
          sub = subRes.data
          sessionStorage.setItem(storageKey, String(sub.id))
        }

        setSubmission(sub)

        // Set up timer if timed, using elapsed time from started_at
        if (ex.is_timed && ex.duration_minutes > 0) {
          const startedAt = new Date(sub.started_at + 'Z')
          const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000)
          const remaining = ex.duration_minutes * 60 - elapsed
          if (remaining <= 0) {
            setSecondsLeft(remaining)
            setOvertime(true)
          } else {
            setSecondsLeft(remaining)
          }
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [id, token])

  // --- beforeunload + popstate guard ---
  useEffect(() => {
    if (isLoading || isSubmitted) return

    function handleBeforeUnload(e) {
      e.preventDefault()
      e.returnValue = ''
    }

    function handlePopState() {
      window.history.pushState(null, '', window.location.href)
      setShowLeaveWarning(true)
    }

    window.history.pushState(null, '', window.location.href)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isLoading, isSubmitted])

  // --- Countdown timer ---
  useEffect(() => {
    if (secondsLeft === null || isSubmitted) return

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === 1) {
          // Reached zero — switch to overtime
          setOvertime(true)
          return 0
        }
        if (prev <= 0) {
          // Count up (negative = overtime seconds elapsed)
          return prev - 1
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [secondsLeft === null, isSubmitted]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Answer change handler ---
  const handleAnswerChange = useCallback((qId, value) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
  }, [])

  // --- Submit flow ---
  function handleSubmitClick() {
    setShowConfirm(true)
  }

  function handleCancelConfirm() {
    setShowConfirm(false)
  }

  async function handleConfirmSubmit() {
    setShowConfirm(false)
    setIsSubmitting(true)
    setSubmitError('')

    try {
      clearInterval(timerRef.current)

      const answersPayload = Object.entries(answers).map(([qId, ans]) => ({
        q_id: Number(qId),
        submitted_answer: ans !== '' ? ans : null,
      }))

      const res = await submitAnswers(token, submission.id, answersPayload)
      setSubmittedAnswers(res.data.answers || [])
      setIsSubmitted(true)
      sessionStorage.removeItem(`submission_${id}`)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Navigation guard (in-page Back button) ---
  function handleBackClick() {
    setShowLeaveWarning(true)
  }

  function handleConfirmLeave() {
    navigate('/student/exercises')
  }

  function handleCancelLeave() {
    setShowLeaveWarning(false)
  }

  // --- Render helpers ---

  function renderQuestionInput(q) {
    const value = answers[q.q_id] ?? ''
    if (q.type === 'mcq') {
      return (
        <McqInput
          qId={q.q_id}
          value={value}
          onChange={(v) => handleAnswerChange(q.q_id, v)}
          submitted={isSubmitted}
        />
      )
    }
    if (q.type === 'boolean') {
      return (
        <BooleanInput
          qId={q.q_id}
          value={value}
          onChange={(v) => handleAnswerChange(q.q_id, v)}
          submitted={isSubmitted}
        />
      )
    }
    // numeric
    return (
      <NumericInput
        qId={q.q_id}
        value={value}
        onChange={(v) => handleAnswerChange(q.q_id, v)}
        submitted={isSubmitted}
      />
    )
  }

  // --- States ---

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-600">Loading exercise...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-red-600">{error}</p>
          <Link
            to="/student/exercises"
            className="mt-4 inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
          >
            Back to Exercises
          </Link>
        </div>
      </div>
    )
  }

  const timerColor = overtime ? 'text-red-600' : secondsLeft <= 60 ? 'text-amber-600' : 'text-slate-700'

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{exercise.title}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {exercise.schema?.length ?? 0} question{exercise.schema?.length !== 1 ? 's' : ''}
              </p>
            </div>
            {secondsLeft !== null && (
              <div className={`flex items-center gap-2 ${timerColor}`} aria-live="polite" aria-label="Timer">
                <Clock className="h-4 w-4" />
                <span className="tabular-nums text-lg font-semibold">
                  {formatTime(secondsLeft)}
                </span>
                {overtime && (
                  <span className="text-xs font-medium text-red-600">Over time</span>
                )}
              </div>
            )}
          </div>

          {overtime && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Time is up! You can still submit your answers.
            </div>
          )}
        </div>

        {/* Submitted view */}
        {isSubmitted ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Submitted!</h2>
            </div>
            <p className="mb-4 text-sm text-slate-600">Your answers have been recorded.</p>
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-2">Question</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Your Answer</th>
                </tr>
              </thead>
              <tbody>
                {exercise.schema?.map((q) => {
                  const ans = submittedAnswers.find((a) => a.q_id === q.q_id)
                  return (
                    <ResultRow
                      key={q.q_id}
                      question={q}
                      answer={ans ? ans.submitted_answer : null}
                    />
                  )
                })}
              </tbody>
            </table>
            <Link
              to="/student/exercises"
              className="mt-6 inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
            >
              Back to Exercises
            </Link>
          </div>
        ) : (
          /* Questions form */
          <div className="space-y-4">
            {exercise.schema?.map((q, idx) => (
              <div
                key={q.q_id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="mb-3 text-sm font-semibold text-slate-900">
                  {idx + 1}. Question {q.q_id}
                  <span className="ml-2 text-xs font-normal text-slate-500">({q.type})</span>
                </p>
                {renderQuestionInput(q)}
              </div>
            ))}

            {submitError && (
              <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{submitError}</p>
            )}

            {/* Leave warning dialog */}
            {showLeaveWarning && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Leave exercise"
                className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm"
              >
                <h2 className="mb-2 text-base font-semibold text-slate-900">Leave this exercise?</h2>
                <p className="mb-4 text-sm text-slate-600">
                  Your answers will be lost if you leave now.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmLeave}
                    className="h-10 rounded-md bg-red-600 px-5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Yes, leave
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelLeave}
                    className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
                  >
                    Stay
                  </button>
                </div>
              </div>
            )}

            {/* Confirm submit dialog */}
            {showConfirm && (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h2 id="confirm-title" className="mb-2 text-base font-semibold text-slate-900">
                  Submit your answers?
                </h2>
                <p className="mb-4 text-sm text-slate-600">
                  You cannot change your answers after submitting.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmSubmit}
                    className="h-10 rounded-md bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Yes, submit
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelConfirm}
                    className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!showConfirm && !showLeaveWarning && (
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleSubmitClick}
                  disabled={isSubmitting}
                  className="h-10 rounded-md bg-blue-600 px-6 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={handleBackClick}
                  disabled={isSubmitting}
                  className="text-sm text-slate-600 underline disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

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

// --- Schema grouping helpers ---

/**
 * Groups schema rows into question groups.
 * Returns an array of groups:
 *   { q_id, type: 'mcq'|'numeric', sub_id: null }  — for mcq/numeric
 *   { q_id, type: 'boolean', subRows: [{sub_id, ...}] }  — for boolean
 */
function groupSchema(schema) {
  const groups = []
  const seen = new Map()

  for (const row of schema) {
    if (row.type === 'boolean') {
      if (!seen.has(row.q_id)) {
        const group = { q_id: row.q_id, type: 'boolean', subRows: [] }
        groups.push(group)
        seen.set(row.q_id, group)
      }
      seen.get(row.q_id).subRows.push(row)
    } else {
      groups.push({ q_id: row.q_id, type: row.type, sub_id: null })
      seen.set(row.q_id, true)
    }
  }

  return groups
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

/**
 * Boolean input: renders 4 sub-question rows (a,b,c,d), each with True/False radios.
 * subAnswers: { a: '1'|'0'|'', b: ..., c: ..., d: ... }
 * onSubChange(subId, value)
 */
function BooleanGroupInput({ qId, subRows, subAnswers, onSubChange, submitted }) {
  return (
    <div className="space-y-2">
      {subRows.map(({ sub_id }) => (
        <div key={sub_id} className="flex items-center gap-4">
          <span className="w-5 text-sm font-medium text-slate-600">{sub_id}.</span>
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name={`q_${qId}_${sub_id}`}
                value="1"
                checked={(subAnswers[sub_id] ?? '') === '1'}
                onChange={() => onSubChange(sub_id, '1')}
                disabled={submitted}
                aria-label={`Question ${qId} sub ${sub_id} True`}
              />
              <span className="text-sm text-slate-700">True</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name={`q_${qId}_${sub_id}`}
                value="0"
                checked={(subAnswers[sub_id] ?? '') === '0'}
                onChange={() => onSubChange(sub_id, '0')}
                disabled={submitted}
                aria-label={`Question ${qId} sub ${sub_id} False`}
              />
              <span className="text-sm text-slate-700">False</span>
            </label>
          </div>
        </div>
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

// --- Read-only result rows ---

function McqNumericResultRow({ question, answer }) {
  const display = answer !== '' && answer !== null && answer !== undefined ? answer : '—'
  return (
    <tr className="border-t border-slate-200">
      <td className="px-4 py-3 text-sm text-slate-700">Q{question.q_id}</td>
      <td className="px-4 py-3 text-sm font-medium text-slate-900">{display}</td>
    </tr>
  )
}

function BooleanResultGroup({ group, submittedAnswers }) {
  return (
    <>
      {group.subRows.map(({ sub_id }) => {
        const ans = submittedAnswers.find((a) => a.q_id === group.q_id && a.sub_id === sub_id)
        const raw = ans ? ans.submitted_answer : null
        const display = raw !== null && raw !== undefined && raw !== '' ? raw : '—'
        return (
          <tr key={sub_id} className="border-t border-slate-200">
            <td className="px-4 py-3 text-sm text-slate-700">Q{group.q_id}{sub_id}</td>
            <td className="px-4 py-3 text-sm font-medium text-slate-900">{display}</td>
          </tr>
        )
      })}
    </>
  )
}

// --- Main page ---

export default function StudentTakeExercisePage() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [exercise, setExercise] = useState(null)
  // questionGroups: array of grouped schema (grouped boolean sub-questions)
  const [questionGroups, setQuestionGroups] = useState([])

  // answers: { [q_id]: string }  for mcq/numeric
  //          { [q_id]: { a: '1'|'0'|'', b: ..., c: ..., d: '' } }  for boolean
  const [answers, setAnswers] = useState({})

  const [submission, setSubmission] = useState(null)

  const [secondsLeft, setSecondsLeft] = useState(null)
  const [overtime, setOvertime] = useState(false)
  const timerRef = useRef(null)

  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submittedAnswers, setSubmittedAnswers] = useState([])

  const [showLeaveWarning, setShowLeaveWarning] = useState(false)

  // --- Init ---
  useEffect(() => {
    async function init() {
      setIsLoading(true)
      setError('')

      try {
        const exRes = await getExercise(id, token)
        const ex = exRes.data
        setExercise(ex)

        // Group schema rows
        const groups = groupSchema(ex.schema || [])
        setQuestionGroups(groups)

        // Initialise answers
        const initial = {}
        for (const group of groups) {
          if (group.type === 'boolean') {
            initial[group.q_id] = {}
            for (const { sub_id } of group.subRows) {
              initial[group.q_id][sub_id] = ''
            }
          } else {
            initial[group.q_id] = ''
          }
        }
        setAnswers(initial)

        // Reuse existing submission or create new
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
            // not found or inaccessible
          }
        }

        if (!sub) {
          const subRes = await createSubmission(token, { exercise_id: Number(id) })
          sub = subRes.data
          sessionStorage.setItem(storageKey, String(sub.id))
        }

        setSubmission(sub)

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
          setOvertime(true)
          return 0
        }
        if (prev <= 0) {
          return prev - 1
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [secondsLeft === null, isSubmitted]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Answer change handlers ---
  const handleAnswerChange = useCallback((qId, value) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
  }, [])

  const handleBooleanSubChange = useCallback((qId, subId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] || {}), [subId]: value },
    }))
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

      // Build answers payload
      const answersPayload = []
      for (const group of questionGroups) {
        if (group.type === 'boolean') {
          const subAnswers = answers[group.q_id] || {}
          for (const { sub_id } of group.subRows) {
            const val = subAnswers[sub_id]
            answersPayload.push({
              q_id: group.q_id,
              sub_id,
              submitted_answer: val !== '' ? val : null,
            })
          }
        } else {
          const val = answers[group.q_id]
          answersPayload.push({
            q_id: group.q_id,
            submitted_answer: val !== '' ? val : null,
          })
        }
      }

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

  // --- Navigation guard ---
  function handleBackClick() {
    setShowLeaveWarning(true)
  }

  function handleConfirmLeave() {
    navigate('/student/exercises')
  }

  function handleCancelLeave() {
    setShowLeaveWarning(false)
  }

  // --- Render question input ---
  function renderQuestionInput(group) {
    if (group.type === 'mcq') {
      return (
        <McqInput
          qId={group.q_id}
          value={answers[group.q_id] ?? ''}
          onChange={(v) => handleAnswerChange(group.q_id, v)}
          submitted={isSubmitted}
        />
      )
    }
    if (group.type === 'boolean') {
      return (
        <BooleanGroupInput
          qId={group.q_id}
          subRows={group.subRows}
          subAnswers={answers[group.q_id] || {}}
          onSubChange={(subId, v) => handleBooleanSubChange(group.q_id, subId, v)}
          submitted={isSubmitted}
        />
      )
    }
    // numeric
    return (
      <NumericInput
        qId={group.q_id}
        value={answers[group.q_id] ?? ''}
        onChange={(v) => handleAnswerChange(group.q_id, v)}
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
                {questionGroups.length} question{questionGroups.length !== 1 ? 's' : ''}
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
                  <th className="px-4 py-2">Your Answer</th>
                </tr>
              </thead>
              <tbody>
                {questionGroups.map((group) => {
                  if (group.type === 'boolean') {
                    return (
                      <BooleanResultGroup
                        key={group.q_id}
                        group={group}
                        submittedAnswers={submittedAnswers}
                      />
                    )
                  }
                  const ans = submittedAnswers.find((a) => a.q_id === group.q_id && !a.sub_id)
                  return (
                    <McqNumericResultRow
                      key={group.q_id}
                      question={group}
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
            {questionGroups.map((group, idx) => (
              <div
                key={group.q_id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="mb-3 text-sm font-semibold text-slate-900">
                  {idx + 1}. Question {group.q_id}
                </p>
                {renderQuestionInput(group)}
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

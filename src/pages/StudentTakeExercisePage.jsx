import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { createSubmission, getExercise, getSubmission, submitAnswers } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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
          <span className="text-sm font-medium">{opt}</span>
        </label>
      ))}
    </div>
  )
}

function BooleanGroupInput({ qId, subRows, subAnswers, onSubChange, submitted }) {
  return (
    <div className="space-y-2">
      {subRows.map(({ sub_id }) => (
        <div key={sub_id} className="flex items-center gap-4">
          <span className="w-5 text-sm font-medium text-muted-foreground">{sub_id}.</span>
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
              <span className="text-sm">True</span>
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
              <span className="text-sm">False</span>
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
      className="w-40 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-hidden disabled:bg-muted disabled:text-muted-foreground"
    />
  )
}

// --- Read-only result rows ---

function CorrectnessIcon({ isCorrect }) {
  if (isCorrect === 1) {
    return <span aria-label="correct" className="font-bold text-success">✓</span>
  }
  if (isCorrect === 0) {
    return <span aria-label="wrong" className="font-bold text-destructive">✗</span>
  }
  return null
}

function McqNumericResultRow({ question, answer }) {
  const display = answer !== '' && answer !== null && answer !== undefined ? answer : '—'
  return (
    <tr className="border-t">
      <td className="px-4 py-3 text-sm text-muted-foreground">Q{question.q_id}</td>
      <td className="px-4 py-3 text-sm font-medium">{display}</td>
      <td className="px-4 py-3 text-center">
        <CorrectnessIcon isCorrect={answer !== null && answer !== undefined ? question.is_correct : null} />
      </td>
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
          <tr key={sub_id} className="border-t">
            <td className="px-4 py-3 text-sm text-muted-foreground">Q{group.q_id}{sub_id}</td>
            <td className="px-4 py-3 text-sm font-medium">{display}</td>
            <td className="px-4 py-3 text-center">
              <CorrectnessIcon isCorrect={ans ? ans.is_correct : null} />
            </td>
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
  const [questionGroups, setQuestionGroups] = useState([])
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
  const [submissionScore, setSubmissionScore] = useState(null)

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

        const groups = groupSchema(ex.schema || [])
        setQuestionGroups(groups)

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
      setSubmissionScore(res.data.score ?? null)
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
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading exercise...</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="max-w-2xl border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/student/exercises">Back to Exercises</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const timerColor = overtime
    ? 'text-destructive'
    : secondsLeft <= 60
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-foreground'

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{exercise.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
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
                  <Badge variant="destructive" className="text-xs">Over time</Badge>
                )}
              </div>
            )}
          </div>

          {overtime && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Time is up! You can still submit your answers.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submitted view */}
      {isSubmitted ? (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-2 flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Submitted!</h2>
            </div>
            {submissionScore !== null && (
              <p className="mb-4 text-2xl font-bold">
                {submissionScore}{' '}
                <span className="text-base font-normal text-muted-foreground">/ 10</span>
              </p>
            )}
            {submissionScore === null && (
              <p className="mb-4 text-sm text-muted-foreground">Your answers have been recorded.</p>
            )}
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Question</th>
                  <th className="px-4 py-2">Your Answer</th>
                  <th className="px-4 py-2 text-center">Result</th>
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
                      question={{ ...group, is_correct: ans ? ans.is_correct : null }}
                      answer={ans ? ans.submitted_answer : null}
                    />
                  )
                })}
              </tbody>
            </table>
            <Button variant="outline" asChild className="mt-6">
              <Link to="/student/exercises">Back to Exercises</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Questions form */
        <div className="space-y-4">
          {questionGroups.map((group, idx) => (
            <Card key={group.q_id}>
              <CardContent className="pt-5">
                <p className="mb-3 text-sm font-semibold">
                  {idx + 1}. Question {group.q_id}
                </p>
                {renderQuestionInput(group)}
              </CardContent>
            </Card>
          ))}

          {submitError && (
            <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{submitError}</p>
          )}

          {/* Leave warning dialog */}
          <Dialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Leave this exercise?</DialogTitle>
                <DialogDescription>
                  Your answers will be lost if you leave now.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancelLeave}>Stay</Button>
                <Button variant="destructive" onClick={handleConfirmLeave}>Yes, leave</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Confirm submit dialog */}
          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit your answers?</DialogTitle>
                <DialogDescription>
                  You cannot change your answers after submitting.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancelConfirm}>Cancel</Button>
                <Button onClick={handleConfirmSubmit}>Yes, submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {!showConfirm && !showLeaveWarning && (
            <div className="flex items-center gap-4">
              <Button
                onClick={handleSubmitClick}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
              <Button
                variant="ghost"
                onClick={handleBackClick}
                disabled={isSubmitting}
              >
                Back
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

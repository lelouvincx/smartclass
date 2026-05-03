import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Clock, Eye, EyeOff, ImageIcon, LayoutGrid, Pencil } from 'lucide-react'
import { ButtonGroup } from '@/components/ui/button-group'
import { toast } from 'sonner'
import { getExercise, getFileUrl, getSubmission, submitAnswers } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PdfSplitPane } from '@/components/pdf-split-pane'
import AnswerImageUpload from '@/components/answer-image-upload'
import { QuestionNavGrid, countUnanswered } from '@/components/question-nav-grid'

// Build a stable key for an answer cell (matches the worker's (q_id, sub_id) pair).
function cellKey(qId, subId) {
  return `${qId}:${subId ?? ''}`
}

// Tri-color confidence dot. Returns null for cells that have been manually
// edited / verified (the parent passes confidence=null to suppress the dot).
function ConfidenceDot({ confidence }) {
  if (confidence === null || confidence === undefined) return null
  let color
  let label
  if (confidence >= 0.8) {
    color = 'bg-success'
    label = 'high confidence'
  } else if (confidence >= 0.5) {
    color = 'bg-amber-500'
    label = 'medium confidence — please review'
  } else {
    color = 'bg-destructive'
    label = 'low confidence — please verify'
  }
  return (
    <span
      aria-label={label}
      title={`Auto-filled (${Math.round(confidence * 100)}% confidence)`}
      className={`ml-2 inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
    />
  )
}

// Milestones at which to fire a toast notification (in seconds remaining).
// Fires once each, tracked via firedMilestones ref.
const TIMER_MILESTONES = [
  { at: 1800, message: '30 minutes left', type: 'info' },
  { at: 600,  message: '10 minutes left', type: 'warning' },
  { at: 300,  message: '5 minutes left',  type: 'warning' },
  { at: 60,   message: '1 minute left',   type: 'error' },
]

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

function McqInput({ qId, value, onChange, submitted, confidence }) {
  const options = ['A', 'B', 'C', 'D']
  return (
    <div className="flex items-center gap-2">
      <ButtonGroup aria-label={`Question ${qId} options`}>
        {options.map((opt) => (
          <Button
            key={opt}
            type="button"
            size="sm"
            variant={value === opt ? 'default' : 'outline'}
            disabled={submitted}
            onClick={() => !submitted && onChange(opt)}
            aria-pressed={value === opt}
            aria-label={`Question ${qId} option ${opt}`}
          >
            {opt}
          </Button>
        ))}
      </ButtonGroup>
      {value && !submitted && (
        <button
          type="button"
          aria-label={`Clear answer for question ${qId}`}
          onClick={() => onChange('')}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ×
        </button>
      )}
      <ConfidenceDot confidence={confidence} />
    </div>
  )
}

function BooleanGroupInput({ qId, subRows, subAnswers, onSubChange, submitted, subConfidence }) {
  return (
    <div className="space-y-2">
      {subRows.map(({ sub_id }) => {
        const val = subAnswers[sub_id] ?? ''
        return (
          <div key={sub_id} className="flex items-center gap-4">
            <span className="w-5 text-sm font-medium text-muted-foreground">{sub_id}.</span>
            <ButtonGroup aria-label={`Question ${qId} sub-question ${sub_id}`}>
              <Button
                type="button"
                size="sm"
                variant={val === '1' ? 'default' : 'outline'}
                disabled={submitted}
                onClick={() => !submitted && onSubChange(sub_id, '1')}
                aria-pressed={val === '1'}
                aria-label={`Question ${qId} sub ${sub_id} True`}
                className={val === '1' ? 'bg-success text-white hover:bg-success/90' : ''}
              >
                True
              </Button>
              <Button
                type="button"
                size="sm"
                variant={val === '0' ? 'default' : 'outline'}
                disabled={submitted}
                onClick={() => !submitted && onSubChange(sub_id, '0')}
                aria-pressed={val === '0'}
                aria-label={`Question ${qId} sub ${sub_id} False`}
                className={val === '0' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
              >
                False
              </Button>
            </ButtonGroup>
            <ConfidenceDot confidence={subConfidence?.[sub_id]} />
          </div>
        )
      })}
    </div>
  )
}

function NumericInput({ qId, value, onChange, submitted, confidence }) {
  return (
    <div className="flex items-center">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={submitted}
        placeholder="Enter a number"
        aria-label={`Question ${qId} numeric answer`}
        className="w-40 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-hidden disabled:bg-muted disabled:text-muted-foreground"
      />
      <ConfidenceDot confidence={confidence} />
    </div>
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
  const firedMilestones = useRef(new Set())

  const [timerHidden, setTimerHidden] = useState(
    () => localStorage.getItem('smartclass-timer-hidden') === 'true'
  )

  function toggleTimerHidden() {
    setTimerHidden((prev) => {
      const next = !prev
      localStorage.setItem('smartclass-timer-hidden', String(next))
      return next
    })
  }

  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [showLeaveWarning, setShowLeaveWarning] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Tracks the currently "focused" question for the nav grid highlight
  const [currentQId, setCurrentQId] = useState(null)
  // Refs for scroll-to-question via the nav grid
  const questionRefs = useRef({})

  // Image-extraction state (v0.4)
  //   inputMode             — 'manual' | 'photo'
  //   extractedConfidence   — { [cellKey]: number } — auto-filled cells; cleared on manual edit
  const [inputMode, setInputMode] = useState('manual')
  const [extractedConfidence, setExtractedConfidence] = useState({})

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
        setCurrentQId(groups[0]?.q_id ?? null)

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
          navigate(`/student/exercises/${id}`, { replace: true })
          return
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
    if (isLoading) return

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
  }, [isLoading])

  // --- Countdown timer + milestone toasts ---
  useEffect(() => {
    if (secondsLeft === null) return

    // Fire any milestones that have already passed on mount
    for (const { at, message, type } of TIMER_MILESTONES) {
      if (secondsLeft <= at && !firedMilestones.current.has(at)) {
        firedMilestones.current.add(at)
        toast[type](message, { duration: 6000 })
      }
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1

        if (next === 0) {
          setOvertime(true)
          if (!firedMilestones.current.has('overtime')) {
            firedMilestones.current.add('overtime')
            toast.error("Time's up! You can still submit your answers.", { duration: 8000 })
          }
        }

        for (const { at, message, type } of TIMER_MILESTONES) {
          if (next === at && !firedMilestones.current.has(at)) {
            firedMilestones.current.add(at)
            toast[type](message, { duration: 6000 })
          }
        }

        return next
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [secondsLeft === null]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Answer change handlers ---
  const handleAnswerChange = useCallback((qId, value) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
    setExtractedConfidence((prev) => {
      const key = cellKey(qId, null)
      if (!(key in prev)) return prev
      const { [key]: _removed, ...rest } = prev
      return rest
    })
  }, [])

  const handleBooleanSubChange = useCallback((qId, subId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] || {}), [subId]: value },
    }))
    setExtractedConfidence((prev) => {
      const key = cellKey(qId, subId)
      if (!(key in prev)) return prev
      const { [key]: _removed, ...rest } = prev
      return rest
    })
  }, [])

  // --- Image extraction merge handler (v0.4) ---
  const handleExtracted = useCallback(
    ({ extracted, warnings, model_used }) => {
      if (!Array.isArray(extracted) || extracted.length === 0) {
        toast.warning('No answers were extracted from the image.')
        return
      }

      setAnswers((prev) => {
        const next = { ...prev }
        for (const row of extracted) {
          if (row.answer === null || row.answer === undefined) continue
          if (row.sub_id) {
            next[row.q_id] = { ...(next[row.q_id] || {}), [row.sub_id]: row.answer }
          } else {
            next[row.q_id] = row.answer
          }
        }
        return next
      })

      setExtractedConfidence((prev) => {
        const next = { ...prev }
        for (const row of extracted) {
          if (row.answer === null || row.answer === undefined) continue
          next[cellKey(row.q_id, row.sub_id)] = Number(row.confidence) || 0
        }
        return next
      })

      const filled = extracted.filter((r) => r.answer !== null && r.answer !== undefined).length
      const lowConf = extracted.filter(
        (r) => (r.answer !== null && r.answer !== undefined) && Number(r.confidence) < 0.5,
      ).length
      const wMsg = warnings && warnings.length > 0 ? ` · ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''
      const lowMsg = lowConf > 0 ? ` · ${lowConf} low-confidence` : ''
      toast.success(
        `Pre-filled ${filled} answer${filled === 1 ? '' : 's'}${lowMsg}${wMsg}. Please review.`,
        { duration: 6000 },
      )
    },
    [],
  )

  // Per-question confidence lookup for boolean sub-rows.
  const booleanSubConfidence = useMemo(() => {
    const byQ = {}
    for (const [key, conf] of Object.entries(extractedConfidence)) {
      const [qStr, subId] = key.split(':')
      if (!subId) continue
      const qId = Number(qStr)
      if (!byQ[qId]) byQ[qId] = {}
      byQ[qId][subId] = conf
    }
    return byQ
  }, [extractedConfidence])

  // --- Nav grid jump ---
  function handleJump(qId) {
    setCurrentQId(qId)
    setSheetOpen(false)
    questionRefs.current[qId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

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

      await submitAnswers(token, submission.id, answersPayload)
      sessionStorage.removeItem(`submission_${id}`)
      navigate(`/student/submissions/${submission.id}/summary`)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Navigation guard ---
  function handleExitClick() {
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
          submitted={false}
          confidence={extractedConfidence[cellKey(group.q_id, null)]}
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
          submitted={false}
          subConfidence={booleanSubConfidence[group.q_id]}
        />
      )
    }
    return (
      <NumericInput
        qId={group.q_id}
        value={answers[group.q_id] ?? ''}
        onChange={(v) => handleAnswerChange(group.q_id, v)}
        submitted={false}
        confidence={extractedConfidence[cellKey(group.q_id, null)]}
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

  // Find exercise PDF file URL (public — no auth needed)
  const exercisePdfFile = exercise?.files?.find((f) => f.file_type === 'exercise_pdf')
  const pdfUrl = exercisePdfFile ? getFileUrl(exercisePdfFile.id) : null

  const unansweredCount = exercise ? countUnanswered(exercise.schema, answers) : 0
  const confirmMessage = unansweredCount > 0
    ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Submit anyway?`
    : 'You cannot change your answers after submitting.'

  // Sidebar content shared between desktop and mobile sheet
  function renderSidebar() {
    return (
      <div className="space-y-4">
        {/* Timer */}
        {secondsLeft !== null && (
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-2 ${timerColor}`}
                aria-live="polite"
                aria-label="Timer"
              >
                <Clock className="h-4 w-4" />
                {!timerHidden && (
                  <span className="tabular-nums text-lg font-semibold">
                    {formatTime(secondsLeft)}
                  </span>
                )}
                {overtime && (
                  <Badge variant="destructive" className="text-xs">Over time</Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={toggleTimerHidden}
                aria-label={timerHidden ? 'Show timer' : 'Hide timer'}
                title={timerHidden ? 'Show timer' : 'Hide timer'}
              >
                {timerHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Nav grid */}
        {exercise && (
          <QuestionNavGrid
            schema={exercise.schema}
            answers={answers}
            currentQId={currentQId}
            onJump={handleJump}
          />
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSubmitClick}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
          <Button
            variant="ghost"
            onClick={handleExitClick}
            disabled={isSubmitting}
            className="w-full"
          >
            Exit
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
          </div>

          {overtime && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Time is up! You can still submit your answers.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-column layout: main content + sidebar */}
      <div className="lg:grid lg:grid-cols-[1fr_clamp(240px,_20rem,_40vw)] lg:items-start lg:gap-6">
        {/* Left: PDF + questions */}
        <div>
          <PdfSplitPane fileUrl={pdfUrl}>
            <div className="space-y-4">
              {/* Input mode toggle (v0.4) — Manual vs. Photo extraction */}
              <Card>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Input mode</p>
                      <p className="text-xs text-muted-foreground">
                        Type answers manually, or upload a photo of your answer sheet to auto-fill.
                      </p>
                    </div>
                    <ButtonGroup aria-label="Input mode">
                      <Button
                        type="button"
                        size="sm"
                        variant={inputMode === 'manual' ? 'default' : 'outline'}
                        onClick={() => setInputMode('manual')}
                        aria-pressed={inputMode === 'manual'}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Manual
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={inputMode === 'photo' ? 'default' : 'outline'}
                        onClick={() => setInputMode('photo')}
                        aria-pressed={inputMode === 'photo'}
                      >
                        <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                        Upload photo
                      </Button>
                    </ButtonGroup>
                  </div>

                  {inputMode === 'photo' && submission && (
                    <AnswerImageUpload
                      submissionId={submission.id}
                      onExtracted={handleExtracted}
                      disabled={isSubmitting}
                    />
                  )}
                </CardContent>
              </Card>

              {questionGroups.map((group, idx) => (
                <div
                  key={group.q_id}
                  ref={(el) => { questionRefs.current[group.q_id] = el }}
                >
                  <Card>
                    <CardContent className="pt-5">
                      <p className="mb-3 text-sm font-semibold">
                        {idx + 1}. Question {group.q_id}
                      </p>
                      {renderQuestionInput(group)}
                    </CardContent>
                  </Card>
                </div>
              ))}

              {submitError && (
                <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{submitError}</p>
              )}
            </div>
          </PdfSplitPane>
        </div>

        {/* Right: sticky sidebar (desktop only) */}
        <div className="hidden lg:block">
          <div className="sticky top-4">
            <Card>
              <CardContent className="pt-5">
                {renderSidebar()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialogs */}
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

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your answers?</DialogTitle>
            <DialogDescription>
              {confirmMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelConfirm}>Cancel</Button>
            <Button onClick={handleConfirmSubmit}>Yes, submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile: persistent timer chip — visible while the answer-sheet drawer is closed.
          Reuses the same secondsLeft / overtime / timerHidden state as the desktop sidebar
          timer; the milestone-toast useEffect remains the single source of truth. */}
      {secondsLeft !== null && !sheetOpen && !timerHidden && (
        <div
          aria-live="polite"
          aria-label="Timer (mobile)"
          className={`fixed bottom-20 right-6 z-40 flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm font-semibold shadow-md lg:hidden ${timerColor}`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="tabular-nums">{formatTime(secondsLeft)}</span>
          {overtime && (
            <Badge variant="destructive" className="ml-1 text-[10px]">Over time</Badge>
          )}
        </div>
      )}

      {/* Mobile: floating answer sheet button */}
      <button
        type="button"
        aria-label="Open answer sheet"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg lg:hidden"
      >
        <LayoutGrid className="h-4 w-4" />
        Answer Sheet
      </button>

      {/* Mobile: bottom sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Answer Sheet</SheetTitle>
          </SheetHeader>
          {renderSidebar()}
        </SheetContent>
      </Sheet>
    </div>
  )
}

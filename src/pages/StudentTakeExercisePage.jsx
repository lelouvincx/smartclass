import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Clock, Eye, EyeOff, ImageIcon, Pencil, X } from 'lucide-react'
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
import { PdfSplitPane } from '@/components/pdf-split-pane'
import AnswerImageUpload from '@/components/answer-image-upload'
import { QuestionNavGrid, countUnanswered } from '@/components/question-nav-grid'
import {
  clearSubmissionState,
  getSubmissionPointer,
  loadSubmissionDraft,
  saveSubmissionDraft,
} from '@/lib/submission-draft'

// Build a stable key for an answer cell (matches the worker's (q_id, sub_id) pair).
function cellKey(qId, subId) {
  return `${qId}:${subId ?? ''}`
}

// Tri-color confidence dot. Returns null for cells that have been manually
// edited / verified (the parent passes confidence=null to suppress the dot).
function ConfidenceDot({ confidence, t }) {
  if (confidence === null || confidence === undefined) return null
  let color
  let label
  if (confidence >= 0.8) {
    color = 'bg-success'
    label = t('student.take.highConfidence')
  } else if (confidence >= 0.5) {
    color = 'bg-amber-500'
    label = t('student.take.mediumConfidence')
  } else {
    color = 'bg-destructive'
    label = t('student.take.lowConfidence')
  }
  return (
    <span
      aria-label={label}
      title={t('student.take.autoFilled', { percent: Math.round(confidence * 100) })}
      className={`ml-2 inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
    />
  )
}

// Milestones at which to fire a toast notification (in seconds remaining).
// Fires once each, tracked via firedMilestones ref.
const TIMER_MILESTONES = [
  { at: 1800, key: 'milestone30', type: 'info' }, { at: 600, key: 'milestone10', type: 'warning' },
  { at: 300, key: 'milestone5', type: 'warning' }, { at: 60, key: 'milestone1', type: 'error' },
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

function McqInput({ qId, value, onChange, submitted, confidence, t }) {
  const options = ['A', 'B', 'C', 'D']
  return (
    <div className="flex items-center gap-2">
      <ButtonGroup aria-label={t('student.take.options', { id: qId })}>
        {options.map((opt) => (
          <Button
            key={opt}
            type="button"
            size="sm"
            className="min-h-[48px] min-w-[48px]"
            variant={value === opt ? 'default' : 'outline'}
            disabled={submitted}
            onClick={() => !submitted && onChange(opt)}
            aria-pressed={value === opt}
            aria-label={t('student.take.option', { id: qId, option: opt })}
          >
            {opt}
          </Button>
        ))}
      </ButtonGroup>
      {value && !submitted && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('student.take.clearAnswer', { id: qId })}
          onClick={() => onChange('')}
          className="text-muted-foreground"
        >
          <X aria-hidden="true" />
        </Button>
      )}
      <ConfidenceDot confidence={confidence} t={t} />
    </div>
  )
}

function BooleanGroupInput({ qId, subRows, subAnswers, onSubChange, submitted, subConfidence, t }) {
  return (
    <div className="space-y-2">
      {subRows.map(({ sub_id }) => {
        const val = subAnswers[sub_id] ?? ''
        return (
          <div key={sub_id} className="flex items-center gap-4">
            <span className="w-5 text-sm font-medium text-muted-foreground">{sub_id}.</span>
            <ButtonGroup aria-label={t('student.take.subQuestion', { id: qId, sub: sub_id })}>
              <Button
                type="button"
                size="sm"
                className={val === '1' ? 'min-h-[48px] bg-success text-white hover:bg-success/90' : 'min-h-[48px]'}
                variant={val === '1' ? 'default' : 'outline'}
                disabled={submitted}
                onClick={() => !submitted && onSubChange(sub_id, '1')}
                aria-pressed={val === '1'}
                aria-label={t('student.take.subOption', { id: qId, sub: sub_id, value: t('student.take.true') })}
              >
                {t('student.take.true')}
              </Button>
              <Button
                type="button"
                size="sm"
                className={val === '0' ? 'min-h-[48px] bg-destructive text-white hover:bg-destructive/90' : 'min-h-[48px]'}
                variant={val === '0' ? 'default' : 'outline'}
                disabled={submitted}
                onClick={() => !submitted && onSubChange(sub_id, '0')}
                aria-pressed={val === '0'}
                aria-label={t('student.take.subOption', { id: qId, sub: sub_id, value: t('student.take.false') })}
              >
                {t('student.take.false')}
              </Button>
            </ButtonGroup>
            <ConfidenceDot confidence={subConfidence?.[sub_id]} t={t} />
          </div>
        )
      })}
    </div>
  )
}

function NumericInput({ qId, value, onChange, submitted, confidence, t }) {
  return (
    <div className="flex items-center">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={submitted}
        placeholder={t('student.take.numberPlaceholder')}
        aria-label={t('student.take.numericAnswer', { id: qId })}
        className="min-h-[48px] w-40 rounded-[var(--sc-component-control-shape)] border border-input bg-background px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted disabled:text-muted-foreground"
      />
      <ConfidenceDot confidence={confidence} t={t} />
    </div>
  )
}

// --- Main page ---

export default function StudentTakeExercisePage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const { token, user } = useAuth()
  const accountId = user.id
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [exercise, setExercise] = useState(null)
  const [questionGroups, setQuestionGroups] = useState([])
  const [answers, setAnswers] = useState({})
  const answersRef = useRef(answers)
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

  // The currently displayed question (single-question view).
  // The student picks a question by clicking a cell in the nav grid.
  const [currentQId, setCurrentQId] = useState(null)

  // Image-extraction state (v0.4)
  //   inputMode             — 'manual' | 'photo'
  //   extractedConfidence   — { [cellKey]: number } — auto-filled cells; cleared on manual edit
  const [inputMode, setInputMode] = useState('manual')
  const [extractedConfidence, setExtractedConfidence] = useState({})
  const [draftReady, setDraftReady] = useState(false)

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

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

        let sub = null

        const savedSubId = getSubmissionPointer(accountId, id)
        if (savedSubId) {
          try {
            const existingRes = await getSubmission(token, savedSubId)
            if (existingRes.data && !existingRes.data.submitted_at) {
              sub = existingRes.data
            } else {
              clearSubmissionState(accountId, id, savedSubId)
            }
          } catch (submissionError) {
            if ([403, 404].includes(submissionError.status)) {
              clearSubmissionState(accountId, id, savedSubId)
            }
          }
        }

        if (!sub) {
          navigate(`/student/exercises/${id}`, { replace: true })
          return
        }

        setSubmission(sub)
        const draft = loadSubmissionDraft({
          accountId,
          submissionId: sub.id,
          schema: ex.schema,
        })
        if (draft) {
          setAnswers((current) => {
            const restored = { ...current }
            for (const group of groups) {
              if (group.type === 'boolean') {
                restored[group.q_id] = { ...current[group.q_id], ...draft.answers[group.q_id] }
              } else if (draft.answers[group.q_id] !== undefined) {
                restored[group.q_id] = draft.answers[group.q_id]
              }
            }
            return restored
          })
          setExtractedConfidence(draft.extractedConfidence)
        }
        setDraftReady(true)

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
  }, [accountId, id, navigate, token])

  useEffect(() => {
    if (!draftReady || !submission) return
    saveSubmissionDraft({
      accountId,
      submissionId: submission.id,
      answers,
      extractedConfidence,
    })
  }, [accountId, answers, draftReady, extractedConfidence, submission])

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
    for (const { at, key, type } of TIMER_MILESTONES) {
      if (secondsLeft <= at && !firedMilestones.current.has(at)) {
        firedMilestones.current.add(at)
        toast[type](t(`student.take.${key}`), { duration: 6000 })
      }
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1

        if (next === 0) {
          setOvertime(true)
          if (!firedMilestones.current.has('overtime')) {
            firedMilestones.current.add('overtime')
            toast.error(t('student.take.timeExpired'), { duration: 8000 })
          }
        }

        for (const { at, key, type } of TIMER_MILESTONES) {
          if (next === at && !firedMilestones.current.has(at)) {
            firedMilestones.current.add(at)
            toast[type](t(`student.take.${key}`), { duration: 6000 })
          }
        }

        return next
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [secondsLeft === null, t]) // eslint-disable-line react-hooks/exhaustive-deps

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
        toast.warning(t('student.take.noExtracted'))
        return
      }

      const schemaByCell = new Map(
        questionGroups.flatMap((group) => group.type === 'boolean'
          ? group.subRows.map((row) => [cellKey(group.q_id, row.sub_id), row.type])
          : [[cellKey(group.q_id, null), group.type]]),
      )
      const nextAnswers = { ...answersRef.current }
      const newlyFilled = []
      let kept = 0
      for (const row of extracted) {
        if (row.answer === null || row.answer === undefined) continue
        const key = cellKey(row.q_id, row.sub_id)
        const type = schemaByCell.get(key)
        if (!['mcq', 'numeric', 'boolean'].includes(type)) continue
        const existing = row.sub_id
          ? nextAnswers[row.q_id]?.[row.sub_id]
          : nextAnswers[row.q_id]
        if (existing !== '' && existing !== undefined && existing !== null) {
          kept++
          continue
        }
        if (row.sub_id) {
          nextAnswers[row.q_id] = { ...(nextAnswers[row.q_id] || {}), [row.sub_id]: row.answer }
        } else {
          nextAnswers[row.q_id] = row.answer
        }
        newlyFilled.push(row)
      }
      answersRef.current = nextAnswers
      setAnswers(nextAnswers)
      setExtractedConfidence((prev) => {
        const next = { ...prev }
        for (const row of newlyFilled) next[cellKey(row.q_id, row.sub_id)] = Number(row.confidence) || 0
        return next
      })

      const filled = newlyFilled.length
      const lowConf = newlyFilled.filter((r) => Number(r.confidence) < 0.5).length
      const wMsg = warnings && warnings.length > 0 ? ` · ${t('student.take.warningCount', { count: warnings.length })}` : ''
      const lowMsg = lowConf > 0 ? ` · ${t('student.take.lowConfidenceCount', { count: lowConf })}` : ''
      toast.success(
        `${t('student.take.extractionSummary', { count: filled, filled, kept })}${lowMsg}${wMsg}`,
        { duration: 6000 },
      )
    },
    [questionGroups, t],
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
  // In single-question view, "jump" simply swaps the displayed question.
  function handleJump(qId) {
    setCurrentQId(qId)
  }

  // --- Submit flow ---
  function handleSubmitClick() {
    setSubmitError('')
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
      clearInterval(timerRef.current)
      clearSubmissionState(accountId, id, submission.id)
      navigate(`/student/submissions/${submission.id}/summary`)
    } catch (err) {
      try {
        const latest = await getSubmission(token, submission.id)
        if (latest.data?.submitted_at) {
          clearInterval(timerRef.current)
          clearSubmissionState(accountId, id, submission.id)
          navigate(`/student/submissions/${submission.id}/summary`)
          return
        }
      } catch {
        // Keep the local draft and original failure so the student can retry.
      }
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
          confidence={extractedConfidence[cellKey(group.q_id, null)]} t={t}
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
          subConfidence={booleanSubConfidence[group.q_id]} t={t}
        />
      )
    }
    return (
      <NumericInput
        qId={group.q_id}
        value={answers[group.q_id] ?? ''}
        onChange={(v) => handleAnswerChange(group.q_id, v)}
        submitted={false}
        confidence={extractedConfidence[cellKey(group.q_id, null)]} t={t}
      />
    )
  }

  // --- States ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('student.take.loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="max-w-2xl border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/student/exercises">{t('student.take.backToExercises')}</Link>
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
    ? t('student.take.submitWarning', { count: unansweredCount })
    : t('student.take.submitFinal')

  // Answer-sheet content (timer + nav grid + submit/exit) — always visible
  // at the top of the right pane on all breakpoints.
  function renderSidebar() {
    return (
      <div className="space-y-4">
        {/* Timer */}
        {secondsLeft !== null && (
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-2 ${timerColor}`}
                aria-label={t('student.take.timer')}
              >
                <Clock className="h-4 w-4" />
                {!timerHidden && (
                  <span className="tabular-nums text-lg font-semibold">
                    {formatTime(secondsLeft)}
                  </span>
                )}
                {overtime && (
                  <Badge variant="destructive" className="text-xs">{t('student.take.overtime')}</Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={toggleTimerHidden}
                aria-label={timerHidden ? t('student.take.showTimer') : t('student.take.hideTimer')}
                title={timerHidden ? t('student.take.showTimer') : t('student.take.hideTimer')}
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
          {submitError && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}
          <Button
            onClick={handleSubmitClick}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? t('student.take.submitting') : t('student.take.submit')}
          </Button>
          <Button
            variant="ghost"
            onClick={handleExitClick}
            disabled={isSubmitting}
            className="w-full"
          >
            {t('student.take.exit')}
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
                {t('student.take.questionCount', { count: questionGroups.length })}
              </p>
            </div>
          </div>

          {overtime && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('student.take.timeExpired')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-pane layout: PDF (left) | attempt controls (right). */}
      <PdfSplitPane fileUrl={pdfUrl}>
        <div className="flex flex-col gap-4">
          {/* Input mode toggle (v0.4) — Manual vs. Photo extraction */}
          <div data-testid="take-input-mode" className="order-1 lg:order-2">
            <Card>
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{t('student.take.inputMode')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('student.take.inputDescription')}
                    </p>
                  </div>
                  <ButtonGroup aria-label={t('student.take.inputMode')}>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[48px]"
                      variant={inputMode === 'manual' ? 'default' : 'outline'}
                      onClick={() => setInputMode('manual')}
                      aria-pressed={inputMode === 'manual'}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      {t('student.take.manual')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[48px]"
                      variant={inputMode === 'photo' ? 'default' : 'outline'}
                      onClick={() => setInputMode('photo')}
                      aria-pressed={inputMode === 'photo'}
                    >
                      <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                      {t('student.take.uploadPhoto')}
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
          </div>

          {/* Single-question view — first on mobile to minimize scrolling before answering. */}
          {(() => {
            const idx = questionGroups.findIndex((g) => g.q_id === currentQId)
            const group = idx >= 0 ? questionGroups[idx] : null
            if (!group) return null
            return (
              <Card data-testid="take-current-question" className="order-2 lg:order-3">
                <CardContent className="space-y-4 pt-5">
                  <p className="text-sm font-semibold">
                    {t('student.take.questionTitle', { index: idx + 1, id: group.q_id })}
                  </p>
                  {renderQuestionInput(group)}
                  <div className="flex items-center justify-between border-t pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleJump(questionGroups[idx - 1].q_id)}
                      disabled={idx === 0}
                    >
                      <ArrowLeft aria-hidden="true" />
                      {t('student.take.previous')}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t('student.take.questionProgress', { current: idx + 1, total: questionGroups.length })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleJump(questionGroups[idx + 1].q_id)}
                      disabled={idx === questionGroups.length - 1}
                    >
                      {t('student.take.next')}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {/* Desktop keeps the answer sheet first and sticky; mobile reaches it after the current input. */}
          <div data-testid="take-answer-sheet" className="order-3 lg:order-1 lg:sticky lg:top-20 lg:z-10">
            <Card>
              <CardContent className="pt-5">
                {renderSidebar()}
              </CardContent>
            </Card>
          </div>
        </div>
      </PdfSplitPane>

      {/* Dialogs */}
      <Dialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('student.take.leaveTitle')}</DialogTitle>
            <DialogDescription>
              {t('student.take.leaveDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelLeave}>{t('student.take.stay')}</Button>
            <Button variant="destructive" onClick={handleConfirmLeave}>{t('student.take.leave')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('student.take.submitTitle')}</DialogTitle>
            <DialogDescription>
              {confirmMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelConfirm}>{t('student.take.cancel')}</Button>
            <Button onClick={handleConfirmSubmit}>{t('student.take.confirmSubmit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Clock, Download, Eye, EyeOff, ListChecks, X } from 'lucide-react'
import { ButtonGroup } from '@/components/ui/button-group'
import { toast } from 'sonner'
import { getExercise, getSubmission, getSubmissionExercisePdf, submitAnswers } from '@/lib/api'
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
import { QuestionImagePanel } from '@/components/question-image-panel'
import { QuestionNavGrid, countUnanswered } from '@/components/question-nav-grid'
import {
  clearSubmissionState,
  getSubmissionPointer,
  loadSubmissionDraft,
  saveSubmissionDraft,
} from '@/lib/submission-draft'

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

function McqInput({ qId, value, onChange, submitted, t }) {
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
    </div>
  )
}

function BooleanGroupInput({ qId, subRows, subAnswers, onSubChange, submitted, t }) {
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
          </div>
        )
      })}
    </div>
  )
}

function NumericInput({ qId, value, onChange, submitted, t }) {
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
  const [attemptSchema, setAttemptSchema] = useState([])
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
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window === 'undefined'
    || typeof window.matchMedia !== 'function'
    || window.matchMedia('(min-width: 1280px)').matches
  ))
  const [isPhone, setIsPhone] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && !window.matchMedia('(min-width: 768px)').matches
  ))
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)

  // The currently displayed question (single-question view).
  // The student picks a question by clicking a cell in the nav grid.
  const [currentQId, setCurrentQId] = useState(null)
  const questionWorkspaceRef = useRef(null)
  const questionHeadingRef = useRef(null)
  const focusAfterSheetCloseRef = useRef(false)

  const [draftReady, setDraftReady] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined

    const desktopQuery = window.matchMedia('(min-width: 1280px)')
    const tabletQuery = window.matchMedia('(min-width: 768px)')
    const handleDesktopChange = (event) => {
      setIsDesktop(event.matches)
      if (event.matches) setAnswerSheetOpen(false)
    }
    const handlePhoneChange = event => setIsPhone(!event.matches)
    desktopQuery.addEventListener?.('change', handleDesktopChange)
    tabletQuery.addEventListener?.('change', handlePhoneChange)
    return () => {
      desktopQuery.removeEventListener?.('change', handleDesktopChange)
      tabletQuery.removeEventListener?.('change', handlePhoneChange)
    }
  }, [])

  // --- Init ---
  useEffect(() => {
    async function init() {
      setIsLoading(true)
      setError('')

      try {
        const exRes = await getExercise(id, token)
        const ex = exRes.data
        setExercise(ex)

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
        const pinnedSchema = sub.question_asset_set_id && sub.answers?.length
          ? sub.answers.map(({ q_id, sub_id, type }) => ({ q_id, sub_id, type }))
          : ex.schema || []
        const groups = groupSchema(pinnedSchema)
        setAttemptSchema(pinnedSchema)
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

        const draft = loadSubmissionDraft({
          accountId,
          submissionId: sub.id,
          schema: pinnedSchema,
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
    })
  }, [accountId, answers, draftReady, submission])

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
  }, [])

  const handleBooleanSubChange = useCallback((qId, subId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] || {}), [subId]: value },
    }))
  }, [])

  // --- Nav grid jump ---
  // Every navigation control changes both sides of the question workspace.
  function handleJump(qId) {
    setCurrentQId(qId)
    questionWorkspaceRef.current?.scrollIntoView?.({ block: 'start' })
    questionHeadingRef.current?.focus({ preventScroll: true })
  }

  function handleMobileJump(qId) {
    focusAfterSheetCloseRef.current = true
    setCurrentQId(qId)
    setAnswerSheetOpen(false)
  }

  function handleMobileSheetCloseAutoFocus(event) {
    if (!focusAfterSheetCloseRef.current) return
    event.preventDefault()
    focusAfterSheetCloseRef.current = false
    questionWorkspaceRef.current?.scrollIntoView?.({ block: 'start' })
    questionHeadingRef.current?.focus({ preventScroll: true })
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
      if (!isDesktop) setAnswerSheetOpen(true)
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

  async function handleDownloadPdf() {
    if (!submission || isDownloadingPdf) return
    setIsDownloadingPdf(true)
    try {
      const blob = await getSubmissionExercisePdf(token, submission.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `exercise-${exercise.id}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('student.take.downloadPdfFailed'))
    } finally {
      setIsDownloadingPdf(false)
    }
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
          t={t}
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
          t={t}
        />
      )
    }
    return (
      <NumericInput
        qId={group.q_id}
        value={answers[group.q_id] ?? ''}
        onChange={(v) => handleAnswerChange(group.q_id, v)}
        submitted={false}
        t={t}
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

  const unansweredCount = countUnanswered(attemptSchema, answers)
  const confirmMessage = unansweredCount > 0
    ? t('student.take.submitWarning', { count: unansweredCount })
    : t('student.take.submitFinal')
  const answeredCount = questionGroups.length - unansweredCount

  function renderSubmissionActions({
    onSubmit = handleSubmitClick,
    onExit = handleExitClick,
  } = {}) {
    return (
      <div className="flex flex-col gap-2">
        {submitError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {submitError}
          </p>
        )}
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="w-full"
        >
          {isSubmitting ? t('student.take.submitting') : t('student.take.submit')}
        </Button>
        <Button
          variant="destructive"
          onClick={onExit}
          disabled={isSubmitting}
          className="w-full"
        >
          {t('student.take.exit')}
        </Button>
      </div>
    )
  }

  function renderSidebar({
    onJump = handleJump,
    onSubmit = handleSubmitClick,
    onExit = handleExitClick,
    includeSubmissionActions = true,
  } = {}) {
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
            schema={attemptSchema}
            answers={answers}
            currentQId={currentQId}
            onJump={onJump}
          />
        )}

        {includeSubmissionActions && renderSubmissionActions({ onSubmit, onExit })}
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
            {isPhone && submission && (
              <div className="w-full space-y-2 sm:w-auto sm:max-w-xs">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 w-full"
                  disabled={isDownloadingPdf}
                  onClick={handleDownloadPdf}
                >
                  <Download aria-hidden="true" />
                  {isDownloadingPdf
                    ? t('student.take.downloadingPdf')
                    : t('student.take.downloadPdf')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t('student.take.mobilePaperHint')}
                </p>
              </div>
            )}
          </div>

          {overtime && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('student.take.timeExpired')}
            </div>
          )}
        </CardContent>
      </Card>

      {!isDesktop && (
        <div className="sticky top-16 z-30 -mx-1 bg-background/95 px-1 py-2 backdrop-blur md:top-0">
          <Button
            type="button"
            variant="outline"
            className="min-h-16 w-full justify-between bg-background px-4 shadow-sm"
            aria-label={t('student.nav.openAnswerSheet')}
            aria-haspopup="dialog"
            aria-expanded={answerSheetOpen}
            onClick={() => setAnswerSheetOpen(true)}
          >
            <span className="min-w-0 text-start">
              <span className="flex items-center gap-2 font-semibold">
                <ListChecks aria-hidden="true" />
                {t('student.nav.answerSheet')}
              </span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {t('student.nav.answeredProgress', { answered: answeredCount, total: questionGroups.length })}
              </span>
            </span>
            {secondsLeft !== null && (
              <span className={`flex shrink-0 items-center gap-1.5 tabular-nums ${timerColor}`} aria-hidden="true">
                <Clock />
                {!timerHidden && formatTime(secondsLeft)}
              </span>
            )}
          </Button>
        </div>
      )}

      {(() => {
        const idx = questionGroups.findIndex((group) => group.q_id === currentQId)
        const group = idx >= 0 ? questionGroups[idx] : null
        if (!group) return null
        const adjacentQIds = [questionGroups[idx - 1]?.q_id, questionGroups[idx + 1]?.q_id]
          .filter((qId) => qId !== undefined)

        return (
          <div
            ref={questionWorkspaceRef}
            data-testid="take-question-workspace"
            className="grid scroll-mt-36 gap-4 md:scroll-mt-20 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start"
          >
            <Card data-testid="take-question-image" className="xl:sticky xl:top-20">
              <CardContent className="space-y-4 pt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    ref={questionHeadingRef}
                    tabIndex={-1}
                    className="text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-live="polite"
                  >
                    {t('student.take.questionTitle', { index: idx + 1, id: group.q_id })}
                  </h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('student.take.questionProgress', { current: idx + 1, total: questionGroups.length })}
                  </span>
                </div>
                <QuestionImagePanel
                  token={token}
                  assets={submission?.question_assets || []}
                  currentQId={group.q_id}
                  adjacentQIds={adjacentQIds}
                />
              </CardContent>
            </Card>

            <div className="space-y-4" data-testid="take-answer-controls">
              {isDesktop && (
                <Card>
                  <CardContent className="pt-5">
                    {renderSidebar({ includeSubmissionActions: false })}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="space-y-4 pt-5">
                  <h3 className="text-sm font-semibold">{t('student.results.yourAnswer')}</h3>
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

              {isDesktop && (
                <Card>
                  <CardContent className="pt-5">
                    {renderSubmissionActions()}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )
      })()}

      {!isDesktop && (
        <Sheet open={answerSheetOpen} onOpenChange={setAnswerSheetOpen}>
          <SheetContent
            closeLabel={t('common.close')}
            aria-describedby={undefined}
            className="pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onCloseAutoFocus={handleMobileSheetCloseAutoFocus}
          >
            <SheetHeader>
              <SheetTitle className="sr-only">{t('student.nav.answerSheet')}</SheetTitle>
            </SheetHeader>
            {renderSidebar({
              onJump: handleMobileJump,
              onSubmit: () => {
                setAnswerSheetOpen(false)
                handleSubmitClick()
              },
              onExit: () => {
                setAnswerSheetOpen(false)
                handleExitClick()
              },
            })}
          </SheetContent>
        </Sheet>
      )}

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

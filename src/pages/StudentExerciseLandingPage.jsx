import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle, Clock } from 'lucide-react'
import { createSubmission, getExercise, getSubmission, listMySubmissions } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  clearSubmissionState,
  getSubmissionPointer,
  setSubmissionPointer,
} from '@/lib/submission-draft'
import { formatDuration } from '@/lib/format'

export default function StudentExerciseLandingPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const { token, user } = useAuth()
  const accountId = user.id
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [exercise, setExercise] = useState(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [hasResumable, setHasResumable] = useState(false)
  const [submittedSubmissions, setSubmittedSubmissions] = useState([])
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [showStartOver, setShowStartOver] = useState(false)
  const [resumableSubmissionId, setResumableSubmissionId] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError('')
      setSubmittedSubmissions([])
      try {
        const res = await getExercise(id, token)
        const ex = res.data
        setExercise(ex)

        const uniqueQIds = new Set((ex.schema || []).map((r) => r.q_id))
        setQuestionCount(uniqueQIds.size)

        const savedSubId = getSubmissionPointer(accountId, id)
        const hasServerAttemptState = Object.hasOwn(ex, 'latest_attempt_number')
        let resumable = false
        if (hasServerAttemptState) {
          if (ex.in_progress_submission_id) {
            const serverSubmissionId = String(ex.in_progress_submission_id)
            if (savedSubId && savedSubId !== serverSubmissionId) {
              clearSubmissionState(accountId, id, savedSubId)
            }
            setSubmissionPointer(accountId, id, serverSubmissionId)
            setHasResumable(true)
            setResumableSubmissionId(serverSubmissionId)
            resumable = true
          } else {
            if (savedSubId) clearSubmissionState(accountId, id, savedSubId)
            setHasResumable(false)
            setResumableSubmissionId(null)
          }
        } else if (savedSubId) {
          try {
            const subRes = await getSubmission(token, savedSubId)
            if (subRes.data && !subRes.data.submitted_at) {
              setHasResumable(true)
              setResumableSubmissionId(savedSubId)
              resumable = true
            } else {
              clearSubmissionState(accountId, id, savedSubId)
            }
          } catch (submissionError) {
            if ([403, 404].includes(submissionError.status)) {
              clearSubmissionState(accountId, id, savedSubId)
            } else {
              setHasResumable(true)
              setResumableSubmissionId(savedSubId)
              setStartError(t('student.landing.savedAttemptError'))
              resumable = true
            }
          }
        }

        if (!resumable && ex.in_progress_submission_id) {
          const serverSubmissionId = String(ex.in_progress_submission_id)
          setSubmissionPointer(accountId, id, serverSubmissionId)
          setHasResumable(true)
          setResumableSubmissionId(serverSubmissionId)
          resumable = true
        }

        try {
          const pageSize = 100
          const submissions = []
          let offset = 0

          while (true) {
            const subsRes = await listMySubmissions(token, {
              exerciseId: id,
              limit: pageSize,
              offset,
            })
            const page = subsRes.data?.submissions || []
            submissions.push(...page)

            const total = Number(subsRes.data?.total)
            if (page.length < pageSize || (Number.isFinite(total) && submissions.length >= total)) break
            offset += page.length
          }

          setSubmittedSubmissions(submissions)
        } catch {
          // best effort — exercise actions remain available if results cannot be loaded
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [accountId, id, reloadKey, t, token])

  async function handleStart({ replacing = false } = {}) {
    setIsStarting(true)
    setStartError('')
    try {
      const payload = {
        exercise_id: Number(id),
        known_latest_attempt_number: exercise.latest_attempt_number ?? 0,
      }
      if (replacing) payload.replace_submission_id = Number(resumableSubmissionId)
      const subRes = await createSubmission(token, payload)
      if (replacing) clearSubmissionState(accountId, id, resumableSubmissionId)
      setSubmissionPointer(accountId, id, subRes.data.id)
      navigate(`/student/exercises/${id}/take`)
    } catch (err) {
      if (['ATTEMPT_LIMIT_REACHED', 'ATTEMPT_STATE_CHANGED'].includes(err.code)) {
        setReloadKey((key) => key + 1)
      }
      setStartError(err.message)
      setShowStartOver(false)
      setIsStarting(false)
    }
  }

  function handleResume() {
    navigate(`/student/exercises/${id}/take`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('student.landing.loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="max-w-2xl border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/student/exercises">{t('student.landing.backToExercises')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (exercise.is_student_ready !== 1 && !hasResumable && submittedSubmissions.length === 0) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <h1 className="text-[length:var(--sc-type-title-size)] leading-[var(--sc-type-title-line-height)] font-[var(--sc-type-title-weight)]">
              {exercise.title}
            </h1>
            <p className="text-sm text-muted-foreground">{t('student.landing.unavailable')}</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/student/exercises">{t('student.landing.backToExercises')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const hasServerStartState = Object.hasOwn(exercise, 'can_start_attempt')
  const canStartAttempt = hasServerStartState
    ? Boolean(exercise.can_start_attempt)
    : submittedSubmissions.length === 0
  const canStartOver = hasServerStartState
    ? Boolean(exercise.can_start_attempt)
    : true

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-primary/15 bg-sc-primary-container/45">
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <h1 className="text-[length:var(--sc-type-headline-size)] leading-[var(--sc-type-headline-line-height)] font-[var(--sc-type-headline-weight)] tracking-[-0.03em] text-balance">
              {exercise.title}
            </h1>
            <p className="max-w-xl text-sm text-sc-on-primary-container/75">
              {hasResumable
                ? t('student.landing.resumeDescription')
                : t('student.landing.startDescription')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            {exercise.is_timed ? (
              <>
                <Badge>{t('student.exercises.timed')}</Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatDuration(exercise.duration_minutes, i18n.resolvedLanguage)}
                </span>
              </>
            ) : (
              <Badge variant="secondary">{t('student.exercises.untimed')}</Badge>
            )}
            <span className="text-muted-foreground">
              {t('student.exercises.questionCount', { count: questionCount })}
            </span>
          </div>

          {startError && <p role="alert" className="text-sm text-destructive">{startError}</p>}

          {hasResumable ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="min-h-[48px] px-5" onClick={handleResume}>{t('student.landing.resume')}</Button>
                {canStartOver ? (
                  <Button variant="outline" onClick={() => setShowStartOver(true)} disabled={isStarting}>
                    {isStarting ? t('student.landing.starting') : t('student.landing.startOver')}
                  </Button>
                ) : (
                  <p className="self-center text-sm text-muted-foreground">{t('student.attempt.noneRemaining')}</p>
                )}
                <Button variant="ghost" asChild>
                  <Link to="/student/exercises">{t('student.landing.back')}</Link>
                </Button>
              </div>
            </div>
          ) : submittedSubmissions.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-success-muted px-4 py-3 text-sm text-success">
                <CheckCircle className="h-5 w-5 shrink-0" />
                {t('student.landing.submitted')}
              </div>
              <p className="text-sm font-medium">
                {canStartAttempt
                  ? t('student.attempt.next', { number: exercise.next_attempt_number })
                  : t('student.attempt.noneRemaining')}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                {canStartAttempt && (
                  <Button onClick={() => handleStart()} disabled={isStarting}>
                    {isStarting ? t('student.landing.starting') : t('student.landing.tryAgain')}
                  </Button>
                )}
                <Button variant="ghost" asChild>
                  <Link to="/student/exercises">{t('student.landing.back')}</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
              {canStartAttempt ? (
                <Button className="min-h-[48px] px-6 text-base" onClick={() => handleStart()} disabled={isStarting}>
                  {isStarting ? t('student.landing.starting') : t('student.exercises.start')}
                </Button>
              ) : (
                <p className="self-center text-sm text-muted-foreground">{t('student.attempt.noneRemaining')}</p>
              )}
              <Button variant="ghost" asChild>
                <Link to="/student/exercises">{t('student.landing.back')}</Link>
              </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {submittedSubmissions.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-[length:var(--sc-type-title-size)] leading-[var(--sc-type-title-line-height)] font-[var(--sc-type-title-weight)]">
              {t('student.landing.resultsTitle')}
            </h2>
            <ul className="mt-4 divide-y" aria-label={t('student.landing.resultsTitle')}>
              {submittedSubmissions.map((submission) => (
                <li key={submission.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t('student.attempt.label', { number: submission.attempt_number })}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {submission.score === null || submission.score === undefined
                        ? t('student.results.noScore')
                        : `${submission.score} / 10`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={`/student/submissions/${submission.id}/summary`}
                      aria-label={t('student.landing.viewAttemptResult', { number: submission.attempt_number })}
                    >
                      {t('student.landing.viewResult')}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Dialog open={showStartOver} onOpenChange={setShowStartOver}>
        <DialogContent closeLabel={t('common.close')}>
          <DialogHeader>
            <DialogTitle>{t('student.landing.startOverTitle')}</DialogTitle>
            <DialogDescription>
              {t('student.landing.clearAnswers')}
              {exercise.is_timed ? t('student.landing.restartTimer') : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartOver(false)}>{t('student.landing.keepAttempt')}</Button>
            <Button
              variant="destructive"
              disabled={isStarting}
              onClick={() => handleStart({ replacing: true })}
            >
              {isStarting ? t('student.landing.starting') : t('student.landing.startOver')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

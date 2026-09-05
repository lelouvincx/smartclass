import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { getSubmission } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'

function formatTimeTaken(started_at, submitted_at) {
  if (!started_at || !submitted_at) return '—'
  const start = new Date(started_at.endsWith('Z') ? started_at : started_at + 'Z')
  const end = new Date(submitted_at.endsWith('Z') ? submitted_at : submitted_at + 'Z')
  const secs = Math.round((end - start) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function StudentSummaryPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const { token } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState(null)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError('')
      try {
        const res = await getSubmission(token, id)
        setSubmission(res.data)
      } catch (err) {
        setError(err.message || i18n.t('student.results.failedSummary'))
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, token])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('student.results.loadingSummary')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="max-w-2xl border-destructive/50">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" asChild className="mt-4">
            <Link to="/student/exercises">{t('student.results.backToExercises')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { exercise_title, attempt_number, score, submitted_at, started_at, answers = [] } = submission

  const counts = answers.reduce(
    (acc, a) => {
      if (a.submitted_answer == null) acc.skipped++
      else if (a.is_correct === 1) acc.correct++
      else acc.incorrect++
      return acc
    },
    { correct: 0, incorrect: 0, skipped: 0 },
  )

  const timeTaken = formatTimeTaken(started_at, submitted_at)

  const submittedDate = submitted_at
    ? formatDateTime(submitted_at + (submitted_at.endsWith('Z') ? '' : 'Z'), i18n.resolvedLanguage)
    : '—'

  const scoreColor =
    score === null || score === undefined
      ? 'text-foreground'
      : score >= 7
      ? 'text-success'
      : score >= 4
      ? 'text-warning'
      : 'text-destructive'

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-primary/15">
        <CardContent className="space-y-6 pt-6">
          <div>
            <h1 className="text-2xl font-semibold">{exercise_title}</h1>
            <p className="mt-1 text-sm font-medium">{t('student.attempt.label', { number: attempt_number })}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('student.results.submitted', { date: submittedDate })}</p>
          </div>

          {score !== null && score !== undefined && (
            <div
              role="meter"
              aria-label={t('student.results.score')}
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={score}
              aria-valuetext={t('student.results.scoreOutOf', { score })}
              className="mx-auto flex min-h-52 max-w-sm flex-col items-center justify-center rounded-[var(--sc-component-focal-shape)] bg-sc-primary-container px-6 py-8 text-center text-sc-on-primary-container transition-[border-radius,transform] duration-[var(--sc-motion-duration-long)] ease-[var(--sc-motion-expressive)] motion-safe:hover:scale-[1.01]"
            >
              <p className={`text-[length:var(--sc-type-display-size)] leading-[var(--sc-type-display-line-height)] font-[var(--sc-type-display-weight)] tracking-[-0.04em] tabular-nums ${scoreColor}`}>
                {score}
              </p>
              <p className="mt-2 text-sm font-medium text-sc-on-primary-container/75">{t('student.results.outOf10')}</p>
            </div>
          )}

          <div className="flex justify-around rounded-lg border p-4">
            <div className="flex flex-col items-center gap-1">
              <span aria-label={t('student.results.correctCount')} className="text-2xl font-bold text-success">
                {counts.correct}
              </span>
              <span className="text-xs text-muted-foreground">{t('student.results.correctParts')}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span aria-label={t('student.results.incorrectCount')} className="text-2xl font-bold text-destructive">
                {counts.incorrect}
              </span>
              <span className="text-xs text-muted-foreground">{t('student.results.incorrectParts')}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span aria-label={t('student.results.skippedCount')} className="text-2xl font-bold text-muted-foreground">
                {counts.skipped}
              </span>
              <span className="text-xs text-muted-foreground">{t('student.results.skippedParts')}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('student.results.partsNote')}
          </p>

          <p className="text-sm text-muted-foreground">
            {t('student.results.timeTaken')}{' '}
            <span className="font-medium text-foreground">{timeTaken}</span>
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link to={`/student/submissions/${id}/review`}>{t('student.results.detailed')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/student/exercises">{t('student.results.backToExercises')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

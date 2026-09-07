import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Clock, History } from '@/components/material-symbol'
import { Link } from 'react-router-dom'
import { listMySubmissions } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { formatRelativeTime } from '@/lib/format'

/**
 * Score badge with semantic status coding:
 *   success     ≥ 7.0
 *   warning     ≥ 4.0
 *   destructive < 4.0
 */
function ScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  const colorClass =
    score >= 7 ? 'bg-success-muted text-success' :
    score >= 4 ? 'bg-warning-muted text-warning' :
    'bg-destructive-muted text-destructive'

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${colorClass}`}>
      {score} / 10
    </span>
  )
}

function submittedAtLabel(submittedAt, language) {
  if (!submittedAt) return '-'

  return formatRelativeTime(
    submittedAt + (submittedAt.endsWith('Z') ? '' : 'Z'),
    language,
  )
}

function SubmissionCard({ submission, t, language }) {
  const modeLabel = t(`student.submissions.${submission.mode}`, { defaultValue: submission.mode })

  return (
    <li>
      <article className="group/submission grid gap-4 rounded-[var(--sc-component-card-shape)] border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-[var(--sc-motion-duration-medium)] ease-[var(--sc-motion-standard)] hover:border-sc-outline hover:shadow-[var(--shadow-raised)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold leading-6 tracking-[-0.01em] text-foreground text-balance">
              {submission.exercise_title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('student.attempt.label', { number: submission.attempt_number })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="h-7 rounded-full px-3 text-xs font-medium">
              {modeLabel}
            </Badge>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="size-4" aria-hidden="true" />
              {submittedAtLabel(submission.submitted_at, language)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4 sm:min-w-64 sm:justify-end sm:border-t-0 sm:pt-0">
          <ScoreBadge score={submission.score} />
          <Button variant="outline" size="sm" asChild>
            <Link
              to={`/student/submissions/${submission.id}/review`}
              aria-label={`${t('student.submissions.review')}: ${submission.exercise_title}`}
            >
              {t('student.submissions.review')}
              <ArrowRight className="size-4 transition-transform group-hover/submission:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </article>
    </li>
  )
}

export default function StudentSubmissionsPage() {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchSubmissions() {
      setIsLoading(true)
      setError('')
      try {
        const res = await listMySubmissions(token, {})
        setSubmissions(res.data.submissions)
      } catch (err) {
        setError(err.message || i18n.t('student.submissions.failed'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchSubmissions()
  }, [token])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('student.submissions.title')}
        description={t('student.submissions.description')}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">{t('student.submissions.loading')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                {t('student.submissions.retry')}
              </Button>
            </div>
          ) : submissions.length === 0 ? (
            <EmptyState
              icon={History}
              title={t('student.submissions.empty')}
              description={t('student.submissions.emptyDescription')}
              action={
                <Button variant="outline" asChild>
                  <Link to="/student/exercises">{t('student.submissions.browse')}</Link>
                </Button>
              }
            />
          ) : (
            <ol className="space-y-3 p-3 sm:p-4" aria-label={t('student.submissions.title')}>
              {submissions.map((sub) => (
                <SubmissionCard
                  key={sub.id}
                  submission={sub}
                  t={t}
                  language={i18n.resolvedLanguage}
                />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

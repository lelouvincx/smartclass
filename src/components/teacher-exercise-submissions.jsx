import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck } from '@/components/material-symbol'
import { Link } from 'react-router-dom'
import { listTeacherExerciseSubmissions } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { formatDateTime } from '@/lib/format'

export function TeacherExerciseSubmissions({ exerciseId, token }) {
  const { t, i18n } = useTranslation()
  const [submissions, setSubmissions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true

    async function loadSubmissions() {
      setIsLoading(true)
      setError('')
      try {
        const response = await listTeacherExerciseSubmissions(token, exerciseId)
        if (active) setSubmissions(response.data.submissions)
      } catch (loadError) {
        if (active) setError(loadError.message || i18n.t('teacher.submissions.loadError'))
      } finally {
        if (active) setIsLoading(false)
      }
    }

    loadSubmissions()
    return () => { active = false }
  }, [exerciseId, retryKey, token])

  return (
    <Card>
      <CardHeader className="border-b px-5 py-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t('teacher.submissions.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('teacher.submissions.description')}</p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground" role="status">
            {t('teacher.submissions.loading')}
          </p>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => setRetryKey((key) => key + 1)}>
              {t('teacher.submissions.retry')}
            </Button>
          </div>
        ) : submissions.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={t('teacher.submissions.empty')}
            description={t('teacher.submissions.emptyDescription')}
            className="min-h-48 rounded-none border-0"
          />
        ) : (
          <ul className="divide-y">
            {submissions.map((submission) => {
              const studentLabel = submission.student_name || submission.student_phone
              const submittedAt = submission.submitted_at.endsWith('Z')
                ? submission.submitted_at
                : `${submission.submitted_at}Z`

              return (
                <li key={submission.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{studentLabel}</p>
                    {submission.student_name && (
                      <p className="text-xs text-muted-foreground">{submission.student_phone}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                      {formatDateTime(submittedAt, i18n.resolvedLanguage)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <span className="rounded-full bg-selection px-3 py-1 text-sm font-semibold tabular-nums text-primary">
                      {submission.score ?? '-'}{submission.score != null && ' / 10'}
                    </span>
                    <span className="hidden min-w-44 text-sm text-muted-foreground sm:inline">
                      {formatDateTime(submittedAt, i18n.resolvedLanguage)}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" className="justify-center" asChild>
                    <Link
                      to={`/teacher/submissions/${submission.id}/review`}
                      aria-label={t('teacher.submissions.viewNamed', { name: studentLabel })}
                    >
                      {t('teacher.submissions.view')}
                    </Link>
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

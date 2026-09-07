import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck } from '@/components/material-symbol'
import { Link } from 'react-router-dom'
import { listTeacherExerciseSubmissions } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
          <Table className="table-fixed sm:table-auto">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[52%] px-3 sm:w-auto sm:px-5">
                  {t('teacher.submissions.student')}
                </TableHead>
                <TableHead className="w-[23%] sm:w-auto">{t('teacher.submissions.score')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('teacher.submissions.submitted')}</TableHead>
                <TableHead className="w-1/4 text-right sm:w-auto">{t('teacher.submissions.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => {
                const studentLabel = submission.student_name || submission.student_phone
                const submittedAt = submission.submitted_at.endsWith('Z')
                  ? submission.submitted_at
                  : `${submission.submitted_at}Z`

                return (
                  <TableRow key={submission.id}>
                    <TableCell className="whitespace-normal px-3 sm:px-5">
                      <span className="block font-medium text-foreground">{studentLabel}</span>
                      {submission.student_name && (
                        <span className="block text-xs text-muted-foreground">{submission.student_phone}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {submission.score ?? '—'}{submission.score != null && ' / 10'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {formatDateTime(submittedAt, i18n.resolvedLanguage)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={`/teacher/submissions/${submission.id}/review`}
                          aria-label={t('teacher.submissions.viewNamed', { name: studentLabel })}
                        >
                          {t('teacher.submissions.view')}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

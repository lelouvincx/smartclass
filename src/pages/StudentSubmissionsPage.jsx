import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listMySubmissions } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { formatRelativeTime } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Score badge with semantic status coding:
 *   success     ≥ 7.0
 *   warning     ≥ 4.0
 *   destructive < 4.0
 */
function ScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  const colorClass =
    score >= 7 ? 'bg-success-muted text-success' :
    score >= 4 ? 'bg-warning-muted text-warning' :
    'bg-destructive-muted text-destructive'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {score} / 10
    </span>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('student.submissions.exercise')}</TableHead>
                    <TableHead>{t('student.submissions.score')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('student.submissions.mode')}</TableHead>
                    <TableHead>{t('student.submissions.date')}</TableHead>
                    <TableHead className="text-right">{t('student.submissions.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <span className="block font-medium">{sub.exercise_title}</span>
                        <span className="text-xs text-muted-foreground">
                          {t('student.attempt.label', { number: sub.attempt_number })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={sub.score} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {t(`student.submissions.${sub.mode}`, { defaultValue: sub.mode })}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(
                          sub.submitted_at + (sub.submitted_at.endsWith('Z') ? '' : 'Z'),
                          i18n.resolvedLanguage,
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/student/submissions/${sub.id}/review`}>
                            {t('student.submissions.review')}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

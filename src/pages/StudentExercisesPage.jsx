import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listExercises } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { cn } from '@/lib/utils'
import { formatDuration, formatTime } from '@/lib/format'
import { useAuth } from '@/lib/auth-context'
import { loadStudentExerciseStates } from '@/lib/student-exercise-state'

function getExerciseAction(item, state, t) {
  if (state?.type === 'resume') {
    return {
      href: `/student/exercises/${item.id}/take`,
      label: t('student.exercises.resume'),
      accessibleLabel: t('student.exercises.resumeExercise', { title: item.title }),
    }
  }
  if (state?.type === 'result') {
    return {
      href: `/student/submissions/${state.submissionId}/summary`,
      label: t('student.exercises.viewResult'),
      accessibleLabel: t('student.exercises.viewResultNamed', { title: item.title }),
    }
  }
  return {
    href: `/student/exercises/${item.id}`,
    label: t('student.exercises.start'),
    accessibleLabel: t('student.exercises.startExercise', { title: item.title }),
  }
}

export default function StudentExercisesPage() {
  const { t, i18n } = useTranslation()
  const { token, user } = useAuth()
  const [items, setItems] = useState([])
  const [exerciseStates, setExerciseStates] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)

  async function loadExercises() {
    setIsLoading(true)
    setError('')

    try {
      const response = await listExercises(token)
      const exercises = (response.data || []).filter((exercise) => (
        exercise.is_student_ready === 1 || exercise.in_progress_submission_id
      ))
      setItems(exercises)
      setExerciseStates(await loadStudentExerciseStates({
        accountId: user.id,
        exercises,
        token,
      }))
      setLastRefreshed(new Date())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadExercises()
  }, [token, user.id])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('student.exercises.title')}
        description={t('student.exercises.description')}
        actions={
          <>
            {lastRefreshed && !isLoading && (
              <span className="self-center text-xs text-muted-foreground" aria-label={t('student.exercises.refreshed')}>
                {t('student.exercises.updated', { time: formatTime(lastRefreshed, i18n.resolvedLanguage) })}
              </span>
            )}
            <Button
              variant="outline"
              size="icon"
              className="size-[48px]"
              onClick={loadExercises}
              disabled={isLoading}
              aria-label={t('student.exercises.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </>
        }
      />

      <Card>
        {isLoading && (
          <p className="p-5 text-sm text-muted-foreground">{t('student.exercises.loading')}</p>
        )}

        {!isLoading && error && (
          <p className="p-5 text-sm text-destructive">{error}</p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title={t('student.exercises.empty')}
            description={t('student.exercises.emptyDescription')}
          />
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full border-collapse text-sm">
                <caption className="sr-only">{t('student.exercises.available')}</caption>
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">{t('student.exercises.titleColumn')}</th>
                    <th scope="col" className="px-4 py-3">{t('student.exercises.duration')}</th>
                    <th scope="col" className="px-4 py-3">{t('student.exercises.questions')}</th>
                    <th scope="col" className="px-4 py-3">{t('student.exercises.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const action = getExerciseAction(item, exerciseStates[item.id], t)
                    return (
                      <tr key={item.id} className="border-t">
                        <th scope="row" className="px-4 py-3 text-left font-medium">{item.title}</th>
                        <td className="px-4 py-3">
                          {item.is_timed ? (
                            <span>
                              <Badge variant="default" className="mr-2">{t('student.exercises.timed')}</Badge>
                              {formatDuration(item.duration_minutes, i18n.resolvedLanguage)}
                            </span>
                          ) : (
                            <Badge variant="secondary">{t('student.exercises.untimed')}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">{item.question_count}</td>
                        <td className="px-4 py-3">
                          <Button asChild variant="link" size="sm">
                            <Link to={action.href} aria-label={action.accessibleLabel}>
                              {action.label}
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y sm:hidden" aria-label={t('student.exercises.compact')}>
              {items.map((item) => {
                const action = getExerciseAction(item, exerciseStates[item.id], t)
                return (
                  <li key={item.id} className="space-y-3 p-4">
                    <p className="font-medium">{item.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {item.is_timed ? (
                        <>
                          <Badge variant="default">{t('student.exercises.timed')}</Badge>
                          <span>{formatDuration(item.duration_minutes, i18n.resolvedLanguage)}</span>
                        </>
                      ) : (
                        <Badge variant="secondary">{t('student.exercises.untimed')}</Badge>
                      )}
                      <span className="text-muted-foreground">{t('student.exercises.questionCount', { count: item.question_count })}</span>
                    </div>
                    <Button asChild size="sm" className="min-h-[48px] w-full">
                      <Link to={action.href} aria-label={action.accessibleLabel}>
                        {action.label}
                      </Link>
                    </Button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, RefreshCw, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listExercises } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'
import { cn } from '@/lib/utils'
import { formatDateTime, formatDuration, formatTime } from '@/lib/format'

function formatUpdatedAt(value, language) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? '—' : formatDateTime(date, language)
}

export default function TeacherExercisesPage() {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState(null)

  async function loadExercises() {
    setIsLoading(true)
    setError('')

    try {
      const response = await listExercises()
      setItems(response.data || [])
      setLastRefreshed(new Date())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadExercises()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('teacher.exercises.title')}
        description={t('teacher.exercises.description')}
        actions={
          <>
            {lastRefreshed && !isLoading && (
              <span className="self-center text-xs text-muted-foreground" aria-label={t('teacher.exercises.lastRefreshed')}>
                {t('teacher.exercises.updatedTime', { time: formatTime(lastRefreshed, i18n.resolvedLanguage) })}
              </span>
            )}
            <Button
              variant="outline"
              size="icon"
              className="size-[48px]"
              onClick={loadExercises}
              disabled={isLoading}
              aria-label={t('teacher.exercises.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
            <Button asChild>
              <Link to="/teacher/exercises/new">
                <Plus className="h-4 w-4" />
                {t('teacher.exercises.create')}
              </Link>
            </Button>
          </>
        }
      />

      <Card className="py-0">
        {isLoading && (
          <p className="p-5 text-sm text-muted-foreground">{t('teacher.exercises.loading')}</p>
        )}

        {!isLoading && error && (
          <p className="p-5 text-sm text-destructive">{error}</p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title={t('teacher.exercises.empty')}
            description={t('teacher.exercises.emptyDescription')}
            action={
              <Button asChild>
                <Link to="/teacher/exercises/new">{t('teacher.exercises.createFirst')}</Link>
              </Button>
            }
          />
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            <div className="hidden sm:block">
              <table className="min-w-full border-collapse text-sm">
                <caption className="sr-only">{t('teacher.exercises.library')}</caption>
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-3 lg:px-4">{t('teacher.exercises.titleColumn')}</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">{t('teacher.exercises.duration')}</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">{t('teacher.exercises.questions')}</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">{t('teacher.exercises.files')}</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">{t('teacher.exercises.readiness')}</th>
                    <th scope="col" className="px-3 py-3 lg:px-4">{t('teacher.exercises.updated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t hover:bg-muted/50">
                      <th scope="row" className="px-3 py-3 text-left font-medium lg:px-4">
                        <Link
                          to={`/teacher/exercises/${item.id}`}
                          aria-label={t('teacher.exercises.viewNamed', { title: item.title })}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {item.title}
                        </Link>
                      </th>
                      <td className="px-3 py-3 lg:px-4">{Number(item.duration_minutes) > 0 ? formatDuration(item.duration_minutes, i18n.resolvedLanguage) : t('teacher.exercises.untimed')}</td>
                      <td className="px-3 py-3 lg:px-4">{item.question_count}</td>
                      <td className="px-3 py-3 lg:px-4">{item.file_count}</td>
                      <td className="px-3 py-3 lg:px-4">
                        <Badge variant={item.is_student_ready ? 'secondary' : 'outline'}>
                          {t(item.is_student_ready ? 'teacher.exercises.ready' : 'teacher.exercises.preparationRequired')}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground lg:px-4">{formatUpdatedAt(item.updated_at, i18n.resolvedLanguage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y sm:hidden" aria-label={t('teacher.exercises.compactLibrary')}>
              {items.map((item) => (
                <li key={item.id} className="space-y-3 p-4">
                  <p className="font-medium">{item.title}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">{t('teacher.exercises.duration')}</dt>
                      <dd>{Number(item.duration_minutes) > 0 ? formatDuration(item.duration_minutes, i18n.resolvedLanguage) : t('teacher.exercises.untimed')}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('teacher.exercises.questions')}</dt>
                      <dd>{item.question_count}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('teacher.exercises.files')}</dt>
                      <dd>{item.file_count}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">{t('teacher.exercises.readiness')}</dt>
                      <dd className="mt-1">
                        <Badge variant={item.is_student_ready ? 'secondary' : 'outline'}>
                          {t(item.is_student_ready ? 'teacher.exercises.ready' : 'teacher.exercises.preparationRequired')}
                        </Badge>
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">{t('teacher.exercises.updated')}</dt>
                      <dd className="whitespace-nowrap">{formatUpdatedAt(item.updated_at, i18n.resolvedLanguage)}</dd>
                    </div>
                  </dl>
                  <Button asChild size="sm" className="min-h-[48px] w-full">
                    <Link to={`/teacher/exercises/${item.id}`} aria-label={t('teacher.exercises.viewNamed', { title: item.title })}>
                      {t('teacher.exercises.view')}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}

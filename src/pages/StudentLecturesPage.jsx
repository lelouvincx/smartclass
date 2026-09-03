import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listLectures } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { getLecturePath, groupLectureRuns } from '@/lib/lectures'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'

export default function StudentLecturesPage() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const [lectures, setLectures] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadLectures() {
    setIsLoading(true)
    setError('')
    try {
      const response = await listLectures(token)
      setLectures(response.data || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadLectures()
  }, [token])

  let sequence = 0

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={t('student.lectures.title')}
        description={t('student.lectures.description')}
      />

      {isLoading ? (
        <Card><p className="p-5 text-sm text-muted-foreground">{t('student.lectures.loading')}</p></Card>
      ) : error ? (
        <Card>
          <div className="flex flex-col items-start gap-4 p-5">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={loadLectures}>
              {t('student.lectures.retry')}
            </Button>
          </div>
        </Card>
      ) : lectures.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={t('student.lectures.empty')}
            description={t('student.lectures.emptyDescription')}
          />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          {groupLectureRuns(lectures).map((section, sectionIndex) => (
            <section
              key={`${section.name}-${sectionIndex}`}
              className="border-b border-border last:border-b-0"
            >
              <header className="flex items-center gap-3 bg-muted/45 px-4 py-4 sm:px-6">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-primary/10 text-primary">
                  <BookOpen className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-semibold text-foreground">{section.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t('student.lectures.lessonCount', { count: section.lectures.length })}
                  </p>
                </div>
              </header>
              <ol className="divide-y divide-border" role="list">
                {section.lectures.map((lecture) => {
                  sequence += 1
                  return (
                    <li key={lecture.id}>
                      <Link
                        to={getLecturePath(lecture)}
                        aria-label={t('student.lectures.watchNumbered', { number: sequence, title: lecture.title })}
                        className="group flex min-h-[72px] items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-6"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold tabular-nums text-muted-foreground group-hover:border-primary/30 group-hover:text-primary">
                          {sequence}
                        </span>
                        <span className="min-w-0 flex-1 font-medium leading-6 text-foreground">
                          {lecture.title}
                        </span>
                        <span className="hidden items-center gap-2 text-sm font-medium text-primary sm:flex">
                          <Play className="size-4 fill-current" aria-hidden="true" />
                          {t('student.lectures.watch')}
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary motion-reduce:transition-none" aria-hidden="true" />
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </Card>
      )}
    </div>
  )
}

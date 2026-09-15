import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Play, RefreshCw } from '@/components/material-symbol'
import { AccessTierBadge } from '@/components/access-tier-radio-group'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/design-system/empty-state'
import { getLecturePath } from '@/lib/lectures'
import { cn } from '@/lib/utils'

function programmeLabel(programme, t) {
  return t(`curriculum.programmes.${programme}`)
}

function topicLessonCount(topic, t) {
  return t('curriculum.lessonCount', { count: topic.lessons?.length || 0 })
}

function lessonUnitCount(lesson, t) {
  return t('curriculum.unitCount', { count: lesson.unit_count || lesson.units?.length || 0 })
}

function ProgrammeSelector({ programme, programmes, selectProgramme }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1 sm:max-w-sm">
      <label htmlFor="student-curriculum-programme" className="text-sm font-medium text-foreground">
        {t('curriculum.programme')}
      </label>
      <Select value={String(programme)} onValueChange={selectProgramme}>
        <SelectTrigger id="student-curriculum-programme" className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {programmes.map((item) => (
            <SelectItem key={item} value={String(item)}>{programmeLabel(item, t)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function UnitRow({ unit, index, audience }) {
  const { t } = useTranslation()
  const title = unit.lecture?.title || t('curriculum.untitledUnit')
  return (
    <li className="min-w-0 border-t border-border first:border-t-0">
      <Link
        to={getLecturePath(unit.lecture, audience, unit.placement_id)}
        className="group grid min-h-[var(--sc-component-hit-target)] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--sc-component-control-shape)] px-3 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4"
        aria-label={t('curriculum.watchUnit', { number: index + 1, title })}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-muted text-sm font-semibold tabular-nums text-muted-foreground group-hover:text-primary">
          {index + 1}
        </span>
        <span className="min-w-0 space-y-2">
          <span className="block break-words font-medium leading-6 text-foreground">{title}</span>
          <span className="flex flex-wrap items-center gap-2">
            <AccessTierBadge tier={unit.lecture?.minimum_access_tier} />
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
          <Play className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('curriculum.watch')}</span>
          <ArrowRight className="size-4 sm:hidden" aria-hidden="true" />
        </span>
      </Link>
    </li>
  )
}

function LessonCard({ lesson, selected, audience }) {
  const { t } = useTranslation()
  const headingRef = useRef(null)
  const units = lesson.units || []

  useEffect(() => {
    if (!selected) return
    headingRef.current?.scrollIntoView?.({ block: 'center' })
    headingRef.current?.focus?.({ preventScroll: true })
  }, [selected])

  return (
    <div className="rounded-[var(--sc-component-card-shape)]">
      <Card className={cn('min-w-0 overflow-hidden p-0', selected && 'border-primary/50 ring-2 ring-primary/15')}>
        <div className="flex min-w-0 flex-col gap-1 px-4 py-4 sm:px-5">
          <h3
            ref={headingRef}
            tabIndex={selected ? -1 : undefined}
            aria-current={selected ? 'location' : undefined}
            className="break-words rounded-sm text-base font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {lesson.title}
          </h3>
          <p className="text-sm text-muted-foreground">{lessonUnitCount(lesson, t)}</p>
        </div>
        {units.length > 0 ? (
          <ol role="list" aria-label={t('curriculum.unitsInLesson', { title: lesson.title })}>
            {units.map((unit, index) => (
              <UnitRow key={unit.placement_id} unit={unit} index={index} audience={audience} />
            ))}
          </ol>
        ) : (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground sm:px-5">
            {t('curriculum.emptyLessonDescription')}
          </p>
        )}
      </Card>
    </div>
  )
}

function TopicSection({ topic, selectedLesson, audience }) {
  const { t } = useTranslation()
  return (
    <section className="space-y-3" aria-labelledby={`student-curriculum-topic-${topic.id}`}>
      <div className="space-y-1">
        <h2 id={`student-curriculum-topic-${topic.id}`} className="break-words text-xl font-semibold text-foreground">
          {topic.title}
        </h2>
        <p className="text-sm text-muted-foreground">{topicLessonCount(topic, t)}</p>
      </div>
      <div className="space-y-3">
        {(topic.lessons || []).map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} selected={selectedLesson?.id === lesson.id} audience={audience} />
        ))}
      </div>
    </section>
  )
}

export function StudentCurriculumBrowser({ navigation, audience = 'student' }) {
  const { t } = useTranslation()
  const {
    programme,
    programmes,
    topics,
    selectedLesson,
    loading,
    error,
    selectProgramme,
    reload,
  } = navigation

  if (loading) {
    return (
      <div className="space-y-6">
        <ProgrammeSelector programme={programme} programmes={programmes} selectProgramme={selectProgramme} />
        <Card><p className="p-5 text-sm text-muted-foreground">{t('curriculum.loading')}</p></Card>
      </div>
    )
  }

  if (error && topics.length === 0) {
    return (
      <div className="space-y-6">
        <ProgrammeSelector programme={programme} programmes={programmes} selectProgramme={selectProgramme} />
        <Card>
          <div className="flex flex-col items-start gap-4 p-5">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={() => reload().catch(() => {})}>
              <RefreshCw className="size-4" aria-hidden="true" />
              {t('curriculum.retry')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ProgrammeSelector programme={programme} programmes={programmes} selectProgramme={selectProgramme} />
      {topics.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={t('curriculum.emptyTitle')}
            description={t('curriculum.emptyDescription')}
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {topics.map((topic) => (
            <TopicSection key={topic.id} topic={topic} selectedLesson={selectedLesson} audience={audience} />
          ))}
        </div>
      )}
    </div>
  )
}

export default StudentCurriculumBrowser

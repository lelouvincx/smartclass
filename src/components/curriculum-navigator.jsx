import React, { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, BookOpen, Play, RefreshCw } from '@/components/material-symbol'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccessTierBadge } from '@/components/access-tier-radio-group'
import { EmptyState } from '@/design-system/empty-state'
import { getLecturePath } from '@/lib/lectures'
import { cn } from '@/lib/utils'

function programmeLabel(programme, t) {
  return t(`curriculum.programmes.${programme}`)
}

function topicLessonCount(topic, t) {
  const count = topic.lessons?.length || 0
  return t('curriculum.lessonCount', { count })
}

const CURRICULUM_NAVIGATION_MIN_WIDTH = 256
const CURRICULUM_LESSON_MIN_WIDTH = 320
const CURRICULUM_DIVIDER_WIDTH = 12
const CURRICULUM_DEFAULT_LAYOUT_WIDTH = 1000
const CURRICULUM_DEFAULT_NAVIGATION_PERCENT = 43.2
const CURRICULUM_KEYBOARD_STEP_PERCENT = 5

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function widthBounds(layoutWidth) {
  const width = layoutWidth || CURRICULUM_DEFAULT_LAYOUT_WIDTH
  const minimum = CURRICULUM_NAVIGATION_MIN_WIDTH
  const maximum = Math.max(minimum, width - CURRICULUM_LESSON_MIN_WIDTH - CURRICULUM_DIVIDER_WIDTH)
  return { width, minimum, maximum }
}

function percentBounds(layoutWidth) {
  const { width, minimum, maximum } = widthBounds(layoutWidth)
  return {
    minimum: (minimum / width) * 100,
    maximum: (maximum / width) * 100,
  }
}

export function CurriculumNavigator({ navigation, audience = 'student', management = {} }) {
  const { t } = useTranslation()
  const [navigationExpanded, setNavigationExpanded] = useState(true)
  const [navigationWidthPercent, setNavigationWidthPercent] = useState(CURRICULUM_DEFAULT_NAVIGATION_PERCENT)
  const [draggingDivider, setDraggingDivider] = useState(false)
  const layoutRef = useRef(null)
  const navigationId = useId()
  const {
    programme,
    programmes,
    topics,
    selectedTopic,
    selectedLesson,
    lessonDetail,
    loading,
    lessonLoading,
    error,
    selectProgramme,
    selectTopic,
    selectLesson,
    backToTopics,
    reload,
  } = navigation
  const units = lessonDetail?.units || []
  const showResizableDivider = Boolean(selectedLesson && navigationExpanded)
  const getLayoutWidth = () => layoutRef.current?.getBoundingClientRect().width || CURRICULUM_DEFAULT_LAYOUT_WIDTH
  const currentPercentBounds = percentBounds(getLayoutWidth())
  const clampedNavigationWidthPercent = clamp(navigationWidthPercent, currentPercentBounds.minimum, currentPercentBounds.maximum)
  const separatorValueMin = Math.round(currentPercentBounds.minimum)
  const separatorValueMax = Math.round(currentPercentBounds.maximum)
  const separatorValueNow = Math.round(clampedNavigationWidthPercent)

  function setNavigationWidthFromClientX(clientX) {
    const rect = layoutRef.current?.getBoundingClientRect()
    const { width, minimum, maximum } = widthBounds(rect?.width)
    const nextWidth = clamp(clientX - (rect?.left || 0), minimum, maximum)
    setNavigationWidthPercent((nextWidth / width) * 100)
  }

  function handleDividerPointerDown(event) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDraggingDivider(true)
    setNavigationWidthFromClientX(event.clientX)
  }

  function handleDividerPointerMove(event) {
    if (!draggingDivider) return
    event.preventDefault()
    setNavigationWidthFromClientX(event.clientX)
  }

  function handleDividerPointerEnd(event) {
    event.preventDefault()
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setDraggingDivider(false)
  }

  function handleDividerKeyDown(event) {
    const { minimum, maximum } = percentBounds(getLayoutWidth())
    let nextPercent = null
    if (event.key === 'ArrowLeft') nextPercent = clampedNavigationWidthPercent - CURRICULUM_KEYBOARD_STEP_PERCENT
    if (event.key === 'ArrowRight') nextPercent = clampedNavigationWidthPercent + CURRICULUM_KEYBOARD_STEP_PERCENT
    if (event.key === 'Home') nextPercent = minimum
    if (event.key === 'End') nextPercent = maximum
    if (nextPercent === null) return
    event.preventDefault()
    setNavigationWidthPercent(clamp(nextPercent, minimum, maximum))
  }

  if (loading) {
    return <Card><p className="p-5 text-sm text-muted-foreground">{t('curriculum.loading')}</p></Card>
  }

  if (error && topics.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-4 p-5">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={() => reload().catch(() => {})}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('curriculum.retry')}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1 sm:w-72 sm:flex-none">
            <label htmlFor="curriculum-programme" className="text-sm font-medium text-foreground">
              {t('curriculum.programme')}
            </label>
            <Select value={String(programme)} onValueChange={selectProgramme}>
              <SelectTrigger id="curriculum-programme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {programmes.map((item) => (
                  <SelectItem key={item} value={String(item)}>{programmeLabel(item, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {selectedLesson && (
              <Button
                type="button"
                variant="outline"
                className="hidden lg:inline-flex"
                aria-expanded={navigationExpanded}
                aria-controls={navigationId}
                onClick={() => setNavigationExpanded((expanded) => !expanded)}
              >
                <BookOpen aria-hidden="true" />
                {t(navigationExpanded ? 'curriculum.hideNavigation' : 'curriculum.showNavigation')}
              </Button>
            )}
            {management.programmeActions}
          </div>
        </div>
      </Card>

      {topics.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={t('curriculum.emptyTitle')}
            description={t('curriculum.emptyDescription')}
          />
        </Card>
      ) : (
        <div
          ref={layoutRef}
          data-testid={showResizableDivider ? 'curriculum-split-layout' : undefined}
          className={cn(
            'grid gap-4',
            draggingDivider && 'select-none',
            showResizableDivider
              ? 'lg:grid-cols-[var(--curriculum-split-columns)] lg:gap-0'
              : (!selectedLesson || navigationExpanded) && 'lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]',
          )}
          style={showResizableDivider ? {
            '--curriculum-navigation-width': `${Number(clampedNavigationWidthPercent.toFixed(1))}%`,
            '--curriculum-split-columns': `clamp(${CURRICULUM_NAVIGATION_MIN_WIDTH}px, var(--curriculum-navigation-width), calc(100% - ${CURRICULUM_LESSON_MIN_WIDTH + CURRICULUM_DIVIDER_WIDTH}px)) ${CURRICULUM_DIVIDER_WIDTH}px minmax(${CURRICULUM_LESSON_MIN_WIDTH}px, 1fr)`,
          } : undefined}
        >
          <nav id={navigationId} aria-label={t('curriculum.navigationTitle')} className={cn('min-w-0', selectedLesson && (navigationExpanded ? 'hidden lg:block' : 'hidden lg:hidden'))}>
          <Card className="min-w-0 overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-foreground">{t('curriculum.navigationTitle')}</h2>
              <p className="text-sm text-muted-foreground">{programmeLabel(programme, t)}</p>
            </div>
            <div className="divide-y divide-border">
              {topics.map((topic) => {
                const isTopicSelected = selectedTopic?.id === topic.id
                return (
                  <section key={topic.id} className="min-w-0">
                    <div className="flex min-h-[var(--sc-component-hit-target)] items-start gap-2 px-3 py-2 sm:px-4">
                      <button
                        type="button"
                        aria-current={isTopicSelected && !selectedLesson ? 'true' : undefined}
                        onClick={() => selectTopic(topic.id)}
                        className={cn(
                          'min-h-[var(--sc-component-hit-target)] min-w-0 flex-1 rounded-[var(--sc-component-control-shape)] px-3 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                          isTopicSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                        )}
                      >
                        <span className="block min-w-0 break-words font-medium leading-6">{topic.title}</span>
                        <span className="block text-xs text-muted-foreground">{topicLessonCount(topic, t)}</span>
                      </button>
                      {management.topicActions && <div className="shrink-0">{management.topicActions(topic)}</div>}
                    </div>
                    {isTopicSelected && topic.lessons?.length > 0 && (
                      <ol className="space-y-1 px-4 pb-3 pl-8 sm:px-5 sm:pl-10" role="list" aria-label={t('curriculum.lessonsInTopic', { title: topic.title })}>
                        {topic.lessons.map((lesson) => {
                          const isLessonSelected = selectedLesson?.id === lesson.id
                          return (
                            <li key={lesson.id} className="flex min-w-0 items-start gap-2">
                              <button
                                type="button"
                                aria-current={isLessonSelected ? 'page' : undefined}
                                onClick={() => selectLesson(lesson.id)}
                                className={cn(
                                  'min-h-[var(--sc-component-hit-target)] min-w-0 flex-1 rounded-[var(--sc-component-control-shape)] px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                                  isLessonSelected ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted',
                                )}
                              >
                                <span className="block min-w-0 break-words">{lesson.title}</span>
                                <span className="block text-xs text-muted-foreground">{t('curriculum.unitCount', { count: lesson.unit_count || 0 })}</span>
                              </button>
                              {management.lessonActions && <div className="shrink-0 pt-1">{management.lessonActions(lesson)}</div>}
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </section>
                )
              })}
            </div>
          </Card>
          </nav>

          {showResizableDivider && (
            <div
              role="separator"
              aria-label={t('curriculum.resizePanes')}
              aria-controls={navigationId}
              aria-orientation="vertical"
              aria-valuemin={separatorValueMin}
              aria-valuemax={separatorValueMax}
              aria-valuenow={separatorValueNow}
              tabIndex={0}
              className="group hidden cursor-col-resize touch-none items-stretch justify-center rounded-[var(--sc-component-control-shape)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:flex"
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={handleDividerPointerEnd}
              onPointerCancel={handleDividerPointerEnd}
              onKeyDown={handleDividerKeyDown}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              <span className="min-h-full w-px bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" aria-hidden="true" />
            </div>
          )}

          <Card className={cn('@container min-w-0 overflow-hidden p-0', !selectedLesson && 'hidden lg:block')}>
            {selectedLesson ? (
              <div className="min-w-0">
                <div className="flex min-w-0 flex-col gap-3 border-b border-border px-4 py-4 sm:px-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm text-muted-foreground">
                        {selectedTopic?.title ? `${programmeLabel(programme, t)} · ${selectedTopic.title}` : programmeLabel(programme, t)}
                      </p>
                      <h2 className="break-words text-lg font-semibold text-foreground">{selectedLesson.title}</h2>
                    </div>
                    <Button type="button" variant="ghost" onClick={backToTopics} className="lg:hidden">
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      {t('curriculum.backToTopics')}
                    </Button>
                  </div>
                  {(management.lessonActions || management.lessonHeaderActions) && (
                    <div data-testid="curriculum-mobile-lesson-actions" className="flex flex-wrap gap-2 lg:hidden">
                      {management.lessonActions && management.lessonActions(selectedLesson)}
                      {management.lessonHeaderActions}
                    </div>
                  )}
                  {(management.lessonHeaderActions || (!navigationExpanded && management.lessonActions)) && (
                    <div data-testid="curriculum-desktop-lesson-header-actions" className="hidden flex-wrap gap-2 lg:flex">
                      {!navigationExpanded && management.lessonActions?.(selectedLesson)}
                      {management.lessonHeaderActions}
                    </div>
                  )}
                </div>
                {lessonLoading ? (
                  <p className="p-5 text-sm text-muted-foreground">{t('curriculum.loadingLesson')}</p>
                ) : error && !lessonDetail ? (
                  <div className="flex flex-col items-start gap-4 p-5">
                    <p role="alert" className="text-sm text-destructive">{error}</p>
                    <Button type="button" variant="outline" onClick={() => reload().catch(() => {})}>
                      <RefreshCw className="size-4" aria-hidden="true" />
                      {t('curriculum.retry')}
                    </Button>
                  </div>
                ) : units.length === 0 ? (
                  <EmptyState
                    icon={BookOpen}
                    title={t('curriculum.emptyLessonTitle')}
                    description={t('curriculum.emptyLessonDescription')}
                    className="min-h-64"
                  />
                ) : (
                  <ol className="divide-y divide-border" role="list" aria-label={t('curriculum.unitsInLesson', { title: selectedLesson.title })}>
                    {units.map((unit, index) => (
                      <li key={unit.placement_id} className="flex min-w-0 items-center gap-2 px-4 py-3 sm:px-5">
                        <Link
                          to={getLecturePath(unit.lecture, audience, unit.placement_id)}
                          className="group flex min-h-[var(--sc-component-hit-target)] min-w-0 flex-1 items-center gap-3 rounded-[var(--sc-component-control-shape)] px-2 py-1 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                          aria-label={t('curriculum.watchUnit', { number: index + 1, title: unit.lecture.title })}
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold tabular-nums text-muted-foreground group-hover:text-primary">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 space-y-2">
                            <span className="block break-words font-medium text-foreground">{unit.lecture.title}</span>
                            <span className="flex flex-wrap items-center gap-2">
                              <AccessTierBadge tier={unit.lecture.minimum_access_tier} />
                              {unit.lecture.is_visible === 0 && <span className="text-xs text-muted-foreground">{t('curriculumManagement.hidden')}</span>}
                            </span>
                          </span>
                          <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary @[440px]:flex">
                            <Play className="size-4" aria-hidden="true" />
                            {t('curriculum.watch')}
                          </span>
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                        </Link>
                        {management.unitActions && <div className="shrink-0">{management.unitActions(unit)}</div>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title={t('curriculum.chooseLessonTitle')}
                description={t('curriculum.chooseLessonDescription')}
                className="min-h-72"
              />
            )}
          </Card>
        </div>
      )}
      {management.footer && <div className="flex flex-wrap gap-2">{management.footer}</div>}
    </div>
  )
}

export default CurriculumNavigator

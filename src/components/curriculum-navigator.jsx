import React, { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, BookOpen, ChevronDownIcon, ChevronRightIcon, FileText, Folder, PanelLeftClose, PanelLeftOpen, Play, RefreshCw } from '@/components/material-symbol'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SegmentedButton, SegmentedButtonGroup } from '@/components/ui/segmented-button'
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

function ProgrammeSelector({ programme, programmes, selectProgramme, t }) {
  return (
    <div className="min-w-0 space-y-1">
      <p id="curriculum-programme-label" className="text-sm font-medium text-foreground">
        {t('curriculum.programme')}
      </p>
      <SegmentedButtonGroup
        role="group"
        aria-labelledby="curriculum-programme-label"
        className="flex w-full flex-wrap sm:w-fit"
      >
        {programmes.map((item) => {
          const value = String(item)
          return (
            <SegmentedButton
              key={value}
              selected={String(programme) === value}
              onClick={() => selectProgramme(value)}
            >
              {programmeLabel(item, t)}
            </SegmentedButton>
          )
        })}
      </SegmentedButtonGroup>
    </div>
  )
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
  const [expandedTopicIds, setExpandedTopicIds] = useState(() => new Set())
  const [collapsedTopicIds, setCollapsedTopicIds] = useState(() => new Set())
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
  const isTeacher = audience === 'teacher'

  function renderPageHeader() {
    if (!isTeacher) return null
    return (
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <ProgrammeSelector programme={programme} programmes={programmes} selectProgramme={selectProgramme} t={t} />
            <div className="flex shrink-0 flex-wrap gap-2">
              {management.programmeActions}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  function renderStudentHeader() {
    if (isTeacher) return null
    return (
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <ProgrammeSelector programme={programme} programmes={programmes} selectProgramme={selectProgramme} t={t} />
          <div className="flex shrink-0 flex-wrap gap-2">
            {management.programmeActions}
          </div>
        </div>
      </Card>
    )
  }

  useEffect(() => {
    if (!selectedTopic?.id) return
    setExpandedTopicIds((current) => {
      if (current.has(selectedTopic.id)) return current
      return new Set([...current, selectedTopic.id])
    })
    setCollapsedTopicIds((current) => {
      if (!current.has(selectedTopic.id)) return current
      const next = new Set(current)
      next.delete(selectedTopic.id)
      return next
    })
  }, [selectedTopic?.id])

  function toggleTopic(topicId, currentlyExpanded) {
    setExpandedTopicIds((current) => {
      const next = new Set(current)
      if (currentlyExpanded) next.delete(topicId)
      else next.add(topicId)
      return next
    })
    setCollapsedTopicIds((current) => {
      const next = new Set(current)
      if (currentlyExpanded) next.add(topicId)
      else next.delete(topicId)
      return next
    })
  }

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
    return <div className="space-y-6">{renderPageHeader()}{renderStudentHeader()}<Card><p className="p-5 text-sm text-muted-foreground">{t('curriculum.loading')}</p></Card></div>
  }

  if (error && topics.length === 0) {
    return (
      <div className="space-y-6">
        {renderPageHeader()}
        {renderStudentHeader()}
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
      {renderPageHeader()}
      {renderStudentHeader()}

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
            <div className="divide-y divide-border">
              {topics.map((topic) => {
                const isTopicSelected = selectedTopic?.id === topic.id
                const isTopicCurrent = isTopicSelected && !selectedLesson
                const isTopicExpanded = !collapsedTopicIds.has(topic.id) && (isTopicSelected || expandedTopicIds.has(topic.id))
                const topicLessonsId = `${navigationId}-topic-${topic.id}-lessons`
                const hasLessons = topic.lessons?.length > 0
                return (
                  <section key={topic.id} className="min-w-0">
                    <div className="flex min-h-[var(--sc-component-hit-target)] items-center gap-2 px-2 py-2 sm:px-3">
                      {hasLessons ? (
                        <button
                          type="button"
                          className="flex size-12 shrink-0 items-center justify-center rounded-[min(var(--sc-component-control-shape),10px)] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                          aria-expanded={isTopicExpanded}
                          aria-controls={topicLessonsId}
                          aria-label={t(isTopicExpanded ? 'curriculum.collapseTopic' : 'curriculum.expandTopic', { title: topic.title })}
                          onClick={() => toggleTopic(topic.id, isTopicExpanded)}
                        >
                          {isTopicExpanded ? <ChevronDownIcon className="size-4" aria-hidden="true" /> : <ChevronRightIcon className="size-4" aria-hidden="true" />}
                        </button>
                      ) : <span className="size-12 shrink-0" aria-hidden="true" />}
                      <button
                        type="button"
                        aria-current={isTopicCurrent ? 'true' : undefined}
                        aria-label={`${topic.title}, ${topicLessonCount(topic, t)}`}
                        onClick={() => selectTopic(topic.id)}
                        className={cn(
                          'flex min-h-[var(--sc-component-hit-target)] min-w-0 flex-1 items-center gap-2 rounded-[var(--sc-component-control-shape)] px-3 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                          isTopicCurrent ? 'bg-sc-primary-container text-sc-on-primary-container' : 'text-foreground hover:bg-muted/70',
                        )}
                      >
                        <Folder className={cn('size-5', isTopicSelected ? 'text-sc-on-primary-container' : 'text-muted-foreground')} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block min-w-0 break-words font-medium leading-6">{topic.title}</span>
                          <span className="block text-xs text-muted-foreground">{topicLessonCount(topic, t)}</span>
                        </span>
                      </button>
                      {management.topicActions && <div className="shrink-0">{management.topicActions(topic)}</div>}
                    </div>
                    {isTopicExpanded && hasLessons && (
                      <ol id={topicLessonsId} className="space-y-1 px-3 pb-3 pl-10 sm:px-4 sm:pl-12" role="list" aria-label={t('curriculum.lessonsInTopic', { title: topic.title })}>
                        {topic.lessons.map((lesson) => {
                          const isLessonSelected = selectedLesson?.id === lesson.id
                          return (
                            <li key={lesson.id} className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                aria-current={isLessonSelected ? 'page' : undefined}
                                aria-label={`${lesson.title}, ${t('curriculum.unitCount', { count: lesson.unit_count || 0 })}`}
                                onClick={() => selectLesson(lesson.id)}
                                className={cn(
                                  'flex min-h-[var(--sc-component-hit-target)] min-w-0 flex-1 items-center gap-2 rounded-[var(--sc-component-control-shape)] px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                                  isLessonSelected ? 'bg-sc-primary-container font-medium text-sc-on-primary-container' : 'text-foreground hover:bg-muted/70',
                                )}
                              >
                                <FileText className={cn('size-5', isLessonSelected ? 'text-sc-on-primary-container' : 'text-muted-foreground')} aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                  <span className="block min-w-0 break-words">{lesson.title}</span>
                                  <span className="block text-xs text-muted-foreground">{t('curriculum.unitCount', { count: lesson.unit_count || 0 })}</span>
                                </span>
                              </button>
                              {management.lessonActions && <div className="shrink-0">{management.lessonActions(lesson)}</div>}
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
              className="group relative z-10 -mx-[18px] hidden w-12 cursor-col-resize touch-none items-stretch justify-center rounded-[var(--sc-component-control-shape)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:flex"
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

          <Card data-testid="curriculum-lesson-pane" className={cn('@container min-w-0 overflow-hidden p-0', !selectedLesson && 'hidden self-start bg-sc-surface-container lg:block')}>
            {selectedLesson ? (
              <div className="min-w-0">
                <div className="flex min-w-0 flex-col gap-3 border-b border-border px-4 py-4 sm:px-5">
                  <div className="flex min-w-0 items-start justify-between gap-3 max-[360px]:flex-col-reverse">
                    <div className="min-w-0 space-y-1">
                      <h2 className="break-words text-lg font-semibold text-foreground">{selectedLesson.title}</h2>
                      <nav aria-label={t('curriculum.breadcrumbs')} className="text-sm text-muted-foreground">
                        <ol className="flex min-w-0 flex-wrap items-center gap-1">
                          <li><button type="button" className="inline-flex min-h-[var(--sc-component-hit-target)] min-w-[var(--sc-component-hit-target)] items-center rounded-sm hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => selectProgramme(programme)}>{programmeLabel(programme, t)}</button></li>
                          {selectedTopic?.title && (
                            <>
                              <li aria-hidden="true"><ChevronRightIcon className="size-4" /></li>
                              <li><button type="button" className="inline-flex min-h-[var(--sc-component-hit-target)] min-w-[var(--sc-component-hit-target)] items-center rounded-sm break-words hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => selectTopic(selectedTopic.id)}>{selectedTopic.title}</button></li>
                            </>
                          )}
                          <li aria-hidden="true"><ChevronRightIcon className="size-4" /></li>
                          <li aria-current="page" className="min-w-0 break-words text-foreground">{selectedLesson.title}</li>
                        </ol>
                      </nav>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={backToTopics} className="lg:hidden">
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        {t('curriculum.backToTopics')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="hidden lg:inline-flex"
                        aria-expanded={navigationExpanded}
                        aria-controls={navigationId}
                        onClick={() => setNavigationExpanded((expanded) => !expanded)}
                      >
                        {navigationExpanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
                        {t(navigationExpanded ? 'curriculum.hideNavigation' : 'curriculum.showNavigation')}
                      </Button>
                    </div>
                  </div>
                  {management.lessonActions && (
                    <div data-testid="curriculum-mobile-lesson-actions" className="flex flex-wrap gap-2 lg:hidden">
                      {management.lessonActions(selectedLesson)}
                    </div>
                  )}
                  {!navigationExpanded && management.lessonActions && (
                    <div data-testid="curriculum-desktop-lesson-header-actions" className="hidden flex-wrap gap-2 lg:flex">
                      {management.lessonActions(selectedLesson)}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <h3 className="text-base font-semibold text-foreground">{t('curriculum.unitListTitle')}</h3>
                  {management.lessonHeaderActions && <div className="flex flex-wrap gap-2">{management.lessonHeaderActions}</div>}
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
                  <div>
                    <ol className="divide-y divide-border" role="list" aria-label={t('curriculum.unitsInLesson', { title: selectedLesson.title })}>
                    {units.map((unit, index) => (
                      <li key={unit.placement_id} className="flex min-w-0 items-center gap-2 px-3 py-3 sm:px-5">
                        <Link
                          to={getLecturePath(unit.lecture, audience, unit.placement_id)}
                          className="group flex min-h-[var(--sc-component-hit-target)] min-w-0 flex-1 items-center gap-2 rounded-[var(--sc-component-control-shape)] px-1 py-1 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:gap-3 sm:px-2"
                          aria-label={t('curriculum.watchUnit', { number: index + 1, title: unit.lecture.title })}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold tabular-nums text-muted-foreground group-hover:text-primary sm:size-9 sm:text-sm">
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
                          <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground group-hover:text-primary @[440px]:block" aria-hidden="true" />
                        </Link>
                        {management.unitActions && <div className="shrink-0">{management.unitActions(unit)}</div>}
                      </li>
                    ))}
                    </ol>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title={t('curriculum.chooseLessonTitle')}
                description={t('curriculum.chooseLessonDescription')}
                className="h-full min-h-72 bg-sc-surface-container"
              />
            )}
          </Card>
        </div>
      )}
      {management.footer && <div className="grid gap-2">{management.footer}</div>}
    </div>
  )
}

export default CurriculumNavigator

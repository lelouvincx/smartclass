import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDownIcon, ChevronRightIcon, Eye, MaterialSymbol, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, UnlinkIcon } from '@/components/material-symbol'
import { CurriculumNavigator } from '@/components/curriculum-navigator'
import { AudienceImpact } from '@/components/curriculum-management/AudienceImpact'
import { ConfirmDialog } from '@/components/curriculum-management/ConfirmDialog'
import { DestinationDialog } from '@/components/curriculum-management/DestinationDialog'
import { ReorderDialog } from '@/components/curriculum-management/ReorderDialog'
import { TextResourceDialog } from '@/components/curriculum-management/TextResourceDialog'
import { VideoDialog } from '@/components/curriculum-management/VideoDialog'
import {
  buildGroupMoveImpact,
  freezeRevision,
  isStaleError,
  minRevisionFromResponses,
  normaliseResponseList,
  normaliseRevision,
  sortedByOrder,
  withCurrentPlacementRemoved,
} from '@/components/curriculum-management/curriculum-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/design-system/page-header'
import {
  createCurriculumLesson,
  createCurriculumPlacement,
  createCurriculumTopic,
  deleteCurriculumLesson,
  deleteCurriculumPlacement,
  deleteCurriculumTopic,
  deleteLecture,
  getCurriculumLesson,
  listCurriculum,
  listLectures,
  updateCurriculumLesson,
  updateCurriculumOrder,
  updateCurriculumPlacement,
  updateCurriculumTopic,
  updateLecture,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { getLecturePath } from '@/lib/lectures'
import useCurriculumDraftGuard from '@/lib/use-curriculum-draft-guard'
import useCurriculumNavigation from '@/lib/use-curriculum-navigation'

function ActionMenu({ label, children, disabled = false }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={label} title={label} disabled={disabled}><MoreHorizontal aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function TeacherLecturesPage() {
  const { t } = useTranslation()
  const { token, workspace } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigation = useCurriculumNavigation(token, workspace)
  const [library, setLibrary] = useState([])
  const [libraryRevision, setLibraryRevision] = useState(null)
  const [allTopics, setAllTopics] = useState([])
  const [libraryError, setLibraryError] = useState('')
  const [managerReady, setManagerReady] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [discard, setDiscard] = useState(null)
  const loadRequestRef = useRef(0)

  const revision = freezeRevision(navigation.revision, libraryRevision)
  const programmes = navigation.programmes ?? [10, 11, 12, 'dgnl']

  const allLessons = useMemo(() => allTopics.flatMap((topic) => (topic.lessons ?? []).map((lesson) => ({ ...lesson, programme: topic.programme, topic_title: topic.title }))), [allTopics])

  function enrichLesson(lesson) {
    const topic = allTopics.find((item) => Number(item.id) === Number(lesson?.topic_id))
    return topic ? { ...lesson, programme: topic.programme, topic_title: topic.title } : lesson
  }

  function groupMoveImpact(type, resource) {
    return (destination) => {
      if (!destination || destination === String(type === 'topic' ? resource?.programme : resource?.topic_id)) return []
      return buildGroupMoveImpact({
        type,
        resource,
        destinationProgramme: type === 'topic' ? (destination.match(/^\d+$/) ? Number(destination) : destination) : undefined,
        destinationTopicId: type === 'lesson' ? Number(destination) : undefined,
        topics: allTopics,
        library,
      })
    }
  }

  const loadManagerData = useCallback(async () => {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    setLibraryError('')
    setManagerReady(false)
    try {
      const [lectureResponse, ...curriculumResponses] = await Promise.all([
        listLectures(token),
        ...programmes.map((programme) => listCurriculum(token, programme)),
      ])
      if (loadRequestRef.current !== requestId) return null
      const normalised = normaliseResponseList(lectureResponse)
      setLibrary(normalised.lectures)
      setLibraryRevision(minRevisionFromResponses(lectureResponse, ...curriculumResponses) ?? normalised.revision)
      setAllTopics(curriculumResponses.flatMap((response) => response?.data?.topics ?? response?.topics ?? []))
      setManagerReady(true)
      return { lectureResponse, curriculumResponses }
    } catch (error) {
      if (loadRequestRef.current === requestId) {
        setLibraryError(error.message)
        setManagerReady(false)
      }
      throw error
    }
  }, [programmes, token])

  useEffect(() => {
    let ignored = false
    loadManagerData().catch((error) => { if (!ignored) setLibraryError(error.message) })
    return () => { ignored = true }
  }, [loadManagerData])

  useEffect(() => {
    if (searchParams.get('create') !== 'lecture') return
    if (!managerReady) return
    if (navigation.selectedLesson) openDialog({ type: 'add-new', lesson: enrichLesson(navigation.selectedLesson), revision })
    else setLibraryError(t('curriculumManagement.video.selectLessonFirst'))
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
  }, [managerReady, navigation.selectedLesson, revision, searchParams, setSearchParams, t])

  const handleGuardedLeave = useCallback((action) => {
    if (dialog?.pending) return
    setDiscard(() => () => {
      setDialog(null)
      setDiscard(null)
      action.retry?.()
    })
  }, [dialog?.pending])

  useCurriculumDraftGuard({ blocked: Boolean(dialog?.dirty || dialog?.pending), onLeave: handleGuardedLeave })

  function openDialog(next) {
    if (!managerReady) return
    setDialog({ ...next, error: '', stale: false, pending: false, dirty: false, revision: next.revision ?? revision })
  }

  const setDialogDirty = useCallback((dirty) => {
    setDialog((current) => current && current.dirty !== dirty ? { ...current, dirty } : current)
  }, [])

  function closeDialog(meta = {}) {
    if (meta.dirty || dialog?.dirty) {
      setDiscard(() => () => { setDialog(null); setDiscard(null) })
      return
    }
    setDialog(null)
  }

  async function afterMutation(response) {
    setLibraryRevision(normaliseRevision(response, revision + 1))
    await Promise.all([navigation.reload?.(), loadManagerData()])
  }

  async function runMutation(mutator) {
    setDialog((current) => ({ ...current, pending: true, error: '', stale: false }))
    try {
      const response = await mutator(dialog.revision)
      setDialog(null)
      try {
        await afterMutation(response)
      } catch (reloadError) {
        setLibraryError(t('curriculumManagement.errors.savedReloadFailed', { message: reloadError.message }))
      }
    } catch (error) {
      setDialog((current) => ({ ...current, pending: false, error: error.message, stale: isStaleError(error) }))
    }
  }

  async function reloadAndKeepOpen() {
    setDiscard(() => async () => {
      setDialog(null)
      setDiscard(null)
      try {
        await Promise.all([navigation.reload?.(), loadManagerData()])
      } catch (error) {
        setLibraryError(error.message)
      }
    })
  }

  function lectureFor(unitOrLecture) {
    const id = unitOrLecture?.lecture?.id ?? unitOrLecture?.id
    return library.find((item) => item.id === id) ?? unitOrLecture?.lecture ?? unitOrLecture
  }

  function topicActions(topic) {
    return (
      <ActionMenu label={t('curriculumManagement.actions.topic', { title: topic.title })} disabled={!managerReady}>
        <DropdownMenuLabel>{topic.title}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'create-lesson', resource: { topic_id: topic.id }, revision })}><Plus />{t('curriculumManagement.lesson.create')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'edit-topic', resource: topic, revision })}><Pencil />{t('curriculumManagement.rename')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'move-topic', resource: topic, revision })}><MaterialSymbol name="drive_file_move" />{t('curriculumManagement.moveTo')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'reorder-lessons', topic, items: sortedByOrder(topic.lessons), revision })}><MaterialSymbol name="swap_vert" />{t('curriculumManagement.reorder.lessons')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => openDialog({ type: 'delete-topic', resource: topic, revision })}><Trash2 />{t('curriculumManagement.delete')}</DropdownMenuItem>
      </ActionMenu>
    )
  }

  function lessonActions(lesson) {
    async function openReorderUnits() {
      try {
        const response = await getCurriculumLesson(token, lesson.id)
        const data = response.data ?? {}
        openDialog({ type: 'reorder-units', lesson, items: sortedByOrder(data.units ?? []), revision: freezeRevision(revision, normaliseRevision(response, revision)) })
      } catch (error) {
        setLibraryError(error.message)
      }
    }

    return (
      <ActionMenu label={t('curriculumManagement.actions.lesson', { title: lesson.title })} disabled={!managerReady}>
        <DropdownMenuLabel>{lesson.title}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'add-new', lesson: enrichLesson(lesson), revision })}><Plus />{t('curriculumManagement.video.addNew')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'add-existing', lesson: enrichLesson(lesson), revision })}><MaterialSymbol name="video_library" />{t('curriculumManagement.video.addExisting')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'edit-lesson', resource: lesson, revision })}><Pencil />{t('curriculumManagement.rename')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'move-lesson', resource: lesson, revision })}><MaterialSymbol name="drive_file_move" />{t('curriculumManagement.moveTo')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={openReorderUnits}><MaterialSymbol name="swap_vert" />{t('curriculumManagement.reorder.units')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => openDialog({ type: 'delete-lesson', resource: lesson, revision })}><Trash2 />{t('curriculumManagement.delete')}</DropdownMenuItem>
      </ActionMenu>
    )
  }

  function unitActions(unit) {
    const lecture = lectureFor(unit)
    const remaining = withCurrentPlacementRemoved(lecture, unit.placement_id)
    const currentPlacement = (lecture?.placements ?? []).find((placement) => placement.placement_id === unit.placement_id) ?? unit
    return (
      <ActionMenu label={t('curriculumManagement.actions.unit', { title: unit.lecture.title })} disabled={!managerReady}>
        <DropdownMenuLabel>{unit.lecture.title}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'edit-video', lecture, revision })}><Pencil />{t('curriculumManagement.video.edit')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'move-placement', unit, lecture, nextPlacements: remaining, revision })}><MaterialSymbol name="drive_file_move" />{t('curriculumManagement.moveTo')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openDialog({ type: 'remove-placement', unit: currentPlacement, lecture, nextPlacements: remaining, revision })}><UnlinkIcon />{t('curriculumManagement.placement.remove')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => openDialog({ type: 'delete-video', lecture, revision })}><Trash2 />{t('curriculumManagement.video.delete')}</DropdownMenuItem>
      </ActionMenu>
    )
  }

  const management = {
    programmeActions: <ActionMenu label={t('curriculumManagement.actions.programme')} disabled={!managerReady}><DropdownMenuItem onSelect={() => openDialog({ type: 'create-topic', resource: { programme: navigation.programme }, revision })}><Plus />{t('curriculumManagement.topic.create')}</DropdownMenuItem><DropdownMenuItem onSelect={() => openDialog({ type: 'reorder-topics', items: sortedByOrder(navigation.topics), revision })}><MaterialSymbol name="swap_vert" />{t('curriculumManagement.reorder.topics')}</DropdownMenuItem></ActionMenu>,
    topicActions,
    lessonActions,
    unitActions,
    lessonHeaderActions: navigation.selectedLesson && <Button type="button" variant="outline" disabled={!managerReady} onClick={() => openDialog({ type: 'add-new', lesson: enrichLesson(navigation.selectedLesson), revision })}><Plus />{t('curriculumManagement.video.addNew')}</Button>,
    footer: <UnplacedLibrary library={library.filter((lecture) => (lecture.placements ?? []).length === 0)} disabled={!managerReady} onEdit={(lecture) => openDialog({ type: 'edit-video', lecture, revision })} onDelete={(lecture) => openDialog({ type: 'delete-video', lecture, revision })} />,
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('teacher.lectures.title')} description={t('curriculumManagement.page.description')} className="lg:px-4" />
      {libraryError && <Card><CardContent className="flex flex-col items-start gap-3"><p role="alert" className="text-sm text-destructive">{libraryError}</p><Button type="button" variant="outline" onClick={() => loadManagerData().catch(() => {})}><RefreshCw />{t('curriculumManagement.reload')}</Button></CardContent></Card>}
      <CurriculumNavigator navigation={navigation} audience="teacher" management={management} />
      {renderDialog()}
      <ConfirmDialog open={Boolean(discard)} title={t('curriculumManagement.discard.title')} description={t('curriculumManagement.discard.description')} confirmLabel={t('curriculumManagement.discard.confirm')} onConfirm={() => discard?.()} onCancel={() => setDiscard(null)} />
    </div>
  )

  function renderDialog() {
    if (!dialog) return null
    if (dialog.type === 'remove-placement') return <ConfirmDialog open destructive title={t('curriculumManagement.placement.remove')} description={<AudienceImpact lecture={dialog.lecture} nextPlacements={dialog.nextPlacements} affectedPlacements={[dialog.unit]} />} confirmLabel={t('curriculumManagement.placement.remove')} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onReload={reloadAndKeepOpen} onCancel={closeDialog} onConfirm={() => runMutation((expected_revision) => deleteCurriculumPlacement(token, dialog.unit.placement_id, expected_revision))} />
    if (dialog.type === 'delete-video') return <ConfirmDialog open destructive title={t('curriculumManagement.video.delete')} description={<AudienceImpact lecture={dialog.lecture} nextPlacements={[]} />} confirmLabel={t('curriculumManagement.video.delete')} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onReload={reloadAndKeepOpen} onCancel={closeDialog} onConfirm={() => runMutation((expected_revision) => deleteLecture(token, dialog.lecture.id, expected_revision))} />
    if (dialog.type === 'delete-topic') return <ConfirmDialog open destructive title={t('curriculumManagement.topic.delete')} description={t('curriculumManagement.topic.deleteDescription', { title: dialog.resource.title })} confirmLabel={t('curriculumManagement.delete')} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onReload={reloadAndKeepOpen} onCancel={closeDialog} onConfirm={() => runMutation((expected_revision) => deleteCurriculumTopic(token, dialog.resource.id, expected_revision))} />
    if (dialog.type === 'delete-lesson') return <ConfirmDialog open destructive title={t('curriculumManagement.lesson.delete')} description={t('curriculumManagement.lesson.deleteDescription', { title: dialog.resource.title })} confirmLabel={t('curriculumManagement.delete')} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onReload={reloadAndKeepOpen} onCancel={closeDialog} onConfirm={() => runMutation((expected_revision) => deleteCurriculumLesson(token, dialog.resource.id, expected_revision))} />
    if (dialog.type?.startsWith('reorder')) {
      const parentType = dialog.type === 'reorder-units' ? 'lesson' : dialog.type === 'reorder-lessons' ? 'topic' : 'programme'
      const parentId = dialog.type === 'reorder-units' ? dialog.lesson.id : dialog.type === 'reorder-lessons' ? dialog.topic.id : navigation.programme
      return <ReorderDialog open title={t(`curriculumManagement.${dialog.type.replace('-', '.')}`)} items={dialog.items} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onDirtyChange={setDialogDirty} onReload={reloadAndKeepOpen} onCancel={closeDialog} onSave={(ids) => runMutation((expected_revision) => updateCurriculumOrder(token, { parent_type: parentType, parent_id: parentId, ids, expected_revision }))} />
    }
    if (dialog.type?.includes('topic') || dialog.type?.includes('lesson')) {
      if (dialog.type === 'move-lesson') return <DestinationDialog open title={t('curriculumManagement.lesson.move')} description={t('curriculumManagement.lesson.moveDescription')} label={t('curriculumManagement.topic.destination')} value={dialog.resource.topic_id} topics={allTopics} groupImpact={groupMoveImpact('lesson', dialog.resource)} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onDirtyChange={setDialogDirty} onReload={reloadAndKeepOpen} onCancel={closeDialog} onSubmit={(destination) => runMutation((expected_revision) => updateCurriculumLesson(token, dialog.resource.id, { topic_id: Number(destination), expected_revision }))} />
      if (dialog.type === 'move-topic') return <TextResourceDialog open mode="move-topic" resource={dialog.resource} programmes={programmes} topics={allTopics} groupImpact={groupMoveImpact('topic', dialog.resource)} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onDirtyChange={setDialogDirty} onReload={reloadAndKeepOpen} onCancel={closeDialog} onSubmit={({ destination }) => runMutation((expected_revision) => updateCurriculumTopic(token, dialog.resource.id, { programme: destination.match(/^\d+$/) ? Number(destination) : destination, expected_revision }))} />
      return <TextResourceDialog open mode={dialog.type} resource={dialog.resource} programmes={programmes} topics={allTopics} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onDirtyChange={setDialogDirty} onReload={reloadAndKeepOpen} onCancel={closeDialog} onSubmit={({ title, destination }) => {
        if (dialog.type === 'create-topic') return runMutation((expected_revision) => createCurriculumTopic(token, { programme: destination.match(/^\d+$/) ? Number(destination) : destination, title, expected_revision }))
        if (dialog.type === 'create-lesson') return runMutation((expected_revision) => createCurriculumLesson(token, { topic_id: Number(destination || dialog.resource.topic_id), title, expected_revision }))
        if (dialog.type === 'edit-topic') return runMutation((expected_revision) => updateCurriculumTopic(token, dialog.resource.id, { title, expected_revision }))
        return runMutation((expected_revision) => updateCurriculumLesson(token, dialog.resource.id, { title, expected_revision }))
      }} />
    }
    if (dialog.type === 'add-new' || dialog.type === 'add-existing' || dialog.type === 'edit-video') {
      return <VideoDialog open mode={dialog.type} lesson={dialog.lesson} lecture={dialog.lecture} library={library} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onDirtyChange={setDialogDirty} onReload={reloadAndKeepOpen} onCancel={closeDialog} onSubmit={(payload) => {
        if (dialog.type === 'edit-video') return runMutation((expected_revision) => updateLecture(token, dialog.lecture.id, { ...payload.lecture, expected_revision }))
        return runMutation((expected_revision) => createCurriculumPlacement(token, { lesson_id: dialog.lesson.id, ...payload, expected_revision }))
      }} />
    }
    if (dialog.type === 'move-placement') {
      const currentPlacement = (dialog.lecture?.placements ?? []).find((placement) => placement.placement_id === dialog.unit.placement_id) ?? dialog.unit
      return <DestinationDialog open title={t('curriculumManagement.placement.move')} description={t('curriculumManagement.placement.moveDescription')} label={t('curriculumManagement.lesson.destination')} value={currentPlacement.lesson_id} lessons={allLessons} lecture={dialog.lecture} nextPlacements={dialog.nextPlacements} pending={dialog.pending} error={dialog.error} stale={dialog.stale} onDirtyChange={setDialogDirty} onReload={reloadAndKeepOpen} onCancel={closeDialog} onSubmit={(destination) => runMutation((expected_revision) => updateCurriculumPlacement(token, dialog.unit.placement_id, { lesson_id: Number(destination), expected_revision }))} />
    }
    return null
  }
}

function UnplacedLibrary({ library, disabled = false, onEdit, onDelete }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  if (!library.length) return null
  const contentId = 'unplaced-video-library'
  return (
    <Card className="w-full">
      <CardHeader>
        <button
          type="button"
          className="flex min-h-[var(--sc-component-hit-target)] w-full items-start justify-between gap-3 rounded-[var(--sc-component-control-shape)] text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="min-w-0 space-y-1">
            <span className="block text-base font-semibold text-foreground">{t('curriculumManagement.library.title')}</span>
            <span className="block text-sm text-muted-foreground">{t('curriculumManagement.library.description', { count: library.length })}</span>
          </span>
          <span className="flex size-[var(--sc-component-hit-target)] shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] border border-input bg-background text-muted-foreground">
            {expanded ? <ChevronDownIcon aria-hidden="true" /> : <ChevronRightIcon aria-hidden="true" />}
          </span>
        </button>
      </CardHeader>
      {expanded && <CardContent id={contentId}>
        <ul className="grid gap-2">
          {library.map((lecture) => (
            <li key={lecture.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--sc-component-control-shape)] border p-2 sm:p-3">
              <Link
                to={getLecturePath(lecture, 'teacher')}
                className="flex min-h-[var(--sc-component-hit-target)] min-w-0 items-center break-words rounded-sm font-medium text-foreground outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {lecture.title}
              </Link>
              <ActionMenu label={t('curriculumManagement.actions.unit', { title: lecture.title })} disabled={disabled}>
                <DropdownMenuLabel>{lecture.title}</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to={getLecturePath(lecture, 'teacher')}><Eye />{t('teacher.lectures.viewDetails')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEdit(lecture)}><Pencil />{t('curriculumManagement.video.edit')}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete?.(lecture)}><Trash2 />{t('curriculumManagement.video.delete')}</DropdownMenuItem>
              </ActionMenu>
            </li>
          ))}
        </ul>
      </CardContent>}
    </Card>
  )
}

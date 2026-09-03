import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, BookOpen, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import {
  createLecture,
  deleteLecture,
  listLectures,
  updateLecture,
  updateLectureOrder,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { getYouTubeEmbedUrl, groupLectureRuns } from '@/lib/lectures'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/design-system/empty-state'
import { PageHeader } from '@/design-system/page-header'

const EMPTY_FORM = {
  title: '',
  section_name: '',
  youtube_url: '',
}

export default function TeacherLecturesPage() {
  const { t } = useTranslation()
  const { token } = useAuth()
  const [lectures, setLectures] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [expandedLectureId, setExpandedLectureId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const loadLectures = useCallback(async () => {
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
  }, [token])

  useEffect(() => {
    loadLectures()
  }, [loadLectures])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    if (error) setError('')
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSaving(true)

    try {
      if (editingId) {
        await updateLecture(token, editingId, form)
      } else {
        await createLecture(token, form)
      }
      resetForm()
      setDialogOpen(false)
      await loadLectures()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  function startEditing(lecture) {
    setEditingId(lecture.id)
    setForm({
      title: lecture.title,
      section_name: lecture.section_name,
      youtube_url: lecture.youtube_url,
    })
    setError('')
    setDialogOpen(true)
  }

  function startCreating(sectionName = '') {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, section_name: sectionName })
    setError('')
    setDialogOpen(true)
  }

  function handleDialogOpenChange(open) {
    setDialogOpen(open)
    if (!open) {
      resetForm()
      setError('')
    }
  }

  async function moveLecture(index, offset) {
    const targetIndex = index + offset
    if (targetIndex < 0 || targetIndex >= lectures.length) return

    const reordered = [...lectures]
    const [lecture] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, lecture)
    setError('')

    try {
      await updateLectureOrder(token, reordered.map((item) => item.id))
      setLectures(reordered)
    } catch (orderError) {
      setError(orderError.message)
    }
  }

  async function handleDelete(lecture) {
    if (!window.confirm(t('teacher.lectures.deleteConfirm', { title: lecture.title }))) return

    setError('')
    try {
      await deleteLecture(token, lecture.id)
      if (editingId === lecture.id) resetForm()
      await loadLectures()
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  let sequence = 0
  const sectionNames = [...new Set(lectures.map((lecture) => lecture.section_name))]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('teacher.lectures.title')}
        description={t('teacher.lectures.description')}
        actions={(
          <Button type="button" onClick={() => startCreating()}>
            <Plus aria-hidden="true" />
            {t('teacher.lectures.add')}
          </Button>
        )}
      />

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg" closeLabel={t('teacher.lectures.closeDialog')}>
          <DialogHeader>
            <DialogTitle>{editingId ? t('teacher.lectures.edit') : t('teacher.lectures.add')}</DialogTitle>
            <DialogDescription>{t('teacher.lectures.formDescription')}</DialogDescription>
          </DialogHeader>
          <form id="lecture-form" onSubmit={handleSubmit} className="grid gap-4" aria-describedby={error ? 'lecture-form-error' : undefined}>
            <div className="space-y-1.5">
              <Label htmlFor="lecture-section">{t('teacher.lectures.section')}</Label>
              <Input
                id="lecture-section"
                name="section_name"
                value={form.section_name}
                onChange={(event) => updateField('section_name', event.target.value)}
                placeholder={t('teacher.lectures.sectionPlaceholder')}
                list="lecture-sections"
                required
              />
              <datalist id="lecture-sections">
                {sectionNames.map((sectionName) => <option key={sectionName} value={sectionName} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lecture-title">{t('teacher.lectures.titleLabel')}</Label>
              <Input
                id="lecture-title"
                name="title"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lecture-url">{t('teacher.lectures.youtubeUrl')}</Label>
              <Input
                id="lecture-url"
                name="youtube_url"
                type="url"
                inputMode="url"
                value={form.youtube_url}
                onChange={(event) => updateField('youtube_url', event.target.value)}
                placeholder="https://youtu.be/..."
                required
              />
            </div>
            {error && (
              <p id="lecture-form-error" role="alert" className="rounded-[var(--sc-component-control-shape)] bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={isSaving}>
              {t('teacher.lectures.cancel')}
            </Button>
            <Button type="submit" form="lecture-form" disabled={isSaving}>
              {isSaving
                ? t('teacher.lectures.saving')
                : editingId
                  ? t('teacher.lectures.save')
                  : t('teacher.lectures.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && !dialogOpen && (
        <Card>
          <div className="flex flex-col items-start gap-4 p-5">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            {lectures.length === 0 && (
              <Button type="button" variant="outline" onClick={loadLectures}>
                {t('teacher.lectures.retry')}
              </Button>
            )}
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('teacher.lectures.loading')}</p>
      ) : !error && lectures.length === 0 ? (
        <Card className="gap-0 py-0">
          <EmptyState
            icon={BookOpen}
            title={t('teacher.lectures.empty')}
            description={t('teacher.lectures.emptyDescription')}
            action={<Button type="button" onClick={() => startCreating()}>{t('teacher.lectures.add')}</Button>}
          />
        </Card>
      ) : lectures.length > 0 ? (
        <Card className="gap-0 py-0" aria-label={t('teacher.lectures.list')}>
          {groupLectureRuns(lectures).map((section, sectionIndex) => (
            <section key={`${section.name}-${sectionIndex}`} className="border-b last:border-b-0">
              <header className="flex flex-wrap items-center justify-between gap-3 bg-muted/45 px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-primary/10 text-primary">
                    <BookOpen className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-semibold">{section.name}</h2>
                    <p className="text-xs text-muted-foreground">{t('teacher.lectures.lessonCount', { count: section.lectures.length })}</p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => startCreating(section.name)}>
                  <Plus aria-hidden="true" />{t('teacher.lectures.addToSection')}
                </Button>
              </header>
              <ol className="divide-y" role="list">
                {section.lectures.map((lecture) => {
                  const index = lectures.indexOf(lecture)
                  const isExpanded = expandedLectureId === lecture.id
                  const embedUrl = getYouTubeEmbedUrl(lecture.youtube_url)
                  const playerId = `lecture-player-${lecture.id}`
                  sequence += 1
                  return (
                    <li key={lecture.id} className="min-w-0 px-4 py-3 sm:px-6">
                      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-sm font-semibold tabular-nums text-muted-foreground">{sequence}</span>
                          <div className="min-w-0">
                            <p className="font-medium leading-6 break-words">{lecture.title}</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="-ml-2 text-primary"
                              aria-expanded={isExpanded}
                              aria-controls={playerId}
                              aria-label={t(isExpanded ? 'teacher.lectures.hideNamed' : 'teacher.lectures.watchNamed', { title: lecture.title })}
                              onClick={() => setExpandedLectureId(isExpanded ? null : lecture.id)}
                            >
                              <Play className="fill-current" aria-hidden="true" />
                              {t(isExpanded ? 'teacher.lectures.hide' : 'teacher.lectures.watch')}
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button type="button" size="icon" variant="outline" onClick={() => moveLecture(index, -1)} disabled={index === 0} aria-label={t('teacher.lectures.moveUp', { title: lecture.title })}><ArrowUp aria-hidden="true" /></Button>
                          <Button type="button" size="icon" variant="outline" onClick={() => moveLecture(index, 1)} disabled={index === lectures.length - 1} aria-label={t('teacher.lectures.moveDown', { title: lecture.title })}><ArrowDown aria-hidden="true" /></Button>
                          <Button type="button" size="icon" variant="outline" onClick={() => startEditing(lecture)} aria-label={t('teacher.lectures.editNamed', { title: lecture.title })}><Pencil aria-hidden="true" /></Button>
                          <Button type="button" size="icon" variant="outline" className="text-destructive hover:text-destructive" onClick={() => handleDelete(lecture)} aria-label={t('teacher.lectures.deleteNamed', { title: lecture.title })}><Trash2 aria-hidden="true" /></Button>
                        </div>
                      </div>
                      {isExpanded && embedUrl && (
                        <div id={playerId} className="mt-3 overflow-hidden rounded-[var(--sc-component-control-shape)] border bg-black sm:ml-10">
                          <iframe
                            className="aspect-video w-full"
                            src={embedUrl}
                            title={lecture.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </Card>
      ) : null}
    </div>
  )
}

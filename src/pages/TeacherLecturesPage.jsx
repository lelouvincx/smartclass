import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, BookOpen, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import {
  createLecture,
  deleteLecture,
  listLectures,
  updateLecture,
  updateLectureOrder,
} from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  const [editingId, setEditingId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const loadLectures = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await listLectures()
      setLectures(response.data || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

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
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('teacher.lectures.title')}
        description={t('teacher.lectures.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? t('teacher.lectures.edit') : t('teacher.lectures.add')}</CardTitle>
          <CardDescription>
            {t('teacher.lectures.formDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4" aria-describedby={error ? 'lecture-form-error' : undefined}>
            <div className="grid gap-2 sm:grid-cols-2">
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
                <Label htmlFor="lecture-section">{t('teacher.lectures.section')}</Label>
                <Input
                  id="lecture-section"
                  name="section_name"
                  value={form.section_name}
                  onChange={(event) => updateField('section_name', event.target.value)}
                  placeholder={t('teacher.lectures.sectionPlaceholder')}
                  required
                />
              </div>
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
              <p id="lecture-form-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
                  {t('teacher.lectures.cancel')}
                </Button>
              )}
              <Button type="submit" disabled={isSaving}>
                {isSaving ? t('teacher.lectures.saving') : editingId ? t('teacher.lectures.save') : t('teacher.lectures.add')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('teacher.lectures.loading')}</p>
      ) : !error && lectures.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={t('teacher.lectures.empty')}
            description={t('teacher.lectures.emptyDescription')}
          />
        </Card>
      ) : lectures.length > 0 ? (
        <div className="grid gap-3" aria-label={t('teacher.lectures.list')}>
          {lectures.map((lecture, index) => (
            <Card key={lecture.id}>
              <CardContent className="grid min-w-0 gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium break-words">{lecture.title}</p>
                  <p className="text-sm text-muted-foreground">{lecture.section_name}</p>
                  <a
                    href={lecture.youtube_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <span className="truncate">{t('teacher.lectures.openYoutube')}</span>
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => moveLecture(index, -1)}
                    disabled={index === 0}
                    aria-label={t('teacher.lectures.moveUp', { title: lecture.title })}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => moveLecture(index, 1)}
                    disabled={index === lectures.length - 1}
                    aria-label={t('teacher.lectures.moveDown', { title: lecture.title })}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => startEditing(lecture)}
                    aria-label={t('teacher.lectures.editNamed', { title: lecture.title })}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(lecture)}
                    aria-label={t('teacher.lectures.deleteNamed', { title: lecture.title })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}

import React, { useCallback, useEffect, useState } from 'react'
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
    if (!window.confirm(`Delete “${lecture.title}”?`)) return

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
        title="Lectures"
        description="Organize YouTube lessons into named sections for your class."
      />

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Edit lecture' : 'Add lecture'}</CardTitle>
          <CardDescription>
            Add a title, section, and public YouTube link. Use the arrow controls below to reorder lessons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4" aria-describedby={error ? 'lecture-form-error' : undefined}>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lecture-title">Lecture title</Label>
                <Input
                  id="lecture-title"
                  name="title"
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lecture-section">Section</Label>
                <Input
                  id="lecture-section"
                  name="section_name"
                  value={form.section_name}
                  onChange={(event) => updateField('section_name', event.target.value)}
                  placeholder="Chapter 1"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lecture-url">YouTube URL</Label>
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
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Add lecture'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading lectures...</p>
      ) : !error && lectures.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No lectures yet."
            description="Add your first YouTube lesson above."
          />
        </Card>
      ) : lectures.length > 0 ? (
        <div className="grid gap-3" aria-label="Lecture list">
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
                    <span className="truncate">Open on YouTube</span>
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
                    aria-label={`Move ${lecture.title} up`}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => moveLecture(index, 1)}
                    disabled={index === lectures.length - 1}
                    aria-label={`Move ${lecture.title} down`}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => startEditing(lecture)}
                    aria-label={`Edit ${lecture.title}`}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(lecture)}
                    aria-label={`Delete ${lecture.title}`}
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

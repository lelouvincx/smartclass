import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SegmentedButton, SegmentedButtonGroup } from '@/components/ui/segmented-button'
import { ACCESS_TIERS, placementPath } from './curriculum-utils'
import { AudienceImpact } from './AudienceImpact'

const EMPTY = { title: '', youtube_url: '', minimum_access_tier: 'standard', is_visible: true }

export function VideoDialog({ open, mode, lesson, lecture, library, pending, error, stale, onSubmit, onCancel, onReload, onDirtyChange }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(EMPTY)
  const [existingId, setExistingId] = useState('')

  useEffect(() => {
    if (!open) return
    setExistingId('')
    setForm(lecture ? {
      title: lecture.title ?? '',
      youtube_url: lecture.youtube_url ?? '',
      minimum_access_tier: lecture.minimum_access_tier ?? 'standard',
      is_visible: Boolean(lecture.is_visible),
    } : EMPTY)
  }, [open, lecture])

  const isExisting = mode === 'add-existing'
  const isEdit = mode === 'edit-video'
  const title = isEdit ? t('curriculumManagement.video.edit') : isExisting ? t('curriculumManagement.video.addExisting') : t('curriculumManagement.video.addNew')
  const unplaced = useMemo(() => (library ?? []).filter((item) => (item.placements ?? []).length === 0), [library])
  const initial = lecture ? {
    title: lecture.title ?? '',
    youtube_url: lecture.youtube_url ?? '',
    minimum_access_tier: lecture.minimum_access_tier ?? 'standard',
    is_visible: Boolean(lecture.is_visible),
  } : EMPTY
  const dirty = isExisting ? Boolean(existingId) : Object.keys(EMPTY).some((key) => form[key] !== initial[key])
  const tierChange = isEdit && initial.minimum_access_tier !== form.minimum_access_tier ? { from: initial.minimum_access_tier, to: form.minimum_access_tier } : null
  const visibilityChange = isEdit && initial.is_visible !== form.is_visible ? { from: initial.is_visible, to: form.is_visible } : null

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  function submit(event) {
    event.preventDefault()
    if (isExisting) onSubmit?.({ lecture_id: Number(existingId) })
    else onSubmit?.({ lecture: { ...form, title: form.title.trim(), youtube_url: form.youtube_url.trim() } })
  }

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onCancel?.({ dirty }) }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" closeLabel={t('curriculumManagement.closeDialog')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {lesson ? t('curriculumManagement.video.destination', { path: placementPath({ programme: lesson.programme, topic_title: lesson.topic_title, lesson_title: lesson.title }, t) }) : t('curriculumManagement.video.description')}
          </DialogDescription>
        </DialogHeader>
        <form id="curriculum-video-form" className="grid gap-4" onSubmit={submit}>
          {isExisting ? (
            <div className="space-y-1.5">
              <Label htmlFor="existing-video">{t('curriculumManagement.video.existingLabel')}</Label>
              <Select value={existingId} onValueChange={setExistingId} disabled={pending}>
                <SelectTrigger id="existing-video" className="w-full"><SelectValue placeholder={t('curriculumManagement.video.chooseExisting')} /></SelectTrigger>
                <SelectContent>
                  {unplaced.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.title}</SelectItem>)}
                  {(library ?? []).filter((item) => (item.placements ?? []).length > 0).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.title} — {t('curriculumManagement.video.placed')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="video-title">{t('curriculumManagement.video.title')}</Label>
                <Input id="video-title" value={form.title} onChange={(event) => update('title', event.target.value)} required disabled={pending} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="video-url">{t('curriculumManagement.video.url')}</Label>
                <Input id="video-url" type="url" inputMode="url" value={form.youtube_url} onChange={(event) => update('youtube_url', event.target.value)} required disabled={pending} placeholder="https://youtu.be/..." />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('curriculumManagement.video.tier')}</legend>
                <SegmentedButtonGroup className="flex w-full">
                  {ACCESS_TIERS.map((tier) => <SegmentedButton key={tier} selected={form.minimum_access_tier === tier} onClick={() => update('minimum_access_tier', tier)} disabled={pending}>{t(`curriculumManagement.tiers.${tier}`)}</SegmentedButton>)}
                </SegmentedButtonGroup>
              </fieldset>
              <SegmentedButtonGroup className="flex w-full" aria-label={t('curriculumManagement.video.visibility')}>
                <SegmentedButton selected={form.is_visible} onClick={() => update('is_visible', true)} disabled={pending}>{t('curriculumManagement.visible')}</SegmentedButton>
                <SegmentedButton selected={!form.is_visible} onClick={() => update('is_visible', false)} disabled={pending}>{t('curriculumManagement.hidden')}</SegmentedButton>
              </SegmentedButtonGroup>
              {isEdit && <AudienceImpact lecture={lecture} description={t('curriculumManagement.video.sharedEditImpact')} tierChange={tierChange} visibilityChange={visibilityChange} />}
            </>
          )}
          {stale && <p role="alert" className="rounded-[var(--sc-component-control-shape)] border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{t('curriculumManagement.errors.stale')}</p>}
          {error && !stale && <p role="alert" className="rounded-[var(--sc-component-control-shape)] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          {stale && <Button type="button" variant="outline" onClick={onReload} disabled={pending}>{t('curriculumManagement.reload')}</Button>}
          <Button type="button" variant="outline" onClick={() => onCancel?.({ dirty })} disabled={pending}>{t('curriculumManagement.cancel')}</Button>
          <Button form="curriculum-video-form" type="submit" disabled={pending || stale || (isExisting ? !existingId : !form.title.trim() || !form.youtube_url.trim())}>{pending ? t('curriculumManagement.saving') : t('curriculumManagement.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

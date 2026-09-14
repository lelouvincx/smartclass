import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AudienceImpact } from './AudienceImpact'
import { placementPath, programmeLabel } from './curriculum-utils'

export function DestinationDialog({ open, title, description, label, value, topics = [], lessons = [], lecture, nextPlacements, groupImpact, pending, error, stale, onSubmit, onCancel, onReload, onDirtyChange }) {
  const { t } = useTranslation()
  const [destination, setDestination] = useState('')
  useEffect(() => {
    if (open) setDestination(value ? String(value) : '')
  }, [open, value])
  const initialDestination = String(value ?? '')
  const dirty = destination !== initialDestination
  const options = lessons.length ? lessons : topics
  const selectedLesson = lessons.find((lesson) => String(lesson.id) === destination)
  const impactPlacements = selectedLesson
    ? [...(nextPlacements ?? []), { placement_id: 'destination-preview', programme: selectedLesson.programme, topic_title: selectedLesson.topic_title, lesson_title: selectedLesson.title }]
    : nextPlacements
  const impacts = groupImpact ? groupImpact(destination) : null

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onCancel?.({ dirty }) }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" closeLabel={t('curriculumManagement.closeDialog')}>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="destination-picker">{label}</Label>
            <Select value={destination} onValueChange={setDestination} disabled={pending}>
              <SelectTrigger id="destination-picker" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {lessons.length ? placementPath({ programme: item.programme, topic_title: item.topic_title, lesson_title: item.title }, t) : `${programmeLabel(item.programme, t)} › ${item.title}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {lecture && <AudienceImpact lecture={lecture} nextPlacements={impactPlacements} description={t('curriculumManagement.impact.moveDescription')} />}
          {impacts && <AudienceImpact impacts={impacts} description={t('curriculumManagement.impact.groupMoveDescription')} />}
          {stale && <p role="alert" className="rounded-[var(--sc-component-control-shape)] border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{t('curriculumManagement.errors.stale')}</p>}
          {error && !stale && <p role="alert" className="rounded-[var(--sc-component-control-shape)] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {stale && <Button type="button" variant="outline" onClick={onReload} disabled={pending}>{t('curriculumManagement.reload')}</Button>}
          <Button type="button" variant="outline" onClick={() => onCancel?.({ dirty })} disabled={pending}>{t('curriculumManagement.cancel')}</Button>
          <Button type="button" onClick={() => onSubmit?.(destination)} disabled={pending || stale || !destination || destination === String(value ?? '')}>{pending ? t('curriculumManagement.saving') : t('curriculumManagement.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

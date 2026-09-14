import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AudienceImpact } from './AudienceImpact'
import { programmeLabel } from './curriculum-utils'

export function TextResourceDialog({ open, mode, resource, programmes, topics, groupImpact, pending, error, stale, onSubmit, onCancel, onReload, onDirtyChange }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(resource?.title ?? '')
    setDestination(String(resource?.programme ?? resource?.topic_id ?? ''))
  }, [open, resource])

  const isTopic = mode?.includes('topic')
  const isCreate = mode?.startsWith('create')
  const showsDestination = isCreate || mode?.startsWith('move')
  const impacts = groupImpact ? groupImpact(destination) : null
  const initialTitle = resource?.title ?? ''
  const initialDestination = String(resource?.programme ?? resource?.topic_id ?? '')
  const dirty = title.trim() !== initialTitle || destination !== initialDestination
  const titleText = useMemo(() => {
    if (mode === 'create-topic') return t('curriculumManagement.topic.create')
    if (mode === 'edit-topic') return t('curriculumManagement.topic.edit')
    if (mode === 'move-topic') return t('curriculumManagement.topic.move')
    if (mode === 'create-lesson') return t('curriculumManagement.lesson.create')
    return t('curriculumManagement.lesson.edit')
  }, [mode, t])

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  function submit(event) {
    event.preventDefault()
    onSubmit?.({ title: title.trim(), destination })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onCancel?.({ dirty }) }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" closeLabel={t('curriculumManagement.closeDialog')}>
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription>{t('curriculumManagement.textDialog.description')}</DialogDescription>
        </DialogHeader>
        <form id="curriculum-text-form" className="grid gap-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="curriculum-title">{t('curriculumManagement.titleLabel')}</Label>
            <Input id="curriculum-title" value={title} onChange={(event) => setTitle(event.target.value)} required disabled={pending} autoFocus />
          </div>
          {showsDestination && (
            <div className="space-y-1.5">
              <Label htmlFor="curriculum-destination">{isTopic ? t('curriculumManagement.programme') : t('curriculumManagement.topic.destination')}</Label>
              <Select value={destination} onValueChange={setDestination} disabled={pending}>
                <SelectTrigger id="curriculum-destination" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isTopic ? programmes.map((programme) => (
                    <SelectItem key={programme} value={String(programme)}>{programmeLabel(programme, t)}</SelectItem>
                  )) : topics.map((topic) => (
                    <SelectItem key={topic.id} value={String(topic.id)}>{programmeLabel(topic.programme, t)} › {topic.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {impacts && <AudienceImpact impacts={impacts} description={t('curriculumManagement.impact.groupMoveDescription')} />}
          {stale && <p role="alert" className="rounded-[var(--sc-component-control-shape)] border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{t('curriculumManagement.errors.stale')}</p>}
          {error && !stale && <p role="alert" className="rounded-[var(--sc-component-control-shape)] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          {stale && <Button type="button" variant="outline" onClick={onReload} disabled={pending}>{t('curriculumManagement.reload')}</Button>}
          <Button type="button" variant="outline" onClick={() => onCancel?.({ dirty })} disabled={pending}>{t('curriculumManagement.cancel')}</Button>
          <Button form="curriculum-text-form" type="submit" disabled={pending || stale || !title.trim() || (!destination && isCreate)}>{pending ? t('curriculumManagement.saving') : t('curriculumManagement.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

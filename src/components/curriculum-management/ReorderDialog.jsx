import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, GripVertical } from '@/components/material-symbol'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function SortableRow({ item, index, total, pending, onMove, focusId }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.reorderId })
  const rowRef = useRef(null)
  const title = item.title ?? item.lecture?.title ?? ''
  const hidden = item.hidden ?? (item.lecture ? !Boolean(item.lecture.is_visible) : false)
  useEffect(() => {
    if (focusId === item.reorderId) rowRef.current?.focus()
  }, [focusId, item.reorderId])
  return (
    <li
      ref={(node) => { setNodeRef(node); rowRef.current = node }}
      tabIndex={-1}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--sc-component-control-shape)] border bg-card p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:!transition-none ${isDragging ? 'shadow-[var(--shadow-raised)] motion-reduce:shadow-none' : ''}`}
    >
      <Button type="button" variant="ghost" size="icon-lg" className="size-12 cursor-grab touch-none" disabled={pending} aria-label={t('curriculumManagement.reorder.drag', { title })} {...attributes} {...listeners}>
        <GripVertical />
      </Button>
      <div className="min-w-0">
        <p className="break-words font-medium"><span className="sr-only">{t('curriculumManagement.reorder.hiddenSibling', { number: index + 1 })}: </span>{index + 1}. {title}</p>
        {hidden && <p className="text-xs text-muted-foreground">{t('curriculumManagement.hidden')}</p>}
      </div>
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="icon-lg" onClick={() => onMove(index, -1)} disabled={pending || index === 0} aria-label={t('curriculumManagement.reorder.up', { title })}><ArrowUp /></Button>
        <Button type="button" variant="outline" size="icon-lg" onClick={() => onMove(index, 1)} disabled={pending || index === total - 1} aria-label={t('curriculumManagement.reorder.down', { title })}><ArrowDown /></Button>
      </div>
    </li>
  )
}

export function ReorderDialog({ open, title, description, items, pending, error, stale, onSave, onCancel, onReload, onDirtyChange }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState([])
  const [announcement, setAnnouncement] = useState('')
  const [focusId, setFocusId] = useState(null)
  const dragSnapshot = useRef(null)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (open) setDraft((items ?? []).map((item) => ({ ...item, reorderId: String(item.placement_id ?? item.id) })))
  }, [open, items])

  const changed = useMemo(() => draft.map((item) => item.reorderId).join(',') !== (items ?? []).map((item) => String(item.placement_id ?? item.id)).join(','), [draft, items])
  useEffect(() => { onDirtyChange?.(changed) }, [changed, onDirtyChange])

  function move(from, offset) {
    const to = from + offset
    if (to < 0 || to >= draft.length) return
    const next = arrayMove(draft, from, to)
    setDraft(next)
    setFocusId(draft[from].reorderId)
    setAnnouncement(t('curriculumManagement.reorder.announced', { title: draft[from].title ?? draft[from].lecture?.title ?? '', position: to + 1, total: draft.length }))
  }

  function reorder(activeId, overId) {
    if (!overId || activeId === overId) return
    setDraft((current) => {
      const oldIndex = current.findIndex((item) => item.reorderId === activeId)
      const newIndex = current.findIndex((item) => item.reorderId === overId)
      if (oldIndex < 0 || newIndex < 0) return current
      setAnnouncement(t('curriculumManagement.reorder.announced', { title: current[oldIndex].title ?? current[oldIndex].lecture?.title ?? '', position: newIndex + 1, total: current.length }))
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  function onDragStart() {
    dragSnapshot.current = draft
  }

  function onDragOver(event) {
    const { active, over } = event
    if (over) reorder(active.id, over.id)
  }

  function onDragCancel() {
    if (dragSnapshot.current) setDraft(dragSnapshot.current)
    dragSnapshot.current = null
  }

  function onDragEnd(event) {
    const { active, over } = event
    if (!over) onDragCancel()
    setFocusId(String(active.id))
    dragSnapshot.current = null
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onCancel?.({ dirty: changed }) }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl" closeLabel={t('curriculumManagement.closeDialog')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? t('curriculumManagement.reorder.description')}</DialogDescription>
        </DialogHeader>
        <div className="sr-only" aria-live="polite">{announcement}</div>
        {draft.length < 2 && <p className="rounded-[var(--sc-component-control-shape)] border bg-muted/40 p-3 text-sm">{t('curriculumManagement.reorder.notEnough')}</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragCancel={onDragCancel} onDragEnd={onDragEnd}>
          <SortableContext items={draft.map((item) => item.reorderId)} strategy={verticalListSortingStrategy}>
            <ol className="grid min-h-0 gap-2 overflow-y-auto pr-1">
              {draft.map((item, index) => <SortableRow key={item.reorderId} item={item} index={index} total={draft.length} pending={pending} onMove={move} focusId={focusId} />)}
            </ol>
          </SortableContext>
        </DndContext>
        {stale && <p role="alert" className="rounded-[var(--sc-component-control-shape)] border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{t('curriculumManagement.errors.stale')}</p>}
        {error && !stale && <p role="alert" className="rounded-[var(--sc-component-control-shape)] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          {stale && <Button type="button" variant="outline" onClick={onReload} disabled={pending}>{t('curriculumManagement.reload')}</Button>}
          <Button type="button" variant="outline" onClick={() => onCancel?.({ dirty: changed })} disabled={pending}>{t('curriculumManagement.cancel')}</Button>
          <Button type="button" onClick={() => onSave?.(draft.map((item) => Number(item.reorderId)))} disabled={pending || stale || !changed}>{pending ? t('curriculumManagement.saving') : t('curriculumManagement.reorder.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

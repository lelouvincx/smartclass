import React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from '@/components/material-symbol'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, destructive = false, pending = false, error, stale = false, onConfirm, onCancel, onReload }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onCancel?.() }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" closeLabel={t('curriculumManagement.closeDialog')}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && <AlertTriangle className="text-destructive" aria-hidden="true" />}
            {title}
          </DialogTitle>
          {typeof description === 'string'
            ? <DialogDescription>{description}</DialogDescription>
            : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-3">
          {description && typeof description !== 'string' && description}
          {stale && (
            <div className="rounded-[var(--sc-component-control-shape)] border border-warning/30 bg-warning/10 p-3 text-sm text-warning" role="alert">
              {t('curriculumManagement.errors.stale')}
            </div>
          )}
          {error && !stale && (
            <div className="rounded-[var(--sc-component-control-shape)] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          {stale && <Button type="button" variant="outline" onClick={onReload} disabled={pending}>{t('curriculumManagement.reload')}</Button>}
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>{cancelLabel ?? t('curriculumManagement.cancel')}</Button>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={pending || stale}>
            {pending ? t('curriculumManagement.saving') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

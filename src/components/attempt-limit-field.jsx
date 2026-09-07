import React from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function AttemptLimitField({ id, value, onChange, disabled = false, className = '' }) {
  const { t } = useTranslation()
  const mode = value === null ? 'unlimited' : 'limited'
  const descriptionId = `${id}-description`
  const switchId = `${id}-mode`

  return (
    <fieldset className={`space-y-2 ${className}`}>
      <legend className="text-sm font-medium">{t('teacher.attemptLimit.legend')}</legend>
      <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
        {t('teacher.attemptLimit.description')}
      </p>
      <div className="flex min-h-[var(--sc-component-hit-target)] items-center justify-between gap-4 rounded-[var(--sc-component-control-shape)] border border-input bg-background px-3 py-2">
        <Label
          htmlFor={switchId}
          className="cursor-pointer text-sm font-medium"
        >
          {mode === 'limited'
            ? t('teacher.attemptLimit.limited')
            : t('teacher.attemptLimit.unlimited')}
        </Label>
        <Switch
          id={switchId}
          checked={mode === 'limited'}
          onCheckedChange={(checked) => onChange(checked ? 1 : null)}
          aria-describedby={descriptionId}
          disabled={disabled}
        />
      </div>
      {mode === 'limited' && (
        <div className="max-w-48 space-y-2">
          <Label htmlFor={`${id}-maximum`}>{t('teacher.attemptLimit.maximum')}</Label>
          <Input
            id={`${id}-maximum`}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
          />
        </div>
      )}
    </fieldset>
  )
}

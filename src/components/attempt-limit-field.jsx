import React from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export function AttemptLimitField({ id, value, onChange, disabled = false, className = '' }) {
  const { t } = useTranslation()
  const mode = value === null ? 'unlimited' : 'limited'
  const descriptionId = `${id}-description`

  return (
    <fieldset className={`space-y-2 ${className}`}>
      <legend className="text-sm font-medium">{t('teacher.attemptLimit.legend')}</legend>
      <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
        {t('teacher.attemptLimit.description')}
      </p>
      <RadioGroup
        value={mode}
        onValueChange={(nextMode) => onChange(nextMode === 'unlimited' ? null : 1)}
        disabled={disabled}
        aria-describedby={descriptionId}
        className="grid gap-2 sm:grid-cols-2"
      >
        <Label
          htmlFor={`${id}-limited`}
          className="min-h-[var(--sc-component-hit-target)] cursor-pointer rounded-[var(--sc-component-control-shape)] border border-input bg-background px-3 py-2"
        >
          <RadioGroupItem id={`${id}-limited`} value="limited" />
          {t('teacher.attemptLimit.limited')}
        </Label>
        <Label
          htmlFor={`${id}-unlimited`}
          className="min-h-[var(--sc-component-hit-target)] cursor-pointer rounded-[var(--sc-component-control-shape)] border border-input bg-background px-3 py-2"
        >
          <RadioGroupItem id={`${id}-unlimited`} value="unlimited" />
          {t('teacher.attemptLimit.unlimited')}
        </Label>
      </RadioGroup>
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

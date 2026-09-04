import React from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { GRADES, hasAllGrades } from '@/lib/grades'
import { cn } from '@/lib/utils'

function GradeOption({ id, label, checked, disabled, onChange }) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-[var(--sc-component-hit-target)] cursor-pointer items-center gap-2 rounded-[var(--sc-component-control-shape)] border border-border bg-background px-3 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
    >
      <input
        id={id}
        type="checkbox"
        className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  )
}

export default function GradeCheckboxGroup({
  id,
  legend,
  description,
  value,
  onChange,
  disabled = false,
  className,
}) {
  const { t } = useTranslation()
  const allSelected = hasAllGrades(value)
  const descriptionId = description ? `${id}-description` : undefined

  function toggleGrade(grade) {
    const nextGrades = value.includes(grade)
      ? value.filter((item) => item !== grade)
      : [...value, grade].sort((a, b) => a - b)
    onChange(nextGrades)
  }

  return (
    <fieldset
      className={cn('space-y-2', className)}
      aria-describedby={descriptionId}
      disabled={disabled}
    >
      <legend className="text-sm font-medium">{legend}</legend>
      {description && (
        <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">{description}</p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <GradeOption
          id={`${id}-all`}
          label={t('common.allGrades')}
          checked={allSelected}
          disabled={disabled}
          onChange={() => onChange(allSelected ? [] : [...GRADES])}
        />
        {GRADES.map((grade) => (
          <GradeOption
            key={grade}
            id={`${id}-${grade}`}
            label={t('common.grade', { grade })}
            checked={value.includes(grade)}
            disabled={disabled}
            onChange={() => toggleGrade(grade)}
          />
        ))}
      </div>
    </fieldset>
  )
}

export function GradeBadges({ grades = [], emptyText, className }) {
  const { t } = useTranslation()

  if (grades.length === 0) {
    return emptyText ? <span className="text-xs text-muted-foreground">{emptyText}</span> : null
  }

  return (
    <span className={cn('flex flex-wrap gap-1.5', className)}>
      {grades.map((grade) => (
        <Badge key={grade} variant="outline">{t('common.grade', { grade })}</Badge>
      ))}
    </span>
  )
}

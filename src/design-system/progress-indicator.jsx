import React from 'react'
import { cn } from '@/lib/utils'

export function ProgressIndicator({
  className,
  indicatorClassName,
  label,
  value,
  valueText,
  variant = 'default',
}) {
  const isIndeterminate = value === undefined || value === null
  const normalizedValue = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  const indicatorColor = variant === 'danger' ? 'bg-destructive' : 'bg-primary'

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={isIndeterminate ? undefined : normalizedValue}
      aria-valuetext={valueText}
      data-slot="progress-indicator"
      data-variant={variant}
      data-indeterminate={isIndeterminate ? '' : undefined}
      className={cn(
        'relative h-1 w-full overflow-hidden rounded-[var(--sc-shape-full)] bg-secondary',
        className,
      )}
    >
      <div
        data-slot="progress-indicator-bar"
        className={cn(
          'absolute inset-y-0 left-0 rounded-[var(--sc-shape-full)] transition-[width] duration-[var(--sc-motion-duration-medium)] ease-[var(--sc-motion-standard)] motion-reduce:transition-none',
          indicatorColor,
          isIndeterminate && 'sc-linear-progress-indicator__bar w-1/2',
          indicatorClassName,
        )}
        style={isIndeterminate ? undefined : { width: `${normalizedValue}%` }}
      />
      {!isIndeterminate && normalizedValue < 100 && (
        <span
          aria-hidden="true"
          data-slot="progress-indicator-stop"
          className={cn('absolute right-0 top-1/2 size-1 -translate-y-1/2 rounded-full', indicatorColor)}
        />
      )}
    </div>
  )
}

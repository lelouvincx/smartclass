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
  const normalizedValue = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={normalizedValue}
      aria-valuetext={valueText}
      data-slot="progress-indicator"
      data-variant={variant}
      className={cn(
        'h-2 w-full overflow-hidden rounded-[var(--sc-shape-full)] bg-sc-surface-container-high',
        className,
      )}
    >
      <div
        data-slot="progress-indicator-bar"
        className={cn(
          'h-full rounded-[var(--sc-shape-full)] transition-[width] duration-[var(--sc-motion-duration-medium)] ease-[var(--sc-motion-standard)] motion-reduce:transition-none',
          variant === 'danger' ? 'bg-destructive' : 'bg-primary',
          indicatorClassName,
        )}
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  )
}

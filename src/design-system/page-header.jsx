import React from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions, className }) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-[length:var(--sc-type-headline-size)] leading-[var(--sc-type-headline-line-height)] font-[var(--sc-type-headline-weight)] tracking-[-0.03em] text-foreground text-balance">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

import React from 'react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <Empty className={cn('min-h-56 bg-sc-surface-container/55 py-12', className)}>
      <EmptyHeader>
        {Icon && (
          <EmptyMedia
            variant="icon"
            className="size-14 rounded-[var(--sc-component-focal-shape)] bg-sc-tertiary-container text-sc-on-tertiary-container transition-[border-radius,transform] duration-[var(--sc-motion-duration-long)] ease-[var(--sc-motion-expressive)] motion-safe:hover:rotate-3 motion-safe:hover:scale-105"
          >
            <Icon className="size-5" aria-hidden="true" />
          </EmptyMedia>
        )}
        <h2 className="text-lg font-semibold tracking-tight text-foreground text-balance">{title}</h2>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

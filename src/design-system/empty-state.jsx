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
    <Empty className={cn('min-h-56 py-12', className)}>
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon" className="size-11 rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </EmptyMedia>
        )}
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

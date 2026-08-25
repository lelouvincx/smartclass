import React from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function ActionCard({ to, icon: Icon, title, description, className }) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex min-h-28 items-start gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      {Icon && (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-6">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
      <ArrowRight
        className="mt-3 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  )
}

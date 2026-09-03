import React from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function ActionCard({ to, icon: Icon, title, description, emphasis = false, className }) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-start gap-4 rounded-[var(--sc-component-card-shape)] border p-5 shadow-sm transition-[border-color,background-color,box-shadow,transform,border-radius] duration-[var(--sc-motion-duration-medium)] ease-[var(--sc-motion-expressive)] motion-safe:hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        emphasis
          ? 'border-primary/15 bg-sc-primary-container text-sc-on-primary-container motion-safe:hover:rounded-[var(--sc-component-focal-shape)] hover:border-primary/30'
          : 'bg-card text-card-foreground hover:border-primary/30',
        className,
      )}
    >
      {Icon && (
        <span className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] transition-[border-radius,transform] duration-[var(--sc-motion-duration-medium)] ease-[var(--sc-motion-expressive)] motion-safe:group-hover:scale-105',
          emphasis ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        )}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-6">{title}</span>
        <span className={cn(
          'mt-1 block text-sm leading-5',
          emphasis ? 'text-sc-on-primary-container/75' : 'text-muted-foreground',
        )}>
          {description}
        </span>
      </span>
      <ArrowRight
        className={cn(
          'mt-3 size-4 shrink-0 transition-transform duration-[var(--sc-motion-duration-short)] motion-safe:group-hover:translate-x-1',
          emphasis ? 'text-sc-on-primary-container' : 'text-muted-foreground group-hover:text-primary',
        )}
        aria-hidden="true"
      />
    </Link>
  )
}

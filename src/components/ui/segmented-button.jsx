import * as React from "react"

import { cn } from "@/lib/utils"

function SegmentedButtonGroup({ className, ...props }) {
  return (
    <div
      data-slot="segmented-button-group"
      className={cn(
        "inline-flex min-h-[var(--sc-component-hit-target)] overflow-hidden rounded-[var(--sc-component-control-shape)] border border-input bg-background p-0.5 shadow-sm",
        className,
      )}
      {...props}
    />
  )
}

function SegmentedButton({ className, selected = false, ...props }) {
  return (
    <button
      type="button"
      data-slot="segmented-button"
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      className={cn(
        "relative inline-flex min-h-10 min-w-[var(--sc-component-hit-target)] flex-1 items-center justify-center px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-[var(--sc-motion-duration-short)] ease-[var(--sc-motion-standard)] outline-none first:rounded-l-[calc(var(--sc-component-control-shape)-2px)] last:rounded-r-[calc(var(--sc-component-control-shape)-2px)] not-first:border-l not-first:border-input hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[selected=true]:bg-sc-primary-container data-[selected=true]:text-sc-on-primary-container data-[selected=true]:shadow-sm dark:hover:bg-input/50",
        className,
      )}
      {...props}
    />
  )
}

export { SegmentedButton, SegmentedButtonGroup }

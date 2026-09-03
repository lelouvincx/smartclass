"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Sheet({ ...props }) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetPortal({ ...props }) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-300",
        className,
      )}
      {...props}
    />
  )
}

function SheetContent({ className, children, side = "bottom", closeLabel = "Close", ...props }) {
  const sideClasses = side === "left"
    ? "inset-y-0 left-0 flex h-dvh w-[min(20rem,85vw)] flex-col overflow-y-auto rounded-e-[var(--sc-component-focal-shape)] border-r bg-background p-0 shadow-lg data-open:slide-in-from-left data-closed:slide-out-to-left"
    : "inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t bg-background p-6 shadow-lg data-open:slide-in-from-bottom data-closed:slide-out-to-bottom"

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 data-open:animate-in data-closed:animate-out duration-300",
          sideClasses,
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-4 top-4 size-[48px] text-muted-foreground"
          >
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />
}

function SheetTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold leading-none", className)}
      {...props}
    />
  )
}

export { Sheet, SheetContent, SheetHeader, SheetTitle }

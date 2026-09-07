"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-[var(--sc-shape-full)] border border-transparent p-1 transition-[background-color,border-color,box-shadow] duration-[var(--sc-motion-duration-short)] ease-[var(--sc-motion-standard)] outline-none after:absolute after:-inset-x-2 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-7 data-[size=default]:w-12 data-[size=sm]:h-6 data-[size=sm]:w-10 data-[state=checked]:bg-primary data-[state=unchecked]:border-input data-[state=unchecked]:bg-sc-surface-container-high data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-[state=unchecked]:bg-input/80",
        className
      )}
      {...props}>
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-[var(--sc-shape-full)] bg-foreground shadow-sm ring-0 transition-transform duration-[var(--sc-motion-duration-short)] ease-[var(--sc-motion-standard)] motion-reduce:transition-none group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-5 group-data-[size=default]/switch:data-[state=checked]:translate-x-5 group-data-[size=sm]/switch:data-[state=checked]:translate-x-4 group-data-[state=checked]/switch:bg-primary-foreground group-data-[state=unchecked]/switch:translate-x-0 group-data-[state=unchecked]/switch:bg-foreground" />
    </SwitchPrimitive.Root>
  );
}

export { Switch }

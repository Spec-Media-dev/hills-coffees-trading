import type { ComponentProps } from "react"

import { cn } from "cn"

type FilterChipProps = ComponentProps<"button"> & { selected?: boolean }

function FilterChip({ className, selected = false, type = "button", ...props }: FilterChipProps) {
  return (
    <button
      type={type}
      data-slot="filter-chip"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-pill)] border border-border bg-[var(--surface-card)] px-4 text-sm font-semibold text-foreground transition-[border-color,background-color] duration-[var(--dur-fast)] hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-[0.45]",
        selected && "border-primary bg-primary text-primary-foreground",
        className
      )}
      {...props}
    />
  )
}

export { FilterChip }

import type { ComponentProps } from "react"

import { cn } from "cn"

type PanelProps = ComponentProps<"section"> & {
  actionNeeded?: boolean
}

function Panel({ className, actionNeeded = false, ...props }: PanelProps) {
  return (
    <section
      data-slot="panel"
      data-action-needed={actionNeeded || undefined}
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 shadow-[var(--shadow-xs)] transition-[box-shadow,border-color] duration-[var(--dur-fast)]",
        actionNeeded && "border-[var(--gold-on-light)] dark:border-[var(--gold-on-dark)]",
        className
      )}
      {...props}
    />
  )
}

export { Panel }

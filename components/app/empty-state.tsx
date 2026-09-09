import type { ReactNode } from "react"

import { Icon } from "@/components/ui/icon"

type EmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section data-slot="empty-state" className="flex min-h-52 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-8 text-center">
      <Icon name="inbox" className="mb-4 size-8 text-muted-foreground" />
      <h2 className="hc-heading-3 font-semibold">{title}</h2>
      <p className="mt-2 max-w-[62ch] text-sm leading-[var(--lh-body)] text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  )
}

export { EmptyState }

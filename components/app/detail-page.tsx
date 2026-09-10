import type { ReactNode } from "react"

import { PageHeader, type PageHeaderProps } from "@/components/app/page-header"
import { cn } from "cn"

/**
 * Reusable Member/Admin "record detail" layout pattern (Phase 5.5, UIF-037 buyer patterns / UIF-040
 * admin operational patterns).
 *
 * ── LAYOUT ONLY (UIF-037/UIF-040 MUST NOT) ───────────────────────────────────────────────────────
 *
 * The shape a future record view shares regardless of domain: page header + breadcrumb, a main
 * content column (sections, panels, optionally `Tabs` from `components/ui/tabs.tsx`), and an
 * optional inline-end summary rail — the pattern Order detail, Custody, Organisation and KYB status
 * all need. Every slot is caller-supplied; this component reads no record.
 *
 * Stacks to a single column at 390px (`lg:grid-cols-[minmax(0,1fr)_20rem]` only applies at `lg`+),
 * matching UIF-035/040's "mobile transforms deliberately" requirement rather than squeezing a
 * two-column desktop layout narrow.
 */
export type DetailPageProps = PageHeaderProps & {
  children: ReactNode
  /** The inline-end summary rail (status, key facts, related links). Optional — omit for a
   * single-column record view. */
  summary?: ReactNode
  className?: string
}

export function DetailPage({ children, summary, className, ...header }: DetailPageProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <PageHeader {...header} />
      <div className={cn("grid min-w-0 gap-6", summary ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : undefined)}>
        <div className="min-w-0">{children}</div>
        {summary ? <aside className="flex min-w-0 flex-col gap-4">{summary}</aside> : null}
      </div>
    </div>
  )
}

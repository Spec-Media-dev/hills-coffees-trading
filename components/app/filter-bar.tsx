import type { ReactNode } from "react"

import { cn } from "cn"

/**
 * Reusable Admin (and Member) queue filter bar (Phase 5.5, UIF-040 admin operational patterns).
 *
 * A thin layout wrapper around the already-approved `FilterChip` (UIF-010) — this file adds no new
 * control, just the row/wrap/gap composition every future queue's filter row needs, plus a
 * `role="group"` landmark and an optional clear action. Reused as-is by `ModulePage`'s `toolbar`
 * slot. Reads no data and applies no filter itself; the caller supplies live `FilterChip`
 * instances and their `onClick`/`selected` state once a real module exists.
 */
export type FilterBarProps = {
  label: string
  children: ReactNode
  clearAction?: ReactNode
  className?: string
}

export function FilterBar({ label, children, clearAction, className }: FilterBarProps) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {clearAction ? <div className="ms-auto">{clearAction}</div> : null}
    </div>
  )
}

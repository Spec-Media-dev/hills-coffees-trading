import type { ReactNode } from "react"

import { cn } from "cn"

/**
 * Reusable Admin (and Member) record action bar (Phase 5.5, UIF-040 admin operational patterns).
 *
 * A trailing-aligned row of controls for a detail view or a review drawer — the layout half of
 * "dialogs/drawers for review actions". This file renders no button of its own and no operational
 * verb: `children` is filled entirely by the calling feature once
 * it has real backend authority for whatever action it renders (run directive §31 — "no fake
 * admin operations"). Composes with the existing `Dialog`/`Sheet` (UIF-014) for the review-drawer
 * shape; this file does not wrap or re-implement either.
 */
export type ActionBarProps = {
  children: ReactNode
  /** Leading content — typically a status summary or record identifier. */
  leading?: ReactNode
  className?: string
}

export function ActionBar({ children, leading, className }: ActionBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4", className)}>
      {leading ? <div className="min-w-0">{leading}</div> : <div />}
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

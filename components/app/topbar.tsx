import type { ReactNode } from "react"

import { cn } from "cn"

/**
 * Member/Admin application topbar (Phase 5.5, UIF-035 — contract §1, §11, §12; design reference
 * the approved Hills design system's Topbar reference component).
 *
 * Sticky, `--topbar-h` (64px) tall, workspace eyebrow + identity line on the inline-start,
 * breadcrumbs beneath, actions cluster (theme/locale/mobile-menu/identity) on the inline-end —
 * pushed there with the logical `ms-auto` utility (a physical margin utility would not mirror), so
 * it sits on the correct edge under `dir="rtl"`. Server Component: every slot it renders (`actions`,
 * `breadcrumbs`) is composed by
 * the caller from already-existing client islands (`ThemeToggle`, `LanguageSwitcher`,
 * `MobileAppNav`) — this file adds no interactivity and no `"use client"` of its own.
 */

export type TopbarProps = {
  /** `ReactNode` so a caller can pass `<Bilingual pick={...} />` for real Arabic support. */
  workspaceLabel: ReactNode
  subtitle?: ReactNode
  breadcrumbs?: ReactNode
  actions?: ReactNode
  /** Rendered before the workspace/identity column — the mobile drawer trigger. */
  leading?: ReactNode
  className?: string
}

export function Topbar({ workspaceLabel, subtitle, breadcrumbs, actions, leading, className }: TopbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex min-h-[var(--topbar-h)] items-center gap-4 border-b border-border bg-[color-mix(in_srgb,var(--surface-page)_94%,transparent)] px-[var(--gutter-page)] py-3 supports-[backdrop-filter]:[backdrop-filter:var(--blur-panel)]",
        className,
      )}
    >
      {leading ? <div className="shrink-0 lg:hidden">{leading}</div> : null}

      <div className="flex min-w-0 flex-col gap-1">
        <span className="hc-eyebrow text-muted-foreground">{workspaceLabel}</span>
        {subtitle ? (
          <span className="truncate text-[length:var(--text-small)] font-medium text-foreground">{subtitle}</span>
        ) : null}
        {breadcrumbs}
      </div>

      {actions ? <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

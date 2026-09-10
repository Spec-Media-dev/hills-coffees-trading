import type { ReactNode } from "react"

/**
 * Shared navigation shapes for the Member and Admin application shells (Phase 5.5, UIF-035).
 *
 * Server-safe: no `"use client"`, no framework import. Both `Sidebar` (Server Component) and
 * `MobileAppNav` (the one client island) render from this exact shape, so the desktop and mobile
 * navigation can never drift into two different structures.
 *
 * PRESENTATIONAL, PROP-DRIVEN, ROLE-AGNOSTIC (contract §1, §11, §12; UIF-035/041 MUST NOT clauses).
 * Nothing here reads a capability, a role or an organization — every group/item is supplied by the
 * caller. `components/app/member-navigation.ts` and `components/app/admin-navigation.ts` are the
 * pure functions that BUILD a `AppNavGroup[]` from caller-supplied flags; this file only declares
 * the shape they build.
 */

export type AppNavItem = {
  key: string
  /**
   * `ReactNode`, not `string` — callers pass `<Bilingual pick={(c) => c.app.overview} />` (the same
   * server-rendered dual-span technique the public header uses) so this label renders correctly in
   * both languages while `Sidebar` stays a Server Component. A plain string still works for
   * genuinely bilingual-irrelevant content (an item builder that is only ever rendered from a
   * client context, where `useLocale()` already resolved the string).
   */
  label: ReactNode
  href: string
  icon?: ReactNode
  /** Secondary line under the label, e.g. "Types, processing, certifications". Desktop only. */
  description?: ReactNode
  badge?: number | string
}

export type AppNavGroup = {
  /** Stable React list key — `label` is a `ReactNode` and cannot serve as one. */
  key: string
  /** Uppercase group label (rendered through the Hills gold-on-dark eyebrow treatment). */
  label: ReactNode
  items: readonly AppNavItem[]
}

export type AppIdentity = {
  /** Short workspace eyebrow, e.g. "Member portal" / "Operations console". */
  workspaceLabel: string
  /** Signed-in identity or context line, e.g. an organization name or role list. */
  subtitle: string
}

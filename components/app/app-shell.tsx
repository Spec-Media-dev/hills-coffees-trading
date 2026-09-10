import type { ReactNode } from "react"

import type { AppNavGroup } from "@/components/app/app-navigation"
import { MobileAppNav } from "@/components/app/mobile-app-nav"
import { Sidebar } from "@/components/app/sidebar"
import { Topbar } from "@/components/app/topbar"
import { LanguageSwitcher } from "@/components/locale/language-switcher"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { appCopy } from "@/lib/app/copy"
import { copy } from "@/lib/public/copy"

/**
 * Shared Member/Admin application shell (Phase 5.5, UIF-035 — contract §1, §11, §12; design
 * the approved Hills design system's Sidebar/Topbar navigation reference components).
 *
 * ── THE ARCHITECTURE EVERY MEMBER AND ADMIN SCREEN INHERITS ──────────────────────────────────────
 *
 * `Sidebar` (desktop, `lg:` and above) + `Topbar` (sticky, carries the mobile drawer trigger below
 * `lg`, breadcrumbs/actions above it) + a content region capped at the shared 96rem product frame
 * (contract §2 — "the one shared container: Public, Member, Admin"). `MobileAppNav` is the single
 * client island this component pulls in; `Sidebar`, `Topbar` and this file are themselves Server
 * Components.
 *
 * ── PRESENTATIONAL, PROP-DRIVEN (UIF-035 MUST NOT) ───────────────────────────────────────────────
 *
 * No capability, role or organization is read here. `navGroups`, `activeKey`, `workspaceLabel` and
 * `identitySubtitle` are supplied entirely by the caller (`dashboard/layout.tsx`,
 * `dashboard-admin/layout.tsx`). This file does not implement Feature 004's module-registration
 * contract — it is the shell that contract will eventually feed navigation into.
 *
 * ── EN/AR ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * `workspaceLabel`/`identitySubtitle`/`breadcrumbs` are typed `ReactNode` precisely so a caller can
 * pass `<AppBilingual pick={(c) => c.memberWorkspace} />` (`components/locale/app-bilingual.tsx` —
 * the same server-rendered dual-span technique the public shell's `Bilingual` uses, sourced from
 * `lib/app/copy` instead) and get real Arabic without this file — or `Sidebar`/`Topbar` — becoming
 * a client island. `MobileAppNav` resolves its own chrome strings live via `useLocale().tApp`, so
 * no copy is threaded through this component into it.
 *
 * ── RESPONSIVE COLLAPSE ───────────────────────────────────────────────────────────────────────────
 *
 * `Sidebar` is `hidden lg:flex`; `MobileAppNav`'s trigger is `lg:hidden` (set inside `Topbar`'s
 * `leading` slot). At tablet and below the sidebar is fully replaced by the drawer — not squeezed,
 * not icon-only — matching UIF-035's exact Verify wording ("collapses to a drawer at tablet and
 * below").
 *
 * ── RTL ───────────────────────────────────────────────────────────────────────────────────────────
 *
 * `flex` with no explicit `flex-row`/`row-reverse` — the browser's own bidi algorithm reorders the
 * two flex children (`Sidebar`, content column) under `dir="rtl"`, which is what puts the sidebar on
 * the visual right without a single directional override in this file.
 */

export type AppShellProps = {
  navGroups: readonly AppNavGroup[]
  activeKey?: string
  workspaceLabel: ReactNode
  identitySubtitle?: ReactNode
  logoHref: string
  footerNote?: string
  children: ReactNode
  breadcrumbs?: ReactNode
  topbarActions?: ReactNode
}

export function AppShell({
  navGroups,
  activeKey,
  workspaceLabel,
  identitySubtitle,
  logoHref,
  footerNote,
  children,
  breadcrumbs,
  topbarActions,
}: AppShellProps) {
  return (
    <div className="flex min-h-full flex-1">
      <Sidebar
        logoHref={logoHref}
        logoLabel={copy.a11y.homeLink}
        groups={navGroups}
        activeKey={activeKey}
        footerNote={footerNote}
        navigationLabel={appCopy.sidebarNavigation}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          workspaceLabel={workspaceLabel}
          subtitle={identitySubtitle}
          breadcrumbs={breadcrumbs}
          leading={
            <MobileAppNav
              groups={navGroups}
              logoHref={logoHref}
              logoLabel={copy.a11y.homeLink}
              footerNote={footerNote}
            />
          }
          actions={
            <>
              {topbarActions}
              <ThemeToggle />
              <LanguageSwitcher />
            </>
          }
        />

        <main className="flex-1">
          <div className="hc-container py-6 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  )
}

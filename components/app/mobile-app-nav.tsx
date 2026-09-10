"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import type { AppNavGroup } from "@/components/app/app-navigation"
import { useLocale } from "@/components/locale/locale-provider"
import { LanguageSwitcher } from "@/components/locale/language-switcher"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { IconButton } from "@/components/ui/icon-button"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

/**
 * Member/Admin mobile navigation drawer (Phase 5.5, UIF-035 — contract §12, §13, §15).
 *
 * THE ONE NEW CLIENT ISLAND this block introduces, and it is narrow by design (run directive §22):
 * a drawer's open/close state and its route-derived active item cannot be server-rendered. Built on
 * the exact same `Sheet` primitive and pattern as the public shell's `MobileNav` — inline-end entry,
 * focus trap, Escape-close and focus-restore all come from the primitive, so this file adds no
 * bespoke focus logic. Animation ownership is CSS alone, unchanged from that precedent.
 *
 * UNLIKE the desktop `Sidebar` (a Server Component reading `activeKey` from a prop), this drawer
 * computes its own active item from `usePathname()` — it is already a client boundary for its open
 * state, so there is no additional cost to also resolving "current page" correctly here, and no
 * new server/client tradeoff is introduced anywhere else.
 *
 * CHROME STRINGS ARE SELF-RESOLVED, NOT PASSED FROM THE SERVER. `useLocale()` gives this component
 * the live, locale-reactive dictionary (`t.app.*`) directly — unlike a Server Component, it can
 * genuinely re-render in Arabic the instant the visitor switches language, so the menu title, the
 * open/close labels and the drawer's own landmark name are read here rather than being resolved
 * once (in English) by the Server Component parent and handed down as static props.
 */
export type MobileAppNavProps = {
  groups: readonly AppNavGroup[]
  logoHref: string
  logoLabel: string
  footerNote?: string
}

export function MobileAppNav({ groups, logoHref, logoLabel, footerNote }: MobileAppNavProps) {
  const pathname = usePathname()
  const { direction, tApp } = useLocale()
  const labels = tApp
  const [open, setOpen] = useState(false)
  const [shownFor, setShownFor] = useState(pathname)

  // Same "adjust state during render" correction the public drawer uses: a route change while open
  // must close the drawer immediately, including on back/forward, which no click handler observes.
  if (shownFor !== pathname) {
    setShownFor(pathname)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <IconButton type="button" variant="outline" aria-label={labels.openMenu} aria-expanded={open} />
        }
      >
        <Icon name="menu" className="size-5" />
      </SheetTrigger>

      <SheetContent side="inline-end" showCloseButton={false} className="w-[var(--drawer-w)] gap-0 bg-[var(--sidebar)] p-0 text-[var(--sidebar-foreground)] sm:max-w-[var(--drawer-w)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--sidebar-border)] px-5 py-3">
          <Link
            href={logoHref}
            aria-label={logoLabel}
            onClick={() => setOpen(false)}
            className="grid h-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--brand-cream)] px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sidebar-ring)]"
          >
            <span className="font-heading text-[length:var(--text-micro)] font-black tracking-[0.04em] text-[var(--brand-forest)]">
              HILLS
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <SheetTitle className="hc-eyebrow text-[var(--gold-on-dark)]">{labels.menuTitle}</SheetTitle>
            <p className="sr-only">{labels.sidebarNavigation}</p>
          </div>
          <IconButton type="button" variant="text" aria-label={labels.closeMenu} onClick={() => setOpen(false)} className="text-[var(--sidebar-foreground)]">
            <Icon name="x" className="size-5" />
          </IconButton>
        </div>

        <nav aria-label={labels.sidebarNavigation} className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group.key} className="mb-4">
              <p className="hc-eyebrow px-3 pb-2 text-[var(--gold-on-dark)]">{group.label}</p>
              {group.items.map((item) => {
                // `usePathname()` types as `string | null`; treat the unmounted-router edge case as
                // "nothing is active" rather than throwing.
                const isActive = pathname != null && (pathname === item.href || pathname.startsWith(`${item.href}/`))
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className="flex min-h-[3.25rem] items-center gap-3 rounded-[var(--radius-sm)] px-3 text-[length:var(--text-body)] font-medium text-[color-mix(in_srgb,var(--sidebar-foreground)_82%,transparent)] transition-colors duration-[var(--dur-fast)] hover:bg-[color-mix(in_srgb,var(--sidebar-foreground)_7%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--sidebar-ring)] aria-[current=page]:bg-[var(--forest-500)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--brand-cream)]"
                  >
                    {item.icon ? (
                      <span aria-hidden="true" className="inline-flex shrink-0 opacity-90">
                        {item.icon}
                      </span>
                    ) : null}
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 border-t border-[var(--sidebar-border)] p-4">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>

        {footerNote ? (
          <p className="border-t border-[var(--sidebar-border)] px-4 py-3 text-[length:var(--text-micro)] text-[color-mix(in_srgb,var(--sidebar-foreground)_56%,transparent)]" dir={direction}>
            {footerNote}
          </p>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

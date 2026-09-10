import Link from "next/link"

import type { AppNavGroup } from "@/components/app/app-navigation"
import { cn } from "cn"

/**
 * Member/Admin application sidebar (Phase 5.5, UIF-035 — contract §1, §11, §12; design reference
 * the approved Hills design system's Sidebar reference component).
 *
 * ── ALWAYS DARK FOREST, REGARDLESS OF THEME ──────────────────────────────────────────────────────
 *
 * The design reference is explicit: "Always dark forest, regardless of theme." Unlike the rest of
 * the shell, this surface does not invert under `.dark` — it is a fixed brand panel, using the
 * `--sidebar-*` tokens `globals.css` already defines identically in both `:root` and `.dark`
 * (`--sidebar: #173c32` light / `#0e2620` dark — both are forest, by design, not by coincidence).
 *
 * ── PRESENTATIONAL, PROP-DRIVEN (UIF-035 MUST NOT) ───────────────────────────────────────────────
 *
 * This component reads no capability, no role and no organization. It renders exactly the
 * `AppNavGroup[]` it is given. `activeKey` is supplied by the calling page/layout rather than read
 * from `usePathname()`, which is what keeps this a Server Component — the same documented tradeoff
 * the public header's desktop navigation already makes (`site-header.tsx`), and for the same reason:
 * a client-only primitive would cost a new island for a cosmetic active-state a server prop already
 * solves. The client-side mobile drawer (`mobile-app-nav.tsx`) computes its own active state from
 * `usePathname()` because it is already a client island for its drawer state.
 *
 * ── RTL ───────────────────────────────────────────────────────────────────────────────────────────
 *
 * Logical properties only (`border-e`/`ps-*`/`text-start`). Placed at the inline-start of the shell
 * by the parent's flex order in `app-shell.tsx`; under `dir="rtl"` that resolves to the visual right
 * edge automatically — no directional CSS override needed here.
 */

export type SidebarProps = {
  logoHref: string
  logoLabel: string
  groups: readonly AppNavGroup[]
  activeKey?: string
  footerNote?: string
  navigationLabel: string
  className?: string
}

export function Sidebar({
  logoHref,
  logoLabel,
  groups,
  activeKey,
  footerNote,
  navigationLabel,
  className,
}: SidebarProps) {
  return (
    <nav
      aria-label={navigationLabel}
      className={cn(
        "hidden h-full w-[var(--sidebar-w)] shrink-0 flex-col overflow-hidden border-e border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] lg:flex",
        className,
      )}
    >
      <div className="p-5">
        <Link
          href={logoHref}
          aria-label={logoLabel}
          className="grid h-[60px] place-items-center rounded-[var(--radius-md)] bg-[var(--brand-cream)] px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sidebar-ring)]"
        >
          <span className="font-heading text-[length:var(--text-small)] font-black tracking-[0.04em] text-[var(--brand-forest)]">
            HILLS
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.key} className="mb-6">
            <p className="hc-eyebrow px-3 pb-3 text-[var(--gold-on-dark)]">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = item.key === activeKey
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-start transition-[background-color,color] duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--sidebar-ring)]",
                        isActive
                          ? "bg-[var(--forest-500)] text-[var(--brand-cream)]"
                          : "text-[color-mix(in_srgb,var(--sidebar-foreground)_78%,transparent)] hover:bg-[color-mix(in_srgb,var(--sidebar-foreground)_7%,transparent)] hover:text-[var(--sidebar-foreground)]",
                      )}
                    >
                      {item.icon ? (
                        <span aria-hidden="true" className={cn("inline-flex shrink-0", isActive ? "opacity-100" : "opacity-80")}>
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-col">
                        <span
                          className={cn(
                            "truncate text-[length:var(--text-small)]",
                            isActive ? "font-semibold" : "font-medium",
                          )}
                        >
                          {item.label}
                        </span>
                        {item.description ? (
                          <span className="truncate text-[length:var(--text-micro)] text-[color-mix(in_srgb,var(--sidebar-foreground)_56%,transparent)]">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {item.badge != null ? (
                        <span className="ms-auto inline-flex shrink-0 items-center rounded-[var(--radius-pill)] bg-[var(--gold-on-dark)] px-1.5 py-0.5 text-[length:var(--text-micro)] font-bold tabular-nums text-[var(--forest-800)]">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {footerNote ? (
        <div className="border-t border-[var(--sidebar-border)] p-4 text-[length:var(--text-micro)] text-[color-mix(in_srgb,var(--sidebar-foreground)_56%,transparent)]">
          {footerNote}
        </div>
      ) : null}
    </nav>
  )
}

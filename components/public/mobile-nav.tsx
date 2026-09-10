"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { useLocale } from "@/components/locale/locale-provider";
import { PRIMARY_NAV, PUBLIC_ROUTES } from "@/components/public/routes";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Public mobile navigation drawer (Phase 5.5, UIF-021 — contract §12, §13, §15; design MobileDrawer).
 *
 * A DELIBERATE MOBILE COMPOSITION, not a compressed desktop navbar. The design system's spec is
 * followed directly: 52px rows, the sheet enters from the **inline-end** edge, and the footer carries
 * the theme control, the locale control and the primary commercial CTA — so nothing available on
 * desktop is lost at 390px.
 *
 * DIRECTION. `side="inline-end"` is a logical edge, not a physical one: the drawer enters from the
 * right in LTR and from the left in RTL, and the UIF-A `Sheet` already carries the matching RTL
 * transform overrides. No physical `left`/`right` rule appears anywhere in this file (contract §12).
 *
 * FOCUS AND KEYBOARD come from the UIF-A `Sheet` (Base UI dialog): focus is trapped while open,
 * Escape closes, focus returns to the trigger, and the body does not scroll behind the drawer. This
 * file adds no bespoke focus logic — re-implementing it is how that behaviour usually breaks.
 *
 * ANIMATION OWNERSHIP — **CSS**, and CSS alone (contract §13.1, §13.2a). The open/close transition is
 * one interaction and one engine owns it: the `Sheet`'s `data-starting-style` / `data-ending-style`
 * transitions bound to the motion tokens. Motion is not used here and GSAP is certainly not — a
 * drawer slide is exactly the "simple transition" CSS owns, and reaching for a timeline engine for it
 * would be a defect. Every duration collapses to ≤1ms under `prefers-reduced-motion` through the
 * global rule in `globals.css`.
 *
 * CURRENT PAGE. This drawer is already a client island, so it can mark the current route with
 * `aria-current="page"` from `usePathname()`. The desktop navigation in `site-header.tsx` is a Server
 * Component and deliberately stays one — see the note there.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [shownFor, setShownFor] = useState(pathname);

  // A route change while the drawer is open must close it, or the visitor lands on the new page with
  // the drawer still covering it — including on browser back/forward, which no click handler sees.
  //
  // This is React's documented "adjust state during render" pattern rather than an effect: the drawer
  // is derived from the route, not synchronised with it, so React applies the correction before the
  // browser paints instead of scheduling a second render pass afterwards.
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  const labels = t;

  const isCurrent = (href: string) =>
    href === PUBLIC_ROUTES.home ? pathname === href : pathname.startsWith(href);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <IconButton
            type="button"
            variant="outline"
            /* Stable id — see the note in `search-control.tsx` (UIF-023 shell parity). */
            id="hc-menu-trigger"
            aria-label={labels.controls.openMenu}
            aria-expanded={open}
            className="rounded-[var(--radius-sm)] lg:hidden"
          />
        }
      >
        <Icon name="menu" className="size-5" />
      </SheetTrigger>

      <SheetContent
        side="inline-end"
        showCloseButton={false}
        className="w-[var(--drawer-w)] gap-0 bg-[var(--surface-page)] p-0 sm:max-w-[var(--drawer-w)]"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <SheetTitle className="hc-eyebrow text-muted-foreground">
            {labels.controls.menuTitle}
          </SheetTitle>
          {/* Explicit close control rather than the Sheet default, so it sits in the header row and
              keeps a full 44px target. */}
          <IconButton
            type="button"
            variant="text"
            aria-label={labels.controls.closeMenu}
            onClick={() => setOpen(false)}
          >
            <Icon name="x" className="size-5" />
          </IconButton>
        </div>

        <nav aria-label={labels.a11y.primaryNavigation} className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="flex min-h-[3.25rem] items-center rounded-[var(--radius-sm)] px-4 text-[length:var(--text-body)] font-medium text-foreground transition-colors duration-[var(--dur-fast)] hover:bg-[color-mix(in_srgb,transparent,var(--forest-700)_7%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] aria-[current=page]:bg-[color-mix(in_srgb,transparent,var(--forest-700)_8%)] aria-[current=page]:font-semibold"
            >
              {labels.nav[item.key]}
            </Link>
          ))}

          <Link
            href={PUBLIC_ROUTES.portalEntry}
            aria-current={isCurrent(PUBLIC_ROUTES.portalEntry) ? "page" : undefined}
            className="mt-1 flex min-h-[3.25rem] items-center rounded-[var(--radius-sm)] border-t border-border px-4 pt-3 text-[length:var(--text-body)] font-medium text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {labels.nav.portalEntry}
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-4 border-t border-border p-5">
          <Button size="lg" className="w-full" nativeButton={false} render={<Link href={PUBLIC_ROUTES.contact} />}>
            {labels.cta.requestAnOffer}
          </Button>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

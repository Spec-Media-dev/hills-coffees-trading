import Image from "next/image";
import Link from "next/link";

import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/public/copy";

/**
 * Public site footer (Feature 002, T002 — FR-021; PS2).
 *
 * LINKS ONLY TO ROUTES THIS FEATURE ACTUALLY OWNS. There is deliberately **no** `/knowledge` and no
 * `/legal` entry: no approved content source exists for editorial or legal pages (CONTENT-01), and a
 * footer link to an unbuilt page is a dead end for both visitors and crawlers. Those entries are
 * added by whichever feature resolves CONTENT-01 — not here, and not as a placeholder.
 *
 * The footer reuses `PUBLIC_ROUTES` from the header so the two navigations can never drift apart,
 * and every entry is a real crawlable anchor.
 *
 * Server Component — zero client JavaScript. Logical CSS properties only (FR-018), Feature 001
 * tokens only (FR-030).
 */

/** Footer navigation: the same owned destinations, plus the commercial contact route. */
const FOOTER_NAV = [
  { href: PUBLIC_ROUTES.coffee, label: copy.nav.coffee },
  { href: PUBLIC_ROUTES.origins, label: copy.nav.origins },
  { href: PUBLIC_ROUTES.sourcing, label: copy.nav.sourcing },
  { href: PUBLIC_ROUTES.contact, label: copy.nav.contact },
  { href: PUBLIC_ROUTES.portalEntry, label: copy.nav.portalEntry },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="hc-container py-[clamp(3rem,7vw,6rem)]">
        <div className="grid gap-12 border-b border-sidebar-border pb-12 md:grid-cols-[minmax(0,1.25fr)_minmax(10rem,0.7fr)_minmax(15rem,0.9fr)]">
          <div className="flex max-w-md flex-col gap-5">
          {/*
            Same two-variant, `dark:`-swapped horizontal logo as the header (see its comment for the
            approved-asset / theme-driven rationale). Not wrapped in a Link here — the footer brand
            block was never interactive, and this narrow refinement preserves that, replacing only
            the visual mark. Alt carries the brand name directly, since there is no wrapping Link to
            supply an accessible name here.
          */}
          <Image
            src="/images/hills-logo-light.png"
            alt={copy.site.name}
            width={150}
            height={57}
          />
          <p className="text-[0.9375rem] leading-[1.7] text-sidebar-foreground/75">
            {copy.site.tagline}
          </p>
          <p className="text-sm leading-[1.6] text-sidebar-foreground/65">
            {copy.footer.brandStatement}
          </p>
          </div>

          <nav
            aria-label={copy.a11y.footerNavigation}
            className="flex flex-col items-start gap-3"
          >
            <p className="mb-2 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-sidebar-ring">
              {copy.footer.exploreHeading}
            </p>
            {FOOTER_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-11 items-center rounded-sm py-1 text-sm text-sidebar-foreground/75 underline-offset-4 transition-colors hover:text-sidebar-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sidebar-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col items-start gap-4">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-sidebar-ring">
              {copy.footer.commercialHeading}
            </p>
            <p className="text-sm leading-[1.7] text-sidebar-foreground/75">
              {copy.footer.commercialBody}
            </p>
            <Button variant="accent" render={<Link href={PUBLIC_ROUTES.contact} />}>
              {copy.cta.requestAnOffer}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-7 text-xs text-sidebar-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <p>{copy.site.name}. {copy.footer.rights}</p>
          <p>{copy.footer.locationLine}</p>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";

import { PUBLIC_ROUTES } from "@/components/public/site-header";
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
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <p className="text-base font-semibold tracking-tight text-foreground">
            {copy.site.name}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {copy.site.tagline}
          </p>
        </div>

        <nav
          aria-label={copy.a11y.footerNavigation}
          className="flex flex-wrap items-center gap-5"
        >
          {FOOTER_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <p className="text-xs text-muted-foreground">
          {copy.site.name}. {copy.footer.rights}
        </p>
      </div>
    </footer>
  );
}

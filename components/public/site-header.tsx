import Link from "next/link";

import { copy } from "@/lib/public/copy";

/**
 * Public site header (Feature 002, T002 — FR-016, FR-021; PS2, PS4).
 *
 * NAVIGATION PRIORITY follows `docs/design-guidance/Hills-Coffee-Website-Recommendations.md`:
 * Coffee, Origins and Sourcing lead; the commercial CTA ("Request an offer") is primary; the Trading
 * Portal / sign-in entry is present but deliberately **secondary** to it (FR-016).
 *
 * EVERY destination is a real HTML anchor with a concrete path — `next/link` renders an `<a href>`
 * into the server HTML, so the navigation is crawlable and fully traversable with JavaScript
 * disabled (PS2 AS1, FR-006). No `href="#"`, no JS-only control, no button that navigates.
 *
 * `/knowledge` and `/legal` are deliberately ABSENT. No approved content source exists for editorial
 * or legal pages (CONTENT-01), so those routes are withheld rather than linked to a fabricated page.
 * Do not add them here until CONTENT-01 is resolved.
 *
 * The destination routes themselves land in Phases 4–6, so this task is verified structurally;
 * runtime dead-link traversal is verified later by T038 and T050. Do NOT create stub routes.
 *
 * Server Component — zero client JavaScript. It defines no token and no font system: colour, radius
 * and typography all come from Feature 001's Hills token layer in `src/app/globals.css` and the font
 * variables wired in `src/app/layout.tsx` (FR-030).
 */

/**
 * The canonical public route paths this feature owns, in enforced trailing-slash form (FR-026).
 * Technical constants, not copy — they never belong in the copy dictionary (contract §3.7).
 */
export const PUBLIC_ROUTES = {
  home: "/",
  coffee: "/coffee/",
  origins: "/origins/",
  sourcing: "/sourcing/",
  contact: "/contact/",
  portalEntry: "/portal-entry/",
} as const;

/** The browsable destinations shown in the header's primary navigation. */
const PRIMARY_NAV = [
  { href: PUBLIC_ROUTES.coffee, label: copy.nav.coffee },
  { href: PUBLIC_ROUTES.origins, label: copy.nav.origins },
  { href: PUBLIC_ROUTES.sourcing, label: copy.nav.sourcing },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
        <Link
          href={PUBLIC_ROUTES.home}
          aria-label={copy.a11y.homeLink}
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          {copy.site.name}
        </Link>

        <nav
          aria-label={copy.a11y.primaryNavigation}
          className="flex flex-wrap items-center gap-5"
        >
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/*
          `ms-auto` (margin-inline-start) rather than `ml-auto`, so the actions sit at the trailing
          edge in both LTR and RTL without a second stylesheet (FR-018).
        */}
        <div className="ms-auto flex flex-wrap items-center gap-4">
          {/*
            Secondary by design (FR-016): a plain text link beside the filled primary CTA. Until
            Feature 003 exists it resolves to an explicit, honest placeholder — never a fake sign-in
            form and never a silent redirect to `/`.
          */}
          <Link
            href={PUBLIC_ROUTES.portalEntry}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {copy.nav.portalEntry}
          </Link>

          {/* Primary commercial CTA — the public site's main conversion action. */}
          <Link
            href={PUBLIC_ROUTES.contact}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {copy.cta.requestAnOffer}
          </Link>
        </div>
      </div>
    </header>
  );
}

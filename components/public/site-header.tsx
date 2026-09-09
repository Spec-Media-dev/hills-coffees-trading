import Image from "next/image";
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
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 shadow-[0_8px_28px_rgba(23,60,50,0.05)] supports-[backdrop-filter]:backdrop-blur-md dark:shadow-none">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 sm:px-8 xl:px-10">
        {/*
          Two horizontal logo variants (approved brand assets under `public/images/`), swapped by
          Tailwind's `dark:` variant so the mark stays legible against the page's current theme with
          no client JavaScript (`@custom-variant dark (&:is(.dark *))` in globals.css). The site has
          no dark-mode toggle yet, so only the green mark renders today; the white variant is wired in
          now so a future toggle needs no header change. Both share identical dimensions, so the swap
          introduces no layout shift. The accessible name lives on the Link (alt is empty on both
          images to avoid a duplicate announcement).
        */}
        <Link
          href={PUBLIC_ROUTES.home}
          aria-label={copy.a11y.homeLink}
          className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Image
            src="/images/hills-logo-dark.png"
            alt=""
            width={150}
            height={57}
            className="block dark:hidden"
          />
          <Image
            src="/images/hills-logo-light.png"
            alt=""
            width={150}
            height={57}
            className="hidden dark:block"
          />
        </Link>

        <nav
          aria-label={copy.a11y.primaryNavigation}
          className="order-2 flex w-full items-center gap-6 overflow-x-auto border-t border-border/70 pt-3 sm:order-none sm:w-auto sm:border-0 sm:pt-0"
        >
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 py-2 text-sm font-medium text-muted-foreground underline-offset-8 transition-colors hover:text-foreground hover:underline hover:decoration-accent hover:decoration-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/*
          `ms-auto` (margin-inline-start) rather than `ml-auto`, so the actions sit at the trailing
          edge in both LTR and RTL without a second stylesheet (FR-018).
        */}
        <div className="order-3 flex w-full items-center justify-between gap-4 sm:order-none sm:ms-auto sm:w-auto sm:justify-start">
          {/*
            Secondary by design (FR-016): a plain text link beside the filled primary CTA. Until
            Feature 003 exists it resolves to an explicit, honest placeholder — never a fake sign-in
            form and never a silent redirect to `/`.
          */}
          <Link
            href={PUBLIC_ROUTES.portalEntry}
            className="rounded-sm py-2 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            {copy.nav.portalEntry}
          </Link>

          {/* Primary commercial CTA — the public site's main conversion action. */}
          <Link
            href={PUBLIC_ROUTES.contact}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none motion-reduce:transition-none"
          >
            {copy.cta.requestAnOffer}
          </Link>
        </div>
      </div>
    </header>
  );
}

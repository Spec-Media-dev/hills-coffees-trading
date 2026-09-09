import Image from "next/image";
import Link from "next/link";

import { Bilingual, EnglishCopy } from "@/components/locale/bilingual";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Public site footer — production build (Phase 5.5, UIF-022 — contract §3, §14; plan §6.3).
 *
 * ── GROUPING ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Three groups — **Explore · Account · Trade with Hills** — adapted from the live Hills site's richer
 * four-group footer (plan §6.3 records that richness as adoptable). The live site's fourth group is
 * **Legal**, and it is deliberately not reproduced: no approved legal content source exists
 * (CONTENT-01), and a Legal column pointing at unbuilt pages is a dead end for visitors and crawlers.
 * It arrives with whichever feature resolves CONTENT-01.
 *
 * ── EVERY LINK RESOLVES ──────────────────────────────────────────────────────────────────────────
 *
 * Routes come from the shared `PUBLIC_ROUTES` table the header uses, so the two navigations cannot
 * drift apart, and each entry is a real crawlable anchor to a route that exists.
 *
 * NOTHING IS FABRICATED HERE. No street address, no phone number, no email address, no social
 * account, no certification badge, no partner or origin count. The live site shows social and
 * WhatsApp entries; none is reproduced, because Hills has not supplied verified handles for this
 * surface. The commercial route is the real one that exists: `/contact/`. This is the specific
 * section where invented "contact detail" would otherwise creep in.
 *
 * ── SURFACE ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A deep-forest closing composition in **both** themes: the footer is an intentional dark ground, not
 * a theme inversion, so it uses the `sidebar` token family that already carries forest-on-cream text
 * pairs. The cream lockup is therefore the correct variant on this surface in both themes — using the
 * green mark here would be the exact defect UIF-022 forbids.
 *
 * Server Component — zero client JavaScript. Logical CSS properties only. Chrome labels are bilingual
 * through `<Bilingual>`; the brand statement and commercial body are business copy with no approved
 * Arabic and therefore render the reviewed English in both languages (`CONTENT-AR-01`).
 */

type FooterLink = {
  href: string;
  pick: (c: PublicCopy) => string;
};

/** Browsable public destinations. */
const EXPLORE_LINKS: readonly FooterLink[] = [
  { href: PUBLIC_ROUTES.coffee, pick: (c) => c.nav.coffee },
  { href: PUBLIC_ROUTES.origins, pick: (c) => c.nav.origins },
  { href: PUBLIC_ROUTES.sourcing, pick: (c) => c.nav.sourcing },
];

/** Member-facing entry. One honest destination — Feature 003 owns the real sign-in. */
const ACCOUNT_LINKS: readonly FooterLink[] = [
  { href: PUBLIC_ROUTES.portalEntry, pick: (c) => c.nav.portalEntry },
  { href: PUBLIC_ROUTES.contact, pick: (c) => c.nav.contact },
];

const GROUP_HEADING =
  "hc-eyebrow text-[var(--gold-on-dark)]";

const FOOTER_LINK =
  "inline-flex min-h-11 items-center rounded-[var(--radius-xs)] text-[var(--text-small)] text-sidebar-foreground/80 underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-sidebar-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sidebar-ring)]";

export function SiteFooter() {
  return (
    <footer className="border-t border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="hc-container py-[clamp(3.5rem,7vw,6.5rem)]">
        <div className="grid gap-x-10 gap-y-12 border-b border-sidebar-border/70 pb-12 md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(9rem,0.6fr)_minmax(9rem,0.6fr)_minmax(16rem,1fr)]">
          {/* Brand block */}
          <div className="flex max-w-md flex-col gap-5">
            <Image
              src="/images/hills-logo-light.png"
              alt={copy.site.name}
              width={168}
              height={64}
              className="h-auto w-[150px] xl:w-[168px]"
            />
            <p className="hc-body text-sidebar-foreground/80">
              <EnglishCopy>{copy.site.tagline}</EnglishCopy>
            </p>
            <p className="hc-small text-sidebar-foreground/65">
              <EnglishCopy>{copy.footer.brandStatement}</EnglishCopy>
            </p>
          </div>

          <nav
            aria-label={copy.a11y.footerNavigation}
            className="flex flex-col items-start gap-2"
          >
            <p className={`${GROUP_HEADING} mb-2`}>
              <Bilingual pick={(c) => c.footer.exploreHeading} />
            </p>
            {EXPLORE_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className={FOOTER_LINK}>
                <Bilingual pick={item.pick} />
              </Link>
            ))}
          </nav>

          <div className="flex flex-col items-start gap-2">
            <p className={`${GROUP_HEADING} mb-2`}>
              <Bilingual pick={(c) => c.footer.accountHeading} />
            </p>
            {ACCOUNT_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className={FOOTER_LINK}>
                <Bilingual pick={item.pick} />
              </Link>
            ))}
          </div>

          {/* Commercial close — the footer's conversion action, mirroring the header CTA. */}
          <div className="flex flex-col items-start gap-4">
            <p className={GROUP_HEADING}>
              <Bilingual pick={(c) => c.footer.commercialHeading} />
            </p>
            <p className="hc-small text-sidebar-foreground/80">
              <EnglishCopy>{copy.footer.commercialBody}</EnglishCopy>
            </p>
            <Button variant="accent" nativeButton={false} render={<Link href={PUBLIC_ROUTES.contact} />}>
              <Bilingual pick={(c) => c.cta.requestAnOffer} />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-7 text-[var(--text-meta)] text-sidebar-foreground/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <EnglishCopy>{copy.site.name}</EnglishCopy>. <Bilingual pick={(c) => c.footer.rights} />
          </p>
          {/* Operating locations only — the two offices the business publicly states. No address, no
              phone, no email is invented to fill the line. */}
          <p>
            <Bilingual pick={(c) => c.footer.locationLine} />
          </p>
        </div>
      </div>
    </footer>
  );
}

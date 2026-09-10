import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";
import type { PublicCopy } from "@/lib/public/copy";

/**
 * Public site footer — production build (Phase 5.5, UIF-022; rebuilt by the public design
 * convergence pass — contract §3, §14; plan §6.3).
 *
 * ── THE LAST DESIGNED SECTION, NOT AN AFTERTHOUGHT ───────────────────────────────────────────────
 *
 * Deepest forest ground, one shade below the final CTA so the two read as a descent rather than a
 * repeat. Four regions: the brand block with a larger cream lockup and the tagline; three link
 * columns — **Explore · Company · Account** — and the commercial close with its CTA. Above the
 * bottom bar the closing brand line is set in the display face at a large size and low opacity: a
 * signature, not a slogan, and it is the approved positioning sentence rather than new copy.
 *
 * Links carry a directional arrow that advances on hover; column headings sit on a gold hairline;
 * everything stacks in one column at 390px and mirrors under RTL through logical properties only.
 *
 * ── EVERY LINK RESOLVES ──────────────────────────────────────────────────────────────────────────
 *
 * Routes come from the shared `PUBLIC_ROUTES` table the header uses, so the two navigations cannot
 * drift apart, and each entry is a real crawlable anchor to a route that exists. `/legal` and
 * `/knowledge` are absent by design (CONTENT-01).
 *
 * NOTHING IS FABRICATED HERE. No street address, no phone number, no email address, no social
 * account, no certification badge, no partner or origin count. The operating-locations line names
 * only the two offices the business publicly states.
 *
 * ── SURFACE ──────────────────────────────────────────────────────────────────────────────────────
 *
 * An intentional dark ground in **both** themes, not a theme inversion, so the cream lockup is the
 * correct variant here always. Server Component — zero client JavaScript. Every string is
 * bilingual through `<Bilingual>`.
 */

type FooterLink = {
  href: string;
  pick: (c: PublicCopy) => string;
};

const EXPLORE_LINKS: readonly FooterLink[] = [
  { href: PUBLIC_ROUTES.coffee, pick: (c) => c.nav.coffee },
  { href: PUBLIC_ROUTES.origins, pick: (c) => c.nav.origins },
  { href: PUBLIC_ROUTES.sourcing, pick: (c) => c.nav.sourcing },
];

const COMPANY_LINKS: readonly FooterLink[] = [
  { href: PUBLIC_ROUTES.about, pick: (c) => c.nav.about },
  { href: PUBLIC_ROUTES.contact, pick: (c) => c.nav.contact },
];

/** Member-facing entry. One honest destination — Feature 003 owns the real sign-in. */
const ACCOUNT_LINKS: readonly FooterLink[] = [
  { href: PUBLIC_ROUTES.portalEntry, pick: (c) => c.nav.portalEntry },
];

const GROUP_HEADING =
  "hc-eyebrow border-t border-[color-mix(in_srgb,var(--gold-on-dark)_55%,transparent)] pt-4 text-[var(--gold-on-dark)]";

const FOOTER_LINK =
  "group/footer inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-xs)] text-[length:var(--text-small)] text-[color-mix(in_srgb,var(--brand-cream)_78%,transparent)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--brand-cream)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]";

function LinkColumn({
  heading,
  links,
  as: Tag = "div",
  label,
}: {
  heading: (c: PublicCopy) => string;
  links: readonly FooterLink[];
  as?: "nav" | "div";
  label?: string;
}) {
  return (
    <Tag aria-label={label} className="flex flex-col items-start gap-1">
      <p className={`${GROUP_HEADING} mb-2 w-full`}>
        <Bilingual pick={heading} />
      </p>
      {links.map((item) => (
        <Link key={item.href} href={item.href} className={FOOTER_LINK}>
          <Icon
            name="arrow-right"
            data-directional-icon="true"
            className="size-3.5 -translate-x-1 opacity-0 transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover/footer:translate-x-0 group-hover/footer:opacity-100 rtl:translate-x-1 rtl:group-hover/footer:translate-x-0 motion-reduce:transition-none"
          />
          <Bilingual pick={item.pick} />
        </Link>
      ))}
    </Tag>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden border-t border-[color-mix(in_srgb,var(--brand-cream)_10%,transparent)] bg-[var(--forest-900)] text-[var(--brand-cream)]">
      <div className="hc-container py-[clamp(4rem,8vw,7rem)]">
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(8rem,0.6fr)_minmax(8rem,0.6fr)_minmax(8rem,0.6fr)_minmax(15rem,1fr)]">
          {/* Brand block */}
          <div className="flex max-w-md flex-col gap-6">
            <Image
              src="/images/hills-logo-light.png"
              alt={copy.site.name}
              width={2624}
              height={996}
              className="h-auto w-[176px] xl:w-[208px]"
            />
            <p className="hc-body max-w-[36ch] text-[color-mix(in_srgb,var(--brand-cream)_78%,transparent)]">
              <Bilingual pick={(c) => c.site.tagline} />
            </p>
          </div>

          <LinkColumn
            as="nav"
            label={copy.a11y.footerNavigation}
            heading={(c) => c.footer.exploreHeading}
            links={EXPLORE_LINKS}
          />
          <LinkColumn heading={(c) => c.footer.companyHeading} links={COMPANY_LINKS} />
          <LinkColumn heading={(c) => c.footer.accountHeading} links={ACCOUNT_LINKS} />

          {/* Commercial close — the footer's conversion action, mirroring the header CTA. */}
          <div className="flex flex-col items-start gap-5">
            <p className={`${GROUP_HEADING} w-full`}>
              <Bilingual pick={(c) => c.footer.commercialHeading} />
            </p>
            <p className="hc-small max-w-[38ch] text-[color-mix(in_srgb,var(--brand-cream)_78%,transparent)]">
              <Bilingual pick={(c) => c.footer.commercialBody} />
            </p>
            <Link
              href={PUBLIC_ROUTES.contact}
              className="inline-flex h-[var(--control-h)] items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--sand-100)] bg-[var(--sand-100)] px-5 text-sm font-semibold tracking-[0.005em] text-[var(--forest-800)] transition-[background-color,border-color,transform] duration-[var(--dur-fast)] hover:border-[var(--sand-200)] hover:bg-[var(--sand-200)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)] motion-reduce:transform-none"
            >
              <Bilingual pick={(c) => c.cta.requestAnOffer} />
              <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
            </Link>
          </div>
        </div>

        {/* The signature line — the approved positioning sentence, set large and quiet. */}
        <p
          aria-hidden="true"
          className="mt-[clamp(3.5rem,7vw,6rem)] font-heading text-[clamp(1.75rem,1rem+3.4vw,4.25rem)] font-semibold leading-[1.05] tracking-[var(--tracking-display)] text-[color-mix(in_srgb,var(--brand-cream)_45%,transparent)] text-balance"
        >
          <Bilingual pick={(c) => c.footer.closingLine} />
        </p>

        <div className="mt-8 flex flex-col gap-2 border-t border-[color-mix(in_srgb,var(--brand-cream)_12%,transparent)] pt-6 text-[length:var(--text-meta)] text-[color-mix(in_srgb,var(--brand-cream)_58%,transparent)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            <Bilingual pick={(c) => c.site.name} />
            <span aria-hidden="true">. </span>
            <Bilingual pick={(c) => c.footer.rights} />
          </p>
          {/* Operating locations only — no address, phone or email is invented to fill the line. */}
          <p>
            <Bilingual pick={(c) => c.footer.locationLine} />
          </p>
        </div>
      </div>
    </footer>
  );
}

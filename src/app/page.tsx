import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { CoffeeCard } from "@/components/public/coffee-card";
import { Hero } from "@/components/public/hero";
import { IntentCards } from "@/components/public/intent-cards";
import { OriginCard } from "@/components/public/origin-card";
import { PublicShell } from "@/components/public/public-shell";
import {
  CONTAINER,
  CTA_ON_FOREST,
  EYEBROW,
  HEADING_2,
  LEAD,
  LINK_QUIET,
  Section,
} from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { getPublicCoffeeIndex } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import { getPublicOriginIndex } from "@/lib/public/origins";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Hills Coffee public homepage (Feature 002, T013 — FR-001, FR-021, FR-023; PS1, PS2).
 *
 * IMPLEMENTED IN PLACE. This file stays at `src/app/page.tsx`, the path Constitution Principle IV
 * locks. It is edited, never moved, and never duplicated into the `(public)` route group.
 *
 * WHY IT WRAPS ITSELF IN `PublicShell`: the root page sits OUTSIDE `src/app/(public)/`, so it does
 * not inherit that group's layout. Composing the very same `PublicShell` component here is what
 * makes the header and footer byte-identical to every grouped public route (FR-023) — the specific
 * defect this structure exists to prevent.
 *
 * Section order, following the approved public-website kit's page model: hero → intents →
 * credibility → featured coffee → featured origins → commercial CTA.
 *
 * DATA comes only through Block A's verified public read layer (`lib/public/*`), never from an ad-hoc
 * query. That layer reads as an anonymous client under RLS, applies explicit column allowlists and
 * returns named DTOs, so no private field can reach this page even by mistake. Nothing here is
 * fabricated: when the catalogue is empty the section says so plainly rather than inventing content.
 *
 * Server Component with no client JavaScript. The RFQ form itself belongs to Phase 6; this page only
 * routes visitors toward it.
 */

/**
 * Homepage metadata. The root layout still carries Feature 001's scaffold title, so without this the
 * public homepage would ship as "Create Next App" — every owned public route needs its own title,
 * description and canonical (FR-006). Structured data and the sitemap belong to Phase 8, not here.
 */
export const metadata: Metadata = {
  title: `${copy.site.name} — ${copy.home.hero.eyebrow}`,
  description: copy.home.hero.lead,
  alternates: { canonical: canonicalUrl("/") },
  openGraph: {
    type: "website",
    url: canonicalUrl("/"),
    siteName: copy.site.name,
    title: `${copy.site.name} — ${copy.home.hero.eyebrow}`,
    description: copy.home.hero.lead,
  },
};

/** How many catalogue entries the homepage previews before handing off to the full index. */
const FEATURED_LIMIT = 3;

export default async function HomePage() {
  // Both reads are independent, so they run concurrently rather than in series.
  const [coffees, origins] = await Promise.all([
    getPublicCoffeeIndex(),
    getPublicOriginIndex(),
  ]);

  const featuredCoffees = coffees.slice(0, FEATURED_LIMIT);
  const featuredOrigins = origins.slice(0, FEATURED_LIMIT);

  return (
    <PublicShell>
      <Hero />

      <Section
        tone="page"
        eyebrow={copy.home.intents.eyebrow}
        title={copy.home.intents.title}
      >
        <IntentCards />
      </Section>

      {/*
        Credibility. Deliberately NOT a fourth card grid — a bordered definition list keeps the page
        from becoming a wall of identical rounded boxes, and reads as an editorial statement of how
        the business works. Every claim describes the approved operating model; none asserts a
        figure or certification Hills has not evidenced.
      */}
      <Section
        tone="cream"
        eyebrow={copy.home.credibility.eyebrow}
        title={copy.home.credibility.title}
        lead={copy.home.credibility.lead}
      >
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:items-stretch">
          <dl className="grid gap-x-10 gap-y-9 border-t border-border pt-9 sm:grid-cols-2">
            {[
              copy.home.credibility.origin,
              copy.home.credibility.quality,
              copy.home.credibility.custody,
              copy.home.credibility.membership,
            ].map((item) => (
              <div key={item.title} className="flex flex-col gap-3">
                <dt className="text-base font-semibold tracking-[-0.01em] text-foreground">
                  {item.title}
                </dt>
                <dd className="max-w-[52ch] text-[0.9375rem] leading-[1.7] text-muted-foreground text-pretty">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>

          <div className="relative min-h-[24rem] overflow-hidden rounded-b-2xl rounded-t-[7rem] border border-border bg-muted sm:min-h-[30rem]">
            <Image
              src="/images/farmer-partnership.jpg"
              alt={copy.home.credibility.imageAlt}
              fill
              sizes="(min-width: 1024px) 42vw, 90vw"
              className="object-cover"
            />
          </div>
        </div>
      </Section>

      <Section
        tone="page"
        eyebrow={copy.home.featuredCoffee.eyebrow}
        title={copy.home.featuredCoffee.title}
        lead={copy.home.featuredCoffee.lead}
        action={
          featuredCoffees.length > 0 ? (
            <Link href={PUBLIC_ROUTES.coffee} className={LINK_QUIET}>
              {copy.home.featuredCoffee.action}
            </Link>
          ) : null
        }
      >
        {featuredCoffees.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCoffees.map((coffee) => (
              <CoffeeCard key={coffee.slug} coffee={coffee} />
            ))}
          </ul>
        ) : (
          <p className="text-[0.9375rem] text-muted-foreground">
            {copy.home.featuredCoffee.empty}
          </p>
        )}
      </Section>

      <Section
        tone="cream"
        eyebrow={copy.home.featuredOrigins.eyebrow}
        title={copy.home.featuredOrigins.title}
        lead={copy.home.featuredOrigins.lead}
        action={
          featuredOrigins.length > 0 ? (
            <Link href={PUBLIC_ROUTES.origins} className={LINK_QUIET}>
              {copy.home.featuredOrigins.action}
            </Link>
          ) : null
        }
      >
        {featuredOrigins.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredOrigins.map((origin) => (
              <OriginCard key={origin.slug} origin={origin} />
            ))}
          </ul>
        ) : (
          <p className="text-[0.9375rem] text-muted-foreground">
            {copy.home.featuredOrigins.empty}
          </p>
        )}
      </Section>

      {/* Closing commercial CTA — the page's single conversion action, on the brand's dark ground. */}
      <section className="bg-sidebar text-sidebar-foreground">
        <div
          className={`${CONTAINER} flex flex-col gap-8 py-[clamp(3rem,7vw,7.5rem)] lg:flex-row lg:items-center lg:justify-between`}
        >
          <div className="flex max-w-[46rem] flex-col gap-4">
            <span className={`${EYEBROW} text-sidebar-ring`}>
              {copy.nav.contact}
            </span>
            <h2 className={HEADING_2}>{copy.home.rfq.title}</h2>
            <p className={`${LEAD} text-sidebar-foreground/85 text-pretty`}>
              {copy.home.rfq.lead}
            </p>
          </div>
          <Link
            href={PUBLIC_ROUTES.contact}
            className={`${CTA_ON_FOREST} shrink-0`}
          >
            {copy.cta.requestAnOffer}
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}

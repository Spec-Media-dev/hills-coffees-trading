import type { Metadata } from "next";
import Link from "next/link";

import { EnglishCopy } from "@/components/locale/bilingual";
import { CoffeeCard } from "@/components/public/coffee-card";
import { Hero } from "@/components/public/hero";
import { IntentCards } from "@/components/public/intent-cards";
import { InteractiveStorySection } from "@/components/public/interactive-story-section";
import { OriginCard } from "@/components/public/origin-card";
import { ProcessJourney } from "@/components/public/process-journey";
import { PublicShell } from "@/components/public/public-shell";
import { ReferencePrice } from "@/components/public/reference-price";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { EYEBROW, HEADING_2, LEAD, LINK_QUIET, Section } from "@/components/public/section";
import { TraceabilityBand } from "@/components/public/traceability-band";
import { Button } from "@/components/ui/button";
import { getPublicCoffeeIndex } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import { getPublicOriginIndex } from "@/lib/public/origins";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Hills Coffee public homepage (Feature 002 T013; composition rebuilt by Phase 5.5 UIF-025/UIF-026).
 *
 * IMPLEMENTED IN PLACE. This file stays at `src/app/page.tsx`, the path Constitution Principle IV
 * locks. It is edited, never moved, and never duplicated into the `(public)` route group.
 *
 * WHY IT WRAPS ITSELF IN `PublicShell`: the root page sits OUTSIDE `src/app/(public)/`, so it does
 * not inherit that group's layout. Composing the very same `PublicShell` component here is what makes
 * the header and footer byte-identical to every grouped public route (FR-023).
 *
 * ── THE NARRATIVE (UIF-025) ──────────────────────────────────────────────────────────────────────
 *
 * One continuous commercial story, in the order the task documents:
 *
 *   hero → commercial intent → credibility → coffee discovery → origins → traceability →
 *   sourcing + how Hills works → reference information → final CTA
 *
 * ── RHYTHM: NO TWO CONSECUTIVE SECTIONS SHARE A LAYOUT PATTERN ───────────────────────────────────
 *
 *   1 hero              asymmetric forest split, arch media, full-bleed photo ground on mobile
 *   2 intent            three-card grid on the page ground
 *   3 credibility       timed media/list split on the cream band  (InteractiveStorySection)
 *   4 coffee            section header + full-width card grid, page ground
 *   5 origins           asymmetric editorial column + card stack, cream band
 *   6 traceability      full-bleed photographic band, forest ground
 *   7 sourcing/journey  numbered editorial rail, page ground     (ProcessJourney)
 *   8 reference         narrow centred editorial, cream band
 *   9 final CTA         split forest band
 *
 * Sections 2 and 4 are both grids but are never adjacent; every neighbouring pair differs
 * structurally, in ground colour, or in both. Photography appears in 1, 3, 6 and 7 only — the quiet
 * typography-led sections between them are what make the image moments land.
 *
 * ── DATA AND HONESTY ─────────────────────────────────────────────────────────────────────────────
 *
 * Data comes only through Block A's verified public read layer (`lib/public/*`), which reads as an
 * anonymous client under RLS with explicit column allowlists. No grade, cup score, crop year,
 * quantity, MOQ, availability, seller, warehouse or price appears anywhere on this page. Nothing is
 * fabricated: empty catalogues say so plainly, and no statistic, certification or partner count is
 * invented. The reference band renders the honest unavailable state (PRICE-011).
 *
 * Server Component. The only client JavaScript this page introduces is the two documented islands it
 * mounts — `AnimatedHero` (island 7) and `InteractiveStorySection` (island 8). The page tree itself
 * is never hydrated, and no DTO is passed into either island.
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
      {/* 1 — Hero */}
      <Hero />

      {/* 2 — Commercial intent: the three approved public journeys, side by side. */}
      <Section tone="page" eyebrow={copy.home.intents.eyebrow} title={copy.home.intents.title}>
        <IntentCards />
      </Section>

      {/* 3 — Credibility, as the timed editorial story rather than a definition list. */}
      <InteractiveStorySection />

      {/* 4 — Coffee discovery. Public DTO fields only. */}
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
          <p className="hc-body text-muted-foreground">{copy.home.featuredCoffee.empty}</p>
        )}
      </Section>

      {/*
        5 — Origins. Deliberately NOT a second full-width card grid directly after the coffee grid:
        an editorial column holds the framing on the inline-start while the cards stack on the
        inline-end. Structurally different from section 4, and it leaves the horizontal origins
        showcase (UIF-055, Block D) unbuilt rather than pre-empting it.
      */}
      <section className="bg-secondary py-[clamp(3.5rem,7vw,7.5rem)] text-foreground">
        <div className="hc-container grid gap-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-16">
          <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+2.5rem)] lg:self-start">
            <span className={`${EYEBROW} text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]`}>
              {copy.home.featuredOrigins.eyebrow}
            </span>
            <h2 className={HEADING_2}>{copy.home.featuredOrigins.title}</h2>
            <p className={`${LEAD} text-muted-foreground text-pretty`}>
              {copy.home.featuredOrigins.lead}
            </p>
            {featuredOrigins.length > 0 ? (
              <Link href={PUBLIC_ROUTES.origins} className={`${LINK_QUIET} mt-2 self-start`}>
                {copy.home.featuredOrigins.action}
              </Link>
            ) : null}
          </div>

          {featuredOrigins.length > 0 ? (
            <ul className="grid gap-5 sm:grid-cols-2">
              {featuredOrigins.map((origin) => (
                <OriginCard key={origin.slug} origin={origin} />
              ))}
            </ul>
          ) : (
            <p className="hc-body text-muted-foreground">{copy.home.featuredOrigins.empty}</p>
          )}
        </div>
      </section>

      {/* 6 — Traceability: the page's single full-bleed photographic moment. */}
      <TraceabilityBand />

      {/* 7 — Sourcing and how Hills works, as a numbered editorial rail. */}
      <ProcessJourney />

      {/*
        8 — Reference information. Narrow and centred: the quietest section on the page, which is
        appropriate for a disclosure. The component itself renders only the honest unavailable state;
        no number, source, timestamp or licence claim exists to show (PRICE-011).
      */}
      <section className="bg-secondary py-[clamp(3.5rem,7vw,7rem)] text-foreground">
        <div className="hc-container">
          <div className="mx-auto flex max-w-[46rem] flex-col items-center gap-4 text-center">
            <span className={`${EYEBROW} text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]`}>
              <EnglishCopy>{copy.home.reference.eyebrow}</EnglishCopy>
            </span>
            <h2 className={HEADING_2}>
              <EnglishCopy>{copy.home.reference.title}</EnglishCopy>
            </h2>
            <p className={`${LEAD} text-muted-foreground text-pretty`}>
              <EnglishCopy>{copy.home.reference.lead}</EnglishCopy>
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-[34rem]">
            <ReferencePrice />
          </div>
        </div>
      </section>

      {/* 9 — Closing commercial CTA, on the brand's dark ground, mirroring the footer's action. */}
      <section className="bg-sidebar text-sidebar-foreground">
        <div className="hc-container flex flex-col gap-8 py-[clamp(3rem,7vw,7.5rem)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-[46rem] flex-col gap-4">
            <span className={`${EYEBROW} text-[var(--gold-on-dark)]`}>{copy.nav.contact}</span>
            <h2 className={HEADING_2}>{copy.home.rfq.title}</h2>
            <p className={`${LEAD} text-sidebar-foreground/85 text-pretty`}>{copy.home.rfq.lead}</p>
          </div>
          <Button
            size="lg"
            variant="accent"
            className="shrink-0"
            nativeButton={false}
            render={<Link href={PUBLIC_ROUTES.contact} />}
          >
            {copy.cta.requestAnOffer}
          </Button>
        </div>
      </section>
    </PublicShell>
  );
}

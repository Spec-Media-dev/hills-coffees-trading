import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { CoffeeMarquee } from "@/components/public/coffee-marquee";
import { CoffeeShowcase } from "@/components/public/coffee-showcase";
import { FinalCta } from "@/components/public/final-cta";
import { Hero } from "@/components/public/hero";
import { IntentCards } from "@/components/public/intent-cards";
import { InteractiveStorySection } from "@/components/public/interactive-story-section";
import { OriginsShowcase } from "@/components/public/origins-showcase";
import { ProcessJourney } from "@/components/public/process-journey";
import { PublicShell } from "@/components/public/public-shell";
import { ReferencePrice } from "@/components/public/reference-price";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { TraceabilityBand } from "@/components/public/traceability-band";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";
import { getPublicOriginIndex } from "@/lib/public/origins";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Hills Coffee public homepage (Feature 002 T013; composition rebuilt by Phase 5.5 UIF-025/UIF-026;
 * art direction converged by the public design convergence pass).
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
 * ── RHYTHM: A DESCENT FROM THE MOUNTAIN ──────────────────────────────────────────────────────────
 *
 *   1 hero              full-viewport photograph, header dissolved into it, glass panel   dark
 *   2 intents           three hairline-divided pathway panels, asymmetric                 page
 *   3 story             timed editorial: rail + items, framed image stage                 forest-900
 *   4 showcase          asymmetric image-led grid — what a published coffee carries       cream
 *   5 marquee           continuous full-bleed strip from origin                           forest-800
 *   6 origins           dark editorial panel inset on the page ground, horizontal slider  page
 *   7 traceability      2 × 2 glass chain over photography, drawn connector               forest-900
 *   8 journey           four image-led stages on one drawn path                           page
 *   9 reference         wide ruled data stage, locked state                               cream
 *  10 final CTA         display headline over photography, two-button close               forest-800
 *
 * No two neighbours share a layout pattern or a ground, and dark bands alternate with light ones so
 * the page reads as a sequence of moments rather than a wall. Photography appears in 1, 3, 4, 5, 7,
 * 8 and 10 — but never twice in the same way.
 *
 * ── DATA AND HONESTY ─────────────────────────────────────────────────────────────────────────────
 *
 * The only database read is the public origins index, through Block A's verified read layer
 * (`lib/public/*`, anonymous client under RLS, explicit column allowlist), for the showcase. The
 * coffee sections are deliberately static and editorial until record photography exists (MEDIA-01)
 * — see `coffee-showcase.tsx` — and hand off to the real dynamic `/coffee/` index. No grade, cup
 * score, crop year, quantity, MOQ, availability, seller, warehouse or price appears anywhere on
 * this page. Nothing is fabricated: empty states say so plainly, no statistic, certification or
 * partner count is invented, and the reference band renders the honest unavailable state
 * (PRICE-011).
 *
 * Server Component. Client JavaScript on this page is limited to the documented islands —
 * `AnimatedHero` (7), `InteractiveStorySection` (8), `OriginsShowcase` (9) — plus the motion
 * wrappers of island 5 (`Reveal`, `GsapScrollReveal`). The page tree itself is never hydrated.
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

export default async function HomePage() {
  const origins = await getPublicOriginIndex();

  return (
    <PublicShell>
      {/* 1 — Hero */}
      <Hero />

      {/* 2 — Commercial intent: three pathways, side by side. */}
      <section className="bg-background py-[clamp(4rem,8vw,8.5rem)] text-foreground">
        <div className="hc-container flex flex-col gap-12">
          <div className="flex max-w-[46rem] flex-col gap-3">
            <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.home.intents.eyebrow} />
            </span>
            <h2 className="hc-heading-2 font-semibold text-balance">
              <Bilingual pick={(c) => c.home.intents.title} />
            </h2>
            <p className="hc-body-lg max-w-[58ch] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.home.intents.lead} />
            </p>
          </div>
          <IntentCards />
        </div>
      </section>

      {/* 3 — Credibility, as the timed lifecycle story. */}
      <InteractiveStorySection />

      {/* 4 — Coffee discovery, static and editorial for now (see the component). */}
      <CoffeeShowcase />

      {/* 5 — Coffee discovery, moving. */}
      <CoffeeMarquee />

      {/*
        6 — Origins. The board's dark editorial environment is built as an inset panel on the page
        ground: a forest surface with an origin landscape held faintly behind it, the framing on top,
        and the real horizontal showcase (UIF-055, fed the already-fetched public DTO) running through
        it in its dark tone. The panel's inline padding equals the page gutter so the track's
        full-bleed edges land exactly on the panel's edges.
      */}
      <section className="bg-background py-[clamp(3rem,6vw,6rem)] text-foreground">
        <div className="hc-container">
          <div className="relative isolate overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--forest-700)] px-[var(--gutter-page)] py-[clamp(3rem,6vw,5.5rem)] text-[var(--brand-cream)]">
            <div aria-hidden="true" className="absolute inset-0 -z-10">
              <Image
                src="/images/farm-landscape.jpg"
                alt=""
                fill
                sizes="(min-width: 1536px) 1536px, 100vw"
                className="object-cover object-[50%_60%] opacity-[0.22]"
              />
              <span className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--forest-700)_20%,transparent)_0%,color-mix(in_srgb,var(--forest-700)_78%,transparent)_55%,var(--forest-700)_100%)]" />
            </div>

            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex max-w-[44rem] flex-col gap-3">
                  <span className="hc-eyebrow text-[var(--gold-on-dark)]">
                    <Bilingual pick={(c) => c.home.featuredOrigins.eyebrow} />
                  </span>
                  <h2 className="hc-heading-2 font-semibold text-balance">
                    <Bilingual pick={(c) => c.home.featuredOrigins.title} />
                  </h2>
                  <p className="hc-body-lg max-w-[56ch] text-[color-mix(in_srgb,var(--brand-cream)_74%,transparent)] text-pretty">
                    <Bilingual pick={(c) => c.home.featuredOrigins.lead} />
                  </p>
                </div>
                {origins.length > 0 ? (
                  <Link
                    href={PUBLIC_ROUTES.origins}
                    className="group/cta inline-flex min-h-11 shrink-0 items-center gap-2 text-[length:var(--text-small)] font-semibold text-[var(--brand-cream)] underline-offset-4 decoration-[var(--gold-on-dark)] decoration-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]"
                  >
                    <Bilingual pick={(c) => c.home.featuredOrigins.action} />
                    <Icon
                      name="arrow-right"
                      data-directional-icon="true"
                      className="size-4 transition-transform duration-[var(--dur-base)] group-hover/cta:translate-x-1 rtl:group-hover/cta:-translate-x-1"
                    />
                  </Link>
                ) : null}
              </div>

              {origins.length > 0 ? (
                <OriginsShowcase origins={origins} tone="dark" />
              ) : (
                <p className="hc-body text-[color-mix(in_srgb,var(--brand-cream)_74%,transparent)]">
                  <Bilingual pick={(c) => c.home.featuredOrigins.empty} />
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 7 — Traceability: the chain of responsibility over photography. */}
      <TraceabilityBand />

      {/* 8 — Sourcing and how Hills works, as a drawn journey. */}
      <ProcessJourney />

      {/*
        9 — Reference information. A wide, deliberately locked data stage. The component renders only
        the honest unavailable state; no number, source, timestamp or licence claim exists (PRICE-011).
      */}
      <section className="bg-secondary py-[clamp(4rem,8vw,8rem)] text-foreground">
        <div className="hc-container flex flex-col gap-10">
          <div className="flex max-w-[46rem] flex-col gap-3">
            <span className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.home.reference.eyebrow} />
            </span>
            <h2 className="hc-heading-2 font-semibold text-balance">
              <Bilingual pick={(c) => c.home.reference.title} />
            </h2>
            <p className="hc-body-lg max-w-[58ch] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.home.reference.lead} />
            </p>
          </div>
          <ReferencePrice />
        </div>
      </section>

      {/* 10 — Closing commercial moment. */}
      <FinalCta />
    </PublicShell>
  );
}

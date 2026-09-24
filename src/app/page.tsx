import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { Bilingual } from "@/components/locale/bilingual";
import { MarketplaceLockedTeaser, RecentlyListed } from "@/components/marketplace/home-marketplace";
import { CoffeeMarquee } from "@/components/public/coffee-marquee";
import { CoffeeShowcase } from "@/components/public/coffee-showcase";
import { FinalCta } from "@/components/public/final-cta";
import { Hero } from "@/components/public/hero";
import { IntentCards } from "@/components/public/intent-cards";
import { InteractiveStorySection } from "@/components/public/interactive-story-section";
import { OriginsShowcase } from "@/components/public/origins-showcase";
import { ProcessJourney } from "@/components/public/process-journey";
import { PublicShell } from "@/components/public/public-shell";
import { ReferencePriceSection } from "@/components/pricing/reference-price-section";
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
 * Two database reads, both anonymous under RLS with explicit column allowlists: the public origins
 * index, through Block A's verified read layer (`lib/public/*`), for the showcase, and — since
 * Feature 011 — the licence-gated reference-price contract (`lib/pricing/*`) for the reference
 * band. The coffee sections are deliberately static and editorial until record photography exists
 * (MEDIA-01) — see `coffee-showcase.tsx` — and hand off to the real dynamic `/coffee/` index. No
 * grade, cup score, crop year, quantity, MOQ, availability, seller, warehouse or EXECUTABLE price
 * appears anywhere on this page; the only price-like figure is a disclosure-complete reference
 * benchmark (information, never an offer) or an honest unavailable/stale state. Nothing is
 * fabricated: empty states say so plainly, and no statistic, certification or partner count is
 * invented. PRICE-011 is supplied by Feature 011.
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

      {/* 2 — Commercial intent: asymmetric editorial pathways */}
      <section className="bg-background py-[clamp(5rem,9vw,9.5rem)] text-foreground">
        <div className="hc-public-container flex flex-col gap-14">
          <div className="flex max-w-[50rem] flex-col items-start gap-4 sm:gap-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)] shadow-sm">
              <span className="size-1.5 rounded-full bg-[var(--hc-accent)]" />
              <Bilingual pick={(c) => c.home.intents.eyebrow} />
            </div>
            <h2 className="font-heading text-[clamp(2.25rem,1.7rem+3vw,4.5rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-balance">
              <Bilingual pick={(c) => c.home.intents.title} />
            </h2>
            <span aria-hidden="true" className="h-0.5 w-14 bg-[var(--hc-accent)]" />
            <p className="max-w-[48ch] text-[clamp(1rem,0.95rem+0.25vw,1.1875rem)] leading-[1.7] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.home.intents.lead} />
            </p>
          </div>
          <IntentCards />
        </div>
      </section>

      {/*
        3 — The member marketplace (final non-payment closure run). The static half states the product
        distinction plainly — the public CATALOGUE is information about coffees; the MARKETPLACE is real
        seller listings for approved members — and is identical for every visitor. "Recently listed" is
        streamed behind Suspense from `components/marketplace/home-marketplace.tsx`, which resolves the
        request identity itself (this page stays identity-free, T032) and loads listings ONLY for an
        authorized member; everyone else gets the locked preview or their next step, never listing data.
      */}
      <section id="marketplace" className="scroll-mt-[calc(var(--header-h)+1rem)] bg-secondary py-[clamp(4.5rem,8vw,8rem)] text-foreground" aria-labelledby="home-marketplace-heading" data-home-marketplace>
        <div className="hc-public-container flex flex-col gap-12">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
            <div className="flex flex-col items-start gap-4">
              <span className="hc-eyebrow text-[var(--hc-accent-hover)] dark:text-[var(--gold-on-dark)]">
                <Bilingual pick={(c) => c.home.marketplace.eyebrow} />
              </span>
              <h2 id="home-marketplace-heading" className="font-heading text-[clamp(2.1rem,1.6rem+2.6vw,4rem)] font-semibold leading-[1.05] tracking-[-0.025em] text-balance rtl:leading-[1.2] rtl:tracking-normal">
                <Bilingual pick={(c) => c.home.marketplace.title} />
              </h2>
              <p className="max-w-[52ch] text-[clamp(1rem,0.95rem+0.25vw,1.15rem)] leading-[1.7] text-foreground/80 text-pretty">
                <Bilingual pick={(c) => c.home.marketplace.lead} />
              </p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2" data-catalogue-vs-marketplace>
              <div className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-border bg-card p-5">
                <dt className="flex items-center gap-2 font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
                  <Icon name="file-text" className="size-5 text-muted-foreground" aria-hidden="true" />
                  <Bilingual pick={(c) => c.home.marketplace.catalogueTitle} />
                </dt>
                <dd className="flex flex-1 flex-col gap-3 text-[length:var(--text-small)] leading-[1.65] text-muted-foreground">
                  <Bilingual pick={(c) => c.home.marketplace.catalogueBody} />
                  <Link href={PUBLIC_ROUTES.coffee} className="mt-auto inline-flex min-h-11 items-center gap-2 font-semibold text-foreground underline decoration-[var(--hc-accent)] underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
                    <Bilingual pick={(c) => c.home.marketplace.catalogueAction} />
                    <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
                  </Link>
                </dd>
              </div>
              <div className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--hc-forest)] bg-[var(--hc-forest)] p-5 text-[#f2f5eb] dark:border-[rgba(214,178,94,0.4)] dark:bg-[var(--hc-moss)]">
                <dt className="flex items-center gap-2 font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
                  <Icon name="store" className="size-5 text-[var(--gold-on-dark)]" aria-hidden="true" />
                  <Bilingual pick={(c) => c.home.marketplace.marketplaceTitle} />
                </dt>
                <dd className="text-[length:var(--text-small)] leading-[1.65] text-[rgba(242,245,235,0.85)]">
                  <Bilingual pick={(c) => c.home.marketplace.marketplaceBody} />
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h3 className="font-heading text-[clamp(1.5rem,1.25rem+1vw,2.1rem)] font-semibold">
                <Bilingual pick={(c) => c.home.marketplace.recentTitle} />
              </h3>
              <p className="text-[length:var(--text-small)] text-foreground/80">
                <Bilingual pick={(c) => c.home.marketplace.recentLead} />
              </p>
            </div>
            <Suspense fallback={<MarketplaceLockedTeaser loading />}>
              <RecentlyListed />
            </Suspense>
          </div>
        </div>
      </section>

      {/* 4 — Credibility, as the timed lifecycle story. */}
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
      <section className="bg-background py-[clamp(4rem,7vw,7.5rem)] text-foreground">
        <div className="hc-public-container">
          <div className="relative isolate overflow-hidden rounded-[var(--radius-2xl)] border border-[rgba(242,245,235,0.12)] bg-[var(--hc-forest)] px-[var(--gutter-page)] py-[clamp(3.5rem,7vw,6.5rem)] text-[#f2f5eb] shadow-[0_24px_64px_rgba(18,35,20,0.15)]">
            <div aria-hidden="true" className="absolute inset-0 -z-10">
              <Image
                src="/images/farm-landscape.jpg"
                alt=""
                fill
                sizes="(min-width: 1536px) 1536px, 100vw"
                className="object-cover object-[50%_60%] opacity-[0.25]"
              />
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,35,20,0.4)_0%,rgba(18,35,20,0.85)_55%,rgba(18,35,20,0.98)_100%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(164,72,25,0.12),transparent_70%)]" />
            </div>

            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex max-w-[46rem] flex-col items-start gap-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(242,245,235,0.2)] bg-[rgba(18,35,20,0.65)] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#f2f5eb] backdrop-blur-md">
                    <span className="size-1.5 rounded-full bg-[var(--hc-accent)]" />
                    <Bilingual pick={(c) => c.home.featuredOrigins.eyebrow} />
                  </div>
                  <h2 className="font-heading text-[clamp(2.25rem,1.7rem+3vw,4.25rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-[#f2f5eb] text-balance">
                    <Bilingual pick={(c) => c.home.featuredOrigins.title} />
                  </h2>
                  <span aria-hidden="true" className="h-0.5 w-14 bg-[var(--hc-accent)]" />
                  <p className="max-w-[48ch] text-[clamp(1rem,0.95rem+0.25vw,1.1875rem)] leading-[1.7] text-[rgba(242,245,235,0.82)] text-pretty">
                    <Bilingual pick={(c) => c.home.featuredOrigins.lead} />
                  </p>
                </div>
                {origins.length > 0 ? (
                  <Link
                    href={PUBLIC_ROUTES.origins}
                    className="group/cta inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-[#f2f5eb] underline-offset-4 decoration-[var(--hc-accent)] decoration-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)]"
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
                <p className="text-sm text-[rgba(242,245,235,0.74)]">
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
        9 — Reference information (Feature 011). Rendered through the licence-gated presentation
        contract: a benchmark appears ONLY with source, unit, currency, observation timestamp, time
        zone, delay type and the reference-only statement; otherwise the honest stale/unavailable
        state. Raw values exactly as recorded — no currency or unit conversion (DB-OPEN-08).
      */}
      <section className="bg-secondary py-[clamp(4.5rem,8vw,8rem)] text-foreground" aria-labelledby="home-reference-heading" data-home-reference>
        <div className="hc-public-container grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-[clamp(3rem,6vw,6rem)]">
          <div className="flex flex-col gap-8 lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start">
            <div className="flex flex-col items-start gap-4">
              <span className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                <Bilingual pick={(c) => c.home.reference.eyebrow} />
              </span>
              <h2 id="home-reference-heading" className="font-heading text-[clamp(2.1rem,1.6rem+2.4vw,3.6rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-balance rtl:leading-[1.2] rtl:tracking-normal">
                <Bilingual pick={(c) => c.home.reference.title} />
              </h2>
              <p className="max-w-[48ch] text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] leading-[1.7] text-muted-foreground text-pretty">
                <Bilingual pick={(c) => c.home.reference.lead} />
              </p>
            </div>
            {/* The four price concepts Feature 011 keeps permanently distinct — explained, never shown as numbers here. */}
            <div className="flex flex-col gap-3">
              <h3 className="font-sans text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.14em] text-muted-foreground rtl:tracking-normal">
                <Bilingual pick={(c) => c.home.reference.conceptsHeading} />
              </h3>
              <ol className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border sm:grid-cols-2" data-price-concepts>
                {(["benchmark", "quote", "listing", "executed"] as const).map((key, index) => (
                  <li key={key} className="flex flex-col gap-1.5 bg-card p-4">
                    <span className="flex items-center gap-2 text-[length:var(--text-small)] font-semibold text-foreground">
                      <span className="font-mono text-[length:var(--text-micro)] text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]" dir="ltr">
                        0{index + 1}
                      </span>
                      <Bilingual pick={(c) => c.home.reference.concepts[key].title} />
                    </span>
                    <span className="text-[length:var(--text-meta)] leading-[1.6] text-muted-foreground">
                      <Bilingual pick={(c) => c.home.reference.concepts[key].body} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="min-w-0">
            <ReferencePriceSection />
          </div>
        </div>
      </section>

      {/* 10 — Closing commercial moment. */}
      <FinalCta />
    </PublicShell>
  );
}

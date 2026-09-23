import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Bilingual, LocalizedContent, type CopySelector } from "@/components/locale/bilingual";
import { CoffeeCard, COFFEE_GRID } from "@/components/public/coffee-card";
import { JsonLd } from "@/components/public/json-ld";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { getPublicCoffeeIndex } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import { getPublicOriginBySlug } from "@/lib/public/origins";
import {
  buildBreadcrumbJsonLd,
  buildJsonLdGraph,
  buildOrganizationJsonLd,
  buildOriginJsonLd,
  serializeJsonLd,
} from "@/lib/public/seo";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public origin detail (Feature 002 T016; place-led narrative by Phase 5.5 UIF-029).
 *
 * STATUS GATING — UNCHANGED BY THE VISUAL WORK. `getPublicOriginBySlug` returns `null` for an
 * `INACTIVE` or `ARCHIVED` origin exactly as it does for a slug that never existed, and both land on
 * the same `notFound()` — a real 404, never a fabricated 301/308/410 the database cannot support
 * (**LIFE-01**, T029). An anonymous visitor cannot distinguish a withdrawn origin from one that never
 * existed. `generateMetadata` resolves identically, so nothing leaks through the document head
 * either, and structured data (T025) is only ever built for a resolved, active `origin`.
 *
 * COFFEES FROM THIS ORIGIN are filtered from the already-cached public coffee index rather than
 * issued as a second query. That reuses a warm public cache entry, keeps every read inside the one
 * audited DTO boundary, and guarantees the same `PUBLISHED`-only gate as the main catalogue.
 *
 * EMPTY IS NOT AN ERROR. An active origin with no published coffees renders an honest empty state
 * and still returns 200 — the origin genuinely exists, we simply publish nothing from it today.
 * Fabricating availability here would imply an order book that does not exist (SRS MKT-06).
 *
 * Only public origin DTO fields appear: name, description, region, country and parent. No raw
 * identifier, no owner or member data, no warehouse detail, no quantity and no price — none of which
 * exists on `PublicOriginDetail` to render.
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * Pre-Stripe hardening run redesign: a two-column identity band (name, region, description, actions)
 * beside an ORIGIN DOSSIER panel — country, region, parent origin and the count of published coffees —
 * whose image area is a mosaic of the PRIMARY images of this origin's own published coffees (real,
 * provenance-true imagery), falling back to the country-code arch motif when none exist (MEDIA-01:
 * there is still no approved photograph for an origin record, and the repository's `origin-*.jpg`
 * files are deliberately not used — their filenames match origin names by coincidence of the asset
 * pack, not by provenance). Then the coffee grid (or a designed empty state), the approved Hills
 * sourcing commitments, and the commercial next step. Everything is EN/AR through the dictionaries
 * and `LocalizedContent`.
 *
 * Server Component; no client JavaScript.
 */

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const origin = await getPublicOriginBySlug(slug);

  // Same shape for non-active and unknown: nothing here distinguishes them.
  if (!origin) return {};

  const canonical = canonicalUrl(`/origins/${origin.slug}/`);
  const description = origin.description ?? copy.origins.index.metaDescription;

  return {
    title: origin.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: copy.site.name,
      title: origin.name,
      description,
    },
  };
}

export default async function OriginDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const origin = await getPublicOriginBySlug(slug);

  if (!origin) notFound();

  const coffees = await getPublicCoffeeIndex();
  const fromThisOrigin = coffees.filter((coffee) => coffee.origin?.slug === origin.slug);
  // Real imagery only: the primary images of THIS origin's own published coffees (never a stock photo
  // presented as the place). Up to three, for the dossier mosaic.
  const mosaic = fromThisOrigin.flatMap((coffee) => (coffee.image ? [{ url: coffee.image.url, slug: coffee.slug }] : [])).slice(0, 3);
  const canonical = canonicalUrl(`/origins/${origin.slug}/`);

  const jsonLd = serializeJsonLd(
    buildJsonLdGraph([
      buildOrganizationJsonLd(copy.site.name, copy.site.tagline),
      buildOriginJsonLd(origin, canonical),
      buildBreadcrumbJsonLd([
        { name: copy.site.name, url: canonicalUrl("/") },
        { name: copy.origins.index.metaTitle, url: canonicalUrl("/origins/") },
        { name: origin.name, url: canonical },
      ]),
    ])
  );

  const principles = [
    { key: "origin", icon: "map-pin", title: (c) => c.home.credibility.origin.title, body: (c) => c.home.credibility.origin.body },
    { key: "quality", icon: "badge-check", title: (c) => c.home.credibility.quality.title, body: (c) => c.home.credibility.quality.body },
    { key: "custody", icon: "shield", title: (c) => c.home.credibility.custody.title, body: (c) => c.home.credibility.custody.body },
  ] as const satisfies readonly { key: string; icon: "map-pin" | "badge-check" | "shield"; title: CopySelector; body: CopySelector }[];

  return (
    <article data-origin-detail>
      <JsonLd json={jsonLd} />

      {/* ── IDENTITY ── the place, its geography and (when it exists) its coffees' own imagery ── */}
      <section data-page-opener="dark" className="relative isolate -mt-[var(--header-h)] overflow-hidden bg-[var(--hc-forest)] pt-[var(--header-h)] text-[#f2f5eb]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_85%_15%,rgba(164,72,25,0.18),transparent_70%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04] [background-image:radial-gradient(#EEE4D1_0.8px,transparent_0.8px)] [background-size:10px_10px]" />

        <div className="hc-container grid gap-10 py-[clamp(2rem,5vw,4.5rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-[clamp(2.5rem,5vw,5rem)]">
          <div className="flex min-w-0 flex-col items-start gap-5">
            <Link
              href={PUBLIC_ROUTES.origins}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] text-[length:var(--text-small)] font-medium text-[rgba(242,245,235,0.85)] underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-[#ffffff] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)]"
            >
              <Icon name="chevron-left" data-directional-icon="true" className="size-4" />
              <Bilingual pick={(c) => c.origins.detail.backToIndex} />
            </Link>

            <span className="hc-eyebrow font-semibold tracking-wider text-[var(--gold-on-dark)]">
              {origin.region ? <LocalizedContent en={origin.region.name} ar={origin.region.nameAr} /> : <Bilingual pick={(c) => c.origins.detail.identityEyebrow} />}
            </span>

            <h1 className="font-heading text-[clamp(2.5rem,1.8rem+3.4vw,5.25rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-balance text-[#ffffff] rtl:leading-[1.15] rtl:tracking-normal">
              <LocalizedContent en={origin.name} ar={origin.nameAr} />
            </h1>

            <span aria-hidden="true" className="h-0.5 w-16 bg-[var(--hc-accent)]" />

            {origin.description ? (
              <p className="hc-body-lg max-w-[54ch] text-[rgba(242,245,235,0.9)] text-pretty">
                <LocalizedContent en={origin.description} ar={origin.descriptionAr} />
              </p>
            ) : null}

            <div className="mt-1 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent justify-center">
                <Bilingual pick={(c) => c.cta.requestAnOffer} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
              <Link
                href="#origin-coffees"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[rgba(242,245,235,0.28)] px-6 text-sm font-semibold text-[#f2f5eb] transition-colors duration-[var(--dur-fast)] hover:bg-[rgba(242,245,235,0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)]"
              >
                <Bilingual pick={(c) => c.origins.detail.coffeesHeading} />
              </Link>
            </div>
          </div>

          {/* Dossier panel: geography facts + real coffee imagery (or the country-code arch motif). */}
          <div className="flex min-w-0 flex-col overflow-hidden rounded-t-[min(10rem,35%)] rounded-b-[var(--radius-xl)] border border-[rgba(242,245,235,0.16)] bg-[rgba(8,24,18,0.35)] shadow-[0_30px_80px_rgba(0,0,0,0.3)]" data-origin-dossier>
            <div className="relative aspect-[16/10] w-full overflow-hidden" data-origin-media={mosaic.length > 0 ? "coffees" : "motif"}>
              {mosaic.length > 0 ? (
                <div className={`grid h-full gap-px bg-[rgba(242,245,235,0.12)] ${mosaic.length === 1 ? "grid-cols-1" : mosaic.length === 2 ? "grid-cols-2" : "grid-cols-[2fr_1fr] grid-rows-2"}`}>
                  {mosaic.map((item, index) => (
                    <div key={item.slug} className={`relative overflow-hidden ${mosaic.length === 3 && index === 0 ? "row-span-2" : ""}`}>
                      <Image src={item.url} alt="" fill sizes="(min-width: 1024px) 30vw, 60vw" className="object-cover" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid h-full place-items-center bg-[radial-gradient(ellipse_at_center,rgba(206,138,57,0.16),transparent_70%)]">
                  {origin.countryCode ? (
                    <span aria-hidden="true" dir="ltr" className="font-heading text-[clamp(5rem,12vw,9rem)] font-black leading-none text-[rgba(242,245,235,0.14)]">
                      {origin.countryCode}
                    </span>
                  ) : (
                    <Icon name="map-pin" className="size-12 text-[rgba(242,245,235,0.3)]" aria-hidden="true" />
                  )}
                </div>
              )}
              {mosaic.length > 0 ? (
                <span className="absolute bottom-3 start-3 rounded-full bg-[rgba(8,24,18,0.7)] px-3 py-1 text-[length:var(--text-micro)] font-semibold text-[#f2f5eb] backdrop-blur-sm">
                  <Bilingual pick={(c) => c.origins.detail.mediaCaption} />
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 p-6 sm:p-7">
              <h2 className="hc-eyebrow text-[var(--gold-on-dark)]">
                <Bilingual pick={(c) => c.origins.detail.dossierHeading} />
              </h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[length:var(--text-small)]">
                <div className="flex flex-col gap-1">
                  <dt className="text-[rgba(242,245,235,0.7)]">
                    <Bilingual pick={(c) => c.origins.detail.countryLabel} />
                  </dt>
                  <dd className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
                    {origin.countryCode ? <span dir="ltr">{origin.countryCode}</span> : <Bilingual pick={(c) => c.coffee.detail.notSpecified} />}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-[rgba(242,245,235,0.7)]">
                    <Bilingual pick={(c) => c.origins.detail.coffeesCountLabel} />
                  </dt>
                  <dd className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold tabular-nums" data-origin-coffee-count>
                    <span dir="ltr">{fromThisOrigin.length}</span>
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-[rgba(242,245,235,0.7)]">
                    <Bilingual pick={(c) => c.origins.detail.regionLabel} />
                  </dt>
                  <dd className="font-semibold">
                    {origin.region ? <LocalizedContent en={origin.region.name} ar={origin.region.nameAr} /> : <Bilingual pick={(c) => c.coffee.detail.notSpecified} />}
                  </dd>
                </div>
                {origin.parent ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-[rgba(242,245,235,0.7)]">
                      <Bilingual pick={(c) => c.origins.detail.partOfLabel} />
                    </dt>
                    <dd className="font-semibold">
                      <Link
                        href={`/origins/${origin.parent.slug}/`}
                        className="text-[#ffffff] underline decoration-[var(--hc-accent)] underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)]"
                      >
                        <span lang="en" dir="ltr">{origin.parent.name}</span>
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ── COFFEE FROM THIS ORIGIN ── the reason a buyer is on this page ── */}
      <section id="origin-coffees" className="scroll-mt-[calc(var(--header-h)+1rem)] bg-background py-[clamp(3.5rem,7vw,6.5rem)] text-foreground">
        <div className="hc-container flex flex-col gap-8">
          <div className="flex max-w-[48rem] flex-col gap-3">
            <h2 className="font-heading text-[clamp(1.9rem,1.5rem+1.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em] rtl:tracking-normal">
              <Bilingual pick={(c) => c.origins.detail.coffeesHeading} />
            </h2>
            <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.origins.detail.coffeesLead} />
            </p>
          </div>

          {fromThisOrigin.length > 0 ? (
            <ul className={COFFEE_GRID}>
              {fromThisOrigin.map((coffee) => (
                <CoffeeCard key={coffee.slug} coffee={coffee} />
              ))}
            </ul>
          ) : (
            // Honest, and still a 200: the origin exists, we publish nothing from it right now.
            <div className="flex flex-col items-start gap-4 rounded-[var(--radius-xl)] border border-dashed border-border bg-card p-7 sm:flex-row sm:items-center sm:justify-between" data-origin-empty>
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                  <Icon name="package" className="size-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold text-foreground">
                    <Bilingual pick={(c) => c.origins.detail.emptyTitle} />
                  </p>
                  <p className="max-w-[56ch] text-[length:var(--text-small)] leading-[1.7] text-muted-foreground">
                    <Bilingual pick={(c) => c.origins.detail.coffeesEmpty} />
                  </p>
                </div>
              </div>
              <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent shrink-0">
                <Bilingual pick={(c) => c.cta.requestAnOffer} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── SOURCING CONTEXT ── the approved Hills commitments, not invented origin facts ── */}
      <section className="bg-secondary py-[clamp(3.5rem,7vw,6rem)] text-foreground">
        <div className="hc-container flex flex-col gap-8">
          <div className="flex max-w-[48rem] flex-col gap-3">
            <span className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.origins.detail.sourcingEyebrow} />
            </span>
            <h2 className="font-heading text-[clamp(1.7rem,1.35rem+1.5vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.02em] rtl:tracking-normal">
              <Bilingual pick={(c) => c.origins.detail.sourcingTitle} />
            </h2>
          </div>
          <ul className="grid gap-5 md:grid-cols-3">
            {principles.map((item) => (
              <li key={item.key} className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-border bg-card p-6">
                <span className="grid size-10 place-items-center rounded-full bg-secondary text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                  <Icon name={item.icon} className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
                  <Bilingual pick={item.title} />
                </h3>
                <p className="text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty">
                  <Bilingual pick={item.body} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── COMMERCIAL NEXT STEP ── */}
      <section className="bg-[var(--hc-forest)] py-[clamp(3.5rem,7vw,6rem)] text-[#f2f5eb]">
        <div className="hc-container flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-[46rem] flex-col gap-3">
            <h2 className="font-heading text-[clamp(1.7rem,1.35rem+1.5vw,2.6rem)] font-semibold leading-[1.1]">
              <Bilingual pick={(c) => c.origins.detail.closingTitle} />
            </h2>
            <p className="hc-body-lg text-[rgba(242,245,235,0.85)] text-pretty">
              <Bilingual pick={(c) => c.origins.detail.closingBody} />
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent justify-center">
              <Bilingual pick={(c) => c.cta.requestAnOffer} />
              <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
            </Link>
            <Link href={PUBLIC_ROUTES.coffee} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[rgba(242,245,235,0.3)] px-6 text-sm font-semibold text-[#f2f5eb] transition-colors duration-[var(--dur-fast)] hover:bg-[rgba(242,245,235,0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.origins.detail.exploreCoffee} />
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}

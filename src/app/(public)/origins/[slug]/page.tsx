import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Bilingual } from "@/components/locale/bilingual";
import { CoffeeCard, COFFEE_GRID } from "@/components/public/coffee-card";
import { JsonLd } from "@/components/public/json-ld";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
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
 * The country code carries the identity band as a large quiet place marker, which is the honest
 * premium answer to having no approved photograph for an origin **record** (MEDIA-01). The
 * repository's `origin-*.jpg` files are deliberately not used: their filenames match some origin
 * names by coincidence of the asset pack, not by provenance.
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

  return (
    <article>
      <JsonLd json={jsonLd} />
      {/* ── IDENTITY ── the country code as the place marker, on the forest ground ── */}
      <section data-page-opener="dark" className="relative isolate -mt-[var(--header-h)] overflow-hidden bg-sidebar pt-[var(--header-h)] text-sidebar-foreground">
        {origin.countryCode ? (
          <span
            aria-hidden="true"
            dir="ltr"
            className="pointer-events-none absolute -top-8 end-[clamp(1rem,4vw,4rem)] font-heading text-[clamp(9rem,22vw,20rem)] font-black leading-none text-sidebar-foreground/[0.06]"
          >
            {origin.countryCode}
          </span>
        ) : null}

        <div className="hc-container relative flex flex-col items-start gap-5 py-[clamp(2.5rem,6vw,5rem)]">
          <Link
            href={PUBLIC_ROUTES.origins}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] text-[length:var(--text-small)] font-medium text-sidebar-foreground/75 underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-sidebar-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sidebar-ring)]"
          >
            <Icon name="chevron-left" className="size-4" />
            <Bilingual pick={(c) => c.origins.detail.backToIndex} />
          </Link>

          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
            {origin.region ? origin.region.name : <Bilingual pick={(c) => c.origins.detail.identityEyebrow} />}
          </span>

          <h1 className="font-heading text-[length:var(--text-h1)] font-semibold leading-[var(--lh-display)] tracking-[var(--tracking-display)] text-balance">
            {origin.name}
          </h1>

          <span aria-hidden="true" className="h-px w-16 bg-[var(--gold-on-dark)]" />

          {origin.description ? (
            <p className="hc-body-lg max-w-[54ch] text-sidebar-foreground/85 text-pretty">
              {origin.description}
            </p>
          ) : null}

          {/* Geography — only what the public DTO carries. */}
          {origin.region || origin.parent || origin.countryCode ? (
            <dl className="mt-3 flex flex-wrap items-baseline gap-x-10 gap-y-3 text-[length:var(--text-small)]">
              {origin.countryCode ? (
                <div className="flex items-baseline gap-3">
                  <dt className="text-sidebar-foreground/65">
                    <Bilingual pick={(c) => c.origins.detail.countryLabel} />
                  </dt>
                  <dd dir="ltr" className="font-medium">
                    {origin.countryCode}
                  </dd>
                </div>
              ) : null}
              {origin.region ? (
                <div className="flex items-baseline gap-3">
                  <dt className="text-sidebar-foreground/65">
                    <Bilingual pick={(c) => c.origins.detail.regionLabel} />
                  </dt>
                  <dd className="font-medium">{origin.region.name}</dd>
                </div>
              ) : null}
              {origin.parent ? (
                <div className="flex items-baseline gap-3">
                  <dt className="text-sidebar-foreground/65">
                    <Bilingual pick={(c) => c.origins.detail.partOfLabel} />
                  </dt>
                  <dd className="font-medium">
                    <Link
                      href={`/origins/${origin.parent.slug}/`}
                      className="underline underline-offset-4 decoration-[var(--gold-on-dark)] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sidebar-ring)]"
                    >
                      {origin.parent.name}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </section>

      {/* ── COFFEE FROM THIS ORIGIN ── the reason a buyer is on this page ── */}
      <section className="bg-background py-[clamp(3rem,6vw,6rem)] text-foreground">
        <div className="hc-container flex flex-col gap-8">
          <h2 className="hc-heading-2 font-semibold">
            <Bilingual pick={(c) => c.origins.detail.coffeesHeading} />
          </h2>

          {fromThisOrigin.length > 0 ? (
            <ul className={COFFEE_GRID}>
              {fromThisOrigin.map((coffee) => (
                <CoffeeCard key={coffee.slug} coffee={coffee} />
              ))}
            </ul>
          ) : (
            // Honest, and still a 200: the origin exists, we publish nothing from it right now.
            <p className="max-w-[52ch] hc-body text-muted-foreground">
              <Bilingual pick={(c) => c.origins.detail.coffeesEmpty} />
            </p>
          )}
        </div>
      </section>

      {/* ── COMMERCIAL NEXT STEP ── */}
      <section className="bg-secondary py-[clamp(3rem,6vw,5.5rem)] text-foreground">
        <div className="hc-container flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="hc-body-lg max-w-[46rem] text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.home.rfq.lead} />
          </p>
          <Button
            size="lg"
            className="shrink-0"
            nativeButton={false}
            render={<Link href={PUBLIC_ROUTES.contact} />}
          >
            <Bilingual pick={(c) => c.cta.requestAnOffer} />
          </Button>
        </div>
      </section>
    </article>
  );
}

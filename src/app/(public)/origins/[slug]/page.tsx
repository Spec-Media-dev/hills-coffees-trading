import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CoffeeCard } from "@/components/public/coffee-card";
import { MediaPlaceholder } from "@/components/public/media-placeholder";
import {
  EYEBROW,
  HEADING_2,
  HEADING_3,
  LEAD,
  LINK_QUIET,
} from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { getPublicCoffeeIndex } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import { getPublicOriginBySlug } from "@/lib/public/origins";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public origin detail (Feature 002, T016 — FR-002, FR-005, FR-006, SC-001).
 *
 * STATUS GATING. `getPublicOriginBySlug` returns `null` for an `INACTIVE` or `ARCHIVED` origin
 * exactly as it does for a slug that never existed, and both land on the same `notFound()` — an
 * anonymous visitor cannot distinguish a withdrawn origin from one that never existed.
 * `generateMetadata` resolves identically, so nothing leaks through the document head either.
 *
 * COFFEES FROM THIS ORIGIN are filtered from the already-cached public coffee index rather than
 * issued as a second query. That reuses a warm public cache entry, keeps every read inside the one
 * audited DTO boundary, and guarantees the same `PUBLISHED`-only gate as the main catalogue.
 *
 * EMPTY IS NOT AN ERROR. An active origin with no published coffees renders an honest empty state
 * and still returns 200 — the origin genuinely exists, we simply publish nothing from it today.
 * Fabricating availability here would imply an order book that does not exist (SRS MKT-06).
 *
 * Only public origin DTO fields appear: name, description, region and country. No raw identifier,
 * no owner or member data, no warehouse detail, no quantity and no price — none of which exists on
 * `PublicOriginDetail` to render.
 *
 * Server Component; no client JavaScript.
 */

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
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
  const fromThisOrigin = coffees.filter(
    (coffee) => coffee.origin?.slug === origin.slug
  );

  return (
    <article className="bg-background">
      <div className={`hc-container py-[clamp(2.5rem,5vw,4.5rem)]`}>
        <Link href={PUBLIC_ROUTES.origins} className={LINK_QUIET}>
          {copy.origins.detail.backToIndex}
        </Link>
      </div>

      <div
        className={`hc-container grid gap-10 pb-[clamp(3rem,6vw,5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)] lg:gap-16`}
      >
        <div className="flex flex-col gap-5">
          {origin.countryCode ? (
            <span className={`${EYEBROW} text-accent`}>
              {origin.countryCode}
            </span>
          ) : null}

          <h1 className={HEADING_2}>{origin.name}</h1>

          <span aria-hidden="true" className="h-px w-16 bg-accent" />

          {origin.description ? (
            <p className={`${LEAD} text-muted-foreground text-pretty`}>
              {origin.description}
            </p>
          ) : null}

          {origin.region || origin.parent ? (
            <dl className="mt-2 flex flex-col">
              {origin.region ? (
                <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-border py-3 text-[0.9375rem]">
                  <dt className="text-muted-foreground">
                    {copy.origins.detail.regionLabel}
                  </dt>
                  <dd className="font-medium text-foreground">
                    {origin.region.name}
                  </dd>
                </div>
              ) : null}
              {origin.parent ? (
                <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-border py-3 text-[0.9375rem]">
                  <dt className="text-muted-foreground">
                    {copy.origins.detail.partOfLabel}
                  </dt>
                  <dd className="font-medium text-foreground">
                    <Link
                      href={`/origins/${origin.parent.slug}/`}
                      className={LINK_QUIET}
                    >
                      {origin.parent.name}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>

        <MediaPlaceholder aspectRatio="4 / 5" />
      </div>

      <div className="bg-secondary">
        <div
          className={`hc-container flex flex-col gap-8 py-[clamp(3rem,6vw,5rem)]`}
        >
          <h2 className={HEADING_3}>{copy.origins.detail.coffeesHeading}</h2>

          {fromThisOrigin.length > 0 ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {fromThisOrigin.map((coffee) => (
                <CoffeeCard key={coffee.slug} coffee={coffee} />
              ))}
            </ul>
          ) : (
            // Honest, and still a 200: the origin exists, we publish nothing from it right now.
            <p className="max-w-[52ch] text-[0.9375rem] leading-[1.6] text-muted-foreground">
              {copy.origins.detail.coffeesEmpty}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

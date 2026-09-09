import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaPlaceholder } from "@/components/public/media-placeholder";
import {
  EYEBROW,
  HEADING_2,
  HEADING_3,
  LEAD,
  LINK_QUIET,
} from "@/components/public/section";
import { PUBLIC_ROUTES } from "@/components/public/site-header";
import { Button } from "@/components/ui/button";
import { getPublicCoffeeBySlug } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public coffee detail (Feature 002, T015 — FR-004, FR-006, FR-022, FR-024, SC-001; PS1).
 *
 * ============================================================================
 * THE MOST LEAK-PRONE PAGE ON THE PLATFORM'S ONLY ANONYMOUS SURFACE
 * ============================================================================
 *
 * Everything rendered below comes from `PublicCoffeeDetail` and nothing else. That DTO is built by
 * Block A's read layer from an explicit column allowlist, mapped field by field with no row spread,
 * so the private data this page must never show is not merely hidden here — it is absent from the
 * object entirely and cannot be reached from this file.
 *
 * NEVER RENDERED OR IMPLIED, per `contracts/public-dto-allowlist.md` §3–§4: grade, cup score, crop
 * year, quantity, reserved quantity, MOQ, availability, seller or owner identity, member identity,
 * warehouse or any private location, member listings, offers, executable/contract/reference prices,
 * commission configuration, and order, payment or settlement data.
 *
 * Do not "helpfully" enrich this page from another table. Quality data lives in a member-only table;
 * quantities and prices belong to the authorised member experience (SRS MKT-06). A public coffee
 * page is a *discovery* page describing what Hills sources — it must never imply a live order book.
 *
 * The certification block publishes the claim's name and expiry only. The certificate identifier is
 * withheld by the DTO contract even though RLS exposes it: publishing a certificate number is a
 * Content and Compliance disclosure decision, not a developer's.
 *
 * ============================================================================
 * STATUS GATING
 * ============================================================================
 *
 * `getPublicCoffeeBySlug` returns `null` for a DRAFT or ARCHIVED record exactly as it does for a
 * slug that never existed, and both land on the same `notFound()`. An anonymous visitor therefore
 * cannot tell an unpublished coffee from a nonexistent one — no probing the catalogue for unreleased
 * content. `generateMetadata` resolves the same way, so a non-public slug leaks nothing through the
 * document head either.
 *
 * Server Component; no client JavaScript.
 */

type PageProps = { params: Promise<{ slug: string }> };

/** Renders a value, or the honest "not specified" fallback — never a guess. */
function orNotSpecified(value: string | undefined | null): string {
  return value && value.trim() !== "" ? value : copy.coffee.detail.notSpecified;
}

/** One label/value row in a specification list. */
const ROW =
  "flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-border py-3 text-[0.9375rem]";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const coffee = await getPublicCoffeeBySlug(slug);

  // Same shape for unpublished and unknown: nothing here distinguishes them.
  if (!coffee) return {};

  const canonical = canonicalUrl(`/coffee/${coffee.slug}/`);
  const description = coffee.description ?? copy.coffee.index.metaDescription;

  return {
    title: coffee.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: copy.site.name,
      title: coffee.name,
      description,
    },
  };
}

export default async function CoffeeDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const coffee = await getPublicCoffeeBySlug(slug);

  if (!coffee) notFound();

  const origin = coffee.origin;

  return (
    <article className="bg-background">
      <div className={`hc-container py-[clamp(2.5rem,5vw,4.5rem)]`}>
        <Link href={PUBLIC_ROUTES.coffee} className={LINK_QUIET}>
          {copy.coffee.detail.backToIndex}
        </Link>
      </div>

      {/* Identity: the coffee, its origin, and the media slot — the page's editorial head. */}
      <div
        className={`hc-container grid gap-10 pb-[clamp(3rem,6vw,5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)] lg:gap-16`}
      >
        <div className="flex flex-col gap-5">
          {origin ? (
            <span className={`${EYEBROW} text-accent`}>{origin.name}</span>
          ) : null}

          <h1 className={HEADING_2}>{coffee.name}</h1>

          <span aria-hidden="true" className="h-px w-16 bg-accent" />

          {coffee.description ? (
            <p className={`${LEAD} text-muted-foreground text-pretty`}>
              {coffee.description}
            </p>
          ) : null}
        </div>

        <MediaPlaceholder aspectRatio="4 / 5" />
      </div>

      {/* Specification and origin. Definition lists, because that is what this content is. */}
      <div className="bg-secondary">
        <div
          className={`hc-container grid gap-10 py-[clamp(3rem,6vw,5rem)] md:grid-cols-2 lg:gap-16`}
        >
          <section className="flex flex-col gap-6">
            <h2 className={HEADING_3}>{copy.coffee.detail.specHeading}</h2>
            <dl className="flex flex-col">
              {(
                [
                  [copy.coffee.detail.coffeeType, coffee.coffeeType?.name],
                  [copy.coffee.detail.variety, coffee.variety?.name],
                  [
                    copy.coffee.detail.processingMethod,
                    coffee.processingMethod?.name,
                  ],
                  [copy.coffee.detail.packaging, coffee.packagingType?.name],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className={ROW}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-foreground">
                    {orNotSpecified(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="flex flex-col gap-6">
            <h2 className={HEADING_3}>{copy.coffee.detail.originHeading}</h2>
            {origin ? (
              <dl className="flex flex-col">
                <div className={ROW}>
                  <dt className="text-muted-foreground">
                    {copy.coffee.detail.originHeading}
                  </dt>
                  <dd className="font-medium text-foreground">
                    <Link
                      href={`/origins/${origin.slug}/`}
                      className={LINK_QUIET}
                    >
                      {origin.name}
                    </Link>
                  </dd>
                </div>
                <div className={ROW}>
                  <dt className="text-muted-foreground">
                    {copy.coffee.detail.region}
                  </dt>
                  <dd className="font-medium text-foreground">
                    {orNotSpecified(origin.region?.name)}
                  </dd>
                </div>
                <div className={ROW}>
                  <dt className="text-muted-foreground">
                    {copy.coffee.detail.country}
                  </dt>
                  <dd className="font-medium text-foreground">
                    {orNotSpecified(origin.countryCode)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-[0.9375rem] text-muted-foreground">
                {copy.coffee.detail.notSpecified}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Characteristics and certifications — both public taxonomy, both optional. */}
      {coffee.tags.length > 0 || coffee.certifications.length > 0 ? (
        <div
          className={`hc-container grid gap-10 py-[clamp(3rem,6vw,5rem)] md:grid-cols-2 lg:gap-16`}
        >
          {coffee.tags.length > 0 ? (
            <section className="flex flex-col gap-5">
              <h2 className={HEADING_3}>{copy.coffee.detail.tagsHeading}</h2>
              <ul className="flex flex-wrap gap-2">
                {coffee.tags.map((tag) => (
                  <li
                    key={tag.slug}
                    className="rounded-full border border-border bg-card px-4 py-1.5 text-[0.8125rem] text-foreground"
                  >
                    {tag.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {coffee.certifications.length > 0 ? (
            <section className="flex flex-col gap-5">
              <h2 className={HEADING_3}>
                {copy.coffee.detail.certificationsHeading}
              </h2>
              <ul className="flex flex-col gap-3">
                {coffee.certifications.map((certification) => (
                  <li
                    key={certification.name}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border pb-3 text-[0.9375rem]"
                  >
                    <span className="font-medium text-foreground">
                      {certification.name}
                    </span>
                    {certification.expiresAt ? (
                      <span className="text-[0.8125rem] text-muted-foreground">
                        {copy.coffee.detail.certificationValidUntil}{" "}
                        {certification.expiresAt}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* Traceability framing — what Hills stands behind, with no unevidenced claim attached. */}
      <div className="bg-secondary">
        <div
          className={`hc-container flex flex-col gap-4 py-[clamp(3rem,6vw,5rem)]`}
        >
          <h2 className={HEADING_3}>{copy.coffee.detail.traceabilityHeading}</h2>
          <p className={`${LEAD} text-muted-foreground text-pretty`}>
            {copy.coffee.detail.traceabilityBody}
          </p>
        </div>
      </div>

      {/* The commercial conversation this page exists to start. */}
      <div className="bg-sidebar text-sidebar-foreground">
        <div
          className={`hc-container flex flex-col gap-8 py-[clamp(3rem,6vw,5rem)] lg:flex-row lg:items-center lg:justify-between`}
        >
          <div className="flex max-w-[46rem] flex-col gap-3">
            <h2 className={HEADING_3}>{copy.coffee.detail.rfqHeading}</h2>
            <p className={`${LEAD} text-sidebar-foreground/85 text-pretty`}>
              {copy.coffee.detail.rfqLead}
            </p>
          </div>
          <Button
            variant="accent"
            className="shrink-0"
            nativeButton={false}
            render={<Link href={PUBLIC_ROUTES.contact} />}
          >
            {copy.cta.requestAnOffer}
          </Button>
        </div>
      </div>
    </article>
  );
}

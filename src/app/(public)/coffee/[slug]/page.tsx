import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Bilingual } from "@/components/locale/bilingual";
import { MediaPlaceholder } from "@/components/public/media-placeholder";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { getPublicCoffeeBySlug } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public coffee detail (Feature 002 T015; sourcing dossier by Phase 5.5 UIF-028).
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
 * STATUS GATING — UNCHANGED BY THE VISUAL WORK
 * ============================================================================
 *
 * `getPublicCoffeeBySlug` returns `null` for a DRAFT or ARCHIVED record exactly as it does for a
 * slug that never existed, and both land on the same `notFound()`. An anonymous visitor therefore
 * cannot tell an unpublished coffee from a nonexistent one — no probing the catalogue for unreleased
 * content. `generateMetadata` resolves the same way, so a non-public slug leaks nothing through the
 * document head either. UIF-028 changed the composition around this logic and not the logic itself.
 *
 * ============================================================================
 * COMPOSITION
 * ============================================================================
 *
 * A dossier, not a heading over two definition lists: a forest identity band carries the coffee and
 * its commercial action against an arch-cropped media slot, the specification reads as one
 * attribute table rather than two competing columns, and the origin gets a real editorial panel that
 * routes onward instead of a row in a list. The rhythm — forest → page → cream → forest — is the
 * homepage's, so the dossier belongs to the same product.
 *
 * Record media stays `MediaPlaceholder`: MEDIA-01 is unresolved, and a repository photograph placed
 * here would assert that it depicts this specific coffee.
 *
 * Server Component; no client JavaScript.
 */

type PageProps = { params: Promise<{ slug: string }> };

/** Renders a value, or the honest "not specified" fallback — never a guess. */
function orNotSpecified(value: string | undefined | null): string {
  return value && value.trim() !== "" ? value : copy.coffee.detail.notSpecified;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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

  /** The four specification facts the public DTO carries. Nothing else is available to show. */
  const specifications = [
    { label: copy.coffee.detail.coffeeType, value: coffee.coffeeType?.name },
    { label: copy.coffee.detail.variety, value: coffee.variety?.name },
    { label: copy.coffee.detail.processingMethod, value: coffee.processingMethod?.name },
    { label: copy.coffee.detail.packaging, value: coffee.packagingType?.name },
  ] as const;

  return (
    <article>
      {/* ── IDENTITY ── the forest band, matching the homepage hero's ground and rhythm ── */}
      <section data-page-opener="dark" className="-mt-[var(--header-h)] bg-sidebar pt-[var(--header-h)] text-sidebar-foreground">
        <div className="hc-container grid gap-10 py-[clamp(2.5rem,6vw,5rem)] lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] lg:items-center lg:gap-16">
          <div className="flex flex-col items-start gap-5">
            <Link
              href={PUBLIC_ROUTES.coffee}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] text-[length:var(--text-small)] font-medium text-sidebar-foreground/75 underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-sidebar-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sidebar-ring)]"
            >
              <Icon name="chevron-left" className="size-4" />
              <Bilingual pick={(c) => c.coffee.detail.backToIndex} />
            </Link>

            <span className="hc-eyebrow text-[var(--gold-on-dark)]">
              {origin ? (
                <>
                  {origin.name}
                  {origin.countryCode ? ` · ${origin.countryCode}` : ""}
                </>
              ) : (
                <Bilingual pick={(c) => c.coffee.detail.identityEyebrow} />
              )}
            </span>

            <h1 className="font-heading text-[length:var(--text-h1)] font-semibold leading-[var(--lh-display)] tracking-[var(--tracking-display)] text-balance">
              {coffee.name}
            </h1>

            <span aria-hidden="true" className="h-px w-16 bg-[var(--gold-on-dark)]" />

            {coffee.description ? (
              <p className="hc-body-lg max-w-[52ch] text-sidebar-foreground/85 text-pretty">
                {coffee.description}
              </p>
            ) : null}

            <Button
              size="lg"
              variant="accent"
              className="mt-2"
              nativeButton={false}
              render={<Link href={PUBLIC_ROUTES.contact} />}
            >
              <Bilingual pick={(c) => c.cta.requestAnOffer} />
            </Button>
          </div>

          {/*
            Record media slot. MEDIA-01 keeps this a placeholder — the arch frame matches the
            homepage's editorial media treatment so the empty state still reads as designed rather
            than as something missing.
          */}
          <div className="overflow-hidden rounded-[var(--radius-arch)] border border-sidebar-border/70">
            <MediaPlaceholder aspectRatio="4 / 5" className="rounded-none border-0" />
          </div>
        </div>
      </section>

      {/* ── SPECIFICATION ── one attribute table, not two competing definition lists ── */}
      <section className="bg-background py-[clamp(3rem,6vw,5.5rem)] text-foreground">
        <div className="hc-container grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col gap-6">
            <h2 className="hc-heading-3 font-semibold">
              <Bilingual pick={(c) => c.coffee.detail.specHeading} />
            </h2>
            <dl className="flex flex-col border-t border-border">
              {specifications.map((spec) => (
                <div
                  key={spec.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-4 text-[length:var(--text-small)]"
                >
                  <dt className="text-muted-foreground">{spec.label}</dt>
                  <dd className="font-medium text-foreground">{orNotSpecified(spec.value)}</dd>
                </div>
              ))}
            </dl>

            {coffee.tags.length > 0 ? (
              <div className="flex flex-col gap-3 pt-2">
                <h3 className="hc-eyebrow text-muted-foreground">
                  <Bilingual pick={(c) => c.coffee.detail.tagsHeading} />
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {coffee.tags.map((tag) => (
                    <li
                      key={tag.slug}
                      className="rounded-[var(--radius-pill)] border border-border bg-card px-4 py-1.5 text-[length:var(--text-meta)] text-foreground"
                    >
                      {tag.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-10">
            {/* Origin connection — an editorial panel that routes onward, not a table row. */}
            <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-7">
              <h2 className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
                <Bilingual pick={(c) => c.coffee.detail.originConnectionHeading} />
              </h2>
              {origin ? (
                <>
                  <p className="font-heading text-[length:var(--text-h3)] font-semibold text-foreground">
                    {origin.name}
                  </p>
                  <dl className="flex flex-col border-t border-border">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 border-b border-border py-3 text-[length:var(--text-small)]">
                      <dt className="text-muted-foreground"><Bilingual pick={(c) => c.coffee.detail.region} /></dt>
                      <dd className="font-medium text-foreground">
                        {orNotSpecified(origin.region?.name)}
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 border-b border-border py-3 text-[length:var(--text-small)]">
                      <dt className="text-muted-foreground"><Bilingual pick={(c) => c.coffee.detail.country} /></dt>
                      <dd className="font-medium text-foreground">
                        {orNotSpecified(origin.countryCode)}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/origins/${origin.slug}/`}
                    className="mt-1 inline-flex min-h-11 items-center gap-2 self-start rounded-[var(--radius-sm)] text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 decoration-[var(--gold-on-light)] hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] dark:decoration-[var(--gold-on-dark)]"
                  >
                    <Bilingual pick={(c) => c.coffee.detail.originLinkAction} />
                    <Icon name="arrow-right" className="size-4" />
                  </Link>
                </>
              ) : (
                <p className="hc-small text-muted-foreground">
                  <Bilingual pick={(c) => c.coffee.detail.notSpecified} />
                </p>
              )}
            </div>

            {coffee.certifications.length > 0 ? (
              <div className="flex flex-col gap-4">
                <h2 className="hc-heading-3 font-semibold">
                  <Bilingual pick={(c) => c.coffee.detail.certificationsHeading} />
                </h2>
                <ul className="flex flex-col border-t border-border">
                  {coffee.certifications.map((certification) => (
                    <li
                      key={certification.name}
                      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-3 text-[length:var(--text-small)]"
                    >
                      <span className="font-medium text-foreground">{certification.name}</span>
                      {certification.expiresAt ? (
                        <span className="text-[length:var(--text-meta)] text-muted-foreground">
                          <Bilingual pick={(c) => c.coffee.detail.certificationValidUntil} />{" "}
                          <span dir="ltr">{certification.expiresAt}</span>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── TRACEABILITY ── the reviewed claim, on the cream band ── */}
      <section className="bg-secondary py-[clamp(3rem,6vw,5.5rem)] text-foreground">
        <div className="hc-container flex max-w-[54rem] flex-col gap-4">
          <h2 className="hc-heading-3 font-semibold">
            <Bilingual pick={(c) => c.coffee.detail.traceabilityHeading} />
          </h2>
          <p className="hc-body-lg text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.coffee.detail.traceabilityBody} />
          </p>
        </div>
      </section>

      {/* ── THE COMMERCIAL CONVERSATION THIS PAGE EXISTS TO START ── */}
      <section className="bg-sidebar text-sidebar-foreground">
        <div className="hc-container flex flex-col gap-8 py-[clamp(3rem,6vw,5.5rem)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-[46rem] flex-col gap-3">
            <h2 className="hc-heading-3 font-semibold">
              <Bilingual pick={(c) => c.coffee.detail.rfqHeading} />
            </h2>
            <p className="hc-body-lg text-sidebar-foreground/85 text-pretty">
              <Bilingual pick={(c) => c.coffee.detail.rfqLead} />
            </p>
          </div>
          <Button
            size="lg"
            variant="accent"
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

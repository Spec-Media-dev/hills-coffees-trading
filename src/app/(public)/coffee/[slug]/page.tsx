import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Bilingual, LocalizedContent, type CopySelector } from "@/components/locale/bilingual";
import { MediaGallery } from "@/components/media/media-gallery";
import { ReferencePriceStage } from "@/components/pricing/reference-price-section";
import { JsonLd } from "@/components/public/json-ld";
import { MediaPlaceholder } from "@/components/public/media-placeholder";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { getReferencePresentation } from "@/lib/pricing/presentation";
import { getPublicCoffeeBySlug, type PublicNamedRef } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import {
  buildBreadcrumbJsonLd,
  buildCoffeeJsonLd,
  buildJsonLdGraph,
  buildOrganizationJsonLd,
  serializeJsonLd,
} from "@/lib/public/seo";
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
 * warehouse or any private location, member listings, offers, executable/contract prices, commission
 * configuration, and order, payment or settlement data. (Reference market data IS shown — only ever
 * through Feature 011's presentation contract, which carries its own disclosure and licence gate.)
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
 * slug that never existed, and both land on the same `notFound()` — a real 404, never a fabricated
 * 301/308/410 the database cannot support (**LIFE-01**, T029). An anonymous visitor therefore cannot
 * tell an unpublished coffee from a nonexistent one — no probing the catalogue for unreleased
 * content. `generateMetadata` resolves the same way, so a non-public slug leaks nothing through the
 * document head either, and structured data (T025) is only ever built for a resolved, published
 * `coffee`. UIF-028 changed the composition around this logic and not the logic itself.
 *
 * ============================================================================
 * COMPOSITION (pre-Stripe hardening run redesign)
 * ============================================================================
 *
 * Identity band (forest): provenance, name, description, three hero facts, the commercial actions and
 * the MEDIA GALLERY — every published image in the admin's sort order, opening on the primary
 * ("primary outside, gallery inside"; cards elsewhere show only the primary). Specification as grouped
 * cards (coffee / processing & packaging / origin) plus certifications and characteristics. Then the
 * COMMERCIAL CONTEXT, which keeps Feature 011's four price concepts apart: reference market data
 * (licence-gated presentation contract, coffee-scoped differentials — information, never an offer),
 * the members-only statement for live seller offers (prices, quantities and warehouses stay inside
 * the Trading Portal — `coffee_offers` is not anonymous-readable and must not be), and the RFQ path
 * that produces a Hills commercial quote. No list price is shown because none exists in the model.
 *
 * Server Component; the gallery is the one client island (components/media/media-gallery.tsx).
 */

type PageProps = { params: Promise<{ slug: string }> };

/** A localized reference name, or the bilingual "not specified" fallback. */
function RefValue({ value }: { value: Pick<PublicNamedRef, "name" | "nameAr"> | null | undefined }) {
  if (!value || value.name.trim() === "") return <Bilingual pick={(c) => c.coffee.detail.notSpecified} />;
  return <LocalizedContent en={value.name} ar={value.nameAr} />;
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
  const canonical = canonicalUrl(`/coffee/${coffee.slug}/`);
  // Reference market data through Feature 011's licence-gated presentation contract, scoped to this
  // coffee's own differentials (FR: "general / one coffee / one origin, by slug"). Never throws.
  const reference = await getReferencePresentation({ kind: "coffee", slug: coffee.slug });

  // T025: structured data from the SAME DTO this page renders — see lib/public/seo.ts's header for
  // why no offer/rating/sku/brand field is emitted.
  const jsonLd = serializeJsonLd(
    buildJsonLdGraph([
      buildOrganizationJsonLd(copy.site.name, copy.site.tagline),
      buildCoffeeJsonLd(coffee, canonical),
      buildBreadcrumbJsonLd([
        { name: copy.site.name, url: canonicalUrl("/") },
        { name: copy.coffee.index.metaTitle, url: canonicalUrl("/coffee/") },
        { name: coffee.name, url: canonical },
      ]),
    ])
  );

  const alt = copy.coffee.detail.imageAlt.replace("{name}", coffee.name);
  const galleryImages = coffee.images.map((image) => ({ url: image.url, alt }));
  const primaryIndex = Math.max(0, coffee.images.findIndex((image) => image.isPrimary));

  /** The three spec groups — every value is a public DTO fact; missing values say so honestly. */
  const specGroups: readonly { key: string; heading: CopySelector; rows: readonly { key: string; label: CopySelector; value: PublicNamedRef | null }[] }[] = [
    {
      key: "identity",
      heading: (c) => c.coffee.detail.specIdentityHeading,
      rows: [
        { key: "coffeeType", label: (c) => c.coffee.detail.coffeeType, value: coffee.coffeeType },
        { key: "variety", label: (c) => c.coffee.detail.variety, value: coffee.variety },
      ],
    },
    {
      key: "processing",
      heading: (c) => c.coffee.detail.specProcessingHeading,
      rows: [
        { key: "processingMethod", label: (c) => c.coffee.detail.processingMethod, value: coffee.processingMethod },
        { key: "packaging", label: (c) => c.coffee.detail.packaging, value: coffee.packagingType },
      ],
    },
  ];

  const heroFacts: readonly { key: string; label: CopySelector; value: PublicNamedRef | null }[] = [
    { key: "coffeeType", label: (c) => c.coffee.detail.coffeeType, value: coffee.coffeeType },
    { key: "processingMethod", label: (c) => c.coffee.detail.processingMethod, value: coffee.processingMethod },
    { key: "variety", label: (c) => c.coffee.detail.variety, value: coffee.variety },
  ];

  return (
    <article data-coffee-detail>
      <JsonLd json={jsonLd} />

      {/* ── IDENTITY ── name, provenance, the gallery and the commercial action, in one composition ── */}
      <section data-page-opener="dark" className="relative isolate -mt-[var(--header-h)] overflow-hidden bg-[var(--hc-forest)] pt-[var(--header-h)] text-[#f2f5eb]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_80%_20%,rgba(164,72,25,0.16),transparent_70%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04] [background-image:radial-gradient(#EEE4D1_0.8px,transparent_0.8px)] [background-size:10px_10px]" />

        <div className="hc-container grid gap-10 py-[clamp(2rem,5vw,4.5rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-[clamp(2.5rem,5vw,5rem)]">
          <div className="flex min-w-0 flex-col items-start gap-5">
            <Link
              href={PUBLIC_ROUTES.coffee}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] text-[length:var(--text-small)] font-medium text-[rgba(242,245,235,0.85)] underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-[#ffffff] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)]"
            >
              <Icon name="chevron-left" data-directional-icon="true" className="size-4" />
              <Bilingual pick={(c) => c.coffee.detail.backToIndex} />
            </Link>

            <span className="hc-eyebrow flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold tracking-wider text-[var(--gold-on-dark)]" data-coffee-provenance>
              {origin ? (
                <>
                  <LocalizedContent en={origin.name} ar={origin.nameAr} />
                  {origin.region ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <LocalizedContent en={origin.region.name} ar={origin.region.nameAr} />
                    </>
                  ) : null}
                  {origin.countryCode ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span dir="ltr">{origin.countryCode}</span>
                    </>
                  ) : null}
                </>
              ) : (
                <Bilingual pick={(c) => c.coffee.detail.identityEyebrow} />
              )}
            </span>

            <h1 className="font-heading text-[clamp(2.5rem,1.8rem+3.4vw,5.25rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-balance text-[#ffffff] rtl:leading-[1.15] rtl:tracking-normal">
              <LocalizedContent en={coffee.name} ar={coffee.nameAr} />
            </h1>

            <span aria-hidden="true" className="h-0.5 w-16 bg-[var(--hc-accent)]" />

            {coffee.description ? (
              <p className="hc-body-lg max-w-[54ch] text-[rgba(242,245,235,0.9)] text-pretty">
                <LocalizedContent en={coffee.description} ar={coffee.descriptionAr} />
              </p>
            ) : null}

            <dl className="grid w-full max-w-[36rem] grid-cols-1 overflow-hidden rounded-[var(--radius-lg)] border border-[rgba(242,245,235,0.16)] min-[430px]:grid-cols-3" data-coffee-hero-facts>
              {heroFacts.map((fact) => (
                <div key={fact.key} className="flex flex-col gap-1 border-b border-[rgba(242,245,235,0.12)] bg-[rgba(8,24,18,0.28)] px-4 py-3 last:border-b-0 min-[430px]:border-b-0 min-[430px]:border-e min-[430px]:last:border-e-0">
                  <dt className="text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.12em] text-[rgba(242,245,235,0.62)] rtl:tracking-normal">
                    <Bilingual pick={fact.label} />
                  </dt>
                  <dd className="text-[length:var(--text-small)] font-semibold text-[#ffffff]">
                    <RefValue value={fact.value} />
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-1 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent justify-center">
                <Bilingual pick={(c) => c.cta.requestAnOffer} />
                <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
              </Link>
              <Link
                href="#commercial"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[rgba(242,245,235,0.28)] px-6 text-sm font-semibold text-[#f2f5eb] transition-colors duration-[var(--dur-fast)] hover:bg-[rgba(242,245,235,0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hc-accent)]"
              >
                <Bilingual pick={(c) => c.coffee.detail.heroCommercialLink} />
              </Link>
            </div>
          </div>

          {/*
            Media — "primary outside, gallery inside": EVERY published image, thumbnails in the admin's
            sort order, opening on the primary. With no image, the designed neutral placeholder (never
            a repository photograph that would claim to depict this coffee).
          */}
          <div className="min-w-0" data-coffee-media>
            {galleryImages.length > 0 ? (
              <MediaGallery
                images={galleryImages}
                initialIndex={primaryIndex}
                aspect="4 / 5"
                multiAspect="1 / 1"
                priority
                tone="dark"
                sizes="(min-width: 1024px) 42vw, 100vw"
                frameClassName="rounded-t-[min(12rem,40%)] rounded-b-[var(--radius-xl)] border border-[rgba(242,245,235,0.16)] bg-black/25 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
              />
            ) : (
              <div className="overflow-hidden rounded-t-[min(12rem,40%)] rounded-b-[var(--radius-xl)] border border-[rgba(242,245,235,0.18)] bg-black/20">
                <MediaPlaceholder aspectRatio="4 / 5" className="rounded-none border-0" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── SPECIFICATION ── grouped cards, not an admin table ── */}
      <section className="bg-background py-[clamp(3.5rem,7vw,6.5rem)] text-foreground" aria-labelledby="coffee-spec-heading">
        <div className="hc-container flex flex-col gap-10">
          <div className="flex max-w-[48rem] flex-col gap-3">
            <h2 id="coffee-spec-heading" className="font-heading text-[clamp(1.9rem,1.5rem+1.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em] rtl:tracking-normal">
              <Bilingual pick={(c) => c.coffee.detail.specHeading} />
            </h2>
            <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.coffee.detail.specLead} />
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2" data-coffee-spec>
            {specGroups.map((group) => (
              <div key={group.key} className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 transition-[border-color,box-shadow] duration-[var(--dur-fast)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] motion-reduce:transition-none" data-spec-group={group.key}>
                <h3 className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                  <Bilingual pick={group.heading} />
                </h3>
                <dl className="flex flex-col divide-y divide-border">
                  {group.rows.map((row) => (
                    <div key={row.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                      <dt className="text-[length:var(--text-meta)] text-muted-foreground">
                        <Bilingual pick={row.label} />
                      </dt>
                      <dd className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold leading-snug text-foreground">
                        <RefValue value={row.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}

            <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-[var(--hc-forest)] p-6 text-[#f2f5eb] sm:p-7 md:col-span-2" data-spec-group="origin">
              <h3 className="hc-eyebrow text-[var(--gold-on-dark)]">
                <Bilingual pick={(c) => c.coffee.detail.specOriginHeading} />
              </h3>
              {origin ? (
                <>
                  <dl className="grid gap-y-3 divide-y divide-[rgba(242,245,235,0.14)] sm:grid-cols-3 sm:gap-x-8 sm:divide-y-0">
                    <div className="flex flex-col gap-1 pb-3 sm:pb-0">
                      <dt className="text-[length:var(--text-meta)] text-[rgba(242,245,235,0.7)]">
                        <Bilingual pick={(c) => c.coffee.detail.originLabel} />
                      </dt>
                      <dd className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold leading-snug">
                        <LocalizedContent en={origin.name} ar={origin.nameAr} />
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1 pb-3 pt-0 sm:border-s sm:border-[rgba(242,245,235,0.14)] sm:ps-8 sm:pb-0">
                      <dt className="text-[length:var(--text-meta)] text-[rgba(242,245,235,0.7)]">
                        <Bilingual pick={(c) => c.coffee.detail.region} />
                      </dt>
                      <dd className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold leading-snug">
                        <RefValue value={origin.region} />
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1 pt-0 sm:border-s sm:border-[rgba(242,245,235,0.14)] sm:ps-8">
                      <dt className="text-[length:var(--text-meta)] text-[rgba(242,245,235,0.7)]">
                        <Bilingual pick={(c) => c.coffee.detail.country} />
                      </dt>
                      <dd className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold leading-snug">
                        {origin.countryCode && origin.countryCode.trim() !== "" ? <span dir="ltr">{origin.countryCode}</span> : <Bilingual pick={(c) => c.coffee.detail.notSpecified} />}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/origins/${origin.slug}/`}
                    className="mt-auto inline-flex min-h-11 items-center gap-2 self-start rounded-[var(--radius-sm)] text-[length:var(--text-small)] font-semibold text-[#f2f5eb] underline decoration-[var(--gold-on-dark)] underline-offset-4 hover:decoration-[#f2f5eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]"
                  >
                    <Bilingual pick={(c) => c.coffee.detail.originLinkAction} />
                    <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
                  </Link>
                </>
              ) : (
                <p className="text-[length:var(--text-small)] text-[rgba(242,245,235,0.8)]">
                  <Bilingual pick={(c) => c.coffee.detail.notSpecified} />
                </p>
              )}
            </div>
          </div>

          {coffee.certifications.length > 0 || coffee.tags.length > 0 ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {coffee.certifications.length > 0 ? (
                <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6" data-coffee-certifications>
                  <h3 className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                    <Bilingual pick={(c) => c.coffee.detail.certificationsHeading} />
                  </h3>
                  <ul className="flex flex-col divide-y divide-border">
                    {coffee.certifications.map((certification) => (
                      <li key={certification.name} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
                        <span className="flex items-center gap-2 font-semibold text-foreground">
                          <Icon name="badge-check" className="size-4 shrink-0 text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]" aria-hidden="true" />
                          <span lang="en" dir="ltr">
                            {certification.name}
                          </span>
                        </span>
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
              {coffee.tags.length > 0 ? (
                <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6" data-coffee-tags>
                  <h3 className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
                    <Bilingual pick={(c) => c.coffee.detail.tagsHeading} />
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {coffee.tags.map((tag) => (
                      <li key={tag.slug} className="rounded-[var(--radius-pill)] border border-border bg-background px-4 py-1.5 text-[length:var(--text-meta)] font-medium text-foreground">
                        <LocalizedContent en={tag.name} ar={tag.nameAr} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── COMMERCIAL CONTEXT ── reference data (information only) kept apart from offers and quotes ── */}
      <section id="commercial" className="scroll-mt-[calc(var(--header-h)+1rem)] bg-secondary py-[clamp(3.5rem,7vw,6.5rem)] text-foreground" aria-labelledby="coffee-commercial-heading">
        <div className="hc-container flex flex-col gap-10">
          <div className="flex max-w-[50rem] flex-col items-start gap-3">
            <span className="hc-eyebrow text-[var(--hc-accent)] dark:text-[var(--gold-on-dark)]">
              <Bilingual pick={(c) => c.coffee.detail.commercialEyebrow} />
            </span>
            <h2 id="coffee-commercial-heading" className="font-heading text-[clamp(1.9rem,1.5rem+1.8vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em] rtl:tracking-normal">
              <Bilingual pick={(c) => c.coffee.detail.commercialTitle} />
            </h2>
            <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
              <Bilingual pick={(c) => c.coffee.detail.commercialLead} />
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4" data-coffee-reference>
              <div className="flex flex-col gap-1">
                <h3 className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
                  <Bilingual pick={(c) => c.coffee.detail.referenceHeading} />
                </h3>
                <p className="text-[length:var(--text-small)] text-muted-foreground">
                  <Bilingual pick={(c) => c.coffee.detail.referenceNote} />
                </p>
              </div>
              <ReferencePriceStage presentation={reference} />
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] bg-[var(--hc-forest)] p-6 text-[#f2f5eb] sm:p-7" data-coffee-offers="members-only">
                <span className="grid size-10 place-items-center rounded-full bg-[rgba(242,245,235,0.1)] text-[var(--gold-on-dark)]">
                  <Icon name="key-round" className="size-5" aria-hidden="true" />
                </span>
                <h3 className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
                  <Bilingual pick={(c) => c.coffee.detail.offersHeading} />
                </h3>
                <p className="text-[length:var(--text-small)] leading-[1.7] text-[rgba(242,245,235,0.85)] text-pretty">
                  <Bilingual pick={(c) => c.coffee.detail.offersBody} />
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Link href="/sign-in/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#f2f5eb] px-5 text-sm font-semibold text-[var(--hc-forest)] transition-colors duration-[var(--dur-fast)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]">
                    <Bilingual pick={(c) => c.coffee.detail.offersSignIn} />
                  </Link>
                  <Link href={PUBLIC_ROUTES.portalEntry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[rgba(242,245,235,0.3)] px-5 text-sm font-semibold text-[#f2f5eb] transition-colors duration-[var(--dur-fast)] hover:bg-[rgba(242,245,235,0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-on-dark)]">
                    <Bilingual pick={(c) => c.coffee.detail.offersApply} />
                  </Link>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7" data-coffee-rfq>
                <h3 className="font-heading text-[length:var(--text-h4,1.35rem)] font-semibold">
                  <Bilingual pick={(c) => c.coffee.detail.rfqCardHeading} />
                </h3>
                <p className="text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty">
                  <Bilingual pick={(c) => c.coffee.detail.rfqCardBody} />
                </p>
                <Link href={PUBLIC_ROUTES.contact} className="hc-btn-accent self-start">
                  <Bilingual pick={(c) => c.cta.requestAnOffer} />
                  <Icon name="arrow-right" data-directional-icon="true" className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRACEABILITY ── the reviewed claim, closing the dossier ── */}
      <section className="bg-background py-[clamp(3rem,6vw,5rem)] text-foreground">
        <div className="hc-container grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <h2 className="font-heading text-[clamp(1.6rem,1.3rem+1.2vw,2.4rem)] font-semibold leading-[1.1]">
            <Bilingual pick={(c) => c.coffee.detail.traceabilityHeading} />
          </h2>
          <p className="hc-body-lg text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.coffee.detail.traceabilityBody} />
          </p>
        </div>
      </section>
    </article>
  );
}

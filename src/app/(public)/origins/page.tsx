import type { Metadata } from "next";
import Link from "next/link";

import { Bilingual } from "@/components/locale/bilingual";
import { JsonLd } from "@/components/public/json-ld";
import { PUBLIC_ROUTES } from "@/components/public/routes";
import { Icon } from "@/components/ui/icon";
import { copy } from "@/lib/public/copy";
import { getPublicOriginIndex } from "@/lib/public/origins";
import {
  buildBreadcrumbJsonLd,
  buildJsonLdGraph,
  buildOrganizationJsonLd,
  buildWebPageJsonLd,
  serializeJsonLd,
} from "@/lib/public/seo";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public origin index (Feature 002 T016; editorial treatment by Phase 5.5 UIF-029).
 *
 * Served at `/origins/`. Only `ACTIVE` origins can appear: the status gate lives in the read layer's
 * query and in RLS, so an `INACTIVE` or `ARCHIVED` origin cannot reach this listing from here.
 *
 * Data comes from Block A's cached public read layer — a public-shared cache entry that never varies
 * by user, session or organization, and this page never resolves a request identity.
 *
 * ── PLACE-LED, NOT DATABASE-LED ──────────────────────────────────────────────────────────────────
 *
 * An editorial roster rather than a card grid. Each origin is a full-width row: the country code set
 * large and quiet as a place marker, the name in the display face, the region as an overline, and
 * the approved description given room to actually read. Rows are separated by hairlines, so the page
 * scans as a gazetteer of producing regions instead of a wall of identical boxes — and it is
 * structurally different from `/coffee/`'s grid, which is the point.
 *
 * `description` is approved public copy that the previous card grid discarded; it is the single
 * thing that makes this read as sourcing rather than as a list of country names.
 *
 * No image appears. MEDIA-01 is unresolved, and the repository's `origin-*.jpg` files match some
 * origin names only by coincidence of the asset pack — mapping them by slug or name is exactly what
 * UIF-029 forbids.
 *
 * `generateMetadata` lives in this same file so metadata and route cannot drift apart.
 *
 * Server Component; no client JavaScript.
 */

const PATH = "/origins/";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = canonicalUrl(PATH);

  return {
    title: copy.origins.index.metaTitle,
    description: copy.origins.index.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: copy.site.name,
      title: copy.origins.index.metaTitle,
      description: copy.origins.index.metaDescription,
    },
  };
}

export default async function OriginsIndexPage() {
  const origins = await getPublicOriginIndex();
  const canonical = canonicalUrl(PATH);

  const jsonLd = serializeJsonLd(
    buildJsonLdGraph([
      buildOrganizationJsonLd(copy.site.name, copy.site.tagline),
      buildWebPageJsonLd({
        name: copy.origins.index.metaTitle,
        description: copy.origins.index.metaDescription,
        url: canonical,
        isCollection: true,
      }),
      buildBreadcrumbJsonLd([
        { name: copy.site.name, url: canonicalUrl("/") },
        { name: copy.origins.index.metaTitle, url: canonical },
      ]),
    ])
  );

  return (
    <>
      <JsonLd json={jsonLd} />
      {/* Page opening — the same forest band the coffee index uses, so the two indexes are siblings. */}
      <section data-page-opener="dark" className="-mt-[var(--header-h)] bg-sidebar pt-[var(--header-h)] text-sidebar-foreground">
        <div className="hc-container flex flex-col gap-5 py-[clamp(3rem,6vw,5.5rem)]">
          <span className="hc-eyebrow text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.origins.index.eyebrow} />
          </span>
          <h1 className="font-heading text-[length:var(--text-h1)] font-semibold leading-[var(--lh-display)] tracking-[var(--tracking-display)] text-balance">
            <Bilingual pick={(c) => c.origins.index.title} />
          </h1>
          <span aria-hidden="true" className="h-px w-16 bg-[var(--gold-on-dark)]" />
          <p className="hc-body-lg max-w-[58ch] text-sidebar-foreground/85 text-pretty">
            <Bilingual pick={(c) => c.origins.index.lead} />
          </p>
        </div>
      </section>

      <section className="bg-background py-[clamp(3rem,6vw,6rem)] text-foreground">
        <div className="hc-container">
          {origins.length > 0 ? (
            <ul className="flex flex-col border-t border-border">
              {origins.map((origin) => (
                <li key={origin.slug} className="group border-b border-border">
                  <Link
                    href={`/origins/${origin.slug}/`}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2 py-8 transition-colors duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:gap-x-10 lg:py-10"
                  >
                    {/*
                      Country code as the place marker. `dir="ltr"` because an ISO code is a Latin
                      reference token and stays LTR inside an RTL layout (contract §12).
                    */}
                    <span
                      dir="ltr"
                      aria-hidden="true"
                      className="w-[3.5ch] font-heading text-[length:var(--text-h3)] font-semibold leading-tight text-[var(--gold-on-light)] transition-colors duration-[var(--dur-fast)] dark:text-[var(--gold-on-dark)]"
                    >
                      {origin.countryCode ?? "—"}
                    </span>

                    <span className="flex flex-col gap-2">
                      {origin.region ? (
                        <span className="hc-eyebrow text-muted-foreground">
                          {origin.region.name}
                        </span>
                      ) : null}
                      <span className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] text-foreground">
                        {origin.name}
                      </span>
                      {origin.description ? (
                        <span className="max-w-[62ch] text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty">
                          {origin.description}
                        </span>
                      ) : null}
                    </span>

                    <span
                      aria-hidden="true"
                      className="mt-1 inline-flex size-11 items-center justify-center rounded-[var(--radius-pill)] border border-border text-muted-foreground transition-colors duration-[var(--dur-fast)] group-hover:border-[var(--border-strong)] group-hover:text-foreground"
                    >
                      <Icon name="arrow-right" className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="max-w-[52ch] hc-body text-muted-foreground">
              <Bilingual pick={(c) => c.origins.index.empty} />
            </p>
          )}

          <div className="mt-12 flex">
            <Link
              href={PUBLIC_ROUTES.coffee}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 decoration-[var(--gold-on-light)] hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] dark:decoration-[var(--gold-on-dark)]"
            >
              <Bilingual pick={(c) => c.origins.detail.exploreCoffee} />
              <Icon name="arrow-right" className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

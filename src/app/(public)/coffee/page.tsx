import type { Metadata } from "next";

import { Bilingual } from "@/components/locale/bilingual";
import { CatalogueFilter } from "@/components/public/catalogue-filter";
import { JsonLd } from "@/components/public/json-ld";
import { OpeningStats } from "@/components/public/opening-stats";
import { PageOpening } from "@/components/public/page-opening";
import { getPublicCoffeeIndex } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import {
  buildBreadcrumbJsonLd,
  buildJsonLdGraph,
  buildOrganizationJsonLd,
  buildWebPageJsonLd,
  serializeJsonLd,
} from "@/lib/public/seo";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public coffee index (Feature 002 T014; visual completion by Phase 5.5 UIF-027 + UIF-030).
 *
 * Served at `/coffee/` — the `(public)` directory is a route *group*, so it contributes no URL
 * segment. Only `PUBLISHED` coffees can appear: the status gate lives in the read layer's query and
 * in RLS, not in this page, so there is no way to render a draft from here.
 *
 * Data comes from Block A's cached public read layer. Repeat requests inside the TTL are served from
 * the same `unstable_cache` entry rather than re-querying, and that entry is public-shared — it does
 * not vary by user, session or organization, and this page never resolves a request identity.
 *
 * ── STILL EXACTLY ONE INDEXABLE URL ──────────────────────────────────────────────────────────────
 *
 * The route reads no `searchParams`. UIF-030's filtering is entirely client-side state, so it
 * generates no query-string permutations for a crawler to find, and this page stays **statically
 * prerendered** — reading search params here would have made it dynamic and damaged the Feature-001
 * cache architecture.
 *
 * ── COMPOSITION ──────────────────────────────────────────────────────────────────────────────────
 *
 * A forest opening band carries the page identity, exactly as the homepage hero does, and the
 * catalogue itself sits on the page ground below it. That gives `/coffee/` the same forest→cream
 * rhythm the homepage established instead of dropping straight into a bare card grid under a
 * heading.
 *
 * `generateMetadata` lives in this same file, as the task requires — metadata and the route it
 * describes stay in one place so they cannot drift.
 *
 * Server Component. The only client JavaScript is the `CatalogueFilter` island, which receives the
 * already-fetched public DTO and nothing else.
 */

const PATH = "/coffee/";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = canonicalUrl(PATH);

  return {
    title: copy.coffee.index.metaTitle,
    description: copy.coffee.index.metaDescription,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: copy.site.name,
      title: copy.coffee.index.metaTitle,
      description: copy.coffee.index.metaDescription,
    },
  };
}

export default async function CoffeeIndexPage() {
  const coffees = await getPublicCoffeeIndex();
  const canonical = canonicalUrl(PATH);

  // T025: structured data from the SAME data this page renders — no separate SEO query.
  const jsonLd = serializeJsonLd(
    buildJsonLdGraph([
      buildOrganizationJsonLd(copy.site.name, copy.site.tagline),
      buildWebPageJsonLd({
        name: copy.coffee.index.metaTitle,
        description: copy.coffee.index.metaDescription,
        url: canonical,
        isCollection: true,
      }),
      buildBreadcrumbJsonLd([
        { name: copy.site.name, url: canonicalUrl("/") },
        { name: copy.coffee.index.metaTitle, url: canonical },
      ]),
    ])
  );

  return (
    <>
      <JsonLd json={jsonLd} />
      <PageOpening
        tone="forest"
        eyebrow={<Bilingual pick={(c) => c.coffee.index.eyebrow} />}
        title={<Bilingual pick={(c) => c.coffee.index.title} />}
        lead={<Bilingual pick={(c) => c.coffee.index.lead} />}
        aside={
          coffees.length > 0 ? (
            <OpeningStats
              items={[
                { key: "coffees", label: <Bilingual pick={(c) => c.coffee.index.statCoffees} />, value: coffees.length },
                { key: "origins", label: <Bilingual pick={(c) => c.coffee.index.statOrigins} />, value: new Set(coffees.flatMap((coffee) => (coffee.origin ? [coffee.origin.slug] : []))).size },
                { key: "processes", label: <Bilingual pick={(c) => c.coffee.index.statProcesses} />, value: new Set(coffees.flatMap((coffee) => (coffee.processingMethod ? [coffee.processingMethod.slug] : []))).size },
              ]}
            />
          ) : undefined
        }
      />

      <section className="bg-background py-[clamp(3rem,6vw,6rem)] text-foreground">
        <div className="hc-container">
          {coffees.length > 0 ? (
            <CatalogueFilter coffees={coffees} />
          ) : (
            // Honest empty state: the catalogue is genuinely empty, and saying so beats an invented
            // row. No filter chrome renders over nothing.
            <p className="max-w-[52ch] hc-body text-muted-foreground">
              <Bilingual pick={(c) => c.coffee.index.empty} />
            </p>
          )}
        </div>
      </section>
    </>
  );
}

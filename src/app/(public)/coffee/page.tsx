import type { Metadata } from "next";

import { CoffeeCard } from "@/components/public/coffee-card";
import { Section } from "@/components/public/section";
import { getPublicCoffeeIndex } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Public coffee index (Feature 002, T014 — FR-002, FR-004, FR-006, FR-010, SC-001).
 *
 * Served at `/coffee/` — the `(public)` directory is a route *group*, so it contributes no URL
 * segment. Only `PUBLISHED` coffees can appear: the status gate lives in the read layer's query and
 * in RLS, not in this page, so there is no way to render a draft from here.
 *
 * Data comes from Block A's cached public read layer. Repeat requests inside the TTL are served from
 * the same `unstable_cache` entry rather than re-querying, and that entry is public-shared — it does
 * not vary by user, session or organization, and this page never resolves a request identity.
 *
 * NO FILTER OR SORT PARAMETERS. The route accepts no query string, so it cannot generate the thin,
 * near-duplicate filter permutations the SEO contract warns about; there is exactly one indexable
 * URL for this listing.
 *
 * `generateMetadata` lives in this same file, as the task requires — metadata and the route it
 * describes stay in one place so they cannot drift.
 *
 * Server Component; no client JavaScript.
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

  return (
    <Section
      tone="page"
      titleAs="h1"
      eyebrow={copy.coffee.index.eyebrow}
      title={copy.coffee.index.title}
      lead={copy.coffee.index.lead}
    >
      {coffees.length > 0 ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {coffees.map((coffee) => (
            <CoffeeCard key={coffee.slug} coffee={coffee} />
          ))}
        </ul>
      ) : (
        // Honest empty state: the catalogue is genuinely empty, and saying so beats an invented row.
        <p className="max-w-[52ch] text-[0.9375rem] leading-[1.6] text-muted-foreground">
          {copy.coffee.index.empty}
        </p>
      )}
    </Section>
  );
}

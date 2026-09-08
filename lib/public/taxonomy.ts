import { unstable_cache } from "next/cache";

import {
  newCacheStamp,
  TAG_PUBLIC_TAXONOMY,
  TAXONOMY_REVALIDATE_SECONDS,
  type CacheStamp,
  type Stamped,
} from "@/lib/public/cache";
import { createPublicReadClient } from "@/lib/public/supabase";

/**
 * Public taxonomy / reference reads (Feature 002, T009 — FR-003, FR-010).
 *
 * The narrowest allowlist in the public read layer: **`name` and `slug` only**, from the five
 * reference tables. Nothing else in these tables is published — not internal identifiers, not
 * staff-identity columns, not bookkeeping timestamps (`contracts/public-dto-allowlist.md` §2).
 *
 * These tables are anonymously readable in full under RLS. That is precisely why the allowlist
 * matters: RLS readability is not publication authority, and the `select()` below is the boundary.
 *
 * This is slow-changing reference data, so it carries the longest TTL ceiling in the register
 * (86400s). As everywhere in this layer, the cache API is Feature 001's pinned
 * `unstable_cache(fn, keyParts, { tags, revalidate })`, and no entry varies by user (SEC-002).
 */

/** A reference record, reduced to the two fields a visitor may see. */
export type PublicTaxonomyEntry = {
  name: string;
  slug: string;
};

/** The complete public taxonomy, grouped by reference table. */
export type PublicTaxonomy = {
  coffeeTypes: PublicTaxonomyEntry[];
  varieties: PublicTaxonomyEntry[];
  processingMethods: PublicTaxonomyEntry[];
  packagingTypes: PublicTaxonomyEntry[];
  tags: PublicTaxonomyEntry[];
};

/** The single allowlist applied to every reference table below. */
const NAME_AND_SLUG = "name, slug";

/** The reference tables this feature publishes, paired with their DTO key. */
const TAXONOMY_TABLES = [
  { table: "coffee_types", key: "coffeeTypes" },
  { table: "coffee_varieties", key: "varieties" },
  { table: "processing_methods", key: "processingMethods" },
  { table: "packaging_types", key: "packagingTypes" },
  { table: "tags", key: "tags" },
] as const satisfies readonly {
  table: string;
  key: keyof PublicTaxonomy;
}[];

type TaxonomyRow = { name: string; slug: string };

async function fetchTaxonomy(): Promise<PublicTaxonomy> {
  const supabase = createPublicReadClient();

  const results = await Promise.all(
    TAXONOMY_TABLES.map(async ({ table }) => {
      const { data, error } = await supabase
        .from(table)
        .select(NAME_AND_SLUG)
        .order("name", { ascending: true });

      if (error) throw new Error("Public taxonomy read failed.");

      // Field-by-field, never a spread: only `name` and `slug` can ever leave this function.
      return (data as unknown as TaxonomyRow[]).map((row) => ({
        name: row.name,
        slug: row.slug,
      }));
    })
  );

  const taxonomy: PublicTaxonomy = {
    coffeeTypes: [],
    varieties: [],
    processingMethods: [],
    packagingTypes: [],
    tags: [],
  };

  TAXONOMY_TABLES.forEach(({ key }, index) => {
    taxonomy[key] = results[index];
  });

  return taxonomy;
}

const cachedTaxonomy = unstable_cache(
  async (): Promise<Stamped<PublicTaxonomy>> => ({
    stamp: newCacheStamp(),
    value: await fetchTaxonomy(),
  }),
  ["public-taxonomy"],
  { tags: [TAG_PUBLIC_TAXONOMY], revalidate: TAXONOMY_REVALIDATE_SECONDS }
);

/** The complete public taxonomy — `name` and `slug` only, per reference table. */
export async function getPublicTaxonomy(): Promise<PublicTaxonomy> {
  return (await cachedTaxonomy()).value;
}

/** Reads the provenance stamp of the taxonomy cache entry. TEST/DIAGNOSTIC ONLY (cache §5.2). */
export async function __readTaxonomyCacheStamp(): Promise<CacheStamp> {
  return (await cachedTaxonomy()).stamp;
}

/**
 * The uncached taxonomy read — same queries, same allowlist, same mapping. TEST-ONLY.
 *
 * `unstable_cache` needs Next.js's incremental-cache context, which a bare Vitest process does not
 * have. Cache behaviour is proven separately against a real running server (T031).
 */
export async function __fetchTaxonomyUncached(): Promise<PublicTaxonomy> {
  return fetchTaxonomy();
}

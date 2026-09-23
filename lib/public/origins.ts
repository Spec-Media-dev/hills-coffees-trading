import { unstable_cache } from "next/cache";

import {
  CATALOGUE_REVALIDATE_SECONDS,
  newCacheStamp,
  TAG_PUBLIC_ORIGINS,
  tagPublicOrigin,
  type CacheStamp,
  type Stamped,
} from "@/lib/public/cache";
import { createPublicReadClient } from "@/lib/public/supabase";

/**
 * Public origin reads (Feature 002, T008 — FR-003, FR-005, FR-010).
 *
 * Same discipline as the coffee read layer, over a smaller table set:
 *
 *   - explicit column allowlist in every `select()`, including nested joins;
 *   - no `select("*")` and no implicit-all select;
 *   - no raw database row is ever spread into a DTO;
 *   - the parent origin and the region resolve to `name` + `slug`, never a raw identifier;
 *   - internal bookkeeping columns and staff identity columns are never selected at all.
 *
 * STATUS GATE (FR-005): only `ACTIVE` origins are public. `INACTIVE` and `ARCHIVED` return `null`,
 * indistinguishable from an unknown slug, so an anonymous visitor cannot learn that a withdrawn
 * origin exists.
 *
 * Caching is Feature 001's pinned API, unchanged, and no entry varies by user (SEC-002).
 */

// ---------------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------------

/** A region, reduced to what a visitor may see. */
export type PublicRegion = {
  name: string;
  /** Arabic name, or `null` (English `name` is the fallback). */
  nameAr: string | null;
  slug: string;
  countryCode: string | null;
};

/** An origin as it appears in the public index listing. */
export type PublicOriginSummary = {
  name: string;
  /** Arabic name/description from `origin_translations` (`locale = 'ar'`), or `null`. */
  nameAr: string | null;
  slug: string;
  description: string | null;
  descriptionAr: string | null;
  countryCode: string | null;
  region: PublicRegion | null;
};

/** An origin as it appears on its own public detail page. */
export type PublicOriginDetail = PublicOriginSummary & {
  /** The parent origin, resolved to its public identity — never a raw reference. */
  parent: { name: string; slug: string } | null;
};

// ---------------------------------------------------------------------------
// Column allowlists
// ---------------------------------------------------------------------------

const SUMMARY_COLUMNS = `
  name,
  slug,
  description,
  country_code,
  origin_translations ( locale, name, description ),
  regions ( name, slug, country_code )
`;

/** Second, fault-tolerant read: Arabic region names by origin slug (table added by migration 20260923120000). */
const REGION_TRANSLATION_COLUMNS = `
  slug,
  regions ( region_translations ( locale, name ) )
`;

/**
 * `parent_origin_id` is a SELF-reference on `origins`, so the embed must say which direction to
 * follow. Naming the **foreign-key column** (`parent:parent_origin_id`) resolves the many-to-one
 * side and returns a single parent object or `null`.
 *
 * The two obvious alternatives are both wrong here, and silently so:
 *   - `parent:origins(…)` resolves the *reverse* direction and returns an array of children — an
 *     empty `[]` for a root origin, which looks like "no parent" but means something else entirely;
 *   - `parent:origins!origins_parent_origin_id_fkey(…)` is rejected outright with
 *     `PGRST200 Could not find a relationship between 'origins' and 'origins'`.
 */
const DETAIL_COLUMNS = `
  ${SUMMARY_COLUMNS},
  parent:parent_origin_id ( name, slug )
`;

/** The only status an anonymous visitor may ever see (FR-005). */
const ACTIVE = "ACTIVE";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

type RegionRow = {
  name: string;
  slug: string;
  country_code: string | null;
} | null;

type TranslationsRow = { locale: string; name: string; description?: string | null }[] | null;

type SummaryRow = {
  name: string;
  slug: string;
  description: string | null;
  country_code: string | null;
  origin_translations: TranslationsRow;
  regions: RegionRow;
};

type DetailRow = SummaryRow & {
  parent: { name: string; slug: string } | null;
};

// ---------------------------------------------------------------------------
// Mappers — explicit field-by-field, never a spread
// ---------------------------------------------------------------------------

/** The Arabic row's non-blank value for one field, or `null` — never the English value. */
function arabic(rows: TranslationsRow, field: "name" | "description"): string | null {
  const value = (rows ?? []).find((translation) => translation.locale === "ar")?.[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toRegion(row: RegionRow, nameAr: string | null): PublicRegion | null {
  if (!row) return null;
  return { name: row.name, nameAr, slug: row.slug, countryCode: row.country_code };
}

function toSummary(row: SummaryRow, regionAr: string | null): PublicOriginSummary {
  return {
    name: row.name,
    nameAr: arabic(row.origin_translations, "name"),
    slug: row.slug,
    description: row.description,
    descriptionAr: arabic(row.origin_translations, "description"),
    countryCode: row.country_code,
    region: toRegion(row.regions, regionAr),
  };
}

function toDetail(row: DetailRow, regionAr: string | null): PublicOriginDetail {
  return {
    name: row.name,
    nameAr: arabic(row.origin_translations, "name"),
    slug: row.slug,
    description: row.description,
    descriptionAr: arabic(row.origin_translations, "description"),
    countryCode: row.country_code,
    region: toRegion(row.regions, regionAr),
    parent: row.parent ? { name: row.parent.name, slug: row.parent.slug } : null,
  };
}

// ---------------------------------------------------------------------------
// Uncached fetchers
// ---------------------------------------------------------------------------

/** Arabic region names by origin slug. Any failure (e.g. table not yet migrated) → empty map. */
async function fetchRegionArabic(slug?: string): Promise<Map<string, string | null>> {
  const supabase = createPublicReadClient();
  let query = supabase.from("origins").select(REGION_TRANSLATION_COLUMNS).eq("status", ACTIVE);
  if (slug) query = query.eq("slug", slug);
  const { data, error } = await query;
  const out = new Map<string, string | null>();
  if (error || !data) return out;
  type Row = { slug: string; regions: { region_translations: TranslationsRow } | null };
  for (const row of data as unknown as Row[]) out.set(row.slug, arabic(row.regions?.region_translations ?? null, "name"));
  return out;
}

async function fetchOriginIndex(): Promise<PublicOriginSummary[]> {
  const supabase = createPublicReadClient();
  const { data, error } = await supabase
    .from("origins")
    .select(SUMMARY_COLUMNS)
    .eq("status", ACTIVE)
    .order("name", { ascending: true });

  if (error) throw new Error("Public origin index read failed.");

  const regionArabic = await fetchRegionArabic();
  return (data as unknown as SummaryRow[]).map((row) => toSummary(row, regionArabic.get(row.slug) ?? null));
}

async function fetchOriginDetail(
  slug: string
): Promise<PublicOriginDetail | null> {
  const supabase = createPublicReadClient();
  const { data, error } = await supabase
    .from("origins")
    .select(DETAIL_COLUMNS)
    .eq("status", ACTIVE)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error("Public origin detail read failed.");
  if (!data) return null;

  const row = data as unknown as DetailRow;
  const regionArabic = await fetchRegionArabic(row.slug);
  return toDetail(row, regionArabic.get(row.slug) ?? null);
}

// ---------------------------------------------------------------------------
// Cached entries
// ---------------------------------------------------------------------------

const cachedOriginIndex = unstable_cache(
  async (): Promise<Stamped<PublicOriginSummary[]>> => ({
    stamp: newCacheStamp(),
    value: await fetchOriginIndex(),
  }),
  ["public-origin-index"],
  { tags: [TAG_PUBLIC_ORIGINS], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);

function cachedOriginDetail(slug: string) {
  return unstable_cache(
    async (): Promise<Stamped<PublicOriginDetail | null>> => ({
      stamp: newCacheStamp(),
      value: await fetchOriginDetail(slug),
    }),
    ["public-origin-detail", slug],
    {
      tags: [TAG_PUBLIC_ORIGINS, tagPublicOrigin(slug)],
      revalidate: CATALOGUE_REVALIDATE_SECONDS,
    }
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Every active origin, ordered by name. */
export async function getPublicOriginIndex(): Promise<PublicOriginSummary[]> {
  return (await cachedOriginIndex()).value;
}

/** One active origin, or `null` when the slug is unknown **or** the origin is not `ACTIVE`. */
export async function getPublicOriginBySlug(
  slug: string
): Promise<PublicOriginDetail | null> {
  return (await cachedOriginDetail(slug)()).value;
}

// ---------------------------------------------------------------------------
// Test-only accessors (cache contract §5.2)
// ---------------------------------------------------------------------------

/** Reads the provenance stamp of the origin-index cache entry. TEST/DIAGNOSTIC ONLY. */
export async function __readOriginIndexCacheStamp(): Promise<CacheStamp> {
  return (await cachedOriginIndex()).stamp;
}

/** Reads the provenance stamp of one origin-detail cache entry. TEST/DIAGNOSTIC ONLY. */
export async function __readOriginDetailCacheStamp(
  slug: string
): Promise<CacheStamp> {
  return (await cachedOriginDetail(slug)()).stamp;
}

/**
 * The uncached index read — same query, same allowlist, same mapper. TEST-ONLY.
 *
 * `unstable_cache` needs Next.js's incremental-cache context, which a bare Vitest process does not
 * have. The fetcher is the publication boundary the DTO suites assert; cache behaviour is proven
 * separately against a real running server (T031).
 */
export async function __fetchOriginIndexUncached(): Promise<
  PublicOriginSummary[]
> {
  return fetchOriginIndex();
}

/** The uncached detail read. TEST-ONLY — see `__fetchOriginIndexUncached`. */
export async function __fetchOriginDetailUncached(
  slug: string
): Promise<PublicOriginDetail | null> {
  return fetchOriginDetail(slug);
}

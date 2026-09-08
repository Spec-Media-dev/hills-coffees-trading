import { unstable_cache } from "next/cache";

import {
  CATALOGUE_REVALIDATE_SECONDS,
  newCacheStamp,
  TAG_PUBLIC_COFFEES,
  tagPublicCoffee,
  type CacheStamp,
  type Stamped,
} from "@/lib/public/cache";
import { createPublicReadClient } from "@/lib/public/supabase";

/**
 * Public coffee reads (Feature 002, T007 — FR-003, FR-004, FR-010, FR-022, FR-024).
 *
 * THIS IS THE MOST LEAK-PRONE MODULE ON THE PLATFORM'S ONLY ANONYMOUS SURFACE. The DTO shapes
 * defined here are the complete set of coffee facts a public page can ever render, so they are the
 * real publication boundary — not the page, and not RLS.
 *
 * THREE RULES, all from `specs/002-public-website/contracts/public-dto-allowlist.md`:
 *
 *   1. **Allowlist at the query.** Every `select()` below names its columns explicitly, including
 *      inside nested joins. No `select("*")`, no implicit-all `select()`. A broad select would put
 *      private values into server memory and into any intermediate log, and the moment a DTO shape
 *      changed they would reach the client payload.
 *   2. **No raw row ever becomes a DTO.** Each mapper below copies named fields one at a time. There
 *      is deliberately no object spread of a database row anywhere in this file — a spread is how a
 *      newly-added private column silently starts being published.
 *   3. **Related records resolve to `name`/`slug`.** Internal identifiers are used for joining
 *      server-side and never emitted.
 *
 * WHAT A PUBLIC COFFEE PAGE CANNOT SHOW (contract §4): grade, cup score and crop year live in a
 * member-only table this feature never queries; quantities, availability, seller identity and any
 * price belong to the authorized member experience (SRS MKT-06, FR-024). Public coffee pages are
 * *discovery* pages describing what Hills sources — they must not imply a live order book.
 *
 * Certification `name` and expiry are published; the certificate identifier deliberately is **not**.
 * RLS exposes it, but publishing a certificate identifier is a Content/Compliance disclosure
 * decision, not a developer's (contract §2).
 *
 * CACHING is Feature 001's pinned API, unchanged: `unstable_cache(fn, keyParts, { tags, revalidate })`
 * plus `revalidateTag(tag, { expire: 0 })` for invalidation. Nothing here varies by user, session,
 * organization or auth state, so every entry is safely shared (SEC-002).
 */

// ---------------------------------------------------------------------------
// Public DTOs — the complete published shape
// ---------------------------------------------------------------------------

/** A taxonomy or reference record, reduced to what a visitor may see. */
export type PublicNamedRef = {
  name: string;
  slug: string;
};

/** The origin of a coffee, as published on a coffee page. */
export type PublicCoffeeOrigin = {
  name: string;
  slug: string;
  countryCode: string | null;
  region: {
    name: string;
    slug: string;
    countryCode: string | null;
  } | null;
};

/** One published certification claim. The certificate identifier is intentionally absent. */
export type PublicCoffeeCertification = {
  name: string;
  /** ISO date (`YYYY-MM-DD`) or null — supports an honest "valid until" presentation. */
  expiresAt: string | null;
};

/** A coffee as it appears in the public index listing. */
export type PublicCoffeeSummary = {
  name: string;
  slug: string;
  description: string | null;
  origin: PublicCoffeeOrigin | null;
  coffeeType: PublicNamedRef | null;
  processingMethod: PublicNamedRef | null;
};

/** A coffee as it appears on its own public detail page. */
export type PublicCoffeeDetail = PublicCoffeeSummary & {
  variety: PublicNamedRef | null;
  packagingType: PublicNamedRef | null;
  tags: PublicNamedRef[];
  certifications: PublicCoffeeCertification[];
};

// ---------------------------------------------------------------------------
// Column allowlists — the boundary is the query itself
// ---------------------------------------------------------------------------

const ORIGIN_COLUMNS = `
  name,
  slug,
  country_code,
  regions ( name, slug, country_code )
`;

const SUMMARY_COLUMNS = `
  name,
  slug,
  description,
  origins ( ${ORIGIN_COLUMNS} ),
  coffee_types ( name, slug ),
  processing_methods ( name, slug )
`;

const DETAIL_COLUMNS = `
  ${SUMMARY_COLUMNS},
  coffee_varieties ( name, slug ),
  packaging_types ( name, slug ),
  coffee_tags ( tags ( name, slug ) ),
  coffee_certifications ( name, expires_at )
`;

/** The only status an anonymous visitor may ever see (FR-004). */
const PUBLISHED = "PUBLISHED";

// ---------------------------------------------------------------------------
// Row shapes — what PostgREST returns for the allowlists above
// ---------------------------------------------------------------------------

type NamedRefRow = { name: string; slug: string } | null;

type RegionRow = {
  name: string;
  slug: string;
  country_code: string | null;
} | null;

type OriginRow = {
  name: string;
  slug: string;
  country_code: string | null;
  regions: RegionRow;
} | null;

type SummaryRow = {
  name: string;
  slug: string;
  description: string | null;
  origins: OriginRow;
  coffee_types: NamedRefRow;
  processing_methods: NamedRefRow;
};

type DetailRow = SummaryRow & {
  coffee_varieties: NamedRefRow;
  packaging_types: NamedRefRow;
  coffee_tags: { tags: NamedRefRow }[] | null;
  coffee_certifications:
    | { name: string; expires_at: string | null }[]
    | null;
};

// ---------------------------------------------------------------------------
// Mappers — explicit field-by-field, never a spread
// ---------------------------------------------------------------------------

function toNamedRef(row: NamedRefRow): PublicNamedRef | null {
  if (!row) return null;
  return { name: row.name, slug: row.slug };
}

function toOrigin(row: OriginRow): PublicCoffeeOrigin | null {
  if (!row) return null;
  const region = row.regions;
  return {
    name: row.name,
    slug: row.slug,
    countryCode: row.country_code,
    region: region
      ? {
          name: region.name,
          slug: region.slug,
          countryCode: region.country_code,
        }
      : null,
  };
}

function toSummary(row: SummaryRow): PublicCoffeeSummary {
  return {
    name: row.name,
    slug: row.slug,
    description: row.description,
    origin: toOrigin(row.origins),
    coffeeType: toNamedRef(row.coffee_types),
    processingMethod: toNamedRef(row.processing_methods),
  };
}

function toDetail(row: DetailRow): PublicCoffeeDetail {
  return {
    // Explicit re-listing rather than `...toSummary(row)`: the no-spread rule applies to DTOs just
    // as much as to database rows, so the published shape stays readable in one place.
    name: row.name,
    slug: row.slug,
    description: row.description,
    origin: toOrigin(row.origins),
    coffeeType: toNamedRef(row.coffee_types),
    processingMethod: toNamedRef(row.processing_methods),
    variety: toNamedRef(row.coffee_varieties),
    packagingType: toNamedRef(row.packaging_types),
    tags: (row.coffee_tags ?? [])
      .map((link) => toNamedRef(link.tags))
      .filter((tag): tag is PublicNamedRef => tag !== null),
    certifications: (row.coffee_certifications ?? []).map((certification) => ({
      name: certification.name,
      expiresAt: certification.expires_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Uncached fetchers
// ---------------------------------------------------------------------------

async function fetchCoffeeIndex(): Promise<PublicCoffeeSummary[]> {
  const supabase = createPublicReadClient();
  const { data, error } = await supabase
    .from("coffees")
    .select(SUMMARY_COLUMNS)
    .eq("status", PUBLISHED)
    .order("name", { ascending: true });

  // Never surface a database message to a public page (SEC-003 discipline). An empty catalogue and a
  // failed read are both rendered as honest empty states by the caller.
  if (error) throw new Error("Public coffee index read failed.");

  return (data as unknown as SummaryRow[]).map(toSummary);
}

async function fetchCoffeeDetail(
  slug: string
): Promise<PublicCoffeeDetail | null> {
  const supabase = createPublicReadClient();
  const { data, error } = await supabase
    .from("coffees")
    .select(DETAIL_COLUMNS)
    .eq("status", PUBLISHED)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error("Public coffee detail read failed.");
  if (!data) return null;

  return toDetail(data as unknown as DetailRow);
}

// ---------------------------------------------------------------------------
// Cached entries
// ---------------------------------------------------------------------------

const cachedCoffeeIndex = unstable_cache(
  async (): Promise<Stamped<PublicCoffeeSummary[]>> => ({
    stamp: newCacheStamp(),
    value: await fetchCoffeeIndex(),
  }),
  ["public-coffee-index"],
  { tags: [TAG_PUBLIC_COFFEES], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);

function cachedCoffeeDetail(slug: string) {
  return unstable_cache(
    async (): Promise<Stamped<PublicCoffeeDetail | null>> => ({
      stamp: newCacheStamp(),
      value: await fetchCoffeeDetail(slug),
    }),
    ["public-coffee-detail", slug],
    {
      tags: [TAG_PUBLIC_COFFEES, tagPublicCoffee(slug)],
      revalidate: CATALOGUE_REVALIDATE_SECONDS,
    }
  );
}

// ---------------------------------------------------------------------------
// Public API — pages consume these, and only these
// ---------------------------------------------------------------------------

/** Every published coffee, ordered by name. Non-`PUBLISHED` rows are unreachable. */
export async function getPublicCoffeeIndex(): Promise<PublicCoffeeSummary[]> {
  return (await cachedCoffeeIndex()).value;
}

/**
 * One published coffee, or `null` when the slug is unknown **or** the record is not `PUBLISHED`.
 *
 * The two cases are deliberately indistinguishable: the caller renders the same 404 for both, so an
 * anonymous visitor cannot discover that unpublished catalogue content exists (FR-004).
 */
export async function getPublicCoffeeBySlug(
  slug: string
): Promise<PublicCoffeeDetail | null> {
  return (await cachedCoffeeDetail(slug)()).value;
}

// ---------------------------------------------------------------------------
// Test-only accessors (cache contract §5.2)
// ---------------------------------------------------------------------------

/**
 * Reads the provenance stamp of the coffee-index cache entry.
 *
 * TEST/DIAGNOSTIC ONLY — never call this from a page, a layout, `generateMetadata`, structured data
 * or the sitemap. The stamp is not page content, and the double-underscore name is there to make an
 * accidental call obvious in review.
 */
export async function __readCoffeeIndexCacheStamp(): Promise<CacheStamp> {
  return (await cachedCoffeeIndex()).stamp;
}

/** Reads the provenance stamp of one coffee-detail cache entry. TEST/DIAGNOSTIC ONLY. */
export async function __readCoffeeDetailCacheStamp(
  slug: string
): Promise<CacheStamp> {
  return (await cachedCoffeeDetail(slug)()).stamp;
}

/**
 * The uncached index read — same query, same allowlist, same mapper.
 *
 * TEST-ONLY. `unstable_cache` requires Next.js's incremental-cache context and throws
 * `Invariant: incrementalCache missing` in a bare Vitest process, so the DTO-boundary suites call
 * these instead. That loses nothing: the cache wrapper stores whatever the fetcher returns and adds
 * no field, so the fetcher *is* the publication boundary being asserted. Cache behaviour itself is
 * proven separately against a real running server (T031).
 */
export async function __fetchCoffeeIndexUncached(): Promise<
  PublicCoffeeSummary[]
> {
  return fetchCoffeeIndex();
}

/** The uncached detail read. TEST-ONLY — see `__fetchCoffeeIndexUncached`. */
export async function __fetchCoffeeDetailUncached(
  slug: string
): Promise<PublicCoffeeDetail | null> {
  return fetchCoffeeDetail(slug);
}

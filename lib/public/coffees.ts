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
import { publicAssetUrl } from "@/lib/storage/public-url";

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
 * BILINGUAL CONTENT (hardening run): the base columns are the canonical ENGLISH values. Arabic lives in
 * the normalized `*_translations` tables (`locale = 'ar'`) and is published as a separate `…Ar` field
 * (`nameAr`, `descriptionAr`) — `null` when no Arabic exists, in which case the page shows the English
 * value marked `lang="en" dir="ltr"` (`LocalizedContent`), never a guessed translation.
 * Coffee + origin translations are embedded in the main allowlist (tables already public-readable);
 * region / type / variety / process / packaging translations and catalogue images come from a SECOND,
 * fault-tolerant read, so the public catalogue keeps rendering (English, placeholder media) even
 * before migration `20260923120000_catalogue_media_and_translations` is applied.
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
  /** Arabic name, or `null` when no Arabic translation exists (English `name` is the fallback). */
  nameAr: string | null;
  slug: string;
};

/** One published catalogue image — a public URL + its primary flag (no storage/bookkeeping identifiers). */
export type PublicCoffeeImage = {
  url: string;
  isPrimary: boolean;
};

/**
 * MEDIA DISPLAY RULE — "primary outside, gallery inside": list/card surfaces show ONE image — the
 * admin-selected primary, or (defensively, should the one-primary invariant ever be absent) the first
 * image in sort order. Pure and exported so the rule is unit-testable on its own.
 */
export function pickCardImage(images: readonly PublicCoffeeImage[]): PublicCoffeeImage | null {
  return images.find((image) => image.isPrimary) ?? images[0] ?? null;
}

/** The origin of a coffee, as published on a coffee page. */
export type PublicCoffeeOrigin = {
  name: string;
  nameAr: string | null;
  slug: string;
  countryCode: string | null;
  region: {
    name: string;
    nameAr: string | null;
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
  nameAr: string | null;
  slug: string;
  description: string | null;
  descriptionAr: string | null;
  origin: PublicCoffeeOrigin | null;
  coffeeType: PublicNamedRef | null;
  processingMethod: PublicNamedRef | null;
  /** The primary catalogue image, or `null` (the card shows the neutral placeholder). */
  image: PublicCoffeeImage | null;
};

/** A coffee as it appears on its own public detail page. */
export type PublicCoffeeDetail = PublicCoffeeSummary & {
  /** Every published image in the admin's `sort_order` (the gallery opens on `image`, the primary). */
  images: PublicCoffeeImage[];
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
  origin_translations ( locale, name ),
  regions ( name, slug, country_code )
`;

const SUMMARY_COLUMNS = `
  name,
  slug,
  description,
  coffee_translations ( locale, name, description ),
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

/**
 * The SECOND, fault-tolerant allowlist: Arabic names for the region and taxonomy references, keyed by
 * the coffee's public slug. Reads only `locale`/`name` from the translation tables.
 */
const REFERENCE_TRANSLATION_COLUMNS = `
  slug,
  origins ( regions ( region_translations ( locale, name ) ) ),
  coffee_types ( coffee_type_translations ( locale, name ) ),
  processing_methods ( processing_method_translations ( locale, name ) ),
  coffee_varieties ( coffee_variety_translations ( locale, name ) ),
  packaging_types ( packaging_type_translations ( locale, name ) )
`;

/**
 * Arabic TAG names ("Characteristics"), keyed by the coffee's slug then the tag's slug. Its own read,
 * separate from the reference names above, because `tag_translations` arrives in a later migration
 * (20260924120000): if it is missing only tags fall back to English — every other Arabic name stays.
 */
const TAG_TRANSLATION_COLUMNS = `
  slug,
  coffee_tags ( tags ( slug, tag_translations ( locale, name ) ) )
`;

/** The owner-run public image view: published coffees, public bucket, no bookkeeping columns. */
const IMAGE_COLUMNS = "coffee_slug, object_path, sort_order, is_primary";

/** The only status an anonymous visitor may ever see (FR-004). */
const PUBLISHED = "PUBLISHED";

// ---------------------------------------------------------------------------
// Row shapes — what PostgREST returns for the allowlists above
// ---------------------------------------------------------------------------

type TranslationRow = { locale: string; name: string; description?: string | null };
type TranslationsRow = TranslationRow[] | null;

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
  origin_translations: TranslationsRow;
  regions: RegionRow;
} | null;

type SummaryRow = {
  name: string;
  slug: string;
  description: string | null;
  coffee_translations: TranslationsRow;
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

/** Supplemental Arabic reference names for one coffee (all `null` when unavailable). */
type ReferenceArabic = {
  region: string | null;
  coffeeType: string | null;
  processingMethod: string | null;
  variety: string | null;
  packagingType: string | null;
};

const NO_REFERENCE_ARABIC: ReferenceArabic = { region: null, coffeeType: null, processingMethod: null, variety: null, packagingType: null };

/** Supplemental data joined onto a coffee by its public slug. */
type Supplement = { arabic: ReferenceArabic; images: PublicCoffeeImage[]; tagArabic: ReadonlyMap<string, string> };

const EMPTY_SUPPLEMENT: Supplement = { arabic: NO_REFERENCE_ARABIC, images: [], tagArabic: new Map() };

// ---------------------------------------------------------------------------
// Mappers — explicit field-by-field, never a spread
// ---------------------------------------------------------------------------

/** The Arabic row's non-blank value for one field, or `null` — never the English value. */
function arabic(rows: TranslationsRow, field: "name" | "description"): string | null {
  const row = (rows ?? []).find((translation) => translation.locale === "ar");
  const value = row?.[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toNamedRef(row: NamedRefRow, nameAr: string | null = null): PublicNamedRef | null {
  if (!row) return null;
  return { name: row.name, nameAr, slug: row.slug };
}

function toOrigin(row: OriginRow, regionAr: string | null): PublicCoffeeOrigin | null {
  if (!row) return null;
  const region = row.regions;
  return {
    name: row.name,
    nameAr: arabic(row.origin_translations, "name"),
    slug: row.slug,
    countryCode: row.country_code,
    region: region
      ? {
          name: region.name,
          nameAr: regionAr,
          slug: region.slug,
          countryCode: region.country_code,
        }
      : null,
  };
}

function toSummary(row: SummaryRow, supplement: Supplement): PublicCoffeeSummary {
  return {
    name: row.name,
    nameAr: arabic(row.coffee_translations, "name"),
    slug: row.slug,
    description: row.description,
    descriptionAr: arabic(row.coffee_translations, "description"),
    origin: toOrigin(row.origins, supplement.arabic.region),
    coffeeType: toNamedRef(row.coffee_types, supplement.arabic.coffeeType),
    processingMethod: toNamedRef(row.processing_methods, supplement.arabic.processingMethod),
    image: pickCardImage(supplement.images),
  };
}

function toDetail(row: DetailRow, supplement: Supplement): PublicCoffeeDetail {
  return {
    // Explicit re-listing rather than `...toSummary(row)`: the no-spread rule applies to DTOs just
    // as much as to database rows, so the published shape stays readable in one place.
    name: row.name,
    nameAr: arabic(row.coffee_translations, "name"),
    slug: row.slug,
    description: row.description,
    descriptionAr: arabic(row.coffee_translations, "description"),
    origin: toOrigin(row.origins, supplement.arabic.region),
    coffeeType: toNamedRef(row.coffee_types, supplement.arabic.coffeeType),
    processingMethod: toNamedRef(row.processing_methods, supplement.arabic.processingMethod),
    image: pickCardImage(supplement.images),
    images: supplement.images.map((image) => ({ url: image.url, isPrimary: image.isPrimary })),
    variety: toNamedRef(row.coffee_varieties, supplement.arabic.variety),
    packagingType: toNamedRef(row.packaging_types, supplement.arabic.packagingType),
    tags: (row.coffee_tags ?? [])
      .map((link) => toNamedRef(link.tags, link.tags ? (supplement.tagArabic.get(link.tags.slug) ?? null) : null))
      .filter((tag): tag is PublicNamedRef => tag !== null),
    certifications: (row.coffee_certifications ?? []).map((certification) => ({
      name: certification.name,
      expiresAt: certification.expires_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Supplemental, fault-tolerant reads (Arabic reference names + images)
// ---------------------------------------------------------------------------

type RefTranslationRow = {
  slug: string;
  origins: { regions: { region_translations: TranslationsRow } | null } | null;
  coffee_types: { coffee_type_translations: TranslationsRow } | null;
  processing_methods: { processing_method_translations: TranslationsRow } | null;
  coffee_varieties: { coffee_variety_translations: TranslationsRow } | null;
  packaging_types: { packaging_type_translations: TranslationsRow } | null;
};

type ImageRow = { coffee_slug: string; object_path: string; sort_order: number; is_primary: boolean };

/**
 * Reads the supplement for the given slugs (or every published coffee when `slug` is omitted). ANY
 * failure — including the tables/view not existing yet — yields an empty supplement: the English,
 * placeholder-media page is always the safe fallback, never an error page.
 */
async function fetchSupplements(slug?: string): Promise<Map<string, Supplement>> {
  const supabase = createPublicReadClient();
  let refQuery = supabase.from("coffees").select(REFERENCE_TRANSLATION_COLUMNS).eq("status", PUBLISHED);
  let imageQuery = supabase.from("public_coffee_images").select(IMAGE_COLUMNS).order("sort_order", { ascending: true });
  let tagQuery = supabase.from("coffees").select(TAG_TRANSLATION_COLUMNS).eq("status", PUBLISHED);
  if (slug) {
    refQuery = refQuery.eq("slug", slug);
    imageQuery = imageQuery.eq("coffee_slug", slug);
    tagQuery = tagQuery.eq("slug", slug);
  }
  const [refs, images, tags] = await Promise.all([refQuery, imageQuery, tagQuery]);

  const out = new Map<string, Supplement>();
  const entry = (key: string): Supplement => {
    let value = out.get(key);
    if (!value) {
      value = { arabic: { region: null, coffeeType: null, processingMethod: null, variety: null, packagingType: null }, images: [], tagArabic: new Map() };
      out.set(key, value);
    }
    return value;
  };

  if (!refs.error && refs.data) {
    for (const row of refs.data as unknown as RefTranslationRow[]) {
      const target = entry(row.slug).arabic;
      target.region = arabic(row.origins?.regions?.region_translations ?? null, "name");
      target.coffeeType = arabic(row.coffee_types?.coffee_type_translations ?? null, "name");
      target.processingMethod = arabic(row.processing_methods?.processing_method_translations ?? null, "name");
      target.variety = arabic(row.coffee_varieties?.coffee_variety_translations ?? null, "name");
      target.packagingType = arabic(row.packaging_types?.packaging_type_translations ?? null, "name");
    }
  }

  if (!tags.error && tags.data) {
    type TagRow = { slug: string; coffee_tags: { tags: { slug: string; tag_translations: TranslationsRow } | null }[] | null };
    for (const row of tags.data as unknown as TagRow[]) {
      const map = entry(row.slug).tagArabic as Map<string, string>;
      for (const link of row.coffee_tags ?? []) {
        const value = link.tags ? arabic(link.tags.tag_translations, "name") : null;
        if (link.tags && value) map.set(link.tags.slug, value);
      }
    }
  }

  if (!images.error && images.data) {
    // Admin sort order, exactly — the primary is FLAGGED, not moved, so the gallery strip matches the
    // admin's arrangement and the card/gallery start image comes from `pickCardImage`.
    const rows = [...(images.data as unknown as ImageRow[])].sort((a, b) => a.sort_order - b.sort_order);
    for (const row of rows) {
      entry(row.coffee_slug).images.push({ url: publicAssetUrl(row.object_path), isPrimary: row.is_primary === true });
    }
  }

  return out;
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

  const supplements = await fetchSupplements();
  return (data as unknown as SummaryRow[]).map((row) => toSummary(row, supplements.get(row.slug) ?? EMPTY_SUPPLEMENT));
}

/**
 * Normalizes a public route slug (decodes URI encoding, trims whitespace, strips trailing slash, lowercases).
 * Pure and exported so route callers and tests share identical slug resolution logic.
 */
export function normalizeSlug(slug: string): string {
  if (typeof slug !== "string") return "";
  try {
    return decodeURIComponent(slug).trim().replace(/\/+$/, "").toLowerCase();
  } catch {
    return slug.trim().replace(/\/+$/, "").toLowerCase();
  }
}

async function fetchCoffeeDetail(
  slug: string
): Promise<PublicCoffeeDetail | null> {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  const supabase = createPublicReadClient();
  const { data, error } = await supabase
    .from("coffees")
    .select(DETAIL_COLUMNS)
    .eq("status", PUBLISHED)
    .eq("slug", normalized)
    .maybeSingle();

  if (error) throw new Error("Public coffee detail read failed.");
  if (!data) return null;

  const row = data as unknown as DetailRow;
  const supplements = await fetchSupplements(row.slug);
  return toDetail(row, supplements.get(row.slug) ?? EMPTY_SUPPLEMENT);
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
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return (await cachedCoffeeDetail(normalized)()).value;
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
  const normalized = normalizeSlug(slug);
  return (await cachedCoffeeDetail(normalized)()).stamp;
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
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return fetchCoffeeDetail(normalized);
}

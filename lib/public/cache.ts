import { randomUUID } from "node:crypto";

/**
 * Cache tags, TTL ceilings and the computation stamp for the public read layer
 * (Feature 002, Phase 2 — FR-010, FR-011).
 *
 * THE CACHE API IS FEATURE 001'S, UNCHANGED. Every public read wraps its fetch in
 * `unstable_cache(fn, keyParts, { tags, revalidate })` from `next/cache`, and on-demand
 * invalidation is `revalidateTag(tag, { expire: 0 })`. Feature 001's
 * `contracts/cache-policy-contract.md` is the platform-wide authority; this feature introduces no
 * new caching mechanism, no alternative policy and no external cache or store
 * (Constitution Principle XI).
 *
 * WHY EVERY TAG ALSO CARRIES A FINITE TTL: no on-demand invalidation of these tags happens anywhere
 * yet. Feature 010 owns catalogue mutations and will call `revalidateTag` on writes; until it
 * exists, the TTL ceiling is the only refresh mechanism, so a catalogue change must eventually
 * become visible without a mutation owner. The register in
 * `specs/002-public-website/contracts/public-cache-policy.md` §3 states this honestly and must not
 * claim invalidation that does not exist.
 *
 * NOTHING HERE VARIES BY USER. Every entry is public-shared: no key part and no cached value may
 * incorporate a user, session, organization, role or auth state, and no public read may consult
 * request identity at all (SEC-002). That is what makes a single shared entry safe to serve to every
 * visitor.
 */

/** Coffee index list DTO. TTL ceiling 3600s. Owner of invalidation: Feature 010 (not implemented). */
export const TAG_PUBLIC_COFFEES = "public-coffees";

/** One coffee detail DTO, parameterised by slug. TTL ceiling 3600s. */
export function tagPublicCoffee(slug: string): string {
  return `public-coffee:${slug}`;
}

/** Origin index list DTO. TTL ceiling 3600s. */
export const TAG_PUBLIC_ORIGINS = "public-origins";

/** One origin detail DTO, parameterised by slug. TTL ceiling 3600s. */
export function tagPublicOrigin(slug: string): string {
  return `public-origin:${slug}`;
}

/** Types / varieties / processing / packaging / tags. Slow-changing reference data. TTL 86400s. */
export const TAG_PUBLIC_TAXONOMY = "public-taxonomy";

/** TTL ceiling for catalogue reads, in seconds. */
export const CATALOGUE_REVALIDATE_SECONDS = 3600;

/** TTL ceiling for taxonomy reads, in seconds. */
export const TAXONOMY_REVALIDATE_SECONDS = 86400;

/**
 * A per-computation provenance stamp stored INSIDE each cache entry
 * (`contracts/public-cache-policy.md` §5.2).
 *
 * WHAT IT IS FOR: a cached catalogue read will not visibly change after revalidation unless the
 * underlying row changes — which would otherwise force the revalidation proof to mutate real
 * catalogue data. The stamp solves that: a cache **hit** returns the stored stamp unchanged, and a
 * recompute produces a new one, so the recompute is observable with no catalogue mutation and no
 * seeded catalogue row.
 *
 * WHAT IT IS NOT: page content. It is diagnostic provenance, reachable only through the
 * deliberately-named test-only accessors in this directory. It is never rendered, never placed in
 * metadata, structured data or the sitemap, and never shown to a visitor. The public accessors
 * return `value` alone and never expose it.
 *
 * It is honest: it records when that cache entry was genuinely built. It is not a fabricated value
 * and it is not a substitute for real data.
 */
export type CacheStamp = {
  /** ISO-8601 instant at which this cache entry was computed. */
  computedAt: string;
  /** Opaque per-computation token — distinguishes two recomputes inside the same clock tick. */
  token: string;
};

/** A cached value together with the stamp recorded when it was computed. */
export type Stamped<T> = {
  stamp: CacheStamp;
  value: T;
};

/** Builds the provenance stamp for one computation. Called only inside a cached function body. */
export function newCacheStamp(): CacheStamp {
  return { computedAt: new Date().toISOString(), token: randomUUID() };
}

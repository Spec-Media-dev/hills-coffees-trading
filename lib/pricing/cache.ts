import { revalidateTag } from "next/cache";

/**
 * Feature 011 cache surface (T013 — FR-007, FR-008, FR-011, SC-006).
 *
 * THE CACHE API IS FEATURE 001'S, UNCHANGED. Every reference-price read wraps its fetch in
 * `unstable_cache(fn, keyParts, { tags, revalidate })` and on-demand invalidation is
 * `revalidateTag(tag, { expire: 0 })` — `specs/001-platform-foundation/contracts/cache-policy-contract.md` is the
 * platform-wide authority, and this feature adds no mechanism to it.
 *
 * THE ONE TAG: `reference-prices`. Sources, observations and differentials are public, slow-changing reference
 * data (FR-007), so they MAY be cached publicly. They are registered in the contract's tag table (T013).
 *
 * FRESHNESS TRAVELS WITH THE VALUE (FR-008). A cache hit must never turn stale data into "current": every cached
 * record carries its own `observedAt`, its own `isStale` flag and the instant the entry was read (`readAt`), and the
 * presentation contract re-derives the state from them on every render — the cache stores facts, not verdicts.
 *
 * EVERY ENTRY ALSO CARRIES A FINITE TTL. Administrative price changes are delivered through Feature 010's console
 * (FR-011), which does not yet contain a price-administration surface; until it calls `revalidateReferencePrices()`
 * the TTL is the only refresh mechanism, so a licence revocation or a new observation still becomes visible within
 * `REFERENCE_PRICES_REVALIDATE_SECONDS`. The contract register states this honestly (TTL-only until 010 wires the call).
 *
 * NOTHING HERE VARIES BY USER. Public-shared entries only: no key part or cached value may incorporate a user,
 * session, organization, role or auth state (SEC-001/SEC-002).
 */

/** The single tag every reference-price cache entry carries. */
export const TAG_REFERENCE_PRICES = "reference-prices";

/**
 * TTL ceiling for reference-price reads, in seconds. Deliberately short: this is market-context data, and a
 * licence change or a stale flag should not linger. (The value is a freshness bound, not a claim of currency.)
 */
export const REFERENCE_PRICES_REVALIDATE_SECONDS = 300;

/**
 * Invalidates every cached reference-price entry. The function Feature 010's price administration must call after
 * any source / observation / differential / licence change (FR-011, SC-006). Server-only; the mandatory
 * `{ expire: 0 }` form, never a profile string.
 */
export function revalidateReferencePrices(): readonly string[] {
  revalidateTag(TAG_REFERENCE_PRICES, { expire: 0 });
  return [TAG_REFERENCE_PRICES];
}

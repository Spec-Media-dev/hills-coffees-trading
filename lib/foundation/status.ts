import { randomUUID } from "node:crypto";

import { unstable_cache } from "next/cache";

/**
 * The FR-014/FR-015 Next.js-native cache proof (research.md §5, cache-policy-contract.md).
 *
 * A deliberately non-business, foundation-only observable value — this file reads no public
 * catalog / product / origin table of any kind, and no database table at all (Clarify-resolved).
 * Its only purpose is to exercise the real `unstable_cache` + `revalidateTag` cycle end-to-end so
 * later features have a proven pattern to copy.
 *
 * **Cache API is pinned to `unstable_cache`.** The App Router's newer directive-based caching
 * primitives are deliberately NOT used here — see cache-policy-contract.md for why (a repo-wide
 * architectural adoption outside this feature's scope). This file imports nothing else from
 * `next/cache`, and `next.config.ts` stays unchanged.
 */
export type FoundationStatus = {
  /** ISO-8601 instant the value was (re)computed. */
  computedAt: string;
  /** A fresh token per computation — proves a cache hit did NOT recompute. */
  revision: string;
};

/**
 * Genuinely computed, not a module constant: two direct calls in the same process return two
 * different values. If this were a hardcoded constant, the cache proof would be vacuous — it could
 * never demonstrate that revalidation actually triggered a recompute (research.md §5).
 */
export function computeFoundationStatus(): FoundationStatus {
  return {
    computedAt: new Date().toISOString(),
    revision: randomUUID(),
  };
}

/**
 * The cached read, tagged `foundation-status`. `src/app/foundation-status/actions.ts`'s
 * `revalidateFoundationStatus` Server Action calls `revalidateTag("foundation-status")` against
 * this exact tag to force the next read to recompute.
 */
export const getFoundationStatus = unstable_cache(
  async () => computeFoundationStatus(),
  ["foundation-status"],
  { tags: ["foundation-status"] }
);

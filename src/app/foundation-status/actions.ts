"use server";

import { revalidateTag } from "next/cache";

/**
 * The T020 cache proof's documented revalidation entry point (research.md §5,
 * cache-policy-contract.md). `revalidateTag` only — the sibling API for immediate expiration from
 * within a Server Action belongs to the App Router directive-based caching model this feature does
 * not adopt (lib/foundation/status.ts).
 *
 * Calling this invalidates the `foundation-status` tagged cache entry, so the next read of
 * `getFoundationStatus()` recomputes and `/foundation-status` renders a visibly different
 * `computedAt`/`revision` — on demand, deterministically, with no wall-clock wait required.
 *
 * **`{ expire: 0 }` second argument, not a named profile string**: this installed Next.js version
 * (16.3.4) requires `revalidateTag`'s second parameter — calling it with one argument still works
 * but is deprecated and prints a runtime warning. `{ expire: 0 }` is the plain numeric inline-object
 * form of that parameter (not a named profile string) — it requests immediate expiration, matching
 * the "recompute now, no wall-clock wait" behavior this proof requires, without adopting the
 * directive-based caching model or its config flag (see lib/foundation/status.ts).
 */
export async function revalidateFoundationStatus(): Promise<void> {
  revalidateTag("foundation-status", { expire: 0 });
}

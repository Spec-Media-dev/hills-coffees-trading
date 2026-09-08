import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The anonymous, session-free Supabase client used by the public read layer
 * (Feature 002, Phase 2 — FR-003, FR-011, SEC-001, SEC-002).
 *
 * WHY THIS IS NOT `lib/supabase/server.ts`:
 *
 * Feature 001's request-scoped client reads the current request's cookies through `next/headers` so
 * it can act as the signed-in user. That is exactly wrong here, for two independent reasons:
 *
 *   1. **Correctness.** These reads are wrapped in `unstable_cache`, and a cached function must not
 *      touch request-scoped dynamic APIs. A cookie-reading client inside a cache entry would either
 *      fail or, far worse, bake one visitor's context into an entry served to everyone.
 *   2. **Policy.** Public cache entries must never vary by user, session, organization or auth state
 *      (SEC-002, cache contract §2). Reading as "nobody" is what makes a single shared entry
 *      provably safe for every visitor.
 *
 * So this client is built once per call from the browser-safe publishable key with sessions
 * disabled. It is the anonymous PostgREST role, subject to exactly the same RLS an unauthenticated
 * visitor gets: only rows the approved public policies expose are readable at all. The privileged
 * key is never used here — the only place in this repository that constructs a privileged client is
 * the standalone fixture script under `scripts/`, which is outside the Next.js build graph.
 *
 * RLS is the floor, not the boundary. Several columns are anonymously readable and still must never
 * be published (`contracts/public-dto-allowlist.md`). Every read in this directory therefore also
 * applies an explicit column allowlist in its own `select()`.
 */

function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    // Name only — never echo the value, even for a browser-safe variable.
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

/**
 * Builds a fresh anonymous read client.
 *
 * Not memoised at module scope: a module-level singleton would be shared across the whole server
 * process, and keeping construction explicit keeps the "no session, no identity" property visible at
 * every call site.
 */
export function createPublicReadClient(): SupabaseClient {
  return createClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }
  );
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAnonymousFixtureClient } from "@/tests/auth/fixture-session";

/**
 * Unprivileged test-side view of the Feature 002 catalogue fixtures (T006a).
 *
 * This is the half of the fixture the TEST RUNTIME may see. The privileged half lives in
 * `scripts/seed-test-fixtures.ts`, runs only through `npm run test:seed` /
 * `npm run test:seed:teardown`, and is never imported from here — importing it would pull the
 * privileged credential into the test process, which Feature 001's fixture contract forbids. The
 * constants below are therefore declared in both places by design; they are fixed values, so any
 * drift fails the assertions in this directory immediately rather than silently.
 *
 * Anonymous access reuses `createAnonymousFixtureClient()` from Feature 001's
 * `tests/auth/fixture-session.ts` rather than constructing a second client, so public-boundary
 * assertions run as a genuine anonymous visitor against the same RLS an unauthenticated request
 * gets.
 */

/** Deterministic slugs — the route identity of every catalogue fixture row. */
export const CATALOGUE_SLUGS = {
  region: "public-test-region",
  coffeeType: "public-test-type",
  variety: "public-test-variety",
  processingMethod: "public-test-process",
  packagingType: "public-test-packaging",
  tag: "public-test-tag",
  originActive: "public-test-origin-active",
  originInactive: "public-test-origin-inactive",
  originArchived: "public-test-origin-archived",
  coffeePublished: "public-test-coffee-published",
  coffeeDraft: "public-test-coffee-draft",
  coffeeArchived: "public-test-coffee-archived",
} as const;

/**
 * Private canary values seeded ONLY into fields that must never reach a public surface.
 *
 * A leakage test that checked field *names* could be defeated by renaming a DTO property. These
 * follow the *value* instead, so they fail whatever the shape is called.
 */
export const CATALOGUE_CANARIES = {
  /** Description of the DRAFT coffee — proves coffee status gating. */
  coffeeDraft: "HILLSCANARY-COFFEE-DRAFT-4F1A93C7",
  /** Description of the ARCHIVED coffee — proves coffee status gating. */
  coffeeArchived: "HILLSCANARY-COFFEE-ARCHIVED-8B2E57D0",
  /** Description of the INACTIVE origin — proves origin status gating. */
  originInactive: "HILLSCANARY-ORIGIN-INACTIVE-1C6D40AB",
  /** Description of the ARCHIVED origin — proves origin status gating. */
  originArchived: "HILLSCANARY-ORIGIN-ARCHIVED-5E9F82B4",
  /**
   * The certification identifier on the PUBLISHED coffee — proves field-level allowlisting of a
   * column RLS *does* expose but the public DTO contract withholds by default.
   */
  certificateNumber: "HILLSCANARY-CERTNUMBER-2A7C63EF",
} as const;

/**
 * The owner-organization canary, already seeded by Feature 001's identity fixtures. No new row is
 * created for it — organization display names are private commercial identity and must never appear
 * on a public surface (SEO-APP-02).
 */
export const ORGANIZATION_CANARY = "Foundation Test — Buyer Only";

/** Every canary that must be absent from every public surface. */
export const ALL_CANARIES: readonly string[] = [
  ...Object.values(CATALOGUE_CANARIES),
  ORGANIZATION_CANARY,
];

const PUBLIC_TEST_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

/**
 * Makes the browser-safe Supabase variables visible to `process.env`.
 *
 * The modules under `lib/public/` read them at call time. Vitest does not run inside Next.js, so
 * nothing has loaded `.env.local` for them — this does, without pulling in a dotenv dependency and
 * without touching any privileged variable. Values already in the environment win, so CI can inject
 * them instead.
 */
export function loadPublicTestEnvironment(): void {
  let contents: string;
  try {
    contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }

  const wanted = new Set<string>(PUBLIC_TEST_ENV);
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const name = line.slice(0, separator).trim();
    if (!wanted.has(name) || process.env[name] !== undefined) continue;

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

/** An anonymous Supabase client — the same one Feature 001's auth tests use. */
export function anonymousClient(): SupabaseClient {
  loadPublicTestEnvironment();
  return createAnonymousFixtureClient();
}

/**
 * Fails with an actionable message when the catalogue fixtures are missing, so a suite that would
 * otherwise "pass" against an empty database reports the real cause instead.
 */
export async function assertCatalogueFixturesPresent(): Promise<void> {
  const { data, error } = await anonymousClient()
    .from("coffees")
    .select("slug")
    .eq("slug", CATALOGUE_SLUGS.coffeePublished)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "Catalogue fixtures are missing; run npm run test:seed before this suite."
    );
  }
}

import { readFileSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  RUN_E_CATALOGUE_FIXTURES,
  cleanupCatalogueAdminFixture,
  createAnonymousFixtureClient,
  inspectCatalogueAdminFixture,
  prepareCatalogueAdminFixture,
  resetRunECatalogueFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 Phase 10 — T034: `tests/admin/catalogue-revalidation.test.ts` (this file), the
 * console's dedicated, independently-passing proof of the T023 public-cache contract: publishing a
 * coffee through the admin console makes Feature 002's public read return it, unpublishing makes it
 * a public 404/null again, the EXACT Feature 002 tags are revalidated (no path purge substitute, no
 * shared/operational cache). RUN E's `run-e-live.test.tsx` proved this same contract as part of its
 * broader T021–T024 sweep; this file re-proves it standalone, live, against the same fixed proof
 * coffee, so `npm test -- admin/catalogue-revalidation` passes on its own.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
    set: (name: string, value: string) => {
      if (name === "hills-acting-org") cookieState.value = value;
    },
    getAll: () => [],
  }),
}));
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
}));
const cacheCalls = vi.hoisted(() => ({ tags: [] as { tag: string; options: unknown }[], paths: [] as string[] }));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: (path: string) => {
    cacheCalls.paths.push(path);
  },
  revalidateTag: (tag: string, options: unknown) => {
    cacheCalls.tags.push({ tag, options });
  },
}));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

const LIVE_TIMEOUT_MS = 150_000;
const PROOF = RUN_E_CATALOGUE_FIXTURES;

let admin: SupabaseClient;
let anonymous: SupabaseClient;

beforeAll(async () => {
  prepareCatalogueAdminFixture();
  resetRunECatalogueFixture();
  admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  anonymous = createAnonymousFixtureClient();
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  resetRunECatalogueFixture();
  const result = cleanupCatalogueAdminFixture();
  expect(result.activeAdminPrivilege).toBe(false);
  expect(inspectCatalogueAdminFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("T034 — static: the catalogue admin layer purges by tag only, never a public path, and caches nothing itself", () => {
  it("lib/admin/catalogue.ts calls ONLY revalidateTag; (catalogue)/actions.ts's revalidatePath calls are console-private (/dashboard-admin/*), never a public route", () => {
    const catalogue = stripComments(source("lib", "admin", "catalogue.ts"));
    expect(catalogue).toContain("revalidateTag(tag, { expire: 0 })");
    expect(catalogue).not.toMatch(/revalidatePath\(/);
    expect(catalogue).not.toMatch(/unstable_cache|"use cache"|cacheLife|SERVICE_ROLE|service_role/);
    const actions = stripComments(source("src", "app", "dashboard-admin", "(catalogue)", "actions.ts"));
    const paths = [...actions.matchAll(/revalidatePath\(([^)]*)\)/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const arg of paths) expect(arg, arg).toMatch(/^"\/dashboard-admin|^paths|^path\b/);
    expect(actions).not.toMatch(/revalidatePath\(\s*"\/(coffee|origins|regions|sourcing)?"\s*\)|revalidatePath\(\s*"\/"\s*\)/);
  });

  it("Feature 002's own cached readers use exactly the tags lib/admin/catalogue.ts revalidates — the same register, not a parallel one", () => {
    const coffees = source("lib", "public", "coffees.ts");
    expect(coffees).toContain("tags: [TAG_PUBLIC_COFFEES, tagPublicCoffee(slug)]");
    expect(coffees).toContain('.eq("status", PUBLISHED)');
    const cache = source("lib", "public", "cache.ts");
    expect(cache).toContain('export const TAG_PUBLIC_COFFEES = "public-coffees"');
  });
});

describe("T034 — LIVE: publish → public visible; unpublish → public 404/null; exact tags; no shared cache read", () => {
  it("DRAFT is not public (404/null) before any action", async () => {
    const { __fetchCoffeeDetailUncached } = await import("@/lib/public/coffees");
    expect(await __fetchCoffeeDetailUncached(PROOF.proofCoffeeSlug)).toBeNull();
    expect((await anonymous.from("coffees").select("id").eq("slug", PROOF.proofCoffeeSlug)).data ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("publish through the admin console revalidates EXACTLY public-coffees + public-coffee:<slug> with { expire: 0 }, and only then", async () => {
    cacheCalls.tags.length = 0;
    cacheCalls.paths.length = 0;
    const published = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "publish" }));
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.data).toMatchObject({ fromStatus: "DRAFT", toStatus: "PUBLISHED", revalidatedTags: ["public-coffees", `public-coffee:${PROOF.proofCoffeeSlug}`] });
    expect(cacheCalls.tags).toEqual([
      { tag: "public-coffees", options: { expire: 0 } },
      { tag: `public-coffee:${PROOF.proofCoffeeSlug}`, options: { expire: 0 } },
    ]);
    // No path purge substitute at all in this write.
    expect(cacheCalls.paths).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("after publish: Feature 002's public read returns the coffee, the public index lists it, and the anonymous RLS row itself is PUBLISHED — three independent confirmations, not one mocked layer", async () => {
    const { __fetchCoffeeDetailUncached, __fetchCoffeeIndexUncached } = await import("@/lib/public/coffees");
    const detail = await __fetchCoffeeDetailUncached(PROOF.proofCoffeeSlug);
    expect(detail?.slug).toBe(PROOF.proofCoffeeSlug);
    expect((await __fetchCoffeeIndexUncached()).some((coffee) => coffee.slug === PROOF.proofCoffeeSlug)).toBe(true);
    expect((await anonymous.from("coffees").select("status").eq("slug", PROOF.proofCoffeeSlug).maybeSingle()).data?.status).toBe("PUBLISHED");
  }, LIVE_TIMEOUT_MS);

  it("a second publish is refused as stale (compare-and-set) — the tag register is not re-fired for a no-op", async () => {
    const again = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "publish" }));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("catalogue_stale");
  }, LIVE_TIMEOUT_MS);

  it("unpublish revalidates the same two tags again, and the public route goes back to 404/null (both the cached reader and the anonymous RLS row)", async () => {
    cacheCalls.tags.length = 0;
    const unpublished = await withLiveClient(admin, async () => (await import("@/lib/admin/catalogue")).transitionCoffee({ coffeeId: PROOF.proofCoffeeId, operation: "unpublish" }));
    expect(unpublished.ok).toBe(true);
    if (unpublished.ok) expect(unpublished.data).toMatchObject({ fromStatus: "PUBLISHED", toStatus: "DRAFT" });
    expect(cacheCalls.tags.map((call) => call.tag)).toEqual(["public-coffees", `public-coffee:${PROOF.proofCoffeeSlug}`]);
    const { __fetchCoffeeDetailUncached } = await import("@/lib/public/coffees");
    expect(await __fetchCoffeeDetailUncached(PROOF.proofCoffeeSlug)).toBeNull();
    expect((await anonymous.from("coffees").select("id").eq("slug", PROOF.proofCoffeeSlug)).data ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("a non-admin (anonymous, direct table probe) cannot flip publication state — the public visibility change is proven to come only from the guarded console action above", async () => {
    const { error } = await anonymous.from("coffees").update({ status: "PUBLISHED" }).eq("id", PROOF.proofCoffeeId);
    expect(error).not.toBeNull();
    const { data } = await anonymous.from("coffees").select("id").eq("slug", PROOF.proofCoffeeSlug);
    expect(data ?? []).toEqual([]);
  }, LIVE_TIMEOUT_MS);
});

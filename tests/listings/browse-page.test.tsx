import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/locale/locale-provider";
import { INVENTORY_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

afterEach(cleanup);

/**
 * Feature 006 RUN B (T009) — the marketplace browse page. No identity check of its own (the guard
 * lives at `../layout.tsx`, T007 reconciliation) — this file only proves the browse/search/pagination
 * behaviour built on top of the already-tested `lib/listings/browse.ts` read layer.
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

async function renderPage(client: SupabaseClient, searchParams: { page?: string; q?: string }) {
  serverClientState.client = client;
  vi.resetModules();
  const { default: MarketplacePage } = await import("@/src/app/dashboard/coffee/page");
  const element = await MarketplacePage({ searchParams: Promise.resolve(searchParams) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T009 — marketplace browse (live)", () => {
  it("an authorized member sees the real published fixture listing with its exact stored figures", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client, {});
    expect(screen.getByText("Feature 006 Fixture — Published Listing")).toBeTruthy();
    expect(screen.getByText("USD 12.75")).toBeTruthy();
  });

  it("the SOLD_OUT fixture never appears in the browse grid (same RLS finding browse.test.ts proves)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client, {});
    expect(screen.queryByText("Feature 006 Fixture — Sold Out Listing")).toBeNull();
  });

  it("search narrows to a matching title", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client, { q: "Published Listing" });
    expect(screen.getByText("Feature 006 Fixture — Published Listing")).toBeTruthy();
  });

  it("a non-matching search shows the empty state, not an error", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client, { q: "no-listing-should-ever-match-this-exact-string" });
    expect(screen.queryByText("Feature 006 Fixture — Published Listing")).toBeNull();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  });

  it("a pending/under-review member sees no listing at all — zero private data reaches the page", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgC.email);
    await renderPage(client, {});
    expect(screen.queryByText("Feature 006 Fixture — Published Listing")).toBeNull();
  });
});

describe("T009 — source-level proofs", () => {
  it("performs no identity check of its own (guard lives at layout.tsx)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/coffee/page.tsx", "utf8");
    expect(source).not.toMatch(/getRequestIdentity/);
  });

  it("declares no cache directive and no service-role usage", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/coffee/page.tsx", "utf8");
    expect(source).not.toMatch(/unstable_cache|cacheTag|cacheLife|updateTag|"use cache"|SERVICE_ROLE|service_role/i);
  });

  it("bounds the search term length before passing it to the read layer", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/coffee/page.tsx", "utf8");
    expect(source).toMatch(/\.slice\(0,\s*MAX_SEARCH_LENGTH\)/);
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/locale/locale-provider";
import { INVENTORY_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

afterEach(cleanup);

/**
 * Feature 006 RUN C (T016) — the seller listings list page. Re-verifies `isAuthorizedMember` AND
 * `organization.canSell` server-side, independent of nav visibility (T020's own registry entry is
 * presentational only).
 *
 * HONEST FIXTURE NOTE: Org B (the seller-capable fixture) owns NO real `coffee_offers` row — no
 * MEMBER_SELLER row can ever be created without a genuinely settled order (established since RUN B).
 * The TRUE, honest state for this real session today is therefore the EMPTY state, proven below —
 * not a fabricated row. Row-rendering correctness (status badge, quantity/price formatting) is
 * already proven at the component level in `tests/listings/listing-components.test.tsx` (T011) and
 * `TableCardList`'s own established test coverage (Feature 004) — not re-proven here with fabricated
 * data.
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

async function renderPage(client: SupabaseClient) {
  serverClientState.client = client;
  vi.resetModules();
  const [{ default: SellerListingsPage }, { LocaleProvider: FreshLocaleProvider }] = await Promise.all([
    import("@/src/app/dashboard/listings/page"),
    import("@/components/locale/locale-provider"),
  ]);
  const element = await SellerListingsPage({ searchParams: Promise.resolve({}) });
  render(<FreshLocaleProvider>{element}</FreshLocaleProvider>);
}

describe("T016 — seller listings page (live)", () => {
  it("a buyer-only organization (canSell=false) is refused server-side", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    await renderPage(client);
    expect(screen.getByText("Selling isn't enabled for your organization")).toBeTruthy();
  });

  it("a seller-capable organization sees the honest empty state (no fabricated rows) and a create-listing action", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client);
    expect(screen.queryByText("Selling isn't enabled for your organization")).toBeNull();
    expect(screen.getByText("No listings yet")).toBeTruthy();
    const createControls = [...screen.queryAllByRole("link", { name: /Create listing/i }), ...screen.queryAllByRole("button", { name: /Create listing/i })];
    expect(createControls.length).toBeGreaterThan(0);
  });
});

describe("T016 — source-level proofs", () => {
  it("reads exclusively through lib/listings/manage.ts — never a raw coffee_offers query", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/listings/page.tsx", "utf8");
    expect(source).toMatch(/from ["']@\/lib\/listings\/manage["']/);
    expect(source).not.toMatch(/\.from\(\s*["']coffee_offers["']\s*\)/);
  });

  it("declares no cache directive and no service-role usage", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/listings/page.tsx", "utf8");
    expect(source).not.toMatch(/unstable_cache|cacheTag|cacheLife|updateTag|"use cache"|SERVICE_ROLE|service_role/i);
  });
});

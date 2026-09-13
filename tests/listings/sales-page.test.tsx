import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

afterEach(cleanup);

/**
 * Feature 006 RUN C (T019) — seller sales reconciliation page. Re-verifies `isAuthorizedMember` AND
 * `organization.canSell` server-side.
 *
 * HONEST FIXTURE NOTE: no settled order exists for ANY organization in the live database (the same
 * root cause established since RUN A/B). The TRUE, honest state for the real seller-capable fixture
 * is therefore the EMPTY state, proven below — not a fabricated sale row. This is exactly the
 * "no fabricated settled sale if underlying settlement/order evidence does not exist" requirement,
 * satisfied by construction rather than by a special case in the code.
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
  const [{ default: SellerSalesPage }, { LocaleProvider }] = await Promise.all([
    import("@/src/app/dashboard/sales/page"),
    import("@/components/locale/locale-provider"),
  ]);
  const element = await SellerSalesPage({ searchParams: Promise.resolve({}) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T019 — seller sales page (live)", () => {
  it("a buyer-only organization (canSell=false) is refused server-side", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    await renderPage(client);
    expect(screen.getByText("Selling isn't enabled for your organization")).toBeTruthy();
  });

  it("a seller-capable organization sees the honest empty state — no fabricated sale row", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client);
    expect(screen.queryByText("Selling isn't enabled for your organization")).toBeNull();
    expect(screen.getByText("No sales yet")).toBeTruthy();
  });
});

describe("T019 — source-level proofs", () => {
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("reads exclusively through lib/listings/sales.ts — no cross-org join, no Feature 008 settlement logic", async () => {
    const { readFileSync } = await import("node:fs");
    const pageSource = readFileSync("src/app/dashboard/sales/page.tsx", "utf8");
    const libSource = stripComments(readFileSync("lib/listings/sales.ts", "utf8"));
    expect(pageSource).toMatch(/from ["']@\/lib\/listings\/sales["']/);
    expect(libSource).toMatch(/\.eq\(\s*["']seller_organization_id["']\s*,\s*organizationId\s*\)/);
    expect(libSource).not.toMatch(/buyer_organization_id/);
  });

  it("never a raw reduce()/tally fabricating a total beyond the per-row authoritative figures", async () => {
    const { readFileSync } = await import("node:fs");
    const libSource = stripComments(readFileSync("lib/listings/sales.ts", "utf8"));
    expect(libSource).not.toMatch(/\.reduce\(/);
  });
});

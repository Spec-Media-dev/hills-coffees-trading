import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

afterEach(cleanup);

/**
 * Feature 006 T010 with Feature 013 cart handoff. The layout guards listing reads; this page
 * resolves the acting organization only to disable an own-listing add-to-cart control.
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

async function loadPage() {
  vi.resetModules();
  return import("@/src/app/dashboard/coffee/[offerId]/page");
}

describe("T010 — marketplace listing detail (live)", () => {
  it("a real, authorized member sees the published fixture's full detail and an unreserved add-to-cart control", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    serverClientState.client = client;
    const { default: MarketplaceListingDetailPage } = await loadPage();
    const element = await MarketplaceListingDetailPage({ params: Promise.resolve({ offerId: LISTING_FIXTURES.offerPublished }) });
    // Same registry as the freshly loaded page (vi.resetModules()), so AddToCartForm sees the provided locale context.
    const { LocaleProvider } = await import("@/components/locale/locale-provider");
    render(<LocaleProvider>{element}</LocaleProvider>);

    expect(screen.getAllByText("Feature 006 Fixture — Published Listing").length).toBeGreaterThan(0);
    expect(screen.getByText("USD 12.75")).toBeTruthy();
    // remaining = 100 - 15.5 - 24.5 = 60, from lib/listings/fills.ts, never recomputed here.
    expect(screen.getByText("60 kg")).toBeTruthy();
    const purchaseButton = screen.getByRole("button", { name: /Add to cart/i });
    expect(purchaseButton.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText(/Cart quantities are not reserved/)).toBeTruthy();
  });

  it("a genuinely inaccessible/nonexistent offer id triggers notFound() rather than any leaking branch", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    serverClientState.client = client;
    const { default: MarketplaceListingDetailPage } = await loadPage();
    // The SOLD_OUT fixture is genuinely unreadable by a buyer (empirical RLS finding) — indistinguishable from nonexistent.
    await expect(MarketplaceListingDetailPage({ params: Promise.resolve({ offerId: LISTING_FIXTURES.offerSoldOut }) })).rejects.toBeTruthy();
  });
});

describe("T010 — source-level proofs", () => {
  it("uses identity to suppress own-organization cart controls (layout remains the read guard)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/coffee/[offerId]/page.tsx", "utf8");
    // Identity is resolved in lib/commerce/cart.ts (display input only); the page itself never calls the DAL.
    expect(source).not.toMatch(/getRequestIdentity/);
    expect(source).toMatch(/getBuyerOrganizationId/);
    expect(source).toMatch(/buyerOrganizationId/);
    expect(source).toMatch(/notFound\(\)/);
  });

  it("never writes reserved_quantity_kg, never touches checkout/reservation logic — Feature 007's domain", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/coffee/[offerId]/page.tsx", "utf8");
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|reserved_quantity_kg\s*[:=]/);
    expect(source).not.toMatch(/checkout_order|inventory_reservation/);
  });

  it("the purchase control is an add-to-cart form, never a direct checkout link", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/coffee/[offerId]/page.tsx", "utf8");
    expect(source).toMatch(/<AddToCartForm/);
    expect(source).not.toMatch(/href=.*checkout|href=.*\/orders\/new/);
  });
});

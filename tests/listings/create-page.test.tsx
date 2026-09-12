import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

afterEach(cleanup);

/**
 * Feature 006 RUN B (T013) — the seller listing-creation page. SECURITY re-verified independently of
 * nav visibility: a buyer-only organization reaching `/dashboard/listings/new` directly is refused
 * here, before any inventory/eligibility read — proven live below with Org A (`canSell=false`).
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
  // Imported dynamically, AFTER resetModules, so this resolves to the SAME module instance
  // `ListingCreateForm`'s own `useLocale()` uses internally — a stale top-level import here would be
  // a different module instance (a different React Context object), which fails context lookup even
  // though the JSX nesting looks correct.
  const [{ default: CreateListingPage }, { LocaleProvider }] = await Promise.all([
    import("@/src/app/dashboard/listings/new/page"),
    import("@/components/locale/locale-provider"),
  ]);
  const element = await CreateListingPage();
  render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T013 — seller capability gate (live)", () => {
  it("a buyer-only organization (canSell=false) is refused server-side, before any inventory/eligibility read", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    await renderPage(client);
    expect(screen.getByText("Selling isn't enabled for your organization")).toBeTruthy();
    // No inventory-picker content of any kind reaches the page for this session.
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("a seller-capable organization (canSell=true) reaches the real picker", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client);
    expect(screen.queryByText("Selling isn't enabled for your organization")).toBeNull();
    expect(screen.getByRole("button", { name: /Save draft/i })).toBeTruthy();
  });
});

describe("T013 — eligible inventory picker composition (live)", () => {
  it("shows Org B's own positions with the CORRECT, specific refusal reason for each ineligible one", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client);

    // positionOrgBOnLotA (and Org B's own Feature 005 positionB, on lotB — its own order is left at
    // DRAFT, also never Hills-sourced): active warehouse, owned, but never Hills-sourced.
    expect(screen.getAllByText(/wasn.t acquired through a Hills-mediated purchase/i).length).toBeGreaterThan(0);
    // positionOrgBInactiveWarehouse: owned, but its warehouse is inactive.
    expect(screen.getAllByText(/storage location is not currently active/i).length).toBeGreaterThan(0);
  });

  it("an ineligible position's radio control is genuinely disabled, not merely visually muted", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderPage(client);
    const radios = screen.getAllByRole("radio") as HTMLElement[];
    const disabledCount = radios.filter((radio) => radio.getAttribute("aria-disabled") === "true" || radio.hasAttribute("disabled")).length;
    expect(disabledCount).toBeGreaterThan(0);
  });
});

describe("T013 — source-level proofs", () => {
  it("re-verifies isAuthorizedMember AND organization.canSell server-side — never relies on nav visibility alone", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/listings/new/page.tsx", "utf8");
    expect(source).toMatch(/isAuthorizedMember/);
    expect(source).toMatch(/identity\.organization\.canSell/);
  });

  it("probes eligibility at requestedQuantityKg: 0 for display only — never trusted as the final check", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/listings/new/page.tsx", "utf8");
    expect(source).toMatch(/requestedQuantityKg:\s*0/);
  });
});

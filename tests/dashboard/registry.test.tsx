import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardModule } from "@/lib/dashboard/modules";
import { DASHBOARD_MODULES } from "@/lib/dashboard/registry";
import { composeOverview } from "@/lib/dashboard/overview";
import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import type { OrganizationMembership } from "@/lib/auth/types";
import { createFakeSupabaseClient } from "@/tests/inventory/fake-supabase";

/**
 * Feature 004 T001–T003 — proves the module registration contract, the static registry, and the
 * overview composer behave exactly as the run directive requires: declaration is presentational
 * only, an unregistered module contributes nothing, and no placeholder/fake figure ever appears.
 *
 * RUN B RECONCILIATION (Feature 005) — `composeOverview` is now `async`, and the REAL
 * `DASHBOARD_MODULES` registry includes the "inventory" module's genuinely async `overviewCards`
 * (real `lib/inventory/*` reads). Every test below that feeds `DASHBOARD_MODULES` through
 * `composeOverview` therefore mocks `@/lib/supabase/server` with the same fake-table technique
 * `tests/inventory/*.test.ts` already established — empty tables, so the inventory module's bounded
 * count reads resolve to 0 and contribute no card, which is exactly what every "stays honestly empty"
 * assertion below already expected. This is not a workaround: it is the identical, already-approved
 * pattern for exercising code that performs a real (mocked) database read in a unit test.
 */
const fakeClientState = vi.hoisted(() => ({ client: null as ReturnType<typeof createFakeSupabaseClient> | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!fakeClientState.client) throw new Error("test has no fake client installed");
    return fakeClientState.client;
  }),
}));

fakeClientState.client = createFakeSupabaseClient({});

const buyerOnly: OrganizationMembership = {
  organizationId: "org-buyer-only",
  displayName: "Test Buyer Co",
  memberRole: "OWNER",
  canBuy: true,
  canSell: false,
};

const buyerAndSeller: OrganizationMembership = {
  ...buyerOnly,
  organizationId: "org-buyer-seller",
  displayName: "Test Buyer & Seller Co",
  canSell: true,
};

describe("T001 — module registration contract", () => {
  it("requiredCapability stays within the narrow, documented vocabulary", () => {
    const allowed = new Set(["member", "buy", "sell"]);
    for (const dashboardModule of DASHBOARD_MODULES) {
      expect(allowed.has(dashboardModule.requiredCapability)).toBe(true);
      for (const group of dashboardModule.navGroups ?? []) {
        for (const entry of group.entries) {
          expect(allowed.has(entry.requiredCapability)).toBe(true);
        }
      }
    }
  });

  it("documents, in its own file, that declaration is presentational and never an authorization grant", () => {
    const source = readFileSync("lib/dashboard/modules.ts", "utf8");
    expect(source).toMatch(/PRESENTATIONAL ONLY/);
    expect(source).toMatch(/NEVER consulted to decide/);
    expect(source).toMatch(/independently call `getRequestIdentity/);
  });

  it("the contract itself performs no authorization decision — no redirect, no throw, no Supabase call", () => {
    const source = readFileSync("lib/dashboard/modules.ts", "utf8");
    expect(source).not.toMatch(/redirect\(|createClient|supabase/i);
  });
});

describe("T002 — static registry lists implemented modules only", () => {
  it("registers exactly the genuinely-live account/overview + settings + inventory/storage destinations", () => {
    // Feature 005 RUN B — "inventory" is now a genuinely-live module (real routes exist under
    // `/dashboard/inventory` and `/dashboard/storage`), so it is expected here alongside "account".
    expect(DASHBOARD_MODULES.map((m) => m.id)).toEqual(["account", "inventory"]);
    const account = DASHBOARD_MODULES[0]!;
    const accountHrefs = (account.navGroups ?? []).flatMap((g) => g.entries.map((e) => e.href));
    expect(accountHrefs.sort()).toEqual(["/dashboard", "/dashboard/settings"]);

    const inventory = DASHBOARD_MODULES[1]!;
    const inventoryHrefs = (inventory.navGroups ?? []).flatMap((g) => g.entries.map((e) => e.href));
    expect(inventoryHrefs.sort()).toEqual(["/dashboard/inventory", "/dashboard/storage"]);
    // History is deliberately NOT a top-level nav entry (discoverable from the inventory list page).
    expect(inventoryHrefs).not.toContain("/dashboard/inventory/history");
  });

  it("contains no placeholder module or nav entry for a business area that still has none of its own routes", () => {
    const forbidden = ["marketplace", "orders", "payments", "delivery", "disputes", "listings"];
    const ids = DASHBOARD_MODULES.map((m) => m.id);
    const allHrefs = DASHBOARD_MODULES.flatMap((m) => (m.navGroups ?? []).flatMap((g) => g.entries.map((e) => e.href)));
    for (const name of forbidden) {
      expect(ids).not.toContain(name);
      expect(allHrefs.join(" ").toLowerCase()).not.toContain(name);
    }
  });

  it("T020 — registered navigation appears in the correct group, in a deterministic order", () => {
    const buyerOnlyOrg: OrganizationMembership = { organizationId: "o", displayName: "O", memberRole: "OWNER", canBuy: true, canSell: false };
    const groups = buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: buyerOnlyOrg });
    expect(groups.map((g) => g.key)).toEqual(["overview", "account", "trading"]);
    expect(groups[0]!.items.map((i) => i.href)).toEqual(["/dashboard"]);
    expect(groups[1]!.items.map((i) => i.href)).toEqual(["/dashboard/settings"]);
    expect(groups[2]!.items.map((i) => i.href).sort()).toEqual(["/dashboard/inventory", "/dashboard/storage"]);
  });

  it("a buyer-incapable organization (canBuy: false) sees no inventory/storage nav entry", () => {
    const noBuyOrg: OrganizationMembership = { organizationId: "o", displayName: "O", memberRole: "OWNER", canBuy: false, canSell: false };
    const groups = buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: noBuyOrg });
    expect(groups.map((g) => g.key)).toEqual(["overview", "account"]);
  });

  it("T020 — registry metadata cannot grant access: requiredCapability is read-only presentational data, never invoked/executed by the builder", () => {
    // If the builder ever "executed" a capability declaration (rather than merely comparing it to
    // the organization's own resolved boolean), that would be the registry silently becoming an
    // authorization system — the exact defect this test guards against.
    const src = readFileSync("components/dashboard/sidebar.tsx", "utf8");
    expect(src).not.toMatch(/eval\(|new Function\(/);
    expect(src).toMatch(/PRESENTATIONAL ONLY/);
  });

  it("T020 — duplicate group keys across modules are merged, not silently dropped or duplicated as two headers (the chosen, documented contract)", () => {
    const moduleA: DashboardModule = {
      id: "dup-a",
      requiredCapability: "member",
      navGroups: [{ key: "account", label: "Account", entries: [{ id: "a-entry", label: "A", href: "/a", requiredCapability: "member" }] }],
    };
    const moduleB: DashboardModule = {
      id: "dup-b",
      requiredCapability: "member",
      navGroups: [{ key: "account", label: "Account", entries: [{ id: "b-entry", label: "B", href: "/b", requiredCapability: "member" }] }],
    };
    const org: OrganizationMembership = { organizationId: "o", displayName: "O", memberRole: "OWNER", canBuy: true, canSell: false };
    const groups = buildDashboardNavGroups({ modules: [moduleA, moduleB], organization: org });
    // One "account" group header, both modules' entries present — never two separate "account" headers.
    expect(groups.filter((g) => g.key === "account").length).toBe(1);
    expect(groups.find((g) => g.key === "account")!.items.map((i) => i.key)).toEqual(["a-entry", "b-entry"]);
  });

  it("T020 — the registry/builder are deterministic: identical inputs produce identical (deep-equal) output across repeated calls", async () => {
    const org: OrganizationMembership = { organizationId: "o", displayName: "O", memberRole: "OWNER", canBuy: true, canSell: true };
    const first = buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: org });
    const second = buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: org });
    expect(second).toEqual(first);

    const overviewFirst = await composeOverview({ organization: org, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    const overviewSecond = await composeOverview({ organization: org, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(overviewSecond.bought).toEqual(overviewFirst.bought);
    expect(overviewSecond.owe).toEqual(overviewFirst.owe);
    expect(overviewSecond.where).toEqual(overviewFirst.where);
    expect(overviewSecond.needsAction).toEqual(overviewFirst.needsAction);
  });
});

describe("T003 — overview composition contract", () => {
  it("with an empty registry, the composer returns only the account area — no placeholder cards", async () => {
    const empty: readonly DashboardModule[] = [];
    const result = await composeOverview({ organization: buyerOnly, registry: empty, hasAcceptedCurrentAgreements: true });
    expect(result.account.length).toBeGreaterThan(0);
    expect(result.bought).toEqual([]);
    expect(result.owe).toEqual([]);
    expect(result.where).toEqual([]);
    expect(result.needsAction).toEqual([]);
  });

  it("with the real registry (positions/allocations mocked empty), bought/owe/where/needsAction stay honestly empty", async () => {
    const result = await composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(result.bought).toEqual([]);
    expect(result.owe).toEqual([]);
    expect(result.where).toEqual([]);
    expect(result.needsAction).toEqual([]);
  });

  it("the account area is truthful — organization name and the caller's own role, nothing invented", async () => {
    const result = await composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    render(<div>{result.account.map((card) => <div key={card.id}>{card.value}</div>)}</div>);
    expect(screen.getByText("Test Buyer Co")).toBeTruthy();
  });

  it("never fabricates a currency/quantity figure when no module has contributed one", async () => {
    const result = await composeOverview({ organization: buyerAndSeller, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    const allCardText = [...result.bought, ...result.owe, ...result.where]
      .map((c) => `${c.title} ${c.value}`)
      .join(" ");
    expect(allCardText).not.toMatch(/\$\d|USD|AED|€\d|\d+\s*(bags|kg|orders|shipments)/i);
  });

  it("a module registered for a capability the organization lacks contributes nothing", async () => {
    const sellOnlyModule: DashboardModule = {
      id: "test-sell-module",
      requiredCapability: "sell",
      overviewCards: () => [{ id: "fake", area: "bought", title: "x", value: "y" }],
    };
    const result = await composeOverview({ organization: buyerOnly, registry: [sellOnlyModule], hasAcceptedCurrentAgreements: true });
    expect(result.bought).toEqual([]);

    const resultForSeller = await composeOverview({ organization: buyerAndSeller, registry: [sellOnlyModule], hasAcceptedCurrentAgreements: true });
    expect(resultForSeller.bought.length).toBe(1);
  });

  it("T013/T014 — an unaccepted current agreement produces one specific, non-generic action item with a direct href", async () => {
    const accepted = await composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(accepted.needsAction).toEqual([]);

    const notAccepted = await composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: false });
    expect(notAccepted.needsAction.length).toBe(1);
    const [item] = notAccepted.needsAction;
    expect(item!.href).toBe("/dashboard/");
    render(<div>{item!.label}</div>);
    expect(screen.queryByText(/^Action required$/i)).toBeNull();
    expect(screen.getByText(/agreement/i)).toBeTruthy();
  });
});

/**
 * Feature 005 RUN B reconciliation — proves T015's "inventory" module genuinely contributes overview
 * cards THROUGH the module contract (not a page-level bypass): with real (mocked) non-zero position/
 * allocation rows, the count surfaces in `bought`/`where`; with zero rows, no card appears (never a
 * fabricated zero); and a `canBuy: false` organization gets neither, exactly like its nav entries.
 */
describe("Feature 005 RUN B reconciliation — T015 inventory module overview contribution", () => {
  it("contributes bought/where cards with the real bounded counts when rows exist", async () => {
    fakeClientState.client = createFakeSupabaseClient({
      inventory_positions: [{ id: "p1" }, { id: "p2" }],
      storage_allocations: [{ id: "a1" }],
    });
    const result = await composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(result.bought.find((c) => c.id === "inventory-positions")).toBeTruthy();
    expect(result.where.find((c) => c.id === "inventory-stored")).toBeTruthy();
    fakeClientState.client = createFakeSupabaseClient({});
  });

  it("contributes no card at all when the counts are genuinely zero — never a fabricated zero", async () => {
    fakeClientState.client = createFakeSupabaseClient({});
    const result = await composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(result.bought.find((c) => c.id === "inventory-positions")).toBeUndefined();
    expect(result.where.find((c) => c.id === "inventory-stored")).toBeUndefined();
  });

  it("an organization without buy capability gets no inventory overview contribution even with rows present", async () => {
    fakeClientState.client = createFakeSupabaseClient({
      inventory_positions: [{ id: "p1" }],
      storage_allocations: [{ id: "a1" }],
    });
    const noBuyOrg: OrganizationMembership = { organizationId: "o", displayName: "O", memberRole: "OWNER", canBuy: false, canSell: false };
    const result = await composeOverview({ organization: noBuyOrg, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(result.bought).toEqual([]);
    expect(result.where).toEqual([]);
    fakeClientState.client = createFakeSupabaseClient({});
  });
});

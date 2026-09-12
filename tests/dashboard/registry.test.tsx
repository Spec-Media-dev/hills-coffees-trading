import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DashboardModule } from "@/lib/dashboard/modules";
import { DASHBOARD_MODULES } from "@/lib/dashboard/registry";
import { composeOverview } from "@/lib/dashboard/overview";
import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import type { OrganizationMembership } from "@/lib/auth/types";

/**
 * Feature 004 T001–T003 — proves the module registration contract, the static registry, and the
 * overview composer behave exactly as the run directive requires: declaration is presentational
 * only, an unregistered module contributes nothing, and no placeholder/fake figure ever appears.
 */

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
  it("registers exactly the genuinely-live account/overview + settings destinations", () => {
    expect(DASHBOARD_MODULES.map((m) => m.id)).toEqual(["account"]);
    const account = DASHBOARD_MODULES[0]!;
    const hrefs = (account.navGroups ?? []).flatMap((g) => g.entries.map((e) => e.href));
    expect(hrefs.sort()).toEqual(["/dashboard", "/dashboard/settings"]);
  });

  it("contains no placeholder module or nav entry for an unimplemented business area", () => {
    const forbidden = ["inventory", "marketplace", "orders", "payments", "delivery", "disputes", "listings"];
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
    expect(groups.map((g) => g.key)).toEqual(["overview", "account"]);
    expect(groups[0]!.items.map((i) => i.href)).toEqual(["/dashboard"]);
    expect(groups[1]!.items.map((i) => i.href)).toEqual(["/dashboard/settings"]);
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

  it("T020 — the registry/builder are deterministic: identical inputs produce identical (deep-equal) output across repeated calls", () => {
    const org: OrganizationMembership = { organizationId: "o", displayName: "O", memberRole: "OWNER", canBuy: true, canSell: true };
    const first = buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: org });
    const second = buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: org });
    expect(second).toEqual(first);

    const overviewFirst = composeOverview({ organization: org, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    const overviewSecond = composeOverview({ organization: org, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(overviewSecond.bought).toEqual(overviewFirst.bought);
    expect(overviewSecond.owe).toEqual(overviewFirst.owe);
    expect(overviewSecond.where).toEqual(overviewFirst.where);
    expect(overviewSecond.needsAction).toEqual(overviewFirst.needsAction);
  });
});

describe("T003 — overview composition contract", () => {
  it("with an empty registry, the composer returns only the account area — no placeholder cards", () => {
    const empty: readonly DashboardModule[] = [];
    const result = composeOverview({ organization: buyerOnly, registry: empty, hasAcceptedCurrentAgreements: true });
    expect(result.account.length).toBeGreaterThan(0);
    expect(result.bought).toEqual([]);
    expect(result.owe).toEqual([]);
    expect(result.where).toEqual([]);
    expect(result.needsAction).toEqual([]);
  });

  it("with the real registry (no business modules yet), bought/owe/where/needsAction stay honestly empty", () => {
    const result = composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(result.bought).toEqual([]);
    expect(result.owe).toEqual([]);
    expect(result.where).toEqual([]);
    expect(result.needsAction).toEqual([]);
  });

  it("the account area is truthful — organization name and the caller's own role, nothing invented", () => {
    const result = composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    render(<div>{result.account.map((card) => <div key={card.id}>{card.value}</div>)}</div>);
    expect(screen.getByText("Test Buyer Co")).toBeTruthy();
  });

  it("never fabricates a currency/quantity figure when no module has contributed one", () => {
    const result = composeOverview({ organization: buyerAndSeller, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    const allCardText = [...result.bought, ...result.owe, ...result.where]
      .map((c) => `${c.title} ${c.value}`)
      .join(" ");
    expect(allCardText).not.toMatch(/\$\d|USD|AED|€\d|\d+\s*(bags|kg|orders|shipments)/i);
  });

  it("a module registered for a capability the organization lacks contributes nothing", () => {
    const sellOnlyModule: DashboardModule = {
      id: "test-sell-module",
      requiredCapability: "sell",
      overviewCards: () => [{ id: "fake", area: "bought", title: "x", value: "y" }],
    };
    const result = composeOverview({ organization: buyerOnly, registry: [sellOnlyModule], hasAcceptedCurrentAgreements: true });
    expect(result.bought).toEqual([]);

    const resultForSeller = composeOverview({ organization: buyerAndSeller, registry: [sellOnlyModule], hasAcceptedCurrentAgreements: true });
    expect(resultForSeller.bought.length).toBe(1);
  });

  it("T013/T014 — an unaccepted current agreement produces one specific, non-generic action item with a direct href", () => {
    const accepted = composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(accepted.needsAction).toEqual([]);

    const notAccepted = composeOverview({ organization: buyerOnly, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: false });
    expect(notAccepted.needsAction.length).toBe(1);
    const [item] = notAccepted.needsAction;
    expect(item!.href).toBe("/dashboard/");
    render(<div>{item!.label}</div>);
    expect(screen.queryByText(/^Action required$/i)).toBeNull();
    expect(screen.getByText(/agreement/i)).toBeTruthy();
  });
});

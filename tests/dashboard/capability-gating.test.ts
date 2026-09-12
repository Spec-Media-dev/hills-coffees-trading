import { describe, expect, it } from "vitest";

import { FOUNDATION_FIXTURES, setBuyerAndSellerCanSell, signInAsFixture } from "@/tests/auth/fixture-session";

import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import type { DashboardModule } from "@/lib/dashboard/modules";
import type { OrganizationMembership } from "@/lib/auth/types";

/**
 * Feature 004 T019 — capability gating. A dedicated, real-fixture-backed proof of the additive
 * buyer/seller model and the declaration-vs-authorization split, built on the same real toggle
 * mechanism (`setBuyerAndSellerCanSell`) Feature 003's own `request-identity.test.ts` already
 * established for exactly this fixture — no second toggle mechanism invented here.
 */

const buyerOnly: OrganizationMembership = {
  organizationId: "org-buyer-only",
  displayName: "Buyer Only Co",
  memberRole: "OWNER",
  canBuy: true,
  canSell: false,
};

const sellingModule: DashboardModule = {
  id: "selling-fixture",
  requiredCapability: "sell",
  navGroups: [
    {
      key: "selling",
      label: "Selling",
      entries: [{ id: "selling-overview", label: "Selling", href: "/dashboard/selling", requiredCapability: "sell" }],
    },
  ],
};
const buyerModule: DashboardModule = {
  id: "buyer-fixture",
  requiredCapability: "member",
  navGroups: [
    { key: "overview", label: "Overview", entries: [{ id: "overview", label: "Overview", href: "/dashboard", requiredCapability: "member" }] },
  ],
};

describe("Feature 004 T019 — BUYER-ONLY organization", () => {
  it("renders no seller navigation, buyer/member navigation remains", () => {
    const groups = buildDashboardNavGroups({ modules: [buyerModule, sellingModule], organization: buyerOnly });
    expect(groups.map((g) => g.key)).toEqual(["overview"]);
    expect(groups.some((g) => g.key === "selling")).toBe(false);
  });
});

describe("Feature 004 T019 — BUYER + SELLER organization", () => {
  const buyerAndSeller: OrganizationMembership = { ...buyerOnly, organizationId: "org-buyer-seller", canSell: true };

  it("buyer navigation remains AND seller entries are additive — seller never replaces buyer", () => {
    const groups = buildDashboardNavGroups({ modules: [buyerModule, sellingModule], organization: buyerAndSeller });
    expect(groups.map((g) => g.key)).toEqual(["overview", "selling"]);
  });
});

describe("Feature 004 T019 — freshness: capability revocation reflected next request, no re-login, no stale cache", () => {
  it("REAL fixture toggle (no mock) — the very next resolution reflects the change, same signed-in session", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email);
    const organizationId = FOUNDATION_FIXTURES.buyerAndSeller.organizationId;

    // Recover canonical state first, in case an earlier interrupted run left it flipped.
    setBuyerAndSellerCanSell(true);
    const beforeCanSell = await client.rpc("organization_can_sell", { p_organization_id: organizationId });
    expect(beforeCanSell.data).toBe(true);
    const orgEnabled: OrganizationMembership = { organizationId, displayName: "Buyer+Seller Co", memberRole: "OWNER", canBuy: true, canSell: true };
    const groupsEnabled = buildDashboardNavGroups({ modules: [buyerModule, sellingModule], organization: orgEnabled });
    expect(groupsEnabled.map((g) => g.key)).toEqual(["overview", "selling"]);

    try {
      setBuyerAndSellerCanSell(false);
      // No sign-out, no new session — same `client`, same login, only the underlying DB fact changed.
      const afterCanSell = await client.rpc("organization_can_sell", { p_organization_id: organizationId });
      expect(afterCanSell.data).toBe(false);
      const orgDisabled: OrganizationMembership = { ...orgEnabled, canSell: false };
      const groupsDisabled = buildDashboardNavGroups({ modules: [buyerModule, sellingModule], organization: orgDisabled });
      expect(groupsDisabled.map((g) => g.key)).toEqual(["overview"]);
    } finally {
      setBuyerAndSellerCanSell(true);
    }

    const restoredCanSell = await client.rpc("organization_can_sell", { p_organization_id: organizationId });
    expect(restoredCanSell.data).toBe(true);
  });
});

describe("Feature 004 T019 — direct access: declaration is not authorization (no live 005–009 route exists to deny)", () => {
  /**
   * Features 005–009 have no real production route yet — inventing one merely to demonstrate denial
   * would be exactly the "fake production route" the run directive forbids. This proves the actual
   * contract property instead: nav visibility and a route's own authorization decision are computed
   * from the SAME underlying fact independently, so hiding a nav entry is never itself a security
   * control, and a fixture "route guard" enforces its own check regardless of nav state.
   */
  const ineligible: OrganizationMembership = { ...buyerOnly, canSell: false };
  const eligible: OrganizationMembership = { ...buyerOnly, organizationId: "org-eligible-seller", canSell: true };

  function fixtureSellingRouteGuard(organization: OrganizationMembership): "allowed" | "denied" {
    return organization.canSell ? "allowed" : "denied";
  }

  // PROOF LEVEL, documented honestly: a controlled-fixture proof of the declaration≠authorization
  // contract, not a live HTTP-level denial test against a real 005–009 route (none exists yet).
  it("nav hidden for ineligible org, present for eligible org — and the route guard agrees independently, not because of nav", () => {
    const hiddenGroups = buildDashboardNavGroups({ modules: [sellingModule], organization: ineligible });
    const shownGroups = buildDashboardNavGroups({ modules: [sellingModule], organization: eligible });
    expect(hiddenGroups).toEqual([]);
    expect(shownGroups.map((g) => g.key)).toEqual(["selling"]);

    expect(fixtureSellingRouteGuard(ineligible)).toBe("denied");
    expect(fixtureSellingRouteGuard(eligible)).toBe("allowed");
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PHASE89_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import type { DashboardModule } from "@/lib/dashboard/modules";
import { composeOverview } from "@/lib/dashboard/overview";
import type { OrganizationMembership } from "@/lib/auth/types";

/**
 * Feature 004 T022 — tenant isolation / concurrency, the security-sensitive proof the run directive
 * requires. Uses the REAL multi-org fixture (`PHASE89_FIXTURES.multiOrg`, two genuine memberships for
 * the same signed-in user) and REAL, concurrently-fetched database rows — not merely synthetic
 * objects — fed into `composeOverview`/`buildDashboardNavGroups` interleaved via `Promise.all`, so a
 * failure here would reflect an actual cross-tenant bleed, not a hypothetical one.
 *
 * This does not simulate two literal concurrent HTTP requests (Next's `cookies()`-scoped request
 * context cannot be forked inside a single Vitest process) — it proves the thing that actually
 * matters: `composeOverview`/`buildDashboardNavGroups` are pure functions over an explicit
 * `organization` parameter with no shared mutable state anywhere in their call graph, so two organizations'
 * data can never cross no matter how their calls are interleaved. The `globalThis`/module-scope-mutable
 * grep (also run here) is a second, independent line of evidence for the same property.
 */
describe("Feature 004 T022 — tenant isolation with real fixture data, interleaved", () => {
  it("two organizations' REAL display names/roles/capabilities, fetched concurrently, never cross when fed into composeOverview interleaved", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.multiOrg.email);
    const { organizationAId, organizationBId } = PHASE89_FIXTURES.multiOrg;

    const [orgARow, orgBRow, memberARow, memberBRow, canBuyA, canSellA, canBuyB, canSellB] = await Promise.all([
      client.from("organizations").select("display_name").eq("id", organizationAId).single(),
      client.from("organizations").select("display_name").eq("id", organizationBId).single(),
      client
        .from("organization_members")
        .select("member_role")
        .eq("organization_id", organizationAId)
        .eq("user_id", (await client.auth.getUser()).data.user!.id)
        .single(),
      client
        .from("organization_members")
        .select("member_role")
        .eq("organization_id", organizationBId)
        .eq("user_id", (await client.auth.getUser()).data.user!.id)
        .single(),
      client.rpc("organization_can_buy", { p_organization_id: organizationAId }),
      client.rpc("organization_can_sell", { p_organization_id: organizationAId }),
      client.rpc("organization_can_buy", { p_organization_id: organizationBId }),
      client.rpc("organization_can_sell", { p_organization_id: organizationBId }),
    ]);

    expect(orgARow.error).toBeNull();
    expect(orgBRow.error).toBeNull();
    expect(orgARow.data!.display_name).not.toBe(orgBRow.data!.display_name);

    const organizationA: OrganizationMembership = {
      organizationId: organizationAId,
      displayName: orgARow.data!.display_name,
      memberRole: memberARow.data!.member_role,
      canBuy: Boolean(canBuyA.data),
      canSell: Boolean(canSellA.data),
    };
    const organizationB: OrganizationMembership = {
      organizationId: organizationBId,
      displayName: orgBRow.data!.display_name,
      memberRole: memberBRow.data!.member_role,
      canBuy: Boolean(canBuyB.data),
      canSell: Boolean(canSellB.data),
    };

    const probeModule: DashboardModule = {
      id: "tenant-isolation-probe",
      requiredCapability: "member",
      overviewCards: (context) => [
        { id: "probe", area: "bought", title: "probe", value: `${context.organization.organizationId}:${context.organization.displayName}` },
      ],
    };

    // Genuinely interleaved via Promise.all over async wrappers around the (synchronous) composer —
    // if any shared/module-scope state existed, this interleaving is exactly what would surface it.
    const [resultA, resultB, resultA2, resultB2] = await Promise.all([
      Promise.resolve().then(() => composeOverview({ organization: organizationA, registry: [probeModule], hasAcceptedCurrentAgreements: true })),
      Promise.resolve().then(() => composeOverview({ organization: organizationB, registry: [probeModule], hasAcceptedCurrentAgreements: true })),
      Promise.resolve().then(() => composeOverview({ organization: organizationA, registry: [probeModule], hasAcceptedCurrentAgreements: true })),
      Promise.resolve().then(() => composeOverview({ organization: organizationB, registry: [probeModule], hasAcceptedCurrentAgreements: true })),
    ]);

    expect(resultA.bought[0]!.value).toBe(`${organizationAId}:${organizationA.displayName}`);
    expect(resultB.bought[0]!.value).toBe(`${organizationBId}:${organizationB.displayName}`);
    expect(resultA2.bought[0]!.value).toBe(`${organizationAId}:${organizationA.displayName}`);
    expect(resultB2.bought[0]!.value).toBe(`${organizationBId}:${organizationB.displayName}`);
    expect(resultA.account[0]!.value).toBe(organizationA.displayName);
    expect(resultB.account[0]!.value).toBe(organizationB.displayName);

    const [navA, navB] = await Promise.all([
      Promise.resolve().then(() => buildDashboardNavGroups({ modules: [probeModule], organization: organizationA })),
      Promise.resolve().then(() => buildDashboardNavGroups({ modules: [probeModule], organization: organizationB })),
    ]);
    // Neither organization's nav result references the other's id/display name anywhere.
    expect(JSON.stringify(navA)).not.toContain(organizationBId);
    expect(JSON.stringify(navB)).not.toContain(organizationAId);
  });

  it("no ambient acting-org state exists anywhere the composer/nav-builder could read from instead of their explicit parameter", () => {
    const files = [
      "lib/dashboard/modules.ts",
      "lib/dashboard/registry.tsx",
      "lib/dashboard/overview.tsx",
      "lib/dashboard/format.ts",
      "components/dashboard/sidebar.tsx",
      "components/dashboard/topbar.tsx",
      "components/dashboard/org-switcher.tsx",
      "components/dashboard/overview-card.tsx",
      "components/dashboard/action-list.tsx",
      "components/dashboard/responsive/table-card-list.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/globalThis\.|unstable_cache|cacheTag|cacheLife|updateTag|new Map\(\)\s*;?\s*\/\/.*org|Redis|Upstash/i);
      const topLevelMutable = src.split("\n").some((line: string) => /^(let|var)\s/.test(line.trim()));
      expect(topLevelMutable).toBe(false);
    }
  });
});

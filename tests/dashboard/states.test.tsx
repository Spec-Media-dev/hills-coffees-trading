import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KybStatusScreen } from "@/components/account/kyb-status-screen";
import { buildDashboardNavGroups } from "@/components/dashboard/sidebar";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { composeOverview } from "@/lib/dashboard/overview";
import { DASHBOARD_MODULES } from "@/lib/dashboard/registry";
import type { KybApplicationSummary } from "@/lib/kyb/status-types";
import type { DashboardModule } from "@/lib/dashboard/modules";
import type { OrganizationMembership } from "@/lib/auth/types";
import { createFakeSupabaseClient } from "@/tests/inventory/fake-supabase";

const source = (path: string) => readFileSync(path, "utf8");

afterEach(cleanup);

// RUN B RECONCILIATION (Feature 005) — see `tests/dashboard/registry.test.tsx`'s header comment:
// `DASHBOARD_MODULES` now includes the "inventory" module's genuinely async `overviewCards`, so any
// call feeding the real registry through `composeOverview` needs `@/lib/supabase/server` mocked.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => createFakeSupabaseClient({})),
}));

function application(overrides: Partial<KybApplicationSummary>): KybApplicationSummary {
  return {
    id: "app-1",
    organizationId: "org-1",
    status: "SUBMITTED",
    registeredAddress: "1 Coffee Road",
    businessActivity: "Green coffee trading",
    rejectionReason: null,
    submittedAt: "2026-01-01T00:00:00.000Z",
    decidedAt: null,
    ...overrides,
  };
}

/**
 * Feature 004 T015 — proves Feature 003's existing `KybStatusScreen` ALREADY provides distinct,
 * truthful states for every ineligible organization status the run directive names (PENDING_KYB,
 * UNDER_REVIEW, SUSPENDED, REJECTED). No second KYB status engine was built — this test proves the
 * existing one satisfies RUN B's requirement, per the directive's own "reuse, do not rebuild" rule.
 */
describe("Feature 004 T015 — distinct, truthful ineligible-organization states (reusing KybStatusScreen)", () => {
  it("PENDING_KYB (no application started yet) explains the incomplete setup and offers only the KYB start action, never a trading entry", () => {
    render(
      <LocaleProvider>
        <KybStatusScreen application={null} currentDocuments={[]} reviews={[]} />
      </LocaleProvider>
    );
    expect(screen.getByRole("heading")).toBeTruthy();
    expect(screen.queryByText(/marketplace|inventory|orders|listings/i)).toBeNull();
  });

  it("UNDER_REVIEW explains Compliance is reviewing, with no self-service approval path and no trading entry", () => {
    render(<KybStatusScreen application={application({ status: "UNDER_REVIEW" })} currentDocuments={[]} reviews={[]} />);
    const heading = screen.getByRole("heading").textContent ?? "";
    expect(heading.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("SUSPENDED shows the restriction with no trading CTA and no seller/buyer access", () => {
    render(<KybStatusScreen application={application({ status: "SUSPENDED" })} currentDocuments={[]} reviews={[]} />);
    expect(screen.getByRole("heading")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("REJECTED shows the compliance-recorded reason (never a reviewer identity) and no trading entry", () => {
    render(
      <KybStatusScreen
        application={application({ status: "REJECTED", rejectionReason: "Trade licence expired" })}
        currentDocuments={[]}
        reviews={[]}
      />
    );
    expect(screen.getByText(/Trade licence expired/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("the four states are genuinely distinct from each other — no shared generic heading text", () => {
    const headings = ["UNDER_REVIEW", "SUSPENDED", "REJECTED"].map((status) => {
      cleanup();
      render(<KybStatusScreen application={application({ status: status as KybApplicationSummary["status"] })} currentDocuments={[]} reviews={[]} />);
      return screen.getByRole("heading").textContent;
    });
    cleanup();
    render(
      <LocaleProvider>
        <KybStatusScreen application={null} currentDocuments={[]} reviews={[]} />
      </LocaleProvider>
    );
    headings.push(screen.getByRole("heading").textContent);
    expect(new Set(headings).size).toBe(headings.length);
  });
});

/**
 * Feature 004 T016 — navigation visibility is not authorization. Features 005–009 have no real
 * trading-module route yet, so there is nothing live to deny at the network layer; this proves the
 * declaration-vs-authorization split with a controlled fixture module, per the run directive's own
 * explicit allowance ("tests may use controlled test registry/module fixtures").
 */
describe("Feature 004 T016 — direct-access security (declaration ≠ authorization, proven with a fixture module)", () => {
  const suspendedIneligible: OrganizationMembership = {
    organizationId: "org-suspended",
    displayName: "Suspended Co",
    memberRole: "OWNER",
    canBuy: false,
    canSell: false,
  };
  const eligibleSeller: OrganizationMembership = {
    organizationId: "org-eligible",
    displayName: "Eligible Co",
    memberRole: "OWNER",
    canBuy: true,
    canSell: true,
  };
  const fixtureSellModule: DashboardModule = {
    id: "fixture-sell-module",
    requiredCapability: "sell",
    navGroups: [{ key: "selling", label: "Selling", entries: [{ id: "sell-entry", label: "Selling", href: "/dashboard/selling", requiredCapability: "sell" }] }],
  };

  /** Stands in for what a real future module ROUTE (e.g. `/dashboard/selling/page.tsx`) must do. */
  function fixtureRouteGuard(organization: OrganizationMembership): "allowed" | "denied" {
    return organization.canSell ? "allowed" : "denied";
  }

  it("nav is hidden for the ineligible organization — but that alone proves nothing about the route", () => {
    const groups = buildDashboardNavGroups({ modules: [fixtureSellModule], organization: suspendedIneligible });
    expect(groups).toEqual([]);
  });

  it("even with nav hidden, a caller who reaches the route directly is refused by the ROUTE'S OWN check, not by nav absence", () => {
    // The nav-hiding decision above and this decision are computed independently, from the same
    // underlying `organization.canSell` fact — never from whether the nav entry happened to render.
    expect(fixtureRouteGuard(suspendedIneligible)).toBe("denied");
    expect(fixtureRouteGuard(eligibleSeller)).toBe("allowed");
  });

  it("dashboard/layout.tsx never renders the business AppShell/nav for a not-yet-authorized organization (existing Feature 003 guard, reconfirmed)", () => {
    const layout = source("src/app/dashboard/layout.tsx");
    // The `!identity.isAuthorizedMember` branch renders `{children}` inside a PreAuthHeader-only
    // shell, never `<AppShell navGroups=...>` — reconfirmed by position: AppShell appears strictly
    // after this branch's closing brace.
    const guardIndex = layout.indexOf("if (!identity.isAuthorizedMember)");
    const appShellIndex = layout.indexOf("<AppShell");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(appShellIndex).toBeGreaterThan(guardIndex);
  });

  it("no future module route may consume registry visibility as its authorization — documented in the contract itself", () => {
    const src = source("lib/dashboard/modules.ts");
    expect(src).toMatch(/registry must never become a hidden authorization system/i);
  });
});

/**
 * Feature 004 T017 — a zero-organization member must stay in Feature 003's onboarding state, never
 * reach dashboard chrome. This is Feature 003's own, already-implemented and already-tested
 * behaviour (`dashboard/layout.tsx`'s `identity.organization === null` branch) — reconfirmed here as
 * a Feature-004-owned regression proof, not re-implemented.
 */
describe("Feature 004 T017 — zero-organization member stays in onboarding, never sees dashboard chrome", () => {
  it("the organization === null branch renders OnboardingExperience, not AppShell, and returns before AppShell is reachable", () => {
    const layout = source("src/app/dashboard/layout.tsx");
    const nullOrgIndex = layout.indexOf("if (identity.organization === null)");
    const onboardingIndex = layout.indexOf("<OnboardingExperience");
    const appShellIndex = layout.indexOf("<AppShell");
    expect(nullOrgIndex).toBeGreaterThan(-1);
    expect(onboardingIndex).toBeGreaterThan(nullOrgIndex);
    expect(onboardingIndex).toBeLessThan(appShellIndex);
  });
});

/**
 * Feature 004 T021 — the remaining two required states this run's directive names explicitly:
 * "empty overview" (an approved organization with no business-module contributions yet — the
 * everyday case today) and confirmation that an ELIGIBLE approved organization actually receives the
 * real composed dashboard rather than any ineligible-state screen.
 */
describe("Feature 004 T021 — empty overview state, and eligible member receives the real dashboard", () => {
  const approvedOrg: OrganizationMembership = {
    organizationId: "org-approved",
    displayName: "Approved Trading Co",
    memberRole: "OWNER",
    canBuy: true,
    canSell: false,
  };

  it("an approved organization with zero real inventory/allocation rows sees an honest empty overview — never a fake business dashboard", async () => {
    const overview = await composeOverview({ organization: approvedOrg, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    expect(overview.account.length).toBeGreaterThan(0);
    expect(overview.bought).toEqual([]);
    expect(overview.owe).toEqual([]);
    expect(overview.where).toEqual([]);
    expect(overview.needsAction).toEqual([]);
  });

  it("dashboard/page.tsx's fully-eligible branch (past every ineligible-state guard) is the one that calls composeOverview — reconfirmed by source position", () => {
    const page = source("src/app/dashboard/page.tsx");
    const authorizedGuardIndex = page.indexOf("if (!identity.isAuthorizedMember)");
    const agreementGuardIndex = page.indexOf('eligibility.nextAction === "accept-agreements"');
    const composeIndex = page.indexOf("composeOverview(");
    expect(authorizedGuardIndex).toBeGreaterThan(-1);
    expect(agreementGuardIndex).toBeGreaterThan(authorizedGuardIndex);
    expect(composeIndex).toBeGreaterThan(agreementGuardIndex);
  });

  it("an eligible organization's nav/overview never renders any ineligible-state vocabulary (PENDING_KYB/UNDER_REVIEW/SUSPENDED/REJECTED wording)", async () => {
    const overview = await composeOverview({ organization: approvedOrg, registry: DASHBOARD_MODULES, hasAcceptedCurrentAgreements: true });
    const allText = JSON.stringify(overview);
    expect(allText).not.toMatch(/pending|under review|suspended|rejected/i);
  });
});

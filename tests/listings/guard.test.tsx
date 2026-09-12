import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/locale/locale-provider";
import type { RequestIdentity } from "@/lib/auth/types";

const source = (path: string) => readFileSync(path, "utf8");

/** The layout's own header doc comment narrates every guard branch in prose (including the exact
 * guard conditions and `lib/listings/browse.ts` by name, to explain why it is never imported) — a
 * legitimate use of the forbidden vocabulary to document its absence. Ordering/"must not contain"
 * checks below run against the CODE only, mirroring `tests/inventory/run-b-ui.test.tsx`'s
 * established `stripComments` precedent, so the doc comment's own narration never produces a false
 * positive or a wrong index. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Feature 006 T007 RECONCILIATION — the private marketplace access boundary moved from
 * `src/app/dashboard/coffee/page.tsx` to `src/app/dashboard/coffee/layout.tsx`, so it is INHERITED by
 * every current and future route under `/dashboard/coffee/*` (notably Phase 3's
 * `/dashboard/coffee/[offerId]`) rather than something each page must remember to repeat — see
 * `layout.tsx`'s own header for why the parent `dashboard/layout.tsx` alone is not sufficient (it
 * deliberately renders `{children}` for a not-yet-authorized organization, by RUN B/T016–T022's own
 * design, to allow `/dashboard/kyb/` to render).
 */
describe("T007 — authorization happens before any listing read (source-position proof, now on layout.tsx)", () => {
  const layout = source("src/app/dashboard/coffee/layout.tsx");
  const code = stripComments(layout);

  it("resolves identity FIRST, before any other branch", () => {
    const identityIndex = code.indexOf("getRequestIdentity()");
    const unauthorizedGuardIndex = code.indexOf('identity.kind !== "authenticated"');
    expect(identityIndex).toBeGreaterThan(-1);
    expect(unauthorizedGuardIndex).toBeGreaterThan(identityIndex);
  });

  it("the anonymous/unattached guard returns before the membership guard runs", () => {
    const unauthorizedGuardIndex = code.indexOf('identity.kind !== "authenticated"');
    const unauthorizedReturnIndex = code.indexOf('<StateScreen kind="unauthorized" />');
    const membershipGuardIndex = code.indexOf("!identity.isAuthorizedMember");
    expect(unauthorizedReturnIndex).toBeGreaterThan(unauthorizedGuardIndex);
    expect(membershipGuardIndex).toBeGreaterThan(unauthorizedReturnIndex);
  });

  it("the not-yet-authorized-member branch renders KybStatusScreen and returns WITHOUT rendering {children}", () => {
    const membershipGuardIndex = code.indexOf("!identity.isAuthorizedMember");
    const kybScreenIndex = code.indexOf("<KybStatusScreen");
    const childrenIndex = code.indexOf("<>{children}</>");
    expect(kybScreenIndex).toBeGreaterThan(membershipGuardIndex);
    expect(childrenIndex).toBeGreaterThan(kybScreenIndex);
  });

  it("never imports lib/listings/browse (or manage) in actual code — the guard reads no listing data at all", () => {
    expect(code).not.toMatch(/lib\/listings\/(browse|manage)/);
    expect(code).not.toMatch(/^import.*from ["']@\/lib\/listings/m);
  });

  it("reuses the existing KybStatusScreen/StateScreen components — no second authentication/status system", () => {
    expect(layout).toMatch(/import\s*\{\s*KybStatusScreen\s*\}\s*from\s*["']@\/components\/account\/kyb-status-screen["']/);
    expect(layout).toMatch(/import\s*\{\s*StateScreen\s*\}\s*from\s*["']@\/components\/layout\/state-screen["']/);
  });

  it("is a Server Component (no \"use client\"), never fetches then hides — no client-side redirect pattern", () => {
    expect(layout).not.toMatch(/^"use client"/m);
    expect(layout).not.toMatch(/useRouter\(\)\.push|router\.push/);
  });

  it("declares no cache directive and no service-role usage", () => {
    expect(layout).not.toMatch(/unstable_cache|cacheTag|cacheLife|updateTag|"use cache"|SERVICE_ROLE|service_role/i);
  });

  it("declares no Server Action / mutation", () => {
    expect(layout).not.toMatch(/"use server"|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});

describe("T007 reconciliation — page.tsx no longer duplicates the guard (lives in exactly one place)", () => {
  const page = source("src/app/dashboard/coffee/page.tsx");

  it("page.tsx performs no identity check of its own — it is reachable only after layout.tsx's guard passes", () => {
    expect(page).not.toMatch(/getRequestIdentity/);
    expect(page).not.toMatch(/isAuthorizedMember/);
  });

  it("RUN B (T009) — page.tsx now legitimately reads listing data, but ONLY through the read layer (never a raw table query), and still performs no identity check of its own", () => {
    expect(page).toMatch(/from ["']@\/lib\/listings\/browse["']/);
    expect(page).not.toMatch(/\.from\(\s*["']coffee_offers["']\s*\)/);
  });
});

describe("T007 reconciliation — dashboard/layout.tsx's own guard still applies above this one (Feature 003/004 architecture reconfirmed, not duplicated)", () => {
  it("layout.tsx never renders AppShell/nav for a not-yet-authorized organization", () => {
    const dashboardLayout = source("src/app/dashboard/layout.tsx");
    const guardIndex = dashboardLayout.indexOf("if (!identity.isAuthorizedMember)");
    const appShellIndex = dashboardLayout.indexOf("<AppShell");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(appShellIndex).toBeGreaterThan(guardIndex);
  });

  it("confirms WHY the marketplace-specific guard cannot rely on dashboard/layout.tsx alone — it deliberately renders {children} for a not-yet-authorized org", () => {
    const dashboardLayout = source("src/app/dashboard/layout.tsx");
    const guardIndex = dashboardLayout.indexOf("if (!identity.isAuthorizedMember)");
    const childrenIndex = dashboardLayout.indexOf("{children}", guardIndex);
    const appShellIndex = dashboardLayout.indexOf("<AppShell");
    // `{children}` renders INSIDE the not-yet-authorized branch, strictly before the AppShell return —
    // proving a not-yet-authorized organization's request DOES reach nested page/layout components.
    expect(childrenIndex).toBeGreaterThan(guardIndex);
    expect(childrenIndex).toBeLessThan(appShellIndex);
  });
});

/**
 * T007 reconciliation — the functional inheritance proof the closure directive required: a
 * REPRESENTATIVE nested child (standing in for ANY current or future page under `/dashboard/coffee/*`,
 * including Phase 3's not-yet-built `/dashboard/coffee/[offerId]/page.tsx`) is passed directly into
 * `MarketplaceLayout` as `children`. This proves the inheritance mechanism structurally — Next.js
 * never invokes a child Server Component unless its parent's returned tree includes it, so ANY future
 * page placed under this layout gets the identical guarantee with zero code of its own, not merely
 * "the current page happens to check first."
 */
describe("T007 reconciliation — a representative nested child cannot render (or read listing data) without passing the guard", () => {
  const mocks = vi.hoisted(() => ({
    identity: { kind: "anonymous" } as RequestIdentity,
  }));

  vi.mock("@/lib/auth/dal", () => ({
    getRequestIdentity: vi.fn(async () => mocks.identity),
  }));
  vi.mock("@/lib/kyb/status", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kyb/status")>();
    return { ...actual, getKybWorkspace: vi.fn(async () => ({ application: null, documents: [] })) };
  });
  vi.mock("@/lib/kyb/review-items", () => ({
    listKybDocumentReviews: vi.fn(async () => ({ ok: true as const, reviews: [] })),
  }));

  const organization = {
    organizationId: "org-1",
    displayName: "Test Org",
    memberRole: "OWNER",
    canBuy: true,
    canSell: false,
  };

  const authenticatedBase = {
    kind: "authenticated" as const,
    userId: "user-1",
    profile: { fullName: "Test User", companyName: null },
    organizations: [organization],
    requiresOrganizationSelection: false,
    isEmailVerified: true,
    operationalRoles: [],
    hasAcceptedCurrentAgreements: true,
    requiresMfaStepUp: false,
  };

  async function renderLayoutWithChild(identity: RequestIdentity) {
    mocks.identity = identity;
    const { default: MarketplaceLayout } = await import("@/src/app/dashboard/coffee/layout");
    const element = await MarketplaceLayout({ children: <div data-testid="nested-listing-read">a future nested page&apos;s listing content</div> });
    // KybStatusScreen's no-application branch renders `StartKybVerificationButton`, which reads
    // locale context — wrapped unconditionally so every identity branch below renders the same way.
    render(<LocaleProvider>{element}</LocaleProvider>);
  }

  it("anonymous: the nested child never renders — no listing read is reachable", async () => {
    await renderLayoutWithChild({ kind: "anonymous" });
    expect(screen.queryByTestId("nested-listing-read")).toBeNull();
  });

  it("authenticated but unattached (organization: null): the nested child never renders", async () => {
    await renderLayoutWithChild({ ...authenticatedBase, organization: null, isAuthorizedMember: false });
    expect(screen.queryByTestId("nested-listing-read")).toBeNull();
  });

  it("pending KYB (isAuthorizedMember: false): the nested child never renders — KybStatusScreen shows instead", async () => {
    await renderLayoutWithChild({ ...authenticatedBase, organization, isAuthorizedMember: false });
    expect(screen.queryByTestId("nested-listing-read")).toBeNull();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  });

  it("suspended (isAuthorizedMember: false — same field this codebase uses for every not-yet-authorized state): the nested child never renders", async () => {
    await renderLayoutWithChild({ ...authenticatedBase, organization: { ...organization, canBuy: false }, isAuthorizedMember: false });
    expect(screen.queryByTestId("nested-listing-read")).toBeNull();
  });

  it("authorized active member: the nested child DOES render — this is the only branch any future page's listing read can ever reach", async () => {
    await renderLayoutWithChild({ ...authenticatedBase, organization, isAuthorizedMember: true });
    expect(screen.getByTestId("nested-listing-read")).toBeTruthy();
  });
});

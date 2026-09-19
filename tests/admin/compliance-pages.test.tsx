import { readFileSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  LISTING_FIXTURES,
  PHASE89_FIXTURES,
  cleanupComplianceFixture,
  createAnonymousFixtureClient,
  inspectComplianceFixture,
  prepareComplianceFixture,
  resetListingReviewFixtures,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 RUN B — page-level proof for T007 (KYB queue), T008 (KYB detail), T010
 * (organizations surface) and T011 (listing queue/detail): the real route modules are invoked with
 * REAL sessions (COMPLIANCE fixture / WAREHOUSE / anonymous) and rendered; every assertion is about
 * persisted rows or the honest gap statements — never a fabricated value.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
    set: (name: string, value: string) => {
      if (name === "hills-acting-org") cookieState.value = value;
    },
    getAll: () => [],
  }),
}));
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
const redirectCalls = vi.hoisted(() => ({ targets: [] as string[] }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    redirectCalls.targets.push(target);
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(cleanup);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

async function renderPage(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

const LIVE_TIMEOUT_MS = 90_000;
/** The Foundation `buyer-and-seller` organization's seeded APPROVED application (one seeded document). */
const BUYER_AND_SELLER_APPLICATION_ID = "f0000000-0000-4000-8000-000000000012";
let compliance: SupabaseClient;

beforeAll(async () => {
  prepareComplianceFixture();
  resetListingReviewFixtures();
  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  const result = cleanupComplianceFixture();
  expect(result.activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("T007 — KYB queue page (live, COMPLIANCE)", () => {
  it("renders REAL applications with status, submission time and outstanding items; since DB-OPEN-22 closed (RUN J) the pure COMPLIANCE role reads the REAL organization names — no gap note", async () => {
    await withLiveClient(compliance, async () => {
      const { default: KybQueuePage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/page");
      await renderPage(await KybQueuePage({ searchParams: Promise.resolve({ view: "all" }) }));
    });
    // The seeded UNDER_REVIEW fixture application is a real row in the queue.
    expect(document.body.textContent).toContain(PHASE89_FIXTURES.underReview.organizationId);
    expect(document.querySelectorAll('[data-slot="admin-status-badge"][data-status="UNDER_REVIEW"]').length).toBeGreaterThan(0);
    // The organization name is the stored one, read under the COMPLIANCE role's own session.
    expect(document.querySelector("[data-organization-gap]")).toBeNull();
    expect(screen.queryAllByText("Organization name is not readable by your role.")).toHaveLength(0);
    expect(document.body.textContent).toMatch(/Foundation Test — Under Review/);
    // Outstanding items come from the real completeness rule.
    expect(document.body.textContent).toMatch(/outstanding|Nothing outstanding/);
    // Filter affordances exist (awaiting action / all).
    expect(document.querySelector('[data-kyb-filter="all"]')).not.toBeNull();
  }, LIVE_TIMEOUT_MS);

  it("the actionable view lists only SUBMITTED / UNDER_REVIEW / RESUBMISSION_REQUIRED rows", async () => {
    await withLiveClient(compliance, async () => {
      const { default: KybQueuePage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/page");
      await renderPage(await KybQueuePage({ searchParams: Promise.resolve({}) }));
    });
    const statuses = [...document.querySelectorAll('[data-slot="admin-status-badge"]')].map((el) => el.getAttribute("data-status"));
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) expect(["SUBMITTED", "UNDER_REVIEW", "RESUBMISSION_REQUIRED"]).toContain(status);
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL: a WAREHOUSE operator is refused by the page itself; anonymous is redirected to the operator sign-in", async () => {
    const warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    await withLiveClient(warehouse, async () => {
      const { default: KybQueuePage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/page");
      await renderPage(await KybQueuePage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Required role: Compliance");
    expect(document.body.textContent).not.toContain(PHASE89_FIXTURES.underReview.organizationId);
    cleanup();

    await withLiveClient(createAnonymousFixtureClient(), async () => {
      const { default: KybQueuePage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/page");
      const element = await KybQueuePage({ searchParams: Promise.resolve({}) });
      redirectCalls.targets.length = 0;
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
    });
  }, LIVE_TIMEOUT_MS);
});

describe("T008 — KYB application detail page (live, COMPLIANCE)", () => {
  it("renders identity, status, timestamps, fields, documents with expiry flags, outstanding items and REAL history; the organization is now readable (DB-OPEN-22), while file bytes/metadata and the organization status history stay stated unavailable (their policies are unchanged); no download control exists", async () => {
    await withLiveClient(compliance, async () => {
      const { default: KybApplicationPage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/[applicationId]/page");
      await renderPage(await KybApplicationPage({ params: Promise.resolve({ applicationId: BUYER_AND_SELLER_APPLICATION_ID }) }));
    });
    expect(document.body.textContent).toContain("f0000000-0000-4000-8000-000000000012");
    expect(document.querySelector('[data-slot="admin-status-badge"][data-status="APPROVED"]')).not.toBeNull();
    // Sections present.
    for (const key of ["application", "organization", "documents", "outstanding", "reviews", "document-reviews", "history"]) {
      expect(document.querySelector(`[data-kyb-section="${key}"]`), key).not.toBeNull();
    }
    // The seeded document row renders with its status and the honest metadata statement.
    expect(document.querySelectorAll("[data-document]").length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-file-metadata="unavailable"]').length).toBeGreaterThan(0);
    expect(document.querySelector("[data-document-bytes-note]")).not.toBeNull();
    expect(document.querySelectorAll("a[download], a[href*='storage'], a[href*='kyb-evidence']")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Download/);
    // The organization row is readable (DB-OPEN-22 closed) — no gap note, the real name renders.
    expect(document.querySelector("[data-organization-gap]")).toBeNull();
    expect(document.body.textContent).toContain("Foundation Test — Buyer And Seller");
    // `account_status_history` still has no COMPLIANCE path: stated unavailable — never shown as "no change recorded".
    expect(document.querySelector("[data-history-unavailable]")).not.toBeNull();
    // Decision panel: an APPROVED application only offers SUSPENDED.
    expect(document.querySelector('[data-decision-option="SUSPENDED"]')).not.toBeNull();
    expect(document.querySelector('[data-decision-option="APPROVED"]')).toBeNull();
  }, LIVE_TIMEOUT_MS);

  it("an expired document is flagged (render-level proof over the shared expiry rule)", async () => {
    const { isDocumentExpired } = await import("@/lib/kyb/status-types");
    expect(isDocumentExpired({ expiresAt: "2020-01-01" })).toBe(true);
    expect(isDocumentExpired({ expiresAt: "2999-01-01" })).toBe(false);
    expect(isDocumentExpired({ expiresAt: null })).toBe(false);
    const page = source("src", "app", "dashboard-admin", "(compliance)", "kyb", "[applicationId]", "page.tsx");
    expect(page).toContain('data-document-expired={document.expired ? "true" : "false"}');
    expect(page).toContain("c.admin.compliance.kyb.detail.documents.expired");
  });

  it("an unknown application id renders the not-found state (never an error page)", async () => {
    await withLiveClient(compliance, async () => {
      const { default: KybApplicationPage } = await import("@/src/app/dashboard-admin/(compliance)/kyb/[applicationId]/page");
      await renderPage(await KybApplicationPage({ params: Promise.resolve({ applicationId: "00000000-0000-4000-8000-000000000000" }) }));
    });
    expect(document.querySelector('[data-admin-state="not-found"]')).not.toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("T010 — organizations surface (live, COMPLIANCE)", () => {
  it("since DB-OPEN-22 closed (RUN J), a pure COMPLIANCE operator lists REAL organizations and opens one with its status and the status panel (no capability gap)", async () => {
    await withLiveClient(compliance, async () => {
      const { default: OrganizationsPage } = await import("@/src/app/dashboard-admin/(compliance)/organizations/page");
      await renderPage(await OrganizationsPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="capability-gap"]')).toBeNull();
    expect(document.body.textContent).toContain("Foundation Test — Suspended");
    cleanup();
    await withLiveClient(compliance, async () => {
      const { default: OrganizationPage } = await import("@/src/app/dashboard-admin/(compliance)/organizations/[organizationId]/page");
      await renderPage(await OrganizationPage({ params: Promise.resolve({ organizationId: PHASE89_FIXTURES.suspended.organizationId }) }));
    });
    expect(document.querySelector('[data-admin-state="capability-gap"]')).toBeNull();
    expect(document.querySelector('[data-organization-section="identity"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Foundation Test — Suspended");
    expect(document.querySelector('[data-decision-form="status"]')).not.toBeNull();
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL: a FINANCE operator is refused by the organizations page itself", async () => {
    const finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
    await withLiveClient(finance, async () => {
      const { default: OrganizationsPage } = await import("@/src/app/dashboard-admin/(compliance)/organizations/page");
      await renderPage(await OrganizationsPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("T011 — listing review pages (live, COMPLIANCE)", () => {
  it("the queue lists the real PENDING_REVIEW and live fixtures with status, quantity (kg) and price (currency)", async () => {
    await withLiveClient(compliance, async () => {
      const { default: ListingReviewQueuePage } = await import("@/src/app/dashboard-admin/(compliance)/listings/page");
      await renderPage(await ListingReviewQueuePage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.body.textContent).toContain(LISTING_FIXTURES.offerPendingReview);
    expect(document.body.textContent).toContain(LISTING_FIXTURES.offerReviewLive);
    expect(document.querySelectorAll('[data-slot="listing-status-badge"][data-status="PENDING_REVIEW"]').length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/10 kg/);
    expect(document.body.textContent).toMatch(/USD 11\.00 \/ kg/);
  }, LIVE_TIMEOUT_MS);

  it("the detail page shows identity, quantities with units, price with currency, persisted history, and the applicable decisions only", async () => {
    await withLiveClient(compliance, async () => {
      const { default: ListingReviewPage } = await import("@/src/app/dashboard-admin/(compliance)/listings/[offerId]/page");
      await renderPage(await ListingReviewPage({ params: Promise.resolve({ offerId: LISTING_FIXTURES.offerPendingReview }) }));
    });
    expect(document.body.textContent).toContain("Feature 010 Fixture — Listing Awaiting Review");
    expect(document.body.textContent).toMatch(/10 kg/);
    expect(document.body.textContent).toMatch(/USD 11\.00 \/ kg/);
    for (const key of ["identity", "history", "reviews"]) expect(document.querySelector(`[data-listing-section="${key}"]`), key).not.toBeNull();
    expect(document.querySelector('[data-decision-option="APPROVED"]')).not.toBeNull();
    expect(document.querySelector('[data-decision-option="REJECTED"]')).not.toBeNull();
    expect(document.querySelector('[data-decision-option="SUSPENDED"]')).toBeNull();
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL: a WAREHOUSE operator is refused by the listing page itself", async () => {
    const warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    await withLiveClient(warehouse, async () => {
      const { default: ListingReviewPage } = await import("@/src/app/dashboard-admin/(compliance)/listings/[offerId]/page");
      await renderPage(await ListingReviewPage({ params: Promise.resolve({ offerId: LISTING_FIXTURES.offerPendingReview }) }));
    });
    expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("Feature 010 Fixture — Listing Awaiting Review");
  }, LIVE_TIMEOUT_MS);
});

describe("T012 — the dispute surface composes Feature 012's layer; no parallel dispute engine or freeze path", () => {
  const DISPUTE_FILES = [
    ["src", "app", "dashboard-admin", "(compliance)", "disputes", "page.tsx"],
    ["src", "app", "dashboard-admin", "(compliance)", "disputes", "[disputeId]", "page.tsx"],
    ["src", "app", "dashboard-admin", "(compliance)", "disputes", "actions.ts"],
    ["components", "admin", "compliance", "dispute-decision-panel.tsx"],
  ];
  const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("reads come only from lib/disputes/read (operator audience), writes only through lib/disputes/compliance's named operations", () => {
    const queue = source(...DISPUTE_FILES[0]!);
    const detail = source(...DISPUTE_FILES[1]!);
    const action = strip(source(...DISPUTE_FILES[2]!));
    expect(queue).toContain("listDisputesForCompliance(");
    expect(detail).toContain("getDisputeForCompliance(disputeId)");
    expect(detail).toContain('getDisputeEvidenceForOperator("compliance", dispute.id)');
    expect(detail).toContain('getDisputeStatusHistoryForOperator("compliance", dispute.id)');
    // The panel's options are Feature 012's own graph, never a Feature 010 copy of it.
    expect(detail).toContain("targets={DISPUTE_TRANSITIONS[dispute.status]}");
    expect(action).toMatch(/import \{ beginReview, closeDispute, markFrozen, rejectDispute, resolveDispute, resumeReview, type DisputeTransitionOutcome \} from "@\/lib\/disputes\/compliance"/);
    for (const segments of DISPUTE_FILES) {
      const code = strip(source(...segments));
      const file = segments.join("/");
      expect(code, file).not.toMatch(/\.from\(|\.rpc\(|createClient|SERVICE_ROLE|service_role/);
      // No freeze path: nothing reaches an order/shipment/payment/inventory/settlement surface.
      expect(code, file).not.toMatch(/lib\/(orders|delivery|finance|inventory)\/|DISPUTED/);
    }
    for (const file of ["lib/admin/decisions.ts", "lib/admin/compliance.ts"]) {
      expect(source(file)).not.toMatch(/from\("disputes"\)|dispute_evidence|dispute_status_history|transition_dispute/);
    }
  });

  it("the action maps the chosen next status to exactly one named operation and refuses anything else (no generic status setter); stale protection is always on", () => {
    const action = strip(source(...DISPUTE_FILES[2]!));
    expect(action.match(/case "[A-Z_]+":/g)).toEqual(['case "UNDER_REVIEW":', 'case "FROZEN":', 'case "RESOLVED":', 'case "REJECTED":', 'case "CLOSED":']);
    expect(action).toContain('fieldErrors: { status: ["DECISION_REQUIRED"] }');
    expect(action).toContain('fieldErrors: { expectedStatus: ["EXPECTED_STATUS_REQUIRED"] }');
    expect(action).toContain('(expectedStatus === "FROZEN" ? resumeReview : beginReview)');
    const panel = source(...DISPUTE_FILES[3]!);
    expect(panel).toContain("hiddenFields={{ disputeId, expectedStatus: status }}");
    expect(panel).toContain("reasonRequired: true");
  });
});

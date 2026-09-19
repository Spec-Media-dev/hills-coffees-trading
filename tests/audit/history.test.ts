import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  INVENTORY_FIXTURES,
  LISTING_FIXTURES,
  PHASE89_FIXTURES,
  cleanupAuditorFixture,
  cleanupCatalogueAdminFixture,
  cleanupComplianceFixture,
  createAnonymousFixtureClient,
  inspectAuditorFixture,
  inspectCatalogueAdminFixture,
  inspectComplianceFixture,
  prepareAuditorFixture,
  prepareCatalogueAdminFixture,
  prepareComplianceFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 012 RUN C — LIVE audience proof for T013 (`lib/audit/history.ts`) and T015
 * (`lib/audit/access.ts`), table by table, against the live policies — every read goes through the
 * real module under a real password-grant session; nothing is written.
 *
 * Standing data used (never modified): Org B's own orders that already carry `order_status_history`
 * rows (Feature 007 checkout residue); the HILLS review listing `offerPendingReview` and its
 * `listing_status_history`; the SUSPENDED fixture organization's `account_status_history`; Feature
 * 005's ownership events (Org A / Org B / Org C parties). Operators: standing WAREHOUSE/FINANCE plus
 * three human-authorized DISPOSABLE principals — COMPLIANCE, AUDITOR, ADMIN (role exactly ADMIN) —
 * all de-privileged in `afterAll`.
 *
 * KNOWN, PRE-EXISTING VERIFICATION GAP (recorded, not faked): the listing-history "owning seller"
 * branch cannot be exercised live — no member-owned listing can exist (Feature 006's own recorded
 * gap: no settled MEMBER_SELLER provenance; the Hills org has no sign-in member).
 */

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

async function as<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  cookieState.value = undefined;
  vi.resetModules();
  return run();
}

const LIVE_TIMEOUT_MS = 180_000;
const ORG_A = INVENTORY_FIXTURES.orgA.organizationId;
const ORG_B = INVENTORY_FIXTURES.orgB.organizationId;
const ORG_C = INVENTORY_FIXTURES.orgC.organizationId;
const SUSPENDED_ORG = PHASE89_FIXTURES.suspended.organizationId;
const LISTING = LISTING_FIXTURES.offerPendingReview;

const clients = {} as Record<"orgA" | "orgB" | "orgC" | "suspended" | "warehouse" | "finance" | "compliance" | "auditor" | "admin" | "anonymous", SupabaseClient>;
let orgBOrderWithHistory: string;

const history = () => import("@/lib/audit/history");

beforeAll(async () => {
  prepareComplianceFixture();
  prepareAuditorFixture();
  prepareCatalogueAdminFixture();
  clients.orgA = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  clients.orgB = await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email);
  clients.orgC = await signInAsFixture(INVENTORY_FIXTURES.orgC.email);
  clients.suspended = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
  clients.warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  clients.finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  clients.compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  clients.auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  clients.admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  clients.anonymous = createAnonymousFixtureClient();

  // Locate, under Org B's OWN session, one of its orders that already has history (read-only).
  const { data } = await clients.orgB.from("order_status_history").select("order_id, orders!inner(buyer_organization_id)").eq("orders.buyer_organization_id", ORG_B).limit(1);
  if (!data?.[0]) throw new Error("Standing fixture missing: no Org B order with order_status_history");
  orgBOrderWithHistory = data[0].order_id as string;
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  expect(cleanupComplianceFixture().activeAdminPrivilege).toBe(false);
  expect(cleanupAuditorFixture().activeAdminPrivilege).toBe(false);
  expect(cleanupCatalogueAdminFixture().activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);
  expect(inspectAuditorFixture().activeCapability).toBe(false);
  expect(inspectCatalogueAdminFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("ORDER HISTORY — can_view_order(order_id)", () => {
  it("the participant (buyer org) and ADMIN read it; the unrelated org, COMPLIANCE, AUDITOR, WAREHOUSE, FINANCE and anonymous get nothing", async () => {
    const participant = await as(clients.orgB, async () => (await history()).readOrderStatusHistory(orgBOrderWithHistory));
    expect(participant.length).toBeGreaterThan(0);
    for (const row of participant) {
      expect(row.subjectId).toBe(orgBOrderWithHistory);
      expect(row).not.toHaveProperty("correlationId"); // the table has no correlation column — none is invented
    }
    const admin = await as(clients.admin, async () => (await history()).readOrderStatusHistory(orgBOrderWithHistory));
    expect(admin.map((row) => row.id)).toEqual(participant.map((row) => row.id));

    for (const key of ["orgA", "compliance", "auditor", "warehouse", "finance", "anonymous"] as const) {
      const rows = await as(clients[key], async () => (await history()).readOrderStatusHistory(orgBOrderWithHistory));
      expect(rows, key).toEqual([]);
    }
  }, LIVE_TIMEOUT_MS);
});

describe("LISTING HISTORY — seller-org member / platform admin; compliance / auditor", () => {
  it("COMPLIANCE, AUDITOR and ADMIN read the Hills listing's history; every member org, WAREHOUSE, FINANCE and anonymous get nothing", async () => {
    const compliance = await as(clients.compliance, async () => (await history()).readListingStatusHistory(LISTING));
    expect(compliance.length).toBeGreaterThan(0);
    expect(compliance.every((row) => row.subjectId === LISTING)).toBe(true);
    for (const key of ["auditor", "admin"] as const) {
      const rows = await as(clients[key], async () => (await history()).readListingStatusHistory(LISTING));
      expect(rows.length, key).toBe(compliance.length);
    }
    for (const key of ["orgA", "orgB", "orgC", "warehouse", "finance", "anonymous"] as const) {
      const rows = await as(clients[key], async () => (await history()).readListingStatusHistory(LISTING));
      expect(rows, key).toEqual([]);
    }
  }, LIVE_TIMEOUT_MS);
});

describe("ACCOUNT HISTORY — is_org_member(organization_id) OR is_platform_admin()", () => {
  it("the organization's own member and ADMIN read it; other orgs, COMPLIANCE and AUDITOR (not granted by the policy) get nothing", async () => {
    const own = await as(clients.suspended, async () => (await history()).readAccountStatusHistory(SUSPENDED_ORG));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((row) => row.subjectId === SUSPENDED_ORG)).toBe(true);
    const admin = await as(clients.admin, async () => (await history()).readAccountStatusHistory(SUSPENDED_ORG));
    expect(admin.length).toBe(own.length);

    for (const key of ["orgA", "orgB", "orgC", "compliance", "auditor", "warehouse", "finance", "anonymous"] as const) {
      const rows = await as(clients[key], async () => (await history()).readAccountStatusHistory(SUSPENDED_ORG));
      expect(rows, key).toEqual([]);
    }
  }, LIVE_TIMEOUT_MS);
});

describe("OWNERSHIP EVENTS — admin OR a member of either party", () => {
  it("each org sees only events it is a party to (with correlation ids as stored); an unrelated org sees none of another org's non-shared events", async () => {
    const orgAEvents = await as(clients.orgA, async () => (await history()).readOwnershipEvents({ organizationId: ORG_A, pageSize: 100 }));
    expect(orgAEvents.rows.length).toBeGreaterThan(0);
    expect(orgAEvents.rows.every((row) => row.fromOrganizationId === ORG_A || row.toOrganizationId === ORG_A)).toBe(true);
    // The stored correlation id is carried on every row exactly as stored (a uuid or a genuine null).
    for (const row of orgAEvents.rows) expect(row.correlationId === null || /^[0-9a-f-]{36}$/.test(row.correlationId)).toBe(true);
    expect(orgAEvents.rows.some((row) => row.correlationId !== null)).toBe(true);

    // Org C asking for Org A's ledger gets ONLY rows where Org C itself is a party (RLS) — here none.
    const orgCOnA = await as(clients.orgC, async () => (await history()).readOwnershipEvents({ organizationId: ORG_A, pageSize: 100 }));
    for (const row of orgCOnA.rows) expect(row.fromOrganizationId === ORG_C || row.toOrganizationId === ORG_C).toBe(true);
    const orgAIds = new Set(orgAEvents.rows.map((row) => row.id));
    expect(orgCOnA.rows.filter((row) => orgAIds.has(row.id) && row.fromOrganizationId !== ORG_C && row.toOrganizationId !== ORG_C)).toEqual([]);

    // Org B sees only the Org A events it is itself a party to.
    const orgBOnA = await as(clients.orgB, async () => (await history()).readOwnershipEvents({ organizationId: ORG_A, pageSize: 100 }));
    for (const row of orgBOnA.rows) expect(row.fromOrganizationId === ORG_B || row.toOrganizationId === ORG_B).toBe(true);

    const admin = await as(clients.admin, async () => (await history()).readOwnershipEvents({ organizationId: ORG_A, pageSize: 100 }));
    expect(admin.rows.length).toBe(orgAEvents.rows.length);
    for (const key of ["compliance", "auditor", "warehouse", "finance", "anonymous"] as const) {
      const rows = await as(clients[key], async () => (await history()).readOwnershipEvents({ organizationId: ORG_A }));
      expect(rows.rows, key).toEqual([]);
    }
    // A malformed organization id is refused before any query (no filter injection).
    const injected = await as(clients.orgA, async () => (await history()).readOwnershipEvents({ organizationId: `${ORG_A},to_organization_id.neq.${ORG_A}` }));
    expect(injected.rows).toEqual([]);
  }, LIVE_TIMEOUT_MS);
});

describe("AUDIT LOG / DB-OPEN-06 — audit_admin_read: is_platform_admin() only", () => {
  it("ADMIN reads real rows; AUDITOR gets the explicit DB-OPEN-06 limitation (no query, no fallback); every other role is not permitted", async () => {
    const admin = await as(clients.admin, async () => (await import("@/lib/audit/access")).resolveAuditLogAccess());
    expect(admin.status).toBe("readable");
    if (admin.status === "readable") expect(admin.rows.length).toBeGreaterThan(0);

    const auditor = await as(clients.auditor, async () => (await import("@/lib/audit/access")).resolveAuditLogAccess());
    expect(auditor).toEqual({ status: "limited", blocker: "DB-OPEN-06", audience: "auditor" });

    for (const key of ["compliance", "warehouse", "finance", "orgA", "anonymous"] as const) {
      const result = await as(clients[key], async () => (await import("@/lib/audit/access")).resolveAuditLogAccess());
      expect(result, key).toEqual({ status: "not-permitted" });
    }
  }, LIVE_TIMEOUT_MS);

  it("the policy is unchanged: a direct AUDITOR read of audit_logs still returns nothing (the limitation is real, not assumed)", async () => {
    const { data, error } = await clients.auditor.from("audit_logs").select("id").limit(1);
    expect(error === null ? data : []).toEqual([]);
    const { data: adminRows } = await clients.admin.from("audit_logs").select("id").limit(1);
    expect(adminRows?.length).toBe(1);
  }, LIVE_TIMEOUT_MS);
});

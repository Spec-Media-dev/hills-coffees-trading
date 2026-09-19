import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  PHASE89_FIXTURES,
  cleanupAuditorFixture,
  cleanupCatalogueAdminFixture,
  cleanupComplianceFixture,
  cleanupSuperAdminFixture,
  createAnonymousFixtureClient,
  inspectAuditorFixture,
  inspectCatalogueAdminFixture,
  inspectComplianceFixture,
  inspectSuspendedOrganization,
  inspectSuperAdminFixture,
  prepareAuditorFixture,
  prepareCatalogueAdminFixture,
  prepareComplianceFixture,
  prepareSuperAdminFixture,
  resetSuspendedFixture,
  setSuspendedOrganizationStatus,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 RUN J — T010 (organization suspension/reinstatement with reason) and DB-OPEN-22, LIVE,
 * after migration `20260919130000_feature_010_db_open_22_compliance_organization_read.sql`:
 *   1. `organizations_member_select` USING = is_org_member(id) OR is_platform_admin() OR is_compliance_operator()
 *   2. `trg_organizations_compliance_guard`: a compliance operator who is not a platform admin may
 *      change only `status`, only along the approved compliance transitions.
 *
 * Target: the dedicated `suspended` fixture organization and its own member (resettable; canonical
 * state SUSPENDED + APPROVED application; restored in `afterAll`). Operator: the disposable pure
 * COMPLIANCE fixture (role exactly COMPLIANCE — not a platform admin), de-privileged in `afterAll`.
 * Every suspension/reinstatement goes through the console's own Server Action. History rows
 * (`account_status_history`, `kyb_reviews`) are never deleted; the snapshot proves they only grow and
 * that no other organization changed.
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
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  cookieState.value = undefined;
  vi.resetModules();
  return run();
}

type Snapshot = {
  organization: { id: string; status: string; legal_name: string; tax_number: string | null; can_buy: boolean; can_sell: boolean; updated_at: string };
  application: { id: string; status: string; rejection_reason: string | null; decided_by: string | null };
  organizationCanBuy: boolean;
  accountStatusHistory: Array<{ id: string; old_status: string; new_status: string; changed_by: string | null; reason: string | null; created_at: string }>;
  kybReviews: Array<{ id: string; decision: string; reviewer_user_id: string; reason: string | null; created_at: string }>;
  totalOrganizations: number;
  otherOrganizationsFingerprint: string;
};
const snapshot = () => inspectSuspendedOrganization() as unknown as Snapshot;

const LIVE_TIMEOUT_MS = 150_000;
const ORG = PHASE89_FIXTURES.suspended.organizationId;
const SUSPEND_REASON = "RUN J proof: trade licence expired; suspended pending renewal.";
const REINSTATE_REASON = "RUN J proof: renewed trade licence verified; reinstated.";

let compliance: SupabaseClient;
let complianceUserId: string;
let member: SupabaseClient;
let unrelated: SupabaseClient;
let warehouse: SupabaseClient;
let finance: SupabaseClient;
let auditor: SupabaseClient;
let admin: SupabaseClient;
let superAdmin: SupabaseClient;
let anonymous: SupabaseClient;
let start: Snapshot;

async function changeStatus(client: SupabaseClient, status: string, reason: string) {
  return withLiveClient(client, async () => {
    const { changeOrganizationStatus } = await import("@/src/app/dashboard-admin/(compliance)/organizations/actions");
    const formData = new FormData();
    formData.set("organizationId", ORG);
    formData.set("status", status);
    formData.set("reason", reason);
    return changeOrganizationStatus(undefined, formData);
  });
}

/** The member's NEXT request, through Feature 003's own identity resolution (`getRequestIdentity`). */
async function memberIdentity() {
  return withLiveClient(member, async () => {
    const { getRequestIdentity } = await import("@/lib/auth/dal");
    return getRequestIdentity();
  });
}

beforeAll(async () => {
  prepareComplianceFixture();
  prepareAuditorFixture();
  prepareCatalogueAdminFixture();
  prepareSuperAdminFixture();
  resetSuspendedFixture();
  setSuspendedOrganizationStatus("ACTIVE");

  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  complianceUserId = (await compliance.auth.getUser()).data.user!.id;
  member = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
  unrelated = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  superAdmin = await signInAsFixture(FOUNDATION_FIXTURES.superAdmin.email);
  anonymous = createAnonymousFixtureClient();
  start = snapshot();
  expect(start.organization.status).toBe("ACTIVE");
  expect(start.application.status).toBe("APPROVED");
  expect(start.organizationCanBuy).toBe(true);
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  resetSuspendedFixture();
  const end = snapshot();
  expect(end.organization.status).toBe("SUSPENDED");
  expect(end.application.status).toBe("APPROVED");
  // History only grows; no other organization moved during the whole file.
  expect(end.accountStatusHistory.length).toBeGreaterThanOrEqual(start.accountStatusHistory.length);
  expect(end.kybReviews.length).toBeGreaterThanOrEqual(start.kybReviews.length);
  expect(end.otherOrganizationsFingerprint).toBe(start.otherOrganizationsFingerprint);
  expect(cleanupComplianceFixture().activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);
  expect(cleanupAuditorFixture().activeAdminPrivilege).toBe(false);
  expect(inspectAuditorFixture().activeCapability).toBe(false);
  expect(cleanupCatalogueAdminFixture().activeAdminPrivilege).toBe(false);
  expect(inspectCatalogueAdminFixture().activeCapability).toBe(false);
  expect(cleanupSuperAdminFixture().activeAdminPrivilege).toBe(false);
  expect(inspectSuperAdminFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("static: the migration changes exactly one policy and adds one narrowing guard", () => {
  const sql = readFileSync("supabase/migrations/20260919130000_feature_010_db_open_22_compliance_organization_read.sql", "utf8").replace(/--[^\n]*/g, "");

  it("pins the final organizations read rule and touches no other policy, grant or table", () => {
    expect(sql).toMatch(/alter policy organizations_member_select\s+on public\.organizations\s+using \(public\.is_org_member\(id\) or public\.is_platform_admin\(\) or public\.is_compliance_operator\(\)\);/);
    expect(sql.match(/alter policy|create policy|drop policy/gi)).toEqual(["alter policy"]);
    expect(sql).not.toMatch(/\bgrant\s+(select|insert|update|delete|all)\b/i);
    expect(sql).not.toMatch(/account_status_history|file_assets|organizations_compliance_update\s+on|organizations_admin_all\s+on/i);
    expect(sql).not.toMatch(/\b(insert into|delete from)\b/i);
  });

  it("the guard narrows only non-platform-admin compliance callers, to `status` along the console's exact transitions", () => {
    expect(sql).toMatch(/if auth\.uid\(\) is null or public\.is_platform_admin\(\) or not public\.is_compliance_operator\(\) then\s+return new;/);
    expect(sql).toMatch(/\(to_jsonb\(new\) - 'status' - 'updated_at'\) is distinct from \(to_jsonb\(old\) - 'status' - 'updated_at'\)/);
    const transitions = [...sql.matchAll(/old\.status = '([A-Z_]+)' and new\.status (?:in \(([^)]*)\)|= '([A-Z_]+)')/g)].map(([, from, list, single]) => [from, (list ? [...list.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]) : [single]).sort()]);
    expect(Object.fromEntries(transitions)).toEqual({ PENDING_KYB: ["ACTIVE", "REJECTED", "UNDER_REVIEW"], UNDER_REVIEW: ["ACTIVE", "REJECTED"], ACTIVE: ["SUSPENDED"], SUSPENDED: ["ACTIVE"] });
  });
});

describe("DB-OPEN-22 — read path: COMPLIANCE now reads organizations; nobody else gains anything", () => {
  it("pure COMPLIANCE reads the target organization (legal/tax/contact fields) and every organization row", async () => {
    const { data: target, error } = await compliance.from("organizations").select("id, legal_name, tax_number, email, status").eq("id", ORG).maybeSingle();
    expect(error).toBeNull();
    expect(target).toMatchObject({ id: ORG, legal_name: start.organization.legal_name, status: "ACTIVE" });
    const { count } = await compliance.from("organizations").select("id", { count: "exact", head: true });
    expect(count).toBe(start.totalOrganizations);
  }, LIVE_TIMEOUT_MS);

  it("anonymous, WAREHOUSE, FINANCE and AUDITOR read no organization; an unrelated member reads only its own; the member reads its own", async () => {
    const anon = await anonymous.from("organizations").select("id").eq("id", ORG);
    expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true);
    for (const [label, client] of [["WAREHOUSE", warehouse], ["FINANCE", finance], ["AUDITOR", auditor]] as const) {
      const { data, error } = await client.from("organizations").select("id");
      expect(error, label).toBeNull();
      expect(data, label).toEqual([]);
    }
    const { data: unrelatedRows } = await unrelated.from("organizations").select("id");
    expect(unrelatedRows?.map((row) => row.id)).toEqual([FOUNDATION_FIXTURES.buyerOnly.organizationId]);
    const { data: ownRows } = await member.from("organizations").select("id");
    expect(ownRows?.map((row) => row.id)).toEqual([ORG]);
  }, LIVE_TIMEOUT_MS);
});

describe("T010 — suspension, next-request enforcement, reason, history, reinstatement (live, pure COMPLIANCE)", () => {
  it("before: the member's request is authorized and can buy", async () => {
    const identity = await memberIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.organization?.organizationId).toBe(ORG);
    expect(identity.isAuthorizedMember).toBe(true);
    expect(identity.organization?.canBuy).toBe(true);
  }, LIVE_TIMEOUT_MS);

  it("ACTIVE → SUSPENDED through the console: reason recorded (kyb_reviews + application), account_status_history appended, organization_can_buy false", async () => {
    const before = snapshot();
    const result = await changeStatus(compliance, "SUSPENDED", SUSPEND_REASON);
    expect(result).toMatchObject({ ok: true, code: "organization_status_changed", data: { organizationId: ORG, fromStatus: "ACTIVE", toStatus: "SUSPENDED", applicationId: PHASE89_FIXTURES.suspended.applicationId } });
    if (!result.ok) return;

    const after = snapshot();
    expect(after.organization.status).toBe("SUSPENDED");
    expect(after.organizationCanBuy).toBe(false);
    expect(after.application).toMatchObject({ status: "SUSPENDED", rejection_reason: SUSPEND_REASON, decided_by: complianceUserId });
    const newReviews = after.kybReviews.slice(before.kybReviews.length);
    expect(newReviews).toEqual([expect.objectContaining({ id: result.data.reviewId, decision: "SUSPENDED", reviewer_user_id: complianceUserId, reason: SUSPEND_REASON })]);
    const newHistory = after.accountStatusHistory.slice(before.accountStatusHistory.length);
    expect(newHistory).toEqual([expect.objectContaining({ old_status: "ACTIVE", new_status: "SUSPENDED", changed_by: complianceUserId })]);
    expect(after.accountStatusHistory.slice(0, before.accountStatusHistory.length)).toEqual(before.accountStatusHistory);
    // Only status (and the trigger-maintained timestamp) moved.
    expect(after.organization).toMatchObject({ legal_name: before.organization.legal_name, tax_number: before.organization.tax_number, can_buy: before.organization.can_buy, can_sell: before.organization.can_sell });
    expect(after.otherOrganizationsFingerprint).toBe(start.otherOrganizationsFingerprint);
  }, LIVE_TIMEOUT_MS);

  it("the member's NEXT request sees the suspension (same session): not authorized, cannot buy; Feature 007's owning path refuses a new order; the database agrees", async () => {
    const identity = await memberIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.isAuthorizedMember).toBe(false);
    expect(identity.organization?.canBuy).toBe(false);

    const order = await withLiveClient(member, async () => {
      const { createOrder } = await import("@/src/app/dashboard/orders/actions");
      return createOrder();
    });
    expect(order).toMatchObject({ ok: false, code: "buyer_not_capable" });
    const { data: canBuy } = await member.rpc("organization_can_buy", { p_organization_id: ORG });
    expect(canBuy).toBe(false);
    const { data: authorized } = await member.rpc("is_authorized_member");
    expect(authorized).toBe(false);
  }, LIVE_TIMEOUT_MS);

  it("a repeated suspension is refused as stale and records nothing", async () => {
    const before = snapshot();
    expect(await changeStatus(compliance, "SUSPENDED", SUSPEND_REASON)).toEqual({ ok: false, code: "organization_status_stale" });
    const after = snapshot();
    expect(after.accountStatusHistory).toEqual(before.accountStatusHistory);
    expect(after.kybReviews).toEqual(before.kybReviews);
  }, LIVE_TIMEOUT_MS);

  it("unrelated member, WAREHOUSE, FINANCE, AUDITOR and anonymous are refused by the console action AND their raw UPDATE changes nothing", async () => {
    const before = snapshot();
    for (const [label, client, code] of [
      ["member (unrelated organization)", unrelated, "compliance_not_capable"],
      ["member (the organization's own member)", member, "compliance_not_capable"],
      ["WAREHOUSE", warehouse, "compliance_not_capable"],
      ["FINANCE", finance, "compliance_not_capable"],
      ["AUDITOR", auditor, "compliance_not_capable"],
      ["anonymous", anonymous, "profile_auth_required"],
    ] as const) {
      expect(await changeStatus(client, "ACTIVE", `Unauthorized reinstatement by ${label}.`), label).toEqual({ ok: false, code });
      const raw = await client.from("organizations").update({ status: "ACTIVE" }).eq("id", ORG).select("id");
      expect(raw.error !== null || (raw.data ?? []).length === 0, label).toBe(true);
    }
    const after = snapshot();
    expect(after.organization.status).toBe("SUSPENDED");
    expect(after.accountStatusHistory).toEqual(before.accountStatusHistory);
    expect(after.kybReviews).toEqual(before.kybReviews);
  }, LIVE_TIMEOUT_MS);

  it("SUSPENDED → ACTIVE (reinstatement) is reason-bearing and history-preserving; the member's next request can buy again", async () => {
    const before = snapshot();
    const result = await changeStatus(compliance, "ACTIVE", REINSTATE_REASON);
    expect(result).toMatchObject({ ok: true, code: "organization_status_changed", data: { fromStatus: "SUSPENDED", toStatus: "ACTIVE" } });
    if (!result.ok) return;
    const after = snapshot();
    expect(after.organization.status).toBe("ACTIVE");
    expect(after.organizationCanBuy).toBe(true);
    expect(after.application).toMatchObject({ status: "APPROVED", rejection_reason: null, decided_by: complianceUserId });
    expect(after.kybReviews.slice(before.kybReviews.length)).toEqual([expect.objectContaining({ id: result.data.reviewId, decision: "APPROVED", reviewer_user_id: complianceUserId, reason: REINSTATE_REASON })]);
    // The suspension's review row (with its reason) is still there, unchanged.
    expect(after.kybReviews.slice(0, before.kybReviews.length)).toEqual(before.kybReviews);
    expect(after.accountStatusHistory.slice(before.accountStatusHistory.length)).toEqual([expect.objectContaining({ old_status: "SUSPENDED", new_status: "ACTIVE", changed_by: complianceUserId })]);
    expect(after.accountStatusHistory.slice(0, before.accountStatusHistory.length)).toEqual(before.accountStatusHistory);

    const identity = await memberIdentity();
    expect(identity.kind === "authenticated" && identity.isAuthorizedMember && identity.organization?.canBuy).toBe(true);
    expect(await changeStatus(compliance, "ACTIVE", REINSTATE_REASON)).toEqual({ ok: false, code: "organization_status_stale" });
  }, LIVE_TIMEOUT_MS);
});

describe("DB-OPEN-22 guard — the now-effective compliance UPDATE is narrowed in the database (raw REST as pure COMPLIANCE)", () => {
  it("any non-status column, an unapproved status transition, an INSERT and a DELETE are all refused; nothing changes", async () => {
    const before = snapshot();
    for (const patch of [{ legal_name: "Rewritten by compliance" }, { tax_number: "000-FORGED" }, { can_sell: true }, { email: "forged@example.com" }, { status: "SUSPENDED", legal_name: "Mixed write" }]) {
      const { data, error } = await compliance.from("organizations").update(patch).eq("id", ORG).select("id");
      expect(data, JSON.stringify(patch)).toBeNull();
      expect(error?.message, JSON.stringify(patch)).toBe("organization_compliance_update_scope");
    }
    for (const status of ["CLOSED", "REJECTED", "PENDING_KYB", "UNDER_REVIEW"]) {
      const { data, error } = await compliance.from("organizations").update({ status }).eq("id", ORG).select("id");
      expect(data, status).toBeNull();
      expect(error?.message, status).toBe("organization_compliance_transition_refused");
    }
    const insert = await compliance.from("organizations").insert({ legal_name: "Forged Org", display_name: "Forged", account_type: "BUYER", country_code: "AE", status: "ACTIVE", is_hills_internal: false, can_buy: true, can_sell: false });
    expect(insert.error?.code).toBe("42501");
    const removal = await compliance.from("organizations").delete().eq("id", ORG).select("id");
    expect(removal.error !== null || (removal.data ?? []).length === 0).toBe(true);

    const after = snapshot();
    expect(after.organization).toEqual(before.organization);
    expect(after.accountStatusHistory).toEqual(before.accountStatusHistory);
    expect(after.totalOrganizations).toBe(before.totalOrganizations);
  }, LIVE_TIMEOUT_MS);

  it("platform ADMIN and SUPER_ADMIN are NOT narrowed (organizations_admin_all unchanged): each may still correct a non-status column", async () => {
    const original = snapshot().organization.legal_name;
    for (const [label, client] of [["ADMIN", admin], ["SUPER_ADMIN", superAdmin]] as const) {
      const edited = await client.from("organizations").update({ legal_name: `${original} (${label} edit proof)` }).eq("id", ORG).select("legal_name").single();
      expect(edited.error, label).toBeNull();
      expect(edited.data?.legal_name, label).toBe(`${original} (${label} edit proof)`);
      const restored = await client.from("organizations").update({ legal_name: original }).eq("id", ORG).select("legal_name").single();
      expect(restored.data?.legal_name, label).toBe(original);
    }
  }, LIVE_TIMEOUT_MS);
});

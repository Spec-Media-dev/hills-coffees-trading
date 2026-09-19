import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  RUN_F_CONFIG_ROWS,
  cleanupCatalogueAdminFixture,
  cleanupRunFConfigRows,
  cleanupSuperAdminFixture,
  createAnonymousFixtureClient,
  inspectCatalogueAdminFixture,
  inspectSuperAdminFixture,
  prepareCatalogueAdminFixture,
  prepareSuperAdminFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 T027 / T029 / DB-OPEN-21 — LIVE proof (REAL sessions, REAL rows) that after migration
 * `20260920120000_feature_010_db_open_21_config_attribution.sql` EVERY change to a configuration table is
 * dated by the database and attributable to the signed-in actor in `audit_logs`, with the payment-account
 * payload REDACTED. **Run only after the migration is applied** (it fails, correctly, before that).
 *
 * The actor is the disposable SUPER_ADMIN (the only identity that passes `is_super_admin()`); every write goes
 * through the console's own domain functions (`lib/admin/{roles,commission,pricing-rules,payment-accounts}`),
 * so this also proves the app no longer needs to set `updated_at` itself. Rows are tagged like RUN F's
 * (2099-dated policies/rules, country `ZZ`, `RUN F ` names) and removed in `afterAll`. Audit rows are
 * append-only history: the ones this file creates stay (they are keyed by the throw-away entity ids).
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
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

const LIVE_TIMEOUT_MS = 180_000;
const FUTURE_FROM = "2099-01-01T00:00";
const POLICY_NAME = `${RUN_F_CONFIG_ROWS.policyNamePrefix}M1 attribution proof`;
const ACCOUNT_NAME = `${RUN_F_CONFIG_ROWS.accountNamePrefix}M1 attribution account`;
const FULL_IBAN = "ZZ00 TEST 0000 0000 0000 0001";
const FIRST_NUMBER = "ACCT-4455-6677-8899";
const SECOND_NUMBER = "ACCT-1111-2222-3333";

type Json = Record<string, unknown>;
type AuditRow = { id: number; actor_user_id: string | null; entity_type: string; entity_id: string; action: string; old_data: Json | null; new_data: Json | null; metadata: Json | null; correlation_id: string | null };

let superAdmin: SupabaseClient;
let admin: SupabaseClient;
let finance: SupabaseClient;
let member: SupabaseClient;
let anonymous: SupabaseClient;
let target: SupabaseClient;
let superAdminId: string;
let targetId: string;
let baseline: Record<string, string>;
/** Highest audit_logs.id before this file wrote anything (identity column — immune to clock skew). */
let auditWatermark = 0;
/** Entity ids this file created (tagged rows) — the only ids allowed to appear in new audit rows. */
const createdEntityIds = new Set<string>();

const CONFIG_TABLES = ["platform_admins", "commission_policies", "commission_tiers", "tax_rules", "shipping_rules", "payment_accounts"] as const;

async function auditFor(entityType: string, entityId: string): Promise<AuditRow[]> {
  const { data, error } = await superAdmin
    .from("audit_logs")
    .select("id, actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    // Audit history is append-only and the role-target user id is stable across runs: only rows written since THIS run began count.
    .gt("id", auditWatermark)
    .order("id", { ascending: true });
  if (error) throw new Error(`audit read failed: ${error.code}`);
  return (data ?? []) as AuditRow[];
}

async function updatedAt(table: string, key: "id" | "user_id", value: string): Promise<number> {
  const { data, error } = await superAdmin.from(table).select("updated_at").eq(key, value).single();
  if (error || !data) throw new Error(`updated_at read failed on ${table}: ${error?.code}`);
  return Date.parse((data as { updated_at: string }).updated_at);
}

/** Every row of the six tables, minus the rows this file creates (tagged), as a stable string. */
async function untaggedConfigSnapshot(): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const table of CONFIG_TABLES) {
    const { data, error } = await superAdmin.from(table).select("*");
    if (error) throw new Error(`snapshot failed on ${table}: ${error.code}`);
    let rows = (data ?? []) as Json[];
    if (table === "platform_admins") rows = rows.filter((row) => row.user_id !== targetId);
    if (table === "commission_policies") rows = rows.filter((row) => !String(row.name).startsWith(RUN_F_CONFIG_ROWS.policyNamePrefix));
    if (table === "tax_rules" || table === "shipping_rules") rows = rows.filter((row) => row.country_code !== RUN_F_CONFIG_ROWS.ruleCountryCode);
    if (table === "payment_accounts") rows = rows.filter((row) => !String(row.account_name).startsWith(RUN_F_CONFIG_ROWS.accountNamePrefix));
    if (table === "commission_tiers") {
      const { data: tagged } = await superAdmin.from("commission_policies").select("id").like("name", `${RUN_F_CONFIG_ROWS.policyNamePrefix}%`);
      const taggedIds = new Set((tagged ?? []).map((row) => row.id as string));
      rows = rows.filter((row) => !taggedIds.has(row.policy_id as string));
    }
    snapshot[table] = JSON.stringify(rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  }
  return snapshot;
}

/** Exactly one NEW audit row appeared, earlier rows are untouched, and it carries the expected actor/action. */
async function expectOneNewRow(entityType: string, entityId: string, before: AuditRow[], expected: { action: string; actor?: string | null }): Promise<AuditRow> {
  const after = await auditFor(entityType, entityId);
  expect(after, `${entityType} ${expected.action}: exactly one new audit row`).toHaveLength(before.length + 1);
  expect(after.slice(0, before.length), `${entityType}: earlier audit rows unchanged`).toEqual(before);
  const row = after.at(-1)!;
  expect(row.action).toBe(expected.action);
  expect(row.actor_user_id, `${entityType} ${expected.action}: actor`).toBe(expected.actor === undefined ? superAdminId : expected.actor);
  expect(row.entity_type).toBe(entityType);
  expect(row.entity_id).toBe(entityId);
  expect(row.correlation_id, "correlation id present").toMatch(/^[0-9a-f-]{36}$/);
  return row;
}

beforeAll(async () => {
  prepareSuperAdminFixture();
  prepareCatalogueAdminFixture();
  cleanupRunFConfigRows();
  superAdmin = await signInAsFixture(FOUNDATION_FIXTURES.superAdmin.email);
  superAdminId = (await superAdmin.auth.getUser()).data.user!.id;
  admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  anonymous = createAnonymousFixtureClient();
  target = await signInAsFixture(RUN_F_CONFIG_ROWS.roleTargetEmail);
  targetId = (await target.auth.getUser()).data.user!.id;
  baseline = await untaggedConfigSnapshot();
  const { data: newest } = await superAdmin.from("audit_logs").select("id").order("id", { ascending: false }).limit(1);
  auditWatermark = Number(newest?.[0]?.id ?? 0);
  createdEntityIds.add(targetId);
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  cleanupRunFConfigRows();
  for (const [cleanupFixture, inspectFixture] of [
    [cleanupSuperAdminFixture, inspectSuperAdminFixture],
    [cleanupCatalogueAdminFixture, inspectCatalogueAdminFixture],
  ] as const) {
    expect(cleanupFixture().activeAdminPrivilege).toBe(false);
    expect(inspectFixture().activeCapability).toBe(false);
  }
}, LIVE_TIMEOUT_MS);

describe("1. platform_admins — grant / role change / deactivation each write exactly one attributed audit row (keyed on user_id)", () => {
  it("grant → one INSERT row (entity_id = the operator's user_id, actor = the SUPER_ADMIN, created_by attributed); role change → one UPDATE (COMPLIANCE → AUDITOR); deactivation → one UPDATE; updated_at advances each time WITHOUT the app setting it", async () => {
    const roles = async () => import("@/lib/admin/roles");
    let rows = await auditFor("platform_admins", targetId);
    expect(rows).toEqual([]);

    const granted = await withLiveClient(superAdmin, async () => (await roles()).grantPlatformAdminRole({ userId: targetId, role: "COMPLIANCE" }));
    expect(granted.ok).toBe(true);
    const insert = await expectOneNewRow("platform_admins", targetId, rows, { action: "INSERT" });
    expect(insert.old_data).toBeNull();
    expect(insert.new_data).toMatchObject({ user_id: targetId, role: "COMPLIANCE", is_active: true, created_by: superAdminId });
    expect(insert.metadata).toMatchObject({ identity_column: "user_id" });
    rows = await auditFor("platform_admins", targetId);
    const grantedAt = await updatedAt("platform_admins", "user_id", targetId);

    const changed = await withLiveClient(superAdmin, async () => (await roles()).changePlatformAdminRole({ userId: targetId, role: "AUDITOR", expectedRole: "COMPLIANCE" }));
    expect(changed.ok).toBe(true);
    const update = await expectOneNewRow("platform_admins", targetId, rows, { action: "UPDATE" });
    expect(update.old_data).toMatchObject({ role: "COMPLIANCE", is_active: true });
    expect(update.new_data).toMatchObject({ role: "AUDITOR", is_active: true });
    rows = await auditFor("platform_admins", targetId);
    const changedAt = await updatedAt("platform_admins", "user_id", targetId);
    expect(changedAt).toBeGreaterThan(grantedAt);

    const deactivated = await withLiveClient(superAdmin, async () => (await roles()).setPlatformAdminActive({ userId: targetId, isActive: "false", expectedRole: "AUDITOR", expectedActive: "true" }));
    expect(deactivated.ok).toBe(true);
    const deactivate = await expectOneNewRow("platform_admins", targetId, rows, { action: "UPDATE" });
    expect(deactivate.old_data).toMatchObject({ is_active: true });
    expect(deactivate.new_data).toMatchObject({ role: "AUDITOR", is_active: false });
    rows = await auditFor("platform_admins", targetId);
    expect(await updatedAt("platform_admins", "user_id", targetId)).toBeGreaterThan(changedAt);

    // The database, not the caller, owns updated_at: a raw update that tries to backdate it is overridden (and audited).
    const backdated = await superAdmin.from("platform_admins").update({ updated_at: "2001-01-01T00:00:00Z" }).eq("user_id", targetId).select("updated_at").single();
    expect(backdated.error).toBeNull();
    expect(Date.parse(backdated.data!.updated_at as string)).toBeGreaterThan(Date.parse("2020-01-01"));
    await expectOneNewRow("platform_admins", targetId, rows, { action: "UPDATE" });
  }, LIVE_TIMEOUT_MS);

  it("stale and unauthorized attempts are refused exactly as before and write NO audit row (stale role, ADMIN, finance, member, anonymous; raw ADMIN update affects zero rows)", async () => {
    const rows = await auditFor("platform_admins", targetId);
    const stale = await withLiveClient(superAdmin, async () => (await import("@/lib/admin/roles")).changePlatformAdminRole({ userId: targetId, role: "FINANCE", expectedRole: "COMPLIANCE" }));
    expect(stale).toEqual({ ok: false, code: "system_stale" });
    for (const [label, client] of [["ADMIN", admin], ["finance", finance], ["member", member]] as const) {
      const refused = await withLiveClient(client, async () => (await import("@/lib/admin/roles")).changePlatformAdminRole({ userId: targetId, role: "FINANCE", expectedRole: "AUDITOR" }));
      expect(refused, label).toEqual({ ok: false, code: "system_not_capable" });
    }
    const anonymousResult = await withLiveClient(anonymous, async () => (await import("@/lib/admin/roles")).changePlatformAdminRole({ userId: targetId, role: "FINANCE", expectedRole: "AUDITOR" }));
    expect(anonymousResult).toEqual({ ok: false, code: "profile_auth_required" });
    const raw = await admin.from("platform_admins").update({ role: "SUPER_ADMIN" }).eq("user_id", targetId).select("user_id");
    expect(raw.error !== null || (raw.data ?? []).length === 0).toBe(true);
    expect(await auditFor("platform_admins", targetId)).toEqual(rows);
    expect((await superAdmin.from("platform_admins").select("role").eq("user_id", targetId).single()).data?.role).toBe("AUDITOR");
  }, LIVE_TIMEOUT_MS);
});

describe("2–3. commission policies and tiers — create / edit / deactivate / tier edit each write one attributed audit row", () => {
  it("policy create → INSERT; rename → UPDATE; activate and deactivate → two UPDATEs (status); tier create → INSERT (tiers had NO attribution at all before); tier edit → UPDATE; updated_at advances on every edit", async () => {
    const commission = async () => import("@/lib/admin/commission");
    const created = await withLiveClient(superAdmin, async () => (await commission()).createCommissionPolicy({ name: POLICY_NAME, effectiveFrom: FUTURE_FROM }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const policyId = created.data.id;
    createdEntityIds.add(policyId);
    let rows = await auditFor("commission_policies", policyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "INSERT", actor_user_id: superAdminId, old_data: null });
    expect(rows[0]!.new_data).toMatchObject({ id: policyId, name: POLICY_NAME, status: "DRAFT", created_by: superAdminId });
    let previous = await updatedAt("commission_policies", "id", policyId);

    const renamed = await withLiveClient(superAdmin, async () => (await commission()).updateCommissionPolicy({ policyId, name: `${POLICY_NAME} renamed`, effectiveFrom: FUTURE_FROM }));
    expect(renamed.ok).toBe(true);
    const rename = await expectOneNewRow("commission_policies", policyId, rows, { action: "UPDATE" });
    expect(rename.old_data).toMatchObject({ name: POLICY_NAME });
    expect(rename.new_data).toMatchObject({ name: `${POLICY_NAME} renamed` });
    rows = await auditFor("commission_policies", policyId);
    let current = await updatedAt("commission_policies", "id", policyId);
    expect(current).toBeGreaterThan(previous);
    previous = current;

    for (const [operation, from, to] of [["activate", "DRAFT", "ACTIVE"], ["deactivate", "ACTIVE", "INACTIVE"]] as const) {
      const result = await withLiveClient(superAdmin, async () => (await commission()).transitionCommissionPolicy({ policyId, operation }));
      expect(result.ok, operation).toBe(true);
      const row = await expectOneNewRow("commission_policies", policyId, rows, { action: "UPDATE" });
      expect(row.old_data, operation).toMatchObject({ status: from });
      expect(row.new_data?.status, operation).toBe(result.ok ? result.data.toStatus : undefined);
      expect(row.new_data?.status).not.toBe(from);
      rows = await auditFor("commission_policies", policyId);
      current = await updatedAt("commission_policies", "id", policyId);
      expect(current, operation).toBeGreaterThan(previous);
      previous = current;
      expect(to).toBeTruthy();
    }

    // The stale repeat is refused as before, with no audit row.
    const again = await withLiveClient(superAdmin, async () => (await commission()).transitionCommissionPolicy({ policyId, operation: "deactivate" }));
    expect(again).toEqual({ ok: false, code: "system_stale" });
    expect(await auditFor("commission_policies", policyId)).toEqual(rows);

    const tier = await withLiveClient(superAdmin, async () => (await commission()).createCommissionTier({ policyId, minQuantityKg: "0", maxQuantityKg: "100", percentage: "5" }));
    expect(tier.ok).toBe(true);
    if (!tier.ok) return;
    createdEntityIds.add(tier.data.id);
    let tierRows = await auditFor("commission_tiers", tier.data.id);
    expect(tierRows).toHaveLength(1);
    expect(tierRows[0]).toMatchObject({ action: "INSERT", actor_user_id: superAdminId });
    expect(tierRows[0]!.new_data).toMatchObject({ policy_id: policyId, percentage: 5 });
    const tierBefore = await updatedAt("commission_tiers", "id", tier.data.id);

    const edited = await withLiveClient(superAdmin, async () => (await commission()).updateCommissionTier({ policyId, tierId: tier.data.id, minQuantityKg: "0", maxQuantityKg: "100", percentage: "6" }));
    expect(edited.ok).toBe(true);
    const tierEdit = await expectOneNewRow("commission_tiers", tier.data.id, tierRows, { action: "UPDATE" });
    expect(tierEdit.old_data).toMatchObject({ percentage: 5 });
    expect(tierEdit.new_data).toMatchObject({ percentage: 6 });
    tierRows = await auditFor("commission_tiers", tier.data.id);
    expect(await updatedAt("commission_tiers", "id", tier.data.id)).toBeGreaterThan(tierBefore);
    expect(tierRows).toHaveLength(2);

    // Unauthorized roles are refused as before and add nothing.
    for (const [label, client] of [["ADMIN", admin], ["finance", finance]] as const) {
      const refused = await withLiveClient(client, async () => (await commission()).updateCommissionPolicy({ policyId, name: `${POLICY_NAME} tamper`, effectiveFrom: FUTURE_FROM }));
      expect(refused, label).toEqual({ ok: false, code: "system_not_capable" });
    }
    expect(await auditFor("commission_policies", policyId)).toEqual(rows);
    expect(await auditFor("commission_tiers", tier.data.id)).toEqual(tierRows);
  }, LIVE_TIMEOUT_MS);
});

describe("4–5. tax and shipping rules — create / edit / deactivate each write one attributed audit row", () => {
  it("tax rule: create → INSERT; rate edit → UPDATE; activate then deactivate → UPDATEs; updated_at advances every time; the real AE rule is untouched", async () => {
    const rules = async () => import("@/lib/admin/pricing-rules");
    const created = await withLiveClient(superAdmin, async () => (await rules()).createTaxRule({ countryCode: "ZZ", taxName: "VAT", ratePercentage: "5", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: FUTURE_FROM, isActive: "" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.data.id;
    createdEntityIds.add(id);
    let rows = await auditFor("tax_rules", id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "INSERT", actor_user_id: superAdminId });
    expect(rows[0]!.new_data).toMatchObject({ country_code: "ZZ", is_active: false, created_by: superAdminId });
    let previous = await updatedAt("tax_rules", "id", id);

    const steps: Array<[string, Record<string, string>, Json, Json]> = [
      ["rate edit", { ratePercentage: "7.5", isActive: "" }, { rate_percentage: 5 }, { rate_percentage: 7.5 }],
      ["activation", { ratePercentage: "7.5", isActive: "on" }, { is_active: false }, { is_active: true }],
      ["deactivation", { ratePercentage: "7.5", isActive: "" }, { is_active: true }, { is_active: false }],
    ];
    for (const [label, fields, oldExpect, newExpect] of steps) {
      const result = await withLiveClient(superAdmin, async () => (await rules()).updateTaxRule({ ruleId: id, countryCode: "ZZ", taxName: "VAT", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: FUTURE_FROM, ...fields }));
      expect(result.ok, label).toBe(true);
      const row = await expectOneNewRow("tax_rules", id, rows, { action: "UPDATE" });
      expect(row.old_data, label).toMatchObject(oldExpect);
      expect(row.new_data, label).toMatchObject(newExpect);
      rows = await auditFor("tax_rules", id);
      const current = await updatedAt("tax_rules", "id", id);
      expect(current, label).toBeGreaterThan(previous);
      previous = current;
    }
    const refused = await withLiveClient(admin, async () => (await rules()).updateTaxRule({ ruleId: id, countryCode: "ZZ", taxName: "VAT", ratePercentage: "9", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: FUTURE_FROM }));
    expect(refused).toEqual({ ok: false, code: "system_not_capable" });
    expect(await auditFor("tax_rules", id)).toEqual(rows);
  }, LIVE_TIMEOUT_MS);

  it("shipping rule: create → INSERT; fee edit → UPDATE; deactivate → UPDATE; updated_at advances; ADMIN refused with no audit row", async () => {
    const rules = async () => import("@/lib/admin/pricing-rules");
    const created = await withLiveClient(superAdmin, async () => (await rules()).createShippingRule({ countryCode: "ZZ", deliveryMethod: "M1 attribution courier", flatFee: "12.5", effectiveFrom: FUTURE_FROM, isActive: "on" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.data.id;
    createdEntityIds.add(id);
    let rows = await auditFor("shipping_rules", id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "INSERT", actor_user_id: superAdminId });
    let previous = await updatedAt("shipping_rules", "id", id);
    for (const [label, fields, oldExpect, newExpect] of [
      ["fee edit", { flatFee: "15", isActive: "on" }, { flat_fee: 12.5 }, { flat_fee: 15 }],
      ["deactivation", { flatFee: "15", isActive: "" }, { is_active: true }, { is_active: false }],
    ] as Array<[string, Record<string, string>, Json, Json]>) {
      const result = await withLiveClient(superAdmin, async () => (await rules()).updateShippingRule({ ruleId: id, countryCode: "ZZ", deliveryMethod: "M1 attribution courier", effectiveFrom: FUTURE_FROM, ...fields }));
      expect(result.ok, label).toBe(true);
      const row = await expectOneNewRow("shipping_rules", id, rows, { action: "UPDATE" });
      expect(row.old_data, label).toMatchObject(oldExpect);
      expect(row.new_data, label).toMatchObject(newExpect);
      rows = await auditFor("shipping_rules", id);
      const current = await updatedAt("shipping_rules", "id", id);
      expect(current, label).toBeGreaterThan(previous);
      previous = current;
    }
    const refused = await withLiveClient(admin, async () => (await rules()).updateShippingRule({ ruleId: id, countryCode: "ZZ", deliveryMethod: "tamper", flatFee: "1", effectiveFrom: FUTURE_FROM }));
    expect(refused).toEqual({ ok: false, code: "system_not_capable" });
    expect(await auditFor("shipping_rules", id)).toEqual(rows);
  }, LIVE_TIMEOUT_MS);
});

describe("6–7. payment accounts — create / edit / deactivate are attributed, and the audit payload is REDACTED", () => {
  it("each change writes one attributed audit row; NO row contains the full account number or IBAN (last four only + change flags); updated_at advances", async () => {
    const accounts = async () => import("@/lib/admin/payment-accounts");
    const base = { accountName: ACCOUNT_NAME, bankName: "Test Bank (M1 fixture)", iban: FULL_IBAN.toLowerCase(), swiftCode: "testzz00" };
    const created = await withLiveClient(superAdmin, async () => (await accounts()).createPaymentAccount({ ...base, accountNumber: FIRST_NUMBER, isActive: "on" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.data.id;
    createdEntityIds.add(id);
    let rows = await auditFor("payment_accounts", id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "INSERT", actor_user_id: superAdminId, old_data: null });
    expect(rows[0]!.new_data).toMatchObject({ id, account_name: ACCOUNT_NAME, bank_name: "Test Bank (M1 fixture)", swift_code: "TESTZZ00", is_active: true, created_by: superAdminId, account_number_last4: "****8899", iban_last4: "****0001" });
    expect(rows[0]!.metadata).toMatchObject({ redaction: "last4_only", redacted_fields: ["account_number", "iban"] });
    let previous = await updatedAt("payment_accounts", "id", id);

    const edited = await withLiveClient(superAdmin, async () => (await accounts()).updatePaymentAccount({ accountId: id, ...base, bankName: "Test Bank (M1 fixture) — edited", accountNumber: SECOND_NUMBER, isActive: "on" }));
    expect(edited.ok).toBe(true);
    const edit = await expectOneNewRow("payment_accounts", id, rows, { action: "UPDATE" });
    expect(edit.old_data).toMatchObject({ bank_name: "Test Bank (M1 fixture)", account_number_last4: "****8899" });
    expect(edit.new_data).toMatchObject({ bank_name: "Test Bank (M1 fixture) — edited", account_number_last4: "****3333", account_number_changed: true, iban_changed: false });
    rows = await auditFor("payment_accounts", id);
    let current = await updatedAt("payment_accounts", "id", id);
    expect(current).toBeGreaterThan(previous);
    previous = current;

    const deactivated = await withLiveClient(superAdmin, async () => (await accounts()).updatePaymentAccount({ accountId: id, ...base, bankName: "Test Bank (M1 fixture) — edited", accountNumber: SECOND_NUMBER, isActive: "" }));
    expect(deactivated.ok).toBe(true);
    const deactivate = await expectOneNewRow("payment_accounts", id, rows, { action: "UPDATE" });
    expect(deactivate.old_data).toMatchObject({ is_active: true });
    expect(deactivate.new_data).toMatchObject({ is_active: false, account_number_changed: false, iban_changed: false });
    rows = await auditFor("payment_accounts", id);
    current = await updatedAt("payment_accounts", "id", id);
    expect(current).toBeGreaterThan(previous);
    expect(rows).toHaveLength(3);

    // REDACTION: neither the numbers nor the IBAN (with or without spaces, any case) appear anywhere in ANY audit row.
    const serialized = JSON.stringify(rows);
    for (const secret of [FIRST_NUMBER, SECOND_NUMBER, FULL_IBAN, FULL_IBAN.replaceAll(" ", ""), FULL_IBAN.toLowerCase(), FULL_IBAN.replaceAll(" ", "").toLowerCase()]) {
      expect(serialized, `audit rows must not contain ${secret}`).not.toContain(secret);
    }
    for (const row of rows) {
      expect(Object.keys(row.new_data ?? {}).every((key) => key !== "account_number" && key !== "iban")).toBe(true);
      expect(Object.keys(row.old_data ?? {}).every((key) => key !== "account_number" && key !== "iban")).toBe(true);
    }
    // …and the ADMIN (a platform admin, who can already read the audit log) sees the same redacted rows and nothing more.
    const adminView = await admin.from("audit_logs").select("old_data, new_data").eq("entity_type", "payment_accounts").eq("entity_id", id);
    expect((adminView.data ?? []).length).toBe(3);
    expect(JSON.stringify(adminView.data)).not.toMatch(/ACCT-|ZZ00 ?TEST 0000/i);

    // Unauthorized roles: refused as before, no audit row.
    for (const [label, client] of [["ADMIN", admin], ["finance", finance], ["member", member]] as const) {
      const refused = await withLiveClient(client, async () => (await accounts()).updatePaymentAccount({ accountId: id, ...base, accountNumber: "TAMPER-0000-0000", isActive: "on" }));
      expect(refused.ok, label).toBe(false);
    }
    const rawAdmin = await admin.from("payment_accounts").update({ account_number: "RAW-TAMPER-0000" }).eq("id", id).select("id");
    expect(rawAdmin.error !== null || (rawAdmin.data ?? []).length === 0).toBe(true);
    expect(await auditFor("payment_accounts", id)).toEqual(rows);
    expect((await superAdmin.from("payment_accounts").select("account_number").eq("id", id).single()).data?.account_number).toBe(SECOND_NUMBER);
  }, LIVE_TIMEOUT_MS);
});

describe("9–12. nothing else moved — RLS/grants behave exactly as before, no unrelated configuration row changed, audit_logs still append-only", () => {
  it("audit_logs is readable only by platform admins (member and finance read nothing) and cannot be written or edited by any session", async () => {
    for (const [label, client] of [["member", member], ["finance", finance]] as const) {
      const { data, error } = await client.from("audit_logs").select("id").eq("entity_type", "platform_admins").limit(5);
      expect(error, label).toBeNull();
      expect(data ?? [], label).toEqual([]);
    }
    expect(((await admin.from("audit_logs").select("id").eq("entity_type", "platform_admins").eq("entity_id", targetId)).data ?? []).length).toBeGreaterThan(0);
    const insert = await superAdmin.from("audit_logs").insert({ entity_type: "platform_admins", entity_id: targetId, action: "FORGED" });
    expect(insert.error?.code).toBe("42501");
    const rowsBefore = await auditFor("platform_admins", targetId);
    const update = await superAdmin.from("audit_logs").update({ action: "TAMPERED" }).eq("entity_id", targetId).select("id");
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
    expect(await auditFor("platform_admins", targetId)).toEqual(rowsBefore);
  }, LIVE_TIMEOUT_MS);

  it("authorization is unchanged: ADMIN's raw inserts on the config tables are still refused by RLS; anonymous reads nothing", async () => {
    const adminId = (await admin.auth.getUser()).data.user!.id;
    const insert = await admin.from("commission_policies").insert({ name: `${POLICY_NAME} raw`, status: "DRAFT", effective_from: "2099-01-01T00:00:00Z", created_by: adminId }).select("id");
    expect(insert.error?.code).toBe("42501");
    for (const table of CONFIG_TABLES) {
      const { data, error } = await anonymous.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, `anonymous ${table}`).toBe(true);
    }
    for (const table of ["platform_admins", "commission_policies", "commission_tiers", "tax_rules", "shipping_rules"] as const) {
      const { data } = await member.from(table).select("*").limit(1);
      expect(data ?? [], `member ${table}`).toEqual([]);
    }
  }, LIVE_TIMEOUT_MS);

  it("no unrelated configuration row changed (values AND updated_at byte-identical), and every audit row written for the six tables since this file started belongs to a row this file created", async () => {
    expect(await untaggedConfigSnapshot()).toEqual(baseline);
    const { data, error } = await superAdmin
      .from("audit_logs")
      .select("id, entity_type, entity_id, actor_user_id")
      .in("entity_type", [...CONFIG_TABLES])
      .gt("id", auditWatermark);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).filter((row) => !createdEntityIds.has(row.entity_id as string))).toEqual([]);
    // Every one of those rows was written by the real SUPER_ADMIN session (none by a refused caller).
    expect((data ?? []).every((row) => row.actor_user_id === superAdminId)).toBe(true);
  }, LIVE_TIMEOUT_MS);

  it("cleanup removes only the tagged rows while their audit history — with the redacted payload and a NULL-actor DELETE row — remains", async () => {
    const { data: accountRows } = await superAdmin.from("payment_accounts").select("id").like("account_name", `${RUN_F_CONFIG_ROWS.accountNamePrefix}%`);
    const accountIds = (accountRows ?? []).map((row) => row.id as string);
    expect(accountIds).toHaveLength(1);
    cleanupRunFConfigRows();
    expect(((await superAdmin.from("payment_accounts").select("id").in("id", accountIds)).data ?? [])).toEqual([]);
    const history = await auditFor("payment_accounts", accountIds[0]!);
    expect(history.map((row) => row.action)).toEqual(["INSERT", "UPDATE", "UPDATE", "DELETE"]);
    expect(history.at(-1)).toMatchObject({ actor_user_id: null, new_data: null });
    expect(JSON.stringify(history)).not.toMatch(/ACCT-|ZZ00 ?TEST 0000/);
    expect((await auditFor("platform_admins", targetId)).at(-1)?.action).toBe("DELETE");
  }, LIVE_TIMEOUT_MS);
});

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { FixtureManifest, fixtureCheckoutDefinition, id, sql, OWNED_TABLES, removeOwnedStorage } from "./f016-live-fixtures";
import { F016_LIVE_SCENARIOS, assertExpectedDomainError } from "./f016-live-scenarios";
import { LiveDatabaseError } from "./f016-live-session";

vi.mock("@/scripts/f016-live-target", () => ({ assertF016LiveTarget: () => ({ ref: "test" }), executeF016Sql: vi.fn() }));
const fixtureSource = readFileSync("tests/finance/f016-live-fixtures.ts", "utf8");
const scenarioSource = readFileSync("tests/finance/f016-live-scenarios.ts", "utf8");
const pathFor = (m: FixtureManifest) => `org/${m.buyerOrganizationId}/orders/${m.order()}/16000000-0000-4000-8000-000000000001/proof`;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("F016 manifest and live contract safety", () => {
  it("allocates disjoint run roots before mutation and records composite keys", () => {
    const a = new FixtureManifest(), b = new FixtureManifest();
    expect(a.testRunId).not.toBe(b.testRunId);
    expect(a.buyerOrganizationId).not.toBe(b.buyerOrganizationId);
    const order = a.order(); expect(a.orderIds.has(order)).toBe(true);
    a.record("organization_members", { organization_id: a.buyerOrganizationId, user_id: id("16000000-0000-4000-8000-000000000001") });
    expect(a.rows.get("organization_members")?.size).toBe(1);
    expect(() => a.record("profiles", { id: order })).toThrow("f016_manifest_table_refused");
  });
  it("uses the real request log and covers all immutable proforma descendants", () => {
    expect(scenarioSource).not.toContain("randomUUID");
    expect(scenarioSource).toContain("f.manifest.request(requestId)");
    expect(fixtureSource).toContain("delete from public.commerce_request_log where request_id=");
    expect(fixtureSource).toContain("f016_request_log_leak");
    expect(fixtureSource).not.toContain("commerce_requests");
    for (const t of ["commerce_request_log", "proforma_line_economics", "proforma_seller_settlements", "proforma_bank_instructions"]) expect(OWNED_TABLES).toContain(t);
    expect(fixtureSource).toContain("pg_constraint");
    expect(fixtureSource).toContain("using k.key");
    expect(fixtureSource).not.toContain("session_replication_role");
    expect(fixtureSource).toContain("not t.tgisinternal");
    expect(fixtureSource).toContain("f016_guard_restore_failed");
  });
  it("creates its own buyer, seller, offers, inventory and carts", () => {
    expect(fixtureSource).not.toMatch(/F013_FIXTURES\.(offers|positions|warehouses|hillsOrganizationId)/);
    for (const t of ["organizations", "organization_members", "warehouses", "coffee_lots", "inventory_positions", "coffee_offers", "orders"]) expect(fixtureSource).toContain(`insert into public.${t}`);
    expect(fixtureSource).toContain("f016_cart_isolation_failed");
    expect(fixtureSource).toContain("finally{if(m.rows.size)await cleanupLiveFixture(m);}");
  });
  it("keeps the scaffold session-local and leaves enrollment settings untouched", () => {
    const definition = fixtureCheckoutDefinition();
    expect(definition).toContain("function pg_temp.f016_fixture_checkout(");
    expect(definition).not.toContain("raise exception 'checkout_disabled'");
    expect(definition).toContain("public.compute_order_quote");
    expect(definition).toContain("insert into public.proforma_line_economics");
    expect(definition).not.toContain("update public.commerce_settings");
  });
  it("contains exactly one literal registry used for all IDs and names", () => {
    expect(F016_LIVE_SCENARIOS.map(s => s.id)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
    expect(new Set(F016_LIVE_SCENARIOS.map(s => s.name)).size).toBe(29);
    expect(new Set(F016_LIVE_SCENARIOS.map(s => s.handler)).size).toBe(29);
    expect(scenarioSource).not.toMatch(/F016_LIVE_SCENARIO_(NAMES|REGISTRY)/);
  });
  it("requires acknowledged backend overlap and exact NULL-key conservation", () => {
    for (const token of ["pg_backend_pid()", "ackA", "ackB", "pg_stat_activity", "wait_event_type='Lock'", "f016_barrier_overlap_ack_timeout", "sellerBefore", "buyerBefore", "warehouse_location_id is null"]) expect(scenarioSource).toContain(token);
  });
  it("requires multiple real groups, exact memberships and both notification decisions", () => {
    for (const token of ["f016_multigroup_fixture_invalid", "f016_exact_group_membership_or_quantity", "f016_group_provenance", '"CONFIRMED","REJECTED"', "f016_buyer_recipient_or_tenant_or_duplicate", "v_expected_users", "om.is_active = true"]) expect(scenarioSource).toContain(token);
  });
  it("rejects invalid UUIDs and escapes SQL text", () => {
    expect(() => id("16000000-0000-4000-8000-00000000000Z")).toThrow();
    expect(sql("a'b")).toBe("'a''b'");
  });
  it("rejects success, wrong tokens, substring matches and non-domain SQL errors", () => {
    expect(() => assertExpectedDomainError(undefined, "request_id_conflict")).toThrow("f016_expected_error_not_raised");
    for (const actual of [new Error("request_id_conflict"), new LiveDatabaseError("request_id_conflict", "23505"), new LiveDatabaseError("prefix request_id_conflict", "P0001"), new LiveDatabaseError("forbidden", "P0001")]) {
      expect(() => assertExpectedDomainError(actual, "request_id_conflict")).toThrow("f016_unexpected_error_raised");
    }
    expect(() => assertExpectedDomainError(new LiveDatabaseError("  REQUEST_ID_CONFLICT  ", "P0001"), "request_id_conflict")).not.toThrow();
  });
  it("fails on Storage deletion errors", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const m = new FixtureManifest(); m.storagePaths.add(pathFor(m));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(removeOwnedStorage(m)).rejects.toThrow("f016_storage_delete_failed");
  });
  it("fails when deletion reports success but the object still exists", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const m = new FixtureManifest(); m.storagePaths.add(pathFor(m));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await expect(removeOwnedStorage(m)).rejects.toThrow("f016_storage_object_absence_not_verified");
  });
  it("verifies every exact path is absent after successful deletion", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const m = new FixtureManifest(); m.storagePaths.add(pathFor(m)); m.storagePaths.add(pathFor(m));
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetcher);
    await removeOwnedStorage(m); expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).prefixes).toEqual([...m.storagePaths]);
  });
  it("refuses Storage paths outside the allocated order/run before network access", async () => {
    const m = new FixtureManifest(); m.storagePaths.add("unrelated/proof");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(removeOwnedStorage(m)).rejects.toThrow("f016_storage_scope_refused");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fetchActiveDifferentials } from "@/lib/pricing/differentials";
import { buildReferencePresentation } from "@/lib/pricing/presentation";
import { fetchBenchmarkSnapshot, fetchObservationsForSource } from "@/lib/pricing/sources";
import { createPublicReadClient } from "@/lib/public/supabase";
import {
  FOUNDATION_FIXTURES,
  PRICING_FIXTURES,
  cleanupAuditorFixture,
  cleanupCatalogueAdminFixture,
  cleanupComplianceFixture,
  cleanupPricingFixtures,
  createAnonymousFixtureClient,
  inspectCatalogueAdminFixture,
  prepareAuditorFixture,
  prepareCatalogueAdminFixture,
  prepareComplianceFixture,
  seedPricingFixtures,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 011 — LIVE proof (real anonymous key, REAL authenticated sessions, real RLS) of the reference-price data
 * boundary after migration `20260920160000_feature_011_db_block_10_price_policy_scope.sql`. **Run only after the
 * migration is applied** — before it, every anonymous read of a pricing table aborts with
 * `42501 permission denied for function is_platform_admin` and this file is red, correctly.
 *
 * Proves, against disposable `F011-` rows (removed in `afterAll`):
 *   - the anonymous role reads EXACTLY the approved + active sources, their observations and the active differentials
 *     — no error, no other row;
 *   - the licence gate holds at the data layer for every non-approved state, also when requested by id;
 *   - non-admin roles (member, finance, warehouse, auditor, compliance, anonymous) cannot INSERT / UPDATE / DELETE
 *     reference data; a platform ADMIN's write path is unchanged (and DELETE stays ungranted for everyone);
 *   - exact stored decimals reach the DTO; the exchange-rate observation is never surfaced; nothing unrelated changed.
 */

const LIVE_TIMEOUT_MS = 180_000;
const F = PRICING_FIXTURES;
const F011 = (code: unknown) => String(code).startsWith(F.codePrefix);

let anonymous: SupabaseClient;
let admin: SupabaseClient;
const clients: Record<string, SupabaseClient> = {};
let unrelatedBefore: string;

/**
 * The stored decimal as the DATABASE renders it (`numeric::text`). The columns carry a fixed scale, so `250.125` is stored
 * — and must be shown — as `250.125000`: "exactly as recorded" means the stored text, not a re-formatted number.
 */
async function storedText(table: "price_observations" | "price_differentials", column: "raw_value" | "amount", filter: Record<string, string>): Promise<string[]> {
  let query = admin.from(table).select(`${column}::text`);
  for (const [key, value] of Object.entries(filter)) query = query.eq(key, value);
  const { data, error } = await query;
  if (error) throw new Error(`stored read failed on ${table}: ${error.code}`);
  return (data ?? []).map((row) => String((row as unknown as Record<string, string>)[column]));
}

/** A stable string of every NON-F011 row in the three tables (as a platform ADMIN sees them). */
async function unrelatedSnapshot(): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const table of ["price_sources", "price_observations", "price_differentials"]) {
    const { data, error } = await admin.from(table).select("*").order("id");
    if (error) throw new Error(`snapshot failed on ${table}: ${error.code}`);
    out[table] = (data ?? []).filter((row) => !F011((row as { code?: string }).code) && !String((row as { id: string }).id).startsWith("f0110000") && !String((row as { price_source_id?: string }).price_source_id ?? "").startsWith("f0110000"));
  }
  return JSON.stringify(out);
}

beforeAll(async () => {
  prepareCatalogueAdminFixture();
  prepareComplianceFixture();
  prepareAuditorFixture();
  cleanupPricingFixtures();
  admin = await signInAsFixture(FOUNDATION_FIXTURES.catalogueAdmin.email);
  unrelatedBefore = await unrelatedSnapshot();
  seedPricingFixtures();
  anonymous = createAnonymousFixtureClient();
  clients.member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  clients.finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  clients.warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  clients.auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  clients.compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
}, LIVE_TIMEOUT_MS);

afterAll(async () => {
  cleanupPricingFixtures();
  for (const [cleanup, inspect] of [[cleanupCatalogueAdminFixture, inspectCatalogueAdminFixture]] as const) {
    expect(cleanup().activeAdminPrivilege).toBe(false);
    expect(inspect().activeCapability).toBe(false);
  }
  cleanupAuditorFixture();
  cleanupComplianceFixture();
}, LIVE_TIMEOUT_MS);

describe("1. the anonymous role reads exactly the public reference boundary (DB-BLOCK-10 remainder fixed)", () => {
  it("price_sources: no 42501; only the APPROVED + active sources", async () => {
    const { data, error } = await anonymous.from("price_sources").select("id, code, licence_status, is_active");
    expect(error, "anonymous read must not abort with 42501 permission denied for function is_platform_admin").toBeNull();
    const mine = (data ?? []).filter((row) => F011(row.code));
    expect(mine.map((row) => row.code).sort()).toEqual([F.approved.code, F.stale.code].sort());
    for (const row of data ?? []) {
      expect(row.licence_status).toBe("APPROVED");
      expect(row.is_active).toBe(true);
    }
  }, LIVE_TIMEOUT_MS);

  it("price_observations: only observations of approved + active sources — none of PENDING / RESTRICTED / DISABLED / inactive, even by source id", async () => {
    const { data, error } = await anonymous.from("price_observations").select("price_source_id, raw_value::text, symbol").in("price_source_id", [F.approved.id, F.stale.id, F.pending.id, F.restricted.id, F.disabled.id, F.inactive.id]);
    expect(error).toBeNull();
    const ids = new Set((data ?? []).map((row) => row.price_source_id));
    expect([...ids].sort()).toEqual([F.approved.id, F.stale.id].sort());
    expect(JSON.stringify(data)).not.toMatch(/111\.111|222\.222|333\.333|444\.444/);
    // the raw RLS boundary does expose the exchange-rate row of an approved source — which is why the layer filters commodity types
    expect((data ?? []).some((row) => row.symbol === "EURUSD")).toBe(true);
  }, LIVE_TIMEOUT_MS);

  it("price_differentials: only ACTIVE rows (the inactive one is invisible)", async () => {
    const { data, error } = await anonymous.from("price_differentials").select("id").in("id", [...F.differentialIds]);
    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.id).sort()).toEqual([F.differentialIds[0], F.differentialIds[1], F.differentialIds[3], F.differentialIds[4]].sort());
  }, LIVE_TIMEOUT_MS);
});

describe("2. the licence-gated layer over the real database (anonymous client, exact values)", () => {
  it("snapshot: the approved source's LATEST coffee observation, exact digits; the stale one flagged; the exchange-rate row and every non-approved value absent", async () => {
    const snapshot = await fetchBenchmarkSnapshot(createPublicReadClient(), new Date().toISOString());
    const mine = snapshot.records.filter((r) => F011(r.source.code));
    const storedKc = await storedText("price_observations", "raw_value", { price_source_id: F.approved.id, symbol: "KC", observed_at: "2026-09-01T12:00:00+00:00" });
    const storedRc = await storedText("price_observations", "raw_value", { price_source_id: F.stale.id, symbol: "RC" });
    expect(storedKc).toHaveLength(1);
    expect(mine.map((r) => [r.source.code, r.symbol, r.rawValue, r.rawUnit, r.rawCurrency, r.isStale])).toEqual([
      [F.approved.code, "KC", storedKc[0], "cents/lb", "USD", false],
      [F.stale.code, "RC", storedRc[0], "USD/MT", "USD", true],
    ]);
    // …and that stored text is the seeded number, unaltered (only the column's fixed scale pads it)
    expect(Number(mine[0].rawValue)).toBe(250.125);
    expect(mine[0].rawValue).toMatch(/^250\.1250*$/);
    expect(mine[0]).toMatchObject({ delayType: "DELAYED", delayMinutes: 15, observedAt: expect.stringContaining("2026-09-01T12:00:00") });
    const text = JSON.stringify(snapshot);
    for (const leaked of ["111.111", "222.222", "333.333", "444.444", "EURUSD", "1.0812", "F011 Pending", "F011 Restricted", "F011 Disabled", "F011 Inactive"]) expect(text, leaked).not.toContain(leaked);
  }, LIVE_TIMEOUT_MS);

  it("non-approved and inactive sources return nothing even when requested BY ID; the approved one returns its coffee observations", async () => {
    const client = createPublicReadClient();
    for (const source of [F.pending, F.restricted, F.disabled, F.inactive]) expect(await fetchObservationsForSource(client, source.id), source.code).toEqual([]);
    const approved = await fetchObservationsForSource(client, F.approved.id);
    expect(approved.map((r) => [r.symbol, Number(r.rawValue)])).toEqual([["KC", 250.125]]);
  }, LIVE_TIMEOUT_MS);

  it("differentials (general scope): the two active, in-period, non-scoped ones — exact amounts, no notes; inactive / expired / coffee-scoped excluded", async () => {
    const records = await fetchActiveDifferentials(createPublicReadClient(), { kind: "general" }, new Date());
    const stored = new Map<string, string>();
    for (const [index, key] of [[0, "ORIGIN"], [1, "QUALITY"]] as const) stored.set(key, (await storedText("price_differentials", "amount", { id: F.differentialIds[index] }))[0]);
    const mine = records.filter((r) => [...stored.values()].includes(r.amount) || [9.99, 7.77, 5.55].includes(Number(r.amount)));
    expect(mine.map((r) => [r.type, r.amount, r.currency, r.unit]).sort()).toEqual([["ORIGIN", stored.get("ORIGIN"), "USD", "KG"], ["QUALITY", stored.get("QUALITY"), "USD", "KG"]]);
    expect(Number(stored.get("ORIGIN"))).toBe(12.5);
    expect(JSON.stringify(records)).not.toMatch(/F011 internal note/);
  }, LIVE_TIMEOUT_MS);

  it("the presentation contract over the live rows: current + stale entries, a basis marked explanatory, no summed amount, no conversion", async () => {
    const client = createPublicReadClient();
    const [snapshot, differentials] = await Promise.all([fetchBenchmarkSnapshot(client, new Date().toISOString()), fetchActiveDifferentials(client, { kind: "general" }, new Date())]);
    const presentation = buildReferencePresentation(snapshot, differentials, new Date());
    expect(presentation.status).toBe("ready");
    if (presentation.status !== "ready") return;
    const mine = presentation.entries.filter((e) => F011(e.state === "current" ? e.price.source.code : e.stale.source.code));
    expect(mine.map((e) => e.state)).toEqual(["current", "stale"]);
    const current = mine[0];
    if (current.state === "current") {
      expect(current.price).toMatchObject({ rawUnit: "cents/lb", rawCurrency: "USD", timeZone: "UTC", referenceOnly: true, kind: "REFERENCE" });
      expect(Number(current.price.rawValue)).toBe(250.125);
    }
    expect(JSON.stringify(mine[1])).not.toMatch(/4100/); // the stale figure is withheld
    expect(presentation.basis?.explanatoryOnly).toBe(true);
    expect(JSON.stringify(presentation)).not.toContain("13.25"); // 12.50 + 0.75 must never appear
  }, LIVE_TIMEOUT_MS);
});

describe("3. authorization — reads follow the current policy; reference data is mutable ONLY by a platform administrator", () => {
  it.each(["member", "finance", "warehouse", "auditor", "compliance"])("an authenticated %s reads only the public boundary (approved + active) — no private pricing exists to see", async (role) => {
    const { data, error } = await clients[role].from("price_sources").select("code, licence_status");
    expect(error).toBeNull();
    expect((data ?? []).filter((row) => F011(row.code)).map((row) => row.code).sort()).toEqual([F.approved.code, F.stale.code].sort());
  }, LIVE_TIMEOUT_MS);

  it.each(["anonymous", "member", "finance", "warehouse", "auditor", "compliance"])("%s cannot INSERT, UPDATE or DELETE reference data", async (role) => {
    const client = role === "anonymous" ? anonymous : clients[role];
    const attempts: Array<[string, PromiseLike<{ error: { code?: string } | null; data: unknown[] | null }>]> = [
      ["insert source", client.from("price_sources").insert({ name: "F011 tamper", code: "F011-TAMPER", source_type: "OTHER" }).select("id")],
      ["update source", client.from("price_sources").update({ licence_status: "RESTRICTED", name: "tampered" }).eq("id", F.approved.id).select("id")],
      ["delete source", client.from("price_sources").delete().eq("id", F.approved.id).select("id")],
      ["insert observation", client.from("price_observations").insert({ price_source_id: F.approved.id, symbol: "KC", commodity_type: "ARABICA", raw_value: "1", raw_currency: "USD", raw_unit: "u", observed_at: "2026-09-02T00:00:00Z" }).select("id")],
      ["update observation", client.from("price_observations").update({ raw_value: "1" }).eq("price_source_id", F.approved.id).select("id")],
      ["delete observation", client.from("price_observations").delete().eq("price_source_id", F.approved.id).select("id")],
      ["insert differential", client.from("price_differentials").insert({ differential_type: "OTHER", amount: "1" }).select("id")],
      ["update differential", client.from("price_differentials").update({ amount: "1" }).eq("id", F.differentialIds[0]).select("id")],
      ["delete differential", client.from("price_differentials").delete().eq("id", F.differentialIds[0]).select("id")],
    ];
    for (const [label, attempt] of attempts) {
      const { error, data } = await attempt;
      // refused either by an explicit error (RLS WITH CHECK / missing grant) or by matching zero rows (no UPDATE policy passes)
      expect(error !== null || (data ?? []).length === 0, `${role}: ${label} must be refused`).toBe(true);
    }
    const { data: still } = await admin.from("price_sources").select("name, licence_status, is_active").eq("id", F.approved.id).single();
    expect(still).toEqual({ name: "F011 Approved Source", licence_status: "APPROVED", is_active: true });
    const { data: obs } = await admin.from("price_observations").select("raw_value::text").eq("price_source_id", F.approved.id).eq("symbol", "KC");
    expect((obs ?? []).map((row) => Number(row.raw_value)).sort((a, b) => a - b)).toEqual([240.5, 250.125]);
  }, LIVE_TIMEOUT_MS);

  it("a platform ADMIN sees EVERY source (why the layer gates the licence itself) and can still write — but DELETE stays ungranted", async () => {
    const { data: all } = await admin.from("price_sources").select("code, licence_status").like("code", `${F.codePrefix}%`);
    expect((all ?? []).map((row) => row.code).sort()).toEqual([F.approved.code, F.stale.code, F.pending.code, F.restricted.code, F.disabled.code, F.inactive.code].sort());

    const inserted = await admin.from("price_sources").insert({ name: "F011 Admin Proof", code: "F011-ADMIN-PROOF", source_type: "OTHER", licence_status: "APPROVED", delay_type: "MANUAL" }).select("id").single();
    expect(inserted.error).toBeNull();
    const id = inserted.data!.id as string;
    const obs = await admin.from("price_observations").insert({ price_source_id: id, symbol: "KC", commodity_type: "ARABICA", raw_value: "199.5", raw_currency: "USD", raw_unit: "cents/lb", observed_at: "2026-09-03T00:00:00Z" });
    expect(obs.error).toBeNull();
    expect((await fetchObservationsForSource(createPublicReadClient(), id)).map((r) => Number(r.rawValue))).toEqual([199.5]); // approved → public

    const restricted = await admin.from("price_sources").update({ licence_status: "RESTRICTED" }).eq("id", id).select("licence_status");
    expect(restricted.error).toBeNull();
    expect(restricted.data).toEqual([{ licence_status: "RESTRICTED" }]);
    expect(await fetchObservationsForSource(createPublicReadClient(), id)).toEqual([]); // revoked → gone from the public boundary at once

    const deleted = await admin.from("price_sources").delete().eq("id", id).select("id");
    expect(deleted.error?.code, "authenticated has never held DELETE on these tables — unchanged").toBe("42501");
  }, LIVE_TIMEOUT_MS);

  it("nothing unrelated changed: every pre-existing row of the three tables is byte-identical after all of the above", async () => {
    cleanupPricingFixtures();
    expect(await unrelatedSnapshot()).toBe(unrelatedBefore);
  }, LIVE_TIMEOUT_MS);
});

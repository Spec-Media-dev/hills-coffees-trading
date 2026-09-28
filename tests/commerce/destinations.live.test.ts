import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { F013_LOCAL_API_URL, F013_LOCAL_DB_URL, F013_LOCAL_PROJECT_ID } from "@/scripts/f013-local-target";
import {
  F013_FIXTURES,
  createAnonymousFixtureClient,
  inspectF013T071State,
  requireF013T071LiveTarget,
  signInAsFixture,
  type F013T071State,
} from "@/tests/auth/fixture-session";

/**
 * Feature 013 T071 (MP-6, LOCAL) — M4a delivery-destination live proof against the verified `hills-f013-local` stack.
 * Gated like the cart proof (F013_LIVE=1 AND F013_T071_LIVE=1, nonce-verified loopback target). Destinations are written
 * only through upsert_delivery_destination / retire_delivery_destination; rows are synthetic, PII-free and run-tagged.
 */
const T071 = process.env.F013_LIVE === "1" && process.env.F013_T071_LIVE === "1";

const ORG_A = F013_FIXTURES.members.buyerA.organizationId;
const ORG_B = F013_FIXTURES.members.buyerB.organizationId;
const RUN_TAG = randomUUID().slice(0, 8);

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type Destination = { id: string; organization_id: string; label: string; country_code: string; city: string; address_line_1: string;
  address_line_2: string | null; contact_name: string; contact_phone: string; delivery_method: string; is_default: boolean;
  retired_at: string | null; retired_by: string | null };
const fields = (label: string, overrides: Record<string, unknown> = {}) => ({
  label: `T071 ${RUN_TAG} ${label}`, country_code: "AE", city: "Dubai", address_line_1: "F013 Synthetic Warehouse Road 1",
  contact_name: "F013 Synthetic Contact", contact_phone: "+97140000001", delivery_method: "Courier", ...overrides,
});
const expectCode = (result: RpcResult, code: string) => {
  expect(result.data ?? null).toBeNull();
  expect(result.error?.message ?? "", `expected ${code}`).toMatch(new RegExp(`\\b${code}\\b`));
};
/** Buyer-A orders as the service-role inspector sees them — the retire proof shows none of them changes. */
const buyerAOrders = (state: F013T071State) => state.orders.filter((row) => row.buyer_organization_id === ORG_A).sort((a, b) => String(a.id).localeCompare(String(b.id)));

describe.skipIf(!T071)("T071 — M4a delivery destinations live proof (LOCAL hills-f013-local)", () => {
  let buyerA: SupabaseClient;
  let buyerB: SupabaseClient;
  let anonymous: SupabaseClient;
  let buyerAUser: string;
  let first: string;
  let second: string;
  let foreign: string;

  const upsert = (client: SupabaseClient, id: string | null, org: string, payload: unknown, requestId: string = randomUUID()) =>
    client.rpc("upsert_delivery_destination", { p_id: id, p_org_id: org, p_fields: payload, p_request_id: requestId }) as unknown as Promise<RpcResult>;
  const retire = (client: SupabaseClient, id: string, requestId: string = randomUUID()) =>
    client.rpc("retire_delivery_destination", { p_id: id, p_request_id: requestId }) as unknown as Promise<RpcResult>;
  const read = async (client: SupabaseClient, id: string): Promise<Destination | null> => {
    const { data, error } = await client.from("delivery_destinations").select("*").eq("id", id).maybeSingle();
    expect(error).toBeNull();
    return data as Destination | null;
  };
  const activeDefaults = async (client: SupabaseClient, org: string) => {
    const { data, error } = await client.from("delivery_destinations").select("id").eq("organization_id", org).eq("is_default", true).is("retired_at", null);
    expect(error).toBeNull();
    return (data ?? []).map((row) => String(row.id));
  };

  beforeAll(async () => {
    const target = requireF013T071LiveTarget();
    expect(target.projectId).toBe(F013_LOCAL_PROJECT_ID);
    expect(target.apiUrl).toBe(F013_LOCAL_API_URL);
    expect(target.dbUrl).toBe(F013_LOCAL_DB_URL);
    buyerA = await signInAsFixture(F013_FIXTURES.members.buyerA.email);
    buyerB = await signInAsFixture(F013_FIXTURES.members.buyerB.email);
    anonymous = createAnonymousFixtureClient();
    buyerAUser = String(inspectF013T071State().users[F013_FIXTURES.members.buyerA.email]);
  }, 300_000);

  it("creates a destination once: an identical replay returns the same id and writes no duplicate", async () => {
    const requestId = randomUUID();
    const created = await upsert(buyerA, null, ORG_A, fields("first", { is_default: true }), requestId);
    expect(created.error).toBeNull();
    first = String(created.data);
    const replay = await upsert(buyerA, null, ORG_A, fields("first", { is_default: true }), requestId);
    expect(replay.error).toBeNull();
    expect(replay.data).toBe(first);
    const { data, error } = await buyerA.from("delivery_destinations").select("id").eq("label", fields("first").label);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await read(buyerA, first)).toMatchObject({ organization_id: ORG_A, country_code: "AE", city: "Dubai", address_line_2: null,
      delivery_method: "Courier", is_default: true, retired_at: null, retired_by: null });
    expect(await activeDefaults(buyerA, ORG_A)).toEqual([first]);
    // H1 authorizes the requested organization before request-log lookup, so this caller cannot use a
    // known request id to distinguish another organization's replay from a fresh request.
    expectCode(await upsert(buyerA, null, ORG_B, fields("first"), requestId), "buyer_not_authorized");
  }, 120_000);

  it("keeps exactly one active default per organization when the default switches", async () => {
    const created = await upsert(buyerA, null, ORG_A, fields("second", { is_default: true }));
    expect(created.error).toBeNull();
    second = String(created.data);
    expect(await activeDefaults(buyerA, ORG_A)).toEqual([second]);
    expect((await read(buyerA, first))?.is_default).toBe(false);
  }, 120_000);

  it("updates in place through the explicit organization; the update replays idempotently", async () => {
    const requestId = randomUUID();
    const updated = await upsert(buyerA, first, ORG_A, fields("first", { city: "Abu Dhabi", address_line_2: "Unit 2", is_default: true }), requestId);
    expect(updated.error).toBeNull();
    expect(updated.data).toBe(first);
    expect((await upsert(buyerA, first, ORG_A, fields("first", { city: "Abu Dhabi", address_line_2: "Unit 2", is_default: true }), requestId)).data).toBe(first);
    expect(await read(buyerA, first)).toMatchObject({ city: "Abu Dhabi", address_line_2: "Unit 2", is_default: true });
    expect(await activeDefaults(buyerA, ORG_A)).toEqual([first]);
    expect((await read(buyerA, second))?.is_default).toBe(false);
  }, 120_000);

  it("rejects every invalid field set with the stable destination_invalid and writes nothing", async () => {
    const invalid: unknown[] = [
      fields("bad-country", { country_code: "ae" }), fields("bad-phone", { contact_phone: "0501234567" }),
      fields("bad-method", { delivery_method: "Truck" }), fields("bad-default", { is_default: "sometimes" }),
      fields("blank-city", { city: "   " }), { label: `T071 ${RUN_TAG} missing` }, "not-an-object",
    ];
    for (const payload of invalid) {
      const result = await upsert(buyerA, null, ORG_A, payload);
      expectCode(result, "destination_invalid");
      expect(result.error!.message).not.toMatch(/check|constraint|delivery_destinations_/i);
    }
    const { data } = await buyerA.from("delivery_destinations").select("id").like("label", `T071 ${RUN_TAG} %`);
    expect((data ?? []).length).toBe(2);
    expectCode(await upsert(buyerA, null, ORG_A, fields("no-request"), null as unknown as string), "request_id_required");
  }, 120_000);

  it("cross-organization access is destination_not_found — indistinguishable from a nonexistent id — and leaks nothing", async () => {
    const created = await upsert(buyerB, null, ORG_B, fields("foreign"));
    expect(created.error).toBeNull();
    foreign = String(created.data);
    const crossUpdate = await upsert(buyerA, foreign, ORG_A, fields("hijack"));
    const missingUpdate = await upsert(buyerA, randomUUID(), ORG_A, fields("hijack"));
    expectCode(crossUpdate, "destination_not_found");
    expectCode(missingUpdate, "destination_not_found");
    expect(crossUpdate.error!.message).toBe(missingUpdate.error!.message);
    const crossRetire = await retire(buyerA, foreign);
    const missingRetire = await retire(buyerA, randomUUID());
    expectCode(crossRetire, "destination_not_found");
    expectCode(missingRetire, "destination_not_found");
    expect(crossRetire.error!.message).toBe(missingRetire.error!.message);
    expectCode(await upsert(buyerA, foreign, ORG_B, fields("hijack")), "buyer_not_authorized");
    expect(await read(buyerA, foreign)).toBeNull();
    expect(await read(buyerB, foreign)).toMatchObject({ organization_id: ORG_B, label: fields("foreign").label, retired_at: null });
  }, 120_000);

  it("edits then retires the saved destination without creating a historical order snapshot", async () => {
    const sourceBefore = await read(buyerA, first);
    expect(sourceBefore).toMatchObject({ id: first, city: "Abu Dhabi", address_line_2: "Unit 2", retired_at: null, is_default: true });
    const before = inspectF013T071State();
    // The pre-M4b helper manufactured a LEGACY order solely to test a historical snapshot.  Calling it now
    // would recreate the row-94 audit-leak shape, so this applied-state proof exercises only the real RPC lifecycle.
    expect(buyerAOrders(before).some((order) => order.delivery_destination_id === first)).toBe(false);

    const edited = await upsert(buyerA, first, ORG_A, fields("first", { city: "Sharjah", address_line_2: "Changed after snapshot", is_default: true }));
    expect(edited.error).toBeNull();
    expect(edited.data).toBe(first);
    expect(await read(buyerA, first)).toMatchObject({ city: "Sharjah", address_line_2: "Changed after snapshot", retired_at: null });
    const requestId = randomUUID();
    const retired = await retire(buyerA, first, requestId);
    expect(retired.error).toBeNull();
    const row = await read(buyerA, first);
    expect(row).toMatchObject({ id: first, retired_by: buyerAUser, is_default: false, city: "Sharjah", address_line_2: "Changed after snapshot" });
    expect(row?.retired_at).not.toBeNull();
    expect((await retire(buyerA, first, requestId)).error).toBeNull();
    expect((await retire(buyerA, first)).error).toBeNull();
    expect((await read(buyerA, first))?.retired_at).toBe(row?.retired_at);
    expect(await activeDefaults(buyerA, ORG_A)).toEqual([]);
    expectCode(await upsert(buyerA, first, ORG_A, fields("first")), "destination_not_found");
    const after = inspectF013T071State();
    expect(buyerAOrders(after)).toEqual(buyerAOrders(before));
    expect(after.destinations.filter((destination) => destination.id === first)).toHaveLength(1);
  }, 120_000);

  it("members cannot write destinations or order destination snapshots directly; anon cannot call the RPCs", async () => {
    const insert = await buyerA.from("delivery_destinations").insert({ organization_id: ORG_A, ...fields("direct") });
    expect(insert.error).not.toBeNull();
    const update = await buyerA.from("delivery_destinations").update({ city: "Direct" }).eq("id", second);
    expect(update.error).not.toBeNull();
    expect((await read(buyerA, second))?.city).toBe("Dubai");
    const cart = (await buyerA.rpc("get_or_create_cart", { p_org_id: ORG_A })) as RpcResult;
    expect(cart.error).toBeNull();
    const snapshot = await buyerA.from("orders").update({ delivery_destination_id: second, destination_snapshot: { label: "forged" } }).eq("id", String(cart.data));
    expect(snapshot.error).not.toBeNull();
    const order = inspectF013T071State().orders.find((candidate) => candidate.id === cart.data);
    expect(order).toMatchObject({ delivery_destination_id: null, destination_snapshot: null, status: "DRAFT", commerce_flow: "BANK_TRANSFER_V1" });
    const anon = await upsert(anonymous, null, ORG_A, fields("anon"));
    expect(anon.data ?? null).toBeNull();
    expect(anon.error?.code).toBe("42501");
  }, 120_000);
});

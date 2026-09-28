import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { F013_LOCAL_API_URL, F013_LOCAL_DB_URL, F013_LOCAL_PROJECT_ID } from "@/scripts/f013-local-target";
import { F013_SOURCE } from "@/scripts/f013-provenance";
import {
  F013_FIXTURES,
  createAnonymousFixtureClient,
  inspectF013T071State,
  prepareF013T071Run,
  requireF013T071LiveTarget,
  signInAsFixture,
  signInAsFixtureIndependentSession,
  type F013T071Row,
  type F013T071Run,
  type F013T071State,
} from "@/tests/auth/fixture-session";

/**
 * Feature 013 T071 (MP-6, LOCAL) — M4a cart live proof against the verified `hills-f013-local` Supabase Local stack.
 * Gated by F013_LIVE=1 AND F013_T071_LIVE=1; `requireF013T071LiveTarget()` re-verifies the nonce-bound loopback target
 * before any session or fixture child. Every call goes through real authenticated sessions and the real M4a RPCs.
 *
 * Fixtures: `--prepare-f013-fixtures` (buyers A/B, sellers S1/S2 with retained LEGACY purchase provenance, the Hills
 * seller, two warehouses, published S1/S2/Hills listings) and one `--prepare-f013-t071-run` slot per run (a fresh
 * concurrency buyer organization and synthetic LEGACY rows). Nothing is deleted; the local database is disposable.
 */
const T071 = process.env.F013_LIVE === "1" && process.env.F013_T071_LIVE === "1";

const ORG_A = F013_FIXTURES.members.buyerA.organizationId;
const ORG_B = F013_FIXTURES.members.buyerB.organizationId;
const ORG_S1 = F013_FIXTURES.members.sellerS1.organizationId;
const ORG_S2 = F013_FIXTURES.members.sellerS2.organizationId;
const HILLS = F013_FIXTURES.hillsOrganizationId;
const OFFERS = F013_FIXTURES.offers;
const LISTINGS: string[] = Object.values(OFFERS);

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
const rows = (list: F013T071Row[], key: string, value: unknown) => list.filter((row) => row[key] === value);
const one = (list: F013T071Row[], key: string, value: unknown) => {
  const found = rows(list, key, value);
  if (found.length !== 1) throw new Error(`expected exactly one row where ${key}=${String(value)}, found ${found.length}`);
  return found[0]!;
};
/** Reserved quantities on every fixture listing and custody position — the AC-001 observable. */
const reservedLedger = (state: F013T071State) => ({
  offers: Object.fromEntries(state.offers.map((row) => [String(row.id), Number(row.reserved_quantity_kg)])),
  positions: Object.fromEntries(state.positions.map((row) => [String(row.id), Number(row.reserved_quantity_kg)])),
});
const cartLine = (state: F013T071State, cartId: string, offerId: string) => rows(state.items, "order_id", cartId).find((row) => row.offer_id === offerId);
const expectCode = (result: RpcResult, code: string) => {
  expect(result.data ?? null).toBeNull();
  expect(result.error?.message ?? "", `expected ${code}`).toMatch(new RegExp(`\\b${code}\\b`));
};

describe.skipIf(!T071)("T071 — M4a cart live proof (LOCAL hills-f013-local)", () => {
  let run: F013T071Run;
  let initial: F013T071State;
  let buyerA: SupabaseClient;
  let buyerB: SupabaseClient;
  let sellerS1: SupabaseClient;
  let platformAdmin: SupabaseClient;
  let anonymous: SupabaseClient;
  let cartA: string;
  let runCart: string;

  beforeAll(async () => {
    const target = requireF013T071LiveTarget();
    expect(target.projectId).toBe(F013_LOCAL_PROJECT_ID);
    expect(target.apiUrl).toBe(F013_LOCAL_API_URL);
    expect(target.dbUrl).toBe(F013_LOCAL_DB_URL);
    run = prepareF013T071Run();
    initial = inspectF013T071State();
    buyerA = await signInAsFixture(F013_FIXTURES.members.buyerA.email);
    buyerB = await signInAsFixture(F013_FIXTURES.members.buyerB.email);
    sellerS1 = await signInAsFixture(F013_FIXTURES.members.sellerS1.email);
    platformAdmin = await signInAsFixture(F013_FIXTURES.operators.admin.email);
    anonymous = createAnonymousFixtureClient();
  }, 300_000);

  it("runs only against the verified loopback local target, with checkout disabled", () => {
    expect(initial.target).toEqual({ projectId: F013_LOCAL_PROJECT_ID, apiUrl: F013_LOCAL_API_URL });
    expect(initial.settings).toHaveLength(1);
    expect(initial.settings[0]!.bank_transfer_checkout_enabled).toBe(false);
    expect(run.organizationId).toMatch(/^13000000-0000-4000-8000-0000000017[0-9a-f]{2}$/);
  });

  it("S1/S2 listings rest on retained Hills-source purchase provenance (PAID LEGACY purchase lines, Hills sources sold out)", () => {
    for (const [offerId, source, seller] of [[OFFERS.s1w1, F013_SOURCE.items.s1w1, ORG_S1], [OFFERS.s1w2, F013_SOURCE.items.s1w2, ORG_S1], [OFFERS.s2w2, F013_SOURCE.items.s2w2, ORG_S2]] as const) {
      const offer = one(initial.offers, "id", offerId);
      expect(offer).toMatchObject({ status: "PUBLISHED", seller_type: "MEMBER_SELLER", seller_organization_id: seller, source_purchase_order_item_id: source });
      const purchaseLine = one(initial.items, "id", source);
      expect(purchaseLine).toMatchObject({ lot_id: offer.lot_id, seller_organization_id: HILLS });
      const purchase = one(initial.orders, "id", purchaseLine.order_id);
      expect(purchase).toMatchObject({ buyer_organization_id: seller, status: "PAID", commerce_flow: "LEGACY" });
    }
    expect(one(initial.offers, "id", OFFERS.hillsW1)).toMatchObject({ status: "PUBLISHED", seller_type: "HILLS", seller_organization_id: HILLS });
    for (const sourceOffer of Object.values(F013_SOURCE.hillsOffers)) expect(one(initial.offers, "id", sourceOffer).status).toBe("SOLD_OUT");
  });

  it("concurrent get_or_create_cart from two genuinely independent sessions converges on exactly one V1 DRAFT cart", async () => {
    expect(rows(initial.orders, "buyer_organization_id", run.organizationId)).toHaveLength(0);
    const first = await signInAsFixtureIndependentSession(F013_FIXTURES.members.buyerA.email);
    const second = await signInAsFixtureIndependentSession(F013_FIXTURES.members.buyerA.email);
    const calls = [first, second, first, second, first, second].map((client) => client.rpc("get_or_create_cart", { p_org_id: run.organizationId }));
    const results = (await Promise.all(calls)) as RpcResult[];
    for (const result of results) expect(result.error).toBeNull();
    const ids = new Set(results.map((result) => result.data));
    expect(ids.size).toBe(1);
    runCart = String([...ids][0]);
    const carts = inspectF013T071State().orders.filter((row) => row.buyer_organization_id === run.organizationId);
    expect(carts).toHaveLength(1);
    expect(carts[0]).toMatchObject({ id: runCart, status: "DRAFT", commerce_flow: "BANK_TRANSFER_V1" });
  }, 120_000);

  it("AC-001 + mixed cart: S1, S2 and Hills lines across two warehouses are added without reserving anything", async () => {
    const cart = (await buyerA.rpc("get_or_create_cart", { p_org_id: ORG_A })) as RpcResult;
    expect(cart.error).toBeNull();
    cartA = String(cart.data);
    const before = inspectF013T071State();
    const lines = [[OFFERS.s1w1, 2], [OFFERS.s2w2, 3], [OFFERS.hillsW1, 4]] as const;
    for (const [offerId, quantity] of lines) {
      const added = (await buyerA.rpc("add_cart_line", { p_org_id: ORG_A, p_offer_id: offerId, p_quantity_kg: quantity, p_request_id: randomUUID() })) as RpcResult;
      expect(added.error).toBeNull();
      expect(added.data).toMatchObject({ order_id: cartA });
    }
    const after = inspectF013T071State();
    for (const [offerId, quantity] of lines) {
      expect(Number(cartLine(after, cartA, offerId)?.quantity_kg)).toBe(Number(cartLine(before, cartA, offerId)?.quantity_kg ?? 0) + quantity);
    }
    const cartOffers = [OFFERS.s1w1, OFFERS.s2w2, OFFERS.hillsW1].map((offerId) => one(after.offers, "id", offerId));
    expect(new Set(cartOffers.map((offer) => offer.seller_organization_id))).toEqual(new Set([ORG_S1, ORG_S2, HILLS]));
    expect(new Set(cartOffers.map((offer) => offer.warehouse_id))).toEqual(new Set([F013_FIXTURES.warehouses.w1, F013_FIXTURES.warehouses.w2]));
    expect(one(after.orders, "id", cartA)).toMatchObject({ buyer_organization_id: ORG_A, status: "DRAFT", commerce_flow: "BANK_TRANSFER_V1" });
    expect(reservedLedger(after)).toEqual(reservedLedger(before));
    expect(after.reservations.filter((row) => row.order_id === cartA)).toHaveLength(0);
  }, 120_000);

  it("AC-001: cart update and remove (existing Feature 007 RPCs) never change reserved quantities", async () => {
    const before = inspectF013T071State();
    const s1Line = cartLine(before, cartA, OFFERS.s1w1)!;
    const s2Line = cartLine(before, cartA, OFFERS.s2w2)!;
    const updated = (await buyerA.rpc("update_order_item_quantity", { p_order_item_id: s1Line.id, p_quantity_kg: Number(s1Line.quantity_kg) + 1 })) as RpcResult;
    expect(updated.error).toBeNull();
    const afterUpdate = inspectF013T071State();
    expect(Number(cartLine(afterUpdate, cartA, OFFERS.s1w1)?.quantity_kg)).toBe(Number(s1Line.quantity_kg) + 1);
    expect(reservedLedger(afterUpdate)).toEqual(reservedLedger(before));
    const removed = (await buyerA.rpc("remove_order_item", { p_order_item_id: s2Line.id })) as RpcResult;
    expect(removed.error).toBeNull();
    const afterRemove = inspectF013T071State();
    expect(cartLine(afterRemove, cartA, OFFERS.s2w2)).toBeUndefined();
    expect(reservedLedger(afterRemove)).toEqual(reservedLedger(before));
  }, 120_000);

  it("idempotency: a replay returns the identical stored response once; incompatible reuse is request_id_conflict", async () => {
    const requestId = randomUUID();
    const before = inspectF013T071State();
    const first = (await buyerA.rpc("add_cart_line", { p_org_id: ORG_A, p_offer_id: OFFERS.hillsW1, p_quantity_kg: 1, p_request_id: requestId })) as RpcResult;
    const replay = (await buyerA.rpc("add_cart_line", { p_org_id: ORG_A, p_offer_id: OFFERS.hillsW1, p_quantity_kg: 1, p_request_id: requestId })) as RpcResult;
    expect(first.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(first.data);
    const after = inspectF013T071State();
    expect(Number(cartLine(after, cartA, OFFERS.hillsW1)?.quantity_kg)).toBe(Number(cartLine(before, cartA, OFFERS.hillsW1)?.quantity_kg ?? 0) + 1);
    const logged = rows(after.requestLog, "request_id", requestId);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ operation: "add_cart_line", target_id: ORG_A, response: first.data });

    expectCode((await buyerA.rpc("add_cart_line", { p_org_id: run.organizationId, p_offer_id: OFFERS.hillsW1, p_quantity_kg: 1, p_request_id: requestId })) as RpcResult, "request_id_conflict");
    expectCode((await buyerA.rpc("upsert_delivery_destination", { p_id: null, p_org_id: ORG_A, p_fields: { label: "conflict" }, p_request_id: requestId })) as RpcResult, "request_id_conflict");
    expectCode((await buyerB.rpc("add_cart_line", { p_org_id: ORG_B, p_offer_id: OFFERS.hillsW1, p_quantity_kg: 1, p_request_id: requestId })) as RpcResult, "request_id_conflict");
    expectCode((await buyerA.rpc("add_cart_line", { p_org_id: ORG_A, p_offer_id: OFFERS.hillsW1, p_quantity_kg: 1, p_request_id: null })) as RpcResult, "request_id_required");
  }, 120_000);

  it("two-session concurrent replay of one request id applies once, returns one stored response and commits no placeholder", async () => {
    const requestId = randomUUID();
    const before = inspectF013T071State();
    const first = await signInAsFixtureIndependentSession(F013_FIXTURES.members.buyerA.email);
    const second = await signInAsFixtureIndependentSession(F013_FIXTURES.members.buyerA.email);
    const args = { p_org_id: ORG_A, p_offer_id: OFFERS.s1w1, p_quantity_kg: 1, p_request_id: requestId };
    const results = (await Promise.all([first.rpc("add_cart_line", args), second.rpc("add_cart_line", args)])) as RpcResult[];
    for (const result of results) expect(result.error).toBeNull();
    expect(results[1]!.data).toEqual(results[0]!.data);
    const after = inspectF013T071State();
    expect(Number(cartLine(after, cartA, OFFERS.s1w1)?.quantity_kg)).toBe(Number(cartLine(before, cartA, OFFERS.s1w1)?.quantity_kg ?? 0) + 1);
    expect(rows(after.requestLog, "request_id", requestId)).toHaveLength(1);
    expect(after.requestLog.filter((row) => JSON.stringify(row.response) === "{}")).toHaveLength(0);
    expect(reservedLedger(after)).toEqual(reservedLedger(before));
  }, 120_000);

  it("multi-org carts stay isolated: the same member's explicit organization selects a different cart", async () => {
    const added = (await buyerA.rpc("add_cart_line", { p_org_id: run.organizationId, p_offer_id: OFFERS.hillsW1, p_quantity_kg: 1, p_request_id: randomUUID() })) as RpcResult;
    expect(added.error).toBeNull();
    expect(added.data).toMatchObject({ order_id: runCart });
    expect(runCart).not.toBe(cartA);
    const after = inspectF013T071State();
    expect(rows(after.items, "order_id", runCart).map((row) => row.offer_id)).toEqual([OFFERS.hillsW1]);
    expect(rows(after.orders, "buyer_organization_id", run.organizationId)).toHaveLength(1);
  }, 120_000);

  it("fails closed: foreign or nonexistent organizations, own listing, zero quantity and anon", async () => {
    const foreign = (await buyerB.rpc("add_cart_line", { p_org_id: ORG_A, p_offer_id: OFFERS.hillsW1, p_quantity_kg: 1, p_request_id: randomUUID() })) as RpcResult;
    const missing = (await buyerB.rpc("add_cart_line", { p_org_id: randomUUID(), p_offer_id: OFFERS.hillsW1, p_quantity_kg: 1, p_request_id: randomUUID() })) as RpcResult;
    expectCode(foreign, "buyer_not_authorized");
    expectCode(missing, "buyer_not_authorized");
    expect(foreign.error!.message).toBe(missing.error!.message);
    expectCode((await buyerB.rpc("get_or_create_cart", { p_org_id: ORG_A })) as RpcResult, "buyer_not_authorized");
    expectCode((await sellerS1.rpc("add_cart_line", { p_org_id: ORG_S1, p_offer_id: OFFERS.s1w1, p_quantity_kg: 1, p_request_id: randomUUID() })) as RpcResult, "cannot_buy_own_listing");
    expectCode((await buyerA.rpc("add_cart_line", { p_org_id: ORG_A, p_offer_id: OFFERS.hillsW1, p_quantity_kg: 0, p_request_id: randomUUID() })) as RpcResult, "requested_quantity_not_available");
    const anon = (await anonymous.rpc("get_or_create_cart", { p_org_id: ORG_A })) as RpcResult;
    expect(anon.data ?? null).toBeNull();
    expect(anon.error?.code).toBe("42501");
  }, 120_000);

  it("H1: a member INSERT requesting LEGACY with forged M1 fields is stored as BANK_TRANSFER_V1 with every T023 F1 field cleared", async () => {
    const buyerBUser = initial.users[F013_FIXTURES.members.buyerB.email]!;
    const orderId = randomUUID();
    const { error } = await buyerB.from("orders").insert({
      id: orderId, buyer_organization_id: ORG_B, created_by: buyerBUser, status: "DRAFT", commerce_flow: "LEGACY",
      has_manual_adjustment: true, cancelled_at: new Date().toISOString(), cancelled_by: buyerBUser, cancel_reason: "T071 forged cancellation",
    });
    expect(error).toBeNull();
    expect(one(inspectF013T071State().orders, "id", orderId)).toMatchObject({
      commerce_flow: "BANK_TRANSFER_V1", has_manual_adjustment: false, cancelled_at: null, cancelled_by: null, cancel_reason: null, status: "DRAFT",
    });
  }, 120_000);

  it("narrow service_role LEGACY fixture inserts keep LEGACY; admin_convert_legacy_draft converts a plan-free draft exactly once", async () => {
    const before = one(initial.orders, "id", run.legacy.planFree);
    expect(before).toMatchObject({ commerce_flow: "LEGACY", status: "DRAFT" });
    for (const id of [run.legacy.planned, run.legacy.confirmed]) expect(one(initial.orders, "id", id).commerce_flow).toBe("LEGACY");
    const lineBefore = one(initial.items, "id", run.legacy.planFreeLine);

    expectCode((await buyerB.rpc("admin_convert_legacy_draft", { p_order_id: run.legacy.planFree, p_request_id: randomUUID() })) as RpcResult, "forbidden");
    const requestId = randomUUID();
    const converted = (await platformAdmin.rpc("admin_convert_legacy_draft", { p_order_id: run.legacy.planFree, p_request_id: requestId })) as RpcResult;
    expect(converted.error).toBeNull();
    expect(converted.data).toEqual({ order_id: run.legacy.planFree, commerce_flow: "BANK_TRANSFER_V1" });
    const replay = (await platformAdmin.rpc("admin_convert_legacy_draft", { p_order_id: run.legacy.planFree, p_request_id: requestId })) as RpcResult;
    expect(replay.data).toEqual(converted.data);
    expectCode((await platformAdmin.rpc("admin_convert_legacy_draft", { p_order_id: run.legacy.planFree, p_request_id: randomUUID() })) as RpcResult, "legacy_draft_not_convertible");

    const after = inspectF013T071State();
    expect(one(after.orders, "id", run.legacy.planFree)).toMatchObject({ commerce_flow: "BANK_TRANSFER_V1", status: "DRAFT" });
    expect(one(after.items, "id", run.legacy.planFreeLine)).toEqual(lineBefore);
    const audit = rows(after.conversionAudit, "entity_id", run.legacy.planFree);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_user_id: after.users[F013_FIXTURES.operators.admin.email], entity_type: "orders", action: "CONVERT_LEGACY_DRAFT",
      old_data: { commerce_flow: "LEGACY", status: "DRAFT" }, new_data: { commerce_flow: "BANK_TRANSFER_V1", status: "DRAFT" }, correlation_id: requestId,
    });
  }, 120_000);

  it("refuses every ineligible conversion with the contract vocabulary", async () => {
    expectCode((await platformAdmin.rpc("admin_convert_legacy_draft", { p_order_id: run.legacy.planned, p_request_id: randomUUID() })) as RpcResult, "legacy_draft_not_convertible");
    expectCode((await platformAdmin.rpc("admin_convert_legacy_draft", { p_order_id: run.legacy.confirmed, p_request_id: randomUUID() })) as RpcResult, "legacy_draft_not_convertible");
    expectCode((await platformAdmin.rpc("admin_convert_legacy_draft", { p_order_id: cartA, p_request_id: randomUUID() })) as RpcResult, "legacy_draft_not_convertible");
    expectCode((await platformAdmin.rpc("admin_convert_legacy_draft", { p_order_id: randomUUID(), p_request_id: randomUUID() })) as RpcResult, "order_not_found");
    const after = inspectF013T071State();
    for (const id of [run.legacy.planned, run.legacy.confirmed]) expect(one(after.orders, "id", id).commerce_flow).toBe("LEGACY");
    expect(rows(after.shipments, "id", run.legacy.plannedShipment)[0]).toMatchObject({ status: "DRAFT" });
  }, 120_000);

  it("leaves checkout disabled and reserves nothing outside the retained source purchases", () => {
    const final = inspectF013T071State();
    expect(final.settings[0]!.bank_transfer_checkout_enabled).toBe(false);
    const sourceOrders = new Set<string>(Object.values(F013_SOURCE.orders));
    expect(final.reservations.filter((row) => !sourceOrders.has(String(row.order_id)))).toHaveLength(0);
    expect(final.offers.filter((row) => LISTINGS.includes(String(row.id)) && Number(row.reserved_quantity_kg) !== 0)).toHaveLength(0);
  }, 120_000);
});

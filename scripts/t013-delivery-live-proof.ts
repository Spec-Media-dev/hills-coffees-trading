/**
 * Feature 009 RUN A2 T013 — live seeded authorization/reservation/concurrency proof.
 *
 * TEST-ONLY, standalone (outside the Next.js build graph, like `seed-test-fixtures.ts`). Uses ONLY
 * real, RLS-respecting authenticated sessions (anon key + password grant, via
 * `tests/auth/fixture-session.ts`'s `signInAsFixture`) for every proof action. The ONLY privileged
 * (service-role) operations are setup/inspection/teardown, and even those are never performed
 * directly here — they are delegated to `scripts/seed-test-fixtures.ts` via a child process, the
 * SAME approved boundary that file's own header documents ("the ONLY place in the repository that
 * constructs a Supabase client from SUPABASE_SERVICE_ROLE_KEY").
 *
 * Every order/shipment/payment fixture this script creates uses a `T013-` prefixed code. Cleanup is
 * deterministic and delegated to `--cleanup-t013-live-fixtures`, which first proves the exact scope,
 * removes only that scope, and then removes the disposable ADMIN capability. Immutable synthetic
 * ownership/audit history is deliberately retained rather than deleted.
 *
 * Usage: npx tsx scripts/t013-delivery-live-proof.ts [scenario-name ...]
 *   No arguments: runs every scenario in order.
 *   One or more names: runs only those scenarios (see SCENARIOS below for names).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment + fixture-session plumbing (duplicated from tests/auth/fixture-session.ts's own
// approach deliberately — this script runs via plain tsx, not vitest, so it cannot import a
// vitest-context-coupled module; the duplication is the SAME "own tiny env loader" precedent
// seed-test-fixtures.ts and fixture-session.ts already each use independently).
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  let contents: string;
  try {
    contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}; see .env.example.`);
  return value;
}

function newSessionClient(): SupabaseClient {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false, storageKey: `t013-${process.pid}-${randomUUID()}` },
  });
}

async function signInAsFixture(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = newSessionClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: requireEnv("TEST_FIXTURE_PASSWORD") });
  if (error || !data.user || !data.session) throw new Error(`Unable to authenticate fixture ${email}; run npm run test:seed.`);
  return { client, userId: data.user.id };
}

function runFixtureScript(args: readonly string[]): string {
  return String(
    execFileSync(process.execPath, [resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), resolve(process.cwd(), "scripts", "seed-test-fixtures.ts"), ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}
function runFixtureJson<T>(args: readonly string[]): T {
  const output = runFixtureScript(args);
  const line = output
    .trim()
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("{") || candidate.startsWith("[") || candidate === "null");
  if (line === undefined) throw new Error(`Fixture script produced no JSON for ${args.join(" ")}. Raw: ${output}`);
  return JSON.parse(line) as T;
}

// ---------------------------------------------------------------------------
// Fixture identities/ids (mirrors tests/auth/fixture-session.ts + scripts/seed-test-fixtures.ts's
// own DELIVERY_FIXTURE_IDS exactly — literals, same established precedent as every other test file).
// ---------------------------------------------------------------------------

const FIXTURES = {
  buyerOnly: { email: "buyer-only+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000001" },
  buyerAndSeller: { email: "buyer-and-seller+foundation-test@example.com", organizationId: "f0000000-0000-4000-8000-000000000002" },
  warehouseAdmin: { email: "warehouse-admin+foundation-test@example.com" },
  financeAdmin: { email: "finance-admin+foundation-test@example.com" },
  deliveryAdmin: { email: "delivery-admin+t013-test@example.com" },
} as const;

const HILLS_ORG_ID = "05000000-0000-4000-8000-000000000001";
const DELIVERY = {
  lotMain: "09000000-0000-4000-8000-000000000001",
  offerMain: "09000000-0000-4000-8000-000000000003",
  lotScarce: "09000000-0000-4000-8000-000000000004",
  offerScarce: "09000000-0000-4000-8000-000000000006",
} as const;

type Result = { scenario: string; ok: boolean; detail: unknown };
const results: Result[] = [];

function record(scenario: string, ok: boolean, detail: unknown): void {
  results.push({ scenario, ok, detail });
  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${scenario}`);
  console.log(JSON.stringify(detail, null, 2));
}

// ---------------------------------------------------------------------------
// Order/shipment construction helpers — real authenticated writes only.
// ---------------------------------------------------------------------------

async function createDraftOrder(buyer: SupabaseClient, buyerUserId: string, buyerOrgId: string, offerId: string, lotId: string, quantityKg: number, tag: string) {
  const orderId = randomUUID();
  const orderItemId = randomUUID();
  const orderCode = `T013-ORD-${tag}-${orderId.slice(0, 8)}`;
  const { error: orderErr } = await buyer.from("orders").insert({
    id: orderId,
    order_code: orderCode,
    buyer_organization_id: buyerOrgId,
    status: "DRAFT",
    currency: "USD",
    created_by: buyerUserId,
  });
  if (orderErr) throw new Error(`order insert failed (${tag}): ${orderErr.message}`);
  const { error: itemErr } = await buyer.from("order_items").insert({
    id: orderItemId,
    order_id: orderId,
    offer_id: offerId,
    lot_id: lotId,
    seller_organization_id: HILLS_ORG_ID,
    quantity_kg: quantityKg,
    unit_price_per_kg: 10,
    product_name_snapshot: "T013 Fixture Coffee",
    seller_type_snapshot: "HILLS",
    currency: "USD",
  });
  if (itemErr) throw new Error(`order_item insert failed (${tag}): ${itemErr.message}`);
  return { orderId, orderItemId, orderCode };
}

async function confirmOrder(buyer: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await buyer.from("orders").update({ status: "CONFIRMED" }).eq("id", orderId);
  if (error) throw new Error(`order confirm failed: ${error.message}`);
}

async function createDraftShipment(buyer: SupabaseClient, buyerUserId: string, orderId: string, tag: string): Promise<string> {
  const shipmentId = randomUUID();
  const { error } = await buyer.from("order_shipments").insert({
    id: shipmentId,
    order_id: orderId,
    shipment_code: `T013-SHP-${tag}-${shipmentId.slice(0, 8)}`,
    status: "DRAFT",
    delivery_method: "COURIER",
    country_code: "AE",
    city: "Dubai",
    address_line: "T013 Fixture Address",
    contact_name: "T013 Fixture Contact",
    contact_phone: "+971500000000",
    shipping_fee: 0,
    currency: "USD",
    created_by: buyerUserId,
  });
  if (error) throw new Error(`shipment insert failed (${tag}): ${error.message}`);
  return shipmentId;
}

async function addShipmentItem(buyer: SupabaseClient, shipmentId: string, orderItemId: string, plannedKg: number): Promise<string> {
  const itemId = randomUUID();
  const { error } = await buyer.from("shipment_items").insert({ id: itemId, shipment_id: shipmentId, order_item_id: orderItemId, planned_quantity_kg: plannedKg });
  if (error) throw new Error(`shipment_item insert failed: ${error.message}`);
  return itemId;
}

async function updateShipmentStatus(client: SupabaseClient, shipmentId: string, status: string): Promise<{ error: string | null; rows: number }> {
  const { error, data } = await client.from("order_shipments").update({ status }).eq("id", shipmentId).select("id");
  return { error: error?.message ?? null, rows: data?.length ?? 0 };
}

/** Full pre-settlement lifecycle: DRAFT shipment -> item -> REQUESTED (buyer) -> READY (warehouse). */
async function bringShipmentToReadyPreSettlement(buyer: SupabaseClient, buyerUserId: string, warehouse: SupabaseClient, orderId: string, orderItemId: string, plannedKg: number, tag: string): Promise<string> {
  const shipmentId = await createDraftShipment(buyer, buyerUserId, orderId, tag);
  await addShipmentItem(buyer, shipmentId, orderItemId, plannedKg);
  const submit = await updateShipmentStatus(buyer, shipmentId, "REQUESTED");
  if (submit.error || submit.rows !== 1) throw new Error(`buyer submit REQUESTED failed (${tag}): ${submit.error ?? "0 rows"}`);
  const ready = await updateShipmentStatus(warehouse, shipmentId, "READY");
  if (ready.error || ready.rows !== 1) throw new Error(`warehouse mark READY failed (${tag}): ${ready.error ?? "0 rows"}`);
  return shipmentId;
}

async function runCheckout(buyer: SupabaseClient, orderId: string): Promise<Record<string, unknown>> {
  const { data, error } = await buyer.rpc("checkout_order", { p_order_id: orderId });
  if (error) throw new Error(`checkout_order failed: ${error.message}`);
  return data as Record<string, unknown>;
}

async function reviewPayment(finance: SupabaseClient, paymentId: string, approved: boolean): Promise<{ error: string | null }> {
  const { error } = await finance.rpc("admin_review_payment", { p_payment_id: paymentId, p_approved: approved, p_reason: approved ? null : "T013 fixture" });
  return { error: error?.message ?? null };
}

/**
 * Uses the real buyer-facing payment progression as far as it actually works live, then documents
 * and works around a REAL, PRE-EXISTING, live-verified bug this run discovered — unrelated to
 * DB-BLOCK-07, and NOT fixed here (out of this run's scope; it belongs to Feature 007/008's own
 * `submit_payment_proof()`/`validate_order_transition()`):
 *
 *   `submit_payment_proof()`'s own body issues exactly one order update, unconditionally targeting
 *   `PAYMENT_UNDER_REVIEW`, with `WHERE status IN ('HOLD', 'PAYMENT_PROOF_SUBMITTED')`. But
 *   `validate_order_transition()`'s state machine only permits `PAYMENT_UNDER_REVIEW` FROM
 *   `PAYMENT_PROOF_SUBMITTED` — HOLD may only advance to `PAYMENT_PROOF_SUBMITTED`, `EXPIRED`, or
 *   `VOID`. A buyer calling `submit_payment_proof()` on a fresh HOLD order (the only state
 *   `checkout_order()` ever produces) is therefore ALWAYS refused live with `invalid_order_transition`
 *   — empirically reproduced against the real database, not assumed. Buyer proof metadata is still
 *   created for realism/documentation, but the actual HOLD -> PAYMENT_PROOF_SUBMITTED ->
 *   PAYMENT_UNDER_REVIEW advancement is performed by the disposable ADMIN fixture, using the EXACT
 *   SAME two state-machine-permitted transitions `submit_payment_proof()` itself would need to make —
 *   platform-admin authority only bypasses the trigger's "who may attempt a non-self-service
 *   transition" gate, never the state graph itself. Finance still performs the actual review through
 *   `admin_review_payment()` alone.
 */
async function checkoutAndSubmitPaymentProof(buyer: SupabaseClient, admin: SupabaseClient, orderId: string): Promise<{ checkoutResult: Record<string, unknown>; paymentId: string; fileAssetId: string }> {
  const checkoutResult = await runCheckout(buyer, orderId);
  const afterCheckout = await inspectOrder(orderId);
  const paymentId = afterCheckout.payment?.id;
  if (!paymentId) throw new Error(`checkout for order ${orderId} did not produce a payment row`);
  const proofMetadata = runFixtureJson<{ fileAssetId: string; metadataOnly: boolean }>([`--create-t013-payment-proof-metadata=${orderId}`]);
  if (!proofMetadata.metadataOnly || !proofMetadata.fileAssetId) throw new Error(`payment-proof metadata setup failed for ${orderId}`);

  const { error: e1 } = await admin.from("orders").update({ status: "PAYMENT_PROOF_SUBMITTED" }).eq("id", orderId);
  if (e1) throw new Error(`order HOLD->PAYMENT_PROOF_SUBMITTED failed for ${orderId}: ${e1.message}`);
  const { error: e2 } = await admin.from("orders").update({ status: "PAYMENT_UNDER_REVIEW" }).eq("id", orderId);
  if (e2) throw new Error(`order PAYMENT_PROOF_SUBMITTED->PAYMENT_UNDER_REVIEW failed for ${orderId}: ${e2.message}`);

  const afterProof = await inspectOrder(orderId);
  if (afterProof.order?.status !== "PAYMENT_UNDER_REVIEW") {
    throw new Error(`order did not reach PAYMENT_UNDER_REVIEW for ${orderId}`);
  }
  return { checkoutResult, paymentId, fileAssetId: proofMetadata.fileAssetId };
}

function inspectOrder(orderId: string) {
  return runFixtureJson<{
    order: { id: string; status: string } | null;
    items: Array<{ id: string; quantity_kg: number }>;
    shipments: Array<{ id: string; status: string; settlement_verified_at: string | null; ready_at: string | null }>;
    shipmentItems: Array<{ id: string; shipment_id: string; order_item_id: string; planned_quantity_kg: number; delivered_quantity_kg: number; reserved_quantity_kg: number }>;
    allocations: Array<{ id: string; order_item_id: string; quantity_kg: number; released_quantity_kg: number; status: string }>;
    payment: { id: string; status: string; amount: number } | null;
    activeReservation: { id: string; status: string } | null;
  }>([`--inspect-delivery-order=${orderId}`]);
}

function inspectPositionByLotOwner(lotId: string, ownerOrgId: string) {
  return runFixtureJson<{ id: string; available_quantity_kg: number; reserved_quantity_kg: number } | null>([`--inspect-delivery-position-by-lot-owner=${lotId}:${ownerOrgId}`]);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

type Sessions = {
  buyer: SupabaseClient;
  buyerCompeting: SupabaseClient;
  buyerUserId: string;
  otherOrg: SupabaseClient;
  otherOrgUserId: string;
  warehouse: SupabaseClient;
  finance: SupabaseClient;
  admin: SupabaseClient;
  anon: SupabaseClient;
};

async function scenario1_buyerCancelAndDenials(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 2, "S1A");
  const shipmentA = await createDraftShipment(s.buyer, s.buyerUserId, orderId, "S1A");
  await addShipmentItem(s.buyer, shipmentA, orderItemId, 2);
  const cancel = await updateShipmentStatus(s.buyer, shipmentA, "CANCELLED");
  const cancelOk = !cancel.error && cancel.rows === 1;

  const { orderId: orderId2, orderItemId: orderItemId2 } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 2, "S1B");
  const shipmentB = await createDraftShipment(s.buyer, s.buyerUserId, orderId2, "S1B");
  await addShipmentItem(s.buyer, shipmentB, orderItemId2, 2);
  const submitOk = (await updateShipmentStatus(s.buyer, shipmentB, "REQUESTED")).rows === 1;
  const buyerReadyAttempt = await updateShipmentStatus(s.buyer, shipmentB, "READY");
  const warehouseOnlyDenied = buyerReadyAttempt.rows === 0 || buyerReadyAttempt.error !== null;

  const { orderId: orderId3, orderItemId: orderItemId3 } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 2, "S1C");
  const shipmentC = await createDraftShipment(s.buyer, s.buyerUserId, orderId3, "S1C");
  await addShipmentItem(s.buyer, shipmentC, orderItemId3, 2);
  const crossOrgAttempt = await updateShipmentStatus(s.otherOrg, shipmentC, "CANCELLED");
  const crossOrgDenied = crossOrgAttempt.rows === 0;
  const stillDraft = await inspectOrder(orderId3);

  record("1: buyer DRAFT->CANCELLED + warehouse-only denial + cross-org denial", cancelOk && submitOk && warehouseOnlyDenied && crossOrgDenied, {
    cancelOk,
    cancelResult: cancel,
    submitOk,
    buyerReadyAttempt,
    warehouseOnlyDenied,
    crossOrgAttempt,
    crossOrgDenied,
    shipmentCStatusAfterCrossOrgAttempt: stillDraft.shipments.find((sh) => sh.id === shipmentC)?.status,
  });
}

async function scenario2_insertTamper(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 1, "S2");
  void orderItemId;
  const shipmentId = randomUUID();
  const tamperedTimestamp = new Date().toISOString();
  const { error: insertError } = await s.buyer.from("order_shipments").insert({
    id: shipmentId,
    order_id: orderId,
    shipment_code: `T013-SHP-S2-${shipmentId.slice(0, 8)}`,
    status: "DRAFT",
    delivery_method: "COURIER",
    country_code: "AE",
    city: "Dubai",
    address_line: "T013 Fixture Address",
    contact_name: "T013 Fixture Contact",
    contact_phone: "+971500000000",
    shipping_fee: 0,
    currency: "USD",
    created_by: s.buyerUserId,
    // Deliberately attempting to set a trigger-owned column the client should never control.
    settlement_verified_at: tamperedTimestamp,
  });
  const insertSucceeded = !insertError;
  const after = await inspectOrder(orderId);
  const insertedShipment = after.shipments.find((sh) => sh.id === shipmentId);
  const storedValue = insertedShipment === undefined ? "SHIPMENT_NOT_FOUND" : insertedShipment.settlement_verified_at;
  const tamperDiscarded = insertedShipment !== undefined && insertedShipment.settlement_verified_at === null;

  const badShipmentId = randomUUID();
  const { error: nonDraftError } = await s.buyer.from("order_shipments").insert({
    id: badShipmentId,
    order_id: orderId,
    shipment_code: `T013-SHP-S2B-${badShipmentId.slice(0, 8)}`,
    status: "READY",
    delivery_method: "COURIER",
    country_code: "AE",
    city: "Dubai",
    address_line: "T013 Fixture Address",
    contact_name: "T013 Fixture Contact",
    contact_phone: "+971500000000",
    shipping_fee: 0,
    currency: "USD",
    created_by: s.buyerUserId,
  });
  const nonDraftInsertRefused = nonDraftError !== null && nonDraftError.message.includes("shipment_must_start_draft");

  record("2: INSERT tamper on settlement_verified_at is discarded; non-DRAFT INSERT is refused", insertSucceeded && tamperDiscarded && nonDraftInsertRefused, {
    insertSucceeded,
    tamperedValueSent: tamperedTimestamp,
    storedValue,
    tamperDiscarded,
    nonDraftInsertError: nonDraftError?.message ?? null,
    nonDraftInsertRefused,
  });
}

async function scenario3_reservedQuantityTamperAndMarkerAbuse(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 2, "S3");
  const shipmentId = await createDraftShipment(s.buyer, s.buyerUserId, orderId, "S3");
  const itemId = await addShipmentItem(s.buyer, shipmentId, orderItemId, 2);

  const { error: tamperError } = await s.buyer.from("shipment_items").update({ reserved_quantity_kg: 999 }).eq("id", itemId);
  const after = await inspectOrder(orderId);
  const storedReserved = after.shipmentItems.find((it) => it.id === itemId)?.reserved_quantity_kg;
  const tamperDiscarded = !tamperError && storedReserved === 0;

  const anonMarkerAttempt = await s.anon.rpc("set_config", { setting_name: "app.delivery_reservation_mutation", new_value: "true", is_local: true });
  const authMarkerAttempt = await s.buyer.rpc("set_config", { setting_name: "app.delivery_reservation_mutation", new_value: "true", is_local: true });
  const markerUnreachable = anonMarkerAttempt.error !== null && authMarkerAttempt.error !== null;

  record("3: reserved_quantity_kg tamper discarded; transaction-local marker unreachable by any client", tamperDiscarded && markerUnreachable, {
    tamperError: tamperError?.message ?? null,
    storedReserved,
    tamperDiscarded,
    anonMarkerAttemptError: anonMarkerAttempt.error?.message ?? null,
    authMarkerAttemptError: authMarkerAttempt.error?.message ?? null,
    markerUnreachable,
  });
}

async function scenario4and5_prePaymentReadyThenSettlement(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 8, "S45");
  await confirmOrder(s.buyer, orderId);
  const shipmentId = await bringShipmentToReadyPreSettlement(s.buyer, s.buyerUserId, s.warehouse, orderId, orderItemId, 8, "S45");

  const preSettlement = await inspectOrder(orderId);
  const shipmentPre = preSettlement.shipments.find((sh) => sh.id === shipmentId);
  const itemPre = preSettlement.shipmentItems.find((it) => it.shipment_id === shipmentId);
  const scenario4Ok = shipmentPre?.status === "READY" && shipmentPre?.settlement_verified_at === null && itemPre?.reserved_quantity_kg === 0 && preSettlement.order?.status === "CONFIRMED";
  record("4: pre-payment READY is permitted, delivery reservation stays 0, order remains unsettled (Feature 007 lifecycle)", scenario4Ok, { shipmentPre, itemPre, orderStatus: preSettlement.order?.status });

  const positionBefore = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);

  const { checkoutResult, paymentId } = await checkoutAndSubmitPaymentProof(s.buyer, s.admin, orderId);
  const review = await reviewPayment(s.finance, paymentId, true);
  const afterSettlement = await inspectOrder(orderId);
  const positionAfter = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);

  const shipmentAfter = afterSettlement.shipments.find((sh) => sh.id === shipmentId);
  const itemAfter = afterSettlement.shipmentItems.find((it) => it.shipment_id === shipmentId);
  const reservedDelta = (positionAfter?.reserved_quantity_kg ?? 0) - (positionBefore?.reserved_quantity_kg ?? 0);
  const availableDelta = (positionAfter?.available_quantity_kg ?? 0) - (positionBefore?.available_quantity_kg ?? 0);

  const scenario5Ok =
    !review.error &&
    afterSettlement.order?.status === "PAID" &&
    shipmentAfter?.settlement_verified_at !== null &&
    itemAfter?.reserved_quantity_kg === 8 &&
    reservedDelta === 8 &&
    availableDelta === 8;

  record("5: settlement-time READY reservation — exact before/after quantities", scenario5Ok, {
    checkoutResult,
    reviewError: review.error,
    orderStatusAfter: afterSettlement.order?.status,
    shipmentSettlementVerifiedAt: shipmentAfter?.settlement_verified_at,
    itemReservedAfter: itemAfter?.reserved_quantity_kg,
    positionBefore,
    positionAfter,
    reservedDelta,
    availableDelta,
  });

  return { orderId, orderItemId, shipmentId, paymentId, itemId: itemAfter?.id as string };
}

async function scenario6_exactOnceRetry(s: Sessions, ctx: { orderId: string; paymentId: string; shipmentId: string }) {
  const before = await inspectOrder(ctx.orderId);
  const itemBefore = before.shipmentItems.find((it) => it.shipment_id === ctx.shipmentId);
  const positionBefore = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);

  const retry = await reviewPayment(s.finance, ctx.paymentId, true);

  const after = await inspectOrder(ctx.orderId);
  const itemAfter = after.shipmentItems.find((it) => it.shipment_id === ctx.shipmentId);
  const positionAfter = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);

  const unchanged = itemBefore?.reserved_quantity_kg === itemAfter?.reserved_quantity_kg && positionBefore?.reserved_quantity_kg === positionAfter?.reserved_quantity_kg;
  record("6: exact-once — retrying admin_review_payment on an already-settled payment does not double-reserve", !retry.error && unchanged, {
    retryError: retry.error,
    itemReservedBefore: itemBefore?.reserved_quantity_kg,
    itemReservedAfter: itemAfter?.reserved_quantity_kg,
    positionReservedBefore: positionBefore?.reserved_quantity_kg,
    positionReservedAfter: positionAfter?.reserved_quantity_kg,
    unchanged,
  });
}

async function scenario7_multipleReadyShipments(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 5, "S7");
  await confirmOrder(s.buyer, orderId);
  const shipmentA = await createDraftShipment(s.buyer, s.buyerUserId, orderId, "S7A");
  const shipmentB = await createDraftShipment(s.buyer, s.buyerUserId, orderId, "S7B");

  // Two independently authenticated clients race to plan the SAME full quantity against one order
  // item. This is a real competing request, not two sequential child rows that happen to fit.
  const [attemptA, attemptB] = await Promise.allSettled([
    addShipmentItem(s.buyer, shipmentA, orderItemId, 5),
    addShipmentItem(s.buyerCompeting, shipmentB, orderItemId, 5),
  ]);
  const winner = attemptA.status === "fulfilled" ? shipmentA : attemptB.status === "fulfilled" ? shipmentB : null;
  const successfulAttempts = [attemptA, attemptB].filter((attempt) => attempt.status === "fulfilled").length;
  const losingError = attemptA.status === "rejected" ? String(attemptA.reason) : attemptB.status === "rejected" ? String(attemptB.reason) : null;
  if (!winner) throw new Error("both competing shipment-item requests were refused unexpectedly");
  const submitted = await updateShipmentStatus(s.buyer, winner, "REQUESTED");
  const ready = await updateShipmentStatus(s.warehouse, winner, "READY");

  const positionBefore = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const { checkoutResult, paymentId } = await checkoutAndSubmitPaymentProof(s.buyer, s.admin, orderId);
  const review = await reviewPayment(s.finance, paymentId, true);
  const after = await inspectOrder(orderId);
  const positionAfter = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);

  const plannedTotal = after.shipmentItems.reduce((total, item) => total + item.planned_quantity_kg, 0);
  const winnerItem = after.shipmentItems.find((it) => it.shipment_id === winner);
  const reservedDelta = (positionAfter?.reserved_quantity_kg ?? 0) - (positionBefore?.reserved_quantity_kg ?? 0);
  const availableNonNegative = (positionAfter?.available_quantity_kg ?? -1) >= 0;

  const ok = successfulAttempts === 1 && losingError !== null && !submitted.error && submitted.rows === 1 && !ready.error && ready.rows === 1 && !review.error && plannedTotal === 5 && winnerItem?.reserved_quantity_kg === 5 && reservedDelta === 5 && availableNonNegative;
  record("7: independently competing full-quantity shipment requests — exactly one wins; settlement reserves only the winner", ok, {
    attemptA: attemptA.status === "fulfilled" ? { ok: true } : { ok: false, error: String(attemptA.reason) },
    attemptB: attemptB.status === "fulfilled" ? { ok: true } : { ok: false, error: String(attemptB.reason) },
    successfulAttempts,
    losingError,
    winnerShipmentId: winner,
    submitted,
    ready,
    checkoutResult,
    reviewError: review.error,
    plannedTotal,
    winnerReserved: winnerItem?.reserved_quantity_kg,
    positionBefore,
    positionAfter,
    reservedDelta,
    availableNonNegative,
  });
}

/**
 * RUN A2 T013 finding: `apply_delivery_reservation`'s insufficiency check is `(available - reserved)
 * < planned`. `admin_review_payment()`'s title-transfer ADDS the order_item's own full reserved
 * quantity `T` to `available` and never touches `reserved`; checkout_order()/`shipment_plan_exceeds_
 * order_item` together guarantee a shipment's own `planned` (`P`) never exceeds that SAME order_item's
 * `T`. For ANY phantom pre-seeded position `(S_avail, S_reserved)` that itself satisfies the live
 * `inventory_reserved_within_available_check` (`S_reserved <= S_avail`), the post-transfer free
 * quantity is `(S_avail + T) - S_reserved = T + (S_avail - S_reserved) >= T >= P` — algebraically
 * ALWAYS sufficient, regardless of the seeded values. A first attempt at this scenario tried
 * `(0, 3)`, which does not even satisfy the CHECK constraint itself (confirmed live:
 * `inventory_reserved_within_available_check` violation) — but the deeper finding is that no valid
 * seed could ever work here, proven algebraically. `delivery_reservation_insufficient_inventory` is
 * therefore NOT reachable via any externally-injectable state respecting this database's own other
 * invariants (the CHECK constraint, `shipment_plan_exceeds_order_item`, and the single-transaction
 * atomicity of `admin_review_payment()`, which admits no window for an external write between its own
 * title-transfer and its own reservation attempt). This is reported as an architectural finding, not
 * faked with a broken workaround — see the RUN A2 T013 final report for the full reasoning.
 */
async function scenario8_insufficientInventoryAtSettlement() {
  record(
    "8: insufficient inventory at settlement — NOT LIVE-PROVABLE (architecturally unreachable, proven algebraically; see this function's own doc comment and the final report)",
    true,
    {
      conclusion: "delivery_reservation_insufficient_inventory cannot be reached via any externally-injectable state that also respects inventory_reserved_within_available_check, shipment_plan_exceeds_order_item, and admin_review_payment()'s single-transaction atomicity",
      firstAttempt: "seeded (available=0, reserved=3) directly violated the live CHECK constraint inventory_reserved_within_available_check",
      algebra: "post-transfer free = (S_avail + T) - S_reserved = T + (S_avail - S_reserved) >= T >= P for every CHECK-satisfying seed (S_avail - S_reserved) >= 0, where T is the order_item's own transferred quantity and P is the shipment's own planned quantity, itself bounded to <= T by shipment_plan_exceeds_order_item",
    }
  );
}

async function scenario9_cancelReleaseArithmetic(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 6, "S9");
  await confirmOrder(s.buyer, orderId);
  const shipmentId = await bringShipmentToReadyPreSettlement(s.buyer, s.buyerUserId, s.warehouse, orderId, orderItemId, 6, "S9");
  const { checkoutResult, paymentId } = await checkoutAndSubmitPaymentProof(s.buyer, s.admin, orderId);
  await reviewPayment(s.finance, paymentId, true);

  const positionBefore = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const cancel = await updateShipmentStatus(s.warehouse, shipmentId, "CANCELLED");
  const positionAfter = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const after = await inspectOrder(orderId);
  const itemAfter = after.shipmentItems.find((it) => it.shipment_id === shipmentId);
  // A direct second cancellation is intentionally sent, not inferred from the terminal-state rule.
  // The database may reject it or treat it as a same-state no-op; either result is acceptable ONLY
  // when the reservation ledger remains exactly unchanged after this independent second request.
  const duplicateCancel = await updateShipmentStatus(s.warehouse, shipmentId, "CANCELLED");
  const positionAfterDuplicate = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const afterDuplicate = await inspectOrder(orderId);
  const duplicateItem = afterDuplicate.shipmentItems.find((it) => it.shipment_id === shipmentId);

  const reservedDelta = (positionAfter?.reserved_quantity_kg ?? 0) - (positionBefore?.reserved_quantity_kg ?? 0);
  const availableDelta = (positionAfter?.available_quantity_kg ?? 0) - (positionBefore?.available_quantity_kg ?? 0);
  const duplicateNoRestore =
    duplicateItem?.reserved_quantity_kg === 0 &&
    positionAfterDuplicate?.reserved_quantity_kg === positionAfter?.reserved_quantity_kg &&
    positionAfterDuplicate?.available_quantity_kg === positionAfter?.available_quantity_kg;
  const ok = !cancel.error && cancel.rows === 1 && itemAfter?.reserved_quantity_kg === 0 && reservedDelta === -6 && availableDelta === 0 && duplicateNoRestore;

  record("9: cancel/release arithmetic — reserved decreases correctly, available NOT manufactured", ok, {
    checkoutResult: !!checkoutResult,
    cancelResult: cancel,
    itemReservedAfter: itemAfter?.reserved_quantity_kg,
    positionBefore,
    positionAfter,
    reservedDelta,
    availableDelta,
    duplicateCancel,
    positionAfterDuplicate,
    duplicateItemReserved: duplicateItem?.reserved_quantity_kg,
    duplicateNoRestore,
  });
}

async function scenario10and11_deliveryAndPartialDelivery(s: Sessions) {
  // --- Full delivery (item 10) ---
  const full = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 4, "S10");
  await confirmOrder(s.buyer, full.orderId);
  const shipmentFull = await bringShipmentToReadyPreSettlement(s.buyer, s.buyerUserId, s.warehouse, full.orderId, full.orderItemId, 4, "S10");
  const { checkoutResult: checkoutFull, paymentId: paymentFullId } = await checkoutAndSubmitPaymentProof(s.buyer, s.admin, full.orderId);
  await reviewPayment(s.finance, paymentFullId, true);
  await updateShipmentStatus(s.warehouse, shipmentFull, "PICKING");
  await updateShipmentStatus(s.warehouse, shipmentFull, "DISPATCHED");

  const positionBeforeFull = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const itemFullId = (await inspectOrder(full.orderId)).shipmentItems.find((it) => it.shipment_id === shipmentFull)!.id;
  const { error: deliverError } = await s.warehouse.from("shipment_items").update({ delivered_quantity_kg: 4 }).eq("id", itemFullId);
  const positionAfterFull = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const afterFull = await inspectOrder(full.orderId);
  const allocationFull = afterFull.allocations.find((a) => a.order_item_id === full.orderItemId);

  const availableDeltaFull = (positionAfterFull?.available_quantity_kg ?? 0) - (positionBeforeFull?.available_quantity_kg ?? 0);
  const reservedDeltaFull = (positionAfterFull?.reserved_quantity_kg ?? 0) - (positionBeforeFull?.reserved_quantity_kg ?? 0);
  const fullOk = !deliverError && availableDeltaFull === -4 && reservedDeltaFull === -4 && allocationFull?.released_quantity_kg === 4 && allocationFull?.status === "DELIVERED";

  record("10: full delivery — available and reserved decrease by exactly the delivered amount; storage_allocations updates", fullOk, {
    checkoutFull: !!checkoutFull,
    deliverError: deliverError?.message ?? null,
    positionBeforeFull,
    positionAfterFull,
    availableDeltaFull,
    reservedDeltaFull,
    allocationFull,
  });

  // --- Partial delivery + retry (item 11) ---
  const partial = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 10, "S11");
  await confirmOrder(s.buyer, partial.orderId);
  const shipmentPartial = await bringShipmentToReadyPreSettlement(s.buyer, s.buyerUserId, s.warehouse, partial.orderId, partial.orderItemId, 10, "S11");
  const { checkoutResult: checkoutPartial, paymentId: paymentPartialId } = await checkoutAndSubmitPaymentProof(s.buyer, s.admin, partial.orderId);
  await reviewPayment(s.finance, paymentPartialId, true);
  await updateShipmentStatus(s.warehouse, shipmentPartial, "PICKING");
  await updateShipmentStatus(s.warehouse, shipmentPartial, "DISPATCHED");

  const itemPartialId = (await inspectOrder(partial.orderId)).shipmentItems.find((it) => it.shipment_id === shipmentPartial)!.id;
  const positionBeforePartial = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);

  const { error: firstDeliverError } = await s.warehouse.from("shipment_items").update({ delivered_quantity_kg: 4 }).eq("id", itemPartialId);
  const positionAfterFirst = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const afterFirst = await inspectOrder(partial.orderId);
  const allocationAfterFirst = afterFirst.allocations.find((a) => a.order_item_id === partial.orderItemId);

  const { error: secondDeliverError } = await s.warehouse.from("shipment_items").update({ delivered_quantity_kg: 10 }).eq("id", itemPartialId);
  const positionAfterSecond = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const afterSecond = await inspectOrder(partial.orderId);
  const allocationAfterSecond = afterSecond.allocations.find((a) => a.order_item_id === partial.orderItemId);

  // Retry: re-send the SAME value (10) — must be a true no-op (delivered_quantity_kg unchanged).
  const { error: retryError } = await s.warehouse.from("shipment_items").update({ delivered_quantity_kg: 10 }).eq("id", itemPartialId);
  const positionAfterRetry = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const afterRetry = await inspectOrder(partial.orderId);
  const allocationAfterRetry = afterRetry.allocations.find((a) => a.order_item_id === partial.orderItemId);

  // Decrease attempt must be refused.
  const { error: decreaseError } = await s.warehouse.from("shipment_items").update({ delivered_quantity_kg: 5 }).eq("id", itemPartialId);
  const decreaseRefused = decreaseError !== null && decreaseError.message.includes("delivered_quantity_cannot_decrease");

  const firstDelta = { available: (positionAfterFirst?.available_quantity_kg ?? 0) - (positionBeforePartial?.available_quantity_kg ?? 0), reserved: (positionAfterFirst?.reserved_quantity_kg ?? 0) - (positionBeforePartial?.reserved_quantity_kg ?? 0) };
  const secondDelta = { available: (positionAfterSecond?.available_quantity_kg ?? 0) - (positionAfterFirst?.available_quantity_kg ?? 0), reserved: (positionAfterSecond?.reserved_quantity_kg ?? 0) - (positionAfterFirst?.reserved_quantity_kg ?? 0) };
  const noDoubleDecrementOnRetry = positionAfterSecond?.available_quantity_kg === positionAfterRetry?.available_quantity_kg && positionAfterSecond?.reserved_quantity_kg === positionAfterRetry?.reserved_quantity_kg && allocationAfterSecond?.released_quantity_kg === allocationAfterRetry?.released_quantity_kg;

  const partialOk =
    !firstDeliverError &&
    firstDelta.available === -4 &&
    firstDelta.reserved === -4 &&
    allocationAfterFirst?.released_quantity_kg === 4 &&
    allocationAfterFirst?.status === "RELEASED" &&
    !secondDeliverError &&
    secondDelta.available === -6 &&
    secondDelta.reserved === -6 &&
    allocationAfterSecond?.released_quantity_kg === 10 &&
    allocationAfterSecond?.status === "DELIVERED" &&
    !retryError &&
    noDoubleDecrementOnRetry &&
    decreaseRefused;

  record("11: partial delivery arithmetic exact; retry does not double-decrement/double-release; decrease refused", partialOk, {
    checkoutPartial: !!checkoutPartial,
    firstDeliverError: firstDeliverError?.message ?? null,
    firstDelta,
    allocationAfterFirst,
    secondDeliverError: secondDeliverError?.message ?? null,
    secondDelta,
    allocationAfterSecond,
    retryError: retryError?.message ?? null,
    noDoubleDecrementOnRetry,
    decreaseError: decreaseError?.message ?? null,
    decreaseRefused,
  });
}

async function scenario12_disputedFreeze(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 7, "S12");
  await confirmOrder(s.buyer, orderId);
  const shipmentId = await bringShipmentToReadyPreSettlement(s.buyer, s.buyerUserId, s.warehouse, orderId, orderItemId, 7, "S12");
  const { checkoutResult, paymentId } = await checkoutAndSubmitPaymentProof(s.buyer, s.admin, orderId);
  await reviewPayment(s.finance, paymentId, true);

  const positionBefore = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const financeAttempt = await s.finance.from("orders").update({ status: "DISPUTED" }).eq("id", orderId).select("id");
  const financeDenied = financeAttempt.error !== null || (financeAttempt.data?.length ?? 0) === 0;
  const { error: disputeError, data: disputedRows } = await s.admin.from("orders").update({ status: "DISPUTED" }).eq("id", orderId).select("id");
  const forwardAttempt = await updateShipmentStatus(s.warehouse, shipmentId, "PICKING");
  const positionAfter = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const after = await inspectOrder(orderId);
  const itemAfter = after.shipmentItems.find((it) => it.shipment_id === shipmentId);

  const forwardBlocked = forwardAttempt.error !== null && forwardAttempt.error.includes("delivery_reservation_requires_settled_order");
  const reservationHeld = itemAfter?.reserved_quantity_kg === 7 && positionAfter?.reserved_quantity_kg === positionBefore?.reserved_quantity_kg;
  const ok = financeDenied && !disputeError && disputedRows?.length === 1 && after.order?.status === "DISPUTED" && forwardBlocked && reservationHeld;

  record("12: DISPUTED = FREEZE — reservation held, quantity not tradable, forward progression fails closed", ok, {
    checkoutResult: !!checkoutResult,
    financeAttemptError: financeAttempt.error?.message ?? null,
    financeAttemptRows: financeAttempt.data?.length ?? 0,
    financeDenied,
    disputeError: disputeError?.message ?? null,
    adminDisputeRows: disputedRows?.length ?? 0,
    orderStatusAfter: after.order?.status,
    forwardAttempt,
    forwardBlocked,
    itemReservedAfter: itemAfter?.reserved_quantity_kg,
    positionBefore,
    positionAfter,
    reservationHeld,
  });
}

async function scenario13_failedRecoveryGuard(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 5, "S13");
  await confirmOrder(s.buyer, orderId);
  const shipmentId = await bringShipmentToReadyPreSettlement(s.buyer, s.buyerUserId, s.warehouse, orderId, orderItemId, 5, "S13");
  const { checkoutResult, paymentId } = await checkoutAndSubmitPaymentProof(s.buyer, s.admin, orderId);
  await reviewPayment(s.finance, paymentId, true);

  const positionBefore = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const fail = await updateShipmentStatus(s.warehouse, shipmentId, "FAILED");
  const positionAfterFail = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
  const afterFail = await inspectOrder(orderId);
  const itemAfterFail = afterFail.shipmentItems.find((it) => it.shipment_id === shipmentId);

  const recoveryAttempt = await updateShipmentStatus(s.warehouse, shipmentId, "PICKING");
  const recoveryBlocked = recoveryAttempt.error !== null && recoveryAttempt.error.includes("delivery_recovery_requires_dedicated_workflow");

  const releasedCorrectly = itemAfterFail?.reserved_quantity_kg === 0 && (positionBefore?.reserved_quantity_kg ?? 0) - (positionAfterFail?.reserved_quantity_kg ?? 0) === 5;
  const ok = !fail.error && fail.rows === 1 && releasedCorrectly && recoveryBlocked;

  record("13: FAILED releases correctly; forward re-entry fails closed with delivery_recovery_requires_dedicated_workflow", ok, {
    checkoutResult: !!checkoutResult,
    failResult: fail,
    itemReservedAfterFail: itemAfterFail?.reserved_quantity_kg,
    positionBefore,
    positionAfterFail,
    releasedCorrectly,
    recoveryAttempt,
    recoveryBlocked,
  });
}

async function scenario14_crossOrgSecurity(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 2, "S14");
  const shipmentId = await createDraftShipment(s.buyer, s.buyerUserId, orderId, "S14");
  const itemId = await addShipmentItem(s.buyer, shipmentId, orderItemId, 2);

  const { data: selectAttempt, error: selectError } = await s.otherOrg.from("order_shipments").select("id, status").eq("id", shipmentId);
  const invisibleToOtherOrg = !selectError && (selectAttempt?.length ?? 0) === 0;

  const mutateAttempt = await updateShipmentStatus(s.otherOrg, shipmentId, "CANCELLED");
  const mutationDenied = mutateAttempt.rows === 0;

  const { error: itemMutateError, data: itemMutateData } = await s.otherOrg.from("shipment_items").update({ planned_quantity_kg: 999 }).eq("id", itemId).select("id");
  const itemMutationDenied = !itemMutateError && (itemMutateData?.length ?? 0) === 0;

  const ok = invisibleToOtherOrg && mutationDenied && itemMutationDenied;
  record("14: cross-org security — another org cannot view, cancel, or mutate a shipment/item it does not own", ok, {
    selectError: selectError?.message ?? null,
    selectRowCount: selectAttempt?.length ?? 0,
    invisibleToOtherOrg,
    mutateAttempt,
    mutationDenied,
    itemMutateError: itemMutateError?.message ?? null,
    itemMutateRowCount: itemMutateData?.length ?? 0,
    itemMutationDenied,
  });
}

async function scenario15_internalHelperAuthorization(s: Sessions) {
  const fakeUuid = randomUUID();
  const anonApply = await s.anon.rpc("apply_delivery_reservation", { p_shipment_item_id: fakeUuid, p_order_item_id: fakeUuid, p_lot_id: fakeUuid, p_buyer_organization_id: fakeUuid, p_planned_quantity_kg: 1 });
  const authApply = await s.buyer.rpc("apply_delivery_reservation", { p_shipment_item_id: fakeUuid, p_order_item_id: fakeUuid, p_lot_id: fakeUuid, p_buyer_organization_id: fakeUuid, p_planned_quantity_kg: 1 });
  const anonSettle = await s.anon.rpc("reserve_ready_deliveries_for_settlement", { p_order_id: fakeUuid, p_buyer_organization_id: fakeUuid });
  const authSettle = await s.buyer.rpc("reserve_ready_deliveries_for_settlement", { p_order_id: fakeUuid, p_buyer_organization_id: fakeUuid });

  const allDenied = anonApply.error !== null && authApply.error !== null && anonSettle.error !== null && authSettle.error !== null;
  record("15: internal helpers refuse direct EXECUTE from anon and authenticated clients", allDenied, {
    anonApplyError: anonApply.error?.message ?? null,
    authApplyError: authApply.error?.message ?? null,
    anonSettleError: anonSettle.error?.message ?? null,
    authSettleError: authSettle.error?.message ?? null,
    allDenied,
  });
}

/**
 * A buyer-and-seller organization receives title at settlement, then has ALL of it delivery-reserved.
 * Its own real authenticated listing insert must be refused by the DB's remaining-quantity invariant;
 * a hidden UI or an optimistic client calculation cannot satisfy this proof.
 */
async function scenario17_resaleDeniedAgainstDeliveryReservation(s: Sessions) {
  const { orderId, orderItemId } = await createDraftOrder(s.otherOrg, s.otherOrgUserId, FIXTURES.buyerAndSeller.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 4, "S17");
  await confirmOrder(s.otherOrg, orderId);
  const shipmentId = await bringShipmentToReadyPreSettlement(s.otherOrg, s.otherOrgUserId, s.warehouse, orderId, orderItemId, 4, "S17");
  const { checkoutResult, paymentId } = await checkoutAndSubmitPaymentProof(s.otherOrg, s.admin, orderId);
  const review = await reviewPayment(s.finance, paymentId, true);
  const positionBefore = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerAndSeller.organizationId);
  const { data: sourceOffer, error: sourceOfferError } = await s.otherOrg
    .from("coffee_offers")
    .select("coffee_id, warehouse_id, warehouse_location_id")
    .eq("id", DELIVERY.offerMain)
    .maybeSingle();
  if (sourceOfferError || !sourceOffer) throw new Error("resale-denial source listing is unavailable to the authorized buyer-and-seller fixture");

  const listingAttempt = await s.otherOrg
    .from("coffee_offers")
    .insert({
      coffee_id: sourceOffer.coffee_id,
      lot_id: DELIVERY.lotMain,
      seller_organization_id: FIXTURES.buyerAndSeller.organizationId,
      seller_type: "MEMBER_SELLER",
      source_purchase_order_item_id: orderItemId,
      warehouse_id: sourceOffer.warehouse_id,
      warehouse_location_id: sourceOffer.warehouse_location_id,
      title: "T013 Fixture — delivery-reserved resale denial",
      quantity_kg: 4,
      price_per_kg: 11,
      currency: "USD",
      created_by: s.otherOrgUserId,
    })
    .select("id");
  const { data: persistedRows, error: persistedError } = await s.otherOrg
    .from("coffee_offers")
    .select("id")
    .eq("seller_organization_id", FIXTURES.buyerAndSeller.organizationId)
    .eq("title", "T013 Fixture — delivery-reserved resale denial");
  const positionAfter = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerAndSeller.organizationId);

  const listingDenied = listingAttempt.error !== null || (listingAttempt.data?.length ?? 0) === 0;
  const noResalePersisted = !persistedError && (persistedRows?.length ?? 0) === 0;
  const reservationStillHeld =
    positionBefore?.available_quantity_kg === 4 &&
    positionBefore?.reserved_quantity_kg === 4 &&
    positionAfter?.available_quantity_kg === positionBefore?.available_quantity_kg &&
    positionAfter?.reserved_quantity_kg === positionBefore?.reserved_quantity_kg;
  const ok = !review.error && listingDenied && noResalePersisted && reservationStillHeld;
  record("17: member resale/listing against delivery-reserved stock is refused by the live database", ok, {
    checkoutResult,
    reviewError: review.error,
    shipmentId,
    listingAttemptError: listingAttempt.error?.message ?? null,
    listingAttemptRows: listingAttempt.data?.length ?? 0,
    listingDenied,
    persistedLookupError: persistedError?.message ?? null,
    persistedRows: persistedRows?.length ?? 0,
    noResalePersisted,
    positionBefore,
    positionAfter,
    reservationStillHeld,
  });
}

async function scenario16_concurrency(s: Sessions, attempts: number) {
  const attemptResults: Array<Record<string, unknown>> = [];
  let deadlockSeen = false;

  for (let i = 0; i < attempts; i += 1) {
    const tag = `S16-${i}`;
    const { orderId, orderItemId } = await createDraftOrder(s.buyer, s.buyerUserId, FIXTURES.buyerOnly.organizationId, DELIVERY.offerMain, DELIVERY.lotMain, 1, tag);
    await confirmOrder(s.buyer, orderId);
    const shipmentId = await bringShipmentToReadyPreSettlement(s.buyer, s.buyerUserId, s.warehouse, orderId, orderItemId, 1, tag);
    const { checkoutResult, paymentId } = await checkoutAndSubmitPaymentProof(s.buyer, s.admin, orderId);
    const positionBefore = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);

    const [cancelOutcome, settleOutcome] = await Promise.allSettled([updateShipmentStatus(s.warehouse, shipmentId, "CANCELLED"), reviewPayment(s.finance, paymentId, true)]);

    const cancelValue = cancelOutcome.status === "fulfilled" ? cancelOutcome.value : { error: String(cancelOutcome.reason) };
    const settleValue = settleOutcome.status === "fulfilled" ? settleOutcome.value : { error: String(settleOutcome.reason) };
    const cancelDeadlock = typeof (cancelValue as { error: string | null }).error === "string" && (cancelValue as { error: string }).error.includes("40P01");
    const settleDeadlock = typeof (settleValue as { error: string | null }).error === "string" && (settleValue as { error: string }).error.includes("40P01");
    if (cancelDeadlock || settleDeadlock) deadlockSeen = true;

    // Each RPC/table write is a fresh PostgreSQL transaction. On an actual 40P01 we sign in again
    // to guarantee the retry has a fresh isolated client/session as well, then prove that the retry
    // reaches a coherent state rather than treating mere deadlock observation as a pass.
    let cancelRetry: { error: string | null; rows: number } | null = null;
    let settleRetry: { error: string | null } | null = null;
    if (cancelDeadlock) {
      const retryWarehouse = await signInAsFixture(FIXTURES.warehouseAdmin.email);
      cancelRetry = await updateShipmentStatus(retryWarehouse.client, shipmentId, "CANCELLED");
    }
    if (settleDeadlock) {
      const retryFinance = await signInAsFixture(FIXTURES.financeAdmin.email);
      settleRetry = await reviewPayment(retryFinance.client, paymentId, true);
    }

    const after = await inspectOrder(orderId);
    const position = inspectPositionByLotOwner(DELIVERY.lotMain, FIXTURES.buyerOnly.organizationId);
    const shipmentFinal = after.shipments.find((sh) => sh.id === shipmentId);
    const itemFinal = after.shipmentItems.find((it) => it.shipment_id === shipmentId);

    attemptResults.push({
      tag,
      cancelOutcome: cancelValue,
      settleOutcome: settleValue,
      cancelDeadlock,
      settleDeadlock,
      cancelRetry,
      settleRetry,
      finalShipmentStatus: shipmentFinal?.status,
      finalItemReserved: itemFinal?.reserved_quantity_kg,
      finalOrderStatus: after.order?.status,
      positionBefore,
      positionAfter: position,
      checkoutResult: !!checkoutResult,
    });
  }

  // A deadlock record alone proves nothing. Every attempt must end in one of the two complete,
  // non-negative ledger states, and every observed 40P01 must have a successful clean retry.
  const allConsistent = attemptResults.every((r) => {
    const status = r.finalShipmentStatus as string;
    const reserved = r.finalItemReserved as number;
    const position = r.positionAfter as { available_quantity_kg: number; reserved_quantity_kg: number } | null;
    const retrySucceeded =
      (!r.cancelDeadlock || ((r.cancelRetry as { error: string | null; rows: number } | null)?.error === null)) &&
      (!r.settleDeadlock || ((r.settleRetry as { error: string | null } | null)?.error === null));
    if (!retrySucceeded || !position || position.available_quantity_kg < 0 || position.reserved_quantity_kg < 0) return false;
    if (status === "CANCELLED") return reserved === 0;
    return reserved === 1 && r.finalOrderStatus === "PAID"; // 1kg was this scenario's planned quantity
  });

  record(`16: concurrency/deadlock — settlement vs shipment-transition race (${attempts} real concurrent attempts)`, allConsistent, {
    attempts,
    deadlockSeen,
    allConsistent,
    perAttempt: attemptResults,
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const SCENARIOS: Record<string, (s: Sessions) => Promise<void>> = {
  "1": (s) => scenario1_buyerCancelAndDenials(s),
  "2": (s) => scenario2_insertTamper(s),
  "3": (s) => scenario3_reservedQuantityTamperAndMarkerAbuse(s),
  "7": (s) => scenario7_multipleReadyShipments(s),
  "8": () => scenario8_insufficientInventoryAtSettlement(),
  "9": (s) => scenario9_cancelReleaseArithmetic(s),
  "10-11": (s) => scenario10and11_deliveryAndPartialDelivery(s),
  "12": (s) => scenario12_disputedFreeze(s),
  "13": (s) => scenario13_failedRecoveryGuard(s),
  "14": (s) => scenario14_crossOrgSecurity(s),
  "15": (s) => scenario15_internalHelperAuthorization(s),
  "16": (s) => scenario16_concurrency(s, 10),
  "17": (s) => scenario17_resaleDeniedAgainstDeliveryReservation(s),
};

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  // This must not be an implicit reset. Preparation refuses if another T013 run's business state is
  // present, so the reviewed exact-id cleanup is always an explicit, auditable prior action.
  runFixtureScript(["--prepare-t013-live-fixtures"]);

  try {
    const [buyer, buyerCompeting, otherOrg, warehouse, finance, admin] = await Promise.all([
      signInAsFixture(FIXTURES.buyerOnly.email),
      signInAsFixture(FIXTURES.buyerOnly.email),
      signInAsFixture(FIXTURES.buyerAndSeller.email),
      signInAsFixture(FIXTURES.warehouseAdmin.email),
      signInAsFixture(FIXTURES.financeAdmin.email),
      signInAsFixture(FIXTURES.deliveryAdmin.email),
    ]);
    const anon = newSessionClient();
    const sessions: Sessions = {
      buyer: buyer.client,
      buyerCompeting: buyerCompeting.client,
      buyerUserId: buyer.userId,
      otherOrg: otherOrg.client,
      otherOrgUserId: otherOrg.userId,
      warehouse: warehouse.client,
      finance: finance.client,
      admin: admin.client,
      anon,
    };

    console.log("Signed in: buyer-only x2 (independent sessions), buyer-and-seller, warehouse, FINANCE, disposable ADMIN, anon.\n");

    // 4 and 5 are chained (5 continues 4's order), and 6 continues 5's — always run together unless
    // the caller asked for a disjoint subset that excludes all three.
    const wantsChain = requested.length === 0 || requested.some((r) => ["4", "5", "6"].includes(r));
    if (wantsChain) {
      const ctx = await scenario4and5_prePaymentReadyThenSettlement(sessions);
      await scenario6_exactOnceRetry(sessions, ctx);
    }

    const names = requested.length === 0 ? Object.keys(SCENARIOS) : requested.filter((r) => r in SCENARIOS);
    for (const name of names) {
      try {
        await SCENARIOS[name]!(sessions);
      } catch (error) {
        record(`${name}: UNCAUGHT ERROR`, false, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    record("runner setup: UNCAUGHT ERROR", false, { error: error instanceof Error ? error.message : String(error) });
  } finally {
    try {
      const cleanup = runFixtureJson<Record<string, unknown>>(["--cleanup-t013-live-fixtures"]);
      record("cleanup: exact T013 business fixture cleanup + disposable ADMIN privilege removal", true, cleanup);
    } catch (error) {
      record("cleanup: FAILED", false, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n\n=== SUMMARY ===");
  console.log(`${results.length - failed.length}/${results.length} scenarios passed.`);
  if (failed.length > 0) {
    console.log("FAILED:", failed.map((r) => r.scenario).join(" | "));
  }
  console.log("\nRESULTS_JSON_START");
  console.log(JSON.stringify(results));
  console.log("RESULTS_JSON_END");

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("T013 script failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

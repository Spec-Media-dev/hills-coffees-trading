import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 009 RUN B / Phase 3 closeout (T017) — the two remaining live verify clauses for
 * `lib/delivery/warehouse.ts#recordDelivery`: a decrease is refused, and an over-plan delivery is
 * refused, each against a genuinely PAID + DISPATCHED disposable shipment.
 *
 * GATED: runs only with `T017_LIVE_PROOF=1`. It creates the T013-scoped disposable ADMIN fixture, so
 * the ordinary `npx vitest run tests/delivery` must never trigger it implicitly.
 *
 * FIXTURE BOUNDARY (the already-reviewed T013 pattern, reused — no second privileged architecture):
 * - `--prepare-t013-live-fixtures` / `--cleanup-t013-live-fixtures` (service role, inside
 *   `scripts/seed-test-fixtures.ts` only) seed/remove the delivery listings and the disposable ADMIN.
 * - Setup writes are real authenticated sessions, identical to `scripts/t013-delivery-live-proof.ts`:
 *   buyer (order, items, shipment plan, checkout), warehouse (READY/PICKING/DISPATCHED), disposable
 *   ADMIN (ONLY the two order-status transitions that require `is_platform_admin()`, because the
 *   pre-existing `submit_payment_proof()` bug blocks the buyer path), FINANCE (`admin_review_payment`).
 * - Every order/shipment code carries the `T013-ORD-`/`T013-SHP-` prefix so the reviewed exact-scope
 *   cleanup owns it, with a `T017` tag for provenance.
 * - The proof attempts themselves go ONLY through `recordDelivery`, under the real warehouse session.
 *   Service role is used only for read-only inspection snapshots.
 */
const LIVE = process.env.T017_LIVE_PROOF === "1";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

async function asWarehouse<T>(warehouse: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = warehouse;
  vi.resetModules();
  return run();
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
  if (line === undefined) throw new Error(`Fixture script produced no JSON for ${args.join(" ")}`);
  return JSON.parse(line) as T;
}

const BUYER_ORG = FOUNDATION_FIXTURES.buyerOnly.organizationId;
const HILLS_ORG_ID = "05000000-0000-4000-8000-000000000001";
const LOT_MAIN = "09000000-0000-4000-8000-000000000001";
const OFFER_MAIN = "09000000-0000-4000-8000-000000000003";

type OrderInspection = {
  order: { id: string; status: string } | null;
  shipments: Array<{ id: string; status: string; settlement_verified_at: string | null }>;
  shipmentItems: Array<{ id: string; shipment_id: string; planned_quantity_kg: number; delivered_quantity_kg: number; reserved_quantity_kg: number }>;
  allocations: Array<{ id: string; order_item_id: string; quantity_kg: number; released_quantity_kg: number; status: string }>;
  payment: { id: string; status: string } | null;
};
type Position = { id: string; available_quantity_kg: number; reserved_quantity_kg: number } | null;

const inspectOrder = (orderId: string) => runFixtureJson<OrderInspection>([`--inspect-delivery-order=${orderId}`]);
const inspectBuyerPosition = () => runFixtureJson<Position>([`--inspect-delivery-position-by-lot-owner=${LOT_MAIN}:${BUYER_ORG}`]);

type Sessions = { buyer: SupabaseClient; buyerUserId: string; warehouse: SupabaseClient; finance: SupabaseClient; admin: SupabaseClient };

/** Real authenticated setup, byte-for-byte the reviewed T013 sequence. Returns a PAID order with a DISPATCHED shipment. */
async function buildPaidDispatchedShipment(s: Sessions, plannedKg: number, tag: string) {
  const orderId = randomUUID();
  const orderItemId = randomUUID();
  const shipmentId = randomUUID();

  const { error: orderErr } = await s.buyer.from("orders").insert({ id: orderId, order_code: `T013-ORD-${tag}-${orderId.slice(0, 8)}`, buyer_organization_id: BUYER_ORG, status: "DRAFT", currency: "USD", created_by: s.buyerUserId });
  if (orderErr) throw new Error(`order insert (${tag}): ${orderErr.message}`);
  const { error: itemErr } = await s.buyer.from("order_items").insert({
    id: orderItemId,
    order_id: orderId,
    offer_id: OFFER_MAIN,
    lot_id: LOT_MAIN,
    seller_organization_id: HILLS_ORG_ID,
    quantity_kg: plannedKg,
    unit_price_per_kg: 10,
    product_name_snapshot: "T013 Fixture Coffee",
    seller_type_snapshot: "HILLS",
    currency: "USD",
  });
  if (itemErr) throw new Error(`order_item insert (${tag}): ${itemErr.message}`);
  const { error: confirmErr } = await s.buyer.from("orders").update({ status: "CONFIRMED" }).eq("id", orderId);
  if (confirmErr) throw new Error(`confirm (${tag}): ${confirmErr.message}`);

  const { error: shipErr } = await s.buyer.from("order_shipments").insert({
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
    created_by: s.buyerUserId,
  });
  if (shipErr) throw new Error(`shipment insert (${tag}): ${shipErr.message}`);
  const { error: siErr } = await s.buyer.from("shipment_items").insert({ id: randomUUID(), shipment_id: shipmentId, order_item_id: orderItemId, planned_quantity_kg: plannedKg });
  if (siErr) throw new Error(`shipment_item insert (${tag}): ${siErr.message}`);

  const step = async (client: SupabaseClient, status: string) => {
    const { error, data } = await client.from("order_shipments").update({ status }).eq("id", shipmentId).select("id");
    if (error || (data?.length ?? 0) !== 1) throw new Error(`shipment -> ${status} (${tag}): ${error?.message ?? "0 rows"}`);
  };
  await step(s.buyer, "REQUESTED");
  await step(s.warehouse, "READY");

  const { error: checkoutErr } = await s.buyer.rpc("checkout_order", { p_order_id: orderId });
  if (checkoutErr) throw new Error(`checkout (${tag}): ${checkoutErr.message}`);
  const paymentId = inspectOrder(orderId).payment?.id;
  if (!paymentId) throw new Error(`no payment row (${tag})`);
  runFixtureJson([`--create-t013-payment-proof-metadata=${orderId}`]);

  // ONLY these two transitions use the disposable ADMIN (is_platform_admin() is required by
  // orders_update_buyer_or_admin; the buyer-facing submit_payment_proof() path is a pre-existing bug).
  for (const status of ["PAYMENT_PROOF_SUBMITTED", "PAYMENT_UNDER_REVIEW"]) {
    const { error } = await s.admin.from("orders").update({ status }).eq("id", orderId);
    if (error) throw new Error(`order -> ${status} (${tag}): ${error.message}`);
  }
  const { error: reviewErr } = await s.finance.rpc("admin_review_payment", { p_payment_id: paymentId, p_approved: true, p_reason: null });
  if (reviewErr) throw new Error(`admin_review_payment (${tag}): ${reviewErr.message}`);

  await step(s.warehouse, "PICKING");
  await step(s.warehouse, "DISPATCHED");

  const snapshot = inspectOrder(orderId);
  const shipmentItem = snapshot.shipmentItems.find((row) => row.shipment_id === shipmentId)!;
  return { orderId, orderItemId, shipmentId, shipmentItemId: shipmentItem.id, snapshot };
}

function itemState(orderId: string, shipmentId: string, orderItemId: string) {
  const snap = inspectOrder(orderId);
  return {
    orderStatus: snap.order?.status,
    shipmentStatus: snap.shipments.find((row) => row.id === shipmentId)?.status,
    item: snap.shipmentItems.find((row) => row.shipment_id === shipmentId)!,
    allocation: snap.allocations.find((row) => row.order_item_id === orderItemId)!,
  };
}

describe.skipIf(!LIVE)("T017 — recordDelivery live closeout (decrease refused, over-plan refused)", () => {
  let sessions: Sessions;
  const evidence: Record<string, unknown> = {};

  beforeAll(async () => {
    const residue = runFixtureJson<{ taggedOrders: number; scopeProblems: unknown[] }>(["--inspect-t013-residue"]);
    if (residue.taggedOrders !== 0 || residue.scopeProblems.length !== 0) throw new Error(`refusing to start: T013-scoped residue present ${JSON.stringify(residue)}`);
    runFixtureScript(["--prepare-t013-live-fixtures"]);
    const [buyer, warehouse, finance, admin] = await Promise.all([
      signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email),
      signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email),
      signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email),
      signInAsFixture(FOUNDATION_FIXTURES.deliveryAdmin.email),
    ]);
    sessions = { buyer, buyerUserId: (await buyer.auth.getUser()).data.user!.id, warehouse, finance, admin };
  }, 300_000);

  afterAll(() => {
    const cleanup = runFixtureJson<Record<string, unknown>>(["--cleanup-t013-live-fixtures"]);
    console.log("T017_EVIDENCE", JSON.stringify(evidence));
    console.log("T017_CLEANUP", JSON.stringify(cleanup));
  }, 300_000);

  it("proof 1 — a decrease is refused through recordDelivery; delivered/reserved/available/allocation do not regress", async () => {
    const fx = await buildPaidDispatchedShipment(sessions, 10, "T017D");
    expect(fx.snapshot.order?.status).toBe("PAID");
    expect(fx.snapshot.shipmentItems.find((row) => row.shipment_id === fx.shipmentId)!.reserved_quantity_kg).toBe(10);

    const positionBeforeValid = inspectBuyerPosition();
    const valid = await asWarehouse(sessions.warehouse, async () => {
      const { recordDelivery } = await import("@/lib/delivery/warehouse");
      return recordDelivery({ shipmentId: fx.shipmentId, items: [{ shipmentItemId: fx.shipmentItemId, deliveredQuantityKg: 4 }] });
    });
    expect(valid).toEqual({ ok: true, data: null });

    const afterValid = itemState(fx.orderId, fx.shipmentId, fx.orderItemId);
    const positionAfterValid = inspectBuyerPosition();
    expect(afterValid.shipmentStatus).toBe("PARTIALLY_DELIVERED");
    expect(afterValid.item.delivered_quantity_kg).toBe(4);
    expect(afterValid.item.reserved_quantity_kg).toBe(6);
    expect(afterValid.allocation.released_quantity_kg).toBe(4);
    expect(afterValid.allocation.status).toBe("RELEASED");
    expect(positionAfterValid!.available_quantity_kg - positionBeforeValid!.available_quantity_kg).toBe(-4);
    expect(positionAfterValid!.reserved_quantity_kg - positionBeforeValid!.reserved_quantity_kg).toBe(-4);

    const decrease = await asWarehouse(sessions.warehouse, async () => {
      const { recordDelivery } = await import("@/lib/delivery/warehouse");
      return recordDelivery({ shipmentId: fx.shipmentId, items: [{ shipmentItemId: fx.shipmentItemId, deliveredQuantityKg: 2 }] });
    });
    expect(decrease).toEqual({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE });
    expect(JSON.stringify(decrease)).not.toMatch(/delivered_quantity|violates|P0001|constraint/i);

    const afterDecrease = itemState(fx.orderId, fx.shipmentId, fx.orderItemId);
    const positionAfterDecrease = inspectBuyerPosition();
    expect(afterDecrease).toEqual(afterValid);
    expect(positionAfterDecrease).toEqual(positionAfterValid);

    evidence.proof1 = { planned: 10, reservedAtSettlement: 10, positionBeforeValid, valid: { attempt: 4, result: valid, after: afterValid, positionAfterValid }, decrease: { attempt: 2, result: decrease, after: afterDecrease, positionAfterDecrease } };
  }, 300_000);

  it("proof 2 — an over-plan delivery is refused through recordDelivery on a clean PAID shipment; nothing drifts", async () => {
    const fx = await buildPaidDispatchedShipment(sessions, 5, "T017O");
    expect(fx.snapshot.order?.status).toBe("PAID");

    const before = itemState(fx.orderId, fx.shipmentId, fx.orderItemId);
    const positionBefore = inspectBuyerPosition();
    expect(before.shipmentStatus).toBe("DISPATCHED");
    expect(before.item.delivered_quantity_kg).toBe(0);
    expect(before.item.reserved_quantity_kg).toBe(5);
    expect(before.allocation.released_quantity_kg).toBe(0);

    const overPlan = await asWarehouse(sessions.warehouse, async () => {
      const { recordDelivery } = await import("@/lib/delivery/warehouse");
      return recordDelivery({ shipmentId: fx.shipmentId, items: [{ shipmentItemId: fx.shipmentItemId, deliveredQuantityKg: 6 }] });
    });
    expect(overPlan.ok).toBe(false);
    expect(JSON.stringify(overPlan)).not.toMatch(/delivered_quantity|ledger|violates|P0001|constraint/i);

    const after = itemState(fx.orderId, fx.shipmentId, fx.orderItemId);
    const positionAfter = inspectBuyerPosition();
    expect(after).toEqual(before);
    expect(positionAfter).toEqual(positionBefore);

    // Diagnostic only (not the proof): the exact database exception the same authenticated warehouse
    // session receives, so the report can name which authoritative guard refused the over-plan write.
    const { error: rawError } = await sessions.warehouse.from("shipment_items").update({ delivered_quantity_kg: 6 }).eq("id", fx.shipmentItemId);
    const afterDiagnostic = itemState(fx.orderId, fx.shipmentId, fx.orderItemId);
    expect(rawError).not.toBeNull();
    expect(afterDiagnostic).toEqual(before);

    evidence.proof2 = { planned: 5, before, positionBefore, overPlan: { attempt: 6, result: overPlan, after, positionAfter }, diagnosticRawException: rawError?.message ?? null };
  }, 300_000);
});

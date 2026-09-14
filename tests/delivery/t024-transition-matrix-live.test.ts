import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 009 RUN C closeout (T024) — the ONE gap `tests/delivery/transition-matrix.test.ts` reports:
 * the POSITIVE live path for the settlement-gated warehouse operations, executed through
 * `lib/delivery/warehouse.ts`'s OWN named functions (`reserve`, `startPicking`, `book`, `dispatch`) —
 * never a raw status write for the transition under test.
 *
 * GATED: runs only with `T024_LIVE_PROOF=1` (it creates the T013-scoped disposable ADMIN fixture,
 * human-authorized for exactly this purpose). Reuses the identical fixture boundary as
 * `t017-record-delivery-live.test.ts`: `--prepare-t013-live-fixtures` / `--cleanup-t013-live-fixtures`
 * (service role only inside `scripts/seed-test-fixtures.ts`), real authenticated sessions for every
 * setup and proof write. Role separation: buyer (order/plan/checkout), warehouse (READY, then the
 * operations under test), disposable ADMIN (ONLY the two `orders.status` steps that require
 * `is_platform_admin()`), FINANCE (`admin_review_payment` only).
 *
 * Two shipments cover every settlement-gated forward edge in `SHIPMENT_TRANSITIONS`:
 *   A: READY(settled) -> startPicking -> PICKING -> dispatch -> DISPATCHED
 *   B: READY(settled) -> reserve -> RESERVED -> book -> BOOKED -> dispatch -> DISPATCHED
 * Reservation happens at settlement (the READY-then-settle hook, T013 scenario 5); none of these
 * progressions may reserve again, release, or move the buyer's position — asserted before/after each.
 */
const LIVE = process.env.T024_LIVE_PROOF === "1";

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
  const line = runFixtureScript(args)
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

/** Same reviewed T013/T017 sequence, stopping at a genuinely settled READY shipment (reserved at settlement). */
async function buildSettledReadyShipment(s: Sessions, plannedKg: number, tag: string) {
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

  for (const status of ["PAYMENT_PROOF_SUBMITTED", "PAYMENT_UNDER_REVIEW"]) {
    const { error } = await s.admin.from("orders").update({ status }).eq("id", orderId);
    if (error) throw new Error(`order -> ${status} (${tag}): ${error.message}`);
  }
  const { error: reviewErr } = await s.finance.rpc("admin_review_payment", { p_payment_id: paymentId, p_approved: true, p_reason: null });
  if (reviewErr) throw new Error(`admin_review_payment (${tag}): ${reviewErr.message}`);

  return { orderId, orderItemId, shipmentId };
}

function state(orderId: string, shipmentId: string, orderItemId: string) {
  const snap = inspectOrder(orderId);
  const shipment = snap.shipments.find((row) => row.id === shipmentId)!;
  return {
    orderStatus: snap.order?.status,
    shipmentStatus: shipment.status,
    settlementVerifiedAt: shipment.settlement_verified_at,
    item: snap.shipmentItems.find((row) => row.shipment_id === shipmentId)!,
    allocation: snap.allocations.find((row) => row.order_item_id === orderItemId)!,
    position: inspectBuyerPosition(),
  };
}

/**
 * Everything that carries inventory truth must be byte-identical across a pure progression step.
 * LIVE FINDING (this run): `validate_shipment_transition` re-stamps `settlement_verified_at := now()`
 * on the FIRST progression from a settled `READY` into the gated set (READY -> PICKING / RESERVED) —
 * `v_newly_gated` is true there because READY is outside the gated set — while correctly SKIPPING a
 * second `apply_delivery_reservation` (the item is already reserved). A refreshed timestamp, never a
 * cleared one and never a second reservation; recorded in the evidence rather than hidden.
 */
function expectNoInventoryMovement(before: ReturnType<typeof state>, after: ReturnType<typeof state>) {
  expect(after.orderStatus).toBe(before.orderStatus);
  expect(before.settlementVerifiedAt).not.toBeNull();
  expect(after.settlementVerifiedAt).not.toBeNull();
  expect(after.item).toEqual(before.item);
  expect(after.allocation).toEqual(before.allocation);
  expect(after.position).toEqual(before.position);
}

describe.skipIf(!LIVE)("T024 — settlement-gated positive path through warehouse.ts itself (reserve, startPicking, book, dispatch)", () => {
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
    console.log("T024_EVIDENCE", JSON.stringify(evidence));
    console.log("T024_CLEANUP", JSON.stringify(cleanup));
  }, 300_000);

  it("shipment A: READY(settled) -> startPicking -> PICKING -> dispatch -> DISPATCHED, with no reservation/inventory movement", async () => {
    const fx = await buildSettledReadyShipment(sessions, 7, "T024A");
    const settled = state(fx.orderId, fx.shipmentId, fx.orderItemId);
    expect(settled.orderStatus).toBe("PAID");
    expect(settled.shipmentStatus).toBe("READY");
    expect(settled.settlementVerifiedAt).not.toBeNull();
    expect(settled.item.reserved_quantity_kg).toBe(7);

    const picking = await asWarehouse(sessions.warehouse, async () => (await import("@/lib/delivery/warehouse")).startPicking({ shipmentId: fx.shipmentId }));
    expect(picking).toEqual({ ok: true, data: null });
    const afterPicking = state(fx.orderId, fx.shipmentId, fx.orderItemId);
    expect(afterPicking.shipmentStatus).toBe("PICKING");
    expectNoInventoryMovement(settled, afterPicking);

    const dispatched = await asWarehouse(sessions.warehouse, async () => (await import("@/lib/delivery/warehouse")).dispatch({ shipmentId: fx.shipmentId }));
    expect(dispatched).toEqual({ ok: true, data: null });
    const afterDispatch = state(fx.orderId, fx.shipmentId, fx.orderItemId);
    expect(afterDispatch.shipmentStatus).toBe("DISPATCHED");
    expectNoInventoryMovement(afterPicking, afterDispatch);

    // Forbidden edge, same shipment: DISPATCHED -> BOOKED is not in the graph — book's own from-filter matches 0 rows.
    const bookFromDispatched = await asWarehouse(sessions.warehouse, async () => (await import("@/lib/delivery/warehouse")).book({ shipmentId: fx.shipmentId }));
    expect(bookFromDispatched.ok).toBe(false);
    expect(state(fx.orderId, fx.shipmentId, fx.orderItemId)).toEqual(afterDispatch);

    evidence.shipmentA = { settled, picking, afterPicking, dispatched, afterDispatch, bookFromDispatched };
  }, 300_000);

  it("shipment B: READY(settled) -> reserve -> RESERVED -> book -> BOOKED -> dispatch -> DISPATCHED, with no reservation/inventory movement", async () => {
    const fx = await buildSettledReadyShipment(sessions, 3, "T024B");
    const settled = state(fx.orderId, fx.shipmentId, fx.orderItemId);
    expect(settled.shipmentStatus).toBe("READY");
    expect(settled.item.reserved_quantity_kg).toBe(3);

    const reserved = await asWarehouse(sessions.warehouse, async () => (await import("@/lib/delivery/warehouse")).reserve({ shipmentId: fx.shipmentId }));
    expect(reserved).toEqual({ ok: true, data: null });
    const afterReserve = state(fx.orderId, fx.shipmentId, fx.orderItemId);
    expect(afterReserve.shipmentStatus).toBe("RESERVED");
    // Already reserved at settlement — RESERVED must not reserve a second time.
    expectNoInventoryMovement(settled, afterReserve);

    const booked = await asWarehouse(sessions.warehouse, async () => (await import("@/lib/delivery/warehouse")).book({ shipmentId: fx.shipmentId }));
    expect(booked).toEqual({ ok: true, data: null });
    const afterBook = state(fx.orderId, fx.shipmentId, fx.orderItemId);
    expect(afterBook.shipmentStatus).toBe("BOOKED");
    expectNoInventoryMovement(afterReserve, afterBook);

    const dispatched = await asWarehouse(sessions.warehouse, async () => (await import("@/lib/delivery/warehouse")).dispatch({ shipmentId: fx.shipmentId }));
    expect(dispatched).toEqual({ ok: true, data: null });
    const afterDispatch = state(fx.orderId, fx.shipmentId, fx.orderItemId);
    expect(afterDispatch.shipmentStatus).toBe("DISPATCHED");
    expectNoInventoryMovement(afterBook, afterDispatch);

    evidence.shipmentB = { settled, reserved, afterReserve, booked, afterBook, dispatched, afterDispatch };
  }, 300_000);

  it("negative, same fixtures: the buyer session is refused by the app for every settlement-gated operation, and never reaches the database", async () => {
    const fx = await buildSettledReadyShipment(sessions, 2, "T024N");
    const before = state(fx.orderId, fx.shipmentId, fx.orderItemId);
    for (const op of ["reserve", "startPicking", "book", "dispatch"] as const) {
      const result = await (async () => {
        serverClientState.client = sessions.buyer;
        vi.resetModules();
        const warehouse = await import("@/lib/delivery/warehouse");
        return warehouse[op]({ shipmentId: fx.shipmentId });
      })();
      expect(result).toEqual({ ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE });
    }
    expect(state(fx.orderId, fx.shipmentId, fx.orderItemId)).toEqual(before);
    evidence.negative = { before, refusedOps: ["reserve", "startPicking", "book", "dispatch"] };
  }, 300_000);
});

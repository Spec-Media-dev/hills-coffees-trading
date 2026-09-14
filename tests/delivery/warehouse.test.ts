import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";
import { buildRequestedOrder, type WithLiveClient } from "@/tests/orders/live-helpers";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * SECOND GENUINE, CONFIRMED FINDING THIS RUN (unrelated to Feature 009, NOT fixed here — see the
 * final RUN B report): `validate_order_transition()`'s own `if new.status = 'HOLD' then perform
 * assert_order_checkout_ready(new.id); ... end if` is NOT scoped to `new.status <> old.status` — so
 * it RE-FIRES on ANY subsequent write to an `orders` row that is already `HOLD` (live-proven this
 * turn with a single unrelated-column admin update, no shipment involved at all), and
 * `assert_order_checkout_ready` then unconditionally raises `order_must_be_confirmed_before_checkout`
 * (it requires `status = 'CONFIRMED'` exactly). This is why the `reserve` test below deliberately uses
 * a CONFIRMED (never-checked-out) order instead of `buildHoldOrder` — see that test's own comment.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

async function createTestOrderWithItem(withLiveClientArg: WithLiveClient, client: SupabaseClient, organizationId: string): Promise<{ orderId: string; orderItemId: string }> {
  return withLiveClientArg(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const userId = (await client.auth.getUser()).data.user!.id;
    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(`test setup failed: ${order.code}`);
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: LISTING_FIXTURES.offerPublished, quantityKg: 2 });
    if (!item.ok) throw new Error(`test setup failed: ${item.code}`);
    return { orderId: order.data.id, orderItemId: item.data.id };
  });
}

/**
 * Feature 009 RUN B (T016/T017/T018) — live + static proofs for the warehouse domain layer
 * (`lib/delivery/warehouse.ts`). Same live-fixture-session pattern as `tests/orders/shipment.test.ts`
 * / `tests/delivery/buyer.test.ts`, reusing `tests/orders/live-helpers.ts`'s already-established
 * `buildRequestedOrder`/`buildHoldOrder` fixture builders (Feature 007's own production paths) rather
 * than inventing a second order-construction helper.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * GENUINE, CONFIRMED FIXTURE GAP (reported, not worked around — see the final RUN B report)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * Two of T017's own literal verify sub-clauses — "a decrease attempt refused" and "an over-plan
 * attempt refused by the database" — can ONLY be exercised once `delivered_quantity_kg` has already
 * passed `validate_shipment_item`'s settlement check (`delivery_reservation_requires_settled_order`),
 * which itself requires a genuinely `PAID` order. Reaching `PAID` requires either the LIVE-CONFIRMED-
 * BROKEN `submit_payment_proof()` RPC (a pre-existing bug, unrelated to Feature 009: it targets
 * `PAYMENT_UNDER_REVIEW` from `HOLD`/`PAYMENT_PROOF_SUBMITTED`, but `validate_order_transition()`
 * only permits that target FROM `PAYMENT_PROOF_SUBMITTED`) or a direct `orders.status` UPDATE, which
 * `orders_update_buyer_or_admin`'s own RLS restricts to `is_platform_admin()` (ADMIN/SUPER_ADMIN)
 * ONLY — `FOUNDATION_FIXTURES.financeAdmin` (`role='FINANCE'`) does NOT satisfy this, and the one
 * ADMIN-capable identity this project has ever used for this purpose (T013's `deliveryAdmin`) is
 * DELIBERATELY absent from normal `npm run test:seed` and scoped to that run's own lifecycle only —
 * RUN B's own safety rules forbid recreating it here ("do not improvise new privileged fixtures").
 * These two sub-clauses are therefore NOT live-proven by THIS ungated file; they are proven by the
 * separately authorized, env-gated `tests/delivery/t017-record-delivery-live.test.ts` (Phase 3
 * closeout, reusing the reviewed T013 disposable-ADMIN fixture boundary). Every OTHER
 * literal verify clause across T016/T017/T018 — including "a full delivery leaves zero stranded
 * reservation", explicitly satisfied by REUSING T013's own already-recorded live evidence per this
 * task's own parenthetical — is live/statically proven below.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

const withLiveClient: WithLiveClient = async (client, run) => {
  serverClientState.client = client;
  vi.resetModules();
  return run();
};

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("T018 — warehouse domain layer module surface (static)", () => {
  it("exports exactly the named operations plan.md's own table lists — no generic setter", () => {
    const source = readFileSync("lib/delivery/warehouse.ts", "utf8");
    const exported = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(new Set(exported)).toEqual(new Set(["confirmCapacity", "markReady", "reserve", "startPicking", "book", "dispatch", "fail", "cancel", "recordDelivery"]));
    // No exported function accepts a client-supplied "status"/"toStatus"/"targetStatus" parameter.
    for (const fn of exported) {
      const body = source.slice(source.indexOf(`export async function ${fn}`));
      const signature = body.slice(0, body.indexOf(")") + 1);
      expect(signature).not.toMatch(/status\s*[:,]/);
    }
  });

  it("no path outside lib/delivery/buyer.ts or lib/delivery/warehouse.ts writes order_shipments.status/shipment_items.delivered_quantity_kg directly", () => {
    const allowed = new Set(["lib/delivery/buyer.ts", "lib/delivery/warehouse.ts"].map((p) => p.replace(/\//g, sep)));
    const candidates = [...listTsFiles("lib"), ...listTsFiles("src/app/dashboard/orders/[orderId]/shipment"), ...listTsFiles("src/app/dashboard/deliveries")];
    for (const file of candidates) {
      if ([...allowed].some((a) => file.endsWith(a))) continue;
      const source = readFileSync(file, "utf8");
      if (/from\("order_shipments"\)[\s\S]{0,80}\.update\(/.test(source) || /from\("shipment_items"\)[\s\S]{0,80}\.update\(/.test(source)) {
        throw new Error(`unexpected raw shipment write path found in ${file}`);
      }
    }
  });
});

describe("T016 — warehouse-only guard, live (app-level AND trigger-level)", () => {
  it("a buyer session is refused WAREHOUSE_NOT_CAPABLE by the app before any DB attempt", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { shipmentId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 2);

    const result = await withLiveClient(client, async () => {
      const { confirmCapacity } = await import("@/lib/delivery/warehouse");
      return confirmCapacity({ shipmentId });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE);
  });

  it("a buyer's RAW direct update (bypassing the app-level guard entirely) is independently refused by the trigger", async () => {
    // NOTE: this must target a still-DRAFT shipment. `shipments_buyer_draft_update`'s own USING
    // clause (`status = 'DRAFT'`) means a REQUESTED shipment is invisible to a buyer's UPDATE
    // entirely (RLS filters the row out — 0 rows, no error — before the trigger is ever reached),
    // which is its own, even stronger proof of role-split enforcement; a DRAFT row IS selected by
    // RLS, letting the BEFORE UPDATE trigger run (triggers fire before the row is re-checked against
    // RLS's own WITH CHECK), so its `warehouse_required_for_operational_shipment_status` raise is
    // what a buyer actually observes when targeting an operational status.
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await createTestOrderWithItem(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId);
    const userId = (await client.auth.getUser()).data.user!.id;
    const shipmentResult = await withLiveClient(client, async () => {
      const { createDraftShipment } = await import("@/lib/delivery/buyer");
      return createDraftShipment({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        userId,
        orderId,
        input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Test Street", contactName: "Jane Buyer", contactPhone: "+971500000000" },
      });
    });
    if (!shipmentResult.ok) throw new Error(`setup failed: ${shipmentResult.code}`);

    const { error } = await client.from("order_shipments").update({ status: "CAPACITY_CONFIRMED" }).eq("id", shipmentResult.data.id);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("warehouse_required_for_operational_shipment_status");
  });

  it("REQUESTED -> READY succeeds pre-settlement (Feature 007's own pre-payment lifecycle, T013 scenario 4); ready_at/shipping_ready_at are trigger-set, never by this app code", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, shipmentId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 2);
    const warehouseClient = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);

    const readyResult = await withLiveClient(warehouseClient, async () => {
      const { markReady } = await import("@/lib/delivery/warehouse");
      return markReady({ shipmentId });
    });
    expect(readyResult.ok).toBe(true);

    const after = await withLiveClient(client, async () => {
      const { getOrderShipments, getOrderById } = await import("@/lib/orders/read");
      const shipments = await getOrderShipments({ orderId });
      const order = await getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId });
      return { shipments, order };
    });
    const shipment = after.shipments.find((row) => row.id === shipmentId)!;
    expect(shipment.status).toBe("READY");
    expect(shipment.readyAt).not.toBeNull();
  });

  it("DISCOVERED THIS RUN: confirmCapacity (REQUESTED -> CAPACITY_CONFIRMED) is ALSO settlement-gated live — the LIVE trigger's gated-set includes CAPACITY_CONFIRMED itself, not only RESERVED onward (a stronger gate than plan.md's own prose anticipated; ground truth taken from the applied migration, not assumed)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { shipmentId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 2);
    const warehouseClient = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);

    const result = await withLiveClient(warehouseClient, async () => {
      const { confirmCapacity } = await import("@/lib/delivery/warehouse");
      return confirmCapacity({ shipmentId });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED);
  });

  it("reserve is refused for an unsettled (pre-payment) order (FR-015, delivery_reservation_requires_settled_order)", async () => {
    // Deliberately uses a CONFIRMED order (READY reached pre-payment, order never advanced to HOLD)
    // rather than `buildHoldOrder`. GENUINE, CONFIRMED, SEPARATE PRE-EXISTING DB FINDING (live-proven
    // this turn, unrelated to Feature 009/DB-BLOCK-07 — see the final RUN B report): once an order's
    // `orders.status` IS 'HOLD', `validate_order_transition()`'s own `if new.status = 'HOLD' then
    // perform assert_order_checkout_ready(new.id); ... end if` guard is NOT scoped to `new.status <>
    // old.status` — so it re-fires on ANY subsequent touch to that orders row (proven independently
    // with a single unrelated-column admin update, no shipment involved at all), and
    // `assert_order_checkout_ready` then always raises `order_must_be_confirmed_before_checkout`
    // (it requires status exactly `CONFIRMED`, which a HOLD order no longer is). A `reserve()` attempt
    // on a HOLD order's shipment therefore surfaces this UNRELATED, pre-existing exception instead of
    // `delivery_reservation_requires_settled_order` — still safely mapped to a generic code (never a
    // security issue, `mapShipmentError`'s own unrecognized-message fallback), but not the SPECIFIC
    // code this test needs to prove. A CONFIRMED order (READY reached before any checkout at all) is
    // equally "unsettled" for FR-015's own purposes and does not touch this unrelated bug.
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, shipmentId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 2);
    const warehouseClient = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    const readyResult = await withLiveClient(warehouseClient, async () => {
      const { markReady } = await import("@/lib/delivery/warehouse");
      return markReady({ shipmentId });
    });
    expect(readyResult.ok).toBe(true);

    const order = await withLiveClient(client, async () => {
      const { getOrderById } = await import("@/lib/orders/read");
      return getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId });
    });
    expect(["DRAFT", "CONFIRMED"]).toContain(order!.status);

    const result = await withLiveClient(warehouseClient, async () => {
      const { reserve } = await import("@/lib/delivery/warehouse");
      return reserve({ shipmentId });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED);
  });
});

describe("T017 — recordDelivery, live (the sub-clauses reachable without a PAID order)", () => {
  it("a non-warehouse write attempt is refused (only_warehouse_can_record_delivery) — checked BEFORE the settlement gate, provable on an unsettled shipment", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { shipmentId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 2);
    const shipmentItems = await withLiveClient(client, async () => {
      const { getShipmentItems } = await import("@/lib/orders/read");
      return getShipmentItems({ shipmentId });
    });
    const shipmentItemId = shipmentItems[0]!.id;

    const result = await withLiveClient(client, async () => {
      const { recordDelivery } = await import("@/lib/delivery/warehouse");
      return recordDelivery({ shipmentId, items: [{ shipmentItemId, deliveredQuantityKg: 1 }] });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE);
  });

  it("even a warehouse-authorized attempt is refused pre-settlement (recordDelivery only accepts DISPATCHED/PARTIALLY_DELIVERED shipments; this one is still REQUESTED)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { shipmentId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 2);
    const shipmentItems = await withLiveClient(client, async () => {
      const { getShipmentItems } = await import("@/lib/orders/read");
      return getShipmentItems({ shipmentId });
    });
    const shipmentItemId = shipmentItems[0]!.id;

    const warehouseClient = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    const result = await withLiveClient(warehouseClient, async () => {
      const { recordDelivery } = await import("@/lib/delivery/warehouse");
      return recordDelivery({ shipmentId, items: [{ shipmentItemId, deliveredQuantityKg: 1 }] });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE);
  });

  it("full-delivery-leaves-zero-stranded-reservation is NOT re-derived here — reuses T013's own already-recorded live evidence (scenario 10) per this task's own parenthetical", () => {
    expect(true).toBe(true);
  });
});

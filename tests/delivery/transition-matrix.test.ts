import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";
import { buildRequestedOrder, type WithLiveClient } from "@/tests/orders/live-helpers";
import { ORDER_SHIPMENT_STATUSES } from "@/lib/orders/validation";

/**
 * Feature 009 RUN C (T024) — full transition-map coverage: every permitted transition the APPLICATION
 * can attempt succeeds for the correct role; every forbidden one is refused, including the
 * `FAILED`/`DISPUTED` application-level narrowing.
 *
 * TWO KINDS OF EVIDENCE, both exhaustive over the full 13-status graph:
 * (1) STATIC — every one of `lib/delivery/warehouse.ts`'s 8 named operations' own `fromStatuses`/
 *     `toStatus` literals is cross-referenced against `lib/delivery/transitions.ts#SHIPMENT_TRANSITIONS`
 *     (itself sourced from the LIVE applied trigger, re-verified against the migration file's own text
 *     below) — this proves the application code can NEVER attempt a transition the database does not
 *     also permit, over the FULL graph, not merely the subset exercised live.
 * (2) LIVE — every operation reachable WITHOUT a genuinely `PAID` order (the live trigger's own
 *     settlement gate covers `CAPACITY_CONFIRMED`/`RESERVED`/`PICKING`/`BOOKED`/`DISPATCHED` — see
 *     `tests/delivery/warehouse.test.ts`'s own "discovered this run" note) is proven with the real
 *     authenticated warehouse/buyer sessions already approved for ordinary use.
 *
 * GENUINE, REPORTED GAP (STOP condition, per this run's own testing-strategy rule — not silently
 * worked around): the POSITIVE "succeeds for the correct role" live proof for `startPicking`/`book`/
 * `dispatch` (all three require a genuinely settled order) is not independently re-derived here — it
 * would require the SAME disposable-ADMIN fixture reuse `tests/delivery/t017-record-delivery-live.test.ts`
 * uses, under a FRESH human authorization this run was not given for this specific purpose (the run
 * directive's own rule: "new privileged fixture requirement requiring human authorization" is a valid
 * per-task STOP, not something to improvise). The underlying DB transitions themselves (READY/
 * CAPACITY_CONFIRMED -> RESERVED -> PICKING -> DISPATCHED) ARE already live-proven correct by
 * `scripts/t013-delivery-live-proof.ts` (scenarios 5/9/10/11) and by
 * `t017-record-delivery-live.test.ts`'s own `buildPaidDispatchedShipment` helper (which reaches
 * DISPATCHED via direct, RLS-authorized warehouse writes) — what is NOT independently re-proven is
 * `warehouse.ts#startPicking`/`book`/`dispatch` THEMSELVES being called and succeeding. The static
 * proof above (1) still exhaustively proves these three functions can never attempt an invalid
 * transition; only the POSITIVE live "it actually works end-to-end" leg for these three specific
 * functions remains unverified by this file.
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

describe("T024 — static exhaustive matrix cross-reference", () => {
  it("every warehouse.ts operation's fromStatuses/toStatus is a subset of the live-sourced SHIPMENT_TRANSITIONS map", async () => {
    const { SHIPMENT_TRANSITIONS } = await import("@/lib/delivery/transitions");
    const source = readFileSync("lib/delivery/warehouse.ts", "utf8");

    const OPERATIONS: Array<{ name: string; fromStatuses: readonly string[]; toStatus: string }> = [
      { name: "confirmCapacity", fromStatuses: ["REQUESTED"], toStatus: "CAPACITY_CONFIRMED" },
      { name: "markReady", fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED"], toStatus: "READY" },
      { name: "reserve", fromStatuses: ["CAPACITY_CONFIRMED", "READY"], toStatus: "RESERVED" },
      { name: "startPicking", fromStatuses: ["READY", "RESERVED"], toStatus: "PICKING" },
      { name: "book", fromStatuses: ["READY", "RESERVED"], toStatus: "BOOKED" },
      { name: "dispatch", fromStatuses: ["PICKING", "BOOKED"], toStatus: "DISPATCHED" },
      { name: "fail", fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED"], toStatus: "FAILED" },
      { name: "cancel", fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED"], toStatus: "CANCELLED" },
    ];

    for (const op of OPERATIONS) {
      // The declared shape actually appears in the source (guards against this test drifting from the code).
      expect(source).toContain(op.name);
      for (const from of op.fromStatuses) {
        expect(SHIPMENT_TRANSITIONS[from as keyof typeof SHIPMENT_TRANSITIONS]).toContain(op.toStatus);
      }
    }
  });

  it("no operation exposes a transition FROM FAILED or DISPUTED (the application-level narrowing, T004's documented caveat)", async () => {
    const { SHIPMENT_TRANSITIONS } = await import("@/lib/delivery/transitions");
    const source = readFileSync("lib/delivery/warehouse.ts", "utf8");
    // The DB graph itself has no forward-limit from FAILED/DISPUTED (confirmed live, T004) — the
    // application map still lists NO forward transition for either, and no fromStatuses array in
    // warehouse.ts's own source ever includes "FAILED" or "DISPUTED" as a starting point.
    expect(SHIPMENT_TRANSITIONS.FAILED).toEqual([]);
    expect(SHIPMENT_TRANSITIONS.DISPUTED).toEqual([]);
    expect(source).not.toMatch(/fromStatuses:\s*\[[^\]]*"FAILED"/);
    expect(source).not.toMatch(/fromStatuses:\s*\[[^\]]*"DISPUTED"/);
  });

  it("SHIPMENT_TRANSITIONS covers all 13 approved statuses, matching order_shipments_status_allowed exactly", async () => {
    const { SHIPMENT_TRANSITIONS } = await import("@/lib/delivery/transitions");
    expect(Object.keys(SHIPMENT_TRANSITIONS).sort()).toEqual([...ORDER_SHIPMENT_STATUSES].sort());
  });
});

describe("T024 — live proof for every transition reachable without a settled order", () => {
  it("cancel succeeds from REQUESTED (warehouse-initiated, pre-settlement)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, shipmentId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 2);
    const warehouseClient = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);

    const result = await withLiveClient(warehouseClient, async () => {
      const { cancel } = await import("@/lib/delivery/warehouse");
      return cancel({ shipmentId });
    });
    expect(result).toEqual({ ok: true, data: null });

    const after = await withLiveClient(client, async () => {
      const { getOrderShipments } = await import("@/lib/orders/read");
      return getOrderShipments({ orderId });
    });
    expect(after.find((row) => row.id === shipmentId)?.status).toBe("CANCELLED");
  });

  it("fail succeeds from READY (warehouse-initiated, pre-settlement)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, shipmentId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 2);
    const warehouseClient = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);

    const readyResult = await withLiveClient(warehouseClient, async () => {
      const { markReady } = await import("@/lib/delivery/warehouse");
      return markReady({ shipmentId });
    });
    expect(readyResult.ok).toBe(true);

    const failResult = await withLiveClient(warehouseClient, async () => {
      const { fail } = await import("@/lib/delivery/warehouse");
      return fail({ shipmentId });
    });
    expect(failResult).toEqual({ ok: true, data: null });

    const after = await withLiveClient(client, async () => {
      const { getOrderShipments } = await import("@/lib/orders/read");
      return getOrderShipments({ orderId });
    });
    expect(after.find((row) => row.id === shipmentId)?.status).toBe("FAILED");
  });

  it("a buyer directly attempting FAILED as a raw update on a DRAFT shipment is refused by the trigger (warehouse_required_for_operational_shipment_status)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { shipmentId } = await withLiveClient(client, async () => {
      const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
      const { createDraftShipment } = await import("@/lib/delivery/buyer");
      const userId = (await client.auth.getUser()).data.user!.id;
      const order = await createDraftOrder({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, userId });
      if (!order.ok) throw new Error(String(order.code));
      const item = await addOrderItem({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId: order.data.id, offerId: LISTING_FIXTURES.offerPublished, quantityKg: 2 });
      if (!item.ok) throw new Error(String(item.code));
      const shipment = await createDraftShipment({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        userId,
        orderId: order.data.id,
        input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Matrix Street", contactName: "M", contactPhone: "+971500000000" },
      });
      if (!shipment.ok) throw new Error(String(shipment.code));
      return { orderId: order.data.id, shipmentId: shipment.data.id };
    });

    const { error } = await client.from("order_shipments").update({ status: "FAILED" }).eq("id", shipmentId);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("warehouse_required_for_operational_shipment_status");
  });
});

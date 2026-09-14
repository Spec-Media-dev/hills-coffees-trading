import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 009 RUN B (T014) — live proofs for the buyer's ENTIRE write surface into fulfilment
 * (`lib/delivery/buyer.ts`), called DIRECTLY (not through the Server Action wrapper — that path is
 * already live-tested end-to-end in `tests/orders/shipment.test.ts`, which this refactor does not
 * change the behavior of). Same live-fixture-session pattern as `tests/orders/shipment.test.ts`.
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

async function createTestOrderWithItem(client: SupabaseClient, organizationId: string): Promise<{ orderId: string; orderItemId: string }> {
  return withLiveClient(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const userId = (await client.auth.getUser()).data.user!.id;
    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(`test setup failed: ${order.code}`);
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: LISTING_FIXTURES.offerPublished, quantityKg: 2 });
    if (!item.ok) throw new Error(`test setup failed: ${item.code}`);
    return { orderId: order.data.id, orderItemId: item.data.id };
  });
}

describe("T014 — lib/delivery/buyer.ts module surface (static)", () => {
  it("exposes no operational transition anywhere in its own source", () => {
    const source = readFileSync("lib/delivery/buyer.ts", "utf8");
    for (const forbidden of ["CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED", "DELIVERED", "FAILED", "DISPUTED"]) {
      expect(source).not.toContain(`"${forbidden}"`);
    }
  });

  it("attempts only DRAFT -> REQUESTED and DRAFT -> CANCELLED as status targets", () => {
    const source = readFileSync("lib/delivery/buyer.ts", "utf8");
    const statusUpdates = [...source.matchAll(/status:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(new Set(statusUpdates)).toEqual(new Set(["REQUESTED", "CANCELLED"]));
  });
});

describe("T014 — createDraftShipment / addShipmentItem (live, direct module call)", () => {
  it("creates a DRAFT shipment on the caller's own order", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await createTestOrderWithItem(client, INVENTORY_FIXTURES.orgB.organizationId);

    const result = await withLiveClient(client, async () => {
      const { createDraftShipment } = await import("@/lib/delivery/buyer");
      const userId = (await client.auth.getUser()).data.user!.id;
      return createDraftShipment({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        userId,
        orderId,
        input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Test Street", contactName: "Jane Buyer", contactPhone: "+971500000000" },
      });
    });
    expect(result.ok).toBe(true);
  });

  it("a cross-org item on a DRAFT shipment is refused (shipment_order_item_mismatch)", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId: orderBId } = await createTestOrderWithItem(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);
    const { orderId: otherOrderBId, orderItemId: otherOrderBItemId } = await createTestOrderWithItem(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);
    expect(otherOrderBId).not.toBe(orderBId);

    const shipmentResult = await withLiveClient(orgBClient, async () => {
      const { createDraftShipment } = await import("@/lib/delivery/buyer");
      const userId = (await orgBClient.auth.getUser()).data.user!.id;
      return createDraftShipment({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        userId,
        orderId: orderBId,
        input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Test Street", contactName: "Jane Buyer", contactPhone: "+971500000000" },
      });
    });
    if (!shipmentResult.ok) throw new Error(`setup failed: ${shipmentResult.code}`);

    // The item belongs to a DIFFERENT order than the shipment (both same-org, so the cross-org
    // pre-check in `addShipmentItem` cannot catch it by itself — proves the DB's OWN
    // `shipment_order_item_mismatch` check, not merely the app-level org guard).
    const result = await withLiveClient(orgBClient, async () => {
      const { addShipmentItem } = await import("@/lib/delivery/buyer");
      return addShipmentItem({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        orderId: orderBId,
        shipmentId: shipmentResult.data.id,
        input: { orderItemId: otherOrderBItemId, plannedQuantityKg: 1 },
      });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED);
  });

  it("a genuinely cross-org order id is refused with ORDER_NOT_FOUND before any write (no existence leak)", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await createTestOrderWithItem(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);

    const orgAClient = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(orgAClient, async () => {
      const { createDraftShipment } = await import("@/lib/delivery/buyer");
      const userId = (await orgAClient.auth.getUser()).data.user!.id;
      return createDraftShipment({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        userId,
        orderId,
        input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Test Street", contactName: "Jane Buyer", contactPhone: "+971500000000" },
      });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.ORDER_NOT_FOUND);
  });
});

describe("T014 — requestShipment / editing-after-REQUESTED (live)", () => {
  it("editing a REQUESTED shipment's items is refused (shipment_plan_is_closed)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, orderItemId } = await createTestOrderWithItem(client, INVENTORY_FIXTURES.orgB.organizationId);
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
    const shipmentId = shipmentResult.data.id;

    const requestResult = await withLiveClient(client, async () => {
      const { requestShipment } = await import("@/lib/delivery/buyer");
      return requestShipment({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId, shipmentId });
    });
    expect(requestResult.ok).toBe(true);

    const postRequestResult = await withLiveClient(client, async () => {
      const { addShipmentItem } = await import("@/lib/delivery/buyer");
      return addShipmentItem({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId, shipmentId, input: { orderItemId, plannedQuantityKg: 1 } });
    });
    expect(postRequestResult.ok).toBe(false);
    if (!postRequestResult.ok) expect(postRequestResult.code).toBe(ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE);
  });
});

describe("T014 — cancelDraftShipment (live, NEW — Phase 2's RLS widening)", () => {
  it("cancels an unsubmitted DRAFT plan via the now-live shipments_buyer_draft_update widening", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await createTestOrderWithItem(client, INVENTORY_FIXTURES.orgB.organizationId);
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
    const shipmentId = shipmentResult.data.id;

    const cancelResult = await withLiveClient(client, async () => {
      const { cancelDraftShipment } = await import("@/lib/delivery/buyer");
      return cancelDraftShipment({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId, shipmentId });
    });
    expect(cancelResult.ok).toBe(true);

    const after = await withLiveClient(client, async () => {
      const { getOrderShipments } = await import("@/lib/orders/read");
      return getOrderShipments({ orderId });
    });
    expect(after.find((row) => row.id === shipmentId)?.status).toBe("CANCELLED");
  });

  it("cancelling an already-REQUESTED shipment is refused (only DRAFT is a valid source)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await createTestOrderWithItem(client, INVENTORY_FIXTURES.orgB.organizationId);
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
    const shipmentId = shipmentResult.data.id;

    const requestResult = await withLiveClient(client, async () => {
      const { requestShipment } = await import("@/lib/delivery/buyer");
      return requestShipment({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId, shipmentId });
    });
    expect(requestResult.ok).toBe(true);

    const cancelResult = await withLiveClient(client, async () => {
      const { cancelDraftShipment } = await import("@/lib/delivery/buyer");
      return cancelDraftShipment({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId, shipmentId });
    });
    expect(cancelResult.ok).toBe(false);
  });

  it("another organization cannot cancel a shipment it does not own", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await createTestOrderWithItem(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);
    const orgBUserId = (await orgBClient.auth.getUser()).data.user!.id;

    const shipmentResult = await withLiveClient(orgBClient, async () => {
      const { createDraftShipment } = await import("@/lib/delivery/buyer");
      return createDraftShipment({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        userId: orgBUserId,
        orderId,
        input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Test Street", contactName: "Jane Buyer", contactPhone: "+971500000000" },
      });
    });
    if (!shipmentResult.ok) throw new Error(`setup failed: ${shipmentResult.code}`);
    const shipmentId = shipmentResult.data.id;

    const orgAClient = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(orgAClient, async () => {
      const { cancelDraftShipment } = await import("@/lib/delivery/buyer");
      return cancelDraftShipment({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, orderId, shipmentId });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.ORDER_NOT_FOUND);
  });
});

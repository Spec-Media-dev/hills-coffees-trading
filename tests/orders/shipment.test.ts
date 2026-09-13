import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN A (T007) — live proofs for the buyer-owned shipment-planning slice:
 * `order_shipments` INSERT as `DRAFT`, UPDATE to `REQUESTED`, and `shipment_items` while `DRAFT`.
 * Same live-fixture-session pattern as `drafts.test.ts`.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

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

function shipmentFormData(orderId: string): FormData {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("deliveryMethod", "Courier");
  formData.set("countryCode", "AE");
  formData.set("addressLine", "1 Test Street");
  formData.set("contactName", "Jane Buyer");
  formData.set("contactPhone", "+971500000000");
  return formData;
}

describe("T007 — createShipment (live)", () => {
  it("creates a DRAFT shipment on the caller's own order", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await createTestOrderWithItem(client, INVENTORY_FIXTURES.orgB.organizationId);

    const result = await withLiveClient(client, async () => {
      const { createShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return createShipment(undefined, shipmentFormData(orderId));
    });
    expect(result.ok).toBe(true);

    const shipments = await withLiveClient(client, async () => {
      const { getOrderShipments } = await import("@/lib/orders/read");
      return getOrderShipments({ orderId });
    });
    expect(shipments).toHaveLength(1);
    expect(shipments[0]!.status).toBe("DRAFT");
    expect(shipments[0]!.deliveryMethod).toBe("Courier");
  });

  it("a cross-org order id is refused with ORDER_NOT_FOUND before any shipment write", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await createTestOrderWithItem(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);

    const orgAClient = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(orgAClient, async () => {
      const { createShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return createShipment(undefined, shipmentFormData(orderId));
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.ORDER_NOT_FOUND);
  });
});

describe("T007 — addShipmentItem (live)", () => {
  it("plans a quantity within the ordered amount successfully", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, orderItemId } = await createTestOrderWithItem(client, INVENTORY_FIXTURES.orgB.organizationId);

    const shipmentResult = await withLiveClient(client, async () => {
      const { createShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return createShipment(undefined, shipmentFormData(orderId));
    });
    expect(shipmentResult.ok).toBe(true);

    const shipments = await withLiveClient(client, async () => {
      const { getOrderShipments } = await import("@/lib/orders/read");
      return getOrderShipments({ orderId });
    });
    const shipmentId = shipments[0]!.id;

    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("shipmentId", shipmentId);
    formData.set("orderItemId", orderItemId);
    formData.set("plannedQuantityKg", "2");

    const result = await withLiveClient(client, async () => {
      const { addShipmentItem } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return addShipmentItem(undefined, formData);
    });
    expect(result.ok).toBe(true);

    const shipmentItems = await withLiveClient(client, async () => {
      const { getShipmentItems } = await import("@/lib/orders/read");
      return getShipmentItems({ shipmentId });
    });
    expect(shipmentItems).toHaveLength(1);
    expect(shipmentItems[0]!.plannedQuantityKg).toBe(2);
  });

  it("planning MORE than the ordered quantity is refused (shipment_plan_exceeds_order_item -> SHIPMENT_ITEM_QUANTITY_INVALID)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, orderItemId } = await createTestOrderWithItem(client, INVENTORY_FIXTURES.orgB.organizationId);

    await withLiveClient(client, async () => {
      const { createShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return createShipment(undefined, shipmentFormData(orderId));
    });
    const shipments = await withLiveClient(client, async () => {
      const { getOrderShipments } = await import("@/lib/orders/read");
      return getOrderShipments({ orderId });
    });
    const shipmentId = shipments[0]!.id;

    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("shipmentId", shipmentId);
    formData.set("orderItemId", orderItemId);
    formData.set("plannedQuantityKg", "999"); // the order item is only 2 kg

    const result = await withLiveClient(client, async () => {
      const { addShipmentItem } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return addShipmentItem(undefined, formData);
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID);
  });
});

describe("T007 — requestShipment (DRAFT -> REQUESTED only, live)", () => {
  it("requests a DRAFT shipment successfully, and a second addShipmentItem attempt afterward is refused (shipment_plan_is_closed)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, orderItemId } = await createTestOrderWithItem(client, INVENTORY_FIXTURES.orgB.organizationId);

    await withLiveClient(client, async () => {
      const { createShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return createShipment(undefined, shipmentFormData(orderId));
    });
    const shipments = await withLiveClient(client, async () => {
      const { getOrderShipments } = await import("@/lib/orders/read");
      return getOrderShipments({ orderId });
    });
    const shipmentId = shipments[0]!.id;

    const requestForm = new FormData();
    requestForm.set("orderId", orderId);
    requestForm.set("shipmentId", shipmentId);
    const requestResult = await withLiveClient(client, async () => {
      const { requestShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return requestShipment(undefined, requestForm);
    });
    expect(requestResult.ok).toBe(true);

    const afterRequest = await withLiveClient(client, async () => {
      const { getOrderShipments } = await import("@/lib/orders/read");
      return getOrderShipments({ orderId });
    });
    expect(afterRequest[0]!.status).toBe("REQUESTED");

    const itemForm = new FormData();
    itemForm.set("orderId", orderId);
    itemForm.set("shipmentId", shipmentId);
    itemForm.set("orderItemId", orderItemId);
    itemForm.set("plannedQuantityKg", "1");
    const postRequestItemResult = await withLiveClient(client, async () => {
      const { addShipmentItem } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
      return addShipmentItem(undefined, itemForm);
    });
    expect(postRequestItemResult.ok).toBe(false);
    if (!postRequestItemResult.ok) expect(postRequestItemResult.code).toBe(ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE);
  });

  it("never sends/exposes any shipment status beyond DRAFT/REQUESTED (source-level proof)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/orders/[orderId]/shipment/actions.ts", "utf8");
    for (const forbidden of ["CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED", "FAILED", "DISPUTED"]) {
      expect(source).not.toContain(`"${forbidden}"`);
    }
  });
});

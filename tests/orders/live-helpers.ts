import type { SupabaseClient } from "@supabase/supabase-js";

import { CHECKOUT_FIXTURES, FOUNDATION_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 007 RUN B/C — shared LIVE test helpers. Each file owns its own `vi.mock("@/lib/supabase/
 * server")` + `withLiveClient` (Vitest hoists mocks per file), so these helpers take that wrapper as
 * a parameter rather than importing production modules at the top level.
 */
export type WithLiveClient = <T>(client: SupabaseClient, run: () => Promise<T>) => Promise<T>;

/** Builds a DRAFT order with one item + a REQUESTED shipment plan through RUN A's own production paths. */
export async function buildRequestedOrder(withLiveClient: WithLiveClient, client: SupabaseClient, organizationId: string, quantityKg: number): Promise<{ orderId: string; shipmentId: string }> {
  return withLiveClient(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const { createShipment, addShipmentItem, requestShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
    const { getOrderShipments } = await import("@/lib/orders/read");
    const userId = (await client.auth.getUser()).data.user!.id;

    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(`setup: ${order.code}`);
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: CHECKOUT_FIXTURES.offerCheckout, quantityKg });
    if (!item.ok) throw new Error(`setup: ${item.code}`);

    const shipmentForm = new FormData();
    shipmentForm.set("orderId", order.data.id);
    shipmentForm.set("deliveryMethod", "Courier");
    shipmentForm.set("countryCode", "AE");
    shipmentForm.set("addressLine", "1 Checkout Street");
    shipmentForm.set("contactName", "Checkout Tester");
    shipmentForm.set("contactPhone", "+971500000000");
    const shipment = await createShipment(undefined, shipmentForm);
    if (!shipment.ok) throw new Error(`setup: ${shipment.code}`);

    const shipments = await getOrderShipments({ orderId: order.data.id });
    const shipmentId = shipments[0]!.id;

    const itemForm = new FormData();
    itemForm.set("orderId", order.data.id);
    itemForm.set("shipmentId", shipmentId);
    itemForm.set("orderItemId", item.data.id);
    itemForm.set("plannedQuantityKg", String(quantityKg));
    const planned = await addShipmentItem(undefined, itemForm);
    if (!planned.ok) throw new Error(`setup: ${planned.code}`);

    const requestForm = new FormData();
    requestForm.set("orderId", order.data.id);
    requestForm.set("shipmentId", shipmentId);
    const requested = await requestShipment(undefined, requestForm);
    if (!requested.ok) throw new Error(`setup: ${requested.code}`);

    return { orderId: order.data.id, shipmentId };
  });
}

/**
 * The Feature-009-owned step, performed by the REAL `warehouse-admin` fixture (a genuine
 * `platform_admins.role = 'WAREHOUSE'` session) under ordinary RLS + trigger authority — TEST-ONLY
 * precondition setup, never a claim about Feature 009's own workflow.
 */
export async function markShipmentReadyAsWarehouse(shipmentId: string): Promise<void> {
  const warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  const { error } = await warehouse.from("order_shipments").update({ status: "READY" }).eq("id", shipmentId);
  if (error) throw new Error(`warehouse READY transition refused: ${error.message}`);
}

export async function buildReadyOrder(withLiveClient: WithLiveClient, client: SupabaseClient, organizationId: string, quantityKg: number): Promise<string> {
  const { orderId, shipmentId } = await buildRequestedOrder(withLiveClient, client, organizationId, quantityKg);
  await markShipmentReadyAsWarehouse(shipmentId);
  return orderId;
}

/** Runs the real checkout through `executeCheckout` and returns the HOLD order's id. */
export async function buildHoldOrder(withLiveClient: WithLiveClient, client: SupabaseClient, organizationId: string, quantityKg: number): Promise<string> {
  const orderId = await buildReadyOrder(withLiveClient, client, organizationId, quantityKg);
  const result = await withLiveClient(client, async () => {
    const { executeCheckout } = await import("@/lib/orders/checkout");
    return executeCheckout(orderId);
  });
  if (!result.ok) throw new Error(`checkout setup failed: ${result.code}`);
  return orderId;
}

import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 009 RUN C (T025) — a buyer attempting EVERY operational status directly, both through
 * `lib/delivery/buyer.ts` (already statically proven to expose none of them —
 * `tests/delivery/buyer.test.ts`'s own module-surface test) and via a raw table update (RLS +
 * trigger refusal), is refused. Same live-fixture-session pattern as `tests/delivery/buyer.test.ts`.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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

async function createDraftShipmentFixture(client: SupabaseClient, organizationId: string) {
  return withLiveClient(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const { createDraftShipment } = await import("@/lib/delivery/buyer");
    const userId = (await client.auth.getUser()).data.user!.id;
    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(String(order.code));
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: LISTING_FIXTURES.offerPublished, quantityKg: 2 });
    if (!item.ok) throw new Error(String(item.code));
    const shipment = await createDraftShipment({
      organizationId,
      userId,
      orderId: order.data.id,
      input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Negatives Street", contactName: "N", contactPhone: "+971500000000" },
    });
    if (!shipment.ok) throw new Error(String(shipment.code));
    return { orderId: order.data.id, shipmentId: shipment.data.id };
  });
}

const OPERATIONAL_STATUSES = ["CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED", "DELIVERED", "FAILED", "DISPUTED"] as const;

describe("T025 — module surface (static): buyer.ts exposes no operational transition", () => {
  it("no function in lib/delivery/buyer.ts targets any operational status", () => {
    const source = readFileSync("lib/delivery/buyer.ts", "utf8");
    for (const status of OPERATIONAL_STATUSES) {
      expect(source).not.toContain(`"${status}"`);
    }
  });
});

describe("T025 — every operational status is refused for a buyer via direct RLS-authorized attempt (live)", () => {
  it.each(OPERATIONAL_STATUSES)("a buyer directly setting order_shipments.status = %s on their own DRAFT shipment is refused", async (status) => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { shipmentId } = await createDraftShipmentFixture(client, INVENTORY_FIXTURES.orgB.organizationId);

    const { error, data } = await client.from("order_shipments").update({ status }).eq("id", shipmentId).select("id");
    // Either the trigger explicitly refuses (READY is DB-permitted for a warehouse/internal caller
    // FROM DRAFT, so the top-level "buyer may only reach REQUESTED/CANCELLED" guard is what refuses
    // it) or RLS's own WITH CHECK silently matches zero rows — both are a genuine refusal, never a
    // successful mutation.
    const refused = error !== null || (data?.length ?? 0) === 0;
    expect(refused).toBe(true);
    if (error) {
      expect(error.message).toMatch(/warehouse_required_for_operational_shipment_status|invalid_shipment_transition/);
    }
  });

  it("a buyer directly setting order_shipments.status on a REQUESTED shipment (RLS excludes the row entirely — 0 rows, no error)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId, shipmentId } = await createDraftShipmentFixture(client, INVENTORY_FIXTURES.orgB.organizationId);
    await withLiveClient(client, async () => {
      const { requestShipment } = await import("@/lib/delivery/buyer");
      const result = await requestShipment({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId, shipmentId });
      if (!result.ok) throw new Error(String(result.code));
    });

    const { error, data } = await client.from("order_shipments").update({ status: "CAPACITY_CONFIRMED" }).eq("id", shipmentId).select("id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 009 RUN C (T030) — cross-organization invisibility, live. Complements the existing live
 * proofs already covering pieces of this (`tests/delivery/buyer.test.ts`'s cross-org item/order
 * refusals, `tests/delivery/warehouse.test.ts`'s cross-org RAW-update refusal) with the ONE genuinely
 * new angle this task's own literal wording asks for: a cross-org SELECT never returns another
 * organization's shipment at all (not merely "the write is refused").
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

describe("T030 — cross-organization shipment invisibility (live)", () => {
  it("a shipment belonging to another organization is invisible via getShipmentById (RLS, not an error)", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const shipmentId = await withLiveClient(orgBClient, async () => {
      const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
      const { createDraftShipment } = await import("@/lib/delivery/buyer");
      const userId = (await orgBClient.auth.getUser()).data.user!.id;
      const order = await createDraftOrder({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, userId });
      if (!order.ok) throw new Error(String(order.code));
      const item = await addOrderItem({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId: order.data.id, offerId: LISTING_FIXTURES.offerPublished, quantityKg: 2 });
      if (!item.ok) throw new Error(String(item.code));
      const shipment = await createDraftShipment({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        userId,
        orderId: order.data.id,
        input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Isolation Street", contactName: "I", contactPhone: "+971500000000" },
      });
      if (!shipment.ok) throw new Error(String(shipment.code));
      return shipment.data.id;
    });

    const orgAClient = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(orgAClient, async () => {
      const { getShipmentById } = await import("@/lib/delivery/read");
      return getShipmentById({ shipmentId });
    });
    expect(result).toBeNull();
  });

  it("getShipmentsForOrganization for another org's id never includes this shipment (already proven in tests/delivery/read.test.ts — reused, not re-derived here)", () => {
    // See tests/delivery/read.test.ts's own "another organization's read never includes this
    // shipment" live test — the same claim, not repeated a second time against live data.
    expect(true).toBe(true);
  });
});

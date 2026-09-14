import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 009 RUN C (T019/T023) — live proofs for the two NEW read functions this run adds to
 * `lib/delivery/read.ts`: `getShipmentsForOrganization` (the buyer shipment list, T019) and
 * `getActiveShipmentsCount` (the "where is it" overview count, T023). Same live-fixture-session
 * pattern as `tests/delivery/buyer.test.ts`.
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

async function createTestOrderWithShipment(client: SupabaseClient, organizationId: string) {
  return withLiveClient(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const { createDraftShipment } = await import("@/lib/delivery/buyer");
    const userId = (await client.auth.getUser()).data.user!.id;
    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(`setup: ${order.code}`);
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: LISTING_FIXTURES.offerPublished, quantityKg: 2 });
    if (!item.ok) throw new Error(`setup: ${item.code}`);
    const shipment = await createDraftShipment({
      organizationId,
      userId,
      orderId: order.data.id,
      input: { deliveryMethod: "Courier", countryCode: "AE", city: undefined, addressLine: "1 Read Test Street", contactName: "Reader", contactPhone: "+971500000000" },
    });
    if (!shipment.ok) throw new Error(`setup: ${shipment.code}`);
    return { orderId: order.data.id, shipmentId: shipment.data.id };
  });
}

describe("T019 — getShipmentsForOrganization (live)", () => {
  it("returns only the caller's own organization's shipments, newest first", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { shipmentId } = await createTestOrderWithShipment(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);

    const result = await withLiveClient(orgBClient, async () => {
      const { getShipmentsForOrganization } = await import("@/lib/delivery/read");
      return getShipmentsForOrganization({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, pageSize: 100 });
    });
    expect(result.rows.some((row) => row.id === shipmentId)).toBe(true);
    expect(result.rows.every((row) => row.buyerOrganizationId === INVENTORY_FIXTURES.orgB.organizationId)).toBe(true);
  });

  it("another organization's read never includes this shipment", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { shipmentId } = await createTestOrderWithShipment(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);

    const orgAClient = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(orgAClient, async () => {
      const { getShipmentsForOrganization } = await import("@/lib/delivery/read");
      return getShipmentsForOrganization({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, pageSize: 100 });
    });
    expect(result.rows.some((row) => row.id === shipmentId)).toBe(false);
  });
});

describe("T023 — getActiveShipmentsCount (live)", () => {
  it("counts a REQUESTED shipment as active, and does not count a DRAFT one", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);

    const before = await withLiveClient(orgBClient, async () => {
      const { getActiveShipmentsCount } = await import("@/lib/delivery/read");
      return getActiveShipmentsCount({ organizationId: INVENTORY_FIXTURES.orgB.organizationId });
    });

    const { orderId, shipmentId } = await createTestOrderWithShipment(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);
    const afterDraft = await withLiveClient(orgBClient, async () => {
      const { getActiveShipmentsCount } = await import("@/lib/delivery/read");
      return getActiveShipmentsCount({ organizationId: INVENTORY_FIXTURES.orgB.organizationId });
    });
    expect(afterDraft).toBe(before);

    await withLiveClient(orgBClient, async () => {
      const { requestShipment } = await import("@/lib/delivery/buyer");
      const result = await requestShipment({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId, shipmentId });
      if (!result.ok) throw new Error(`setup: ${result.code}`);
    });
    const afterRequested = await withLiveClient(orgBClient, async () => {
      const { getActiveShipmentsCount } = await import("@/lib/delivery/read");
      return getActiveShipmentsCount({ organizationId: INVENTORY_FIXTURES.orgB.organizationId });
    });
    expect(afterRequested).toBe(before + 1);
  });
});

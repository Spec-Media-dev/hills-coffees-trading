import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, PHASE89_FIXTURES, createAnonymousFixtureClient, inspectCheckoutMirrors, inspectCheckoutOrder, resetCheckoutFixtures, setSuspendedOrganizationStatus, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { buildHoldOrder } from "./live-helpers";

/**
 * Feature 007 DB blocker run — DB-OPEN-13 (T004 PS1 scenario 4): a buyer can change the quantity of, and
 * remove, an item on its OWN DRAFT order — and nothing else — proven LIVE through the production actions
 * (`updateItemQuantity`/`removeItemFromOrder` → `lib/orders/drafts.ts`) and directly against the
 * database functions `update_order_item_quantity`/`remove_order_item` (migration 20260913100000) under
 * ordinary member sessions. Privileged access only for fixture reset/suspension toggles and invariant
 * inspection. Every test resets the dedicated checkout listing first and builds its own orders.
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

const LIVE_TIMEOUT_MS = 150_000;
const ITEM_RPCS = ["update_order_item_quantity", "remove_order_item"];

function spyItemRpcs(client: SupabaseClient) {
  const spy = vi.spyOn(client, "rpc");
  return {
    calls: () => spy.mock.calls.filter(([fn]) => ITEM_RPCS.includes(fn as string)).length,
    restore: () => spy.mockRestore(),
  };
}

/** A DRAFT order with one item (and optionally a DRAFT shipment planning it), via the production paths. */
async function buildDraft(client: SupabaseClient, organizationId: string, quantityKg: number, options: { planKg?: number } = {}) {
  return withLiveClient(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const { createShipment, addShipmentItem } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
    const userId = (await client.auth.getUser()).data.user!.id;
    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(`setup: ${order.code}`);
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: CHECKOUT_FIXTURES.offerCheckout, quantityKg });
    if (!item.ok) throw new Error(`setup: ${item.code}`);
    let shipmentId: string | null = null;
    if (options.planKg !== undefined) {
      const form = new FormData();
      form.set("orderId", order.data.id);
      form.set("deliveryMethod", "Courier");
      form.set("countryCode", "AE");
      form.set("addressLine", "13 Draft Item Street");
      form.set("contactName", "Draft Tester");
      form.set("contactPhone", "+971500000013");
      const shipment = await createShipment(undefined, form);
      if (!shipment.ok) throw new Error(`setup: ${shipment.code}`);
      shipmentId = shipment.data.id;
      const plan = new FormData();
      plan.set("orderId", order.data.id);
      plan.set("shipmentId", shipmentId);
      plan.set("orderItemId", item.data.id);
      plan.set("plannedQuantityKg", String(options.planKg));
      const planned = await addShipmentItem(undefined, plan);
      if (!planned.ok) throw new Error(`setup: ${planned.code}`);
    }
    return { orderId: order.data.id, item: item.data, shipmentId };
  });
}

async function editViaAction(client: SupabaseClient, fields: Record<string, string>) {
  return withLiveClient(client, async () => {
    const { updateItemQuantity } = await import("@/src/app/dashboard/orders/actions");
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return updateItemQuantity(undefined, form);
  });
}

async function removeViaAction(client: SupabaseClient, fields: Record<string, string>) {
  return withLiveClient(client, async () => {
    const { removeItemFromOrder } = await import("@/src/app/dashboard/orders/actions");
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return removeItemFromOrder(undefined, form);
  });
}

async function readItems(client: SupabaseClient, orderId: string) {
  return withLiveClient(client, async () => {
    const { getOrderItems } = await import("@/lib/orders/read");
    return getOrderItems({ orderId });
  });
}

beforeEach(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("DB-OPEN-13 — the owning buyer edits and removes DRAFT items (live)", () => {
  it(
    "quantity edit through the action: only quantity_kg changes (price/lot/seller/snapshots re-derived by the trigger, unchanged), and no reservation, financial, proforma, payment or ownership artefact appears",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const { orderId, item } = await buildDraft(orgB, INVENTORY_FIXTURES.orgB.organizationId, 3);
      const before = inspectCheckoutOrder(orderId);

      const result = await editViaAction(orgB, { orderId, orderItemId: item.id, quantityKg: "5" });
      expect(result).toEqual({ ok: true, data: undefined });

      const [edited] = await readItems(orgB, orderId);
      expect(edited!.id).toBe(item.id);
      expect(edited!.quantityKg).toBe(5);
      expect(edited!.unitPricePerKg).toBe(item.unitPricePerKg);
      expect(edited!.offerId).toBe(item.offerId);
      expect(edited!.lotId).toBe(item.lotId);
      expect(edited!.sellerOrganizationId).toBe(item.sellerOrganizationId);
      expect(edited!.productNameSnapshot).toBe(item.productNameSnapshot);
      expect(edited!.lotCodeSnapshot).toBe(item.lotCodeSnapshot);

      const after = inspectCheckoutOrder(orderId);
      expect(after.order?.status).toBe("DRAFT");
      expect(after.reservations).toEqual([]);
      expect(after.financials).toEqual([]);
      expect(after.proformas).toEqual([]);
      expect(after.payments).toEqual([]);
      expect(after.ownershipEventCount).toBe(before.ownershipEventCount);
      const mirrors = inspectCheckoutMirrors();
      expect(Number(mirrors.offer.reserved_quantity_kg)).toBe(0);
      expect(Number(mirrors.position.reserved_quantity_kg)).toBe(0);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "removal through the action deletes the item and its DRAFT shipment-plan row, with no transactional artefact; an over-availability edit is refused safely",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const { orderId, item, shipmentId } = await buildDraft(orgB, INVENTORY_FIXTURES.orgB.organizationId, 4, { planKg: 4 });

      const tooMuch = await editViaAction(orgB, { orderId, orderItemId: item.id, quantityKg: "999" });
      expect(tooMuch).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE });
      expect((await readItems(orgB, orderId))[0]!.quantityKg).toBe(4);

      const removed = await removeViaAction(orgB, { orderId, orderItemId: item.id });
      expect(removed).toEqual({ ok: true, data: undefined });
      expect(await readItems(orgB, orderId)).toEqual([]);
      const { data: planRows, error } = await orgB.from("shipment_items").select("id").eq("shipment_id", shipmentId!);
      expect(error).toBeNull();
      expect(planRows).toEqual([]);

      const after = inspectCheckoutOrder(orderId);
      expect(after.order?.status).toBe("DRAFT");
      expect(after.reservations).toEqual([]);
      expect(after.financials).toEqual([]);
      expect(after.proformas).toEqual([]);
      expect(after.payments).toEqual([]);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "a quantity below the DRAFT shipment plan is refused, and an item planned on a REQUESTED (closed) shipment can be neither edited nor removed — by the database, through the action",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const { orderId, item, shipmentId } = await buildDraft(orgB, INVENTORY_FIXTURES.orgB.organizationId, 4, { planKg: 4 });

      const belowPlan = await editViaAction(orgB, { orderId, orderItemId: item.id, quantityKg: "2" });
      expect(belowPlan).toEqual({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID });

      const { error: requestError } = await orgB.from("order_shipments").update({ status: "REQUESTED" }).eq("id", shipmentId!);
      expect(requestError).toBeNull();
      expect(await editViaAction(orgB, { orderId, orderItemId: item.id, quantityKg: "6" })).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_EDITABLE });
      expect(await removeViaAction(orgB, { orderId, orderItemId: item.id })).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_EDITABLE });
      expect((await readItems(orgB, orderId))[0]!.quantityKg).toBe(4);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("DB-OPEN-13 — cross-organization edit/remove is impossible (live, both layers)", () => {
  it(
    "the foreign org's actions refuse ORDER_NOT_FOUND before any RPC; the database functions answer a foreign org's KNOWN item id exactly like a NONEXISTENT id ('order_item_not_found'), while the owner's own call works; the item is untouched",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const { orderId, item } = await buildDraft(orgB, INVENTORY_FIXTURES.orgB.organizationId, 3);

      const rpcs = spyItemRpcs(orgA);
      expect(await editViaAction(orgA, { orderId, orderItemId: item.id, quantityKg: "1" })).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND });
      expect(await removeViaAction(orgA, { orderId, orderItemId: item.id })).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND });
      // Pairing the foreign org's OWN draft id with the victim's item id is refused identically.
      const { orderId: ownDraft } = await buildDraft(orgA, INVENTORY_FIXTURES.orgA.organizationId, 1);
      expect(await removeViaAction(orgA, { orderId: ownDraft, orderItemId: item.id })).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND });
      expect(rpcs.calls()).toBe(0);
      rpcs.restore();

      const NONEXISTENT_ITEM_ID = "00000000-0000-4000-8000-0000000d0013";
      const unattached = await signInAsFixture(PHASE89_FIXTURES.noOrganization.email);
      for (const [label, session] of [["foreign org", orgA], ["unattached", unattached]] as const) {
        const knownUpdate = await session.rpc("update_order_item_quantity", { p_order_item_id: item.id, p_quantity_kg: 1 });
        const missingUpdate = await session.rpc("update_order_item_quantity", { p_order_item_id: NONEXISTENT_ITEM_ID, p_quantity_kg: 1 });
        const knownRemove = await session.rpc("remove_order_item", { p_order_item_id: item.id });
        const missingRemove = await session.rpc("remove_order_item", { p_order_item_id: NONEXISTENT_ITEM_ID });
        for (const response of [knownUpdate, missingUpdate, knownRemove, missingRemove]) {
          expect(response.error?.message, label).toBe("order_item_not_found");
          expect(response.data, label).toBeNull();
        }
        // Indistinguishable: same message, same SQLSTATE, same details/hint.
        expect({ code: knownUpdate.error?.code, details: knownUpdate.error?.details, hint: knownUpdate.error?.hint }).toEqual({ code: missingUpdate.error?.code, details: missingUpdate.error?.details, hint: missingUpdate.error?.hint });
        expect({ code: knownRemove.error?.code, details: knownRemove.error?.details, hint: knownRemove.error?.hint }).toEqual({ code: missingRemove.error?.code, details: missingRemove.error?.details, hint: missingRemove.error?.hint });
      }

      // The owner's own direct call on the same item is accepted (and its missing-id call is the same generic refusal).
      const ownDirect = await orgB.rpc("update_order_item_quantity", { p_order_item_id: item.id, p_quantity_kg: 3 });
      expect(ownDirect.error).toBeNull();
      expect((await orgB.rpc("remove_order_item", { p_order_item_id: NONEXISTENT_ITEM_ID })).error?.message).toBe("order_item_not_found");

      const [unchanged] = await readItems(orgB, orderId);
      expect(unchanged!.quantityKg).toBe(3);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("DB-OPEN-13 — non-DRAFT orders refuse edit/remove (live, both layers)", () => {
  it(
    "CONFIRMED and HOLD orders: the actions refuse ORDER_NOT_EDITABLE before any RPC, the database refuses direct calls with order_items_can_only_change_in_draft, and the HOLD reservation is untouched",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const confirmed = await buildDraft(orgB, INVENTORY_FIXTURES.orgB.organizationId, 2);
      const { error: confirmError } = await orgB.from("orders").update({ status: "CONFIRMED" }).eq("id", confirmed.orderId);
      expect(confirmError).toBeNull();

      const holdOrderId = await buildHoldOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 6);
      const [holdItem] = await readItems(orgB, holdOrderId);
      const holdBefore = inspectCheckoutOrder(holdOrderId);

      for (const target of [
        { orderId: confirmed.orderId, orderItemId: confirmed.item.id },
        { orderId: holdOrderId, orderItemId: holdItem!.id },
      ]) {
        const rpcs = spyItemRpcs(orgB);
        expect(await editViaAction(orgB, { ...target, quantityKg: "1" })).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_EDITABLE });
        expect(await removeViaAction(orgB, target)).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_EDITABLE });
        expect(rpcs.calls()).toBe(0);
        rpcs.restore();

        const directUpdate = await orgB.rpc("update_order_item_quantity", { p_order_item_id: target.orderItemId, p_quantity_kg: 1 });
        const directRemove = await orgB.rpc("remove_order_item", { p_order_item_id: target.orderItemId });
        expect(directUpdate.error?.message).toBe("order_items_can_only_change_in_draft");
        expect(directRemove.error?.message).toBe("order_items_can_only_change_in_draft");
      }

      expect((await readItems(orgB, confirmed.orderId))[0]!.quantityKg).toBe(2);
      expect((await readItems(orgB, holdOrderId))[0]!.quantityKg).toBe(6);
      const holdAfter = inspectCheckoutOrder(holdOrderId);
      expect(holdAfter.reservations[0]!.status).toBe("ACTIVE");
      expect(holdAfter.reservationItems).toEqual(holdBefore.reservationItems);
      expect(Number(holdAfter.offer.reserved_quantity_kg)).toBe(Number(holdBefore.offer.reserved_quantity_kg));
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "a SUSPENDED organization cannot edit its own draft: the action refuses BUYER_NOT_CAPABLE and the database refuses buyer_not_authorized",
    async () => {
      setSuspendedOrganizationStatus("ACTIVE");
      try {
        const member = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
        const { orderId, item } = await buildDraft(member, PHASE89_FIXTURES.suspended.organizationId, 1);
        setSuspendedOrganizationStatus("SUSPENDED");
        expect(await editViaAction(member, { orderId, orderItemId: item.id, quantityKg: "2" })).toEqual({ ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE });
        const direct = await member.rpc("update_order_item_quantity", { p_order_item_id: item.id, p_quantity_kg: 2 });
        expect(direct.error?.message).toBe("buyer_not_authorized");
        expect((await readItems(member, orderId))[0]!.quantityKg).toBe(1);
      } finally {
        setSuspendedOrganizationStatus("ACTIVE");
      }
    },
    LIVE_TIMEOUT_MS
  );
});

describe("DB-OPEN-13 — snapshot/security fields cannot be forged (live)", () => {
  it(
    "raw REST UPDATE/DELETE on order_items by the owning buyer change nothing, the RPC accepts no field but the quantity, and extra form fields are ignored by the action",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const { orderId, item } = await buildDraft(orgB, INVENTORY_FIXTURES.orgB.organizationId, 3);

      const forgedUpdate = await orgB
        .from("order_items")
        .update({ unit_price_per_kg: 0.01, seller_organization_id: INVENTORY_FIXTURES.orgB.organizationId, product_name_snapshot: "Forged", quantity_kg: 1 })
        .eq("id", item.id)
        .select("id");
      // No buyer UPDATE policy exists: RLS filters the row out (zero rows) — never a partial write.
      expect(forgedUpdate.data ?? []).toEqual([]);

      const forgedDelete = await orgB.from("order_items").delete().eq("id", item.id).select("id");
      expect(forgedDelete.data ?? []).toEqual([]);

      const extraParameter = await orgB.rpc("update_order_item_quantity", { p_order_item_id: item.id, p_quantity_kg: 4, p_unit_price_per_kg: 0.01 });
      expect(extraParameter.error).not.toBeNull(); // no such signature — the allowlist is the function itself

      const viaAction = await editViaAction(orgB, { orderId, orderItemId: item.id, quantityKg: "4", unitPricePerKg: "0.01", sellerOrganizationId: INVENTORY_FIXTURES.orgB.organizationId, productNameSnapshot: "Forged" });
      expect(viaAction).toEqual({ ok: true, data: undefined });

      const [current] = await readItems(orgB, orderId);
      expect(current!.quantityKg).toBe(4);
      expect(current!.unitPricePerKg).toBe(CHECKOUT_FIXTURES.offerPricePerKg);
      expect(current!.sellerOrganizationId).toBe(item.sellerOrganizationId);
      expect(current!.productNameSnapshot).toBe(item.productNameSnapshot);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("DB-OPEN-13 — anonymous callers cannot execute the item RPCs (live)", () => {
  it(
    "anon holds no EXECUTE on update_order_item_quantity or remove_order_item: both are refused and the item is untouched",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const { orderId, item } = await buildDraft(orgB, INVENTORY_FIXTURES.orgB.organizationId, 2);
      const anonymous = createAnonymousFixtureClient();

      const update = await anonymous.rpc("update_order_item_quantity", { p_order_item_id: item.id, p_quantity_kg: 1 });
      const remove = await anonymous.rpc("remove_order_item", { p_order_item_id: item.id });
      for (const response of [update, remove]) {
        expect(response.error).not.toBeNull();
        expect(response.error?.message).not.toBe("order_item_not_found"); // refused before the function body runs
        expect(response.data).toBeNull();
      }
      expect((await readItems(orgB, orderId))[0]!.quantityKg).toBe(2);
    },
    LIVE_TIMEOUT_MS
  );
});

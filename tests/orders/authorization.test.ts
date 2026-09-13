import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  INVENTORY_FIXTURES,
  PHASE89_FIXTURES,
  ageCheckoutHold,
  createAnonymousFixtureClient,
  inspectCheckoutOrder,
  resetCheckoutFixtures,
  setSuspendedOrganizationStatus,
  signInAsFixture,
} from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { buildHoldOrder, buildReadyOrder } from "./live-helpers";

/**
 * Feature 007 RUN D — T024 (SEC-001 / SEC-002 / SC-006): cross-tenant commercial access, proven LIVE at
 * BOTH layers.
 *
 *   1. APPLICATION BOUNDARY — `executeCheckout` / `ensureHoldFresh` refuse every unauthorized caller
 *      BEFORE their RPC (an `rpc` spy proves the call count is 0), and a cross-organization id is
 *      refused with a result deep-equal to a nonexistent id (no existence disclosure).
 *   2. DATABASE LAYER — the same unauthorized NORMAL session calling `checkout_order()` directly (a
 *      test-only direct RPC, never service-role) is refused by the function itself, with zero effect.
 *      `expire_order_hold()` has NO caller check in the live function (it acts only on reservations
 *      whose `expires_at` has already passed); that is characterized honestly below rather than
 *      claimed as a refusal — the application boundary is what stops a cross-org caller.
 *   3. RLS — `can_view_order` scoping: the owner reads its order and every commercial child row; an
 *      unrelated organization reads none of them by known id and sees none of them in a broad list.
 *
 * Privileged access is used ONLY for fixture setup (`resetCheckoutFixtures`,
 * `setSuspendedOrganizationStatus`, `ageCheckoutHold`) and invariant inspection (`inspectCheckoutOrder`)
 * — never as the path whose authorization is under test.
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

function spyTransactionalRpcs(client: SupabaseClient) {
  const spy = vi.spyOn(client, "rpc");
  return {
    checkoutCalls: () => spy.mock.calls.filter(([fn]) => fn === "checkout_order").length,
    expiryCalls: () => spy.mock.calls.filter(([fn]) => fn === "expire_order_hold").length,
    restore: () => spy.mockRestore(),
  };
}

async function appCheckout(client: SupabaseClient, orderId: string) {
  return withLiveClient(client, async () => {
    const { executeCheckout } = await import("@/lib/orders/checkout");
    return executeCheckout(orderId);
  });
}

async function appEnsureFresh(client: SupabaseClient, orderId: string) {
  return withLiveClient(client, async () => {
    const { ensureHoldFresh } = await import("@/lib/orders/expiry");
    // Reference instant far in the future so a HOLD would be treated as stale — the ONLY thing that
    // stops the RPC for a foreign/unauthorized caller is the authorization boundary itself.
    return ensureHoldFresh(orderId, { now: new Date(Date.now() + 30 * 60_000) });
  });
}

const NONEXISTENT_ORDER_ID = "00000000-0000-4000-8000-00000000d024";
const LIVE_TIMEOUT_MS = 120_000;

let ownerClient: SupabaseClient;
let foreignClient: SupabaseClient;
/** orgB's checkout-ready DRAFT order (never checked out by this file's authorization tests). */
let readyOrderId: string;
/** orgB's genuine HOLD order. */
let holdOrderId: string;

beforeAll(async () => {
  resetCheckoutFixtures();
  ownerClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
  foreignClient = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
  readyOrderId = await buildReadyOrder(withLiveClient, ownerClient, INVENTORY_FIXTURES.orgB.organizationId, 3);
  holdOrderId = await buildHoldOrder(withLiveClient, ownerClient, INVENTORY_FIXTURES.orgB.organizationId, 4);
}, 180_000);

describe("T024 — anonymous caller (live)", () => {
  it(
    "application: executeCheckout → BUYER_NOT_CAPABLE and ensureHoldFresh → ORDER_NOT_ACCESSIBLE, no RPC; database: no EXECUTE on either function and no row readable",
    async () => {
      const anonymous = createAnonymousFixtureClient();
      const rpcs = spyTransactionalRpcs(anonymous);
      const checkout = await appCheckout(anonymous, readyOrderId);
      const fresh = await appEnsureFresh(anonymous, holdOrderId);
      expect(checkout).toEqual({ ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE });
      expect(fresh).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_ACCESSIBLE });
      expect(rpcs.checkoutCalls()).toBe(0);
      expect(rpcs.expiryCalls()).toBe(0);
      rpcs.restore();

      const directCheckout = await anonymous.rpc("checkout_order", { p_order_id: readyOrderId });
      const directExpiry = await anonymous.rpc("expire_order_hold", { p_order_id: holdOrderId });
      expect(directCheckout.error).not.toBeNull();
      expect(directCheckout.data).toBeNull();
      expect(directExpiry.error).not.toBeNull();

      for (const table of ["orders", "order_items", "order_shipments", "order_financials", "proforma_invoices", "payments", "order_status_history"] as const) {
        const column = table === "orders" ? "id" : "order_id";
        const { data } = await anonymous.from(table).select(column).eq(column, holdOrderId);
        expect(data ?? [], table).toEqual([]);
      }

      const snapshot = inspectCheckoutOrder(readyOrderId);
      expect(snapshot.order?.status).toBe("DRAFT");
      expect(snapshot.reservations).toEqual([]);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T024 — authenticated but unattached user (live)", () => {
  it(
    "application refuses before the RPC; checkout_order() itself refuses the unattached session with 'forbidden'; nothing readable by known id",
    async () => {
      const unattached = await signInAsFixture(PHASE89_FIXTURES.noOrganization.email);
      const rpcs = spyTransactionalRpcs(unattached);
      expect(await appCheckout(unattached, readyOrderId)).toEqual({ ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE });
      expect(await appEnsureFresh(unattached, holdOrderId)).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_ACCESSIBLE });
      expect(rpcs.checkoutCalls()).toBe(0);
      expect(rpcs.expiryCalls()).toBe(0);
      rpcs.restore();

      const direct = await unattached.rpc("checkout_order", { p_order_id: readyOrderId });
      expect(direct.error?.message).toBe("forbidden");
      expect(direct.data).toBeNull();

      const { data: orders } = await unattached.from("orders").select("id").eq("id", holdOrderId);
      expect(orders ?? []).toEqual([]);
      const snapshot = inspectCheckoutOrder(readyOrderId);
      expect(snapshot.order?.status).toBe("DRAFT");
      expect(snapshot.reservations).toEqual([]);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T024 — non-buy-capable and suspended organizations (live)", () => {
  it(
    "a PENDING-KYB organization (not an authorized buyer) is refused before the RPC, and checkout_order() refuses its session on another org's order",
    async () => {
      const pending = await signInAsFixture(PHASE89_FIXTURES.pendingKyb.email);
      const rpcs = spyTransactionalRpcs(pending);
      expect(await appCheckout(pending, readyOrderId)).toEqual({ ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE });
      expect(await appEnsureFresh(pending, holdOrderId)).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_ACCESSIBLE });
      expect(rpcs.checkoutCalls()).toBe(0);
      expect(rpcs.expiryCalls()).toBe(0);
      rpcs.restore();

      const direct = await pending.rpc("checkout_order", { p_order_id: readyOrderId });
      expect(direct.error?.message).toBe("forbidden");
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "a SUSPENDED organization with its OWN checkout-ready order: the application refuses before the RPC, and checkout_order() itself refuses the member's direct call with 'buyer_not_authorized' — zero artefacts",
    async () => {
      const suspendedOrganizationId = PHASE89_FIXTURES.suspended.organizationId;
      setSuspendedOrganizationStatus("ACTIVE");
      let ownOrderId: string;
      try {
        const suspendedMember = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
        ownOrderId = await buildReadyOrder(withLiveClient, suspendedMember, suspendedOrganizationId, 2);

        setSuspendedOrganizationStatus("SUSPENDED");
        const rpcs = spyTransactionalRpcs(suspendedMember);
        expect(await appCheckout(suspendedMember, ownOrderId)).toEqual({ ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE });
        expect(await appEnsureFresh(suspendedMember, ownOrderId)).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_ACCESSIBLE });
        expect(rpcs.checkoutCalls()).toBe(0);
        expect(rpcs.expiryCalls()).toBe(0);
        rpcs.restore();

        const direct = await suspendedMember.rpc("checkout_order", { p_order_id: ownOrderId });
        expect(direct.error?.message).toBe("buyer_not_authorized");
        expect(direct.data).toBeNull();

        const snapshot = inspectCheckoutOrder(ownOrderId);
        expect(snapshot.order?.status).toBe("DRAFT");
        expect(snapshot.reservations).toEqual([]);
        expect(snapshot.proformas).toEqual([]);
        expect(snapshot.payments).toEqual([]);
        expect(snapshot.financials).toEqual([]);
      } finally {
        setSuspendedOrganizationStatus("ACTIVE");
      }
    },
    180_000
  );
});

describe("T024 — another organization's order id vs a nonexistent id (live)", () => {
  it(
    "application: executeCheckout and ensureHoldFresh return results DEEP-EQUAL to a nonexistent id (ORDER_NOT_FOUND), before any RPC; the owner's order is untouched",
    async () => {
      const rpcs = spyTransactionalRpcs(foreignClient);
      const crossOrgCheckout = await appCheckout(foreignClient, readyOrderId);
      const nonexistentCheckout = await appCheckout(foreignClient, NONEXISTENT_ORDER_ID);
      const crossOrgHoldCheckout = await appCheckout(foreignClient, holdOrderId);
      const crossOrgFresh = await appEnsureFresh(foreignClient, holdOrderId);
      const nonexistentFresh = await appEnsureFresh(foreignClient, NONEXISTENT_ORDER_ID);
      expect(rpcs.checkoutCalls()).toBe(0);
      expect(rpcs.expiryCalls()).toBe(0);
      rpcs.restore();

      expect(crossOrgCheckout).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND });
      expect(crossOrgCheckout).toEqual(nonexistentCheckout);
      expect(crossOrgHoldCheckout).toEqual(nonexistentCheckout);
      expect(crossOrgFresh).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND });
      expect(crossOrgFresh).toEqual(nonexistentFresh);

      const readThroughApplication = await withLiveClient(foreignClient, async () => {
        const { getOrderById } = await import("@/lib/orders/read");
        return {
          crossOrg: await getOrderById({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, orderId: holdOrderId }),
          nonexistent: await getOrderById({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, orderId: NONEXISTENT_ORDER_ID }),
          // Even naming the OTHER organization as the scope cannot widen what RLS returns.
          spoofedScope: await getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId: holdOrderId }),
        };
      });
      expect(readThroughApplication).toEqual({ crossOrg: null, nonexistent: null, spoofedScope: null });

      const hold = inspectCheckoutOrder(holdOrderId);
      expect(hold.order?.status).toBe("HOLD");
      expect(hold.reservations[0]!.status).toBe("ACTIVE");
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "database: checkout_order() itself refuses the foreign NORMAL session with 'forbidden' on both the ready and the HOLD order (no retry-branch disclosure), with zero effect",
    async () => {
      const before = inspectCheckoutOrder(readyOrderId);
      const onReady = await foreignClient.rpc("checkout_order", { p_order_id: readyOrderId });
      const onHold = await foreignClient.rpc("checkout_order", { p_order_id: holdOrderId });
      const onNothing = await foreignClient.rpc("checkout_order", { p_order_id: NONEXISTENT_ORDER_ID });
      expect(onReady.error?.message).toBe("forbidden");
      expect(onReady.data).toBeNull();
      expect(onHold.error?.message).toBe("forbidden");
      expect(onHold.data).toBeNull(); // the existing reservation/proforma/total are NOT returned to a foreign caller
      // HONEST DB-LAYER NOTE: the function itself distinguishes 'forbidden' from 'order_not_found' for a
      // caller who already holds an exact order UUID. The APPLICATION never exposes that distinction
      // (refused before the RPC, identical ORDER_NOT_FOUND above).
      expect(onNothing.error?.message).toBe("order_not_found");

      const after = inspectCheckoutOrder(readyOrderId);
      expect(after.order?.status).toBe(before.order?.status);
      expect(after.reservations).toEqual([]);
      expect(after.proformas).toEqual([]);
      expect(after.payments).toEqual([]);
      expect(after.financials).toEqual([]);
      expect(after.offer.reserved_quantity_kg).toBe(before.offer.reserved_quantity_kg);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "database: expire_order_hold() has no caller check — a foreign session's direct call on an UNEXPIRED hold returns nothing and changes nothing; on an ALREADY-expired hold it performs exactly the release that is due (characterization, not a refusal)",
    async () => {
      const unexpiredBefore = inspectCheckoutOrder(holdOrderId);
      const onUnexpired = await foreignClient.rpc("expire_order_hold", { p_order_id: holdOrderId });
      const onNothing = await foreignClient.rpc("expire_order_hold", { p_order_id: NONEXISTENT_ORDER_ID });
      expect(onUnexpired.error).toBeNull();
      expect(onUnexpired.data).toBeNull(); // void — nothing is disclosed
      expect(onNothing.error).toBeNull();
      expect(onNothing.data).toBeNull(); // indistinguishable from the foreign order at this layer too
      const unexpiredAfter = inspectCheckoutOrder(holdOrderId);
      expect(unexpiredAfter.order?.status).toBe("HOLD");
      expect(unexpiredAfter.reservations[0]!.status).toBe("ACTIVE");
      expect(Number(unexpiredAfter.offer.reserved_quantity_kg)).toBe(Number(unexpiredBefore.offer.reserved_quantity_kg));

      const dueOrderId = await buildHoldOrder(withLiveClient, ownerClient, INVENTORY_FIXTURES.orgB.organizationId, 1);
      ageCheckoutHold(dueOrderId);
      const dueBefore = inspectCheckoutOrder(dueOrderId);
      const onDue = await foreignClient.rpc("expire_order_hold", { p_order_id: dueOrderId });
      expect(onDue.error).toBeNull();
      const dueAfter = inspectCheckoutOrder(dueOrderId);
      expect(dueAfter.order?.status).toBe("EXPIRED");
      expect(Number(dueAfter.offer.reserved_quantity_kg)).toBe(Number(dueBefore.offer.reserved_quantity_kg) - 1);
      expect(dueAfter.ownershipEventCount).toBe(dueBefore.ownershipEventCount);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T024 — the authorized owning buyer (live)", () => {
  it(
    "the owner's checkout reaches checkout_order() exactly once and succeeds; ensureHoldFresh on its fresh HOLD succeeds without an RPC",
    async () => {
      const ownReady = await buildReadyOrder(withLiveClient, ownerClient, INVENTORY_FIXTURES.orgB.organizationId, 2);
      const rpcs = spyTransactionalRpcs(ownerClient);
      const checkout = await appCheckout(ownerClient, ownReady);
      const fresh = await withLiveClient(ownerClient, async () => {
        const { ensureHoldFresh } = await import("@/lib/orders/expiry");
        return ensureHoldFresh(ownReady);
      });
      expect(rpcs.checkoutCalls()).toBe(1);
      expect(rpcs.expiryCalls()).toBe(0);
      rpcs.restore();
      expect(checkout.ok).toBe(true);
      expect(fresh.ok).toBe(true);
      if (fresh.ok) {
        expect(fresh.data.order.status).toBe("HOLD");
        expect(fresh.data.fresh).toBe(true);
      }
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T024 — can_view_order / RLS scoping of the order and every commercial child row (live)", () => {
  it(
    "the owner reads its HOLD order, items, shipments, financials, proforma, payment and history; can_view_order is true for the owner and false for the foreign organization",
    async () => {
      const ownerCan = await ownerClient.rpc("can_view_order", { p_order_id: holdOrderId });
      const foreignCan = await foreignClient.rpc("can_view_order", { p_order_id: holdOrderId });
      expect(ownerCan.data).toBe(true);
      expect(foreignCan.data).toBe(false);

      for (const table of ["order_items", "order_shipments", "order_financials", "proforma_invoices", "payments", "order_status_history"] as const) {
        const own = await ownerClient.from(table).select("order_id").eq("order_id", holdOrderId);
        expect(own.error, table).toBeNull();
        expect((own.data ?? []).length, table).toBeGreaterThan(0);
      }
      const ownOrder = await ownerClient.from("orders").select("id").eq("id", holdOrderId);
      expect(ownOrder.data).toEqual([{ id: holdOrderId }]);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "the foreign organization reads NOTHING by known id — order, items, shipments, shipment items, financials, proforma, payment, history, reservation items — and its broad order list contains only its own orders",
    async () => {
      const ownerItems = await ownerClient.from("order_items").select("id").eq("order_id", holdOrderId);
      const ownerItemIds = (ownerItems.data ?? []).map((row) => row.id as string);
      expect(ownerItemIds.length).toBeGreaterThan(0);

      const { data: foreignOrder } = await foreignClient.from("orders").select("id").eq("id", holdOrderId);
      expect(foreignOrder ?? []).toEqual([]);
      for (const table of ["order_items", "order_shipments", "order_financials", "proforma_invoices", "payments", "order_status_history"] as const) {
        const { data, error } = await foreignClient.from(table).select("order_id").eq("order_id", holdOrderId);
        expect(error, table).toBeNull();
        expect(data ?? [], table).toEqual([]);
      }
      const { data: foreignShipmentItems } = await foreignClient.from("shipment_items").select("id").in("order_item_id", ownerItemIds);
      expect(foreignShipmentItems ?? []).toEqual([]);

      const reservationId = inspectCheckoutOrder(holdOrderId).reservations[0]!.id;
      const { data: foreignReservationItems } = await foreignClient.from("inventory_reservation_items").select("reservation_id").eq("reservation_id", reservationId);
      expect(foreignReservationItems ?? []).toEqual([]);
      // Reservations themselves are admin-only: not even the owning member reads them (runtime never does).
      const { data: ownerReservations } = await ownerClient.from("inventory_reservations").select("id").eq("id", reservationId);
      expect(ownerReservations ?? []).toEqual([]);

      const { data: foreignList, error: listError } = await foreignClient.from("orders").select("id, buyer_organization_id").limit(1000);
      expect(listError).toBeNull();
      const listed = foreignList ?? [];
      expect(listed.map((row) => row.id)).not.toContain(holdOrderId);
      expect(listed.map((row) => row.id)).not.toContain(readyOrderId);
      for (const row of listed) expect(row.buyer_organization_id).not.toBe(INVENTORY_FIXTURES.orgB.organizationId);
    },
    LIVE_TIMEOUT_MS
  );
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, ageCheckoutHold, inspectCheckoutMirrors, inspectCheckoutOrder, resetCheckoutFixtures, signInAsFixture, type CheckoutMirrorInspection } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { buildReadyOrder } from "./live-helpers";

/**
 * Feature 007 RUN D — T022 (SC-005): after every authoritative reservation change, the listing mirror
 * `coffee_offers.reserved_quantity_kg` equals the inventory source of truth
 * `inventory_positions.reserved_quantity_kg` with ZERO drift — and both equal the sum of the ACTIVE
 * `inventory_reservation_items` behind them. Every expected number below is the database's own
 * reservation truth or a quantity the test itself requested; nothing is recomputed from UI state.
 *
 * The dedicated checkout listing's position backs ONLY that listing, so the two mirrors must be equal
 * at every step. Mirror and reservation rows are read ONLY through the approved test-only privileged
 * fixture read (`inspectCheckoutMirrors`) — never member runtime code.
 *
 * Settlement/fill (`filled_quantity_kg`, PARTIALLY_FILLED after payment) is Feature 008/006's concern
 * and is deliberately not exercised; `filled_quantity_kg` must simply stay 0 here.
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

async function runCheckout(client: SupabaseClient, orderId: string) {
  return withLiveClient(client, async () => {
    const { executeCheckout } = await import("@/lib/orders/checkout");
    return executeCheckout(orderId);
  });
}

/** Zero drift: listing mirror == inventory mirror == ACTIVE reservation rows, and all equal the expected kilograms. */
function expectZeroDrift(snapshot: CheckoutMirrorInspection, expectedReservedKg: number, expectedActiveReservations: number): void {
  expect(Number(snapshot.offer.reserved_quantity_kg)).toBe(expectedReservedKg);
  expect(Number(snapshot.position.reserved_quantity_kg)).toBe(expectedReservedKg);
  expect(snapshot.activeReservationItemsForOfferKg).toBe(expectedReservedKg);
  expect(snapshot.activeReservationItemsForPositionKg).toBe(expectedReservedKg);
  expect(Number(snapshot.offer.reserved_quantity_kg) - Number(snapshot.position.reserved_quantity_kg)).toBe(0);
  expect(snapshot.activeReservationCountForOffer).toBe(expectedActiveReservations);
  expect(Number(snapshot.offer.filled_quantity_kg)).toBe(0);
  expect(Number(snapshot.offer.reserved_quantity_kg)).toBeLessThanOrEqual(Number(snapshot.offer.quantity_kg));
  expect(Number(snapshot.position.reserved_quantity_kg)).toBeLessThanOrEqual(Number(snapshot.position.available_quantity_kg));
}

beforeEach(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("T022 — listing and inventory reserved mirrors stay in lock-step through the whole reservation lifecycle (live)", () => {
  it(
    "before checkout 0/0 → checkout 12 kg → second buyer 7 kg (partial) → remaining 30 kg usable → refused checkout changes nothing → expiry releases 7 → released kilograms reusable: zero drift at every step",
    async () => {
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);

      // 0. Before any checkout.
      const initial = inspectCheckoutMirrors();
      expect(Number(initial.offer.quantity_kg)).toBe(CHECKOUT_FIXTURES.offerQuantityKg);
      expectZeroDrift(initial, 0, 0);

      // 1. A successful checkout of a PARTIAL quantity (12 of 50): only the requested 12 kg is reserved.
      const first = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 12);
      const firstResult = await runCheckout(orgB, first);
      if (!firstResult.ok) throw new Error(`checkout 12 kg failed: ${firstResult.code}`);
      expectZeroDrift(inspectCheckoutMirrors(), 12, 1);

      // 2. An additional permitted reservation by a different buyer (7 kg).
      const second = await buildReadyOrder(withLiveClient, orgA, INVENTORY_FIXTURES.orgA.organizationId, 7);
      // Built while the quantity is still available, checked out later (steps 4 and 6).
      const refusedLater = await buildReadyOrder(withLiveClient, orgA, INVENTORY_FIXTURES.orgA.organizationId, 2);
      const secondResult = await runCheckout(orgA, second);
      if (!secondResult.ok) throw new Error(`checkout 7 kg failed: ${secondResult.code}`);
      expectZeroDrift(inspectCheckoutMirrors(), 19, 2);

      // 3. The remaining authoritative availability (50 − 19 = 31) is genuinely usable: 30 kg more checks out.
      const third = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 30);
      const thirdResult = await runCheckout(orgB, third);
      if (!thirdResult.ok) throw new Error(`checkout 30 kg failed: ${thirdResult.code}`);
      expectZeroDrift(inspectCheckoutMirrors(), 49, 3);

      // 4. A checkout the database refuses (2 kg wanted, 1 kg left) moves neither mirror.
      const refused = await runCheckout(orgA, refusedLater);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.code).toBe(ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE);
      expectZeroDrift(inspectCheckoutMirrors(), 49, 3);
      const refusedSnapshot = inspectCheckoutOrder(refusedLater);
      expect(refusedSnapshot.reservations).toEqual([]);
      expect(refusedSnapshot.financials).toEqual([]);

      // 5. Expiry releases exactly the 7 kg hold on BOTH mirrors.
      ageCheckoutHold(second);
      const expired = await withLiveClient(orgA, async () => {
        const { ensureHoldFresh } = await import("@/lib/orders/expiry");
        return ensureHoldFresh(second, { now: new Date(Date.now() + 30 * 60_000) }); // test-only seam (DB-OPEN-15)
      });
      if (!expired.ok) throw new Error(`expiry failed: ${expired.code}`);
      expect(expired.data.order.status).toBe("EXPIRED");
      expectZeroDrift(inspectCheckoutMirrors(), 42, 2);

      // 6. The released kilograms are reusable: the previously refused 2 kg order now checks out.
      const retried = await runCheckout(orgA, refusedLater);
      if (!retried.ok) throw new Error(`retry after release failed: ${retried.code}`);
      expectZeroDrift(inspectCheckoutMirrors(), 44, 3);
    },
    300_000
  );
});

describe("DB-OPEN-16 — the FINAL remaining kilograms of a listing cannot be checked out (live characterization, open database defect)", () => {
  it(
    "a checkout that would reserve the whole 50 kg listing is refused by the listing trigger (cannot_publish_empty_listing) — fail-closed: safe mapped code, zero artefacts, zero mirror drift",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const whole = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, CHECKOUT_FIXTURES.offerQuantityKg);

      const viaApplication = await runCheckout(orgB, whole);
      expect(viaApplication.ok).toBe(false);
      if (!viaApplication.ok) expect(viaApplication.code).toBe(ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE);
      expect(JSON.stringify(viaApplication)).not.toMatch(/cannot_publish_empty_listing|P0001/);

      // Pin the cause at the database layer (test-only direct RPC under the owning buyer's session):
      // `checkout_order()` raises NOTHING itself here — `validate_offer_transition` (BEFORE UPDATE on
      // coffee_offers) refuses the reserved-mirror update because a PUBLISHED listing would have
      // quantity − filled − reserved = 0. When the database is fixed this assertion must change.
      const direct = await orgB.rpc("checkout_order", { p_order_id: whole });
      expect(direct.error?.message).toBe("cannot_publish_empty_listing");

      const snapshot = inspectCheckoutOrder(whole);
      expect(snapshot.reservations).toEqual([]);
      expect(snapshot.proformas).toEqual([]);
      expect(snapshot.payments).toEqual([]);
      expect(snapshot.financials).toEqual([]);
      expect(snapshot.order?.status).toBe("CONFIRMED");
      expectZeroDrift(inspectCheckoutMirrors(), 0, 0);
    },
    150_000
  );
});

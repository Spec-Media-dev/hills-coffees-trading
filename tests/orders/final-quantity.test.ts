import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, ageCheckoutHold, inspectCheckoutMirrors, inspectCheckoutOrder, probeDirectFullReservation, resetCheckoutFixtures, signInAsFixture, type CheckoutMirrorInspection } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { buildReadyOrder, installRpcBarrier, liveClientScope } from "./live-helpers";

/**
 * Feature 007 DB blocker run — DB-OPEN-16: a checkout for EXACTLY the listing's remaining quantity must
 * succeed (migration 20260913100000 exempts the reservation-mirror increase from
 * `validate_offer_transition`'s publication check). Proven LIVE on the dedicated 50 kg checkout listing:
 * a 40 kg hold first leaves an authoritative remaining quantity of exactly 10 kg. Reservation/mirror
 * rows are read only through the approved test-only privileged inspection.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const scoped = (globalThis as { __ordersLiveClientScope?: { getStore(): SupabaseClient | undefined } }).__ordersLiveClientScope?.getStore();
    const client = scoped ?? serverClientState.client;
    if (!client) throw new Error("test has no live client installed");
    return client;
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

const LIVE_TIMEOUT_MS = 200_000;
const LISTING_KG = CHECKOUT_FIXTURES.offerQuantityKg; // 50
const FILLER_KG = 40;

function expectMirrors(snapshot: CheckoutMirrorInspection, reservedKg: number): void {
  expect(Number(snapshot.offer.reserved_quantity_kg)).toBe(reservedKg);
  expect(Number(snapshot.position.reserved_quantity_kg)).toBe(reservedKg);
  expect(snapshot.activeReservationItemsForOfferKg).toBe(reservedKg);
  expect(snapshot.activeReservationItemsForPositionKg).toBe(reservedKg);
  expect(Number(snapshot.offer.filled_quantity_kg)).toBe(0);
  expect(Number(snapshot.offer.reserved_quantity_kg)).toBeLessThanOrEqual(Number(snapshot.offer.quantity_kg));
}

function remainingOf(snapshot: CheckoutMirrorInspection): number {
  return Number(snapshot.offer.quantity_kg) - Number(snapshot.offer.filled_quantity_kg) - Number(snapshot.offer.reserved_quantity_kg);
}

/** Holds 40 kg for the filler buyer so that exactly 10 kg remain. */
async function leaveTenKilograms(filler: SupabaseClient): Promise<void> {
  const fillerOrder = await buildReadyOrder(withLiveClient, filler, INVENTORY_FIXTURES.orgA.organizationId, FILLER_KG);
  const held = await runCheckout(filler, fillerOrder);
  if (!held.ok) throw new Error(`filler checkout failed: ${held.code}`);
  const mirrors = inspectCheckoutMirrors();
  expectMirrors(mirrors, FILLER_KG);
  expect(remainingOf(mirrors)).toBe(10);
}

beforeEach(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("DB-OPEN-16 — remaining = 10 kg (live)", () => {
  it(
    "A: request 9 kg → success; 1 kg remains",
    async () => {
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const nine = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 9);
      await leaveTenKilograms(orgA);

      const result = await runCheckout(orgB, nine);
      if (!result.ok) throw new Error(`9 kg checkout failed: ${result.code}`);
      const mirrors = inspectCheckoutMirrors();
      expectMirrors(mirrors, 49);
      expect(remainingOf(mirrors)).toBe(1);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "B/E/F/G/H: request exactly 10 kg → success (one of each artefact, status unchanged, zero title events); retry is idempotent; expiry returns exactly 10 kg once; the released 10 kg is purchasable again; zero drift throughout",
    async () => {
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const ten = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 10);
      await leaveTenKilograms(orgA);
      const before = inspectCheckoutOrder(ten);

      // B — the exact final quantity.
      const result = await runCheckout(orgB, ten);
      if (!result.ok) throw new Error(`exact-final checkout failed: ${result.code}`);
      expect(result.data.idempotentRetry).toBe(false);
      const held = inspectCheckoutOrder(ten);
      expect(held.order?.status).toBe("HOLD");
      expect(held.reservations).toHaveLength(1);
      expect(held.reservationItems).toEqual([{ quantity_kg: 10, offer_id: CHECKOUT_FIXTURES.offerCheckout }]);
      expect(held.proformas).toHaveLength(1);
      expect(held.payments).toHaveLength(1);
      expect(held.payments[0]!.status).toBe("PENDING");
      expect(held.financials).toHaveLength(1);
      expect(held.offer.status).toBe(before.offer.status); // reservation is not fill — no status change
      expect(held.ownershipEventCount).toBe(before.ownershipEventCount); // H
      expect(held.lotOwnershipEventCount).toBe(before.lotOwnershipEventCount);
      const full = inspectCheckoutMirrors();
      expectMirrors(full, LISTING_KG); // G
      expect(remainingOf(full)).toBe(0);

      // E — idempotent retry of the exact-final checkout.
      const retry = await runCheckout(orgB, ten);
      if (!retry.ok) throw new Error(`retry failed: ${retry.code}`);
      expect(retry.data.idempotentRetry).toBe(true);
      expect(retry.data.reservationId).toBe(result.data.reservationId);
      expect(retry.data.proformaId).toBe(result.data.proformaId);
      const afterRetry = inspectCheckoutOrder(ten);
      expect(afterRetry.reservations).toHaveLength(1);
      expect(afterRetry.proformas).toHaveLength(1);
      expect(afterRetry.payments).toHaveLength(1);
      expect(afterRetry.financials).toHaveLength(1);
      expectMirrors(inspectCheckoutMirrors(), LISTING_KG);

      // F — expiry of the final-quantity hold releases exactly 10 kg, once.
      ageCheckoutHold(ten);
      const expired = await withLiveClient(orgB, async () => {
        const { ensureHoldFresh } = await import("@/lib/orders/expiry");
        return ensureHoldFresh(ten, { now: new Date(Date.now() + 30 * 60_000) }); // test-only seam (DB-OPEN-15)
      });
      if (!expired.ok) throw new Error(`expiry failed: ${expired.code}`);
      expect(expired.data.order.status).toBe("EXPIRED");
      expectMirrors(inspectCheckoutMirrors(), FILLER_KG);
      const again = await orgB.rpc("expire_order_hold", { p_order_id: ten });
      expect(again.error).toBeNull();
      expectMirrors(inspectCheckoutMirrors(), FILLER_KG);
      expect(inspectCheckoutOrder(ten).ownershipEventCount).toBe(before.ownershipEventCount);

      // Reuse — the released final 10 kg checks out again for another order.
      const reuse = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 10);
      const reused = await runCheckout(orgB, reuse);
      if (!reused.ok) throw new Error(`reuse checkout failed: ${reused.code}`);
      expectMirrors(inspectCheckoutMirrors(), LISTING_KG);
    },
    300_000
  );

  it(
    "C: request 11 kg → safe availability failure at checkout (and at add time), zero artefacts, mirrors unchanged",
    async () => {
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const eleven = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 11); // built while 50 kg remained
      await leaveTenKilograms(orgA);

      const refused = await runCheckout(orgB, eleven);
      expect(refused).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE });
      const snapshot = inspectCheckoutOrder(eleven);
      expect(snapshot.reservations).toEqual([]);
      expect(snapshot.proformas).toEqual([]);
      expect(snapshot.payments).toEqual([]);
      expect(snapshot.financials).toEqual([]);
      expectMirrors(inspectCheckoutMirrors(), FILLER_KG);

      const addEleven = await withLiveClient(orgB, async () => {
        const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
        const userId = (await orgB.auth.getUser()).data.user!.id;
        const draft = await createDraftOrder({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, userId });
        if (!draft.ok) throw new Error("setup");
        return addOrderItem({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId: draft.data.id, offerId: CHECKOUT_FIXTURES.offerCheckout, quantityKg: 11 });
      });
      expect(addEleven).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE });
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "D: two buyers race (genuinely concurrently) for the final 10 kg → exactly one HOLD, the loser has zero artefacts, reserved = 50, never oversold",
    async () => {
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const contenderA = await buildReadyOrder(withLiveClient, orgA, INVENTORY_FIXTURES.orgA.organizationId, 10);
      const contenderB = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 10);
      await leaveTenKilograms(orgA);

      serverClientState.client = null;
      vi.resetModules();
      const { executeCheckout } = await import("@/lib/orders/checkout");
      const scope = liveClientScope();
      const barrier = installRpcBarrier([orgA, orgB], "checkout_order", 2);
      let results;
      try {
        const settled = await Promise.allSettled([scope.run(orgA, () => executeCheckout(contenderA)), scope.run(orgB, () => executeCheckout(contenderB))]);
        results = settled.map((outcome) => {
          if (outcome.status === "rejected") throw outcome.reason;
          return outcome.value;
        });
      } finally {
        barrier.restore();
      }
      expect(barrier.parties).toHaveLength(2);
      expect(barrier.allInFlightTogether()).toBe(true);

      const winners = results.filter((result) => result.ok);
      const losers = results.filter((result) => !result.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toEqual([{ ok: false, code: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE }]);
      const loserOrder = results[0]!.ok ? contenderB : contenderA;
      const winnerOrder = results[0]!.ok ? contenderA : contenderB;

      const winner = inspectCheckoutOrder(winnerOrder);
      expect(winner.reservations).toHaveLength(1);
      expect(winner.proformas).toHaveLength(1);
      expect(winner.payments).toHaveLength(1);
      expect(winner.financials).toHaveLength(1);
      const loser = inspectCheckoutOrder(loserOrder);
      expect(loser.reservations).toEqual([]);
      expect(loser.proformas).toEqual([]);
      expect(loser.payments).toEqual([]);
      expect(loser.financials).toEqual([]);
      expect(loser.order?.status).toBe("CONFIRMED");

      const mirrors = inspectCheckoutMirrors();
      expectMirrors(mirrors, LISTING_KG);
      expect(mirrors.activeReservationCountForOffer).toBe(2);
      expect(remainingOf(mirrors)).toBe(0);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("DB-OPEN-16 hardening — only checkout_order() can create the zero-remaining reservation state (live)", () => {
  it(
    "a DIRECT coffee_offers UPDATE with the exact reservation-only shape but no checkout marker is refused cannot_publish_empty_listing — even for the service role that bypasses RLS — from an empty listing and from a 40 kg-reserved one",
    async () => {
      const fromEmpty = probeDirectFullReservation();
      expect(fromEmpty).toMatchObject({ refused: true, message: "cannot_publish_empty_listing", restored: false, reservedBefore: 0, attemptedReserved: LISTING_KG });
      expectMirrors(inspectCheckoutMirrors(), 0);

      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      await leaveTenKilograms(orgA);
      const fromPartial = probeDirectFullReservation();
      expect(fromPartial).toMatchObject({ refused: true, message: "cannot_publish_empty_listing", restored: false, reservedBefore: FILLER_KG, attemptedReserved: LISTING_KG });
      expectMirrors(inspectCheckoutMirrors(), FILLER_KG);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("DB-OPEN-16 hardening — no client-controlled path can set the checkout marker (live)", () => {
  it(
    "set_config is not callable through the API by an authenticated or anonymous session (pg_catalog is not exposed), so app.checkout_reservation can only be set inside checkout_order()",
    async () => {
      const { createAnonymousFixtureClient } = await import("@/tests/auth/fixture-session");
      const member = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const anonymous = createAnonymousFixtureClient();
      for (const [label, session] of [["authenticated", member], ["anonymous", anonymous]] as const) {
        const attempt = await session.rpc("set_config", { setting_name: "app.checkout_reservation", new_value: "true", is_local: true });
        expect(attempt.error, label).not.toBeNull();
        expect(attempt.data, label).toBeNull();
      }
      // Even a marker attempt followed by a direct reservation write in separate requests stays refused
      // (each API request is its own transaction; the marker is transaction-local).
      const probe = probeDirectFullReservation();
      expect(probe).toMatchObject({ refused: true, message: "cannot_publish_empty_listing", restored: false });
      expectMirrors(inspectCheckoutMirrors(), 0);
    },
    LIVE_TIMEOUT_MS
  );
});

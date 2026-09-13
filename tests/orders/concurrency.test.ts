import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, inspectCheckoutMirrors, inspectCheckoutOrder, resetCheckoutFixtures, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import type { CheckoutResult } from "@/lib/orders/validation";

import { buildReadyOrder, installRpcBarrier, liveClientScope } from "./live-helpers";

/**
 * Feature 007 RUN D — T019 (AC-02 / SC-002 / PS3): RELEASE-BLOCKING double-sell protection, proven
 * LIVE against the real `checkout_order()` function.
 *
 * FIXTURE: the dedicated checkout listing (`CHECKOUT_FIXTURES.offerCheckout`, a 50 kg PUBLISHED
 * HILLS listing backed by its own 1000 kg inventory position — the LISTING is the binding
 * constraint). `resetCheckoutFixtures()` (approved test-only privileged setup) runs before EVERY
 * test, so each test starts from reserved = 0 and depends on no other test.
 *
 * GENUINE CONCURRENCY (never `await a(); await b();`):
 *   1. both flows are started in the SAME synchronous turn (`Promise.allSettled([...])`), each inside
 *      its own `liveClientScope().run(client, …)` so two sessions run side by side;
 *   2. an explicit RPC BARRIER (`installRpcBarrier`) holds each flow's `checkout_order` call until
 *      BOTH have arrived, then releases both onto the network in the same microtask turn — neither
 *      request can start after the other has finished;
 *   3. the barrier records dispatch/settle instants and the test asserts every request was
 *      dispatched before ANY response arrived (`allInFlightTogether()`) — both transactions were in
 *      flight against the database at the same time. A flow that never reaches its RPC makes the
 *      barrier reject loudly instead of silently degrading into a sequential test.
 * The database then decides: `checkout_order()` locks the listing row `FOR UPDATE` before checking
 * `quantity - filled - reserved`, so exactly one transaction can take the contested kilograms.
 *
 * Reservation/proforma/payment/financial rows are inspected ONLY through the approved test-only
 * privileged fixture read (`inspectCheckoutOrder`/`inspectCheckoutMirrors`) — never member runtime code.
 *
 * Scoped timeout: each test builds two genuinely checkout-ready orders through production paths
 * (draft, item, shipment plan, request) plus the warehouse fixture's READY step and several
 * privileged inspection subprocesses — real network work, not waiting on the race itself.
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

const LIVE_TIMEOUT_MS = 180_000;
const RAW_LEAK = /listing_inventory_changed|seller_inventory_changed|forbidden|reservation_expired|P0001|SQLSTATE|raise|inventory_reservations|coffee_offers|checkout_order/i;

type Contender = { client: SupabaseClient; orderId: string };

/** Runs every checkout genuinely concurrently behind the RPC barrier; results are in contender order. */
async function raceCheckouts(contenders: readonly Contender[]) {
  serverClientState.client = null;
  vi.resetModules();
  const { executeCheckout } = await import("@/lib/orders/checkout");
  const scope = liveClientScope();
  const barrier = installRpcBarrier(
    contenders.map((contender) => contender.client),
    "checkout_order",
    contenders.length
  );
  try {
    const settled = await Promise.allSettled(contenders.map((contender) => scope.run(contender.client, () => executeCheckout(contender.orderId))));
    const results = settled.map((outcome) => {
      if (outcome.status === "rejected") throw outcome.reason;
      return outcome.value;
    });
    return { results, barrier };
  } finally {
    barrier.restore();
  }
}

function expectZeroTransactionalArtifacts(orderId: string, correlationBefore: string | null): void {
  const loser = inspectCheckoutOrder(orderId);
  expect(loser.reservations).toEqual([]);
  expect(loser.reservationItems).toEqual([]);
  expect(loser.proformas).toEqual([]);
  expect(loser.payments).toEqual([]);
  expect(loser.financials).toEqual([]);
  // Commercial state: the buyer's own confirm write (a separate, earlier statement) stands; every
  // effect of the refused checkout transaction rolled back — no HOLD, no hold window, no correlation
  // id assigned by the function, no CONFIRMED->HOLD history row.
  expect(loser.order?.status).toBe("CONFIRMED");
  expect(loser.order?.hold_started_at).toBeNull();
  expect(loser.order?.hold_expires_at).toBeNull();
  expect(loser.order?.correlation_id ?? null).toBe(correlationBefore);
  expect(loser.statusHistory.map((row) => `${row.old_status}->${row.new_status}`)).toEqual(["DRAFT->CONFIRMED"]);
}

function expectExactlyOneOfEachArtifact(orderId: string, result: CheckoutResult, quantityKg: number) {
  const winner = inspectCheckoutOrder(orderId);
  expect(winner.reservations).toHaveLength(1);
  expect(winner.reservations[0]!.id).toBe(result.reservationId);
  expect(winner.reservations[0]!.status).toBe("ACTIVE");
  expect(winner.reservationItems).toEqual([{ quantity_kg: quantityKg, offer_id: CHECKOUT_FIXTURES.offerCheckout }]);
  expect(winner.proformas).toHaveLength(1);
  expect(winner.proformas[0]!.id).toBe(result.proformaId);
  expect(winner.payments).toHaveLength(1);
  expect(winner.payments[0]!.status).toBe("PENDING");
  expect(Number(winner.payments[0]!.amount)).toBe(result.buyerTotal);
  expect(winner.financials).toHaveLength(1);
  expect(Number(winner.financials[0]!.buyer_total_amount)).toBe(result.buyerTotal);
  expect(winner.order?.status).toBe("HOLD");
  expect(winner.statusHistory.map((row) => `${row.old_status}->${row.new_status}`)).toEqual(["DRAFT->CONFIRMED", "CONFIRMED->HOLD"]);
  return winner;
}

function splitWinnerLoser(results: ActionFeedbackResult<CheckoutResult>[]) {
  const winners = results.filter((result) => result.ok);
  const losers = results.filter((result) => !result.ok);
  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(1);
  const winnerIndex = results.findIndex((result) => result.ok);
  const winner = results[winnerIndex]!;
  const loser = results[1 - winnerIndex]!;
  if (!winner.ok || loser.ok) throw new Error("expected exactly one winner and one loser");
  return { winnerIndex, winner: winner.data, loserCode: loser.code, loser };
}

beforeEach(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("T019 — two genuinely concurrent checkouts against quantity that satisfies only one (live, release-blocking)", () => {
  it(
    "two DIFFERENT buyer organizations each want 30 kg of a 50 kg listing: exactly one HOLD, one safe availability refusal, zero loser artefacts, reserved = 30 on both mirrors, zero ownership events",
    async () => {
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orderA = await buildReadyOrder(withLiveClient, orgA, INVENTORY_FIXTURES.orgA.organizationId, 30);
      const orderB = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 30);

      const mirrorsBefore = inspectCheckoutMirrors();
      const available = Number(mirrorsBefore.offer.quantity_kg) - Number(mirrorsBefore.offer.filled_quantity_kg) - Number(mirrorsBefore.offer.reserved_quantity_kg);
      expect(available).toBe(CHECKOUT_FIXTURES.offerQuantityKg); // 50 kg genuinely available
      expect(30 + 30).toBeGreaterThan(available); // A + B cannot both be satisfied…
      expect(30).toBeLessThanOrEqual(available); // …but either one alone can
      const beforeA = inspectCheckoutOrder(orderA);
      const beforeB = inspectCheckoutOrder(orderB);

      const { results, barrier } = await raceCheckouts([
        { client: orgA, orderId: orderA },
        { client: orgB, orderId: orderB },
      ]);

      // Genuine concurrency proof: both RPCs reached the barrier and were in flight together.
      expect(barrier.parties).toHaveLength(2);
      expect(barrier.allInFlightTogether()).toBe(true);

      const { winnerIndex, winner, loserCode, loser } = splitWinnerLoser(results);
      expect(winner.idempotentRetry).toBe(false);
      expect(loserCode).toBe(ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE);
      expect(JSON.stringify(loser)).not.toMatch(RAW_LEAK);

      const winnerSnapshot = expectExactlyOneOfEachArtifact(winnerIndex === 0 ? orderA : orderB, winner, 30);
      expectZeroTransactionalArtifacts(winnerIndex === 0 ? orderB : orderA, (winnerIndex === 0 ? beforeB : beforeA).order?.correlation_id ?? null);

      const mirrorsAfter = inspectCheckoutMirrors();
      expect(Number(mirrorsAfter.offer.reserved_quantity_kg)).toBe(30);
      expect(Number(mirrorsAfter.position.reserved_quantity_kg)).toBe(30);
      expect(mirrorsAfter.activeReservationItemsForOfferKg).toBe(30);
      expect(mirrorsAfter.activeReservationItemsForPositionKg).toBe(30);
      expect(mirrorsAfter.activeReservationCountForOffer).toBe(1);
      expect(Number(mirrorsAfter.offer.reserved_quantity_kg) + Number(mirrorsAfter.offer.filled_quantity_kg)).toBeLessThanOrEqual(Number(mirrorsAfter.offer.quantity_kg));
      expect(Number(mirrorsAfter.offer.filled_quantity_kg)).toBe(0);

      expect(winnerSnapshot.ownershipEventCount).toBe(beforeA.ownershipEventCount);
      expect(winnerSnapshot.lotOwnershipEventCount).toBe(beforeA.lotOwnershipEventCount);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "the SAME buyer organization racing two of its own 30 kg orders from two sessions: exactly one winner, the loser leaves nothing, no over-reservation",
    async () => {
      const tabOne = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const tabTwo = await signInAsFixture(INVENTORY_FIXTURES.orgB.email); // an independent session for the same member
      const first = await buildReadyOrder(withLiveClient, tabOne, INVENTORY_FIXTURES.orgB.organizationId, 30);
      const second = await buildReadyOrder(withLiveClient, tabOne, INVENTORY_FIXTURES.orgB.organizationId, 30);
      const beforeFirst = inspectCheckoutOrder(first);
      const beforeSecond = inspectCheckoutOrder(second);

      const { results, barrier } = await raceCheckouts([
        { client: tabOne, orderId: first },
        { client: tabTwo, orderId: second },
      ]);
      expect(barrier.parties).toHaveLength(2);
      expect(barrier.allInFlightTogether()).toBe(true);

      const { winnerIndex, winner, loserCode, loser } = splitWinnerLoser(results);
      expect(loserCode).toBe(ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE);
      expect(JSON.stringify(loser)).not.toMatch(RAW_LEAK);

      expectExactlyOneOfEachArtifact(winnerIndex === 0 ? first : second, winner, 30);
      expectZeroTransactionalArtifacts(winnerIndex === 0 ? second : first, (winnerIndex === 0 ? beforeSecond : beforeFirst).order?.correlation_id ?? null);

      const mirrors = inspectCheckoutMirrors();
      expect(Number(mirrors.offer.reserved_quantity_kg)).toBe(30);
      expect(Number(mirrors.position.reserved_quantity_kg)).toBe(30);
      expect(mirrors.activeReservationItemsForOfferKg).toBe(30);
      expect(mirrors.activeReservationCountForOffer).toBe(1);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "CONTROL — two concurrent 20 kg checkouts that DO fit together both succeed and reserve exactly 40 (no lost update; the harness can observe two winners)",
    async () => {
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orderA = await buildReadyOrder(withLiveClient, orgA, INVENTORY_FIXTURES.orgA.organizationId, 20);
      const orderB = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 20);

      const { results, barrier } = await raceCheckouts([
        { client: orgA, orderId: orderA },
        { client: orgB, orderId: orderB },
      ]);
      expect(barrier.parties).toHaveLength(2);
      expect(barrier.allInFlightTogether()).toBe(true);

      const [resultA, resultB] = results;
      if (!resultA?.ok || !resultB?.ok) throw new Error(`both checkouts should succeed: ${JSON.stringify(results)}`);
      expect(resultA.data.reservationId).not.toBe(resultB.data.reservationId);
      expectExactlyOneOfEachArtifact(orderA, resultA.data, 20);
      expectExactlyOneOfEachArtifact(orderB, resultB.data, 20);

      const mirrors = inspectCheckoutMirrors();
      expect(Number(mirrors.offer.reserved_quantity_kg)).toBe(40);
      expect(Number(mirrors.position.reserved_quantity_kg)).toBe(40);
      expect(mirrors.activeReservationItemsForOfferKg).toBe(40);
      expect(mirrors.activeReservationCountForOffer).toBe(2);
    },
    LIVE_TIMEOUT_MS
  );
});

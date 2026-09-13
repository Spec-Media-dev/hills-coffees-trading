import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, inspectCheckoutMirrors, inspectCheckoutOrder, resetCheckoutFixtures, signInAsFixture, type CheckoutInspection } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { buildReadyOrder, liveClientScope } from "./live-helpers";

/**
 * Feature 007 RUN D — T020 (FR-003 / SC-003 / PS2): duplicate submission and post-failure retry of
 * the SAME checkout intent produce exactly ONE reservation, proforma, PENDING payment and financial
 * snapshot — proven LIVE through `executeCheckout` (the sole `checkout_order()` caller) against the
 * real function.
 *
 * IDEMPOTENCY HONESTY (what actually deduplicates):
 *   - `checkout_order()` (live body) does NOT read `orders.idempotency_key`. Its duplicate safety is
 *     its OWN retry branch: it locks the order `FOR UPDATE`, and an order already in
 *     `HOLD`/`PAYMENT_PROOF_SUBMITTED`/`PAYMENT_UNDER_REVIEW` with an ACTIVE reservation returns the
 *     existing reservation/proforma/total with `idempotent_retry: true` — no second insert. A direct
 *     RPC with no key involved at all is deduplicated the same way (proven below).
 *   - `orders.idempotency_key` is the application's server-generated, never-client-supplied,
 *     never-rotated intent marker (SEC-005). This file proves it is persisted once and never changes
 *     across retries, including concurrent double submits — using the `audit_logs` history of every
 *     persisted version of the order row (`inspectCheckoutOrder().idempotencyKeyHistory`, test-only
 *     privileged read) rather than a single before/after snapshot.
 *
 * Every test resets the dedicated checkout listing first (approved test-only privileged setup) and
 * builds its own orders, so no test depends on another. Scoped timeout: real order construction +
 * warehouse READY + privileged inspection subprocesses.
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

function countCheckoutRpcCalls(client: SupabaseClient) {
  const spy = vi.spyOn(client, "rpc");
  return {
    count: () => spy.mock.calls.filter(([fn]) => fn === "checkout_order").length,
    restore: () => spy.mockRestore(),
  };
}

const LIVE_TIMEOUT_MS = 150_000;
const QUANTITY_KG = 5;

/** The exact single-artefact postcondition every retry path must leave behind. */
function expectSingleCheckoutArtifacts(snapshot: CheckoutInspection, expected: { reservationId: string; proformaId: string; buyerTotal: number }) {
  expect(snapshot.reservations).toHaveLength(1);
  expect(snapshot.reservations[0]!.id).toBe(expected.reservationId);
  expect(snapshot.reservations[0]!.status).toBe("ACTIVE");
  expect(snapshot.reservationItems).toEqual([{ quantity_kg: QUANTITY_KG, offer_id: CHECKOUT_FIXTURES.offerCheckout }]);
  expect(snapshot.proformas).toHaveLength(1);
  expect(snapshot.proformas[0]!.id).toBe(expected.proformaId);
  expect(snapshot.payments).toHaveLength(1);
  expect(snapshot.payments[0]!.status).toBe("PENDING");
  expect(Number(snapshot.payments[0]!.amount)).toBe(expected.buyerTotal);
  expect(snapshot.financials).toHaveLength(1);
  expect(Number(snapshot.financials[0]!.buyer_total_amount)).toBe(expected.buyerTotal);
  expect(snapshot.order?.status).toBe("HOLD");
  expect(snapshot.statusHistory.map((row) => `${row.old_status}->${row.new_status}`)).toEqual(["DRAFT->CONFIRMED", "CONFIRMED->HOLD"]);
  // The server-owned intent marker: exactly one value ever persisted, and it is the current one.
  expect(snapshot.idempotencyKeyHistory).toHaveLength(1);
  expect(snapshot.order?.idempotency_key).toBe(snapshot.idempotencyKeyHistory[0]);
  expect(Number(snapshot.offer.reserved_quantity_kg)).toBe(QUANTITY_KG);
  expect(Number(snapshot.position.reserved_quantity_kg)).toBe(QUANTITY_KG);
}

beforeEach(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("T020 — duplicate submission hits checkout_order()'s own retry branch (live)", () => {
  it(
    "a second executeCheckout on the same order returns idempotent_retry=true with the SAME reservation/proforma/total/hold window, and leaves exactly 1 reservation, 1 proforma, 1 PENDING payment, 1 financial snapshot",
    async () => {
      const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orderId = await buildReadyOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, QUANTITY_KG);
      const ownershipBefore = inspectCheckoutOrder(orderId);

      const firstCalls = countCheckoutRpcCalls(client);
      const first = await runCheckout(client, orderId);
      expect(firstCalls.count()).toBe(1);
      firstCalls.restore();
      if (!first.ok) throw new Error(`first checkout failed: ${first.code}`);
      expect(first.data.idempotentRetry).toBe(false);
      const afterFirst = inspectCheckoutOrder(orderId);
      expectSingleCheckoutArtifacts(afterFirst, { reservationId: first.data.reservationId!, proformaId: first.data.proformaId!, buyerTotal: first.data.buyerTotal! });

      const secondCalls = countCheckoutRpcCalls(client);
      const second = await runCheckout(client, orderId);
      expect(secondCalls.count()).toBe(1); // the function itself was exercised — not an application short-circuit
      secondCalls.restore();
      if (!second.ok) throw new Error(`retry failed: ${second.code}`);
      expect(second.data.idempotentRetry).toBe(true);
      expect(second.data.reservationId).toBe(first.data.reservationId);
      expect(second.data.proformaId).toBe(first.data.proformaId);
      expect(second.data.buyerTotal).toBe(first.data.buyerTotal);
      expect(second.data.correlationId).toBe(first.data.correlationId);
      expect(new Date(second.data.holdExpiresAt!).getTime()).toBe(new Date(first.data.holdExpiresAt!).getTime());

      const afterSecond = inspectCheckoutOrder(orderId);
      expectSingleCheckoutArtifacts(afterSecond, { reservationId: first.data.reservationId!, proformaId: first.data.proformaId!, buyerTotal: first.data.buyerTotal! });
      // Nothing was recomputed or re-issued on the retry: same snapshot instant, same payment row, same key, same hold window.
      expect(afterSecond.financials[0]!.calculated_at).toBe(afterFirst.financials[0]!.calculated_at);
      expect(afterSecond.payments[0]!.id).toBe(afterFirst.payments[0]!.id);
      expect(afterSecond.order?.idempotency_key).toBe(afterFirst.order?.idempotency_key);
      expect(afterSecond.order?.hold_expires_at).toBe(afterFirst.order?.hold_expires_at);
      expect(afterSecond.ownershipEventCount).toBe(ownershipBefore.ownershipEventCount);
      expect(afterSecond.lotOwnershipEventCount).toBe(ownershipBefore.lotOwnershipEventCount);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "a CONCURRENT double submit (two sessions, same order, started in the same turn): both callers get the same reservation/proforma, exactly one artefact of each, and the intent key is persisted once and never rotated",
    async () => {
      const tabOne = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const tabTwo = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orderId = await buildReadyOrder(withLiveClient, tabOne, INVENTORY_FIXTURES.orgB.organizationId, QUANTITY_KG);

      serverClientState.client = null;
      vi.resetModules();
      const { executeCheckout } = await import("@/lib/orders/checkout");
      const scope = liveClientScope();
      const settled = await Promise.allSettled([scope.run(tabOne, () => executeCheckout(orderId)), scope.run(tabTwo, () => executeCheckout(orderId))]);
      const results = settled.map((outcome) => {
        if (outcome.status === "rejected") throw outcome.reason;
        return outcome.value;
      });

      const snapshot = inspectCheckoutOrder(orderId);
      const [one, two] = results;
      if (!one?.ok || !two?.ok) throw new Error(`both submissions must resolve to the single checkout: ${JSON.stringify(results)}`);
      expect(one.data.reservationId).toBe(two.data.reservationId);
      expect(one.data.proformaId).toBe(two.data.proformaId);
      expect(one.data.buyerTotal).toBe(two.data.buyerTotal);
      // Exactly one of the two performed the checkout; the other was answered by the function's retry branch.
      expect([one.data.idempotentRetry, two.data.idempotentRetry].sort()).toEqual([false, true]);
      expectSingleCheckoutArtifacts(snapshot, { reservationId: one.data.reservationId!, proformaId: one.data.proformaId!, buyerTotal: one.data.buyerTotal! });
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T020 — post-failure retry: the transaction committed but the caller never saw the result (live)", () => {
  it(
    "a simulated transport loss AFTER checkout_order() committed returns a safe generic failure; retrying the same intent reuses the committed reservation/proforma/payment (idempotent_retry=true) and creates nothing new",
    async () => {
      const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orderId = await buildReadyOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, QUANTITY_KG);

      // Transport-loss simulation: the REAL RPC is executed and awaited (so the database genuinely
      // commits), then its response is discarded and replaced by a network-style error — exactly what
      // a dropped connection after commit looks like to the caller. `checkout_order()` is not modified.
      let committedResponse: unknown = null;
      const original = client.rpc.bind(client) as (name: string, args?: unknown, options?: unknown) => PromiseLike<unknown>;
      Object.defineProperty(client, "rpc", {
        configurable: true,
        writable: true,
        value: async (name: string, args?: unknown, options?: unknown) => {
          if (name !== "checkout_order") return original(name, args, options);
          committedResponse = await original(name, args, options);
          return { data: null, error: { message: "TypeError: fetch failed (connection reset)", code: "" }, status: 0, statusText: "" };
        },
      });
      let lost;
      try {
        lost = await runCheckout(client, orderId);
      } finally {
        delete (client as unknown as { rpc?: unknown }).rpc;
      }

      expect(lost.ok).toBe(false);
      if (!lost.ok) expect(lost.code).toBe(ACTION_FEEDBACK.ORDER_SAVE_FAILED);
      expect(JSON.stringify(lost)).not.toMatch(/fetch failed|connection reset|TypeError/);
      // The discarded response really was a successful commit.
      const discarded = committedResponse as { data: { reservation_id: string; proforma_id: string; buyer_total: number; idempotent_retry: boolean }; error: unknown };
      expect(discarded.error).toBeNull();
      expect(discarded.data.idempotent_retry).toBe(false);

      const afterLoss = inspectCheckoutOrder(orderId);
      expectSingleCheckoutArtifacts(afterLoss, { reservationId: discarded.data.reservation_id, proformaId: discarded.data.proforma_id, buyerTotal: Number(discarded.data.buyer_total) });

      const retry = await runCheckout(client, orderId);
      if (!retry.ok) throw new Error(`retry after transport loss failed: ${retry.code}`);
      expect(retry.data.idempotentRetry).toBe(true);
      expect(retry.data.reservationId).toBe(discarded.data.reservation_id);
      expect(retry.data.proformaId).toBe(discarded.data.proforma_id);
      expect(retry.data.buyerTotal).toBe(Number(discarded.data.buyer_total));

      const afterRetry = inspectCheckoutOrder(orderId);
      expectSingleCheckoutArtifacts(afterRetry, { reservationId: discarded.data.reservation_id, proformaId: discarded.data.proforma_id, buyerTotal: Number(discarded.data.buyer_total) });
      expect(afterRetry.financials[0]!.calculated_at).toBe(afterLoss.financials[0]!.calculated_at);
      expect(afterRetry.order?.idempotency_key).toBe(afterLoss.order?.idempotency_key);
      expect(afterRetry.ownershipEventCount).toBe(afterLoss.ownershipEventCount);
      expect(inspectCheckoutMirrors().activeReservationItemsForOfferKg).toBe(QUANTITY_KG);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T020 — what actually deduplicates: the function's own retry branch, not the key (live + live-baseline evidence)", () => {
  it(
    "a DIRECT checkout_order() RPC by the owning buyer (test-only, no application code, no key involved) on an order already in HOLD returns idempotent_retry=true with the existing ids and creates nothing",
    async () => {
      const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orderId = await buildReadyOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, QUANTITY_KG);
      const first = await runCheckout(client, orderId);
      if (!first.ok) throw new Error(`checkout failed: ${first.code}`);

      const direct = await client.rpc("checkout_order", { p_order_id: orderId });
      const directAgain = await client.rpc("checkout_order", { p_order_id: orderId });
      for (const response of [direct, directAgain]) {
        expect(response.error).toBeNull();
        const data = response.data as { reservation_id: string; proforma_id: string; idempotent_retry: boolean };
        expect(data.idempotent_retry).toBe(true);
        expect(data.reservation_id).toBe(first.data.reservationId);
        expect(data.proforma_id).toBe(first.data.proformaId);
      }

      expectSingleCheckoutArtifacts(inspectCheckoutOrder(orderId), { reservationId: first.data.reservationId!, proformaId: first.data.proformaId!, buyerTotal: first.data.buyerTotal! });
    },
    LIVE_TIMEOUT_MS
  );

  it("the database baseline's checkout_order() body keys its retry on status + ACTIVE reservation and never reads orders.idempotency_key (so the key is documented as the application's intent marker, not the dedupe mechanism)", async () => {
    const { readFileSync } = await import("node:fs");
    const report = JSON.parse(JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"))[0].database_schema_report) as { functions: Array<{ function_name: string; definition: string }> };
    const body = report.functions.find((fn) => fn.function_name === "checkout_order")!.definition;
    expect(body).not.toMatch(/idempotency_key/);
    expect(body).toMatch(/Idempotent retry/);
    expect(body).toMatch(/status = 'ACTIVE'/);
    expect(body).toMatch(/'idempotent_retry',\s*true/);
    expect(body).toMatch(/for update/i);

    const checkoutSource = readFileSync("lib/orders/checkout.ts", "utf8");
    expect(checkoutSource).toMatch(/does not read `idempotency_key`/);
  });
});

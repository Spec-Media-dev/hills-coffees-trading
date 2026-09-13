import { AsyncLocalStorage } from "node:async_hooks";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CHECKOUT_FIXTURES, FOUNDATION_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 007 RUN B/C — shared LIVE test helpers. Each file owns its own `vi.mock("@/lib/supabase/
 * server")` + `withLiveClient` (Vitest hoists mocks per file), so these helpers take that wrapper as
 * a parameter rather than importing production modules at the top level.
 */
export type WithLiveClient = <T>(client: SupabaseClient, run: () => Promise<T>) => Promise<T>;

/**
 * Builds a DRAFT order with one item + a REQUESTED shipment plan through RUN A's own production paths.
 * `plannedKg` (RUN D, T025) plans a DIFFERENT quantity than ordered, to reach the database's own
 * `shipment_quantities_do_not_match_order` refusal; it defaults to the ordered quantity.
 */
export async function buildRequestedOrder(withLiveClient: WithLiveClient, client: SupabaseClient, organizationId: string, quantityKg: number, plannedKg: number = quantityKg): Promise<{ orderId: string; shipmentId: string }> {
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
    itemForm.set("plannedQuantityKg", String(plannedKg));
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

/**
 * Feature 007 RUN D — per-flow client scoping for GENUINELY CONCURRENT live flows. Each test file's
 * `vi.mock("@/lib/supabase/server")` returns `liveClientScope().getStore()` when a flow runs inside
 * `liveClientScope().run(client, …)`, so two buyers' `executeCheckout`/`ensureHoldFresh` calls can
 * run at the same time without sharing the file's single "installed" client. Stored on
 * `globalThis` so the mock factory and this module see the same instance across
 * `vi.resetModules()`.
 */
export function liveClientScope(): AsyncLocalStorage<SupabaseClient> {
  const holder = globalThis as { __ordersLiveClientScope?: AsyncLocalStorage<SupabaseClient> };
  return (holder.__ordersLiveClientScope ??= new AsyncLocalStorage<SupabaseClient>());
}

export type BarrierParty = {
  /** Arrival order at the barrier (0-based). */
  index: number;
  /** `performance.now()` when this party's RPC reached the barrier. */
  arrivedAt: number;
  /** `performance.now()` when the barrier released this party's RPC onto the network. */
  dispatchedAt: number;
  /** `performance.now()` when this party's RPC response was received (null until then). */
  settledAt: number | null;
};

export type RpcBarrier = {
  parties: BarrierParty[];
  /** Removes the interception from every client (idempotent). */
  restore: () => void;
  /**
   * True when every party was DISPATCHED before ANY party's response arrived — i.e. all requests
   * were simultaneously in flight against the database. Structural proof the test did not
   * serialize them.
   */
  allInFlightTogether: () => boolean;
};

/**
 * Feature 007 RUN D — an explicit synchronization BARRIER for concurrency tests (no sleeps). Every
 * `client.rpc(fn, …)` call for the named function is held at the barrier until `parties` calls have
 * arrived (from any of the given clients), then ALL are released onto the network in the same
 * microtask turn. The real RPC is executed unchanged — nothing is stubbed, the database decides.
 *
 * If fewer than `parties` calls ever arrive (e.g. one flow refused before its RPC), the held calls
 * REJECT after `timeoutMs` with an explicit error, so a mis-built race fails loudly instead of
 * silently degrading into a sequential test.
 */
export function installRpcBarrier(clients: readonly SupabaseClient[], fn: string, parties: number, timeoutMs = 20_000): RpcBarrier {
  const recorded: BarrierParty[] = [];
  let release!: () => void;
  let fail!: (error: Error) => void;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  // Avoid an unhandled-rejection warning when the gate fails and a party already observed it.
  gate.catch(() => undefined);
  const timer = setTimeout(() => fail(new Error(`rpc barrier for ${fn}: only ${recorded.length}/${parties} parties arrived`)), timeoutMs);

  const unique = [...new Set(clients)];
  const restores = unique.map((client) => {
    const original = client.rpc.bind(client) as (name: string, args?: unknown, options?: unknown) => PromiseLike<unknown>;
    const intercepted = (name: string, args?: unknown, options?: unknown) => {
      if (name !== fn) return original(name, args, options);
      const party: BarrierParty = { index: recorded.length, arrivedAt: performance.now(), dispatchedAt: Number.NaN, settledAt: null };
      recorded.push(party);
      if (recorded.length === parties) {
        clearTimeout(timer);
        release();
      }
      return gate.then(async () => {
        party.dispatchedAt = performance.now();
        const result = await original(name, args, options);
        party.settledAt = performance.now();
        return result;
      });
    };
    Object.defineProperty(client, "rpc", { value: intercepted, configurable: true, writable: true });
    return () => {
      delete (client as unknown as { rpc?: unknown }).rpc;
    };
  });

  return {
    parties: recorded,
    restore: () => {
      clearTimeout(timer);
      for (const undo of restores.splice(0)) undo();
    },
    allInFlightTogether: () => {
      if (recorded.length !== parties || recorded.some((party) => party.settledAt === null || Number.isNaN(party.dispatchedAt))) return false;
      const lastDispatch = Math.max(...recorded.map((party) => party.dispatchedAt));
      const firstSettle = Math.min(...recorded.map((party) => party.settledAt as number));
      return lastDispatch <= firstSettle;
    },
  };
}

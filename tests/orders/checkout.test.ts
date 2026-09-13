import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  CHECKOUT_FIXTURES,
  FOUNDATION_FIXTURES,
  INVENTORY_FIXTURES,
  PHASE89_FIXTURES,
  createAnonymousFixtureClient,
  inspectCheckoutOrder,
  resetCheckoutFixtures,
  setSuspendedOrganizationStatus,
  signInAsFixture,
} from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN B (T008/T010/T011 + T006 re-verification) — LIVE proofs of `lib/orders/checkout.ts`
 * against the real test database and the real `checkout_order()` function.
 *
 * PRECONDITION HONESTY: `assert_order_checkout_ready` requires an `order_shipments` row in
 * `READY`/`RESERVED` — a transition only `is_warehouse_operator()` may perform
 * (`validate_shipment_transition`). This file establishes that precondition through the repository's
 * EXISTING `warehouse-admin` fixture identity (a real `platform_admins.role = 'WAREHOUSE'` session,
 * signed in normally, moving the shipment `REQUESTED -> READY` under ordinary RLS + trigger authority
 * — NOT service-role, NOT a manual flag). That proves (A) `checkout_order()`'s behaviour given an
 * authoritative valid precondition; it does NOT claim (B) Feature 009's warehouse workflow/UI, which
 * that feature must prove itself.
 *
 * `resetCheckoutFixtures()`/`inspectCheckoutOrder()` are the approved TEST-ONLY privileged
 * setup/read convention (same as `setSuspendedOrganizationStatus`); no runtime code reads
 * `inventory_reservations`.
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

/** Builds a DRAFT order with one item + a REQUESTED shipment plan through RUN A's own production paths. */
async function buildRequestedOrder(client: SupabaseClient, organizationId: string, quantityKg: number): Promise<{ orderId: string; shipmentId: string }> {
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
    itemForm.set("plannedQuantityKg", String(quantityKg));
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

/** The Feature-009-owned step, performed by the REAL warehouse-operator fixture under ordinary RLS/trigger authority. */
async function markShipmentReadyAsWarehouse(shipmentId: string): Promise<void> {
  const warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  const { error } = await warehouse.from("order_shipments").update({ status: "READY" }).eq("id", shipmentId);
  if (error) throw new Error(`warehouse READY transition refused: ${error.message}`);
}

async function buildReadyOrder(client: SupabaseClient, organizationId: string, quantityKg: number): Promise<string> {
  const { orderId, shipmentId } = await buildRequestedOrder(client, organizationId, quantityKg);
  await markShipmentReadyAsWarehouse(shipmentId);
  return orderId;
}

function countCheckoutRpcCalls(client: SupabaseClient) {
  const spy = vi.spyOn(client, "rpc");
  return () => spy.mock.calls.filter(([fn]) => fn === "checkout_order").length;
}

beforeAll(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("T008 — executeCheckout refuses BEFORE the RPC for every unauthorized caller (live)", () => {
  it("anonymous is refused, and checkout_order() is never invoked", async () => {
    const anonymous = createAnonymousFixtureClient();
    const rpcCalls = countCheckoutRpcCalls(anonymous);
    const result = await runCheckout(anonymous, "00000000-0000-4000-8000-000000000000");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.BUYER_NOT_CAPABLE);
    expect(rpcCalls()).toBe(0);
  });

  it("a malformed order id is refused with VALIDATION_ERROR before any identity or DB work", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const rpcCalls = countCheckoutRpcCalls(client);
    const result = await runCheckout(client, "not-a-uuid");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    expect(rpcCalls()).toBe(0);
  });

  it("a SUSPENDED (cannot-buy) organization is refused BUYER_NOT_CAPABLE, RPC never invoked", async () => {
    setSuspendedOrganizationStatus("SUSPENDED");
    try {
      const client = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
      const rpcCalls = countCheckoutRpcCalls(client);
      const result = await runCheckout(client, "00000000-0000-4000-8000-000000000000");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.BUYER_NOT_CAPABLE);
      expect(rpcCalls()).toBe(0);
    } finally {
      setSuspendedOrganizationStatus("ACTIVE");
    }
  });

  it("a cross-org order id is refused ORDER_NOT_FOUND before the RPC, identically to a nonexistent id", async () => {
    const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await buildRequestedOrder(orgB, INVENTORY_FIXTURES.orgB.organizationId, 1);

    const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const rpcCalls = countCheckoutRpcCalls(orgA);
    const crossOrg = await runCheckout(orgA, orderId);
    const nonexistent = await runCheckout(orgA, "00000000-0000-4000-8000-000000000000");
    expect(crossOrg.ok).toBe(false);
    expect(nonexistent.ok).toBe(false);
    if (!crossOrg.ok && !nonexistent.ok) {
      expect(crossOrg.code).toBe(ACTION_FEEDBACK.ORDER_NOT_FOUND);
      expect(nonexistent.code).toBe(ACTION_FEEDBACK.ORDER_NOT_FOUND);
    }
    expect(rpcCalls()).toBe(0);
  });

  it("a DRAFT order that is not checkout-ready (REQUESTED shipment only) is refused ORDER_CHECKOUT_NOT_READY, stays DRAFT, RPC never invoked", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await buildRequestedOrder(client, INVENTORY_FIXTURES.orgB.organizationId, 1);
    const rpcCalls = countCheckoutRpcCalls(client);

    const result = await runCheckout(client, orderId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.ORDER_CHECKOUT_NOT_READY);
    expect(rpcCalls()).toBe(0);

    const order = await withLiveClient(client, async () => {
      const { getOrderById } = await import("@/lib/orders/read");
      return getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId });
    });
    expect(order?.status).toBe("DRAFT");
    expect(order?.idempotencyKey).toBeNull();
  });
});

describe("T008/T010/T009 — a genuine checkout, its HOLD outcome, and the idempotent retry (live)", () => {
  let orderId: string;
  let firstResult: { orderId: string; proformaId: string | null; reservationId: string | null; buyerTotal: number | null; holdExpiresAt: string | null; correlationId: string | null; idempotentRetry: boolean };
  let client: SupabaseClient;
  let ownershipEventsBefore: number;

  beforeAll(async () => {
    client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    orderId = await buildReadyOrder(client, INVENTORY_FIXTURES.orgB.organizationId, 5);
    ownershipEventsBefore = inspectCheckoutOrder(orderId).ownershipEventCount;
    const rpcCalls = countCheckoutRpcCalls(client);
    const result = await runCheckout(client, orderId);
    if (!result.ok) throw new Error(`checkout failed: ${result.code}`);
    firstResult = result.data;
    expect(rpcCalls()).toBe(1);
  }, 60_000);

  it("DRAFT -> CONFIRMED happened through the buyer write path, then checkout_order() moved the order to HOLD with a DB-owned hold_expires_at", async () => {
    const order = await withLiveClient(client, async () => {
      const { getOrderById, getOrderStatusHistory } = await import("@/lib/orders/read");
      return { order: await getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId }), history: await getOrderStatusHistory({ orderId }) };
    });
    expect(order.order?.status).toBe("HOLD");
    expect(order.order?.holdExpiresAt).toBe(firstResult.holdExpiresAt);
    expect(new Date(order.order!.holdExpiresAt!).getTime()).toBeGreaterThan(Date.now());
    expect(order.history.map((entry) => `${entry.oldStatus}->${entry.newStatus}`)).toEqual(["DRAFT->CONFIRMED", "CONFIRMED->HOLD"]);
  });

  it("the RPC's own values are passed through verbatim (idempotent_retry=false on the first call)", () => {
    expect(firstResult.idempotentRetry).toBe(false);
    expect(firstResult.orderId).toBe(orderId);
    expect(firstResult.reservationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstResult.proformaId).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstResult.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof firstResult.buyerTotal).toBe("number");
  });

  it("the idempotency key was generated server-side (a UUID the client never supplied) and persisted on the order", async () => {
    const order = await withLiveClient(client, async () => {
      const { getOrderById } = await import("@/lib/orders/read");
      return getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId });
    });
    expect(order?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("proforma reference, buyer_total and currency read back from the database EXACTLY equal the RPC result / financial snapshot (no recomputation)", async () => {
    const { financials, proforma, payments } = await withLiveClient(client, async () => {
      const { getOrderFinancials, getProforma } = await import("@/lib/orders/read");
      const { data: paymentRows } = await client.from("payments").select("id, status, amount, currency").eq("order_id", orderId);
      return { financials: await getOrderFinancials({ orderId }), proforma: await getProforma({ orderId }), payments: paymentRows ?? [] };
    });
    expect(proforma?.id).toBe(firstResult.proformaId);
    expect(proforma?.proformaCode).toBeTruthy();
    expect(proforma?.status).toBe("ISSUED");
    expect(financials?.buyerTotalAmount).toBe(firstResult.buyerTotal);
    expect(financials?.currency).toBe("USD");
    expect(financials?.totalQuantityKg).toBe(5);
    // The `payments` PENDING row is `checkout_order()`'s own approved side-effect — one, PENDING, same amount.
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("PENDING");
    expect(Number(payments[0]!.amount)).toBe(firstResult.buyerTotal);
  });

  it("preliminary integrity: exactly one ACTIVE reservation with one item, listing/inventory reserved mirrors consistent, zero ownership events (test-only privileged read)", () => {
    const snapshot = inspectCheckoutOrder(orderId);
    expect(snapshot.reservations).toHaveLength(1);
    expect(snapshot.reservations[0]!.id).toBe(firstResult.reservationId);
    expect(snapshot.reservations[0]!.status).toBe("ACTIVE");
    expect(snapshot.reservationItems).toEqual([{ quantity_kg: 5, offer_id: CHECKOUT_FIXTURES.offerCheckout }]);
    expect(snapshot.proformas).toHaveLength(1);
    expect(snapshot.payments).toHaveLength(1);
    expect(Number(snapshot.offer.reserved_quantity_kg)).toBe(5);
    expect(Number(snapshot.position.reserved_quantity_kg)).toBe(5);
    expect(Number(snapshot.offer.filled_quantity_kg)).toBe(0);
    expect(snapshot.ownershipEventCount).toBe(ownershipEventsBefore);
  });

  it("T009 — a second executeCheckout on the same order hits the function's OWN idempotent-retry branch: same reservation/proforma, key unchanged, no duplicate artefacts", async () => {
    const before = await withLiveClient(client, async () => {
      const { getOrderById } = await import("@/lib/orders/read");
      return getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId });
    });
    const rpcCalls = countCheckoutRpcCalls(client);
    const retry = await runCheckout(client, orderId);
    expect(rpcCalls()).toBe(1);
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.data.idempotentRetry).toBe(true);
      expect(retry.data.reservationId).toBe(firstResult.reservationId);
      expect(retry.data.proformaId).toBe(firstResult.proformaId);
      expect(retry.data.buyerTotal).toBe(firstResult.buyerTotal);
      expect(retry.data.holdExpiresAt).toBe(firstResult.holdExpiresAt);
    }

    const after = await withLiveClient(client, async () => {
      const { getOrderById } = await import("@/lib/orders/read");
      return getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId });
    });
    expect(after?.idempotencyKey).toBe(before?.idempotencyKey);
    expect(after?.status).toBe("HOLD");

    const snapshot = inspectCheckoutOrder(orderId);
    expect(snapshot.reservations).toHaveLength(1);
    expect(snapshot.proformas).toHaveLength(1);
    expect(snapshot.payments).toHaveLength(1);
    expect(Number(snapshot.offer.reserved_quantity_kg)).toBe(5);
  });

  it("T006 (re-verification) — a direct edit attempt against the genuine HOLD order is refused server-side, by the application AND by the database itself", async () => {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("offerId", CHECKOUT_FIXTURES.offerCheckout);
    formData.set("quantityKg", "1");
    const viaAction = await withLiveClient(client, async () => {
      const { addItemToOrder } = await import("@/src/app/dashboard/orders/actions");
      return addItemToOrder(undefined, formData);
    });
    expect(viaAction.ok).toBe(false);
    if (!viaAction.ok) expect(viaAction.code).toBe(ACTION_FEEDBACK.ORDER_NOT_EDITABLE);

    // Bypass the application entirely: a raw insert against the HOLD order is refused by the
    // database (`order_items_create_buyer` requires the parent order to be DRAFT).
    const { error: rawError } = await client.from("order_items").insert({ order_id: orderId, offer_id: CHECKOUT_FIXTURES.offerCheckout, quantity_kg: 1 });
    expect(rawError).not.toBeNull();

    const items = await withLiveClient(client, async () => {
      const { getOrderItems } = await import("@/lib/orders/read");
      return getOrderItems({ orderId });
    });
    expect(items).toHaveLength(1);
  });
});

describe("T011 — the authoritative availability failure path (live race against the same listing)", () => {
  it("two ready orders over the same remaining quantity: the first reserves, the second is refused by checkout_order() with a specific safe code and ZERO partial artefacts", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    // 5 kg is already reserved by the previous describe block; 50 - 5 = 45 remaining.
    const winner = await buildReadyOrder(client, INVENTORY_FIXTURES.orgB.organizationId, 30);
    const loser = await buildReadyOrder(client, INVENTORY_FIXTURES.orgB.organizationId, 30);

    const winnerResult = await runCheckout(client, winner);
    expect(winnerResult.ok).toBe(true);

    const rpcCalls = countCheckoutRpcCalls(client);
    const loserResult = await runCheckout(client, loser);
    expect(rpcCalls()).toBe(1); // the RPC WAS exercised — the refusal is the function's own verdict
    expect(loserResult.ok).toBe(false);
    if (!loserResult.ok) {
      expect(loserResult.code).toBe(ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE);
      expect(JSON.stringify(loserResult)).not.toMatch(/listing_inventory_changed|seller_inventory_changed|P0001|raise/i);
    }

    // Zero partial effects for the loser: the whole transaction rolled back.
    const { financials, proforma, payments, order } = await withLiveClient(client, async () => {
      const { getOrderFinancials, getProforma, getOrderById } = await import("@/lib/orders/read");
      const { data: paymentRows } = await client.from("payments").select("id").eq("order_id", loser);
      return {
        financials: await getOrderFinancials({ orderId: loser }),
        proforma: await getProforma({ orderId: loser }),
        payments: paymentRows ?? [],
        order: await getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId: loser }),
      };
    });
    expect(financials).toBeNull();
    expect(proforma).toBeNull();
    expect(payments).toHaveLength(0);
    expect(order?.status).toBe("CONFIRMED"); // the buyer-side confirm write is a separate statement; the RPC's own effects are all rolled back
    expect(order?.holdExpiresAt).toBeNull();

    const snapshot = inspectCheckoutOrder(loser);
    expect(snapshot.reservations).toHaveLength(0);
    expect(snapshot.proformas).toHaveLength(0);
    expect(snapshot.payments).toHaveLength(0);
    expect(Number(snapshot.offer.reserved_quantity_kg)).toBe(35); // 5 + 30, never 65
    expect(Number(snapshot.position.reserved_quantity_kg)).toBe(35);
  });
});

describe("T008 — sole-caller and no-forbidden-effect source audits", () => {
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("checkout_order appears in CODE (comments stripped) in exactly one application file: lib/orders/checkout.ts (repo-wide git grep over lib/, src/, components/, untracked files included)", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    const output = execFileSync("git", ["grep", "-l", "--untracked", "checkout_order", "--", "lib", "src", "components"], { encoding: "utf8" });
    const mentioningFiles = output.trim().split(/\r?\n/).filter(Boolean);
    // Doc comments in several files legitimately NAME the function to explain a boundary; only a
    // reference that survives comment-stripping is a real code reference.
    const codeReferences = mentioningFiles.filter((file) => /checkout_order/.test(stripComments(readFileSync(file, "utf8"))));
    expect(codeReferences).toEqual(["lib/orders/checkout.ts"]);
  });

  it("checkout.ts issues exactly ONE rpc call site, to checkout_order, and never expire_order_hold", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/checkout.ts", "utf8"));
    expect(source.match(/\.rpc\(/g)?.length).toBe(1);
    expect(source).toMatch(/\.rpc\(\s*"checkout_order"/);
    expect(source).not.toMatch(/expire_order_hold/);
  });

  it("checkout.ts never writes reservations/financials/proforma/payments/ownership events, never reads reservation tables, never loops per seller, never accepts a client key", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/checkout.ts", "utf8"));
    expect(source).not.toMatch(/inventory_reservations|inventory_reservation_items|inventory_ownership_events|order_financials|proforma_invoices|from\(\s*["']payments["']/);
    // No write ever touches a reservation/hold/total column, and no arithmetic derives one.
    expect(source).not.toMatch(/reserved_quantity_kg/);
    expect(source).not.toMatch(/\.(insert|update)\([^)]*(hold_expires_at|buyer_total|hold_started_at)/);
    expect(source).not.toMatch(/\+\s*(20|1200|interval)/);
    expect(source).not.toMatch(/seller_organization_id|sellerOrganizationId/);
    expect(source).not.toMatch(/SERVICE_ROLE|unstable_cache|"use cache"|cacheTag|cacheLife|updateTag/);
    // The only client-facing input is the order id — no key/amount/quantity/hold parameter exists.
    expect(source).toMatch(/export async function executeCheckout\(orderId: string\)/);
    expect(source).toMatch(/randomUUID\(\)/);
  });
});

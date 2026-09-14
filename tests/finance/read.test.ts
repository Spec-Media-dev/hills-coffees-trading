import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, FOUNDATION_FIXTURES, INVENTORY_FIXTURES, createAnonymousFixtureClient, resetCheckoutFixtures, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 008 Phase 1 (T003/T006) — LIVE proofs of `lib/finance/read.ts` against the real test
 * database. Builds a genuine checked-out order through Feature 007's OWN production paths
 * (`lib/orders/drafts.ts`, the shipment Server Actions, `lib/orders/checkout.ts#executeCheckout`) —
 * never a raw insert — the same convention `tests/orders/checkout.test.ts` and `read.test.ts`
 * establish, so this file exercises the SAME `checkout_order()` side effects (a `PENDING` payment,
 * `order_financials`, and a `proforma_invoices` row) that production code produces.
 *
 * HONEST GAPS THIS FILE DOES NOT CLOSE: `payouts` rows are created only by `admin_review_payment()`
 * (settlement), which this run must not call (T017+ is blocked). `tax_invoices` rows are created only
 * by a future Feature 010 finance-operator workflow that does not exist yet. So this file proves the
 * PAYOUT/TAX-INVOICE reads are honestly `[]`/`null` before either exists — it cannot prove a real
 * seller-payout or tax-invoice read with actual row data in Phase 1. `tests/finance/rls-policy.test.ts`
 * carries the static policy-level proof for those tables instead.
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

async function markShipmentReadyAsWarehouse(shipmentId: string): Promise<void> {
  const warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  const { error } = await warehouse.from("order_shipments").update({ status: "READY" }).eq("id", shipmentId);
  if (error) throw new Error(`warehouse READY transition refused: ${error.message}`);
}

/** Builds and fully checks out a fresh order for the given org, through production write paths only. */
async function buildCheckedOutOrder(client: SupabaseClient, organizationId: string, quantityKg: number): Promise<string> {
  return withLiveClient(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const { createShipment, addShipmentItem, requestShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
    const { getOrderShipments } = await import("@/lib/orders/read");
    const { executeCheckout } = await import("@/lib/orders/checkout");
    const userId = (await client.auth.getUser()).data.user!.id;

    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(`setup: ${order.code}`);
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: CHECKOUT_FIXTURES.offerCheckout, quantityKg });
    if (!item.ok) throw new Error(`setup: ${item.code}`);

    const shipmentForm = new FormData();
    shipmentForm.set("orderId", order.data.id);
    shipmentForm.set("deliveryMethod", "Courier");
    shipmentForm.set("countryCode", "AE");
    shipmentForm.set("addressLine", "1 Finance Test Street");
    shipmentForm.set("contactName", "Finance Tester");
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

    await markShipmentReadyAsWarehouse(shipmentId);

    const checkedOut = await executeCheckout(order.data.id);
    if (!checkedOut.ok) throw new Error(`setup checkout: ${checkedOut.code}`);

    return order.data.id;
  });
}

beforeAll(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("T003 — payment/order_financials/proforma are readable by the order's own buyer org, denied to cross-org and anonymous", () => {
  it("proves own-org, cross-org, and anonymous access for a real checked-out order", async () => {
    const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await buildCheckedOutOrder(orgB, INVENTORY_FIXTURES.orgB.organizationId, 1);

    const ownReads = await withLiveClient(orgB, async () => {
      const { getPayment, getOrderFinancials, getProforma } = await import("@/lib/finance/read");
      return { payment: await getPayment({ orderId }), financials: await getOrderFinancials({ orderId }), proforma: await getProforma({ orderId }) };
    });

    expect(ownReads.payment).not.toBeNull();
    expect(ownReads.payment!.orderId).toBe(orderId);
    expect(ownReads.payment!.status).toBe("PENDING");
    expect(ownReads.payment!.amount).toBeGreaterThan(0);
    expect(ownReads.payment!.currency).toBe("USD");

    expect(ownReads.financials).not.toBeNull();
    expect(ownReads.financials!.orderId).toBe(orderId);
    expect(ownReads.financials!.buyerTotalAmount).toBeGreaterThan(0);
    expect(ownReads.financials!.currency).toBe("USD");

    expect(ownReads.proforma).not.toBeNull();
    expect(ownReads.proforma!.orderId).toBe(orderId);
    expect(ownReads.proforma!.status).toBe("ISSUED");
    expect(ownReads.proforma!.items.length).toBeGreaterThan(0);

    const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const crossOrgReads = await withLiveClient(orgA, async () => {
      const { getPayment, getOrderFinancials, getProforma } = await import("@/lib/finance/read");
      return { payment: await getPayment({ orderId }), financials: await getOrderFinancials({ orderId }), proforma: await getProforma({ orderId }) };
    });
    expect(crossOrgReads.payment).toBeNull();
    expect(crossOrgReads.financials).toBeNull();
    expect(crossOrgReads.proforma).toBeNull();

    const anonymous = createAnonymousFixtureClient();
    const anonymousReads = await withLiveClient(anonymous, async () => {
      const { getPayment, getOrderFinancials, getProforma } = await import("@/lib/finance/read");
      return { payment: await getPayment({ orderId }), financials: await getOrderFinancials({ orderId }), proforma: await getProforma({ orderId }) };
    });
    expect(anonymousReads.payment).toBeNull();
    expect(anonymousReads.financials).toBeNull();
    expect(anonymousReads.proforma).toBeNull();
  }, 60_000);
});

describe("T003/T006 — payouts and tax invoices are honestly empty before settlement/issuance exist", () => {
  it("getPayoutsForOrder/getPayoutsForOrganization/getTaxInvoice are honestly empty for a PENDING (unsettled) order", async () => {
    const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await buildCheckedOutOrder(orgB, INVENTORY_FIXTURES.orgB.organizationId, 1);

    const reads = await withLiveClient(orgB, async () => {
      const { getPayoutsForOrder, getPayoutsForOrganization, getTaxInvoice } = await import("@/lib/finance/read");
      return {
        payoutsForOrder: await getPayoutsForOrder({ orderId }),
        payoutsForOrg: await getPayoutsForOrganization({ organizationId: INVENTORY_FIXTURES.orgB.organizationId }),
        taxInvoice: await getTaxInvoice({ orderId }),
      };
    });

    expect(reads.payoutsForOrder).toEqual([]);
    expect(reads.taxInvoice).toBeNull();
    // orgB's org-wide payout list must not contain this (unsettled) order's id — it may be non-empty
    // from other tests' unrelated settled fixtures, but never this specific order.
    expect(reads.payoutsForOrg.some((payout) => payout.orderId === orderId)).toBe(false);
  }, 60_000);

  it("an unrelated organization's payout read never contains another org's order", async () => {
    const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const payouts = await withLiveClient(orgA, async () => {
      const { getPayoutsForOrganization } = await import("@/lib/finance/read");
      return getPayoutsForOrganization({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    expect(payouts.every((payout) => payout.sellerOrganizationId === INVENTORY_FIXTURES.orgA.organizationId)).toBe(true);
  });
});

/** Strips comments so a doc comment legitimately naming a forbidden pattern never trips a "must not
 * contain X" check — same precedent as `tests/orders/read.test.ts#stripComments`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("T003 — read.ts source-level proofs", () => {
  const source = stripComments(readFileSync("lib/finance/read.ts", "utf8"));

  it("never selects payment_events (not even a safe column allowlist — no Phase 1 consumer needs it)", () => {
    expect(source).not.toMatch(/payment_events/);
  });

  it("never uses a broad select(\"*\")", () => {
    expect(source).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });

  it("never uses a shared cache directive", () => {
    expect(source).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag|Redis|Upstash/);
  });

  it("never uses a service-role client", () => {
    expect(source).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});

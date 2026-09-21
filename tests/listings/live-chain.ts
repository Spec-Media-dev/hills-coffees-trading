import type { SupabaseClient } from "@supabase/supabase-js";

import {
  F006_FIXTURES,
  FOUNDATION_FIXTURES,
  INVENTORY_FIXTURES,
  cleanupComplianceFixture,
  cleanupF006LiveFixtures,
  inspectComplianceFixture,
  inspectDeliveryOrder,
  inspectDeliveryPositionByLotOwner,
  inspectF006Offer,
  prepareComplianceFixture,
  prepareF006LiveFixtures,
  signInAsFixture,
  type F006OfferInspection,
} from "@/tests/auth/fixture-session";
import { buildHoldOrder, type WithLiveClient } from "@/tests/orders/live-helpers";

/**
 * Feature 006 live-chain support (T015 / T018 / T023 / T024) — the SHARED fixture architecture.
 *
 * A member-seller listing needs a real settled purchase (`validate_offer_transition` checks the MEMBER_SELLER purchase
 * provenance on EVERY write), and the database offers no shortcut, so the chain is walked with the same real primitives
 * Features 007 and 009 use — never a mock of a database contract, never a fake payment provider:
 *
 *   1. orgB (buyer-and-seller) buys from Feature 009's standing Hills listing through the real Feature 007 flow
 *      (`createDraftOrder` → `addOrderItem` → shipment plan → `executeCheckout`), the warehouse fixture marks the
 *      shipment READY, and the order is settled through the currently authoritative settlement primitive,
 *      `admin_review_payment()` (Feature 009's rewrite of Feature 007's function — Feature 008's payment layer does not
 *      exist yet and none of it is claimed here).
 *   2. Settlement makes orgB the owner of a position and the buyer of a PAID order = valid provenance. It also
 *      delivery-reserves the shipment (Feature 009), so the warehouse fixture cancels that shipment to free the stock
 *      (the reviewed T013 scenario 9: cancellation releases the reservation and never manufactures availability).
 *   3. orgB lists it through Feature 006's real `createListingDraft` and submits it through the real
 *      `submitListingForReview`; the COMPLIANCE fixture approves it through the console's real `decideListing` and
 *      publishes it with the direct `APPROVED → PUBLISHED` update its role is granted (the console offers no publish
 *      control — recorded in the task notes).
 *
 * THE ONE ADMIN-ASSISTED STEP: the buyer-facing `submit_payment_proof()` cannot advance a fresh HOLD order (Feature 009
 * documented and reproduced this: `tests/delivery/t013-live-proof.test.ts`), so the disposable ADMIN performs exactly
 * the two order-status transitions the state graph permits (`HOLD → PAYMENT_PROOF_SUBMITTED → PAYMENT_UNDER_REVIEW`) —
 * the reviewed T013 pattern, no other authority. FINANCE performs the review itself.
 *
 * Rows: every listing carries `F006_FIXTURES.titlePrefix`; orders/positions are found structurally by the seed
 * script's exact-scope residue read; `cleanupF006LiveFixtures()` removes them all and reports the append-only rows it
 * (by design) cannot.
 */

export type ChainSessions = {
  orgA: SupabaseClient;
  orgB: SupabaseClient;
  orgAUserId: string;
  orgBUserId: string;
  warehouse: SupabaseClient;
  finance: SupabaseClient;
  admin: SupabaseClient;
  compliance: SupabaseClient;
};

export const ORG_A = INVENTORY_FIXTURES.orgA.organizationId;
export const ORG_B = INVENTORY_FIXTURES.orgB.organizationId;

/** Seeds Feature 009's Hills fixture (idempotent), the reviewed disposable ADMIN and the COMPLIANCE fixture, then signs everyone in. */
export async function prepareChain(): Promise<ChainSessions> {
  prepareF006LiveFixtures();
  prepareComplianceFixture();
  const [orgA, orgB, warehouse, finance, admin, compliance] = await Promise.all([
    signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email),
    signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email),
    signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email),
    signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email),
    signInAsFixture(FOUNDATION_FIXTURES.deliveryAdmin.email),
    signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email),
  ]);
  return {
    orgA,
    orgB,
    orgAUserId: (await orgA.auth.getUser()).data.user!.id,
    orgBUserId: (await orgB.auth.getUser()).data.user!.id,
    warehouse,
    finance,
    admin,
    compliance,
  };
}

export type ChainTeardown = { cleanup: Record<string, unknown>; compliance: Record<string, unknown>; complianceActiveCapability: boolean };

/** Removes every F006 row, restores the shared delivery baseline and de-privileges every disposable operator. Never throws before both halves ran. */
export function teardownChain(): ChainTeardown {
  const failures: unknown[] = [];
  let cleanup: Record<string, unknown> = {};
  let compliance: Record<string, unknown> = {};
  // independent halves: a failed row cleanup must never leave the COMPLIANCE operator privileged (and vice versa)
  try {
    cleanup = cleanupF006LiveFixtures();
  } catch (error) {
    failures.push(error);
  }
  try {
    compliance = cleanupComplianceFixture();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) throw failures[0];
  return { cleanup, compliance, complianceActiveCapability: inspectComplianceFixture().activeCapability === true };
}

/** The shared lifecycle helpers, bound to a test file's own `withLiveClient` (Vitest hoists mocks per file). */
export function chainHelpers(withLiveClient: WithLiveClient, sessions: ChainSessions) {
  /** HOLD → PAID through the authoritative settlement primitive. Returns the payment id. */
  async function settleOrder(orderId: string): Promise<string> {
    const paymentId = inspectDeliveryOrder(orderId).payment?.id;
    if (!paymentId) throw new Error(`setup: order ${orderId} has no payment row`);
    for (const status of ["PAYMENT_PROOF_SUBMITTED", "PAYMENT_UNDER_REVIEW"]) {
      const { error } = await sessions.admin.from("orders").update({ status }).eq("id", orderId);
      if (error) throw new Error(`setup: order -> ${status}: ${error.message}`);
    }
    const { error } = await sessions.finance.rpc("admin_review_payment", { p_payment_id: paymentId, p_approved: true, p_reason: null });
    if (error) throw new Error(`setup: admin_review_payment: ${error.message}`);
    return paymentId;
  }

  /** The warehouse fixture cancels the (settlement-reserved) delivery shipment — releasing the reservation, never manufacturing availability. */
  async function cancelDeliveryShipments(orderId: string): Promise<void> {
    for (const shipment of inspectDeliveryOrder(orderId).shipments) {
      const { error, data } = await sessions.warehouse.from("order_shipments").update({ status: "CANCELLED" }).eq("id", shipment.id).select("id");
      if (error || (data?.length ?? 0) !== 1) throw new Error(`setup: shipment ${shipment.id} -> CANCELLED: ${error?.message ?? "0 rows"}`);
    }
  }

  /** Buyer org buys `quantityKg` from an offer through the real 007 flow and it is settled. */
  async function buyAndSettle(buyer: SupabaseClient, organizationId: string, offerId: string, quantityKg: number) {
    const orderId = await buildHoldOrder(withLiveClient, buyer, organizationId, quantityKg, offerId);
    const holdSnapshot = inspectDeliveryOrder(orderId);
    const paymentId = await settleOrder(orderId);
    return { orderId, paymentId, holdSnapshot, paidSnapshot: inspectDeliveryOrder(orderId) };
  }

  /** orgB owns `quantityKg` of settled, provenance-valid, UNRESERVED stock. Returns its position and the source order item. */
  async function giveOrgBSettledStock(quantityKg: number) {
    const purchase = await buyAndSettle(sessions.orgB, ORG_B, F006_FIXTURES.hillsOfferId, quantityKg);
    await cancelDeliveryShipments(purchase.orderId);
    const position = inspectDeliveryPositionByLotOwner(F006_FIXTURES.hillsLotId, ORG_B);
    if (!position) throw new Error("setup: orgB has no position after settlement");
    return { ...purchase, position, orderItemId: purchase.paidSnapshot.items[0]!.id };
  }

  /** orgB's real `createListingDraft`. */
  async function createDraft(positionId: string, quantityKg: number, title: string, pricePerKg = 11) {
    return withLiveClient(sessions.orgB, async () => {
      const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      formData.set("positionId", positionId);
      formData.set("title", `${F006_FIXTURES.titlePrefix}${title}`);
      formData.set("quantityKg", String(quantityKg));
      formData.set("pricePerKg", String(pricePerKg));
      formData.set("currency", "USD");
      return createListingDraft(undefined, formData);
    });
  }

  async function submitForReview(offerId: string) {
    return withLiveClient(sessions.orgB, async () => {
      const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      formData.set("offerId", offerId);
      return submitListingForReview(undefined, formData);
    });
  }

  /** COMPLIANCE approves through the console's real `decideListing`. */
  async function approve(offerId: string) {
    return withLiveClient(sessions.compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId, decision: "APPROVED" });
    });
  }

  /** COMPLIANCE publishes with the direct `APPROVED → PUBLISHED` update `offers_compliance_update` + the trigger grant it. */
  async function publish(offerId: string) {
    return sessions.compliance.from("coffee_offers").update({ status: "PUBLISHED" }).eq("id", offerId).eq("status", "APPROVED").select("id, status").maybeSingle();
  }

  /** DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED, each step through its real actor. */
  async function publishListing(offerId: string) {
    const submitted = await submitForReview(offerId);
    if (!submitted.ok) throw new Error(`setup: submit refused: ${submitted.code}`);
    const approved = await approve(offerId);
    if (!approved.ok) throw new Error(`setup: approve refused: ${approved.code}`);
    const published = await publish(offerId);
    if (published.error || published.data?.status !== "PUBLISHED") throw new Error(`setup: publish refused: ${published.error?.message ?? "0 rows"}`);
  }

  return { settleOrder, cancelDeliveryShipments, buyAndSettle, giveOrgBSettledStock, createDraft, submitForReview, approve, publish, publishListing };
}

/** Stored quantities of a listing, straight from the database (privileged read-only snapshot). */
export function storedListing(offerId: string): NonNullable<F006OfferInspection["offer"]> & { remaining: number } {
  const snapshot = inspectF006Offer(offerId);
  if (!snapshot.offer) throw new Error(`listing ${offerId} does not exist`);
  const offer = snapshot.offer;
  return { ...offer, quantity_kg: Number(offer.quantity_kg), reserved_quantity_kg: Number(offer.reserved_quantity_kg), filled_quantity_kg: Number(offer.filled_quantity_kg), remaining: Number(offer.quantity_kg) - Number(offer.reserved_quantity_kg) - Number(offer.filled_quantity_kg) };
}

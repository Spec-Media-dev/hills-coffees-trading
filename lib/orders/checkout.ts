import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getRequestIdentity } from "@/lib/auth/dal";
import { mapOrderError } from "@/lib/orders/errors";
import { getOrderById, getOrderItems, getOrderShipments, getShipmentItems } from "@/lib/orders/read";
import type { CheckoutResult } from "@/lib/orders/validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN B (T008) — `executeCheckout(orderId)`: the ONE and ONLY application caller of the
 * database's `checkout_order(p_order_id)` function (plan.md architecture decision 1; T029's own
 * closure check is `grep -rn "checkout_order" src lib` matching this file alone).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ABSOLUTE TRANSACTIONAL RULE (FR-001/FR-002/SC-001)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * This file reimplements NOTHING `checkout_order()` owns. Read live (2026-09-13), that function —
 * inside ONE transaction, holding a `FOR UPDATE` lock on the order — validates readiness
 * (`assert_order_checkout_ready`), computes the financial snapshot (base/shipping/VAT/commission/
 * buyer total, with commission-tier + tax-rule snapshots), issues the proforma and its items,
 * creates the `inventory_reservations` row and one `inventory_reservation_items` row per order
 * item (reserving `inventory_positions.reserved_quantity_kg` FIRST, then mirroring into
 * `coffee_offers.reserved_quantity_kg`), creates/updates the `PENDING` payment, and moves the order
 * to `HOLD` with `hold_expires_at = now() + 20 minutes`. Its own idempotent-retry branch returns the
 * existing reservation/proforma/total for an order already in `HOLD`/`PAYMENT_PROOF_SUBMITTED`/
 * `PAYMENT_UNDER_REVIEW` with an ACTIVE reservation. This file passes its `jsonb` result through
 * VERBATIM and computes none of those values itself.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE EXACT PRE-CHECKOUT STATE THE DATABASE REQUIRES (read live from
 * `assert_order_checkout_ready`, called by `checkout_order()` and again by
 * `validate_order_transition` when a row moves to `HOLD`)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   1. `orders.status = 'CONFIRMED'`      — `order_must_be_confirmed_before_checkout`
 *   2. `organization_can_buy(buyer org)`  — `buyer_not_authorized`
 *   3. at least one `order_items` row     — `order_has_no_items`
 *   4. an `order_shipments` row in `READY`/`RESERVED` with `ready_at IS NOT NULL`
 *                                         — `shipment_must_be_ready_before_checkout`
 *   5. for EVERY order item, the planned `shipment_items` quantity (over non-CANCELLED/FAILED
 *      shipments) equals the item's own quantity — `shipment_quantities_do_not_match_order`
 *
 * (1) means `DRAFT -> CONFIRMED` is a genuine prerequisite the function does NOT perform itself.
 * `validate_order_transition` (read live) permits exactly that one transition for a plain buyer
 * session — every other change requires `is_internal_transition()`/`is_platform_admin()` — and
 * `orders_update_buyer_or_admin` lets the buyer UPDATE while `DRAFT`/`CONFIRMED`. This file
 * performs it through that ordinary, authorized buyer write path, ONLY after the readiness checks
 * (3)–(5) pass, because the transition is ONE-WAY for a buyer (`CONFIRMED` may only go to `HOLD` or
 * `VOID`, neither buyer-settable) — confirming an order the database would then certainly refuse
 * would strand it. The database re-validates every one of (1)–(5) itself regardless; the checks
 * here are defense in depth, never a substitute (FR-005/FR-006 — availability is deliberately NOT
 * pre-checked here at all; `checkout_order()`'s own `listing_inventory_changed`/
 * `seller_inventory_changed` refusals are the authoritative availability verdict, T011).
 *
 * (4) is Feature 009/warehouse-owned: `validate_shipment_transition` only lets a buyer reach
 * `REQUESTED`; `READY` requires `is_warehouse_operator()`. A genuinely checkout-ready order can
 * therefore not be produced by buyer-only flows today — an honest forward dependency recorded in
 * the handoff, not weakened here.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * IDEMPOTENCY (FR-003/SEC-005)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `orders.idempotency_key` (nullable text) is generated HERE, server-side (`randomUUID()`), exactly
 * once per checkout intent — the first time an order enters checkout — and persisted on the order
 * through the buyer's own UPDATE path in the same write that confirms it. It is never accepted
 * from a client (this function's only input is `orderId`; there is no field anywhere in the
 * request shape a caller could use to supply one), and it is never rotated: a retry (double
 * submit, network loss, stale tab) finds the key already set and reuses it; a CONCURRENT duplicate
 * submission cannot overwrite it either, because the key write is a compare-and-set on
 * `idempotency_key IS NULL` (RUN D, T020). HONEST CONTRACT NOTE:
 * `checkout_order()` itself (read live) does not read `idempotency_key` — its retry safety is
 * keyed on the order's OWN status + ACTIVE reservation (`idempotent_retry: true`). The key is
 * therefore the application's per-intent correlation marker that satisfies SEC-005's
 * "server-generated, not attacker-controllable" rule; the transactional guarantee that no second
 * reservation/proforma/payment is ever created belongs to the function's own retry branch, and is
 * proven live in `tests/orders/checkout.test.ts` by calling this function twice on the same order.
 *
 * DB-OPEN-14: every `orders` UPDATE below is a plain `.update()` with NO chained `.select()`
 * (`orders_view`'s self-referential `can_view_order` SELECT policy makes `RETURNING` fail RLS on
 * this one table) — the row is re-read separately through `getOrderById`, the already-proven
 * pattern from RUN A.
 *
 * SECURITY (SEC-001/SEC-002): identity and acting organization are resolved FRESH from
 * `getRequestIdentity()` on every call; the order is re-read org-scoped so a cross-organization id
 * refuses `ORDER_NOT_FOUND` BEFORE any RPC (proven live — the RPC is never reached). No
 * service-role, no shared cache, no reservation-table read anywhere in this file.
 */

const CHECKOUT_RETRY_STATUSES = ["HOLD", "PAYMENT_PROOF_SUBMITTED", "PAYMENT_UNDER_REVIEW"] as const;
const CHECKOUT_ENTRY_STATUSES = ["DRAFT", "CONFIRMED"] as const;
const READY_SHIPMENT_STATUSES = ["READY", "RESERVED"] as const;

const OrderIdInput = z.uuid();

type RawCheckoutResult = {
  order_id?: unknown;
  proforma_id?: unknown;
  reservation_id?: unknown;
  buyer_total?: unknown;
  hold_expires_at?: unknown;
  correlation_id?: unknown;
  idempotent_retry?: unknown;
};

/** Verbatim key-for-key mapping of the function's `jsonb` — no value is derived, rounded, or recomputed. */
function mapCheckoutResult(raw: RawCheckoutResult): CheckoutResult {
  return {
    orderId: String(raw.order_id),
    proformaId: typeof raw.proforma_id === "string" ? raw.proforma_id : null,
    reservationId: typeof raw.reservation_id === "string" ? raw.reservation_id : null,
    buyerTotal: typeof raw.buyer_total === "number" ? raw.buyer_total : raw.buyer_total === null || raw.buyer_total === undefined ? null : Number(raw.buyer_total),
    holdExpiresAt: typeof raw.hold_expires_at === "string" ? raw.hold_expires_at : null,
    correlationId: typeof raw.correlation_id === "string" ? raw.correlation_id : null,
    idempotentRetry: raw.idempotent_retry === true,
  };
}

export async function executeCheckout(orderId: string): Promise<ActionFeedbackResult<CheckoutResult>> {
  // 1. VALIDATE
  if (!OrderIdInput.safeParse(orderId).success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  // 2–5. AUTHENTICATE, resolve the acting organization server-side, verify membership + buy capability.
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null || !identity.isAuthorizedMember || !identity.organization.canBuy) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }
  const organizationId = identity.organization.organizationId;

  // 6–7. READ the order under ordinary member authority, org-scoped: cross-org and nonexistent ids
  // refuse identically here — the RPC below is never reached for either.
  const order = await getOrderById({ organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  const supabase = await createClient();

  // Retry path: an order already past checkout is handed straight to the function, whose OWN
  // idempotent branch returns the existing reservation/proforma/total (never a second one).
  const isRetry = (CHECKOUT_RETRY_STATUSES as readonly string[]).includes(order.status);

  if (!isRetry) {
    if (!(CHECKOUT_ENTRY_STATUSES as readonly string[]).includes(order.status)) {
      return { ok: false, code: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED };
    }

    // 8. PRE-CHECKOUT STATE the database contract requires (see header) — checked BEFORE the
    // one-way confirm write so a not-ready draft is never stranded in CONFIRMED. Availability is
    // deliberately NOT checked here (T011: the RPC is the authority).
    const ready = await isCheckoutReady(orderId);
    if (!ready) {
      return { ok: false, code: ACTION_FEEDBACK.ORDER_CHECKOUT_NOT_READY };
    }

    // 9. SERVER-OWNED IDEMPOTENCY KEY — generated once, reused forever after.
    const idempotencyKey = order.idempotencyKey ?? randomUUID();
    const patch: { status?: "CONFIRMED"; idempotency_key?: string } = {};
    if (order.status === "DRAFT") patch.status = "CONFIRMED";
    if (order.idempotencyKey === null) patch.idempotency_key = idempotencyKey;

    if (Object.keys(patch).length > 0) {
      // DB-OPEN-14: plain update, no RETURNING; the trigger (`validate_order_transition`) and the
      // `orders_update_buyer_or_admin` policy remain the authority on whether this is permitted.
      let update = supabase.from("orders").update(patch).eq("id", orderId).eq("buyer_organization_id", organizationId);
      // COMPARE-AND-SET (RUN D, T020): the key is written only while none is persisted, so a
      // concurrent duplicate submission of the same intent can never rotate the first submission's key.
      if (patch.idempotency_key !== undefined) update = update.is("idempotency_key", null);
      const { error: updateError } = await update;
      if (updateError) {
        return { ok: false, code: mapOrderError(updateError) };
      }
    }

    // Separate authorized re-read (DB-OPEN-14) — confirm the intent is persisted. A concurrent
    // duplicate submission of the SAME order (double click, second tab — proven live in
    // `tests/orders/idempotency.test.ts`) may have confirmed it first (its server-generated key is
    // then the persisted one, and our compare-and-set write matched nothing) or even completed the
    // checkout already (`HOLD`): both are the same intent, so the call proceeds to `checkout_order()`,
    // whose own row lock + retry branch returns the single existing checkout. Anything else refuses.
    const confirmed = await getOrderById({ organizationId, orderId });
    const intentPersisted = confirmed !== null && confirmed.status === "CONFIRMED" && confirmed.idempotencyKey !== null;
    const completedConcurrently = confirmed !== null && (CHECKOUT_RETRY_STATUSES as readonly string[]).includes(confirmed.status);
    if (!intentPersisted && !completedConcurrently) {
      return { ok: false, code: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED };
    }
  }

  // 10. THE ONE CALL. `checkout_order()` owns everything transactional from here.
  const { data, error } = await supabase.rpc("checkout_order", { p_order_id: orderId });

  // 11. SAFE ERROR MAPPING — the function's own raised strings (`order_not_found`, `forbidden`,
  // `buyer_not_authorized`, `order_must_be_confirmed_before_checkout`, `order_has_no_items`,
  // `shipment_must_be_ready_before_checkout`, `shipment_quantities_do_not_match_order`,
  // `listing_inventory_changed`, `seller_not_authorized`, `seller_inventory_changed`) are all in
  // T002's table; anything else falls back to the generic safe code. No raw text escapes.
  if (error || data === null || typeof data !== "object") {
    return { ok: false, code: mapOrderError(error) };
  }

  // 12. VERBATIM RESULT
  return { ok: true, data: mapCheckoutResult(data as RawCheckoutResult) };
}

/**
 * Readiness conditions (3)–(5) from the header, evaluated over the buyer's OWN readable rows.
 * Pure comparison of stored quantities — never a commercial computation. `false` here means the
 * database would certainly refuse; `true` means only that the buyer-visible preconditions hold —
 * `checkout_order()` still decides.
 */
async function isCheckoutReady(orderId: string): Promise<boolean> {
  const [items, shipments] = await Promise.all([getOrderItems({ orderId }), getOrderShipments({ orderId })]);
  if (items.length === 0) return false;

  const readyShipment = shipments.some((shipment) => (READY_SHIPMENT_STATUSES as readonly string[]).includes(shipment.status) && shipment.readyAt !== null);
  if (!readyShipment) return false;

  const countedShipments = shipments.filter((shipment) => shipment.status !== "CANCELLED" && shipment.status !== "FAILED");
  const plannedByItem = new Map<string, number>();
  for (const shipment of countedShipments) {
    const shipmentItems = await getShipmentItems({ shipmentId: shipment.id });
    for (const shipmentItem of shipmentItems) {
      plannedByItem.set(shipmentItem.orderItemId, (plannedByItem.get(shipmentItem.orderItemId) ?? 0) + shipmentItem.plannedQuantityKg);
    }
  }

  return items.every((item) => (plannedByItem.get(item.id) ?? 0) === item.quantityKg);
}

import { ACTION_FEEDBACK, type ActionFeedbackCode } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN A (T002) — the safe, explicit mapping from every database exception this
 * feature's write paths can raise, to a stable `ActionFeedbackCode`. Built by reading the LIVE
 * trigger/function bodies directly (`validate_order_item_offer`, `validate_order_transition`,
 * `checkout_order`, `assert_order_checkout_ready`, `expire_order_hold`, `validate_shipment_transition`,
 * `validate_shipment_item`) against the current `docs/database/database-schema-report.json` — never
 * guessed from planning prose alone (the run directive's own explicit instruction).
 *
 * SAFE ERROR CONTRACT: no raw Postgres/PostgREST text, SQLSTATE, policy/constraint/trigger/table
 * name, or stack trace ever reaches a client. Every RAISE EXCEPTION string below is looked up here
 * ONCE and converted to one of `ACTION_FEEDBACK`'s stable codes; an UNRECOGNIZED message falls back
 * to a generic, domain-scoped safe code and is logged server-side with ONLY the SQLSTATE-shaped
 * diagnostic context (never the caller's row data, never any payload) — see `logUnmappedOrderError`.
 *
 * FORWARD-COMPATIBLE, NOT PREMATURELY ACTED ON: this table also carries the raised strings from
 * `checkout_order()`/`expire_order_hold()`/`assert_order_checkout_ready()` (Phase 4/5, explicitly
 * OUT of RUN A's scope) so that RUN B/RUN C can reuse this SAME map rather than inventing a second
 * one — RUN A itself never calls those functions (verified in the RUN A audit section of the
 * handoff), so those branches are documented, never exercised, this run.
 */

/** Every raised exception string this feature's OWN order-domain triggers can produce (RUN A-reachable). */
const ORDER_ERROR_MAP: Record<string, ActionFeedbackCode> = {
  // `validate_order_item_offer` (fires on order_items INSERT/UPDATE) — RUN A-reachable.
  order_items_can_only_change_in_draft: ACTION_FEEDBACK.ORDER_NOT_EDITABLE,
  buyer_not_authorized: ACTION_FEEDBACK.BUYER_NOT_CAPABLE,
  listing_is_not_available: ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE,
  cannot_buy_own_listing: ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE,
  requested_quantity_not_available: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE,
  inventory_quantity_not_available: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE,

  // `validate_order_transition` (fires on orders UPDATE OF status) — RUN A never sets a status
  // itself, but a concurrent/future write hitting this path must still map safely.
  order_status_can_only_change_through_workflow: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED,
  invalid_order_transition: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED,
  terminal_order_cannot_change: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED,

  // `checkout_order()` / `assert_order_checkout_ready()` — Phase 4/RUN B, NOT called this run.
  order_not_found: ACTION_FEEDBACK.ORDER_NOT_FOUND,
  forbidden: ACTION_FEEDBACK.ORDER_NOT_ACCESSIBLE,
  order_must_be_confirmed_before_checkout: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED,
  order_has_no_items: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED,
  shipment_must_be_ready_before_checkout: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED,
  shipment_quantities_do_not_match_order: ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED,
  listing_inventory_changed: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE,
  seller_not_authorized: ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE,
  seller_inventory_changed: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE,

  // `expire_order_hold()` raises nothing itself (a no-op return when no active expired reservation
  // exists) — reserved key kept absent deliberately; nothing to map.
};

/** Every raised exception string the shipment-domain triggers can produce. */
const SHIPMENT_ERROR_MAP: Record<string, ActionFeedbackCode> = {
  // `validate_shipment_transition` (fires on order_shipments UPDATE OF status, and on any UPDATE for the locked-details check).
  warehouse_required_for_operational_shipment_status: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE,
  invalid_shipment_transition: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE,
  terminal_shipment_cannot_change: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE,
  shipment_details_are_locked: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE,

  // `validate_shipment_item` (fires on shipment_items INSERT/UPDATE).
  shipment_or_order_item_missing: ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED,
  shipment_order_item_mismatch: ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED,
  shipment_plan_is_closed: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE,
  only_warehouse_can_record_delivery: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE,
  delivered_quantity_cannot_decrease: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE,
  delivered_quantity_exceeds_plan: ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID,
  shipment_plan_exceeds_order_item: ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID,
};

/** Minimal shape of what supabase-js's `PostgrestError` (or any thrown value) may carry — never assumed to be an `Error` instance. */
type RawDatabaseError = { message?: unknown; code?: unknown } | null | undefined;

function extractRaisedMessage(error: RawDatabaseError): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error ? error.message : undefined;
  return typeof message === "string" && message.length > 0 ? message : null;
}

/**
 * Logs an UNRECOGNIZED database error server-side for diagnosis — deliberately narrow: only the
 * SQLSTATE-shaped `code` field (never the message text, which could in principle carry more than
 * this table anticipates, and never any row/payload data). This satisfies T002's own Verify line
 * ("an unmapped error falls back to a generic safe message and is logged without payload").
 */
function logUnmappedOrderError(domain: "order" | "shipment", error: RawDatabaseError): void {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unknown";
  console.error(`[orders] unmapped ${domain} database error`, { sqlstate: code });
}

/** T002 — maps an order/order-item-domain database error to a safe `ActionFeedbackCode`. */
export function mapOrderError(error: RawDatabaseError): ActionFeedbackCode {
  const message = extractRaisedMessage(error);
  const mapped = message ? ORDER_ERROR_MAP[message] : undefined;
  if (mapped) return mapped;
  logUnmappedOrderError("order", error);
  return ACTION_FEEDBACK.ORDER_SAVE_FAILED;
}

/** T002 — maps a shipment/shipment-item-domain database error to a safe `ActionFeedbackCode`. */
export function mapShipmentError(error: RawDatabaseError): ActionFeedbackCode {
  const message = extractRaisedMessage(error);
  const mapped = message ? SHIPMENT_ERROR_MAP[message] : undefined;
  if (mapped) return mapped;
  logUnmappedOrderError("shipment", error);
  return ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED;
}

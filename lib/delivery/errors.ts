import { mapShipmentError } from "@/lib/orders/errors";
import { ACTION_FEEDBACK, type ActionFeedbackCode } from "@/lib/types/action-feedback";

/**
 * Feature 009 RUN A1 (T002) — the delivery domain's error mapping.
 *
 * REUSE, NOT DUPLICATION: `lib/orders/errors.ts#mapShipmentError` already maps every CURRENT
 * `validate_shipment_transition`/`validate_shipment_item` exception (`shipment_plan_is_closed`,
 * `invalid_shipment_transition`, `terminal_shipment_cannot_change`,
 * `warehouse_required_for_operational_shipment_status`, `only_warehouse_can_record_delivery`,
 * `shipment_order_item_mismatch`, `shipment_or_order_item_missing`, `shipment_details_are_locked`,
 * `delivered_quantity_cannot_decrease`, `delivered_quantity_exceeds_plan`,
 * `shipment_plan_exceeds_order_item`) to a safe, specific `ActionFeedbackCode`, built and live-tested
 * by Feature 007 RUN A. Reimplementing this map here would create a second, competing mapping for
 * the SAME live exception vocabulary — exactly the duplicated-authority problem the constitution's
 * Engineering Standards warn against. `mapDeliveryError` below delegates to it directly.
 *
 * WHAT IS GENUINELY NEW: `DB_BLOCK_07_DRAFT_EXCEPTIONS` (drafted in `lib/delivery/validation.ts`,
 * formalized in `specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md`) does not exist in the database
 * yet — no migration is applied in RUN A1. This map is deliberately prepared now, forward-compatible,
 * not prematurely acted on: Phase 2/3's real reservation/settlement-gate call sites reuse this SAME
 * function once the migration lands, rather than a second mapper being invented later.
 */
const DB_BLOCK_07_ERROR_MAP: Record<string, ActionFeedbackCode> = {
  delivery_reservation_requires_settled_order: ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED,
  delivery_reservation_insufficient_inventory: ACTION_FEEDBACK.SHIPMENT_RESERVATION_UNAVAILABLE,
  delivery_reservation_position_missing: ACTION_FEEDBACK.SHIPMENT_RESERVATION_UNAVAILABLE,
};

/** Same minimal shape `lib/orders/errors.ts` uses internally — kept local since that file does not export its own type alias. */
type RawDatabaseError = { message?: unknown; code?: unknown } | null | undefined;

function extractRaisedMessage(error: RawDatabaseError): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error ? error.message : undefined;
  return typeof message === "string" && message.length > 0 ? message : null;
}

/**
 * T002 — maps a delivery-domain database error to a safe `ActionFeedbackCode`. Checks the DB-BLOCK-07
 * draft map first (currently unreachable — no migration applies these strings yet), then delegates to
 * the established `mapShipmentError` for everything else, including an unrecognized message —
 * `mapShipmentError` already falls back to its own generic `SHIPMENT_SAVE_FAILED` and logs only the
 * SQLSTATE-shaped diagnostic itself, so this function never duplicates that logging.
 */
export function mapDeliveryError(error: RawDatabaseError): ActionFeedbackCode {
  const message = extractRaisedMessage(error);
  const draftMapped = message ? DB_BLOCK_07_ERROR_MAP[message] : undefined;
  if (draftMapped) return draftMapped;
  return mapShipmentError(error);
}

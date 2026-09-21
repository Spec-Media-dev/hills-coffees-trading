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
  /** Feature 005 T014 / DB-OPEN-19 — the position has an open variance / hold / quarantine case: it cannot be reserved from or consumed (`guard_inventory_position_hold`). */
  inventory_position_held: ACTION_FEEDBACK.SHIPMENT_RESERVATION_UNAVAILABLE,

  /**
   * Feature 009 RUN B (T014/T016/T017) — the REST of the exception vocabulary the now-LIVE (RUN A2)
   * `validate_shipment_transition`/`validate_shipment_item`/`apply_delivery_reservation` bodies raise
   * (read directly from `supabase/migrations/20260914120000_feature_009_db_block_07.sql`, the actually
   * applied migration — never guessed). All are internal-consistency/exact-once guards or ambiguity
   * fail-safes that a correctly-behaving application should never trigger through the exposed
   * `lib/delivery/buyer.ts`/`warehouse.ts` surface; mapped here anyway so an UNEXPECTED one (a bug, a
   * race, a future schema change) still degrades to a safe, non-leaking result instead of falling
   * through to `mapShipmentError`'s own unrecognized-message log-and-generic-fallback path.
   */
  delivery_reservation_ledger_inconsistent: ACTION_FEEDBACK.SHIPMENT_RESERVATION_UNAVAILABLE,
  delivery_release_position_missing: ACTION_FEEDBACK.SHIPMENT_RESERVATION_UNAVAILABLE,
  delivery_reservation_position_ambiguous: ACTION_FEEDBACK.SHIPMENT_RESERVATION_UNAVAILABLE,
  /**
   * The `FAILED`/`DISPUTED` fail-closed re-entry guard (plan.md architecture decision 8) — the
   * warehouse domain layer never exposes an operation targeting a transition FROM either state, so
   * this should be unreachable through normal use; mapped as `SHIPMENT_NOT_EDITABLE` (the same code
   * every other "this transition is not available" refusal already uses) rather than inventing a
   * distinct code for a path the application deliberately never offers.
   */
  delivery_recovery_requires_dedicated_workflow: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE,
  /**
   * The trigger's own BEFORE INSERT guard — a shipment must always be created as `DRAFT`.
   * `lib/delivery/buyer.ts#createDraftShipment` never sends any other status, so this is unreachable
   * through the approved write surface; mapped safely regardless.
   */
  shipment_must_start_draft: ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED,
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

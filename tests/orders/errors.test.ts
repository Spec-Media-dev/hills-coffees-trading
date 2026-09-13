import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mapOrderError, mapShipmentError } from "@/lib/orders/errors";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN A (T002) — every known raised exception string this feature's OWN order/shipment
 * triggers can produce (read live from `validate_order_item_offer`/`validate_order_transition`/
 * `validate_shipment_transition`/`validate_shipment_item`, plus `checkout_order`/
 * `assert_order_checkout_ready`'s forward-compatible strings, Phase 4/RUN B) maps to a safe,
 * specific `ActionFeedbackCode` — never the raw string itself, and an unrecognized message falls back
 * to a generic, domain-scoped code while logging only a redacted diagnostic.
 */
describe("T002 — every known order-domain exception string maps to a safe, stable code", () => {
  const cases: Array<[string, string]> = [
    ["order_items_can_only_change_in_draft", ACTION_FEEDBACK.ORDER_NOT_EDITABLE],
    ["buyer_not_authorized", ACTION_FEEDBACK.BUYER_NOT_CAPABLE],
    ["listing_is_not_available", ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE],
    ["cannot_buy_own_listing", ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE],
    ["requested_quantity_not_available", ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE],
    ["inventory_quantity_not_available", ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE],
    ["order_status_can_only_change_through_workflow", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED],
    ["invalid_order_transition", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED],
    ["terminal_order_cannot_change", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED],
    ["order_not_found", ACTION_FEEDBACK.ORDER_NOT_FOUND],
    ["forbidden", ACTION_FEEDBACK.ORDER_NOT_ACCESSIBLE],
    ["order_must_be_confirmed_before_checkout", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED],
    ["order_has_no_items", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED],
    ["shipment_must_be_ready_before_checkout", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED],
    ["shipment_quantities_do_not_match_order", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED],
    ["listing_inventory_changed", ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE],
    ["seller_not_authorized", ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE],
    ["seller_inventory_changed", ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE],
  ];

  it.each(cases)("maps %s to %s (a stable ACTION_FEEDBACK code)", (raised, expected) => {
    const code = mapOrderError({ message: raised });
    expect(code).toBe(expected);
    expect(Object.values(ACTION_FEEDBACK)).toContain(code);
  });
});

describe("T002 — every known shipment-domain exception string maps to a safe, stable code", () => {
  const cases: Array<[string, string]> = [
    ["warehouse_required_for_operational_shipment_status", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE],
    ["invalid_shipment_transition", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE],
    ["terminal_shipment_cannot_change", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE],
    ["shipment_details_are_locked", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE],
    ["shipment_or_order_item_missing", ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED],
    ["shipment_order_item_mismatch", ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED],
    ["shipment_plan_is_closed", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE],
    ["only_warehouse_can_record_delivery", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE],
    ["delivered_quantity_cannot_decrease", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE],
    ["delivered_quantity_exceeds_plan", ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID],
    ["shipment_plan_exceeds_order_item", ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID],
  ];

  it.each(cases)("maps %s to %s (a stable ACTION_FEEDBACK code)", (raised, expected) => {
    const code = mapShipmentError({ message: raised });
    expect(code).toBe(expected);
    expect(Object.values(ACTION_FEEDBACK)).toContain(code);
  });
});

describe("T002 — unmapped/unknown errors fall back safely and log without payload", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("an unrecognized order message falls back to ORDER_SAVE_FAILED and logs only the sqlstate", () => {
    const code = mapOrderError({ message: "some_never_seen_raw_postgres_text", code: "23505" });
    expect(code).toBe(ACTION_FEEDBACK.ORDER_SAVE_FAILED);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [, context] = consoleErrorSpy.mock.calls[0]!;
    expect(context).toEqual({ sqlstate: "23505" });
  });

  it("an unrecognized shipment message falls back to SHIPMENT_SAVE_FAILED", () => {
    const code = mapShipmentError({ message: "some_never_seen_raw_postgres_text" });
    expect(code).toBe(ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED);
  });

  it("a null/undefined error (no error at all) still returns a safe fallback, never throws", () => {
    expect(mapOrderError(undefined)).toBe(ACTION_FEEDBACK.ORDER_SAVE_FAILED);
    expect(mapOrderError(null)).toBe(ACTION_FEEDBACK.ORDER_SAVE_FAILED);
  });

  it("never logs the raw message text itself (only the sqlstate-shaped code)", () => {
    mapOrderError({ message: "a message that must never be logged verbatim", code: "42501" });
    const [, context] = consoleErrorSpy.mock.calls[0]!;
    expect(JSON.stringify(context)).not.toMatch(/must never be logged verbatim/);
  });
});

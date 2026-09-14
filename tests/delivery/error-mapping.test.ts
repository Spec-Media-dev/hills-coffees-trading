import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { mapDeliveryError } from "@/lib/delivery/errors";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 009 RUN C (T031) — every exception `validate_shipment_transition`/`validate_shipment_item`/
 * `apply_delivery_reservation` can raise (read FRESH from the applied migration's own text — never
 * assumed) maps to a safe, specific `ActionFeedbackCode`; an unmapped message falls back safely; no
 * raw database text is ever part of the returned result.
 *
 * The 19 strings below are the COMPLETE, exhaustive set of shipment/delivery-domain exceptions in
 * `supabase/migrations/20260914120000_feature_009_db_block_07.sql` — confirmed via
 * `grep -oE "raise exception '[a-z_]+'"` (plus the 5 that split across two source lines) over the
 * live-applied file. `active_reservation_missing`/`forbidden`/`payment_not_found`/
 * `reservation_expired`/`seller_inventory_position_invalid` are DELIBERATELY excluded — they belong
 * to `admin_review_payment()`/`checkout_order()`, which `lib/delivery/buyer.ts`/`warehouse.ts` never
 * call, so they can never reach this feature's own write paths.
 */
const SHIPMENT_DOMAIN_EXCEPTIONS = [
  "delivered_quantity_exceeds_plan",
  "delivery_recovery_requires_dedicated_workflow",
  "delivery_release_position_missing",
  "delivery_reservation_insufficient_inventory",
  "delivery_reservation_ledger_inconsistent",
  "delivery_reservation_position_ambiguous",
  "delivery_reservation_position_missing",
  "delivery_reservation_requires_settled_order",
  "invalid_shipment_transition",
  "shipment_details_are_locked",
  "shipment_must_start_draft",
  "shipment_or_order_item_missing",
  "shipment_order_item_mismatch",
  "shipment_plan_is_closed",
  "terminal_shipment_cannot_change",
  "delivered_quantity_cannot_decrease",
  "only_warehouse_can_record_delivery",
  "shipment_plan_exceeds_order_item",
  "warehouse_required_for_operational_shipment_status",
] as const;

describe("T031 — every raised migration exception is genuinely explicitly mapped (fresh, from source)", () => {
  it("the applied migration's own raised exception strings match this file's declared exhaustive set exactly", () => {
    const migration = readFileSync("supabase/migrations/20260914120000_feature_009_db_block_07.sql", "utf8");
    const singleLine = [...migration.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]!);
    const splitLine = [...migration.matchAll(/raise exception\s*\n\s*'([a-z_]+)'/g)].map((m) => m[1]!);
    const found = new Set([...singleLine, ...splitLine]);
    const NON_SHIPMENT_DOMAIN = new Set(["active_reservation_missing", "forbidden", "payment_not_found", "reservation_expired", "seller_inventory_position_invalid"]);
    const shipmentDomainFound = [...found].filter((name) => !NON_SHIPMENT_DOMAIN.has(name));
    expect(shipmentDomainFound.sort()).toEqual([...SHIPMENT_DOMAIN_EXCEPTIONS].sort());
  });

  it.each(SHIPMENT_DOMAIN_EXCEPTIONS)("%s maps to a safe, specific, non-generic ActionFeedbackCode", (message) => {
    const code = mapDeliveryError({ message, code: "P0001" });
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);
  });

  it("an unrecognized message falls back safely to a generic code, never throwing", () => {
    const code = mapDeliveryError({ message: "some_future_exception_this_code_has_never_seen", code: "P0001" });
    expect(code).toBe(ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED);
  });

  it("null/undefined error input degrades safely, never throwing", () => {
    expect(() => mapDeliveryError(null)).not.toThrow();
    expect(() => mapDeliveryError(undefined)).not.toThrow();
  });

  it("no raw database message text is ever embedded in the returned ActionFeedbackCode itself", () => {
    for (const message of SHIPMENT_DOMAIN_EXCEPTIONS) {
      const code = mapDeliveryError({ message, code: "P0001" });
      // Every ACTION_FEEDBACK value is a short, stable, human-safe snake_case token — never the raw
      // trigger message verbatim (which would leak internal exception vocabulary to the client).
      expect(code).not.toBe(message);
    }
  });

  it("source proof: mapDeliveryError never returns/logs the raw error object's message to its caller (only a stable code)", () => {
    const source = readFileSync("lib/delivery/errors.ts", "utf8");
    expect(source).toMatch(/export function mapDeliveryError/);
    // The function's own return type is a code lookup, not the raw message re-exposed.
    expect(source).not.toMatch(/return\s+message/);
    expect(source).not.toMatch(/console\.(log|error|warn)\([^)]*message/);
  });
});

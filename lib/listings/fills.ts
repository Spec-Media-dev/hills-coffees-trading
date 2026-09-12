import type { FillProjection, FillState } from "@/lib/listings/types";

/**
 * Feature 006 T005 — the fill/remaining-quantity projection. Pure, non-persisted, deterministic:
 * takes the THREE stored `coffee_offers` columns (`quantity_kg`, `reserved_quantity_kg`,
 * `filled_quantity_kg` — never `order_items`/`inventory_reservation_items` rows, never a tally) and
 * projects `remaining = quantity_kg - reserved_quantity_kg - filled_quantity_kg`, exactly the
 * database's own invariant (`coffee_offers_quantities_check`:
 * `filled_quantity_kg + reserved_quantity_kg <= quantity_kg`).
 *
 * This is Feature 006's OWN business-rule projection over its OWN table's stored facts — NOT a
 * recomputation of Feature 005's inventory truth (`lib/inventory/*` never performs this subtraction
 * on `inventory_positions`, and this function never touches `inventory_positions` at all). The two
 * are different tables with different owners: `coffee_offers`' reserved/filled columns are written by
 * `checkout_order()` (007) and `admin_review_payment()` (008) respectively — this module only reads
 * and projects them, never writes them.
 *
 * INTEGRITY, NOT SILENT CLAMPING: if the three stored numbers ever yield a negative remainder (which
 * `coffee_offers_quantities_check` should make impossible), this function returns a controlled,
 * OBSERVABLE `{ ok: false, problem: "NEGATIVE_REMAINING" }` result — never `Math.max(0, remaining)`,
 * which would silently rewrite what the database actually stored.
 */
export function projectFillState({
  quantityKg,
  reservedQuantityKg,
  filledQuantityKg,
}: {
  quantityKg: number;
  reservedQuantityKg: number;
  filledQuantityKg: number;
}): FillProjection {
  const remainingQuantityKg = quantityKg - reservedQuantityKg - filledQuantityKg;

  if (remainingQuantityKg < 0) {
    return { ok: false, problem: "NEGATIVE_REMAINING", quantityKg, reservedQuantityKg, filledQuantityKg };
  }

  const state: FillState = remainingQuantityKg === 0 ? "SOLD_OUT" : filledQuantityKg > 0 ? "PARTIALLY_FILLED" : "AVAILABLE";

  return {
    ok: true,
    quantityKg,
    reservedQuantityKg,
    filledQuantityKg,
    remainingQuantityKg,
    state,
  };
}

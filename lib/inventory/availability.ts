import { createClient } from "@/lib/supabase/server";
import type { AvailabilityBreakdown, InventoryEligibilityFacts, ReservationCause } from "@/lib/inventory/types";

/**
 * Feature 005 T005/T006 — availability presentation and Feature 006's eligibility facts. This is the
 * single most security/integrity-sensitive file in Feature 005 (SRS LOT-02): it is where a
 * well-meaning agent would most easily reintroduce a client-side inventory calculation. It does not.
 *
 * `available_quantity_kg` and `reserved_quantity_kg` (`inventory_positions`' own columns) are read
 * and returned VERBATIM. This file contains no arithmetic operator applied to either field — no
 * subtraction, addition, multiplication or division combining them or deriving a third figure. The
 * database is the sole authority for the LOT-02 invariant; this module only labels what it already
 * stores.
 *
 * RESERVATION-CAUSE SOURCE — `inventory_reservations` IS NEVER QUERIED HERE. That table is
 * admin-only (`reservations_admin`: `is_platform_admin()`, confirmed against the live schema report)
 * and this file does not read it, does not add a privileged API for it, and does not weaken its
 * policy. The approved member-readable sources are `inventory_reservation_items` (via
 * `reservation_items_view`'s `can_view_order`) and `orders.hold_expires_at`.
 *
 * CONFIRMED FINDING (DB-OPEN-12 — empirically proven live, 2026-09-12 reconciliation; not hidden, not
 * worked around): `inventory_reservation_items`' own read policy (`reservation_items_view`) is defined
 * as `(EXISTS (SELECT 1 FROM inventory_reservations ir WHERE ir.id = ... AND can_view_order(ir.order_id)))
 * OR is_platform_admin()`. Because that `EXISTS` is a plain subquery against `inventory_reservations`
 * (a table whose ONLY policy is `is_platform_admin()`), Postgres evaluates it under the CALLING role's
 * own row security — so for an ordinary (non-admin) member the `EXISTS` can never be satisfied,
 * regardless of `can_view_order`'s own result.
 *
 * This was PROVEN LIVE, not left as theory: synthetic rows were seeded (service-role, setup/teardown
 * only — a warehouse, coffee_lot, coffee_offer, inventory_position, order, inventory_reservation and
 * inventory_reservation_item; all deleted immediately after) and read back through THREE real,
 * authenticated, non-privileged fixture sessions (`signInWithPassword`, never service-role):
 *   - the ORDER'S BUYER — correctly read the `orders` row (`hold_expires_at` visible, proving
 *     `can_view_order`/`orders_view` work exactly as designed) but got ZERO rows from
 *     `inventory_reservation_items` for the matching reservation, and zero from `inventory_reservations`
 *     (expected, admin-only) — despite a service-role sanity read confirming the row genuinely exists.
 *   - the OFFER'S SELLER (uninvolved in `orders_view`'s buyer/seller-of-order-item join here) — zero
 *     rows across all three tables.
 *   - an UNRELATED cross-org member — zero rows across all three tables.
 * So: `inventory_reservation_items` is confirmed UNREADABLE for every non-admin member today, even the
 * one party (the buyer) who can otherwise see the order itself — structurally similar to DB-OPEN-05's
 * `coffee_lots` predicate defect, but a distinct capability gap (tracked as DB-OPEN-12). This module
 * does NOT work around it: it attempts the approved read exactly as the plan describes, and — since
 * that read is now confirmed to always come back empty for a member — the reservation cause always
 * degrades honestly to `{ kind: "unknown" }` rather than failing or fabricating a reason. The
 * authoritative `reservedQuantityKg` value itself is unaffected (read directly off `inventory_positions`,
 * which the member CAN read) — only the cause/order-context behind it is unavailable. If this policy is
 * ever corrected (e.g. `reservation_items_view` wrapping its `EXISTS` in a `SECURITY DEFINER` helper,
 * the way `can_view_order` itself already is), this same code starts resolving real causes with no
 * changes required.
 */

export async function getAvailabilityBreakdown({
  organizationId,
  positionIds,
}: {
  organizationId: string;
  /** Optional narrowing to specific positions; omitted = every position for the acting organization. */
  positionIds?: readonly string[];
}): Promise<AvailabilityBreakdown[]> {
  const supabase = await createClient();

  const positionQuery = supabase
    .from("inventory_positions")
    .select("id, lot_id, available_quantity_kg, reserved_quantity_kg")
    .eq("owner_organization_id", organizationId);
  const { data: positionRows } = positionIds && positionIds.length > 0 ? await positionQuery.in("id", positionIds) : await positionQuery;

  const positions = positionRows ?? [];
  if (positions.length === 0) return [];

  const positionIdList = positions.map((row) => row.id);
  const causesByPositionId = await resolveReservationCauses(supabase, positionIdList);

  return positions.map((row) => ({
    positionId: row.id,
    lotId: row.lot_id,
    availableQuantityKg: Number(row.available_quantity_kg),
    reservedQuantityKg: Number(row.reserved_quantity_kg),
    reservationCauses: causesByPositionId.get(row.id) ?? (Number(row.reserved_quantity_kg) > 0 ? [{ kind: "unknown" }] : []),
  }));
}

/**
 * Attempts the approved chain: `inventory_reservation_items` (by `inventory_position_id`) →
 * `inventory_reservations` (only to find the linked `order_id`; NEVER filtered/selected beyond that
 * one column, and this read is expected to come back empty for an ordinary member per the header
 * comment above) → `orders.hold_expires_at`/`order_code`, itself gated by `can_view_order` via that
 * table's own `orders_view` policy. Every step is a plain, RLS-respecting read through the caller's
 * own session — no service-role, no bypass.
 */
async function resolveReservationCauses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  positionIds: readonly string[]
): Promise<Map<string, ReservationCause[]>> {
  const result = new Map<string, ReservationCause[]>();
  if (positionIds.length === 0) return result;

  const { data: reservationItemRows } = await supabase
    .from("inventory_reservation_items")
    .select("reservation_id, inventory_position_id")
    .in("inventory_position_id", positionIds);

  const items = reservationItemRows ?? [];
  if (items.length === 0) return result;

  const reservationIds = [...new Set(items.map((item) => item.reservation_id))];
  const { data: reservationRows } = await supabase.from("inventory_reservations").select("id, order_id").in("id", reservationIds);

  const orderIdByReservationId = new Map((reservationRows ?? []).map((row) => [row.id, row.order_id]));
  const orderIds = [...new Set([...orderIdByReservationId.values()])];

  const orderById = new Map<string, { order_code: string | null; hold_expires_at: string | null }>();
  if (orderIds.length > 0) {
    const { data: orderRows } = await supabase.from("orders").select("id, order_code, hold_expires_at").in("id", orderIds);
    for (const row of orderRows ?? []) orderById.set(row.id, { order_code: row.order_code, hold_expires_at: row.hold_expires_at });
  }

  for (const item of items) {
    const orderId = orderIdByReservationId.get(item.reservation_id);
    const order = orderId ? orderById.get(orderId) : undefined;
    const cause: ReservationCause = order
      ? { kind: "order", orderId: orderId!, orderCode: order.order_code, holdExpiresAt: order.hold_expires_at }
      : { kind: "unknown" };
    const existing = result.get(item.inventory_position_id) ?? [];
    existing.push(cause);
    result.set(item.inventory_position_id, existing);
  }
  return result;
}

/**
 * Feature 006 T006 — FACTS only, no listing-eligibility decision. See
 * `lib/inventory/types.ts#InventoryEligibilityFacts`'s header comment for exactly what is and is not
 * included and why. This function does not export or imply `isEligibleToList`/`canList`/
 * `listingAllowed`/`canResell` — Feature 006 owns that rule, over these facts.
 */
export async function getInventoryEligibilityFacts({
  organizationId,
}: {
  organizationId: string;
}): Promise<InventoryEligibilityFacts[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("inventory_positions")
    .select("id, lot_id, owner_organization_id, warehouse_id, available_quantity_kg, reserved_quantity_kg")
    .eq("owner_organization_id", organizationId);

  return (rows ?? []).map((row) => ({
    positionId: row.id,
    lotId: row.lot_id,
    ownerOrganizationId: row.owner_organization_id,
    warehouseId: row.warehouse_id,
    availableQuantityKg: Number(row.available_quantity_kg),
    reservedQuantityKg: Number(row.reserved_quantity_kg),
  }));
}

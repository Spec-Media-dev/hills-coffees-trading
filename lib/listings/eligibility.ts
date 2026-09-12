import { createClient } from "@/lib/supabase/server";
import { getInventoryPositionById } from "@/lib/inventory/positions";
import type { EligibilityResult } from "@/lib/listings/types";

/**
 * Feature 006 T004 — composes Feature 005's inventory FACTS into Feature 006's OWN listing
 * ELIGIBILITY RULE (SRS §8.1). This module does NOT duplicate or re-derive any Feature 005 quantity
 * computation as a stored/cached fact — `lib/inventory/*` still exposes only the two raw columns
 * (`availableQuantityKg`/`reservedQuantityKg`) verbatim; this file performs its OWN one-off business
 * comparison over those already-authoritative numbers, exactly mirroring what the database's own
 * `validate_offer_transition` trigger computes internally
 * (`v_inventory.available_quantity_kg - v_inventory.reserved_quantity_kg`) — never a third persisted
 * "eligible quantity" field bolted onto 005's DTOs.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * PREFLIGHT — FEATURE 005 FACTS vs FEATURE 006 REQUIRED FACTS (2026-09-12)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Required                          | Source                                          | Status
 * -----------------------------------|--------------------------------------------------|----------
 * Org owns the inventory position    | 005 `getInventoryPositionById` (org-scoped)       | ✅ exists
 * `organization_can_sell()`          | already resolved onto `identity.organization.canSell` (003) | ✅ exists — reused, not re-derived
 * Hills-sourced / purchase provenance| `order_items`/`orders` (`can_view_order`-gated), read directly by THIS file — genuinely different data than inventory, not a 005 fact at all | ✅ exists (own read)
 * Approved custody                   | `warehouses.is_active` — the ONLY custody-adjacent fact the schema currently represents (no HOLD/VARIANCE/QUARANTINE model — Feature 005 Phase 3 confirmed this gap) | ✅ exists (narrow 005 extension this run: `InventoryWarehouseContext.isActive`) — NOT a "Hills-approved custody" flag, just the warehouse's own operational-active bit; documented honestly as the best available proxy, not invented
 * Reserved / eligible quantity        | 005's `availableQuantityKg`/`reservedQuantityKg`  | ✅ exists
 * Delivery reservation (SRS DEL-01)  | **NO representable fact** — confirmed against `docs/architecture/DATABASE-CAPABILITY-MAP.md` (DB-BLOCK-07: "A delivery request does not reserve inventory... no delivery-reservation function exists"). This function CANNOT check it and does NOT claim to. | ❌ GAP — honestly unenforced here (see below)
 *
 * HONEST GAP (not invented, not silently skipped): spec.md's PS3 acceptance scenario 5 ("Given
 * inventory reserved for delivery, when listing is attempted against it, then it is refused") cannot
 * be satisfied by this function today — there is no `delivery_reservations` table, column, or function
 * this run's preflight could find. If DB-BLOCK-07 is ever resolved (009 exposes a real
 * delivery-reservation fact), this function should be extended to check it; until then, a position
 * with an undisclosed delivery hold would still show `eligible: true` here. This is recorded in the
 * Feature 006 handoff as an open blocker, not silently claimed as enforced.
 */

const HILLS_SOURCE_ELIGIBLE_ORDER_STATUSES = ["PAID", "FULFILLMENT_IN_PROGRESS", "PARTIALLY_DELIVERED", "COMPLETED"] as const;

export async function checkListingEligibility({
  organizationId,
  canSell,
  positionId,
  requestedQuantityKg,
}: {
  organizationId: string;
  /** `identity.organization.canSell` — already resolved via `organization_can_sell()` by Feature 003's `getRequestIdentity()`. NEVER re-derived here, never a client-supplied boolean. */
  canSell: boolean;
  positionId: string;
  requestedQuantityKg: number;
}): Promise<EligibilityResult> {
  if (!canSell) {
    return { eligible: false, reason: "SELLER_NOT_CAPABLE", eligibleQuantityKg: null };
  }

  const position = await getInventoryPositionById({ organizationId, positionId });
  if (!position) {
    // Identical to "does not exist" — this function never distinguishes "not yours" from "no such
    // position," matching 005's own cross-tenant privacy convention.
    return { eligible: false, reason: "POSITION_NOT_OWNED", eligibleQuantityKg: null };
  }

  // Custody: the ONLY authoritative custody-adjacent fact currently available (see this file's own
  // preflight table). A position with no resolvable warehouse context, or an explicitly inactive
  // warehouse, is treated as not custody-eligible.
  if (!position.warehouse || !position.warehouse.isActive) {
    return { eligible: false, reason: "CUSTODY_NOT_ELIGIBLE", eligibleQuantityKg: null };
  }

  // The tradable-now figure — the database's own semantic model (proven live during the Feature 005
  // reconciliation's `checkout_order`/`validate_offer_transition` evidence), computed here as THIS
  // feature's own business rule, never persisted back onto 005's types.
  const eligibleQuantityKg = position.availableQuantityKg - position.reservedQuantityKg;

  const provenance = await findHillsSourceProvenance(organizationId, position.lotId);
  if (!provenance) {
    return { eligible: false, reason: "NOT_HILLS_SOURCED", eligibleQuantityKg };
  }

  if (eligibleQuantityKg <= 0) {
    return { eligible: false, reason: "RESERVED_QUANTITY", eligibleQuantityKg: 0 };
  }

  if (requestedQuantityKg > eligibleQuantityKg) {
    return { eligible: false, reason: "INSUFFICIENT_QUANTITY", eligibleQuantityKg };
  }

  return { eligible: true, eligibleQuantityKg, sourcePurchaseOrderItemId: provenance };
}

/**
 * Finds a settled `order_items` row proving this organization legitimately purchased THIS lot through
 * the platform's own order system — the exact predicate `validate_offer_transition`'s
 * `member_listing_requires_purchase_source`/`invalid_member_listing_purchase_source` branches enforce
 * at write time (`oi.lot_id = lot_id AND o.buyer_organization_id = organizationId AND o.status IN
 * (...)`). This is NOT an inventory fact (`inventory_positions` has no such column) — it is read
 * directly here, through the caller's own RLS-respecting session
 * (`order_items_view`/`orders_view`, both gated by `can_view_order`, confirmed member-readable during
 * the Feature 005 reconciliation's T010 proof). Returns the FIRST matching `order_items.id`
 * (deterministic, oldest first) or `null` if none exists — never a service-role read, never a
 * fabricated id.
 *
 * NAMING NOTE: "Hills-sourced" on this platform means "acquired through a Hills-mediated, settled
 * order" — NOT literally "the original seller was Hills." The trigger's own predicate does not check
 * the order_item's `seller_type_snapshot`, so a legitimate resale chain (member bought from another
 * member's earlier resale listing) also satisfies this — which is exactly the point of a resale
 * marketplace. This function's refusal code (`NOT_HILLS_SOURCED`) is named to match the run
 * directive's own vocabulary, documented here so a future reader does not over-read it as "originally
 * owned by Hills."
 */
async function findHillsSourceProvenance(organizationId: string, lotId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: orderItemRows } = await supabase.from("order_items").select("id, order_id, lot_id").eq("lot_id", lotId).order("created_at", { ascending: true });
  const candidates = orderItemRows ?? [];
  if (candidates.length === 0) return null;

  const orderIds = [...new Set(candidates.map((row) => row.order_id))];
  const { data: orderRows } = await supabase.from("orders").select("id, buyer_organization_id, status").in("id", orderIds);
  const eligibleOrderIds = new Set(
    (orderRows ?? [])
      .filter((row) => row.buyer_organization_id === organizationId && (HILLS_SOURCE_ELIGIBLE_ORDER_STATUSES as readonly string[]).includes(row.status))
      .map((row) => row.id)
  );

  const match = candidates.find((row) => eligibleOrderIds.has(row.order_id));
  return match ? match.id : null;
}

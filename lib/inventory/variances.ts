import { createClient } from "@/lib/supabase/server";
import type { InventoryHold, InventoryHoldKind } from "@/lib/inventory/types";

/**
 * Feature 005 T014 / DB-OPEN-19 — the READ side of custody trust (SRS LOT-04): which of the acting organization's
 * positions currently have an OPEN variance / hold / quarantine case.
 *
 * READ-ONLY. This module contains no write, no RPC and no Server Action: the ONLY writers are the two warehouse-operator
 * database functions `record_inventory_variance()` / `resolve_inventory_variance()` (their console screens belong to
 * Feature 010). It exists so a member can SEE that stock is held (PS5 scenario 1) and so Feature 006's eligibility rule can
 * refuse a listing early with a clear reason — it is NOT the enforcement. Enforcement is in the database:
 * `guard_inventory_position_hold` (no new reservation, no consumption, no re-quantifying), `guard_offer_inventory_hold`
 * (no listing created / submitted / approved / published) and `guard_shipment_inventory_hold` (no delivery request or
 * progression) refuse the write regardless of what any caller believed — including a caller that skipped this module.
 *
 * ONE DEFINITION OF "OPEN": the view `inventory_position_holds` (a RECORDED event with no RESOLVED sibling). This file reads it
 * through the MEMBER-facing view `inventory_position_hold_notices`, which selects from it, keeps only the acting member's own
 * organization's cases and has NO reason / actor / correlation column — the operator's working notes are unreachable from a member
 * session by the database itself (hardening H3), not merely omitted here. It never re-derives openness from the event history and
 * never subtracts quantities (the difference is a generated database column).
 *
 * SCOPING: reads run under the member's own session (the notices view applies `is_org_member` on the owning organization), AND the
 * requested position ids are first narrowed to positions the ACTING organization owns — a multi-organization user gets the
 * acting organization's positions only, exactly like `lib/inventory/positions.ts`. No service-role client, no cache.
 *
 * FAILURE MODE (deliberate, documented): a failed read returns NO holds. That is safe ONLY because this module is advisory —
 * the database triggers are the authority — and it keeps a transient read error from breaking the inventory page. It is never
 * used to GRANT anything.
 */

type HoldRow = {
  variance_id: string;
  inventory_position_id: string;
  kind: string;
  recorded_quantity_kg: string | number;
  counted_quantity_kg: string | number;
  variance_quantity_kg: string | number;
  recorded_at: string;
};

const HOLD_KINDS: readonly InventoryHoldKind[] = ["VARIANCE", "HOLD", "QUARANTINE"];

/** Explicit column allowlist — the operator's `reason` and `actor_user_id` are never selected (and the view has no such column). */
const HOLD_COLUMNS = "variance_id, inventory_position_id, kind, recorded_quantity_kg, counted_quantity_kg, variance_quantity_kg, recorded_at";

function mapHold(row: HoldRow): InventoryHold | null {
  if (!HOLD_KINDS.includes(row.kind as InventoryHoldKind)) return null; // an unknown kind is never guessed at
  return {
    varianceId: row.variance_id,
    positionId: row.inventory_position_id,
    kind: row.kind as InventoryHoldKind,
    recordedAt: row.recorded_at,
    recordedQuantityKg: Number(row.recorded_quantity_kg),
    countedQuantityKg: Number(row.counted_quantity_kg),
    varianceQuantityKg: Number(row.variance_quantity_kg),
  };
}

/** The open cases of the acting organization's positions, keyed by position id. Positions with no open case are absent. */
export async function getOpenInventoryHolds({
  organizationId,
  positionIds,
}: {
  organizationId: string;
  positionIds: readonly string[];
}): Promise<Map<string, InventoryHold>> {
  const holds = new Map<string, InventoryHold>();
  if (positionIds.length === 0) return holds;

  const supabase = await createClient();

  const { data: ownedRows } = await supabase.from("inventory_positions").select("id").eq("owner_organization_id", organizationId).in("id", [...positionIds]);
  const ownedIds = (ownedRows ?? []).map((row: { id: string }) => row.id);
  if (ownedIds.length === 0) return holds;

  const { data, error } = await supabase.from("inventory_position_hold_notices").select(HOLD_COLUMNS).in("inventory_position_id", ownedIds).order("recorded_at", { ascending: true });
  if (error) return holds;

  for (const row of (data ?? []) as HoldRow[]) {
    const hold = mapHold(row);
    if (hold && !holds.has(hold.positionId)) holds.set(hold.positionId, hold); // at most one open case per position (database-enforced)
  }
  return holds;
}

/** The open case of ONE of the acting organization's positions, or `null`. */
export async function getOpenInventoryHold({ organizationId, positionId }: { organizationId: string; positionId: string }): Promise<InventoryHold | null> {
  return (await getOpenInventoryHolds({ organizationId, positionIds: [positionId] })).get(positionId) ?? null;
}

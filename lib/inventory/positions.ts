import { createClient } from "@/lib/supabase/server";
import type { InventoryLotDetail, InventoryPosition, InventoryWarehouseContext, PaginatedResult } from "@/lib/inventory/types";

/**
 * Feature 005 T002 — SERVER-ONLY, org-scoped, paginated reads of `inventory_positions`
 * (this file imports `lib/supabase/server`, which pulls in `next/headers` — never import it from a
 * Client Component). Every read runs under the caller's own request-scoped, RLS-respecting client —
 * never the service-role key (SEC-001).
 *
 * ACTING-ORGANIZATION AUTHORITY: `organizationId` MUST be the caller's already-resolved
 * `identity.organization.organizationId` (Feature 003/004's acting-organization truth,
 * `getRequestIdentity()` — never `organizations[0]`, a raw client parameter, or any other untrusted
 * source). This mirrors the same established pattern `lib/kyb/status.ts#getKybWorkspace` already
 * uses. RLS (`inventory_owner_read`: `is_org_member(owner_organization_id) OR is_warehouse_operator()
 * OR is_auditor()`) is the real security boundary regardless — a caller could not read another
 * organization's positions even with a wrong id — but explicit scoping here is still required for
 * CORRECTNESS: `is_org_member()` alone would return rows across every organization a multi-org user
 * belongs to, not only their currently-acting one.
 *
 * DB-OPEN-05 DEGRADATION (FR-011): `coffee_lots`'s member-read policy (`member_read_trade_lots`) has
 * a predicate — `co.lot_id = co.id` inside `coffee_offers` — that compares a value to itself on the
 * WRONG table and is never satisfiable for an ordinary member session (confirmed directly against
 * the live `database-schema-report.json`; still recorded OPEN in
 * `docs/architecture/DATABASE-CAPABILITY-MAP.md`). This function does not work around that: it
 * attempts the lot/coffee join, and when RLS silently filters those rows to nothing, the position is
 * still returned with `lot: null` — never a fabricated value, never a failed position list.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function getInventoryPositions({
  organizationId,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  organizationId: string;
  /** Zero-based page index. */
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResult<InventoryPosition>> {
  const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, page) * boundedPageSize;
  const to = from + boundedPageSize; // fetch one extra row to detect `hasMore` without a second count query

  const supabase = await createClient();

  const { data: positionRows } = await supabase
    .from("inventory_positions")
    .select("id, lot_id, owner_organization_id, warehouse_id, warehouse_location_id, available_quantity_kg, reserved_quantity_kg, created_at, updated_at")
    .eq("owner_organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // deterministic tie-break when created_at collides
    .range(from, to);

  const rows = positionRows ?? [];
  const hasMore = rows.length > boundedPageSize;
  const pageRows = hasMore ? rows.slice(0, boundedPageSize) : rows;

  if (pageRows.length === 0) {
    return { rows: [], hasMore: false };
  }

  const lotIds = [...new Set(pageRows.map((row) => row.lot_id))];
  const warehouseIds = [...new Set(pageRows.map((row) => row.warehouse_id))];
  const warehouseLocationIds = [...new Set(pageRows.map((row) => row.warehouse_location_id).filter((id): id is string => id !== null))];

  const [lotDetailByLotId, warehouseContextByCompositeKey] = await Promise.all([
    getLotDetailByLotId(supabase, lotIds),
    getWarehouseContext(supabase, warehouseIds, warehouseLocationIds),
  ]);

  const positions: InventoryPosition[] = pageRows.map((row) => ({
    id: row.id,
    lotId: row.lot_id,
    ownerOrganizationId: row.owner_organization_id,
    warehouseId: row.warehouse_id,
    warehouseLocationId: row.warehouse_location_id,
    availableQuantityKg: Number(row.available_quantity_kg),
    reservedQuantityKg: Number(row.reserved_quantity_kg),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lot: lotDetailByLotId.get(row.lot_id) ?? null,
    warehouse: warehouseContextByCompositeKey.get(warehouseKey(row.warehouse_id, row.warehouse_location_id)) ?? null,
  }));

  return { rows: positions, hasMore };
}

/**
 * Feature 005 RUN B (T008) — single-position lookup, org-scoped exactly like `getInventoryPositions`
 * above. Returns `null` for BOTH "no such position" and "exists but belongs to another organization"
 * — the same explicit `.eq("owner_organization_id", organizationId)` filter makes both cases
 * indistinguishable at this layer, which is exactly what the caller (the detail page) needs to avoid
 * leaking cross-tenant existence: it must call `notFound()` for `null` with no further branching.
 */
export async function getInventoryPositionById({
  organizationId,
  positionId,
}: {
  organizationId: string;
  positionId: string;
}): Promise<InventoryPosition | null> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("inventory_positions")
    .select("id, lot_id, owner_organization_id, warehouse_id, warehouse_location_id, available_quantity_kg, reserved_quantity_kg, created_at, updated_at")
    .eq("id", positionId)
    .eq("owner_organization_id", organizationId)
    .maybeSingle();

  if (!row) return null;

  const [lotDetailByLotId, warehouseContextByCompositeKey] = await Promise.all([
    getLotDetailByLotId(supabase, [row.lot_id]),
    getWarehouseContext(supabase, [row.warehouse_id], row.warehouse_location_id ? [row.warehouse_location_id] : []),
  ]);

  return {
    id: row.id,
    lotId: row.lot_id,
    ownerOrganizationId: row.owner_organization_id,
    warehouseId: row.warehouse_id,
    warehouseLocationId: row.warehouse_location_id,
    availableQuantityKg: Number(row.available_quantity_kg),
    reservedQuantityKg: Number(row.reserved_quantity_kg),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lot: lotDetailByLotId.get(row.lot_id) ?? null,
    warehouse: warehouseContextByCompositeKey.get(warehouseKey(row.warehouse_id, row.warehouse_location_id)) ?? null,
  };
}

/**
 * Feature 005 RUN B (T015) — a bounded COUNT-only read for the dashboard overview's "what did I buy"
 * contribution. `{ count: "exact", head: true }` issues a single Postgres count aggregate with no row
 * data returned — never a full scan of the organization's positions merely to size a summary card.
 */
export async function getInventoryPositionsCount({ organizationId }: { organizationId: string }): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("inventory_positions")
    .select("id", { count: "exact", head: true })
    .eq("owner_organization_id", organizationId);
  return count ?? 0;
}

/**
 * Attempts the lot → coffee join through the ONLY approved member-readable paths. Under current RLS
 * this map will be empty for an ordinary member (DB-OPEN-05) — that is expected and handled by the
 * caller via `lot: null`, not treated as an error. If DB-OPEN-05 is ever resolved, this same code
 * starts populating lot context with no changes required.
 */
async function getLotDetailByLotId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lotIds: readonly string[]
): Promise<Map<string, InventoryLotDetail>> {
  if (lotIds.length === 0) return new Map();

  const { data: lotRows } = await supabase
    .from("coffee_lots")
    .select("id, coffee_id, lot_code, crop_year, quality_grade, cup_score")
    .in("id", lotIds);

  const result = new Map<string, InventoryLotDetail>();
  if (!lotRows || lotRows.length === 0) return result;

  const coffeeIds = [...new Set(lotRows.map((row) => row.coffee_id).filter((id): id is string => id !== null))];
  const coffeeNameById = new Map<string, string>();
  if (coffeeIds.length > 0) {
    const { data: coffeeRows } = await supabase.from("coffees").select("id, name").in("id", coffeeIds);
    for (const coffee of coffeeRows ?? []) coffeeNameById.set(coffee.id, coffee.name);
  }

  for (const lotRow of lotRows) {
    result.set(lotRow.id, {
      lotId: lotRow.id,
      lotCode: lotRow.lot_code,
      cropYear: lotRow.crop_year,
      qualityGrade: lotRow.quality_grade,
      cupScore: lotRow.cup_score === null ? null : Number(lotRow.cup_score),
      coffeeId: lotRow.coffee_id,
      coffeeName: lotRow.coffee_id ? (coffeeNameById.get(lotRow.coffee_id) ?? null) : null,
    });
  }
  return result;
}

function warehouseKey(warehouseId: string, warehouseLocationId: string | null): string {
  return `${warehouseId}:${warehouseLocationId ?? ""}`;
}

/**
 * Deliberately narrow projection (`code`/`name`/`city`/`country_code` only — no `address`, even
 * though `warehouses`' own `public_read_warehouses` RLS already permits public read of it) per
 * spec.md's warehouse-context requirement, kept conservative rather than exposing everything simply
 * because it is joinable.
 */
async function getWarehouseContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  warehouseIds: readonly string[],
  warehouseLocationIds: readonly string[]
): Promise<Map<string, InventoryWarehouseContext>> {
  const result = new Map<string, InventoryWarehouseContext>();
  if (warehouseIds.length === 0) return result;

  const [{ data: warehouseRows }, { data: locationRows }] = await Promise.all([
    supabase.from("warehouses").select("id, code, name, city, country_code, is_active").in("id", warehouseIds),
    warehouseLocationIds.length > 0
      ? supabase.from("warehouse_locations").select("id, warehouse_id, code, name").in("id", warehouseLocationIds)
      : Promise.resolve({ data: [] as { id: string; warehouse_id: string; code: string; name: string }[] }),
  ]);

  const warehouseById = new Map((warehouseRows ?? []).map((row) => [row.id, row]));

  for (const warehouseRow of warehouseRows ?? []) {
    // A position with `warehouse_location_id: null` still gets warehouse-level context.
    result.set(warehouseKey(warehouseRow.id, null), {
      warehouseId: warehouseRow.id,
      code: warehouseRow.code,
      name: warehouseRow.name,
      city: warehouseRow.city,
      countryCode: warehouseRow.country_code,
      isActive: warehouseRow.is_active,
      locationId: null,
      locationCode: null,
      locationName: null,
    });
  }
  for (const locationRow of locationRows ?? []) {
    const warehouseRow = warehouseById.get(locationRow.warehouse_id);
    if (!warehouseRow) continue;
    result.set(warehouseKey(locationRow.warehouse_id, locationRow.id), {
      warehouseId: warehouseRow.id,
      code: warehouseRow.code,
      name: warehouseRow.name,
      city: warehouseRow.city,
      countryCode: warehouseRow.country_code,
      isActive: warehouseRow.is_active,
      locationId: locationRow.id,
      locationCode: locationRow.code,
      locationName: locationRow.name,
    });
  }
  return result;
}

import { createClient } from "@/lib/supabase/server";
import type { PaginatedResult, StorageAllocation } from "@/lib/inventory/types";

/**
 * Feature 005 T003 — SERVER-ONLY, org-scoped, read-only reads of `storage_allocations`
 * (imports `lib/supabase/server` — never import from a Client Component). RLS
 * (`storage_owner_read`: `is_org_member(owner_organization_id) OR is_warehouse_operator() OR
 * is_auditor()`) is the real boundary; `organizationId` here is the caller's already-resolved acting
 * organization (`identity.organization.organizationId`), scoping for correctness the same way
 * `lib/inventory/positions.ts` documents.
 *
 * `status` is passed through as the database's own closed vocabulary (`STORED`/`RELEASED`/
 * `DELIVERED`, the table's own CHECK constraint) — never renamed or replaced with an invented
 * synonym. `quantityKg`/`releasedQuantityKg` are two SEPARATE stored facts, never one derived from
 * the other (the database's own CHECK already guarantees `0 <= released_quantity_kg <=
 * quantity_kg`).
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function getStorageAllocations({
  organizationId,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  organizationId: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResult<StorageAllocation>> {
  const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, page) * boundedPageSize;
  const to = from + boundedPageSize;

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("storage_allocations")
    .select("id, order_item_id, owner_organization_id, lot_id, warehouse_id, warehouse_location_id, quantity_kg, released_quantity_kg, status, started_at, released_at")
    .eq("owner_organization_id", organizationId)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const allRows = rows ?? [];
  const hasMore = allRows.length > boundedPageSize;
  const pageRows = hasMore ? allRows.slice(0, boundedPageSize) : allRows;

  const allocations: StorageAllocation[] = pageRows.map((row) => ({
    id: row.id,
    orderItemId: row.order_item_id,
    ownerOrganizationId: row.owner_organization_id,
    lotId: row.lot_id,
    warehouseId: row.warehouse_id,
    warehouseLocationId: row.warehouse_location_id,
    quantityKg: Number(row.quantity_kg),
    releasedQuantityKg: Number(row.released_quantity_kg),
    status: row.status as StorageAllocation["status"],
    startedAt: row.started_at,
    releasedAt: row.released_at,
  }));

  return { rows: allocations, hasMore };
}

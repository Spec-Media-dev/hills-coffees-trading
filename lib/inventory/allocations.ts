import { createClient } from "@/lib/supabase/server";
import type { PaginatedResult, StorageAllocation, StorageAllocationOrderContext } from "@/lib/inventory/types";

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
 *
 * ORIGINATING ORDER CONTEXT (T010, RUN B reconciliation) — see
 * `lib/inventory/types.ts#StorageAllocationOrderContext`'s doc comment for the full evidence. Unlike
 * `inventory_reservation_items` (DB-OPEN-12, genuinely unreadable for members), the chain
 * `storage_allocations.order_item_id` → `order_items` (`order_items_view`: `can_view_order(order_id)`)
 * → `orders` (`orders_view`: `can_view_order(id)`) is empirically confirmed member-readable — both
 * policies call the same `SECURITY DEFINER` helper directly, with no nesting into an admin-only
 * table. `resolveOrderContext` below attempts exactly this chain through the caller's own ordinary
 * session (never a privileged path) and degrades to `null` when the order_item is absent OR the read
 * comes back empty (RLS-denied) — never fabricated, never assumed.
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

  const orderItemIds = [...new Set(pageRows.map((row) => row.order_item_id).filter((id): id is string => id !== null))];
  const orderContextByOrderItemId = await resolveOrderContext(supabase, orderItemIds);

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
    order: row.order_item_id ? (orderContextByOrderItemId.get(row.order_item_id) ?? null) : null,
  }));

  return { rows: allocations, hasMore };
}

/**
 * Attempts `order_items` (by id, via `order_items_view`'s `can_view_order(order_id)`) → `orders` (by
 * the resolved `order_id`, via `orders_view`'s `can_view_order(id)`) through the caller's own
 * ordinary session — never a privileged path. Both reads are plain, RLS-respecting selects; an empty
 * result at either step (RLS-denied, or the row simply not existing) means that allocation's `order`
 * degrades to `null` in the caller, never a fabricated reference.
 */
async function resolveOrderContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderItemIds: readonly string[]
): Promise<Map<string, StorageAllocationOrderContext>> {
  const result = new Map<string, StorageAllocationOrderContext>();
  if (orderItemIds.length === 0) return result;

  const { data: orderItemRows } = await supabase.from("order_items").select("id, order_id").in("id", orderItemIds);
  const items = orderItemRows ?? [];
  if (items.length === 0) return result;

  const orderIds = [...new Set(items.map((item) => item.order_id))];
  const { data: orderRows } = await supabase.from("orders").select("id, order_code").in("id", orderIds);
  const orderCodeById = new Map((orderRows ?? []).map((row) => [row.id, row.order_code]));

  for (const item of items) {
    // Only surface the order context when `orders` itself actually resolved it (i.e. `can_view_order`
    // permitted the read) — an order_item row being readable does not by itself guarantee the order
    // row is (though in practice `can_view_order` gates both identically).
    if (!orderCodeById.has(item.order_id)) continue;
    result.set(item.id, { orderId: item.order_id, orderCode: orderCodeById.get(item.order_id) ?? null });
  }
  return result;
}

/**
 * Feature 005 RUN B (T015) — a bounded COUNT-only read for the dashboard overview's "where is it"
 * contribution, scoped to `STORED` (currently in Hills custody) so the figure answers "how much is
 * physically held right now," not the org's entire allocation history. Same `{ count: "exact", head:
 * true }` single-aggregate technique as `getInventoryPositionsCount` — no row data fetched.
 */
export async function getStoredAllocationsCount({ organizationId }: { organizationId: string }): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("storage_allocations")
    .select("id", { count: "exact", head: true })
    .eq("owner_organization_id", organizationId)
    .eq("status", "STORED");
  return count ?? 0;
}

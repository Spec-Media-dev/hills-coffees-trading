import { createClient } from "@/lib/supabase/server";
import type { ListingLotDetail, ListingStatusHistoryEntry, ListingWarehouseContext, ManagedListing, PaginatedListings } from "@/lib/listings/types";

/**
 * Feature 006 T003 — SERVER-ONLY seller management reads: the OWNING organization's OWN listings,
 * across ALL states, via `coffee_offers`' `offers_owner_or_admin` policy (`ALL` for
 * `is_org_member(seller_organization_id)` — a genuinely different, broader-visibility policy than
 * `browse.ts`'s published-only path). Kept in its OWN file, never merged with `browse.ts`, so which
 * path may return a non-published row is obvious from the import alone (plan.md architecture
 * decision 1) — there is no `getListings({ includePrivate: true })`-shaped ambiguous switch anywhere
 * in this feature.
 *
 * ACTING-ORGANIZATION AUTHORITY: `organizationId` MUST be the caller's already-resolved
 * `identity.organization.organizationId` — never `organizations[0]`, a URL/localStorage/hidden-form
 * value, or any other untrusted source. Mirrors `lib/inventory/positions.ts`'s own established
 * convention exactly. RLS is the real boundary regardless (a caller could not read another
 * organization's listings even with a wrong id) — explicit `.eq("seller_organization_id", ...)`
 * scoping exists for CORRECTNESS with a multi-org caller, not as the security boundary itself.
 *
 * NO service-role, no shared cache — every read is a fresh, request-scoped, RLS-respecting query.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const MANAGE_SELECT =
  "id, coffee_id, lot_id, seller_organization_id, seller_type, source_purchase_order_item_id, warehouse_id, title, quantity_kg, reserved_quantity_kg, filled_quantity_kg, price_per_kg, currency, status, is_visible, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at, deleted_at";

export async function getManagedListings({
  organizationId,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  organizationId: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedListings<ManagedListing>> {
  const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, page) * boundedPageSize;
  const to = from + boundedPageSize;

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("coffee_offers")
    .select(MANAGE_SELECT)
    .eq("seller_organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const allRows = rows ?? [];
  const hasMore = allRows.length > boundedPageSize;
  const pageRows = hasMore ? allRows.slice(0, boundedPageSize) : allRows;

  if (pageRows.length === 0) return { rows: [], hasMore: false };

  const [lotDetailByLotId, warehouseById, coffeeNameById] = await Promise.all([
    getLotDetailByLotId(
      supabase,
      pageRows.map((row) => row.lot_id)
    ),
    getWarehouseById(
      supabase,
      pageRows.map((row) => row.warehouse_id)
    ),
    getCoffeeNameById(
      supabase,
      pageRows.map((row) => row.coffee_id)
    ),
  ]);

  return { rows: pageRows.map((row) => mapManageRow(row, lotDetailByLotId, warehouseById, coffeeNameById)), hasMore };
}

/**
 * Single-listing lookup, org-scoped exactly like `lib/inventory/positions.ts#getInventoryPositionById`
 * — a nonexistent id and a cross-org id return the IDENTICAL `null`, so a caller cannot distinguish
 * "not yours" from "does not exist."
 */
export async function getManagedListingById({ organizationId, offerId }: { organizationId: string; offerId: string }): Promise<ManagedListing | null> {
  const supabase = await createClient();

  const { data: row } = await supabase.from("coffee_offers").select(MANAGE_SELECT).eq("id", offerId).eq("seller_organization_id", organizationId).maybeSingle();
  if (!row) return null;

  const [lotDetailByLotId, warehouseById, coffeeNameById] = await Promise.all([
    getLotDetailByLotId(supabase, [row.lot_id]),
    getWarehouseById(supabase, [row.warehouse_id]),
    getCoffeeNameById(supabase, [row.coffee_id]),
  ]);

  return mapManageRow(row, lotDetailByLotId, warehouseById, coffeeNameById);
}

/**
 * `listing_status_history` for one offer. RLS (`offer_history_view`:
 * `is_org_member(co.seller_organization_id)` via an EXISTS on `coffee_offers`, OR compliance/auditor)
 * is the real boundary — a cross-org `offerId` returns an empty array here with no error, never a
 * fabricated "not found" distinction. `organizationId` is accepted only to make the caller's intent
 * explicit in the API shape (matching every other function in this file); it is not itself re-checked
 * against the offer before the query, since RLS already makes a mismatched query return nothing.
 */
export async function getListingStatusHistory({ offerId }: { organizationId: string; offerId: string }): Promise<readonly ListingStatusHistoryEntry[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("listing_status_history")
    .select("id, offer_id, old_status, new_status, changed_by, reason, created_at")
    .eq("offer_id", offerId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  return (rows ?? []).map((row) => ({
    id: row.id,
    offerId: row.offer_id,
    oldStatus: row.old_status as ListingStatusHistoryEntry["oldStatus"],
    newStatus: row.new_status as ListingStatusHistoryEntry["newStatus"],
    changedBy: row.changed_by,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

type ManageRow = {
  id: string;
  coffee_id: string;
  lot_id: string;
  seller_organization_id: string;
  seller_type: string;
  source_purchase_order_item_id: string | null;
  warehouse_id: string;
  title: string | null;
  quantity_kg: number;
  reserved_quantity_kg: number;
  filled_quantity_kg: number;
  price_per_kg: number;
  currency: string;
  status: string;
  is_visible: boolean;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function mapManageRow(
  row: ManageRow,
  lotDetailByLotId: Map<string, ListingLotDetail>,
  warehouseById: Map<string, ListingWarehouseContext>,
  coffeeNameById: Map<string, string>
): ManagedListing {
  return {
    id: row.id,
    title: row.title,
    coffeeId: row.coffee_id,
    coffeeName: coffeeNameById.get(row.coffee_id) ?? null,
    lot: lotDetailByLotId.get(row.lot_id) ?? null,
    warehouse: warehouseById.get(row.warehouse_id) ?? null,
    sellerOrganizationId: row.seller_organization_id,
    sellerType: row.seller_type as ManagedListing["sellerType"],
    sourcePurchaseOrderItemId: row.source_purchase_order_item_id,
    quantityKg: Number(row.quantity_kg),
    reservedQuantityKg: Number(row.reserved_quantity_kg),
    filledQuantityKg: Number(row.filled_quantity_kg),
    pricePerKg: Number(row.price_per_kg),
    currency: row.currency,
    status: row.status as ManagedListing["status"],
    isVisible: row.is_visible,
    rejectionReason: row.rejection_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Mirrors `browse.ts`'s own DB-OPEN-05 attempt-then-degrade helper (kept file-local — no shared cross-file state). */
async function getLotDetailByLotId(supabase: Awaited<ReturnType<typeof createClient>>, lotIds: readonly string[]): Promise<Map<string, ListingLotDetail>> {
  const result = new Map<string, ListingLotDetail>();
  const ids = [...new Set(lotIds)];
  if (ids.length === 0) return result;

  const { data: lotRows } = await supabase.from("coffee_lots").select("id, coffee_id, lot_code, crop_year, quality_grade, cup_score").in("id", ids);
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

async function getWarehouseById(supabase: Awaited<ReturnType<typeof createClient>>, warehouseIds: readonly string[]): Promise<Map<string, ListingWarehouseContext>> {
  const result = new Map<string, ListingWarehouseContext>();
  const ids = [...new Set(warehouseIds)];
  if (ids.length === 0) return result;

  const { data: rows } = await supabase.from("warehouses").select("id, code, name, city, country_code").in("id", ids);
  for (const row of rows ?? []) {
    result.set(row.id, { warehouseId: row.id, code: row.code, name: row.name, city: row.city, countryCode: row.country_code });
  }
  return result;
}

async function getCoffeeNameById(supabase: Awaited<ReturnType<typeof createClient>>, coffeeIds: readonly string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const ids = [...new Set(coffeeIds)];
  if (ids.length === 0) return result;

  const { data: rows } = await supabase.from("coffees").select("id, name").in("id", ids);
  for (const row of rows ?? []) result.set(row.id, row.name);
  return result;
}

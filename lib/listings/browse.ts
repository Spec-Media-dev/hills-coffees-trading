import { createClient } from "@/lib/supabase/server";
import type { BuyerBrowseListing, BuyerListingDetail, ListingLotDetail, ListingWarehouseContext, PaginatedListings } from "@/lib/listings/types";

/**
 * Feature 006 T002 — SERVER-ONLY buyer marketplace reads (imports `lib/supabase/server`, which pulls
 * in `next/headers` — never import from a Client Component). Every read runs under the caller's own
 * request-scoped, RLS-respecting client — never the service-role key (SEC-003).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE SECURITY BOUNDARY THIS FILE MUST NEVER WEAKEN
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `coffee_offers`'s `member_read_published_offers` policy (confirmed live, 2026-09-12 preflight) is:
 *
 *   is_authorized_member()
 *   AND status IN ('PUBLISHED','PARTIALLY_FILLED')
 *   AND is_visible = true
 *   AND deleted_at IS NULL
 *   AND (quantity_kg - filled_quantity_kg - reserved_quantity_kg) > 0
 *
 * This module applies NO client-side status/visibility filter of its own — every row this file
 * returns is a row the DATABASE decided to hand back. A DRAFT/PENDING_REVIEW/REJECTED/SUSPENDED row,
 * or a SOLD_OUT row, is never fetched-then-hidden here; it is simply never returned by the query in
 * the first place, because RLS denies it. Requesting a non-published offer by its exact id (e.g. a
 * guessed/leaked draft id) returns the identical `null`/empty result as a nonexistent id — the
 * application cannot distinguish "exists but not visible to you" from "does not exist," which is
 * exactly the property SEC-001/AC-01 requires.
 *
 * HONEST SCHEMA-VS-SPEC FINDING (recorded, not worked around): the policy's own
 * `(quantity_kg - filled_quantity_kg - reserved_quantity_kg) > 0` clause means a SOLD_OUT listing
 * (remaining = 0) is UNREADABLE by a buyer even by direct id — spec.md's PS4 acceptance scenario 1
 * ("Given each of DRAFT...SOLD_OUT...ARCHIVED, when viewed, then the exact approved label renders")
 * cannot be satisfied for SOLD_OUT via this buyer read path as currently policied. This is not a bug
 * this file works around (that would mean fetching a non-visible row and filtering in JS — forbidden
 * by the run directive) — it is a real database-policy-vs-spec gap, recorded here and in the Feature
 * 006 handoff, for a future run/product decision.
 *
 * DB-OPEN-05 (lot detail): handled exactly as `lib/inventory/positions.ts` already established —
 * attempt the `coffee_lots` join, and when RLS returns nothing, degrade to `lot: null`, never fail
 * the listing and never fabricate a value.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const BROWSE_SELECT =
  "id, coffee_id, lot_id, seller_type, warehouse_id, title, quantity_kg, reserved_quantity_kg, filled_quantity_kg, price_per_kg, currency, status, created_at, updated_at";

export async function getBrowseListings({
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  coffeeId,
  titleSearch,
}: {
  page?: number;
  pageSize?: number;
  /** Optional narrowing filter — applied to an ALREADY-authorized result set, never a security boundary. */
  coffeeId?: string;
  /** Optional case-insensitive title search (parameterized via supabase-js `.ilike`, never string-concatenated SQL). */
  titleSearch?: string;
}): Promise<PaginatedListings<BuyerBrowseListing>> {
  const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, page) * boundedPageSize;
  const to = from + boundedPageSize;

  const supabase = await createClient();

  let query = supabase
    .from("coffee_offers")
    .select(BROWSE_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // deterministic tie-break
    .range(from, to);

  if (coffeeId) query = query.eq("coffee_id", coffeeId);
  if (titleSearch && titleSearch.trim() !== "") query = query.ilike("title", `%${titleSearch.trim()}%`);

  const { data: rows } = await query;
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

  const listings: BuyerBrowseListing[] = pageRows.map((row) => mapBrowseRow(row, lotDetailByLotId, warehouseById, coffeeNameById));

  return { rows: listings, hasMore };
}

/**
 * Single-listing lookup by id, for the buyer detail view. Returns `null` identically whether the id
 * does not exist OR exists but is not currently visible to a buyer (draft/rejected/suspended/
 * sold-out/soft-deleted) — the SAME `member_read_published_offers` policy is the only reason this can
 * ever come back empty; there is no separate application check to bypass it with.
 */
export async function getBrowseListingById(offerId: string): Promise<BuyerListingDetail | null> {
  const supabase = await createClient();

  const { data: row } = await supabase.from("coffee_offers").select(BROWSE_SELECT).eq("id", offerId).maybeSingle();
  if (!row) return null;

  const [lotDetailByLotId, warehouseById, coffeeNameById, sensoryNotes, tags] = await Promise.all([
    getLotDetailByLotId(supabase, [row.lot_id]),
    getWarehouseById(supabase, [row.warehouse_id]),
    getCoffeeNameById(supabase, [row.coffee_id]),
    getSensoryNotes(supabase, offerId),
    getTagNames(supabase, offerId),
  ]);

  return {
    ...mapBrowseRow(row, lotDetailByLotId, warehouseById, coffeeNameById),
    sensoryNotes,
    tags,
  };
}

type BrowseRow = {
  id: string;
  coffee_id: string;
  lot_id: string;
  seller_type: string;
  warehouse_id: string;
  title: string | null;
  quantity_kg: number;
  reserved_quantity_kg: number;
  filled_quantity_kg: number;
  price_per_kg: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function mapBrowseRow(
  row: BrowseRow,
  lotDetailByLotId: Map<string, ListingLotDetail>,
  warehouseById: Map<string, ListingWarehouseContext>,
  coffeeNameById: Map<string, string>
): BuyerBrowseListing {
  return {
    id: row.id,
    title: row.title,
    coffeeId: row.coffee_id,
    coffeeName: coffeeNameById.get(row.coffee_id) ?? null,
    lot: lotDetailByLotId.get(row.lot_id) ?? null,
    warehouse: warehouseById.get(row.warehouse_id) ?? null,
    sellerType: row.seller_type as BuyerBrowseListing["sellerType"],
    quantityKg: Number(row.quantity_kg),
    reservedQuantityKg: Number(row.reserved_quantity_kg),
    filledQuantityKg: Number(row.filled_quantity_kg),
    pricePerKg: Number(row.price_per_kg),
    currency: row.currency,
    status: row.status as BuyerBrowseListing["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Mirrors `lib/inventory/positions.ts`'s own DB-OPEN-05 attempt-then-degrade pattern exactly. */
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

/**
 * `offer_sensory_notes` has a real member-read policy (`member_read_offer_sensory_notes`) gated on
 * the SAME visible/published predicate as the offer itself — attempted directly, degrades to `null`
 * honestly if nothing comes back (never fabricated).
 */
async function getSensoryNotes(supabase: Awaited<ReturnType<typeof createClient>>, offerId: string): Promise<BuyerListingDetail["sensoryNotes"]> {
  const { data } = await supabase.from("offer_sensory_notes").select("aroma, flavor, acidity, body, finish, notes").eq("offer_id", offerId).maybeSingle();
  if (!data) return null;
  return { aroma: data.aroma, flavor: data.flavor, acidity: data.acidity, body: data.body, finish: data.finish, notes: data.notes };
}

/** `offer_tags` has a real member-read policy (`member_read_offer_tags`), same visible/published gate. */
async function getTagNames(supabase: Awaited<ReturnType<typeof createClient>>, offerId: string): Promise<readonly string[]> {
  const { data: tagLinks } = await supabase.from("offer_tags").select("tag_id").eq("offer_id", offerId);
  const tagIds = (tagLinks ?? []).map((row) => row.tag_id);
  if (tagIds.length === 0) return [];

  const { data: tagRows } = await supabase.from("tags").select("id, name").in("id", tagIds);
  return (tagRows ?? []).map((row) => row.name);
}

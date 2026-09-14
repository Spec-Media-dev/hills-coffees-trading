import { getStorageAllocations } from "@/lib/inventory/allocations";
import type { StorageAllocation } from "@/lib/inventory/types";

/**
 * Feature 009 RUN C (T022) — READ-ONLY composition linking a shipment's own order items to Feature
 * 005's authoritative custody record. This file computes NOTHING about custody itself: every field
 * returned is a verbatim pass-through of `lib/inventory/allocations.ts#getStorageAllocations`'s own
 * DTO. No `storage_allocations` write, no recomputed quantity, no second custody model — exactly the
 * boundary plan.md's Feature 005 entry and this run's own "005 owns custody" rule require.
 *
 * `getStorageAllocations` is org-scoped and paginated (`lib/inventory/allocations.ts`'s own established
 * shape) but not order-item-scoped — there is no dedicated "allocations for these order items" read in
 * Feature 005 today. Rather than add one to `lib/inventory/*` (out of this feature's ownership) or
 * write a second direct `storage_allocations` query here (would bypass 005's own composed order
 * context resolution), this function walks a BOUNDED number of pages of the organization's own
 * allocations and filters in-memory to the caller-supplied `orderItemIds` — safe because the set of
 * order items on any one shipment is always small, and the scan is capped, never unbounded.
 */
const MAX_PAGES_SCANNED = 8;
const PAGE_SIZE = 100;

export async function getCustodyForOrderItems({
  organizationId,
  orderItemIds,
}: {
  organizationId: string;
  orderItemIds: readonly string[];
}): Promise<readonly StorageAllocation[]> {
  const wanted = new Set(orderItemIds);
  if (wanted.size === 0) return [];

  const found: StorageAllocation[] = [];
  for (let page = 0; page < MAX_PAGES_SCANNED; page += 1) {
    const { rows, hasMore } = await getStorageAllocations({ organizationId, page, pageSize: PAGE_SIZE });
    for (const allocation of rows) {
      if (allocation.orderItemId !== null && wanted.has(allocation.orderItemId)) {
        found.push(allocation);
      }
    }
    if (found.length >= wanted.size || !hasMore) break;
  }
  return found;
}

import { getListingReviewDetail, listListingsForReview, type ListingReviewDetail, type ListingReviewRow } from "@/lib/admin/compliance";
import { getStorageAllocationsForWarehouseOversight } from "@/lib/inventory/allocations";
import { getInventoryPositionsForWarehouseOversight } from "@/lib/inventory/positions";
import type { InventoryPosition, StorageAllocation } from "@/lib/inventory/types";
import { LISTING_STATUSES } from "@/lib/listings/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature 010 RUN E (Phase 8, T025/T026) — the Audit area's READ layer. Read-only by construction:
 * this module exports no write, imports no Server Action and no domain mutation, and composes only
 * reads the AUDITOR role is granted by the LIVE policy set (schema report `rls_policies`, `is_auditor()`
 * branches): `coffee_offers` (`offers_compliance_read`), `listing_status_history`
 * (`offer_history_compliance_read`), `inventory_positions` (`inventory_owner_read`) and
 * `storage_allocations` (`storage_owner_read`). It reuses the existing read functions (RUN B's
 * compliance reads, Feature 005's warehouse-oversight reads) rather than a second read domain; RLS
 * filters rows the role may not see (e.g. `listing_reviews` — compliance-only — comes back empty and
 * the UI states so; `organizations` names are `null`).
 *
 * `audit_logs` (T026): the live policy `audit_admin_read` is `is_platform_admin()` only (DB-OPEN-06).
 * `probeAuditLog` issues ONE ordinary, session-scoped count under RLS: an AUDITOR gets zero rows (or a
 * permission error), which the page states as the recorded open item — never a service role, never a
 * wider credential, never an error page. A platform admin (whose `is_auditor()` is also true) reads
 * real rows read-only. Nothing here is cached.
 *
 * What is deliberately NOT composed: KYB (no auditor SELECT policy — compliance-only), finance
 * (auditor MAY read `payments`/`payment_proofs`/`payment_events`/`order_financials`, but Feature 008
 * owns that read layer and currently supplies per-order reads only — RUN C's pinned boundary), disputes
 * (Feature 012 not implemented), shipments (no auditor branch on `shipments_view`).
 */

export type AuditListingRow = ListingReviewRow;
export type AuditListingDetail = ListingReviewDetail;

const AUDIT_PAGE_SIZE = 50;

/** Every listing status the role can see (all — the auditor reads the full lifecycle, not a review queue). */
export async function listAuditListings({ page = 0 }: { page?: number } = {}): Promise<{ rows: readonly AuditListingRow[]; hasMore: boolean }> {
  return listListingsForReview({ statuses: LISTING_STATUSES, page, pageSize: AUDIT_PAGE_SIZE });
}

export async function getAuditListingDetail(offerId: string): Promise<AuditListingDetail | null> {
  return getListingReviewDetail(offerId);
}

export async function listAuditPositions({ page = 0 }: { page?: number } = {}): Promise<{ rows: readonly InventoryPosition[]; hasMore: boolean }> {
  return getInventoryPositionsForWarehouseOversight({ page, pageSize: AUDIT_PAGE_SIZE });
}

export async function listAuditAllocations({ page = 0 }: { page?: number } = {}): Promise<{ rows: readonly StorageAllocation[]; hasMore: boolean }> {
  return getStorageAllocationsForWarehouseOversight({ page, pageSize: AUDIT_PAGE_SIZE });
}

export type AuditLogRow = { id: number; actorUserId: string | null; entityType: string; entityId: string | null; action: string; createdAt: string };

export type AuditLogProbe = { readable: true; rows: readonly AuditLogRow[] } | { readable: false; reason: "policy" };

/**
 * T026 — reads `audit_logs` under the caller's own session. Zero rows with no error is treated as
 * "not readable" for a caller who is NOT a platform admin (RLS filters silently), so the page can state
 * DB-OPEN-06 rather than show an empty table pretending the log is empty; a permission error maps to
 * the same honest state. `old_data`/`new_data`/`metadata` payloads are deliberately not selected.
 */
export async function probeAuditLog({ isPlatformAdmin }: { isPlatformAdmin: boolean }): Promise<AuditLogProbe> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_logs").select("id, actor_user_id, entity_type, entity_id, action, created_at").order("created_at", { ascending: false }).limit(50);
  if (error) return { readable: false, reason: "policy" };
  const rows = (data ?? []).map((row) => ({ id: Number(row.id), actorUserId: row.actor_user_id, entityType: row.entity_type, entityId: row.entity_id, action: row.action, createdAt: row.created_at }));
  if (rows.length === 0 && !isPlatformAdmin) return { readable: false, reason: "policy" };
  return { readable: true, rows };
}

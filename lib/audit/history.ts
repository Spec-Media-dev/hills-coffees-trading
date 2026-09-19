import { createClient } from "@/lib/supabase/server";

/**
 * Feature 012 RUN C (T013) — THE single, SERVER-ONLY, read-only query owner for the platform's four
 * history tables. Features 005/006/007 delegate to these functions (T016) instead of keeping their
 * own copies of the same query. Every read runs under the caller's own request-scoped session: no
 * service role, no `unstable_cache`/`"use cache"`/`cacheTag`, and — by construction — NO write: this
 * module never calls `insert`/`update`/`upsert`/`delete`/`rpc` (FR-003, FR-010, OPS-02, LOT-03).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIVE POLICIES (schema report `rls_policies`; no migration since has touched these tables)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * | table                        | SELECT policy                                              | member | COMPLIANCE | AUDITOR | ADMIN |
 * |------------------------------|------------------------------------------------------------|--------|------------|---------|-------|
 * | `order_status_history`       | `can_view_order(order_id)` (buyer / seller-of-record org)   | yes    | no         | no      | yes   |
 * | `listing_status_history`     | seller-org member OR `is_platform_admin()`; OR compliance/auditor | own listings | yes | yes | yes |
 * | `account_status_history`     | `is_org_member(organization_id) OR is_platform_admin()` (+ MFA gate) | own org | no | no | yes |
 * | `inventory_ownership_events` | admin OR member of `to_` / `from_organization_id`           | party  | no         | no      | yes   |
 *
 * RLS FILTERS, IT DOES NOT ERROR: a caller outside a policy simply gets `[]`. These functions never
 * turn that into a "not found" vs "forbidden" distinction (no existence leak); the matrix above —
 * mirrored as data in `lib/audit/access.ts` — is what a surface uses to explain a limitation.
 *
 * WHAT IS STORED, AND NOTHING MORE (no inference):
 * - The three status-history tables store `old_status`, `new_status`, `changed_by`, `reason`,
 *   `created_at`. They have NO correlation-id column, so none is returned or invented; `changed_by`
 *   and `reason` are nullable and stay `null` when not recorded.
 * - `inventory_ownership_events` stores `correlation_id` (nullable) — returned as stored.
 * - Free text (`reason`) is untrusted; renderers must treat it as text only.
 */

const MAX_ROWS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `42501` (insufficient privilege) is what an ANONYMOUS session gets — `anon` holds no grant on these
 * tables at all. That is a refusal, not a failure: it is reported exactly like an RLS-filtered read
 * (nothing visible), so no caller can tell "forbidden" from "none". Any OTHER database error is a real
 * failure and throws — it is never shown as an empty history.
 */
function isRefusal(error: { code?: string } | null): boolean {
  return error?.code === "42501";
}

export class HistoryReadError extends Error {
  constructor() {
    super("history_read_failed");
    this.name = "HistoryReadError";
  }
}

/** One status transition as stored (order / listing / account histories share this shape). */
export type StatusHistoryRecord = {
  id: string;
  subjectId: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
};

export type OwnershipEventRecord = {
  id: string;
  lotId: string;
  fromOrganizationId: string | null;
  toOrganizationId: string;
  orderItemId: string | null;
  quantityKg: number;
  eventType: string;
  createdBy: string | null;
  createdAt: string;
  correlationId: string | null;
  reason: string | null;
  sourceDocumentId: string | null;
};

type StatusRow = { id: number | string; old_status: string | null; new_status: string; changed_by: string | null; reason: string | null; created_at: string } & Record<string, unknown>;

function toStatusRecord(row: StatusRow, subjectColumn: string): StatusHistoryRecord {
  return {
    id: String(row.id),
    subjectId: String(row[subjectColumn]),
    oldStatus: row.old_status,
    newStatus: row.new_status,
    changedBy: row.changed_by,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

async function readStatusHistory(table: "order_status_history" | "listing_status_history" | "account_status_history", subjectColumn: "order_id" | "offer_id" | "organization_id", subjectId: string): Promise<readonly StatusHistoryRecord[]> {
  if (!UUID_PATTERN.test(subjectId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select(`id, ${subjectColumn}, old_status, new_status, changed_by, reason, created_at`)
    .eq(subjectColumn, subjectId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_ROWS);
  if (isRefusal(error)) return [];
  if (error) throw new HistoryReadError();
  return ((data ?? []) as unknown as StatusRow[]).map((row) => toStatusRecord(row, subjectColumn));
}

/** `order_status_history` for one order, oldest first. `[]` when `can_view_order` is false. */
export function readOrderStatusHistory(orderId: string) {
  return readStatusHistory("order_status_history", "order_id", orderId);
}

/** `listing_status_history` for one listing, oldest first. `[]` for a caller outside `offer_history_*`. */
export function readListingStatusHistory(offerId: string) {
  return readStatusHistory("listing_status_history", "offer_id", offerId);
}

/** `account_status_history` for one organization, oldest first. `[]` unless an org member or platform admin. */
export function readAccountStatusHistory(organizationId: string) {
  return readStatusHistory("account_status_history", "organization_id", organizationId);
}

/**
 * `inventory_ownership_events` where `organizationId` is the source OR destination, newest first,
 * paginated (`pageSize + 1` rows fetched to detect `hasMore`). RLS additionally requires the caller to
 * be a member of one of the two parties (or a platform admin), so passing another organization's id
 * returns nothing. Rows are returned exactly as stored.
 */
export async function readOwnershipEvents({ organizationId, page = 0, pageSize = 25 }: { organizationId: string; page?: number; pageSize?: number }): Promise<{ rows: readonly OwnershipEventRecord[]; hasMore: boolean }> {
  if (!UUID_PATTERN.test(organizationId)) return { rows: [], hasMore: false };
  const size = Math.max(1, Math.min(pageSize, MAX_ROWS));
  const from = Math.max(0, Math.floor(page)) * size;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_ownership_events")
    .select("id, lot_id, from_organization_id, to_organization_id, order_item_id, quantity_kg, event_type, created_by, created_at, correlation_id, reason, source_document_id")
    .or(`from_organization_id.eq.${organizationId},to_organization_id.eq.${organizationId}`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + size);
  if (isRefusal(error)) return { rows: [], hasMore: false };
  if (error) throw new HistoryReadError();
  const all = (data ?? []).map((row) => ({
    id: row.id as string,
    lotId: row.lot_id as string,
    fromOrganizationId: row.from_organization_id as string | null,
    toOrganizationId: row.to_organization_id as string,
    orderItemId: row.order_item_id as string | null,
    quantityKg: Number(row.quantity_kg),
    eventType: row.event_type as string,
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
    correlationId: row.correlation_id as string | null,
    reason: row.reason as string | null,
    sourceDocumentId: row.source_document_id as string | null,
  }));
  const hasMore = all.length > size;
  return { rows: hasMore ? all.slice(0, size) : all, hasMore };
}

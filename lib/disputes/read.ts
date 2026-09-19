import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { DisputeReadError } from "@/lib/disputes/errors";
import {
  isDisputeStatus,
  type DisputeEvidenceDTO,
  type DisputeStatus,
  type MemberDisputeDetailDTO,
  type MemberDisputeSummaryDTO,
  type OperatorDisputeDTO,
  type PaginatedDisputes,
} from "@/lib/disputes/types";
import { isUuid } from "@/lib/disputes/validation";
import type { OrderStatus } from "@/lib/orders/validation";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature 012 RUN A (T002) — SERVER-ONLY scoped dispute and evidence reads (imports
 * `lib/supabase/server`, which pulls in `next/headers` — never import from a Client Component).
 * Every read runs under the caller's own request-scoped, RLS-respecting session: no service-role
 * key, no `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife` — dispute data is private conflict
 * data, re-read fresh on every call (FR-013, SEC-003).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIVE RLS BOUNDARY THIS FILE MUST NEVER WEAKEN (read from `docs/database/database-schema-
 * report.json`'s `rls_policies`; no migration since has touched either table)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `disputes` — `disputes_view` (SELECT): `can_view_order(order_id) OR is_compliance_operator() OR
 * is_auditor()`. `dispute_evidence` — `dispute_evidence_view` (SELECT): the parent dispute is
 * visible by the same three branches. `can_view_order()` is true for the order's BUYER organization,
 * any SELLER-of-record organization on its items, and `is_platform_admin()`.
 *
 * THREE AUDIENCES, THREE ENTRY POINTS — never one broad query shared between them:
 *
 * 1. PARTICIPANT (member) — `listDisputesForMember` / `getDisputeForMember` /
 *    `getDisputeEvidenceForMember`. RLS alone would return disputes on ANY order the user can view in
 *    ANY of their organizations; these functions additionally inner-join the order and require
 *    `orders.buyer_organization_id = <acting organization>` — the SAME defence-in-depth, buyer-side
 *    convention `lib/orders/read.ts#getOrderById` established. A dispute on another organization's
 *    order, or a dispute id that does not exist, returns `null`/nothing identically (no existence
 *    leak). SELLER-SIDE participation (a dispute on an order the acting organization SOLD into) is
 *    permitted by RLS but is NOT surfaced here: no seller-side order read exists anywhere in the
 *    product yet (Feature 007's own recorded boundary), so it is simply absent, not faked.
 *
 * 2. COMPLIANCE — `listDisputesForCompliance` / `getDisputeForCompliance`. Gated by a LIVE
 *    `is_compliance_operator()` call (plus the console-shell checks: authenticated, MFA step-up
 *    satisfied, holds an operational role) BEFORE any query; a refusal returns `null`.
 *
 * 3. AUDITOR — `listDisputesForAuditor` / `getDisputeForAuditor`. Gated the same way by a LIVE
 *    `is_auditor()` call; read-only (nothing in this feature gives an auditor a write).
 *
 * `is_compliance_operator()`/`is_auditor()` are hierarchical in the database (both also true for
 * ADMIN and SUPER_ADMIN); this file follows the database's own answer and never re-implements it.
 *
 * COLUMN ALLOWLISTS: every select names its columns explicitly (no `*`). The member projection
 * never returns `opened_by_user_id` (reduced to `raisedByYou`), `opened_by_organization_id` or
 * `resolved_by`. Evidence is read as text + "has a file reference" only — `file_assets` is never
 * joined (DB-BLOCK-01; the file seam is T005, not RUN A).
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const MEMBER_DISPUTE_SELECT =
  "id, order_id, opened_by_user_id, status, reason, resolution, opened_at, resolved_at, updated_at, correlation_id, orders!inner(order_code, buyer_organization_id, status)";

const OPERATOR_DISPUTE_SELECT =
  "id, order_id, opened_by_user_id, opened_by_organization_id, status, reason, resolution, correlation_id, opened_at, resolved_at, resolved_by, created_at, updated_at, orders(order_code)";

const EVIDENCE_SELECT = "id, dispute_id, note, file_asset_id, uploaded_by, created_at";

type EmbeddedOrder<T> = T | T[] | null;

type MemberDisputeRow = {
  id: string;
  order_id: string;
  opened_by_user_id: string;
  status: string;
  reason: string;
  resolution: string | null;
  opened_at: string;
  resolved_at: string | null;
  updated_at: string;
  correlation_id: string;
  orders: EmbeddedOrder<{ order_code: string; buyer_organization_id: string; status: string }>;
};

type OperatorDisputeRow = {
  id: string;
  order_id: string;
  opened_by_user_id: string;
  opened_by_organization_id: string | null;
  status: string;
  reason: string;
  resolution: string | null;
  correlation_id: string;
  opened_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  orders: EmbeddedOrder<{ order_code: string }>;
};

type EvidenceRow = {
  id: string;
  dispute_id: string;
  note: string | null;
  file_asset_id: string | null;
  uploaded_by: string;
  created_at: string;
};

function single<T>(embedded: EmbeddedOrder<T>): T | null {
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

function bounded(page: number, pageSize: number) {
  const size = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, Math.floor(page)) * size;
  return { size, from, to: from + size };
}

/**
 * A status outside the approved vocabulary cannot exist (CHECK constraint); if one ever appeared the
 * row is dropped rather than rendered under an invented label.
 */
function toMemberDispute(row: MemberDisputeRow, organizationId: string, userId: string): MemberDisputeDetailDTO | null {
  const order = single(row.orders);
  if (!order || order.buyer_organization_id !== organizationId || !isDisputeStatus(row.status)) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    orderCode: order.order_code,
    orderStatus: order.status as OrderStatus,
    status: row.status,
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at,
    updatedAt: row.updated_at,
    correlationId: row.correlation_id,
    raisedByYou: row.opened_by_user_id === userId,
    reason: row.reason,
    resolution: row.resolution,
  };
}

/** The list projection: the free-text reason/resolution stay on the detail page only. */
function toSummary(detail: MemberDisputeDetailDTO): MemberDisputeSummaryDTO {
  return {
    id: detail.id,
    orderId: detail.orderId,
    orderCode: detail.orderCode,
    orderStatus: detail.orderStatus,
    status: detail.status,
    openedAt: detail.openedAt,
    resolvedAt: detail.resolvedAt,
    updatedAt: detail.updatedAt,
    correlationId: detail.correlationId,
    raisedByYou: detail.raisedByYou,
  };
}

function toOperatorDispute(row: OperatorDisputeRow): OperatorDisputeDTO | null {
  if (!isDisputeStatus(row.status)) return null;
  const order = single(row.orders);
  return {
    id: row.id,
    orderId: row.order_id,
    orderCode: order?.order_code ?? null,
    orderContextReadable: order !== null,
    status: row.status,
    reason: row.reason,
    resolution: row.resolution,
    openedByUserId: row.opened_by_user_id,
    openedByOrganizationId: row.opened_by_organization_id,
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEvidence(row: EvidenceRow): DisputeEvidenceDTO {
  return {
    id: row.id,
    disputeId: row.dispute_id,
    note: row.note,
    hasFileReference: row.file_asset_id !== null,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

// ── 1. PARTICIPANT (member) ──────────────────────────────────────────────────────────────────────

/**
 * The acting organization's own disputes (on orders it bought), newest first. `organizationId` and
 * `userId` MUST be the caller's already-resolved `identity.organization.organizationId` /
 * `identity.userId` — never a URL, cookie, form or local-storage value.
 */
export async function listDisputesForMember({
  organizationId,
  userId,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  organizationId: string;
  userId: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedDisputes<MemberDisputeSummaryDTO>> {
  const { size, from, to } = bounded(page, pageSize);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("disputes")
    .select(MEMBER_DISPUTE_SELECT)
    .eq("orders.buyer_organization_id", organizationId)
    .order("opened_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) throw new DisputeReadError();

  const all = ((data ?? []) as unknown as MemberDisputeRow[]).map((row) => toMemberDispute(row, organizationId, userId)).filter((row): row is MemberDisputeDetailDTO => row !== null);
  const hasMore = all.length > size;
  return { rows: (hasMore ? all.slice(0, size) : all).map(toSummary), hasMore, page: Math.max(0, Math.floor(page)), pageSize: size };
}

/** One dispute, or `null` for a malformed id, a nonexistent id, or another organization's dispute — identically. */
export async function getDisputeForMember({ organizationId, userId, disputeId }: { organizationId: string; userId: string; disputeId: string }): Promise<MemberDisputeDetailDTO | null> {
  if (!isUuid(disputeId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("disputes").select(MEMBER_DISPUTE_SELECT).eq("id", disputeId).eq("orders.buyer_organization_id", organizationId).maybeSingle();
  if (error) throw new DisputeReadError();
  return data ? toMemberDispute(data as unknown as MemberDisputeRow, organizationId, userId) : null;
}

/** Evidence on one of the acting organization's own disputes; `null` when the dispute itself is not visible. */
export async function getDisputeEvidenceForMember({ organizationId, userId, disputeId }: { organizationId: string; userId: string; disputeId: string }): Promise<readonly DisputeEvidenceDTO[] | null> {
  const dispute = await getDisputeForMember({ organizationId, userId, disputeId });
  if (!dispute) return null;
  return readEvidence(dispute.id);
}

/**
 * Feature 012 RUN B (T007) — the acting organization's disputes on ONE of its own orders, newest
 * first, for the order/shipment linkage. Same buyer-organization scoping as the list above; an order
 * of another organization simply yields `[]` (no existence signal). Read-only: this never touches the
 * order itself, and nothing about a dispute changes the order's status (DB-OPEN-09).
 */
export async function listDisputesForOrder({ organizationId, userId, orderId }: { organizationId: string; userId: string; orderId: string }): Promise<readonly MemberDisputeSummaryDTO[]> {
  if (!isUuid(orderId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("disputes")
    .select(MEMBER_DISPUTE_SELECT)
    .eq("order_id", orderId)
    .eq("orders.buyer_organization_id", organizationId)
    .order("opened_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_PAGE_SIZE);
  if (error) throw new DisputeReadError();
  return ((data ?? []) as unknown as MemberDisputeRow[])
    .map((row) => toMemberDispute(row, organizationId, userId))
    .filter((row): row is MemberDisputeDetailDTO => row !== null)
    .map(toSummary);
}

// ── 2/3. OPERATOR audiences (compliance, auditor) ────────────────────────────────────────────────

type OperatorAudience = "compliance" | "auditor";

const AUDIENCE_FUNCTION = { compliance: "is_compliance_operator", auditor: "is_auditor" } as const;

async function operatorPermitted(audience: OperatorAudience): Promise<boolean> {
  const access = await checkRoleFunctionAccess(AUDIENCE_FUNCTION[audience]);
  return access.ok;
}

async function listForOperator(
  audience: OperatorAudience,
  { statuses, page = 0, pageSize = DEFAULT_PAGE_SIZE }: { statuses?: readonly DisputeStatus[]; page?: number; pageSize?: number },
): Promise<PaginatedDisputes<OperatorDisputeDTO> | null> {
  if (!(await operatorPermitted(audience))) return null;
  const { size, from, to } = bounded(page, pageSize);
  const supabase = await createClient();
  let query = supabase.from("disputes").select(OPERATOR_DISPUTE_SELECT);
  if (statuses && statuses.length > 0) query = query.in("status", statuses.filter(isDisputeStatus));
  const { data, error } = await query.order("opened_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
  if (error) throw new DisputeReadError();
  const all = ((data ?? []) as unknown as OperatorDisputeRow[]).map(toOperatorDispute).filter((row): row is OperatorDisputeDTO => row !== null);
  const hasMore = all.length > size;
  return { rows: hasMore ? all.slice(0, size) : all, hasMore, page: Math.max(0, Math.floor(page)), pageSize: size };
}

async function getForOperator(audience: OperatorAudience, disputeId: string): Promise<OperatorDisputeDTO | null> {
  if (!isUuid(disputeId)) return null;
  if (!(await operatorPermitted(audience))) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("disputes").select(OPERATOR_DISPUTE_SELECT).eq("id", disputeId).maybeSingle();
  if (error) throw new DisputeReadError();
  return data ? toOperatorDispute(data as unknown as OperatorDisputeRow) : null;
}

/** The compliance review queue (oldest first). `null` when the caller is not a compliance operator. */
export function listDisputesForCompliance(options: { statuses?: readonly DisputeStatus[]; page?: number; pageSize?: number } = {}) {
  return listForOperator("compliance", options);
}

export function getDisputeForCompliance(disputeId: string) {
  return getForOperator("compliance", disputeId);
}

/** Read-only auditor view (oldest first). `null` when the caller is not an auditor. */
export function listDisputesForAuditor(options: { statuses?: readonly DisputeStatus[]; page?: number; pageSize?: number } = {}) {
  return listForOperator("auditor", options);
}

export function getDisputeForAuditor(disputeId: string) {
  return getForOperator("auditor", disputeId);
}

/** Evidence for an operator audience; `null` when the role is refused or the dispute is not visible. */
export async function getDisputeEvidenceForOperator(audience: OperatorAudience, disputeId: string): Promise<readonly DisputeEvidenceDTO[] | null> {
  const dispute = await getForOperator(audience, disputeId);
  if (!dispute) return null;
  return readEvidence(dispute.id);
}

/** Internal: only ever called with a dispute id an audience-specific function has already resolved. */
async function readEvidence(disputeId: string): Promise<readonly DisputeEvidenceDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("dispute_evidence").select(EVIDENCE_SELECT).eq("dispute_id", disputeId).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw new DisputeReadError();
  return ((data ?? []) as EvidenceRow[]).map(toEvidence);
}

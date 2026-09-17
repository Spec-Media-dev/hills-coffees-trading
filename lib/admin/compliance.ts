import { checkKybCompleteness, type MissingItem } from "@/lib/kyb/completeness";
import { isDocumentExpired, type KybApplicationStatus, type KybDocumentSummary } from "@/lib/kyb/status-types";
import type { ListingStatus } from "@/lib/listings/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature 010 RUN B — the Compliance console's READ layer (T007/T008/T010/T011). Every function reads
 * through the operator's own authenticated session under the live RLS policy set; nothing here uses
 * a service role, a cache API, or any invented figure. Callers (route-group pages) have already been
 * refused unless `is_compliance_operator()` is true; RLS is the backstop underneath.
 *
 * ── HONEST NULLS: WHAT A PURE COMPLIANCE OPERATOR CANNOT READ TODAY (verified live, 2026-09-15) ──
 *
 * RLS filters rather than errors, so an unreadable row simply does not come back. Three tables have
 * NO SELECT path for `is_compliance_operator()` in the approved policy set — only `is_platform_admin()`
 * or the owning organization's own members:
 *   - `organizations`      (`organizations_member_select`)  → organization names/status are `null`
 *                            for a pure COMPLIANCE operator; an ADMIN reads them normally;
 *   - `file_assets`        (`catalog_admin_files`)          → document file name / MIME / size /
 *                            object path are unavailable, so KYB evidence bytes cannot be opened by a
 *                            pure COMPLIANCE operator even though the storage policy itself would
 *                            allow it (`kyb_storage_object_authorized` returns true for compliance);
 *   - `account_status_history` (`account_status_history_view`) → organization status history is
 *                            unavailable to a pure COMPLIANCE operator.
 * These are recorded capability gaps (tasks.md T007/T008/T010 notes, spec Open items) — the DTOs
 * carry explicit `…Readable`/`null` markers so the UI states the gap instead of fabricating a value.
 */

export type KybQueueRow = {
  id: string;
  organizationId: string;
  /** `null` when the operator's role cannot read `organizations` (see header). */
  organizationName: string | null;
  status: KybApplicationStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  /** Outstanding items per Feature 003's own completeness rule, from the readable document rows. */
  outstanding: readonly MissingItem[];
  /** Current (non-superseded) documents past their expiry date. */
  expiredDocumentCount: number;
};

export type KybQueueResult = { rows: readonly KybQueueRow[]; hasMore: boolean; organizationNamesReadable: boolean };

/** Statuses the queue shows by default — everything a compliance operator may still act on. */
export const KYB_QUEUE_ACTIONABLE_STATUSES: readonly KybApplicationStatus[] = ["SUBMITTED", "UNDER_REVIEW", "RESUBMISSION_REQUIRED"];

type ApplicationRow = {
  id: string;
  organization_id: string;
  status: KybApplicationStatus;
  registered_address: string | null;
  business_activity: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
};

type DocumentRow = {
  id: string;
  application_id: string;
  document_type: string;
  status: KybDocumentSummary["status"];
  version: number;
  supersedes_document_id: string | null;
  expires_at: string | null;
  created_at: string;
  file_assets: { original_name: string | null; mime_type: string | null; size_bytes: number | null } | { original_name: string | null; mime_type: string | null; size_bytes: number | null }[] | null;
};

function toDocumentSummary(row: DocumentRow): KybDocumentSummary & { fileMetadataReadable: boolean } {
  const fileAsset = Array.isArray(row.file_assets) ? row.file_assets[0] ?? null : row.file_assets;
  return {
    id: row.id,
    documentType: row.document_type,
    status: row.status,
    version: row.version,
    supersedesDocumentId: row.supersedes_document_id ?? null,
    originalName: fileAsset?.original_name ?? null,
    mimeType: fileAsset?.mime_type ?? null,
    sizeBytes: fileAsset?.size_bytes ?? null,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    fileMetadataReadable: fileAsset !== null,
  };
}

async function readOrganizationNames(supabase: Awaited<ReturnType<typeof createClient>>, organizationIds: readonly string[]): Promise<Map<string, string>> {
  if (organizationIds.length === 0) return new Map();
  const { data } = await supabase.from("organizations").select("id, display_name").in("id", [...organizationIds]);
  return new Map((data ?? []).map((row) => [row.id as string, row.display_name as string]));
}

export async function listKybApplications({
  statuses = KYB_QUEUE_ACTIONABLE_STATUSES,
  page = 0,
  pageSize = 25,
}: {
  statuses?: readonly KybApplicationStatus[];
  page?: number;
  pageSize?: number;
} = {}): Promise<KybQueueResult> {
  const supabase = await createClient();
  const from = Math.max(0, page) * pageSize;
  const { data: applications, error } = await supabase
    .from("kyb_applications")
    .select("id, organization_id, status, registered_address, business_activity, rejection_reason, submitted_at, decided_at, decided_by, created_at, updated_at")
    .in("status", [...statuses])
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range(from, from + pageSize);
  if (error) throw new Error("kyb_queue_read_failed");

  const all = (applications ?? []) as ApplicationRow[];
  const hasMore = all.length > pageSize;
  const pageRows = hasMore ? all.slice(0, pageSize) : all;
  const applicationIds = pageRows.map((row) => row.id);

  const [{ data: documents }, names] = await Promise.all([
    applicationIds.length > 0
      ? supabase
          .from("kyb_documents")
          .select("id, application_id, document_type, status, version, supersedes_document_id, expires_at, created_at, file_assets(original_name, mime_type, size_bytes)")
          .in("application_id", applicationIds)
      : Promise.resolve({ data: [] as DocumentRow[] }),
    readOrganizationNames(supabase, [...new Set(pageRows.map((row) => row.organization_id))]),
  ]);

  const documentsByApplication = new Map<string, KybDocumentSummary[]>();
  for (const row of (documents ?? []) as DocumentRow[]) {
    const list = documentsByApplication.get(row.application_id) ?? [];
    list.push(toDocumentSummary(row));
    documentsByApplication.set(row.application_id, list);
  }

  const rows: KybQueueRow[] = pageRows.map((row) => {
    const docs = documentsByApplication.get(row.id) ?? [];
    const completeness = checkKybCompleteness({ registeredAddress: row.registered_address, businessActivity: row.business_activity }, docs);
    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: names.get(row.organization_id) ?? null,
      status: row.status,
      submittedAt: row.submitted_at,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
      outstanding: completeness.missing,
      expiredDocumentCount: docs.filter((document) => document.status !== "SUPERSEDED" && isDocumentExpired(document)).length,
    };
  });

  return { rows, hasMore, organizationNamesReadable: names.size > 0 || pageRows.length === 0 };
}

export type KybReviewRecord = {
  id: string;
  decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED" | "SUSPENDED";
  reason: string | null;
  reviewerUserId: string;
  createdAt: string;
};

export type KybDocumentReviewRecord = {
  id: string;
  documentId: string;
  decision: "ACCEPTED" | "REJECTED";
  reason: string | null;
  reviewerUserId: string;
  createdAt: string;
};

export type OrganizationStatusHistoryRecord = {
  id: number;
  oldStatus: string;
  newStatus: string;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
};

export type OrganizationReadout = {
  id: string;
  legalName: string;
  displayName: string;
  status: string;
  accountType: string;
  countryCode: string;
  canBuy: boolean;
  canSell: boolean;
  isHillsInternal: boolean;
};

export type KybApplicationDetail = {
  application: {
    id: string;
    organizationId: string;
    status: KybApplicationStatus;
    registeredAddress: string | null;
    businessActivity: string | null;
    rejectionReason: string | null;
    submittedAt: string | null;
    decidedAt: string | null;
    decidedBy: string | null;
    createdAt: string;
    updatedAt: string;
  };
  /** `null` when unreadable for this role (see header) — never a fabricated organization. */
  organization: OrganizationReadout | null;
  documents: readonly (KybDocumentSummary & { fileMetadataReadable: boolean; expired: boolean })[];
  outstanding: readonly MissingItem[];
  /** Application-level decisions (`kyb_reviews`) — real persisted rows, newest first. */
  reviews: readonly KybReviewRecord[];
  /** Document-level decisions (`kyb_review_items`, Feature 003's append-only ledger), newest first. */
  documentReviews: readonly KybDocumentReviewRecord[];
  /** `null` when unreadable for this role (`account_status_history` has no compliance SELECT path). */
  organizationStatusHistory: readonly OrganizationStatusHistoryRecord[] | null;
};

export async function getKybApplicationDetail(applicationId: string): Promise<KybApplicationDetail | null> {
  const supabase = await createClient();
  const { data: application, error: applicationError } = await supabase
    .from("kyb_applications")
    .select("id, organization_id, status, registered_address, business_activity, rejection_reason, submitted_at, decided_at, decided_by, created_at, updated_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (applicationError) throw new Error("compliance_read_failed");
  if (!application) return null;
  const row = application as ApplicationRow;

  const [{ data: organization }, { data: documents }, { data: reviews }, { data: documentReviews }, { data: history }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, legal_name, display_name, status, account_type, country_code, can_buy, can_sell, is_hills_internal")
      .eq("id", row.organization_id)
      .maybeSingle(),
    supabase
      .from("kyb_documents")
      .select("id, application_id, document_type, status, version, supersedes_document_id, expires_at, created_at, file_assets(original_name, mime_type, size_bytes)")
      .eq("application_id", row.id)
      .order("created_at", { ascending: false }),
    supabase.from("kyb_reviews").select("id, decision, reason, reviewer_user_id, created_at").eq("application_id", row.id).order("created_at", { ascending: false }),
    supabase.from("kyb_review_items").select("id, document_id, decision, reason, reviewer_user_id, created_at").eq("application_id", row.id).order("created_at", { ascending: false }),
    supabase
      .from("account_status_history")
      .select("id, old_status, new_status, changed_by, reason, created_at")
      .eq("organization_id", row.organization_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const docs = ((documents ?? []) as DocumentRow[]).map(toDocumentSummary);
  const completeness = checkKybCompleteness({ registeredAddress: row.registered_address, businessActivity: row.business_activity }, docs);

  return {
    application: {
      id: row.id,
      organizationId: row.organization_id,
      status: row.status,
      registeredAddress: row.registered_address,
      businessActivity: row.business_activity,
      rejectionReason: row.rejection_reason,
      submittedAt: row.submitted_at,
      decidedAt: row.decided_at,
      decidedBy: row.decided_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    organization: organization
      ? {
          id: organization.id,
          legalName: organization.legal_name,
          displayName: organization.display_name,
          status: organization.status,
          accountType: organization.account_type,
          countryCode: organization.country_code,
          canBuy: organization.can_buy,
          canSell: organization.can_sell,
          isHillsInternal: organization.is_hills_internal,
        }
      : null,
    documents: docs.map((document) => ({ ...document, expired: document.status !== "SUPERSEDED" && isDocumentExpired(document) })),
    outstanding: completeness.missing,
    reviews: (reviews ?? []).map((review) => ({
      id: review.id,
      decision: review.decision,
      reason: review.reason ?? null,
      reviewerUserId: review.reviewer_user_id,
      createdAt: review.created_at,
    })),
    documentReviews: (documentReviews ?? []).map((review) => ({
      id: review.id,
      documentId: review.document_id,
      decision: review.decision,
      reason: review.reason ?? null,
      reviewerUserId: review.reviewer_user_id,
      createdAt: review.created_at,
    })),
    // An empty result is indistinguishable from "filtered by RLS" for a pure COMPLIANCE operator;
    // callers treat `null` as "unavailable for this role" only when the organization row itself was
    // unreadable (the two policies share the same `is_platform_admin()`/member shape).
    organizationStatusHistory: organization
      ? (history ?? []).map((entry) => ({
          id: entry.id,
          oldStatus: entry.old_status,
          newStatus: entry.new_status,
          changedBy: entry.changed_by ?? null,
          reason: entry.reason ?? null,
          createdAt: entry.created_at,
        }))
      : null,
  };
}

// ── Organizations (T010) ────────────────────────────────────────────────────────────────────────

export type OrganizationListRow = OrganizationReadout & { createdAt: string };

/**
 * Organizations visible to this operator. For a pure COMPLIANCE operator this is EMPTY by policy
 * (no SELECT path) — the page renders the recorded gap rather than an empty queue presented as
 * "no organizations exist".
 */
export async function listOrganizations({ page = 0, pageSize = 25 }: { page?: number; pageSize?: number } = {}): Promise<{ rows: readonly OrganizationListRow[]; hasMore: boolean }> {
  const supabase = await createClient();
  const from = Math.max(0, page) * pageSize;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, legal_name, display_name, status, account_type, country_code, can_buy, can_sell, is_hills_internal, created_at")
    .order("created_at", { ascending: false })
    .range(from, from + pageSize);
  if (error) throw new Error("compliance_read_failed");
  const all = data ?? [];
  const hasMore = all.length > pageSize;
  return {
    rows: (hasMore ? all.slice(0, pageSize) : all).map((row) => ({
      id: row.id,
      legalName: row.legal_name,
      displayName: row.display_name,
      status: row.status,
      accountType: row.account_type,
      countryCode: row.country_code,
      canBuy: row.can_buy,
      canSell: row.can_sell,
      isHillsInternal: row.is_hills_internal,
      createdAt: row.created_at,
    })),
    hasMore,
  };
}

/** Whether THIS operator's session can read `organizations` at all — the T007/T010 capability probe. */
/**
 * `readable` — this session sees organization rows; `gap` — the probe succeeded but RLS filtered every
 * row (the RECORDED compliance-operator gap); `error` — the probe itself failed (T036: an outage is an
 * error state, never reported as the capability gap).
 */
export async function probeOrganizationsRead(): Promise<"readable" | "gap" | "error"> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("organizations").select("id", { count: "exact", head: true });
  if (error) return "error";
  return typeof count === "number" && count > 0 ? "readable" : "gap";
}

// ── Listings (T011) ─────────────────────────────────────────────────────────────────────────────

export type ListingReviewRow = {
  id: string;
  title: string;
  status: ListingStatus;
  sellerType: string;
  sellerOrganizationId: string;
  /** `null` when unreadable for this role (see header). */
  sellerOrganizationName: string | null;
  quantityKg: number;
  reservedQuantityKg: number;
  filledQuantityKg: number;
  pricePerKg: number;
  currency: string;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export const LISTING_QUEUE_STATUSES: readonly ListingStatus[] = ["PENDING_REVIEW", "PUBLISHED", "PARTIALLY_FILLED", "SUSPENDED"];

const OFFER_SELECT = "id, title, status, seller_type, seller_organization_id, quantity_kg, reserved_quantity_kg, filled_quantity_kg, price_per_kg, currency, rejection_reason, created_at, updated_at";

type OfferRow = {
  id: string;
  title: string;
  status: ListingStatus;
  seller_type: string;
  seller_organization_id: string;
  quantity_kg: number;
  reserved_quantity_kg: number;
  filled_quantity_kg: number;
  price_per_kg: number;
  currency: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

function toListingRow(row: OfferRow, names: Map<string, string>): ListingReviewRow {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    sellerType: row.seller_type,
    sellerOrganizationId: row.seller_organization_id,
    sellerOrganizationName: names.get(row.seller_organization_id) ?? null,
    quantityKg: Number(row.quantity_kg),
    reservedQuantityKg: Number(row.reserved_quantity_kg),
    filledQuantityKg: Number(row.filled_quantity_kg),
    pricePerKg: Number(row.price_per_kg),
    currency: row.currency,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listListingsForReview({
  statuses = LISTING_QUEUE_STATUSES,
  page = 0,
  pageSize = 25,
}: {
  statuses?: readonly ListingStatus[];
  page?: number;
  pageSize?: number;
} = {}): Promise<{ rows: readonly ListingReviewRow[]; hasMore: boolean }> {
  const supabase = await createClient();
  const from = Math.max(0, page) * pageSize;
  const { data, error } = await supabase
    .from("coffee_offers")
    .select(OFFER_SELECT)
    .in("status", [...statuses])
    .is("deleted_at", null)
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .range(from, from + pageSize);
  if (error) throw new Error("listing_queue_read_failed");
  const all = (data ?? []) as OfferRow[];
  const hasMore = all.length > pageSize;
  const pageRows = hasMore ? all.slice(0, pageSize) : all;
  const names = await readOrganizationNames(supabase, [...new Set(pageRows.map((row) => row.seller_organization_id))]);
  return { rows: pageRows.map((row) => toListingRow(row, names)), hasMore };
}

export type ListingReviewRecord = {
  id: string;
  decision: "APPROVED" | "REJECTED" | "SUSPENDED";
  reason: string | null;
  reviewerUserId: string;
  createdAt: string;
};

export type ListingStatusHistoryRecord = {
  id: number;
  oldStatus: string;
  newStatus: string;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
};

export type ListingReviewDetail = {
  listing: ListingReviewRow;
  reviews: readonly ListingReviewRecord[];
  history: readonly ListingStatusHistoryRecord[];
};

export async function getListingReviewDetail(offerId: string): Promise<ListingReviewDetail | null> {
  const supabase = await createClient();
  const { data: offer, error: offerError } = await supabase.from("coffee_offers").select(OFFER_SELECT).eq("id", offerId).maybeSingle();
  if (offerError) throw new Error("compliance_read_failed");
  if (!offer) return null;
  const row = offer as OfferRow;
  const [names, { data: reviews }, { data: history }] = await Promise.all([
    readOrganizationNames(supabase, [row.seller_organization_id]),
    supabase.from("listing_reviews").select("id, decision, reason, reviewer_user_id, created_at").eq("offer_id", row.id).order("created_at", { ascending: false }),
    supabase.from("listing_status_history").select("id, old_status, new_status, changed_by, reason, created_at").eq("offer_id", row.id).order("created_at", { ascending: false }).limit(50),
  ]);
  return {
    listing: toListingRow(row, names),
    reviews: (reviews ?? []).map((review) => ({
      id: review.id,
      decision: review.decision,
      reason: review.reason ?? null,
      reviewerUserId: review.reviewer_user_id,
      createdAt: review.created_at,
    })),
    history: (history ?? []).map((entry) => ({
      id: entry.id,
      oldStatus: entry.old_status,
      newStatus: entry.new_status,
      changedBy: entry.changed_by ?? null,
      reason: entry.reason ?? null,
      createdAt: entry.created_at,
    })),
  };
}

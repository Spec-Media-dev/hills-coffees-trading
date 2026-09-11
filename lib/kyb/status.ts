import { createClient } from "@/lib/supabase/server";
import type { KybApplicationSummary, KybDocumentSummary, KybWorkspace } from "@/lib/kyb/status-types";

export type {
  KybApplicationStatus,
  KybApplicationSummary,
  KybDocumentSummary,
  KybWorkspace,
  CurrentKybDocumentSummary,
} from "@/lib/kyb/status-types";
export { KYB_APPLICATION_STATUSES, KYB_EDITABLE_STATUSES, currentDocuments, isDocumentExpired } from "@/lib/kyb/status-types";

/**
 * Feature 003 RUN B — SERVER-ONLY read layer for an organization's KYB application + documents
 * (this file imports `lib/supabase/server`, which pulls in `next/headers` — never import this file
 * from a Client Component; import `lib/kyb/status-types` directly there instead).
 *
 * READS ONLY. Every read here goes through the request-scoped, RLS-respecting server client
 * (`lib/supabase/server`), never the service-role key. This is safe as a direct table read (not an
 * RPC) because the applied migration's own RLS already scopes it correctly for a member:
 * `kyb_own_or_admin` (SELECT on `kyb_applications`, `is_org_member(organization_id)`),
 * `kyb_documents_member_select` (SELECT on `kyb_documents`, same org-membership check), and
 * `catalog_admin_files` (SELECT on `file_assets`, `is_org_member(organization_id)`) — see
 * `specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §4. This module never queries
 * `kyb_review_items` directly (no member RLS policy exists on that table at all) — review data comes
 * exclusively through `lib/kyb/review-items.ts`'s `listKybDocumentReviews`.
 */

/**
 * The organization's most recent KYB application (by `created_at`), or `null` if none has ever been
 * started. There is at most one row whose status is DRAFT/SUBMITTED/UNDER_REVIEW/
 * RESUBMISSION_REQUIRED at a time (`uq_one_open_kyb_application`), but a terminal row (APPROVED/
 * REJECTED/SUSPENDED) can coexist historically — "most recent" is therefore the only well-defined
 * choice for "the application relevant right now."
 */
export async function getKybWorkspace(organizationId: string): Promise<KybWorkspace> {
  const supabase = await createClient();

  const { data: applicationRow } = await supabase
    .from("kyb_applications")
    .select("id, organization_id, status, registered_address, business_activity, rejection_reason, submitted_at, decided_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!applicationRow) {
    return { application: null, documents: [] };
  }

  const application: KybApplicationSummary = {
    id: applicationRow.id,
    organizationId: applicationRow.organization_id,
    status: applicationRow.status,
    registeredAddress: applicationRow.registered_address ?? null,
    businessActivity: applicationRow.business_activity ?? null,
    rejectionReason: applicationRow.rejection_reason ?? null,
    submittedAt: applicationRow.submitted_at ?? null,
    decidedAt: applicationRow.decided_at ?? null,
  };

  const { data: documentRows } = await supabase
    .from("kyb_documents")
    .select(
      "id, document_type, status, version, supersedes_document_id, expires_at, created_at, file_assets(original_name, mime_type, size_bytes)"
    )
    .eq("application_id", application.id)
    .order("created_at", { ascending: false });

  const documents: KybDocumentSummary[] = (documentRows ?? []).map((row) => {
    const fileAsset = Array.isArray(row.file_assets) ? row.file_assets[0] : row.file_assets;
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
    };
  });

  return { application, documents };
}

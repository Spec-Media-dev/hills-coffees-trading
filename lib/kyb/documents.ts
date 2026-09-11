import { createClient } from "@/lib/supabase/server";

/**
 * Thin, server-only wrapper around the RUN DB private Storage + metadata write seam
 * (`supabase/migrations/20260911010000_feature_003_kyb_foundation.sql`,
 * `specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §3–4).
 *
 * This module never uses the service-role key and never writes `file_assets` / `kyb_documents`
 * directly — every write goes through `attach_kyb_document`, which derives and validates the owning
 * organization/application server-side rather than trusting a caller-supplied id. The real upload
 * (bytes to the `kyb-evidence` bucket) is a separate step performed by the caller's own
 * Supabase Storage client against the same-scoped path this module's callers must construct as
 * `org/{organizationId}/application/{applicationId}/{generatedObjectName}` — Storage policy
 * enforcement is independent of and in addition to this function's own checks (contract §3).
 *
 * NOT a Server Action file, and NOT a UI upload flow — RUN B (T017) owns the actual upload
 * page/action. This is the metadata seam those later tasks call after a real upload succeeds.
 */

export type AttachKybDocumentInput = {
  applicationId: string;
  documentType: string;
  objectPath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt?: string;
  supersedesDocumentId?: string;
};

export type AttachKybDocumentResult = { ok: true; documentId: string } | { ok: false; error: string };

/**
 * Calls `attach_kyb_document`. Never accepts a caller-supplied `organization_id`, `bucket_name`, or
 * `uploaded_by` — those are derived and set server-side inside the RPC from the validated
 * application row and the authenticated caller, never from this function's own arguments.
 */
export async function attachKybDocument(input: AttachKybDocumentInput): Promise<AttachKybDocumentResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attach_kyb_document", {
    p_application_id: input.applicationId,
    p_document_type: input.documentType,
    p_object_path: input.objectPath,
    p_original_name: input.originalName,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_expires_at: input.expiresAt ?? null,
    p_supersedes_document_id: input.supersedesDocumentId ?? null,
  });

  if (error || !data) {
    return { ok: false, error: "We could not attach this document." };
  }

  return { ok: true, documentId: data as string };
}

/** The bucket every KYB document lives in. Never public; see contract §3. */
export const KYB_EVIDENCE_BUCKET = "kyb-evidence";

/** The approved MIME/size limits (contract §3) — mirrored here for client-side pre-validation only; the bucket and `attach_kyb_document` remain the real, server-side enforcement. */
export const KYB_EVIDENCE_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const KYB_EVIDENCE_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Builds the enforced, organization/application-scoped object path (contract §3). */
export function buildKybObjectPath(organizationId: string, applicationId: string, generatedObjectName: string): string {
  return `org/${organizationId}/application/${applicationId}/${generatedObjectName}`;
}

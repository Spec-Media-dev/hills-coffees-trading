import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { KYB_EVIDENCE_ALLOWED_MIME_TYPES } from "@/lib/kyb/limits";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature 010 RUN E — the KYB reviewer's document-byte read (the RUN B / T008 correction).
 *
 * ── CURRENT ACCESS MODEL (inspected 2026-09-16, not assumed) ─────────────────────────────────────
 * Bytes live in the private `kyb-evidence` bucket. `storage.objects` policy `kyb_evidence_member_select`
 * (Feature 003 migration) calls `kyb_storage_object_authorized(name, false)`, which returns TRUE for
 * `is_platform_admin()` and `is_compliance_operator()` — so a reviewer's OWN session may read any
 * object in that bucket (subject to the T033 MFA gate). The object's location, however, is
 * `file_assets.object_path`, and `file_assets` has only `catalog_admin_files` (platform admin / uploader /
 * owning-organization member): a PURE COMPLIANCE role can read the `kyb_documents` row but not the
 * `file_assets` row that locates the bytes. Classification: **B — platform admin can read, pure
 * COMPLIANCE cannot** (recorded RUN B, unchanged). No RLS/Storage change is made here.
 *
 * ── HOW THIS READS ───────────────────────────────────────────────────────────────────────────────
 * The console guard (`is_compliance_operator()`, live) runs first; then the `kyb_documents` →
 * `file_assets` join is read under the caller's own session; then the bytes are downloaded with that
 * same session's Storage client (`storage.from(bucket).download(path)`) and streamed by the route
 * handler with `Cache-Control: private, no-store`. No signed URL is minted (none is an approved
 * pattern here), no public URL exists, no service role is used, and every request re-authorizes —
 * a copied route URL is never a bypass. Only the bucket's own allowed MIME types (PDF/JPEG/PNG) are
 * served inline; anything else would be refused rather than sniffed.
 */

export type KybDocumentFile = { ok: true; bytes: Blob; mimeType: string; fileName: string } | { ok: false; reason: "forbidden" | "not-found" | "unlocatable" | "download-failed" };

export async function readKybDocumentFile({ applicationId, documentId }: { applicationId: string; documentId: string }): Promise<KybDocumentFile> {
  const access = await checkRoleFunctionAccess("is_compliance_operator");
  if (!access.ok) return { ok: false, reason: "forbidden" };
  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !/^[0-9a-f-]{36}$/i.test(documentId)) return { ok: false, reason: "not-found" };

  const supabase = await createClient();
  const { data } = await supabase.from("kyb_documents").select("id, application_id, file_assets(bucket_name, object_path, mime_type, original_name)").eq("id", documentId).eq("application_id", applicationId).maybeSingle();
  if (!data) return { ok: false, reason: "not-found" };
  type FileRow = { bucket_name: string; object_path: string; mime_type: string; original_name: string };
  const file = (Array.isArray(data.file_assets) ? (data.file_assets[0] as FileRow | undefined) : (data.file_assets as FileRow | null)) ?? null;
  // A pure COMPLIANCE role reaches this branch: the document row is readable, its file record is not.
  if (!file || !file.object_path || !file.bucket_name) return { ok: false, reason: "unlocatable" };
  if (!(KYB_EVIDENCE_ALLOWED_MIME_TYPES as readonly string[]).includes(file.mime_type)) return { ok: false, reason: "download-failed" };

  const { data: blob, error } = await supabase.storage.from(file.bucket_name).download(file.object_path);
  if (error || !blob) return { ok: false, reason: "download-failed" };
  return { ok: true, bytes: blob, mimeType: file.mime_type, fileName: file.original_name || "document" };
}

/** RFC 5987 filename parameter — never lets a stored name break the header. */
export function contentDispositionInline(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/[";]/g, "_").slice(0, 120) || "document";
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName.slice(0, 120))}`;
}

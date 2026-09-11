"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import { checkKybCompleteness } from "@/lib/kyb/completeness";
import {
  attachKybDocument,
  buildKybObjectPath,
  KYB_EVIDENCE_ALLOWED_MIME_TYPES,
  KYB_EVIDENCE_BUCKET,
  KYB_EVIDENCE_MAX_SIZE_BYTES,
} from "@/lib/kyb/documents";
import { createKybDraft, resubmitKybApplication, submitKybApplication, updateKybDraft } from "@/lib/kyb/mutations";
import { currentDocuments, getKybWorkspace, KYB_EDITABLE_STATUSES } from "@/lib/kyb/status";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { isKybDocumentType, KybDraftInput } from "@/lib/validation/kyb-application";

/**
 * Feature 003 RUN B (T016–T018, T020) — the member-facing KYB draft/upload/submit/resubmit Server
 * Actions. Every action here follows the same six-step contract `dashboard/settings/actions.ts`
 * established (validate → authenticate → authorize → controlled data access → safe error →
 * revalidate), and every one of them resolves the acting organization and the application FRESH,
 * this request, from `getRequestIdentity()`/`getKybWorkspace()` — never from a client-supplied
 * organization or application id. A client-supplied id would in any case be independently rejected
 * by the underlying RPCs' own `is_org_member(...)` checks (defence in depth), but this file does not
 * lean on that as its only line of defence.
 *
 * A blocked caller is refused by the underlying RPCs themselves (`create_kyb_draft`,
 * `update_kyb_draft`, `attach_kyb_document`, `submit_kyb_application`, `resubmit_kyb_application` all
 * `raise exception 'forbidden'` for `is_blocked_user()`) — this file does not re-derive that check in
 * TypeScript, the same reasoning `dashboard/onboarding/actions.ts` already documents (`RequestIdentity`
 * carries no `isBlocked` field; the DB function is the sole authority for it).
 */

/** Common guard: resolves identity, requires an authenticated, verified member of an authorized-pending organization. */
async function requireOnboardingOrganization() {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated") redirect("/sign-in/");
  if (!identity.isEmailVerified) redirect("/verify-email/");
  if (identity.organization === null || identity.requiresOrganizationSelection) redirect("/dashboard/");
  // Already authorized — there is no more KYB action to take.
  if (identity.isAuthorizedMember) redirect("/dashboard/");

  return identity;
}

/** Starts (or resumes) KYB verification and sends the caller to the draft screen. Button-only action. */
export async function startKybVerification(): Promise<ActionFeedbackResult> {
  const identity = await requireOnboardingOrganization();

  const result = await createKybDraft(identity.organization!.organizationId);
  if (!result.ok) return { ok: false, code: ACTION_FEEDBACK.KYB_START_FAILED };

  revalidatePath("/dashboard/kyb/");
  redirect("/dashboard/kyb/");
}

/** T016 — saves the draft business-detail fields. Creates the draft application on first save if none exists yet. */
export async function saveKybDraft(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  // 1. VALIDATE
  const parsed = KybDraftInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // 2/3. AUTHENTICATE + AUTHORIZE
  const identity = await requireOnboardingOrganization();

  // 4. CONTROLLED DATA ACCESS
  const draft = await createKybDraft(identity.organization!.organizationId);
  if (!draft.ok || !draft.applicationId) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_DRAFT_SAVE_FAILED };
  }

  const result = await updateKybDraft({
    applicationId: draft.applicationId,
    registeredAddress: parsed.data.registeredAddress,
    businessActivity: parsed.data.businessActivity,
  });

  // 5. SAFE ERROR MAPPING — already generic (`lib/kyb/mutations.ts` never surfaces a raw RPC error).
  if (!result.ok) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_DRAFT_SAVE_FAILED };
  }

  // 6. REVALIDATE
  revalidatePath("/dashboard/kyb/");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.KYB_DRAFT_SAVED };
}

/**
 * T017 — real private document upload. Uploads bytes to the already-live `kyb-evidence` bucket
 * through the request-scoped, RLS-respecting server client (never the service-role key), THEN calls
 * `attach_kyb_document` to create the canonical metadata row. If the metadata attach fails after a
 * successful byte upload, the orphaned object is best-effort deleted and the caller is told the
 * truth — this action never reports success for an upload whose metadata was not actually recorded.
 */
export async function uploadKybDocument(
  _prevState: ActionFeedbackResult | undefined,
  formData: FormData
): Promise<ActionFeedbackResult> {
  // 2/3. AUTHENTICATE + AUTHORIZE
  const identity = await requireOnboardingOrganization();

  const workspace = await getKybWorkspace(identity.organization!.organizationId);
  if (!workspace.application || !KYB_EDITABLE_STATUSES.includes(workspace.application.status)) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_APPLICATION_NOT_EDITABLE };
  }

  // 1. VALIDATE (server-side; the client also pre-validates for UX, but this is the real boundary)
  const documentTypeRaw = formData.get("documentType");
  const file = formData.get("file");
  const supersedesDocumentId = formData.get("supersedesDocumentId");

  if (typeof documentTypeRaw !== "string" || !isKybDocumentType(documentTypeRaw)) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_UPLOAD_FAILED };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_FILE_REQUIRED, fieldErrors: { file: ["required"] } };
  }
  if (!(KYB_EVIDENCE_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_FILE_TYPE_INVALID, fieldErrors: { file: ["type"] } };
  }
  if (file.size > KYB_EVIDENCE_MAX_SIZE_BYTES) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_FILE_TOO_LARGE, fieldErrors: { file: ["size"] } };
  }

  // If replacing, the target must be a CURRENT document of the SAME type on THIS application —
  // re-verified here even though `attach_kyb_document` also enforces it server-side (contract §4.8).
  let resolvedSupersedesId: string | undefined;
  if (typeof supersedesDocumentId === "string" && supersedesDocumentId.length > 0) {
    const target = currentDocuments(workspace.documents).find(
      (document) => document.id === supersedesDocumentId && document.documentType === documentTypeRaw
    );
    if (!target) {
      return { ok: false, code: ACTION_FEEDBACK.KYB_REPLACEMENT_STALE };
    }
    resolvedSupersedesId = supersedesDocumentId;
  }

  // 4. CONTROLLED DATA ACCESS — real bytes, private bucket, org/application-scoped path.
  const extension = extensionForMime(file.type);
  const objectPath = buildKybObjectPath(
    identity.organization!.organizationId,
    workspace.application.id,
    `${documentTypeRaw.toLowerCase()}-${randomUUID()}${extension}`
  );

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage.from(KYB_EVIDENCE_BUCKET).upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_UPLOAD_FAILED };
  }

  const attachResult = await attachKybDocument({
    applicationId: workspace.application.id,
    documentType: documentTypeRaw,
    objectPath,
    originalName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    supersedesDocumentId: resolvedSupersedesId,
  });

  if (!attachResult.ok) {
    // The bytes uploaded but the metadata write failed — this is an orphaned object, not a partial
    // success. Best-effort cleanup; the caller is told the truth either way.
    await supabase.storage.from(KYB_EVIDENCE_BUCKET).remove([objectPath]).catch(() => undefined);
    return { ok: false, code: ACTION_FEEDBACK.KYB_UPLOAD_FAILED };
  }

  // 6. REVALIDATE
  revalidatePath("/dashboard/kyb/");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.KYB_UPLOAD_SUCCEEDED };
}

/**
 * T018 — server-side completeness re-validation, then `DRAFT -> SUBMITTED`. Never trusts client-side
 * completeness alone. Declared with no parameters (rather than unused `prevState`/`formData` ones) —
 * it needs neither, and `useActionState`'s action type accepts a function with fewer declared
 * parameters than it calls with.
 */
export async function submitKyb(): Promise<ActionFeedbackResult> {
  const identity = await requireOnboardingOrganization();

  const workspace = await getKybWorkspace(identity.organization!.organizationId);
  if (!workspace.application || workspace.application.status !== "DRAFT") {
    return { ok: false, code: ACTION_FEEDBACK.KYB_SUBMIT_NOT_ALLOWED };
  }

  const completeness = checkKybCompleteness(workspace.application, currentDocuments(workspace.documents));
  if (!completeness.complete) {
    const fieldErrors: Record<string, string[]> = {};
    for (const item of completeness.missing) fieldErrors[item.key] = ["missing"];
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors };
  }

  const result = await submitKybApplication(workspace.application.id);
  if (!result.ok) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_SUBMIT_FAILED };
  }

  revalidatePath("/dashboard/");
  revalidatePath("/dashboard/kyb/");
  redirect("/dashboard/");
}

/** T020 — server-side re-validation (no current REJECTED document may remain), then `RESUBMISSION_REQUIRED -> SUBMITTED`. */
export async function resubmitKyb(): Promise<ActionFeedbackResult> {
  const identity = await requireOnboardingOrganization();

  const workspace = await getKybWorkspace(identity.organization!.organizationId);
  if (!workspace.application || workspace.application.status !== "RESUBMISSION_REQUIRED") {
    return { ok: false, code: ACTION_FEEDBACK.KYB_RESUBMIT_NOT_ALLOWED };
  }

  const completeness = checkKybCompleteness(workspace.application, currentDocuments(workspace.documents));
  if (!completeness.complete) {
    const fieldErrors: Record<string, string[]> = {};
    for (const item of completeness.missing) fieldErrors[item.key] = ["missing"];
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors };
  }

  // `resubmit_kyb_application` itself also refuses while any current document is REJECTED
  // (migration revision fix #5) — the completeness check above already catches this same condition
  // with a specific per-document message, so this is defence in depth, not the only guard.
  const result = await resubmitKybApplication(workspace.application.id);
  if (!result.ok) {
    return { ok: false, code: ACTION_FEEDBACK.KYB_RESUBMIT_FAILED };
  }

  revalidatePath("/dashboard/");
  revalidatePath("/dashboard/kyb/");
  redirect("/dashboard/");
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  return "";
}

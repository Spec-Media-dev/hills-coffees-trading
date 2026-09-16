import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { evaluateKybApprovalReadiness, KYB_DOCUMENT_REVIEWABLE_APPLICATION_STATUSES } from "@/lib/admin/kyb-readiness";
import {
  KybDecisionInput,
  KybDocumentReviewInput,
  KybStartReviewInput,
  ListingDecisionInput,
  OrganizationStatusInput,
  type KybDecision,
  type KybDocumentDecision,
  type ListingDecision,
} from "@/lib/admin/validation";
import { createKybReview } from "@/lib/kyb/review-items";
import type { KybApplicationStatus, KybDocumentSummary } from "@/lib/kyb/status-types";
import type { ListingStatus } from "@/lib/listings/types";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackCode, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN B — Compliance decision recording (T009 KYB decisions, T010 organization status,
 * T011 listing decisions). Composes ONLY the approved write surfaces the plan's capability table
 * names for `is_compliance_operator()` — `kyb_applications` (ALL), `kyb_reviews` (ALL),
 * `organizations` (UPDATE), `coffee_offers` (UPDATE), `listing_reviews` (ALL) — through the
 * operator's own session. No service role, no RPC of its own, no parallel state machine: every
 * status literal below is one the database's own CHECK constraints and triggers already define, and
 * `validate_offer_transition` / RLS remain the authority underneath.
 *
 * ── EXACTLY ONCE: COMPARE-AND-SET ON THE SOURCE STATUS ───────────────────────────────────────────
 *
 * Each state change is a single `UPDATE … WHERE id = ? AND status IN (<permitted sources>)` with an
 * exact affected-row count. Under READ COMMITTED a concurrent second operator's UPDATE re-evaluates
 * that WHERE after the first commits, sees the new status, and affects zero rows — it is reported
 * as `*_STALE`, never applied twice and never overwritten. The review row (`kyb_reviews` /
 * `listing_reviews`) is inserted ONLY after the state change succeeded, so history never contains a
 * decision that did not take effect; if the insert itself fails after a successful state change,
 * the result is `*_HISTORY_INCOMPLETE` (surfaced, never hidden). Two-operator races are covered
 * live in `tests/admin/compliance-decisions.test.ts`; the full concurrency matrix remains T032's.
 *
 * ── ORGANIZATION FOLLOW-THROUGH IS HONEST ABOUT THE POLICY GAP ───────────────────────────────────
 *
 * `organization_can_buy()` requires the organization to be `ACTIVE` AND its KYB `APPROVED`; nothing
 * in the database moves the organization on approval, so the console does — through the approved
 * `organizations_compliance_update` policy. That policy's USING passes for COMPLIANCE, but because
 * an UPDATE whose WHERE references existing columns is ALSO subject to SELECT policies (PostgreSQL
 * row-security semantics), and `organizations` has no SELECT path for a pure COMPLIANCE operator,
 * the update affects ZERO rows for that role (verified live 2026-09-15; an ADMIN succeeds). The
 * result therefore carries `organizationFollowThrough: "applied" | "unavailable" | "not-required"`
 * so the UI can state exactly what happened; nothing is bypassed.
 *
 * ── NO HARD DELETE ───────────────────────────────────────────────────────────────────────────────
 *
 * This module issues no `.delete()` and no status that removes a record; every prior review row,
 * status-history row and audit row is retained (`kyb_review_items` is trigger-append-only, and the
 * `record_account_status_history` / `record_listing_status_history` triggers write the history).
 */

export type OrganizationFollowThrough = "applied" | "unavailable" | "not-required";

export type KybDecisionOutcome = {
  applicationId: string;
  organizationId: string;
  decision: KybDecision;
  reviewId: string | null;
  fromStatus: KybApplicationStatus;
  toStatus: KybApplicationStatus;
  organizationFollowThrough: OrganizationFollowThrough;
};

/** Application statuses each decision may be recorded FROM — the console's honest reading of the vocabulary. */
export const KYB_DECISION_SOURCES: Readonly<Record<KybDecision, readonly KybApplicationStatus[]>> = {
  APPROVED: ["SUBMITTED", "UNDER_REVIEW", "SUSPENDED"],
  REJECTED: ["SUBMITTED", "UNDER_REVIEW"],
  RESUBMISSION_REQUIRED: ["SUBMITTED", "UNDER_REVIEW"],
  SUSPENDED: ["APPROVED"],
};

/** Organization status each decision implies, with the organization statuses it may move FROM. */
const KYB_DECISION_ORGANIZATION_EFFECT: Readonly<Record<KybDecision, { to: string; from: readonly string[] } | null>> = {
  APPROVED: { to: "ACTIVE", from: ["PENDING_KYB", "UNDER_REVIEW", "SUSPENDED"] },
  REJECTED: { to: "REJECTED", from: ["PENDING_KYB", "UNDER_REVIEW"] },
  RESUBMISSION_REQUIRED: null,
  SUSPENDED: { to: "SUSPENDED", from: ["ACTIVE"] },
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireCompliance(): Promise<{ ok: true; userId: string } | { ok: false; code: ActionFeedbackCode }> {
  const access = await checkRoleFunctionAccess("is_compliance_operator");
  if (!access.ok) return { ok: false, code: access.denial === "anonymous" ? ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED : ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE };
  return { ok: true, userId: access.identity.userId };
}

function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

async function updateOrganizationStatus(
  supabase: SupabaseServerClient,
  organizationId: string,
  effect: { to: string; from: readonly string[] },
): Promise<OrganizationFollowThrough> {
  const { count, error } = await supabase
    .from("organizations")
    .update({ status: effect.to }, { count: "exact" })
    .eq("id", organizationId)
    .in("status", [...effect.from]);
  if (error || count !== 1) return "unavailable";
  return "applied";
}

// ── T009 — KYB decisions ────────────────────────────────────────────────────────────────────────

export async function decideKybApplication(input: unknown): Promise<ActionFeedbackResult<KybDecisionOutcome>> {
  const parsed = KybDecisionInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(parsed.error) };
  const access = await requireCompliance();
  if (!access.ok) return { ok: false, code: access.code };

  const { applicationId, decision, reason } = parsed.data;
  const supabase = await createClient();

  // 1. The application must be readable and in a decidable state (an unreadable/nonexistent id is
  //    indistinguishable, by design — nothing is enumerated).
  const { data: before } = await supabase.from("kyb_applications").select("id, organization_id, status, registered_address, business_activity").eq("id", applicationId).maybeSingle();
  if (!before) return { ok: false, code: ACTION_FEEDBACK.KYB_DECISION_STALE };
  const sources = KYB_DECISION_SOURCES[decision];
  if (!sources.includes(before.status as KybApplicationStatus)) return { ok: false, code: ACTION_FEEDBACK.KYB_DECISION_STALE };

  // 1b. RUN E — APPROVED is refused while any REQUIRED evidence is missing, awaiting review, rejected
  //     or expired (or an application field is missing). Re-read from the persisted rows HERE, on the
  //     server, regardless of what the page showed — never a client-side gate.
  if (decision === "APPROVED") {
    const readiness = evaluateKybApprovalReadiness({ registeredAddress: before.registered_address, businessActivity: before.business_activity }, await readCurrentDocuments(supabase, applicationId));
    if (!readiness.approvable) {
      return { ok: false, code: ACTION_FEEDBACK.KYB_APPROVAL_BLOCKED, fieldErrors: { decision: readiness.blockers.map((blocker) => `${blocker.state}:${blocker.key}`) } };
    }
  }

  // 2. Compare-and-set the application status (the exactly-once lock).
  const { data: updated, error: updateError } = await supabase
    .from("kyb_applications")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: access.userId,
      rejection_reason: reason ?? null,
    })
    .eq("id", applicationId)
    .in("status", [...sources])
    .select("id, organization_id, status")
    .maybeSingle();
  if (updateError) return { ok: false, code: ACTION_FEEDBACK.KYB_DECISION_FAILED };
  if (!updated) return { ok: false, code: ACTION_FEEDBACK.KYB_DECISION_STALE };

  // 3. Organization follow-through (when the decision implies one).
  const effect = KYB_DECISION_ORGANIZATION_EFFECT[decision];
  const organizationFollowThrough: OrganizationFollowThrough = effect ? await updateOrganizationStatus(supabase, updated.organization_id, effect) : "not-required";

  // 4. The review row — reviewer identity derived server-side, never from the caller.
  const { data: review, error: reviewError } = await supabase
    .from("kyb_reviews")
    .insert({ application_id: applicationId, reviewer_user_id: access.userId, decision, reason: reason ?? null })
    .select("id")
    .maybeSingle();

  const outcome: KybDecisionOutcome = {
    applicationId,
    organizationId: updated.organization_id,
    decision,
    reviewId: review?.id ?? null,
    fromStatus: before.status as KybApplicationStatus,
    toStatus: updated.status as KybApplicationStatus,
    organizationFollowThrough,
  };
  if (reviewError || !review) return { ok: true, data: outcome, code: ACTION_FEEDBACK.KYB_DECISION_HISTORY_INCOMPLETE };
  return { ok: true, data: outcome, code: ACTION_FEEDBACK.KYB_DECISION_RECORDED };
}

async function readCurrentDocuments(supabase: SupabaseServerClient, applicationId: string): Promise<KybDocumentSummary[]> {
  const { data } = await supabase.from("kyb_documents").select("id, document_type, status, version, supersedes_document_id, expires_at, created_at").eq("application_id", applicationId);
  return (data ?? []).map((row) => ({
    id: row.id,
    documentType: row.document_type,
    status: row.status as KybDocumentSummary["status"],
    version: row.version,
    supersedesDocumentId: row.supersedes_document_id ?? null,
    originalName: null,
    mimeType: null,
    sizeBytes: null,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
  }));
}

export type KybDocumentReviewOutcome = { applicationId: string; documentId: string; decision: KybDocumentDecision; reviewId: string; documentStatus: KybDocumentSummary["status"] };

/**
 * RUN E — a document-level outcome, recorded through Feature 003's own `create_kyb_review` RPC
 * (`lib/kyb/review-items.ts`): reviewer identity and timestamp are derived inside the database,
 * the row is appended to the immutable `kyb_review_items` ledger, and the database's trigger sets
 * `kyb_documents.status` to the decision. The console adds only its state discipline: the document
 * must currently be `PENDING` (a decided or superseded version is `KYB_DOCUMENT_REVIEW_STALE`) and
 * the application must still be under review. The persisted status is re-read after the write.
 */
export async function reviewKybDocument(input: unknown): Promise<ActionFeedbackResult<KybDocumentReviewOutcome>> {
  const parsed = KybDocumentReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(parsed.error) };
  const access = await requireCompliance();
  if (!access.ok) return { ok: false, code: access.code };

  const supabase = await createClient();
  const [{ data: application }, { data: document }] = await Promise.all([
    supabase.from("kyb_applications").select("id, status").eq("id", parsed.data.applicationId).maybeSingle(),
    supabase.from("kyb_documents").select("id, application_id, status").eq("id", parsed.data.documentId).eq("application_id", parsed.data.applicationId).maybeSingle(),
  ]);
  if (!application || !document) return { ok: false, code: ACTION_FEEDBACK.KYB_DOCUMENT_REVIEW_STALE };
  if (!KYB_DOCUMENT_REVIEWABLE_APPLICATION_STATUSES.includes(application.status as KybApplicationStatus)) return { ok: false, code: ACTION_FEEDBACK.KYB_DOCUMENT_REVIEW_STALE };
  if (document.status !== "PENDING") return { ok: false, code: ACTION_FEEDBACK.KYB_DOCUMENT_REVIEW_STALE };

  const created = await createKybReview({ applicationId: parsed.data.applicationId, documentId: parsed.data.documentId, decision: parsed.data.decision, reason: parsed.data.reason });
  if (!created.ok) return { ok: false, code: ACTION_FEEDBACK.KYB_DOCUMENT_REVIEW_FAILED };

  const { data: after } = await supabase.from("kyb_documents").select("status").eq("id", parsed.data.documentId).maybeSingle();
  return {
    ok: true,
    data: { applicationId: parsed.data.applicationId, documentId: parsed.data.documentId, decision: parsed.data.decision, reviewId: created.reviewId, documentStatus: (after?.status as KybDocumentSummary["status"]) ?? parsed.data.decision },
    code: ACTION_FEEDBACK.KYB_DOCUMENT_REVIEW_RECORDED,
  };
}

/** SUBMITTED → UNDER_REVIEW: a status step, not a decision — no `kyb_reviews` row is written. */
export async function startKybReview(input: unknown): Promise<ActionFeedbackResult<{ applicationId: string; organizationFollowThrough: OrganizationFollowThrough }>> {
  const parsed = KybStartReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(parsed.error) };
  const access = await requireCompliance();
  if (!access.ok) return { ok: false, code: access.code };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("kyb_applications")
    .update({ status: "UNDER_REVIEW" })
    .eq("id", parsed.data.applicationId)
    .eq("status", "SUBMITTED")
    .select("id, organization_id")
    .maybeSingle();
  if (error) return { ok: false, code: ACTION_FEEDBACK.KYB_DECISION_FAILED };
  if (!updated) return { ok: false, code: ACTION_FEEDBACK.KYB_DECISION_STALE };
  const organizationFollowThrough = await updateOrganizationStatus(supabase, updated.organization_id, { to: "UNDER_REVIEW", from: ["PENDING_KYB"] });
  return { ok: true, data: { applicationId: updated.id, organizationFollowThrough }, code: ACTION_FEEDBACK.KYB_REVIEW_STARTED };
}

// ── T010 — organization status (suspension / reinstatement) ─────────────────────────────────────

export type OrganizationStatusOutcome = {
  organizationId: string;
  fromStatus: string;
  toStatus: string;
  applicationId: string | null;
  reviewId: string | null;
};

/**
 * Suspends (`ACTIVE → SUSPENDED`) or reinstates (`SUSPENDED → ACTIVE`) an organization through the
 * approved compliance UPDATE, recording the mandatory reason as a `kyb_reviews` row (`SUSPENDED` /
 * `APPROVED`) against the organization's current application — the only reason-bearing compliance
 * record the schema provides (`account_status_history.reason` is written by no trigger and has no
 * compliance INSERT path). Effect on the member is the database's own: `organization_can_buy()` /
 * `is_authorized_member()` read `organizations.status` on their next request.
 *
 * Requires the organization row to be READABLE by this operator (pre-checked): a pure COMPLIANCE
 * operator is refused with `ORGANIZATION_ACCESS_UNAVAILABLE` before anything is written (the
 * recorded policy gap), never left half-applied.
 */
export async function setOrganizationStatus(input: unknown): Promise<ActionFeedbackResult<OrganizationStatusOutcome>> {
  const parsed = OrganizationStatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(parsed.error) };
  const access = await requireCompliance();
  if (!access.ok) return { ok: false, code: access.code };

  const { organizationId, status, reason } = parsed.data;
  const supabase = await createClient();

  const { data: organization } = await supabase.from("organizations").select("id, status, is_hills_internal").eq("id", organizationId).maybeSingle();
  if (!organization) return { ok: false, code: ACTION_FEEDBACK.ORGANIZATION_ACCESS_UNAVAILABLE };
  const expectedFrom = status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
  if (organization.status !== expectedFrom) return { ok: false, code: ACTION_FEEDBACK.ORGANIZATION_STATUS_STALE };

  // The organization's current application (for the reason-bearing review row).
  const { data: application } = await supabase
    .from("kyb_applications")
    .select("id, status")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Compare-and-set on the organization (the exactly-once lock for this operation).
  const { count, error } = await supabase.from("organizations").update({ status }, { count: "exact" }).eq("id", organizationId).eq("status", expectedFrom);
  if (error) return { ok: false, code: ACTION_FEEDBACK.ORGANIZATION_STATUS_FAILED };
  if (count !== 1) return { ok: false, code: ACTION_FEEDBACK.ORGANIZATION_STATUS_STALE };

  // Keep the application's status coherent (APPROVED ⇄ SUSPENDED) when it is in a matching state.
  if (application) {
    await supabase
      .from("kyb_applications")
      .update(status === "SUSPENDED" ? { status: "SUSPENDED", decided_at: new Date().toISOString(), decided_by: access.userId, rejection_reason: reason } : { status: "APPROVED", decided_at: new Date().toISOString(), decided_by: access.userId, rejection_reason: null })
      .eq("id", application.id)
      .in("status", status === "SUSPENDED" ? ["APPROVED"] : ["SUSPENDED", "APPROVED"]);
  }

  let reviewId: string | null = null;
  if (application) {
    const { data: review } = await supabase
      .from("kyb_reviews")
      .insert({ application_id: application.id, reviewer_user_id: access.userId, decision: status === "SUSPENDED" ? "SUSPENDED" : "APPROVED", reason })
      .select("id")
      .maybeSingle();
    reviewId = review?.id ?? null;
  }

  const outcome: OrganizationStatusOutcome = { organizationId, fromStatus: expectedFrom, toStatus: status, applicationId: application?.id ?? null, reviewId };
  if (!application || !reviewId) return { ok: true, data: outcome, code: ACTION_FEEDBACK.KYB_DECISION_HISTORY_INCOMPLETE };
  return { ok: true, data: outcome, code: ACTION_FEEDBACK.ORGANIZATION_STATUS_CHANGED };
}

// ── T011 — listing decisions ────────────────────────────────────────────────────────────────────

/** Listing statuses each decision may be recorded FROM — `validate_offer_transition`'s own graph. */
export const LISTING_DECISION_SOURCES: Readonly<Record<ListingDecision, readonly ListingStatus[]>> = {
  APPROVED: ["PENDING_REVIEW"],
  REJECTED: ["PENDING_REVIEW"],
  SUSPENDED: ["PUBLISHED", "PARTIALLY_FILLED"],
};

export type ListingDecisionOutcome = {
  offerId: string;
  decision: ListingDecision;
  reviewId: string | null;
  fromStatus: ListingStatus;
  toStatus: ListingStatus;
};

export async function decideListing(input: unknown): Promise<ActionFeedbackResult<ListingDecisionOutcome>> {
  const parsed = ListingDecisionInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(parsed.error) };
  const access = await requireCompliance();
  if (!access.ok) return { ok: false, code: access.code };

  const { offerId, decision, reason } = parsed.data;
  const supabase = await createClient();

  const { data: before } = await supabase.from("coffee_offers").select("id, status").eq("id", offerId).maybeSingle();
  if (!before) return { ok: false, code: ACTION_FEEDBACK.LISTING_DECISION_STALE };
  const sources = LISTING_DECISION_SOURCES[decision];
  if (!sources.includes(before.status as ListingStatus)) return { ok: false, code: ACTION_FEEDBACK.LISTING_DECISION_STALE };

  // Compare-and-set; `rejection_reason` is what `record_listing_status_history` copies into the
  // history row's `reason`, so the operator's reason lands in BOTH ledgers. The trigger still
  // validates the whole transition — a refusal surfaces as a safe code, never its text.
  const { data: updated, error: updateError } = await supabase
    .from("coffee_offers")
    .update({ status: decision, rejection_reason: reason ?? null })
    .eq("id", offerId)
    .in("status", [...sources])
    .select("id, status")
    .maybeSingle();
  if (updateError) return { ok: false, code: ACTION_FEEDBACK.LISTING_DECISION_FAILED };
  if (!updated) return { ok: false, code: ACTION_FEEDBACK.LISTING_DECISION_STALE };

  const { data: review, error: reviewError } = await supabase
    .from("listing_reviews")
    .insert({ offer_id: offerId, reviewer_user_id: access.userId, decision, reason: reason ?? null })
    .select("id")
    .maybeSingle();

  const outcome: ListingDecisionOutcome = { offerId, decision, reviewId: review?.id ?? null, fromStatus: before.status as ListingStatus, toStatus: updated.status as ListingStatus };
  if (reviewError || !review) return { ok: true, data: outcome, code: ACTION_FEEDBACK.LISTING_DECISION_HISTORY_INCOMPLETE };
  return { ok: true, data: outcome, code: ACTION_FEEDBACK.LISTING_DECISION_RECORDED };
}

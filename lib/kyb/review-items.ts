import { createClient } from "@/lib/supabase/server";

/**
 * Thin, server-only wrapper around the RUN DB document-level review/version read path
 * (`supabase/migrations/20260911010000_feature_003_kyb_foundation.sql`,
 * `specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §5).
 *
 * Never queries `kyb_review_items` directly — that table carries no member-facing RLS policy at
 * all (only `is_compliance_operator()`). The only safe member read is `list_kyb_document_reviews`,
 * which replaces the real `reviewer_user_id` with the fixed label `"Hills Compliance"` before the
 * row ever leaves the database (spec SEC-007) — this module has no `reviewer_user_id` field to
 * accidentally forward because the RPC never returns one.
 */

export type KybDocumentReview = {
  documentId: string;
  decision: "ACCEPTED" | "REJECTED";
  reason: string | null;
  reviewedAt: string;
  reviewerLabel: string;
};

export type ListKybDocumentReviewsResult = { ok: true; reviews: KybDocumentReview[] } | { ok: false; error: string };

/** Calls `list_kyb_document_reviews` for the caller's own organization's application. */
export async function listKybDocumentReviews(applicationId: string): Promise<ListKybDocumentReviewsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_kyb_document_reviews", {
    p_application_id: applicationId,
  });

  if (error) {
    return { ok: false, error: "We could not load the review history for this application." };
  }

  const rows = (data ?? []) as Array<{
    document_id: string;
    decision: "ACCEPTED" | "REJECTED";
    reason: string | null;
    reviewed_at: string;
    reviewer_label: string;
  }>;

  return {
    ok: true,
    reviews: rows.map((row) => ({
      documentId: row.document_id,
      decision: row.decision,
      reason: row.reason,
      reviewedAt: row.reviewed_at,
      reviewerLabel: row.reviewer_label,
    })),
  };
}

export type CreateKybReviewInput = {
  applicationId: string;
  documentId: string;
  decision: "ACCEPTED" | "REJECTED";
  reason?: string;
};

export type CreateKybReviewResult = { ok: true; reviewId: string } | { ok: false; error: string };

/**
 * Calls `create_kyb_review` (migration review fix #1) — the ONLY sanctioned way to create a review
 * event. Never accepts or forwards `reviewerUserId` or a caller-supplied timestamp: the RPC derives
 * `reviewer_user_id = auth.uid()` and `created_at = now()` itself, and requires
 * `is_compliance_operator()` server-side. `kyb_review_items` is append-only — there is no
 * corresponding update/delete wrapper, because no update/delete RPC exists (the base table also has
 * a trigger that unconditionally refuses UPDATE/DELETE).
 */
export async function createKybReview(input: CreateKybReviewInput): Promise<CreateKybReviewResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_kyb_review", {
    p_application_id: input.applicationId,
    p_document_id: input.documentId,
    p_decision: input.decision,
    p_reason: input.reason ?? null,
  });

  if (error || !data) {
    return { ok: false, error: "We could not record this review decision." };
  }

  return { ok: true, reviewId: data as string };
}

"use client";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import type { ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import type { KybDocumentReviewOutcome } from "@/lib/admin/decisions";
import { KYB_DOCUMENT_DECISIONS, REASON_MAX_LENGTH, REASON_MIN_LENGTH, type KybDocumentDecision } from "@/lib/admin/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { recordKybDocumentOutcome } from "@/src/app/dashboard-admin/(compliance)/kyb/actions";

/**
 * Feature 010 RUN E — the per-document outcome control on the KYB detail page. Rendered ONLY for a
 * current `PENDING` document of an application still under review (the page decides; the server
 * re-checks both in `reviewKybDocument`). Vocabulary is `kyb_review_items.decision`'s own CHECK
 * (ACCEPTED / REJECTED); a rejection requires a reason (also enforced by the RPC). The outcome is
 * appended to Feature 003's immutable ledger under the reviewer's identity — never edited.
 */
export function KybDocumentReviewPanel({ applicationId, documentId, bytesOpenable }: { applicationId: string; documentId: string; bytesOpenable: boolean }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.compliance;
  const review = copy.kyb.detail.documents.review;

  const options: DecisionOption<KybDocumentDecision>[] = KYB_DOCUMENT_DECISIONS.map((decision) => ({
    value: decision,
    label: decision === "ACCEPTED" ? review.accept : review.reject,
    description: decision === "ACCEPTED" ? review.acceptDescription : review.rejectDescription,
    reasonRequired: decision === "REJECTED",
    destructive: decision === "REJECTED",
  }));

  const feedbackFor = (result: ActionFeedbackResult<KybDocumentReviewOutcome>): ActionToastFeedback | null => {
    if (result.ok) return { tone: "success", message: copy.feedback.documentReviewRecorded };
    switch (result.code) {
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.feedback.validationError };
      case ACTION_FEEDBACK.KYB_DOCUMENT_REVIEW_STALE:
        return { tone: "warning", message: copy.feedback.documentReviewStale };
      case ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.complianceNotCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      default:
        return { tone: "error", message: copy.feedback.documentReviewFailed };
    }
  };

  return (
    <DecisionForm<KybDocumentDecision, KybDocumentReviewOutcome>
      hiddenFields={{ applicationId, documentId }}
      decisionFieldName="decision"
      formKey={`document-${documentId}`}
      options={options}
      action={recordKybDocumentOutcome}
      feedbackFor={feedbackFor}
      heading={review.heading}
      lead={review.lead}
      submitLabel={review.submit}
      confirmTitle={review.confirmTitle}
      confirmDescription={review.confirmDescription}
      reason={{ label: review.reasonLabel, hint: review.reasonHint, required: review.reasonRequired, tooLong: review.reasonTooLong, minLength: REASON_MIN_LENGTH, maxLength: REASON_MAX_LENGTH }}
      renderOutcome={(result) =>
        result.ok ? (
          <p data-document-outcome={result.data.documentStatus} className="rounded-[var(--radius-md)] border border-border px-4 py-3 text-[length:var(--text-small)] text-muted-foreground">
            {review.decided.replace("{decision}", copy.statuses.document[result.data.documentStatus])}
          </p>
        ) : null
      }
    >
      {bytesOpenable ? null : (
        <p data-document-bytes-warning className="rounded-[var(--radius-md)] border border-[var(--status-pending)] bg-[var(--status-pending-surface)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-foreground">
          {review.bytesWarning}
        </p>
      )}
    </DecisionForm>
  );
}

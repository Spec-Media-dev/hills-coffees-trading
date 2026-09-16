"use client";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import type { ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import type { ListingDecisionOutcome } from "@/lib/admin/decisions";
import { LISTING_DECISIONS, LISTING_DECISIONS_REQUIRING_REASON, type ListingDecision } from "@/lib/admin/validation";
import type { ListingStatus } from "@/lib/listings/types";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { recordListingDecision } from "@/src/app/dashboard-admin/(compliance)/listings/actions";

/** Feature 010 RUN B (T011) — the listing detail decision panel (mirrors `LISTING_DECISION_SOURCES`). */
function applicableDecisions(status: ListingStatus): readonly ListingDecision[] {
  switch (status) {
    case "PENDING_REVIEW":
      return ["APPROVED", "REJECTED"];
    case "PUBLISHED":
    case "PARTIALLY_FILLED":
      return ["SUSPENDED"];
    default:
      return [];
  }
}

export function ListingDecisionPanel({ offerId, status }: { offerId: string; status: ListingStatus }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.compliance;
  const decisionCopy = copy.listings.detail.decision;
  const applicable = applicableDecisions(status);
  const options: DecisionOption<ListingDecision>[] = LISTING_DECISIONS.filter((decision) => applicable.includes(decision)).map((decision) => ({
    value: decision,
    label: decisionCopy.options[decision].label,
    description: decisionCopy.options[decision].description,
    reasonRequired: LISTING_DECISIONS_REQUIRING_REASON.includes(decision),
    destructive: decision !== "APPROVED",
  }));

  const feedbackFor = (result: ActionFeedbackResult<ListingDecisionOutcome>): ActionToastFeedback | null => {
    if (result.ok) {
      return result.code === ACTION_FEEDBACK.LISTING_DECISION_HISTORY_INCOMPLETE
        ? { tone: "warning", message: copy.feedback.listingHistoryIncomplete }
        : { tone: "success", message: copy.feedback.listingDecisionRecorded };
    }
    switch (result.code) {
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.feedback.validationError };
      case ACTION_FEEDBACK.LISTING_DECISION_STALE:
        return { tone: "warning", message: copy.feedback.listingDecisionStale };
      case ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.complianceNotCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      default:
        return { tone: "error", message: copy.feedback.listingDecisionFailed };
    }
  };

  if (options.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-decision-form="decision" data-decision-state="not-decidable">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{decisionCopy.heading}</h2>
        <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">{decisionCopy.notDecidable.replace("{status}", tApp.marketplace.status[status])}</p>
        {status === "SUSPENDED" ? <p className="mt-2 text-[length:var(--text-micro)] text-muted-foreground">{decisionCopy.reinstateNote}</p> : null}
      </section>
    );
  }

  return (
    <DecisionForm<ListingDecision, ListingDecisionOutcome>
      hiddenFields={{ offerId }}
      decisionFieldName="decision"
      options={options}
      action={recordListingDecision}
      feedbackFor={feedbackFor}
      heading={decisionCopy.heading}
      lead={decisionCopy.lead}
      submitLabel={decisionCopy.submit}
      confirmTitle={decisionCopy.confirmTitle}
      confirmDescription={decisionCopy.confirmDescription}
    />
  );
}

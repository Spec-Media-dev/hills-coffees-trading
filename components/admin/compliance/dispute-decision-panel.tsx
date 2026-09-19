"use client";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import type { ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import type { DisputeTransitionOutcome } from "@/lib/disputes/compliance";
import type { DisputeStatus } from "@/lib/disputes/types";
import { DISPUTE_TEXT_MAX, DISPUTE_TEXT_MIN } from "@/lib/disputes/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { recordDisputeTransition } from "@/src/app/dashboard-admin/(compliance)/disputes/actions";

/**
 * Feature 010 T012 — the dispute detail's status-change panel. The offered next statuses are passed
 * in by the server page straight from Feature 012's `DISPUTE_TRANSITIONS[status]` — this component
 * owns no transition rule. Every option requires a reason (Feature 012's 10–2,000 character limits);
 * outcomes and closing are confirmed first. `expectedStatus` carries the status the operator is
 * looking at, so a dispute that moved meanwhile is refused as stale rather than overwritten.
 */
const HIGH_IMPACT: readonly DisputeStatus[] = ["RESOLVED", "REJECTED", "CLOSED"];

export function DisputeDecisionPanel({ disputeId, status, targets }: { disputeId: string; status: DisputeStatus; targets: readonly DisputeStatus[] }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.compliance;
  const decisionCopy = copy.disputes.detail.decision;
  const options: DecisionOption<DisputeStatus>[] = targets.flatMap((target) => {
    const option = target === "OPEN" ? null : decisionCopy.options[target];
    return option ? [{ value: target, label: option.label, description: option.description, reasonRequired: true, destructive: HIGH_IMPACT.includes(target) }] : [];
  });

  const feedbackFor = (result: ActionFeedbackResult<DisputeTransitionOutcome>): ActionToastFeedback | null => {
    if (result.ok) return { tone: "success", message: copy.feedback.disputeTransitionRecorded };
    switch (result.code) {
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.feedback.validationError };
      case ACTION_FEEDBACK.DISPUTE_STALE:
        return { tone: "warning", message: copy.feedback.disputeTransitionStale };
      case ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED:
        return { tone: "error", message: copy.feedback.disputeTransitionRefused };
      case ACTION_FEEDBACK.DISPUTE_NOT_FOUND:
        return { tone: "error", message: copy.feedback.disputeNotFound };
      case ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.complianceNotCapable };
      case ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED:
        return { tone: "error", message: tApp.feedback.mfaStepUpRequired };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      default:
        return { tone: "error", message: copy.feedback.disputeTransitionFailed };
    }
  };

  if (options.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-decision-form="dispute-transition" data-decision-state="not-decidable">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{decisionCopy.heading}</h2>
        <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">{decisionCopy.notDecidable.replace("{status}", tApp.disputes.status[status])}</p>
      </section>
    );
  }

  return (
    <DecisionForm<DisputeStatus, DisputeTransitionOutcome>
      hiddenFields={{ disputeId, expectedStatus: status }}
      decisionFieldName="status"
      formKey="dispute-transition"
      options={options}
      action={recordDisputeTransition}
      feedbackFor={feedbackFor}
      heading={decisionCopy.heading}
      lead={decisionCopy.lead}
      submitLabel={decisionCopy.submit}
      confirmTitle={decisionCopy.confirmTitle}
      confirmDescription={decisionCopy.confirmDescription}
      reason={{ ...decisionCopy.reason, minLength: DISPUTE_TEXT_MIN, maxLength: DISPUTE_TEXT_MAX }}
    />
  );
}

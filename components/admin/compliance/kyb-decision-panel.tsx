"use client";

import { startTransition, useActionState } from "react";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import { useActionToast, type ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import type { KybDecisionOutcome, OrganizationFollowThrough } from "@/lib/admin/decisions";
import { KYB_DECISIONS, KYB_DECISIONS_REQUIRING_REASON, type KybDecision } from "@/lib/admin/validation";
import type { KybApplicationStatus } from "@/lib/kyb/status-types";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { beginKybReview, recordKybDecision } from "@/src/app/dashboard-admin/(compliance)/kyb/actions";

/**
 * Feature 010 RUN B (T009) — the KYB detail page's decision panel: options + copy + feedback wiring.
 * RUN E: the panel receives the server-derived approval readiness (`lib/admin/kyb-readiness.ts`,
 * computed by the page from persisted rows). While required evidence is missing / awaiting review /
 * rejected / expired, APPROVED is not offered and the reason is stated; the server re-reads the same
 * rule inside `decideKybApplication` regardless (`KYB_APPROVAL_BLOCKED`), so this is a courtesy, not
 * the gate.
 */

export type KybDecisionReadiness = { approvable: boolean; blockerCount: number };

const DESTRUCTIVE: readonly KybDecision[] = ["REJECTED", "SUSPENDED"];

/** Which decisions apply to the application's CURRENT status (mirrors `KYB_DECISION_SOURCES`). */
function applicableDecisions(status: KybApplicationStatus): readonly KybDecision[] {
  switch (status) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return ["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"];
    case "APPROVED":
      return ["SUSPENDED"];
    case "SUSPENDED":
      return ["APPROVED"];
    default:
      return [];
  }
}

export function KybDecisionPanel({ applicationId, status, readiness }: { applicationId: string; status: KybApplicationStatus; readiness: KybDecisionReadiness }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.compliance;
  const decisionCopy = copy.kyb.detail.decision;
  // APPROVED from an under-review state requires every required evidence item to be accepted and
  // current; re-approving a SUSPENDED (previously approved) application follows the same rule.
  const approvalBlocked = !readiness.approvable;
  const applicable = applicableDecisions(status).filter((decision) => !(decision === "APPROVED" && approvalBlocked));

  const options: DecisionOption<KybDecision>[] = KYB_DECISIONS.filter((decision) => applicable.includes(decision)).map((decision) => ({
    value: decision,
    label: decisionCopy.options[decision].label,
    description: decisionCopy.options[decision].description,
    reasonRequired: KYB_DECISIONS_REQUIRING_REASON.includes(decision),
    destructive: DESTRUCTIVE.includes(decision),
  }));

  const feedbackFor = (result: ActionFeedbackResult<KybDecisionOutcome>): ActionToastFeedback | null => {
    if (result.ok) {
      return result.code === ACTION_FEEDBACK.KYB_DECISION_HISTORY_INCOMPLETE
        ? { tone: "warning", message: copy.feedback.kybHistoryIncomplete }
        : { tone: "success", message: copy.feedback.kybDecisionRecorded };
    }
    switch (result.code) {
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.feedback.validationError };
      case ACTION_FEEDBACK.KYB_DECISION_STALE:
        return { tone: "warning", message: copy.feedback.kybDecisionStale };
      case ACTION_FEEDBACK.KYB_APPROVAL_BLOCKED:
        return { tone: "error", message: copy.feedback.kybApprovalBlocked };
      case ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.complianceNotCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      default:
        return { tone: "error", message: copy.feedback.kybDecisionFailed };
    }
  };

  const blockedHint = approvalBlocked && applicableDecisions(status).includes("APPROVED") ? (
    <p data-approval-blocked={readiness.blockerCount} className="rounded-[var(--radius-md)] border border-[var(--status-pending)] bg-[var(--status-pending-surface)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-foreground">
      {decisionCopy.blockedHint.replace("{count}", String(readiness.blockerCount))}
    </p>
  ) : null;

  const followThroughText = (value: OrganizationFollowThrough) => decisionCopy.followThrough[value === "not-required" ? "notRequired" : value];

  if (options.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-decision-form="decision" data-decision-state="not-decidable">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{decisionCopy.heading}</h2>
        <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">{decisionCopy.notDecidable.replace("{status}", copy.statuses.kyb[status])}</p>
        {blockedHint}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {status === "SUBMITTED" ? <StartReviewButton applicationId={applicationId} /> : null}
      {blockedHint}
      <DecisionForm<KybDecision, KybDecisionOutcome>
        hiddenFields={{ applicationId }}
        decisionFieldName="decision"
        options={options}
        action={recordKybDecision}
        feedbackFor={feedbackFor}
        heading={decisionCopy.heading}
        lead={decisionCopy.lead}
        submitLabel={decisionCopy.submit}
        confirmTitle={decisionCopy.confirmTitle}
        confirmDescription={decisionCopy.confirmDescription}
        renderOutcome={(result) =>
          result.ok ? (
            <p
              data-follow-through={result.data.organizationFollowThrough}
              className={
                "rounded-[var(--radius-md)] border px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] " +
                (result.data.organizationFollowThrough === "unavailable" ? "border-[var(--status-danger)] text-foreground" : "border-border text-muted-foreground")
              }
            >
              {followThroughText(result.data.organizationFollowThrough)}
            </p>
          ) : null
        }
      />
    </div>
  );
}

function StartReviewButton({ applicationId }: { applicationId: string }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.compliance;
  const [state, dispatch, isPending] = useActionState(beginKybReview, undefined);
  useActionToast(
    state,
    state?.ok
      ? { tone: "success", message: copy.feedback.reviewStarted }
      : state?.ok === false
        ? { tone: "error", message: state.code === ACTION_FEEDBACK.KYB_DECISION_STALE ? copy.feedback.kybDecisionStale : state.code === ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE ? copy.feedback.complianceNotCapable : copy.feedback.kybDecisionFailed }
        : null,
  );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-4" data-start-review>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          const formData = new FormData();
          formData.set("applicationId", applicationId);
          startTransition(() => {
            dispatch(formData);
          });
        }}
      >
        {isPending ? copy.common.recording : copy.kyb.detail.decision.startReview}
      </Button>
      <p className="text-[length:var(--text-micro)] text-muted-foreground">{copy.kyb.detail.decision.startReviewHint}</p>
    </div>
  );
}

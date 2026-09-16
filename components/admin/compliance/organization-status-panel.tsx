"use client";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import type { ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import type { OrganizationStatusOutcome } from "@/lib/admin/decisions";
import type { OrganizationStatusTarget } from "@/lib/admin/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { changeOrganizationStatus } from "@/src/app/dashboard-admin/(compliance)/organizations/actions";

/** Feature 010 RUN B (T010) — suspend / reinstate an organization (reason mandatory, confirmation always). */
export function OrganizationStatusPanel({ organizationId, status }: { organizationId: string; status: string }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.compliance;
  const actions = copy.organizations.detail.actions;
  const target: OrganizationStatusTarget | null = status === "ACTIVE" ? "SUSPENDED" : status === "SUSPENDED" ? "ACTIVE" : null;
  const statusLabel = (value: string) => copy.statuses.organization[value as keyof typeof copy.statuses.organization] ?? value;

  const feedbackFor = (result: ActionFeedbackResult<OrganizationStatusOutcome>): ActionToastFeedback | null => {
    if (result.ok) {
      return result.code === ACTION_FEEDBACK.KYB_DECISION_HISTORY_INCOMPLETE
        ? { tone: "warning", message: copy.feedback.kybHistoryIncomplete }
        : { tone: "success", message: copy.feedback.organizationStatusChanged };
    }
    switch (result.code) {
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.feedback.validationError };
      case ACTION_FEEDBACK.ORGANIZATION_ACCESS_UNAVAILABLE:
        return { tone: "error", message: copy.feedback.organizationAccessUnavailable };
      case ACTION_FEEDBACK.ORGANIZATION_STATUS_STALE:
        return { tone: "warning", message: copy.feedback.organizationStatusStale };
      case ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.complianceNotCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      default:
        return { tone: "error", message: copy.feedback.organizationStatusFailed };
    }
  };

  if (!target) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-decision-form="status" data-decision-state="not-applicable">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{actions.heading}</h2>
        <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">{actions.notApplicable.replace("{status}", statusLabel(status))}</p>
      </section>
    );
  }

  const options: DecisionOption<OrganizationStatusTarget>[] = [
    target === "SUSPENDED"
      ? { value: "SUSPENDED", label: actions.suspend, description: actions.suspendDescription, reasonRequired: true, destructive: true }
      : { value: "ACTIVE", label: actions.reinstate, description: actions.reinstateDescription, reasonRequired: true, destructive: true },
  ];

  return (
    <DecisionForm<OrganizationStatusTarget, OrganizationStatusOutcome>
      hiddenFields={{ organizationId }}
      decisionFieldName="status"
      options={options}
      action={changeOrganizationStatus}
      feedbackFor={feedbackFor}
      heading={actions.heading}
      lead={actions.inFlightNote}
      submitLabel={target === "SUSPENDED" ? actions.suspend : actions.reinstate}
      confirmTitle={actions.confirmTitle}
      confirmDescription={actions.confirmDescription.replace("{status}", statusLabel(target))}
    />
  );
}

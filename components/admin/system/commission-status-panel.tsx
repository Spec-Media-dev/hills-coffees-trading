"use client";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import type { ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import type { CommissionTransitionOutcome } from "@/lib/admin/commission";
import { commissionTransitionsFor, type CommissionPolicyStatus, type CommissionPolicyTransitionKey } from "@/lib/admin/system-validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { runCommissionTransition } from "@/src/app/dashboard-admin/(system)/(super)/actions";

/**
 * Feature 010 RUN F — T042/T044: the policy's named status operations (activate / deactivate /
 * archive / restore), each confirmed, each compare-and-set on the server. The confirmation copy
 * states "eligible future checkouts only — no existing order changes"; there is no other operation.
 */
export function CommissionStatusPanel({ policyId, status }: { policyId: string; status: CommissionPolicyStatus }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.system;
  const t = copy.commission.transitions;
  const options: DecisionOption<CommissionPolicyTransitionKey>[] = commissionTransitionsFor(status).map((key) => ({
    value: key,
    label: t.options[key].label,
    description: t.options[key].description,
    reasonRequired: false,
    destructive: true,
    badge: key === "activate" || key === "deactivate" ? t.highImpact : undefined,
  }));

  const feedbackFor = (result: ActionFeedbackResult<CommissionTransitionOutcome>): ActionToastFeedback | null => {
    if (result.ok) return { tone: "success", message: copy.feedback.transitionApplied.replace("{operation}", t.options[result.data.operation].label).replace("{status}", copy.commission.statuses[result.data.toStatus]) };
    switch (result.code) {
      case ACTION_FEEDBACK.SYSTEM_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.notCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      case ACTION_FEEDBACK.SYSTEM_STALE:
        return { tone: "warning", message: copy.feedback.stale };
      case ACTION_FEEDBACK.SYSTEM_NOT_FOUND:
        return { tone: "error", message: copy.feedback.notFound };
      case ACTION_FEEDBACK.SYSTEM_VALUE_INVALID:
        return { tone: "error", message: copy.feedback.valueInvalid };
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.feedback.validationError };
      default:
        return { tone: "error", message: copy.feedback.failed };
    }
  };

  if (options.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-decision-form="policy-status" data-decision-state="not-operable">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{t.heading}</h2>
        <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">{t.none}</p>
      </section>
    );
  }

  return (
    <DecisionForm<CommissionPolicyTransitionKey, CommissionTransitionOutcome>
      hiddenFields={{ policyId }}
      decisionFieldName="operation"
      formKey="policy-status"
      options={options}
      action={runCommissionTransition}
      feedbackFor={feedbackFor}
      heading={t.heading}
      lead={t.lead}
      submitLabel={t.submit}
      confirmTitle={t.confirmTitle}
      confirmDescription={t.confirmDescription}
      reason={{ label: "", hint: "", required: "", tooLong: "", minLength: 0, maxLength: 0 }}
      hideReason
    >
      <p data-future-only className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
        {copy.common.futureOnly}
      </p>
    </DecisionForm>
  );
}

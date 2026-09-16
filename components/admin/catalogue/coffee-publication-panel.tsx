"use client";

import { DecisionForm, type DecisionOption } from "@/components/admin/compliance/decision-form";
import type { ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import type { CoffeeTransitionOutcome } from "@/lib/admin/catalogue";
import { coffeeTransitionsFor, type CoffeeStatus, type CoffeeTransitionKey } from "@/lib/admin/catalogue-validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { runCoffeeTransition } from "@/src/app/dashboard-admin/(catalogue)/actions";

/**
 * Feature 010 RUN E (T021/T023) — the coffee detail's publication panel. Reuses the ONE admin
 * decision form: exactly one of the four named operations valid for the CURRENT status
 * (`coffeeTransitionsFor`), every operation confirmed (each changes what the public site shows),
 * Sonner outcome per `lib/admin/catalogue.ts` code. The server re-checks the source status
 * (compare-and-set) — a stale panel is refused, never overwritten.
 */
export function CoffeePublicationPanel({ coffeeId, status }: { coffeeId: string; status: CoffeeStatus }) {
  const { tApp } = useLocale();
  const copy = tApp.admin.catalogue;
  const t = copy.coffees.transitions;
  const options: DecisionOption<CoffeeTransitionKey>[] = coffeeTransitionsFor(status).map((key) => ({
    value: key,
    label: t.options[key].label,
    description: t.options[key].description,
    reasonRequired: false,
    // Every publication change is confirmed — it changes the public website.
    destructive: true,
    badge: key === "publish" || key === "unpublish" ? t.highImpact : undefined,
  }));

  const feedbackFor = (result: ActionFeedbackResult<CoffeeTransitionOutcome>): ActionToastFeedback | null => {
    if (result.ok) return { tone: "success", message: copy.feedback.transitionApplied.replace("{operation}", t.options[result.data.operation].label).replace("{status}", copy.statuses.coffee[result.data.toStatus]) };
    switch (result.code) {
      case ACTION_FEEDBACK.CATALOGUE_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.notCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      case ACTION_FEEDBACK.CATALOGUE_STALE:
        return { tone: "warning", message: copy.feedback.stale };
      case ACTION_FEEDBACK.CATALOGUE_NOT_FOUND:
        return { tone: "error", message: copy.feedback.notFound };
      case ACTION_FEEDBACK.CATALOGUE_STATUS_INVALID:
        return { tone: "error", message: copy.feedback.statusInvalid };
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: copy.feedback.validationError };
      default:
        return { tone: "error", message: copy.feedback.failed };
    }
  };

  if (options.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-decision-form="publication" data-decision-state="not-operable">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{t.heading}</h2>
        <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">{t.none}</p>
      </section>
    );
  }

  return (
    <DecisionForm<CoffeeTransitionKey, CoffeeTransitionOutcome>
      hiddenFields={{ coffeeId }}
      decisionFieldName="operation"
      formKey="publication"
      options={options}
      action={runCoffeeTransition}
      feedbackFor={feedbackFor}
      heading={t.heading}
      lead={t.lead}
      submitLabel={t.submit}
      confirmTitle={t.confirmTitle}
      confirmDescription={t.confirmDescription}
      reason={{ label: copy.common.description, hint: "", required: "", tooLong: "", minLength: 0, maxLength: 0 }}
      hideReason
    />
  );
}

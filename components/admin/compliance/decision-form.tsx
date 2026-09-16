"use client";

import { startTransition, useActionState, useId, useState } from "react";

import { useActionToast, type ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "@/lib/admin/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN B — the ONE compliance decision form (KYB decisions, listing decisions,
 * organization status). A narrow client island following the established `useActionState` +
 * `useActionToast` pattern (`profile-settings-form.tsx`, `listing-lifecycle-actions.tsx`):
 *
 * - exactly one decision is chosen (radio); the reason field sits directly beneath the choice;
 * - reason-required decisions are validated CLIENT-side for an inline field error (and again on
 *   the server — the server result's `fieldErrors.reason` also renders inline);
 * - high-impact decisions (`destructive: true`) open the project's `AlertDialog` for confirmation;
 * - the submit is disabled while pending (UX only — the server/DB authorization is authoritative);
 * - outcomes surface through Sonner with the copy for the returned code; never raw DB text.
 */

export type DecisionOption<TDecision extends string> = {
  value: TDecision;
  label: string;
  description: string;
  reasonRequired: boolean;
  destructive: boolean;
  /** Optional neutral tag rendered beside the label (e.g. the warehouse "Settlement-gated" marker). */
  badge?: string;
};

/** Reason-field copy/limits — defaults to the compliance vocabulary; the warehouse console supplies Feature 009's. */
export type DecisionReasonConfig = {
  label: string;
  hint: string;
  required: string;
  tooLong: string;
  minLength: number;
  maxLength: number;
};

export type DecisionFormProps<TDecision extends string, TOutcome> = {
  /** Hidden identifier fields sent with the decision (e.g. `{ applicationId }`). */
  hiddenFields: Record<string, string>;
  /** The form field name the server action reads the decision from (`decision` | `status`). */
  decisionFieldName: string;
  options: readonly DecisionOption<TDecision>[];
  action: (prev: ActionFeedbackResult<TOutcome> | undefined, formData: FormData) => Promise<ActionFeedbackResult<TOutcome>>;
  /** Maps a result to toast feedback (code → localized copy); `null` = no toast. */
  feedbackFor: (result: ActionFeedbackResult<TOutcome>) => ActionToastFeedback | null;
  heading: string;
  lead: string;
  submitLabel: string;
  confirmTitle: string;
  /** `{decision}` is replaced with the chosen option's label. */
  confirmDescription: string;
  /** Rendered after a successful submission (e.g. the organization follow-through statement). */
  renderOutcome?: (result: ActionFeedbackResult<TOutcome>) => React.ReactNode;
  /** Overrides the reason field's copy and limits (Feature 010 RUN D — warehouse operations reuse this form). */
  reason?: DecisionReasonConfig;
  /** `data-decision-form` attribute value; defaults to `decisionFieldName`. */
  formKey?: string;
  /** Feature 010 RUN E — omit the reason field entirely (e.g. catalogue publication, which records no reason). */
  hideReason?: boolean;
  /** Extra content rendered between the options and the submit row (e.g. a live decision summary). */
  children?: React.ReactNode;
};

export function DecisionForm<TDecision extends string, TOutcome>({
  hiddenFields,
  decisionFieldName,
  options,
  action,
  feedbackFor,
  heading,
  lead,
  submitLabel,
  confirmTitle,
  confirmDescription,
  renderOutcome,
  reason: reasonConfig,
  formKey,
  hideReason = false,
  children,
}: DecisionFormProps<TDecision, TOutcome>) {
  const { tApp } = useLocale();
  const copy = tApp.admin.compliance.common;
  const reasonCopy: DecisionReasonConfig = reasonConfig ?? {
    label: copy.reason,
    hint: copy.reasonHint,
    required: copy.reasonRequired,
    tooLong: copy.reasonTooLong,
    minLength: REASON_MIN_LENGTH,
    maxLength: REASON_MAX_LENGTH,
  };
  const [state, dispatch, isPending] = useActionState(action, undefined);
  const [decision, setDecision] = useState<TDecision | null>(null);
  const [reason, setReason] = useState("");
  const [clientReasonError, setClientReasonError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reasonId = useId();
  const groupId = useId();

  useActionToast(state, state ? feedbackFor(state) : null);

  const selected = options.find((option) => option.value === decision) ?? null;
  const serverReasonError = state?.ok === false && state.code === ACTION_FEEDBACK.VALIDATION_ERROR ? state.fieldErrors?.reason?.[0] : undefined;
  const reasonError = clientReasonError ?? (serverReasonError === "REASON_REQUIRED" ? reasonCopy.required : serverReasonError === "REASON_TOO_LONG" ? reasonCopy.tooLong : serverReasonError ? reasonCopy.required : undefined);

  const submit = () => {
    if (!selected) return;
    const formData = new FormData();
    for (const [key, value] of Object.entries(hiddenFields)) formData.set(key, value);
    formData.set(decisionFieldName, selected.value);
    formData.set("reason", reason.trim());
    startTransition(() => {
      dispatch(formData);
    });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || isPending) return;
    const trimmed = reason.trim();
    if (!hideReason && selected.reasonRequired && trimmed.length < reasonCopy.minLength) {
      setClientReasonError(reasonCopy.required);
      return;
    }
    if (!hideReason && trimmed.length > reasonCopy.maxLength) {
      setClientReasonError(reasonCopy.tooLong);
      return;
    }
    setClientReasonError(null);
    if (selected.destructive) {
      setConfirmOpen(true);
      return;
    }
    submit();
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-decision-form={formKey ?? decisionFieldName}>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{heading}</h2>
        <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{lead}</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2" aria-labelledby={groupId}>
          <legend id={groupId} className="sr-only">
            {copy.decision}
          </legend>
          <RadioGroup value={decision ?? ""} onValueChange={(value) => setDecision(value as TDecision)} className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const id = `${groupId}-${option.value}`;
              const active = option.value === decision;
              return (
                <label
                  key={option.value}
                  htmlFor={id}
                  data-decision-option={option.value}
                  data-destructive={option.destructive ? "true" : undefined}
                  className={
                    "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3 transition-[border-color,background-color] duration-[var(--dur-fast)] " +
                    (active ? "border-[var(--forest-500)] bg-[var(--surface-subtle)]" : "border-border hover:bg-[var(--surface-subtle)]")
                  }
                >
                  <RadioGroupItem id={id} value={option.value} className="mt-0.5" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)] font-semibold text-foreground">
                      {option.label}
                      {option.destructive ? (
                        <span className="rounded-[var(--radius-pill)] bg-[var(--status-danger-surface)] px-2 py-0.5 text-[length:var(--text-micro)] font-semibold text-[var(--status-danger)]">
                          {tApp.admin.compliance.kyb.detail.decision.destructive}
                        </span>
                      ) : null}
                      {option.badge ? (
                        <span data-option-badge className="rounded-[var(--radius-pill)] bg-[var(--status-review-surface)] px-2 py-0.5 text-[length:var(--text-micro)] font-semibold text-[var(--status-review)]">
                          {option.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </fieldset>

        {children}

        {hideReason ? null : (
          <FieldGroup className="md:grid-cols-1">
          <Field
            id={reasonId}
            label={
              <>
                {reasonCopy.label}
                {selected?.reasonRequired ? (
                  <span aria-hidden="true" className="text-[length:var(--text-micro)] text-[var(--status-danger)]">
                    *
                  </span>
                ) : null}
              </>
            }
            hint={reasonCopy.hint}
            error={reasonError}
            control={
              <Textarea
                id={reasonId}
                name="reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (clientReasonError) setClientReasonError(null);
                }}
                rows={4}
                maxLength={reasonCopy.maxLength}
                required={selected?.reasonRequired ?? false}
                aria-required={selected?.reasonRequired ?? false}
              />
            }
          />
          </FieldGroup>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!selected || isPending} variant={selected?.destructive ? "destructive" : "primary"}>
            {isPending ? copy.recording : submitLabel}
          </Button>
        </div>
      </form>

      {state?.ok && renderOutcome ? <div data-decision-outcome>{renderOutcome(state)}</div> : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription.replace("{decision}", selected?.label ?? "")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                submit();
              }}
            >
              {copy.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

"use client";

import { useActionState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { MissingItem } from "@/lib/kyb/completeness";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { resubmitKyb, submitKyb } from "@/src/app/dashboard/kyb/actions";

/**
 * Feature 003 T015/T018/T020 — shows the SPECIFIC list of missing items (never a generic
 * "incomplete" message — `lib/kyb/completeness.ts`'s entire contract) and the Submit/Resubmit
 * action. `missing` is recomputed server-side by `submitKyb`/`resubmitKyb` on every attempt — this
 * client-side list is a preview for UX, never the actual gate.
 */
export function KybSubmitPanel({ missing, mode }: { missing: MissingItem[]; mode: "submit" | "resubmit" }) {
  const { tApp } = useLocale();
  const copy = tApp.kyb;
  const action = mode === "submit" ? submitKyb : resubmitKyb;
  const [state, dispatch, isPending] = useActionState(action, undefined);
  useActionToast(
    state,
    state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
      ? {
          tone: "error",
          message:
            state.code === ACTION_FEEDBACK.KYB_SUBMIT_NOT_ALLOWED || state.code === ACTION_FEEDBACK.KYB_RESUBMIT_NOT_ALLOWED
              ? copy.toast.applicationNotEditable
              : mode === "submit"
                ? copy.toast.submitFailed
                : copy.toast.resubmitFailed,
        }
      : null
  );

  const serverMissingKeys = state?.ok === false && state.fieldErrors ? Object.keys(state.fieldErrors) : [];
  const displayedMissingKeys = serverMissingKeys.length > 0 ? serverMissingKeys : missing.map((item) => item.key);
  const displayedMissing = displayedMissingKeys.map((key) => {
    if (key === "registeredAddress") return copy.completeness.registeredAddressRequired;
    if (key === "businessActivity") return copy.completeness.businessActivityRequired;
    const documentLabel = copy.documents.types[key as keyof typeof copy.documents.types];
    return documentLabel
      ? copy.completeness.documentRequired.replace("{document}", documentLabel)
      : copy.completeness.itemRequired;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{copy.completeness.title}</h2>
        {displayedMissing.length === 0 ? (
          <InlineAlert tone="success" title={copy.completeness.allComplete} />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {displayedMissing.map((label) => (
              <li key={label} className="flex items-start gap-2 text-[length:var(--text-small)] text-destructive">
                <span aria-hidden="true">•</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form action={dispatch}>
        <Button type="submit" disabled={isPending || displayedMissing.length > 0}>
          {mode === "submit" ? (isPending ? copy.submit.submitting : copy.submit.submit) : isPending ? copy.submit.resubmitting : copy.submit.resubmit}
        </Button>
      </form>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { AgreementDefinition } from "@/lib/auth/agreements";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { acceptAgreement } from "@/src/app/dashboard/actions";

/**
 * Feature 003 T023 — one agreement row. Distinguishes exactly the three truthful states the run
 * directive names:
 *   - CURRENT + ACCEPTED — a real acceptance row exists at `agreement.version`.
 *   - CURRENT + NOT ACCEPTED (never accepted) — no acceptance row exists for this type at all.
 *   - OLDER ACCEPTANCE / VERSION UPDATED — an acceptance row exists, but at an earlier version than
 *     `agreement.version` — the historical row is never deleted or hidden, only superseded for gate
 *     purposes (`lib/auth/agreements.ts`'s own version-bump semantics).
 */
export function AgreementRow({
  agreement,
  latestAcceptance,
}: {
  agreement: AgreementDefinition;
  latestAcceptance: { version: string; acceptedAt: string } | undefined;
}) {
  const { tApp, locale } = useLocale();
  const router = useRouter();
  const copy = tApp.agreements;
  const [state, dispatch, isPending] = useActionState(acceptAgreement, undefined);
  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: copy.toast.accepted }
      : state?.ok === false
        ? state.code === ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED
          ? {
              tone: "warning",
              message: tApp.feedback.mfaStepUpRequired,
              action: { label: tApp.feedback.mfaStepUpAction, onClick: () => router.push("/mfa/") },
            }
          : { tone: "error", message: copy.toast.acceptFailed }
        : null
  );

  const isCurrentAccepted = latestAcceptance?.version === agreement.version;
  const isStaleAcceptance = latestAcceptance !== undefined && latestAcceptance.version !== agreement.version;
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium" });

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold text-foreground">{copy.types[agreement.type]}</p>
          <p className="hc-meta text-muted-foreground">{copy.versionLabel.replace("{version}", agreement.version)}</p>
          {isCurrentAccepted && latestAcceptance ? (
            <p className="hc-meta text-[var(--success)]">
              {copy.acceptedOn.replace("{date}", dateFormatter.format(new Date(latestAcceptance.acceptedAt)))}
            </p>
          ) : null}
          {isStaleAcceptance && latestAcceptance ? (
            <p className="hc-meta text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
              {copy.staleAcceptance
                .replace("{version}", latestAcceptance.version)
                .replace("{date}", dateFormatter.format(new Date(latestAcceptance.acceptedAt)))}
            </p>
          ) : null}
          {!latestAcceptance ? <p className="hc-meta text-muted-foreground">{copy.notAccepted}</p> : null}
          <p className="hc-meta text-muted-foreground">
            {agreement.documentHash === "PENDING_LEGAL_DOCUMENT" ? copy.documentPending : copy.documentReference}
          </p>
        </div>
        <Icon
          name={isCurrentAccepted ? "check" : "circle-x"}
          className={isCurrentAccepted ? "size-5 shrink-0 text-[var(--success)]" : "size-5 shrink-0 text-muted-foreground"}
        />
      </div>

      {!isCurrentAccepted ? (
        <form action={dispatch}>
          <input type="hidden" name="agreementType" value={agreement.type} />
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            {isPending ? copy.accepting : copy.accept}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

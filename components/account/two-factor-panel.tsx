"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import type { MfaAccountState, MfaFactorSummary } from "@/lib/auth/mfa-status";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { removeMyMfaFactor } from "@/src/app/(auth)/mfa/actions";

/**
 * Hardening run — the ONE two-factor management panel, mounted on BOTH account surfaces
 * (`/dashboard-admin/account` for every operational role, `/dashboard/settings` for Buyer/Seller —
 * the same sharing pattern `ChangePasswordForm` uses). Status and factor list come from the server
 * (`readMfaAccountState`, the caller's own `mfa.listFactors()`); enrolment itself stays on the
 * existing `/mfa/` page (QR + manual key + 6-digit confirm). Removal is a Server Action that
 * re-verifies ownership and a FRESH code before `mfa.unenroll` — nothing here is a client-only gate.
 */
export function TwoFactorPanel({ state }: { state: MfaAccountState }) {
  const { tApp } = useLocale();
  const copy = tApp.accountSecurity.twoFactor;

  return (
    <div className="flex flex-col gap-4" data-two-factor-status={state.status}>
      <p className="max-w-[62ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{copy.lead}</p>

      <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-small)]">
        <span className="text-muted-foreground">{copy.statusLabel}:</span>
        <Badge variant={state.status === "enabled" ? "default" : state.status === "unknown" ? "outline" : "secondary"}>
          <Icon name={state.status === "enabled" ? "check" : "alert-circle"} aria-hidden="true" />
          {copy.status[state.status]}
        </Badge>
      </div>

      {state.status === "pending" ? <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.pendingNote}</p> : null}
      {state.status === "unknown" ? <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.unknownNote}</p> : null}

      {state.status === "disabled" || state.status === "pending" ? (
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/mfa/" />}>
            <Icon name="shield" />
            {state.status === "pending" ? copy.resume : copy.enable}
          </Button>
        </div>
      ) : null}

      {state.factors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[length:var(--text-small)] font-semibold text-foreground">{copy.factorsTitle}</h3>
          <ul className="flex flex-col gap-2">
            {state.factors.map((factor) => (
              <FactorRow key={factor.id} factor={factor} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="max-w-[62ch] text-[length:var(--text-meta)] leading-[var(--lh-body)] text-muted-foreground" data-two-factor-recovery="unsupported">
        {copy.recoveryNote}
      </p>
    </div>
  );
}

function FactorRow({ factor }: { factor: MfaFactorSummary }) {
  const { tApp, locale } = useLocale();
  const router = useRouter();
  const copy = tApp.accountSecurity.twoFactor;
  const [open, setOpen] = useState(false);
  const [state, dispatch, isPending] = useActionState(removeMyMfaFactor, undefined);
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium" });

  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: copy.removed }
      : state?.ok === false && state.code === ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED
        ? { tone: "warning", message: tApp.feedback.mfaStepUpRequired, action: { label: tApp.feedback.mfaStepUpAction, onClick: () => router.push("/mfa/") } }
        : state?.ok === false && (state.code === ACTION_FEEDBACK.MFA_REMOVE_FAILED || state.code === ACTION_FEEDBACK.MFA_FACTOR_NOT_FOUND)
          ? { tone: "error", message: state.code === ACTION_FEEDBACK.MFA_FACTOR_NOT_FOUND ? copy.notFound : copy.failure }
          : null
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("factorId", factor.id);
    startTransition(() => {
      dispatch(formData);
    });
  };

  const codeError =
    state?.ok === false && (state.code === ACTION_FEEDBACK.VALIDATION_ERROR || state.code === ACTION_FEEDBACK.MFA_INVALID_CODE) ? copy.invalidCode : undefined;

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-[var(--surface-card)] p-4 transition-colors duration-[var(--dur-fast)] motion-reduce:transition-none" data-mfa-factor>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon name="shield" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[length:var(--text-small)] font-medium text-foreground">{factor.friendlyName || copy.factorFallbackName}</span>
            <span className="text-[length:var(--text-meta)] text-muted-foreground">{copy.addedOn.replace("{date}", dateFormatter.format(new Date(factor.createdAt)))}</span>
          </div>
        </div>
        {!open ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {copy.remove}
          </Button>
        ) : null}
      </div>

      {open ? (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 border-t border-border pt-3" data-mfa-remove-form>
          <div className="flex flex-col gap-1">
            <span className="text-[length:var(--text-small)] font-semibold text-foreground">{copy.removeTitle}</span>
            <span className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{copy.removeLead}</span>
          </div>
          <Field
            label={copy.codeLabel}
            control={<Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" className="max-w-40 font-mono" />}
            error={codeError}
          />
          <FormActionBar className="static justify-start gap-2 bg-transparent backdrop-blur-none">
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? copy.removing : copy.confirmRemove}
            </Button>
            <Button type="button" variant="text" disabled={isPending} onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
          </FormActionBar>
        </form>
      ) : null}
    </li>
  );
}

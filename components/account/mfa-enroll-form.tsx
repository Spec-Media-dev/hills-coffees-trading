"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { useActionToast } from "@/components/app/use-action-toast";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { confirmMfaEnrollment } from "@/src/app/(auth)/mfa/actions";

/**
 * MFA enrollment form (Feature 003 T009). `qrCodeSvgDataUri` and `secret` come from a SINGLE
 * server-side `mfa.enroll()` call the page made — nothing here calls `enroll` itself, so refreshing
 * this form never silently creates a second unverified factor.
 */
export function MfaEnrollForm({
  factorId,
  qrCodeSvgDataUri,
  secret,
  accountHref = "/dashboard/settings/",
}: {
  factorId: string;
  qrCodeSvgDataUri: string;
  secret: string;
  /** Where the confirmed state links back to — the caller's own account-security surface. */
  accountHref?: string;
}) {
  const { t } = useLocale();
  const copy = t.auth.mfa;
  const [state, dispatch, isPending] = useActionState(confirmMfaEnrollment, undefined);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.enrollSuccess } : null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("factorId", factorId);
    startTransition(() => {
      dispatch(formData);
    });
  };

  if (state?.ok === true) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" data-mfa-enroll="complete">
        <p className="text-[length:var(--text-body)] text-foreground">{copy.enrollSuccess}</p>
        <Button variant="outline" nativeButton={false} render={<Link href={accountHref} />}>
          {copy.manageInAccount}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* White plate in BOTH themes: authenticator scanners need dark-on-light contrast. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI from Supabase's own MFA enroll response, not a Next-optimizable asset */}
      <img src={qrCodeSvgDataUri} alt="" width={180} height={180} className="rounded-[var(--radius-md)] border border-border bg-white p-2" />
      <p className="flex flex-col items-center gap-2 text-center text-[length:var(--text-small)] text-muted-foreground">
        <span>{copy.manualKeyLabel}</span>
        <span className="select-all break-all rounded-[var(--radius-xs)] bg-muted px-2 py-1 font-mono" dir="ltr">
          {secret}
        </span>
      </p>

      <form onSubmit={onSubmit} noValidate className="flex w-full flex-col gap-6">
        <Field
          label={copy.code}
          control={<Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />}
          error={
            state?.ok === false &&
            (state.code === ACTION_FEEDBACK.VALIDATION_ERROR || state.code === ACTION_FEEDBACK.MFA_INVALID_CODE)
              ? copy.invalidCode
              : undefined
          }
        />
        <FormActionBar className="static justify-start bg-transparent backdrop-blur-none">
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? copy.enrollConfirming : copy.enrollConfirm}
          </Button>
        </FormActionBar>
      </form>
    </div>
  );
}

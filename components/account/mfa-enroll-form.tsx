"use client";

import { startTransition, useActionState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
}: {
  factorId: string;
  qrCodeSvgDataUri: string;
  secret: string;
}) {
  const { t } = useLocale();
  const copy = t.auth.mfa;
  const [state, dispatch, isPending] = useActionState(confirmMfaEnrollment, undefined);

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
      <p role="status" className="text-center text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
        {copy.enrollSuccess}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI from Supabase's own MFA enroll response, not a Next-optimizable asset */}
      <img src={qrCodeSvgDataUri} alt="" width={180} height={180} className="rounded-[var(--radius-md)] border border-border" />
      <p className="text-center text-[length:var(--text-small)] text-muted-foreground">
        <span className="select-all rounded-[var(--radius-xs)] bg-muted px-2 py-1 font-mono" dir="ltr">
          {secret}
        </span>
      </p>

      <form onSubmit={onSubmit} noValidate className="flex w-full flex-col gap-6">
        <Field label={copy.code} control={<Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />} />
        <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? copy.enrollConfirming : copy.enrollConfirm}
          </Button>
        </FormActionBar>
        {state?.ok === false ? (
          <p role="alert" className="hc-meta text-center text-destructive">
            {copy.invalidCode}
          </p>
        ) : null}
      </form>
    </div>
  );
}

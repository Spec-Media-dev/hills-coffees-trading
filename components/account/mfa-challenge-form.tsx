"use client";

import { startTransition, useActionState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { verifyMfaChallenge } from "@/src/app/(auth)/mfa/actions";

/** The MFA challenge form — required second factor after a password sign-in (Feature 003 T009). */
export function MfaChallengeForm({ factorId }: { factorId: string }) {
  const { t } = useLocale();
  const copy = t.auth.mfa;
  const [state, dispatch, isPending] = useActionState(verifyMfaChallenge, undefined);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("factorId", factorId);
    startTransition(() => {
      dispatch(formData);
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Field
        label={copy.code}
        control={<Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus />}
        error={
          state?.ok === false &&
          (state.code === ACTION_FEEDBACK.VALIDATION_ERROR || state.code === ACTION_FEEDBACK.MFA_INVALID_CODE)
            ? copy.invalidCode
            : undefined
        }
      />
      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? copy.verifying : copy.verify}
        </Button>
      </FormActionBar>
    </form>
  );
}

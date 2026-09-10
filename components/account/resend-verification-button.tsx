"use client";

import { useActionState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { resendVerificationEmail } from "@/src/app/(auth)/verify-email/actions";

/** The resend button on `/verify-email/` (Feature 003 T007) — the one narrow client island there. */
export function ResendVerificationButton() {
  const { t } = useLocale();
  const copy = t.auth.verifyEmail;
  const [state, dispatch, isPending] = useActionState(async () => resendVerificationEmail(), undefined);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button type="button" variant="outline" disabled={isPending} onClick={() => dispatch()}>
        {isPending ? copy.resending : copy.resend}
      </Button>
      {state?.ok === true ? (
        <p role="status" className="hc-meta text-muted-foreground">
          {copy.resent}
        </p>
      ) : null}
      {state?.ok === false ? (
        <p role="alert" className="hc-meta text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

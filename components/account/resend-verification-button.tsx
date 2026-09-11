"use client";

import { useActionState } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { useActionToast } from "@/components/app/use-action-toast";
import { Button } from "@/components/ui/button";
import { resendVerificationEmail } from "@/src/app/(auth)/verify-email/actions";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/** The resend button on `/verify-email/` (Feature 003 T007) — the one narrow client island there. */
export function ResendVerificationButton() {
  const { t } = useLocale();
  const copy = t.auth.verifyEmail;
  const [state, dispatch, isPending] = useActionState(async () => resendVerificationEmail(), undefined);
  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: copy.resent }
      : state?.ok === false
        ? {
            tone: "error",
            message: state.code === ACTION_FEEDBACK.SESSION_EXPIRED ? copy.sessionExpired : copy.resendFailed,
          }
        : null
  );

  return (
    <div className="flex flex-col items-center gap-2">
      <Button type="button" variant="outline" disabled={isPending} onClick={() => dispatch()}>
        {isPending ? copy.resending : copy.resend}
      </Button>
    </div>
  );
}

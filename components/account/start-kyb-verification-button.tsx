"use client";

import { useActionState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { startKybVerification } from "@/src/app/dashboard/kyb/actions";

/** Client boundary needed only to surface a controlled start failure through the shared toaster. */
export function StartKybVerificationButton() {
  const { tApp } = useLocale();
  const [state, dispatch, isPending] = useActionState(async () => startKybVerification(), undefined);

  useActionToast(
    state,
    state?.ok === false ? { tone: "error", message: tApp.kyb.toast.startFailed } : null
  );

  return (
    <form action={dispatch}>
      <Button type="submit" disabled={isPending}>
        {tApp.kyb.hub.noApplication.start}
      </Button>
    </form>
  );
}

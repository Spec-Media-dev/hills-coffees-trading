"use client";

import { startTransition, useActionState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";

import { moveListingToDraft, withdrawListing } from "./actions";

/**
 * Feature 006 RUN C (T017) — withdraw + "move to draft" (REJECTED remediation) buttons. Each is its
 * OWN `useActionState` bound to the ONE narrow Server Action it triggers — no client-chosen status,
 * no parallel state machine; both actions let `validate_offer_transition` refuse illegal transitions,
 * surfaced here only as a safe, localized toast.
 */
export function WithdrawListingButton({ offerId, disabled }: { offerId: string; disabled?: boolean }) {
  const { tApp } = useLocale();
  const copy = tApp.listings.detail.withdraw;
  const [state, dispatch, isPending] = useActionState(withdrawListing, undefined);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.success } : state?.ok === false ? { tone: "error", message: copy.failed } : null);

  const onClick = () => {
    const formData = new FormData();
    formData.set("offerId", offerId);
    startTransition(() => {
      dispatch(formData);
    });
  };

  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={disabled || isPending}>
      {isPending ? copy.withdrawing : copy.action}
    </Button>
  );
}

export function MoveListingToDraftButton({ offerId }: { offerId: string }) {
  const { tApp } = useLocale();
  const copy = tApp.listings.detail.remediation;
  const [state, dispatch, isPending] = useActionState(moveListingToDraft, undefined);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.success } : state?.ok === false ? { tone: "error", message: copy.failed } : null);

  const onClick = () => {
    const formData = new FormData();
    formData.set("offerId", offerId);
    startTransition(() => {
      dispatch(formData);
    });
  };

  return (
    <Button type="button" onClick={onClick} disabled={isPending}>
      {isPending ? copy.moving : copy.action}
    </Button>
  );
}

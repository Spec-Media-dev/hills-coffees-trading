"use client";

import { startTransition, useActionState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";

import { createOrder } from "./actions";

/**
 * Feature 007 RUN A (T004/T005) — starts a new `DRAFT` order and lets the Server Action's own
 * `redirect()` (never a client-side `router.push`) take the buyer to its detail page. Only the
 * FAILURE path ever reaches this component's own state — a genuine success never returns here at
 * all (Next.js's `redirect()` is a thrown control-flow signal the client-side action machinery
 * follows directly).
 */
export function StartOrderButton() {
  const { tApp } = useLocale();
  const copy = tApp.orders.list;
  const [state, dispatch, isPending] = useActionState(createOrder, undefined);
  useActionToast(state, state?.ok === false ? { tone: "error", message: copy.toast.createFailed } : null);

  return (
    <Button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          dispatch(new FormData());
        });
      }}
    >
      {isPending ? copy.creating : copy.createAction}
    </Button>
  );
}

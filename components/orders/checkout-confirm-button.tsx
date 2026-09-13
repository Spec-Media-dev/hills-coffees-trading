"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { confirmCheckout } from "@/src/app/dashboard/orders/[orderId]/checkout/actions";

/**
 * Feature 007 RUN B (T009) — the single "Confirm and reserve" control. The pending/disabled/
 * `aria-busy` state is a UX convenience against accidental double clicks ONLY — the integrity
 * guarantee is `checkout_order()`'s own idempotent-retry branch, proven live in
 * `tests/orders/checkout.test.ts` by invoking `executeCheckout` twice on the same order. On success
 * the Server Action's own `redirect()` navigates to the order detail page (T010); only failures
 * ever return to this component, mapped to one localized toast (T011: the availability refusal gets
 * its own specific message and a recovery panel on the page, never a raw database string).
 */
export function CheckoutConfirmButton({ orderId, disabled }: { orderId: string; disabled?: boolean }) {
  const { tApp } = useLocale();
  const copy = tApp.orders.checkout;
  const [state, dispatch, isPending] = useActionState(confirmCheckout, undefined);

  useActionToast(
    state,
    state?.ok === false
      ? {
          tone: "error",
          message:
            state.code === ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE || state.code === ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE
              ? copy.toast.availability
              : state.code === ACTION_FEEDBACK.ORDER_CHECKOUT_NOT_READY
                ? copy.toast.notReady
                : state.code === ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED || state.code === ACTION_FEEDBACK.ORDER_NOT_EDITABLE
                  ? copy.toast.notEditable
                  : copy.toast.failed,
        }
      : null
  );

  const availabilityFailed = state?.ok === false && (state.code === ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE || state.code === ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE);

  const onClick = () => {
    const formData = new FormData();
    formData.set("orderId", orderId);
    startTransition(() => {
      dispatch(formData);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {availabilityFailed ? (
        <div role="alert" data-slot="checkout-recovery" className="rounded-[var(--radius-sm)] border border-[var(--danger)] bg-[var(--danger-surface)] p-4 text-sm text-[var(--danger)]">
          <p className="font-semibold">{copy.recovery.title}</p>
          <p className="mt-1 text-current/85">{copy.recovery.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/orders" />}>
              {copy.recovery.startNewOrder}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/coffee" />}>
              {copy.recovery.backToMarketplace}
            </Button>
          </div>
        </div>
      ) : null}
      <Button type="button" onClick={onClick} disabled={disabled || isPending || availabilityFailed} aria-busy={isPending || undefined} className="min-h-11">
        {isPending ? copy.confirming : copy.confirm}
      </Button>
    </div>
  );
}

"use client";

import { startTransition, useActionState, type ReactNode } from "react";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { mapCommerceError } from "@/lib/commerce/errors";
import { completeCheckoutOrder } from "@/src/app/dashboard/checkout/actions";

/**
 * Feature 015 T045 — Authoritative atomic checkout submit button with single-submit behavior
 * and safe inventory/commercial error mapping.
 */
export function CheckoutButton({
  orderId,
  destinationId,
  disabled,
  label,
  pendingLabel,
}: {
  orderId: string;
  destinationId: string;
  disabled?: boolean;
  label: ReactNode;
  pendingLabel: ReactNode;
}) {
  const { locale } = useLocale();
  const [state, dispatch, pending] = useActionState(completeCheckoutOrder, undefined);

  return (
    <form
      action={(formData) => {
        startTransition(() => dispatch(formData));
      }}
      className="flex flex-col items-start gap-2"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="destinationId" value={destinationId} />
      {state && !state.ok ? (
        <p role="alert" className="text-[length:var(--text-small)] text-destructive">
          {mapCommerceError(state.code, locale).message}
        </p>
      ) : null}
      <Button type="submit" className="min-h-11" disabled={disabled || pending}>
        {pending ? pendingLabel : label}
      </Button>
    </form>
  );
}

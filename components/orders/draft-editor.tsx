"use client";

import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AddOrderItemInput } from "@/lib/orders/validation";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { addItemToOrder } from "@/src/app/dashboard/orders/actions";

/**
 * Feature 007 RUN A (T005) — the "add an item to my draft order" form. React Hook Form + `zodResolver`
 * for inline UX only; `addItemToOrder` re-validates with the identical schema server-side (the SAME
 * pattern `components/account/kyb-draft-form.tsx`/`listing-create-form.tsx` established).
 *
 * Deliberately asks for the listing's own id (pasted from its marketplace page) rather than
 * duplicating Feature 006's browse/picker UI in this feature — RUN A's own file scope names no
 * marketplace-picker component, and `lib/listings/browse.ts` is not touched by this run. The
 * eligibility/availability decision itself is never made here: `validate_order_item_offer`'s trigger
 * is the sole authority, and this form passes no quantity/price/status claim to the server beyond
 * what the buyer typed.
 */
export function DraftEditor({ orderId }: { orderId: string }) {
  const { tApp } = useLocale();
  const copy = tApp.orders.detail.addItem;

  const [state, dispatch, isPending] = useActionState(addItemToOrder, undefined);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.added } : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR ? { tone: "error", message: copy.addFailed } : null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof AddOrderItemInput>, unknown, AddOrderItemInput>({
    resolver: zodResolver(AddOrderItemInput),
    defaultValues: { offerId: "", quantityKg: undefined },
  });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("offerId", data.offerId);
    formData.set("quantityKg", String(data.quantityKg));
    startTransition(() => {
      dispatch(formData);
    });
    reset();
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-5">
      <h3 className="text-base font-semibold text-foreground">{copy.heading}</h3>
      <FieldGroup>
        <Field label={copy.offerIdLabel} hint={copy.offerIdHint} control={<Input {...register("offerId")} />} error={errors.offerId?.message} />
        <Field label={copy.quantityLabel} control={<Input type="number" step="any" inputMode="decimal" {...register("quantityKg")} />} error={errors.quantityKg?.message} />
      </FieldGroup>
      <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? copy.adding : copy.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

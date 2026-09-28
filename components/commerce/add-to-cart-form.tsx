"use client";

import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapCommerceError } from "@/lib/commerce/errors";
import { addToCart } from "@/src/app/dashboard/cart/actions";

const InputSchema = z.object({ quantityKg: z.coerce.number().finite().positive() });

export function AddToCartForm({ offerId, disabledReason }: { offerId: string; disabledReason?: "own" | "unavailable" }) {
  const { locale, tApp } = useLocale();
  const copy = tApp.commerce.cartUi;
  const [state, dispatch, pending] = useActionState(addToCart, undefined);
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof InputSchema>, unknown, z.output<typeof InputSchema>>({
    resolver: zodResolver(InputSchema),
    defaultValues: { quantityKg: 1 },
  });

  const submit = handleSubmit(({ quantityKg }) => {
    const data = new FormData();
    data.set("offerId", offerId);
    data.set("quantityKg", String(quantityKg));
    startTransition(() => dispatch(data));
  });
  const refusal = disabledReason === "own" ? copy.ownListing : disabledReason === "unavailable" ? copy.unavailable : null;
  const errorMessage = state && !state.ok
    ? state.code === "validation_error" ? copy.validation : mapCommerceError(state.code, locale).message
    : null;

  return (
    <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-24 flex-1 text-[length:var(--text-small)] text-foreground">
          <span className="mb-1 block">{copy.quantity}</span>
          <Input type="number" min="0.001" step="0.001" inputMode="decimal" dir="ltr" disabled={Boolean(refusal) || pending} {...register("quantityKg")} />
        </label>
        <Button type="submit" className="min-h-11 flex-1 sm:flex-none" disabled={Boolean(refusal) || pending}>
          {pending ? copy.adding : copy.add}
        </Button>
      </div>
      {errors.quantityKg ? <p role="alert" className="text-[length:var(--text-small)] text-destructive">{copy.validation}</p> : null}
      {refusal ? <p className="text-[length:var(--text-small)] text-muted-foreground">{refusal}</p> : null}
      {state?.ok ? <p role="status" className="text-[length:var(--text-small)] text-foreground">{copy.added}</p> : null}
      {errorMessage ? <p role="alert" className="text-[length:var(--text-small)] text-destructive">{errorMessage}</p> : null}
      <p className="text-[length:var(--text-micro)] text-muted-foreground">{copy.notReserved}</p>
    </form>
  );
}

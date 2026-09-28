"use client";

import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartLine as CartLineData } from "@/lib/commerce/cart";
import { mapCommerceError } from "@/lib/commerce/errors";
import { removeCartLine, updateCartLine } from "@/src/app/dashboard/cart/actions";

const InputSchema = z.object({ quantityKg: z.coerce.number().finite().positive() });

export function CartLine({ orderId, line }: { orderId: string; line: CartLineData }) {
  const { locale, tApp } = useLocale();
  const copy = tApp.commerce.cartUi;
  const [saveState, save, saving] = useActionState(updateCartLine, undefined);
  const [removeState, remove, removing] = useActionState(removeCartLine, undefined);
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof InputSchema>, unknown, z.output<typeof InputSchema>>({
    resolver: zodResolver(InputSchema), defaultValues: { quantityKg: line.quantityKg },
  });
  const onSave = handleSubmit(({ quantityKg }) => {
    const data = new FormData();
    data.set("orderId", orderId);
    data.set("lineId", line.id);
    data.set("quantityKg", String(quantityKg));
    startTransition(() => save(data));
  });
  const onRemove = () => {
    const data = new FormData();
    data.set("orderId", orderId);
    data.set("lineId", line.id);
    startTransition(() => remove(data));
  };
  const failure = saveState && !saveState.ok ? saveState.code : removeState && !removeState.ok ? removeState.code : null;

  return (
    <li className="min-w-0 border-t border-border py-4 first:border-t-0">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 space-y-1">
          <p className="break-words font-semibold text-foreground">{line.productName}</p>
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            {copy.estimatedPrice}: <span dir="ltr" className="font-mono tabular-nums">{line.currency} {line.estimatedUnitPrice} / kg</span>
          </p>
          {!line.eligible ? <p role="alert" className="text-[length:var(--text-small)] text-destructive">{copy.lineUnavailable}</p> : null}
        </div>
        <form onSubmit={onSave} noValidate className="flex flex-wrap items-end gap-2">
          <label className="min-w-24 flex-1 text-[length:var(--text-small)] text-foreground sm:flex-none">
            <span className="mb-1 block">{copy.quantity}</span>
            <Input type="number" min="0.001" step="0.001" inputMode="decimal" dir="ltr" disabled={saving || removing} {...register("quantityKg")} />
          </label>
          <Button type="submit" variant="outline" className="min-h-11" disabled={saving || removing}>{saving ? copy.saving : copy.save}</Button>
          <Button type="button" variant="text" className="min-h-11 text-destructive" disabled={saving || removing} onClick={onRemove}>{removing ? copy.removing : copy.remove}</Button>
        </form>
      </div>
      {errors.quantityKg ? <p role="alert" className="mt-2 text-[length:var(--text-small)] text-destructive">{copy.validation}</p> : null}
      {saveState?.ok ? <p role="status" className="mt-2 text-[length:var(--text-small)]">{copy.saved}</p> : null}
      {removeState?.ok ? <p role="status" className="mt-2 text-[length:var(--text-small)]">{copy.removed}</p> : null}
      {failure ? <p role="alert" className="mt-2 text-[length:var(--text-small)] text-destructive">{failure === "validation_error" ? copy.validation : mapCommerceError(failure, locale).message}</p> : null}
    </li>
  );
}

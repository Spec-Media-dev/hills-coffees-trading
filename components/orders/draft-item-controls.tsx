"use client";

import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UpdateOrderItemQuantityInput } from "@/lib/orders/validation";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { removeItemFromOrder, updateItemQuantity } from "@/src/app/dashboard/orders/actions";

/**
 * DB-OPEN-13 (resolved 2026-09-13; T004 PS1 scenario 4) — per-item quantity edit and removal on a DRAFT
 * order. Rendered only while the page's own server read says the order is DRAFT; that is presentation,
 * never authorization — both actions re-verify server-side and the database functions
 * (`update_order_item_quantity`/`remove_order_item`) are the final authority. The only values sent are
 * the order id (routing), the item id and the typed quantity.
 */
export function DraftItemControls({ orderId, orderItemId, quantityKg }: { orderId: string; orderItemId: string; quantityKg: number }) {
  const { tApp } = useLocale();
  const copy = tApp.orders.detail.itemEdit;

  const [saveState, dispatchSave, isSaving] = useActionState(updateItemQuantity, undefined);
  const [removeState, dispatchRemove, isRemoving] = useActionState(removeItemFromOrder, undefined);

  useActionToast(saveState, saveState?.ok === true ? { tone: "success", message: copy.saved } : saveState?.ok === false && saveState.code !== ACTION_FEEDBACK.VALIDATION_ERROR ? { tone: "error", message: copy.saveFailed } : null);
  useActionToast(removeState, removeState?.ok === true ? { tone: "success", message: copy.removed } : removeState?.ok === false ? { tone: "error", message: copy.removeFailed } : null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof UpdateOrderItemQuantityInput>, unknown, UpdateOrderItemQuantityInput>({
    resolver: zodResolver(UpdateOrderItemQuantityInput),
    defaultValues: { orderItemId, quantityKg },
  });

  const onSave = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("orderItemId", orderItemId);
    formData.set("quantityKg", String(data.quantityKg));
    startTransition(() => {
      dispatchSave(formData);
    });
  });

  const onRemove = () => {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("orderItemId", orderItemId);
    startTransition(() => {
      dispatchRemove(formData);
    });
  };

  const busy = isSaving || isRemoving;

  return (
    <form onSubmit={onSave} noValidate className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
      <input type="hidden" {...register("orderItemId")} />
      <div className="min-w-[8rem] flex-1 sm:flex-none">
        <Field label={copy.quantityLabel} control={<Input type="number" step="any" inputMode="decimal" dir="ltr" {...register("quantityKg")} />} error={errors.quantityKg?.message} />
      </div>
      <Button type="submit" variant="outline" className="min-h-11" disabled={busy}>
        {isSaving ? copy.saving : copy.save}
      </Button>
      <Button type="button" variant="text" className="min-h-11 text-destructive" disabled={busy} onClick={onRemove}>
        {isRemoving ? copy.removing : copy.remove}
      </Button>
    </form>
  );
}

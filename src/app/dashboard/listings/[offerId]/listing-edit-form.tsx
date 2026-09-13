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
import { ListingEditInput } from "@/lib/listings/validation";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { updateListing } from "./actions";

/**
 * Feature 006 RUN C (T017) — the seller listing edit form. React Hook Form + `zodResolver` for
 * inline UX only; `updateListing` re-validates with the identical `ListingEditInput` schema
 * server-side — same pattern `components/account/kyb-draft-form.tsx` and RUN B's
 * `listing-create-form.tsx` both established. Only `title`/`quantity`/`price` are editable —
 * `ListingEditInput` itself has no field for currency or any provenance value.
 */
export function ListingEditForm({
  offerId,
  defaultValues,
}: {
  offerId: string;
  defaultValues: { title: string; quantityKg: number; pricePerKg: number };
}) {
  const { tApp } = useLocale();
  const copy = tApp.listings.detail.form;

  const [state, dispatch, isPending] = useActionState(updateListing, undefined);
  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: copy.saved }
      : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
        ? { tone: "error", message: copy.saveFailed }
        : null
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof ListingEditInput>, unknown, ListingEditInput>({
    resolver: zodResolver(ListingEditInput),
    defaultValues: { title: defaultValues.title, quantityKg: defaultValues.quantityKg, pricePerKg: defaultValues.pricePerKg, currency: "USD" },
  });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("offerId", offerId);
    if (data.title) formData.set("title", data.title);
    formData.set("quantityKg", String(data.quantityKg));
    formData.set("pricePerKg", String(data.pricePerKg));
    formData.set("currency", "USD");
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <div className="md:col-span-2">
          <Field label={copy.titleLabel} control={<Input {...register("title")} />} error={errors.title?.message} />
        </div>
        <Field label={copy.quantityLabel} control={<Input type="number" step="any" inputMode="decimal" {...register("quantityKg")} />} error={errors.quantityKg?.message} />
        <Field label={copy.priceLabel} control={<Input type="number" step="any" inputMode="decimal" {...register("pricePerKg")} />} error={errors.pricePerKg?.message} />
      </FieldGroup>

      <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? copy.saving : copy.save}
        </Button>
      </FormActionBar>
    </form>
  );
}

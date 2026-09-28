"use client";

import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DestinationInput, type Destination } from "@/lib/commerce/destination-validation";
import { mapCommerceError } from "@/lib/commerce/errors";
import { upsertDestination } from "@/src/app/dashboard/destinations/actions";
import type { z } from "zod";

export function DestinationForm({ destination }: { destination?: Destination }) {
  const { locale, tApp } = useLocale();
  const copy = tApp.commerce.destinationsUi;
  const [state, dispatch, pending] = useActionState(upsertDestination, undefined);
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof DestinationInput>, unknown, z.output<typeof DestinationInput>>({
    resolver: zodResolver(DestinationInput),
    defaultValues: destination ?? {
      label: "", countryCode: "AE", city: "", addressLine1: "", addressLine2: "",
      contactName: "", contactPhone: "", deliveryMethod: "Courier", isDefault: false,
    },
  });
  const submit = handleSubmit((input) => {
    const data = new FormData();
    if (input.id) data.set("id", input.id);
    data.set("label", input.label);
    data.set("countryCode", input.countryCode);
    data.set("city", input.city);
    data.set("addressLine1", input.addressLine1);
    data.set("addressLine2", input.addressLine2 ?? "");
    data.set("contactName", input.contactName);
    data.set("contactPhone", input.contactPhone);
    if (input.isDefault) data.set("isDefault", "on");
    startTransition(() => dispatch(data));
  });
  const inputClass = "min-w-0 text-[length:var(--text-small)] text-foreground";
  return (
    <form onSubmit={submit} noValidate className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      {destination ? <input type="hidden" {...register("id")} /> : null}
      <input type="hidden" {...register("deliveryMethod")} />
      <label className={inputClass}><span className="mb-1 block">{copy.label}</span><Input maxLength={80} {...register("label")} aria-invalid={Boolean(errors.label)} /></label>
      <label className={inputClass}><span className="mb-1 block">{copy.countryCode}</span><Input maxLength={2} dir="ltr" {...register("countryCode")} aria-invalid={Boolean(errors.countryCode)} /></label>
      <label className={inputClass}><span className="mb-1 block">{copy.city}</span><Input maxLength={120} {...register("city")} aria-invalid={Boolean(errors.city)} /></label>
      <label className={inputClass}><span className="mb-1 block">{copy.addressLine1}</span><Input maxLength={200} {...register("addressLine1")} aria-invalid={Boolean(errors.addressLine1)} /></label>
      <label className={inputClass}><span className="mb-1 block">{copy.addressLine2}</span><Input maxLength={200} {...register("addressLine2")} aria-invalid={Boolean(errors.addressLine2)} /></label>
      <label className={inputClass}><span className="mb-1 block">{copy.contactName}</span><Input maxLength={120} {...register("contactName")} aria-invalid={Boolean(errors.contactName)} /></label>
      <label className={inputClass}><span className="mb-1 block">{copy.contactPhone}</span><Input type="tel" maxLength={16} dir="ltr" {...register("contactPhone")} aria-invalid={Boolean(errors.contactPhone)} /></label>
      <label className="flex min-h-11 items-center gap-2 text-[length:var(--text-small)] text-foreground"><input type="checkbox" className="size-5 accent-accent" {...register("isDefault")} />{copy.default}</label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        {Object.keys(errors).length > 0 ? <p role="alert" className="text-[length:var(--text-small)] text-destructive">{copy.validation}</p> : null}
        {state?.ok ? <p role="status" className="text-[length:var(--text-small)]">{copy.saved}</p> : null}
        {state && !state.ok ? <p role="alert" className="text-[length:var(--text-small)] text-destructive">{state.code === "validation_error" ? copy.validation : mapCommerceError(state.code, locale).message}</p> : null}
        <Button type="submit" className="min-h-11 self-start" disabled={pending}>{pending ? copy.saving : copy.save}</Button>
      </div>
    </form>
  );
}

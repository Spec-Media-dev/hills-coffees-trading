"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, startTransition, useActionState } from "react";
import { Controller, useForm } from "react-hook-form";
import { cn } from "cn";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RFQ_COUNTRIES } from "@/lib/public/countries";
import { RFQ_BUYER_TYPES, RFQ_UNAVAILABLE, RfqInput, type RfqFormInput } from "@/lib/validation/rfq";

import { submitRfq } from "@/src/app/(public)/contact/actions";

/** Native `<select>`, styled to match `Input`'s surface — see file header for why not `components/ui/select`. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-input bg-[var(--surface-card)] px-4 py-2 text-base outline-none transition-[border-color,box-shadow,background-color] duration-[var(--dur-fast)] hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-[0.45] aria-invalid:border-destructive aria-invalid:outline-destructive md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  );
}

/**
 * The RFQ form (Feature 002 T020 — `contracts/rfq-contract.md`).
 *
 * React Hook Form + `zodResolver` against the SAME `RfqInput` schema (`lib/validation/rfq.ts`) the
 * Server Action enforces (client validation is UX only, per T019). Every field is `Field`
 * (`components/ui/field.tsx`, UIF-008): labelled, `aria-describedby`/`aria-invalid` wired
 * automatically, error text rendered as `role="alert"`. Entered values survive a rejected submission
 * because React Hook Form's local state is never cleared on a `{ ok: false }` result.
 *
 * Attribution (`referrer`/`landingPath`/UTM parameters, `contracts/rfq-contract.md` §2) is captured
 * once on mount from `document.referrer`/`window.location` and carried as hidden, registered fields —
 * best-effort, never required, never used to identify an individual beyond this submission.
 *
 * `useActionState` drives `submitRfq`; RHF's `handleSubmit` calls `preventDefault()` before this
 * component dispatches manually inside `startTransition` — the same pattern as
 * `profile-settings-form.tsx` — so there is never a native full-page form submission for a client
 * validation failure (T020 Verify).
 *
 * Copy comes from `useLocale().t.contact.rfq` — the same resolved-per-locale public dictionary every
 * other interactive control on this surface reads (`components/locale/locale-provider.tsx`), rather
 * than server-computed props, so the ONE Server Component page around it stays static.
 */
export function RfqForm() {
  const { t } = useLocale();
  const copy = t.contact.rfq;
  const [state, dispatch, isPending] = useActionState(submitRfq, undefined);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RfqFormInput>({
    resolver: zodResolver(RfqInput),
    defaultValues: { consent: false },
  });

  useEffect(() => {
    // Best-effort only (§2 "Attribution") — a form submitted before this effect runs simply carries
    // empty attribution; nothing here is required for a valid submission.
    setValue("referrer", document.referrer.slice(0, 500));
    setValue("landingPath", window.location.pathname);
    const params = new URLSearchParams(window.location.search);
    setValue("utmSource", params.get("utm_source") ?? "");
    setValue("utmMedium", params.get("utm_medium") ?? "");
    setValue("utmCampaign", params.get("utm_campaign") ?? "");
  }, [setValue]);

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      formData.set(key, value === undefined || value === null ? "" : String(value));
    }
    startTransition(() => {
      dispatch(formData);
    });
  });

  const isUnavailable = state?.ok === false && state.error === RFQ_UNAVAILABLE;
  const isOtherError = state?.ok === false && state.error !== RFQ_UNAVAILABLE && !state.fieldErrors;

  if (isUnavailable) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-7">
        <p className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          {copy.unavailable.title}
        </p>
        <p className="text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          {copy.unavailable.body}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-6">
      <input type="hidden" {...register("referrer")} />
      <input type="hidden" {...register("landingPath")} />
      <input type="hidden" {...register("utmSource")} />
      <input type="hidden" {...register("utmMedium")} />
      <input type="hidden" {...register("utmCampaign")} />

      <FieldGroup>
        <Field
          label={copy.fields.companyName}
          control={<Input {...register("companyName")} />}
          error={errors.companyName?.message}
        />

        <Field
          label={copy.fields.buyerType}
          control={
            <NativeSelect {...register("buyerType")} defaultValue="">
              <option value="" disabled>
                {copy.fields.selectPlaceholder}
              </option>
              {RFQ_BUYER_TYPES.map((value) => (
                <option key={value} value={value}>
                  {copy.fields.buyerTypeOptions[value]}
                </option>
              ))}
            </NativeSelect>
          }
          error={errors.buyerType?.message}
        />

        <Field
          label={copy.fields.countryCode}
          control={
            <NativeSelect {...register("countryCode")} defaultValue="">
              <option value="" disabled>
                {copy.fields.countryPlaceholder}
              </option>
              {RFQ_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </NativeSelect>
          }
          error={errors.countryCode?.message}
        />

        <Field
          label={copy.fields.estimatedVolumeKg}
          control={<Input type="number" min={0} step="any" {...register("estimatedVolumeKg")} />}
          error={errors.estimatedVolumeKg?.message}
        />

        <Field
          label={`${copy.fields.coffeePreference} (${copy.fields.optional})`}
          control={<Input {...register("coffeePreference")} />}
          error={errors.coffeePreference?.message}
        />

        <Field
          label={`${copy.fields.timing} (${copy.fields.optional})`}
          control={<Input {...register("timing")} />}
          error={errors.timing?.message}
        />

        <Field
          label={`${copy.fields.deliveryLocation} (${copy.fields.optional})`}
          control={<Input {...register("deliveryLocation")} />}
          error={errors.deliveryLocation?.message}
        />

        <Field
          label={`${copy.fields.incoterm} (${copy.fields.optional})`}
          control={<Input {...register("incoterm")} />}
          error={errors.incoterm?.message}
        />

        <Field
          label={copy.fields.contactName}
          control={<Input {...register("contactName")} />}
          error={errors.contactName?.message}
        />

        <Field
          label={copy.fields.contactEmail}
          control={<Input type="email" {...register("contactEmail")} />}
          error={errors.contactEmail?.message}
        />

        <Field
          label={`${copy.fields.contactPhone} (${copy.fields.optional})`}
          control={<Input type="tel" {...register("contactPhone")} />}
          error={errors.contactPhone?.message}
        />
      </FieldGroup>

      <Field
        label={`${copy.fields.message} (${copy.fields.optional})`}
        control={<Textarea rows={4} {...register("message")} />}
        error={errors.message?.message}
        className="md:col-span-2"
      />

      <Controller
        control={control}
        name="consent"
        render={({ field }) => (
          <label className="flex min-h-11 items-start gap-3 text-[length:var(--text-small)] text-foreground">
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked)}
              inputRef={field.ref}
              aria-invalid={Boolean(errors.consent)}
              className="mt-0.5"
            />
            <span>{copy.fields.consent}</span>
          </label>
        )}
      />
      {errors.consent ? (
        <p role="alert" className="hc-meta text-destructive">
          {errors.consent.message}
        </p>
      ) : null}

      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? copy.submitting : copy.submit}
        </Button>
        {isOtherError ? (
          <p role="alert" className="hc-meta text-destructive">
            {state?.ok === false ? state.error : copy.genericError}
          </p>
        ) : null}
      </FormActionBar>
    </form>
  );
}

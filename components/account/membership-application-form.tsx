"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { Controller, useForm } from "react-hook-form";
import { cn } from "cn";

import { AppBilingual } from "@/components/locale/app-bilingual";
import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RFQ_COUNTRIES } from "@/lib/public/countries";
import {
  MembershipApplicationInput,
  ONBOARDING_ACCOUNT_TYPES,
  type MembershipApplicationFormInput,
} from "@/lib/validation/membership-application";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { submitMembershipApplication } from "@/src/app/dashboard/onboarding/actions";

/** Native `<select>` styled to match `Input` — same pattern as `components/public/rfq-form.tsx`. */
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
 * The onboarding / membership-application form (Feature 003 T011/T012). Client island rendered
 * inline by `src/app/dashboard/layout.tsx` for a verified, unattached user — never its own separate
 * route (matching the existing `OrganizationSelector` precedent for the same layout). Uses
 * `AppBilingual` (not `useLocale()`, which only carries `lib/public/copy`) for the same reason
 * `OrganizationSelector` does — this is Member Portal shell content, not public-site content.
 *
 * The BUYER/SELLER choice is presented as two cards with HONEST wording ("Buy Coffee" /
 * "Buy & Sell Coffee") — SELLER is never described as sell-only, matching spec/plan. Nothing here
 * ever asks for status/ACTIVE/APPROVED/can_buy/can_sell/created_by/user_id/member_role/platform or
 * compliance role — `MembershipApplicationInput` has no such fields to submit even if it wanted to.
 */
export function MembershipApplicationForm() {
  const { tApp } = useLocale();
  const [state, dispatch, isPending] = useActionState(submitMembershipApplication, undefined);
  useActionToast(
    state,
    state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
      ? { tone: "error", message: tApp.onboarding.form.serverError }
      : null
  );

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<MembershipApplicationFormInput>({
    resolver: zodResolver(MembershipApplicationInput),
    defaultValues: { accountType: undefined, consent: false },
  });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("legalName", data.legalName);
    formData.set("displayName", data.displayName ?? "");
    formData.set("accountType", data.accountType);
    formData.set("countryCode", data.countryCode);
    formData.set("taxNumber", data.taxNumber ?? "");
    formData.set("registrationNumber", data.registrationNumber ?? "");
    formData.set("contactEmail", data.contactEmail ?? "");
    formData.set("contactPhone", data.contactPhone ?? "");
    if (data.consent) formData.set("consent", "true");
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-6">
      <Controller
        control={control}
        name="accountType"
        render={({ field }) => (
          <RadioGroup value={field.value ?? ""} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2">
            {ONBOARDING_ACCOUNT_TYPES.map((value) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-4 transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]",
                  field.value === value && "border-primary"
                )}
              >
                <span className="flex items-center gap-2">
                  <RadioGroupItem value={value} />
                  <span className="font-heading text-[length:var(--text-body)] font-semibold text-foreground">
                    <AppBilingual pick={(c) => (value === "BUYER" ? c.onboarding.form.buyerTitle : c.onboarding.form.sellerTitle)} />
                  </span>
                </span>
                <span className="ps-7 text-[length:var(--text-small)] text-muted-foreground">
                  <AppBilingual
                    pick={(c) => (value === "BUYER" ? c.onboarding.form.buyerDescription : c.onboarding.form.sellerDescription)}
                  />
                </span>
              </label>
            ))}
          </RadioGroup>
        )}
      />
      {errors.accountType ? (
        <p role="alert" className="hc-meta text-destructive">
          {errors.accountType.message}
        </p>
      ) : null}

      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <Field
          label={<AppBilingual pick={(c) => c.onboarding.form.legalName} />}
          control={<Input {...register("legalName")} />}
          error={errors.legalName?.message}
          className="sm:col-span-2"
        />
        <Field
          label={
            <>
              <AppBilingual pick={(c) => c.onboarding.form.displayName} /> (<AppBilingual pick={(c) => c.onboarding.form.optional} />)
            </>
          }
          control={<Input {...register("displayName")} />}
          error={errors.displayName?.message}
          className="sm:col-span-2"
        />
        <Field
          label={<AppBilingual pick={(c) => c.onboarding.form.country} />}
          control={
            <NativeSelect defaultValue="" {...register("countryCode")}>
              <option value="" disabled>
                {""}
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
          label={
            <>
              <AppBilingual pick={(c) => c.onboarding.form.taxNumber} /> (<AppBilingual pick={(c) => c.onboarding.form.optional} />)
            </>
          }
          control={<Input {...register("taxNumber")} />}
          error={errors.taxNumber?.message}
        />
        <Field
          label={
            <>
              <AppBilingual pick={(c) => c.onboarding.form.registrationNumber} /> (<AppBilingual pick={(c) => c.onboarding.form.optional} />)
            </>
          }
          control={<Input {...register("registrationNumber")} />}
          error={errors.registrationNumber?.message}
        />
        <Field
          label={
            <>
              <AppBilingual pick={(c) => c.onboarding.form.contactEmail} /> (<AppBilingual pick={(c) => c.onboarding.form.optional} />)
            </>
          }
          control={<Input type="email" {...register("contactEmail")} />}
          error={errors.contactEmail?.message}
        />
        <Field
          label={
            <>
              <AppBilingual pick={(c) => c.onboarding.form.contactPhone} /> (<AppBilingual pick={(c) => c.onboarding.form.optional} />)
            </>
          }
          control={<Input type="tel" {...register("contactPhone")} />}
          error={errors.contactPhone?.message}
        />
      </FieldGroup>

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
            <span>
              <AppBilingual pick={(c) => c.onboarding.form.consent} />
            </span>
          </label>
        )}
      />
      {errors.consent ? (
        <p role="alert" className="hc-meta text-destructive">
          {errors.consent.message}
        </p>
      ) : null}

      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          <AppBilingual pick={(c) => (isPending ? c.onboarding.form.submitting : c.onboarding.form.submit)} />
        </Button>
      </FormActionBar>

    </form>
  );
}

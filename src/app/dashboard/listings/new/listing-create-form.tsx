"use client";

import { useState, startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ListingCreateFormInput } from "@/lib/listings/validation";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import type { EligibilityRefusalReason } from "@/lib/listings/types";

import { createListingDraft, submitListingForReview, type CreatedListingDraft } from "./actions";

export type PositionOption = {
  positionId: string;
  lotCode: string | null;
  coffeeName: string | null;
  warehouseName: string | null;
  availableQuantityKg: number;
  reservedQuantityKg: number;
} & (
  | { eligible: true; eligibleQuantityKg: number }
  | { eligible: false; reason: EligibilityRefusalReason; eligibleQuantityKg: number | null }
);

/**
 * Feature 006 RUN B (T013/T014) — the seller listing-creation form. React Hook Form + `zodResolver`
 * for inline UX only; `createListingDraft` re-validates with the identical schema server-side — the
 * SAME pattern `components/account/kyb-draft-form.tsx` established. Only ELIGIBLE positions are
 * selectable; ineligible ones render disabled with their specific, localized refusal reason (never a
 * raw `EligibilityRefusalReason` code shown to the user).
 */
export function ListingCreateForm({ positions }: { positions: readonly PositionOption[] }) {
  const { tApp } = useLocale();
  const copy = tApp.listings.new;

  const [createState, createDispatch, isCreating] = useActionState(createListingDraft, undefined);

  // Derives `created` from `createState` DURING RENDER (never inside a `useEffect`, which would
  // cause an extra cascading render for no benefit) — the established React pattern for "adjust
  // state when a prop/upstream value changes": track the last state we have already reacted to, and
  // update both in the same render pass the moment `createState` changes reference.
  const [created, setCreated] = useState<CreatedListingDraft | null>(null);
  const [handledCreateState, setHandledCreateState] = useState(createState);
  if (createState !== handledCreateState) {
    setHandledCreateState(createState);
    if (createState?.ok === true) setCreated(createState.data);
  }

  useActionToast(
    createState,
    createState?.ok === true
      ? { tone: "success", message: copy.toast.created }
      : createState?.ok === false && createState.code === ACTION_FEEDBACK.LISTING_COFFEE_CONTEXT_UNAVAILABLE
        ? { tone: "error", message: copy.toast.contextUnavailable }
        : createState?.ok === false && createState.code !== ACTION_FEEDBACK.VALIDATION_ERROR && createState.code !== ACTION_FEEDBACK.LISTING_INELIGIBLE
          ? { tone: "error", message: copy.toast.createFailed }
          : null
  );

  const [submitState, submitDispatch, isSubmitting] = useActionState(submitListingForReview, undefined);
  useActionToast(
    submitState,
    submitState?.ok === true
      ? { tone: "success", message: copy.submitToast.submitted }
      : submitState?.ok === false
        ? { tone: "error", message: copy.submitToast.submitFailed }
        : null
  );

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof ListingCreateFormInput>, unknown, ListingCreateFormInput>({
    resolver: zodResolver(ListingCreateFormInput),
    defaultValues: { positionId: "", title: "", currency: "USD" },
  });

  const ineligibleReason: EligibilityRefusalReason | undefined =
    createState?.ok === false && createState.code === ACTION_FEEDBACK.LISTING_INELIGIBLE ? (createState.fieldErrors?.positionId?.[0] as EligibilityRefusalReason) : undefined;

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("positionId", data.positionId);
    if (data.title) formData.set("title", data.title);
    formData.set("quantityKg", String(data.quantityKg));
    formData.set("pricePerKg", String(data.pricePerKg));
    formData.set("currency", "USD");
    startTransition(() => {
      createDispatch(formData);
    });
  });

  if (created) {
    const onSubmitForReview = () => {
      const formData = new FormData();
      formData.set("offerId", created.id);
      startTransition(() => {
        submitDispatch(formData);
      });
    };

    return (
      <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{copy.confirmation.title}</h2>
          <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.confirmation.description}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-[length:var(--text-small)]">
          {created.title ? (
            <div className="col-span-2 flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{copy.form.titleLabel}</dt>
              <dd className="font-medium text-foreground">{created.title}</dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{copy.form.quantityLabel}</dt>
            <dd className="font-mono font-semibold tabular-nums text-foreground" dir="ltr">
              {created.quantityKg} kg
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{copy.form.priceLabel}</dt>
            <dd className="font-mono font-semibold tabular-nums text-foreground" dir="ltr">
              {created.currency} {created.pricePerKg}
            </dd>
          </div>
        </dl>
        <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
          <Button type="button" variant="outline" onClick={() => setCreated(null)} disabled={isSubmitting}>
            {copy.confirmation.createAnother}
          </Button>
          <Button type="button" onClick={onSubmitForReview} disabled={isSubmitting || submitState?.ok === true}>
            {isSubmitting ? copy.confirmation.submitting : copy.confirmation.submitForReview}
          </Button>
        </FormActionBar>
      </div>
    );
  }

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-6">
      <Controller
        control={control}
        name="positionId"
        render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} aria-label={copy.form.positionLabel} className="gap-3">
            {positions.map((position) => (
              <label
                key={position.positionId}
                className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-border p-4 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-[0.6] has-data-checked:border-primary"
              >
                <RadioGroupItem value={position.positionId} disabled={!position.eligible} className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {[position.coffeeName, position.lotCode].filter(Boolean).join(" · ") || copy.picker.lotUnavailable}
                    </span>
                    {!position.eligible ? <Badge variant="destructive">{copy.picker.ineligibleBadge}</Badge> : null}
                  </div>
                  <span className="text-[length:var(--text-small)] text-muted-foreground">{position.warehouseName ?? copy.picker.warehouseUnavailable}</span>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-small)]">
                    <span className="flex items-baseline gap-1">
                      <dt className="text-muted-foreground">{copy.picker.availableLabel}:</dt>
                      <dd className="font-mono tabular-nums text-foreground" dir="ltr">
                        {position.availableQuantityKg} kg
                      </dd>
                    </span>
                    <span className="flex items-baseline gap-1">
                      <dt className="text-muted-foreground">{copy.picker.reservedLabel}:</dt>
                      <dd className="font-mono tabular-nums text-foreground" dir="ltr">
                        {position.reservedQuantityKg} kg
                      </dd>
                    </span>
                    {position.eligible ? (
                      <span className="flex items-baseline gap-1">
                        <dt className="text-muted-foreground">{copy.picker.eligibleLabel}:</dt>
                        <dd className="font-mono tabular-nums text-foreground" dir="ltr">
                          {position.eligibleQuantityKg} kg
                        </dd>
                      </span>
                    ) : null}
                  </dl>
                  {!position.eligible ? <p className="text-[length:var(--text-small)] text-destructive">{copy.refusal[position.reason]}</p> : null}
                </div>
              </label>
            ))}
          </RadioGroup>
        )}
      />
      {errors.positionId || ineligibleReason ? (
        <p role="alert" className="hc-meta -mt-4 text-destructive">
          {errors.positionId ? copy.form.positionRequired : copy.refusal[ineligibleReason!]}
        </p>
      ) : null}

      <FieldGroup>
        <div className="md:col-span-2">
          <Field label={copy.form.titleLabel} hint={copy.form.titleHint} control={<Input {...register("title")} />} error={errors.title?.message} />
        </div>
        <Field label={copy.form.quantityLabel} control={<Input type="number" step="any" inputMode="decimal" {...register("quantityKg")} />} error={errors.quantityKg?.message} />
        <Field label={copy.form.priceLabel} control={<Input type="number" step="any" inputMode="decimal" {...register("pricePerKg")} />} error={errors.pricePerKg?.message} />
        <Field label={copy.form.currencyLabel} hint={copy.form.currencyFixedNote} control={<Input value="USD" disabled readOnly />} />
      </FieldGroup>

      <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" disabled={isCreating || positions.every((position) => !position.eligible)}>
          {isCreating ? copy.form.saving : copy.form.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

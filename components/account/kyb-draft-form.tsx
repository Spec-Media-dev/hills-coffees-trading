"use client";

import { startTransition, useActionState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { KybDraftInput } from "@/lib/validation/kyb-application";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { saveKybDraft } from "@/src/app/dashboard/kyb/actions";

/**
 * Feature 003 T016 — the KYB draft business-detail form (`registered_address`, `business_activity`
 * only — the two new `kyb_applications` columns `update_kyb_draft` writes). React Hook Form +
 * `zodResolver` for inline UX only; the Server Action re-validates with the identical schema, same
 * pattern every other form in this codebase follows.
 */
export function KybDraftForm({
  defaultValues,
  disabled,
}: {
  defaultValues: { registeredAddress: string; businessActivity: string };
  disabled?: boolean;
}) {
  const { tApp } = useLocale();
  const copy = tApp.kyb.form;
  const [state, dispatch, isPending] = useActionState(saveKybDraft, undefined);
  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: tApp.kyb.toast.draftSaved }
      : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
        ? { tone: "error", message: tApp.kyb.toast.draftSaveFailed }
        : null
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<KybDraftInput>({ resolver: zodResolver(KybDraftInput), defaultValues });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("registeredAddress", data.registeredAddress);
    formData.set("businessActivity", data.businessActivity);
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{copy.title}</h2>
        <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.lead}</p>
      </div>

      <Field
        label={copy.registeredAddress}
        control={<Textarea rows={2} disabled={disabled} {...register("registeredAddress")} />}
        error={errors.registeredAddress?.message}
      />
      <Field
        label={copy.businessActivity}
        control={<Textarea rows={3} disabled={disabled} {...register("businessActivity")} />}
        error={errors.businessActivity?.message}
      />

      <FormActionBar className="justify-start bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" variant="outline" disabled={isPending || disabled}>
          {isPending ? copy.saving : copy.save}
        </Button>
      </FormActionBar>
    </form>
  );
}

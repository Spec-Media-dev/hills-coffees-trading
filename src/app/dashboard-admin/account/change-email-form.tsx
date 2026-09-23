"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChangeMyEmailInput, type ChangeMyEmailInput as ChangeMyEmailInputType } from "@/lib/validation/account-security";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { changeMyEmail } from "@/src/app/dashboard/settings/actions";

/**
 * Feature 010 T048 — Admin/Super Admin own-email change. `changeMyEmail`'s own authorization check is
 * the enforced gate (this form is simply never rendered for a Seller/Buyer identity — see the calling
 * page — but even if it were, the Server Action refuses non-Admin/Super-Admin sessions itself).
 *
 * Uses ONLY `auth.updateUser({ email })` — Supabase's own double-confirmation flow. This form never
 * claims the email has changed on submit; it reports that a confirmation was REQUESTED, matching what
 * actually happened.
 */
export function ChangeEmailForm() {
  const { tApp } = useLocale();
  const [state, dispatch, isPending] = useActionState(changeMyEmail, undefined);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeMyEmailInputType>({ resolver: zodResolver(ChangeMyEmailInput), defaultValues: { newEmail: "" } });

  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: tApp.accountSecurity.email.requestedToast }
      : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
        ? { tone: "error", message: state.code === ACTION_FEEDBACK.EMAIL_CHANGE_FORBIDDEN ? tApp.accountSecurity.email.forbidden : tApp.accountSecurity.email.failure }
        : null
  );

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("newEmail", data.newEmail);
    startTransition(() => {
      dispatch(formData);
      reset();
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-4" data-account-form="email-change">
      <Field label={tApp.accountSecurity.email.newLabel} control={<Input type="email" autoComplete="email" {...register("newEmail")} />} error={errors.newEmail?.message} />
      <FormActionBar className="static justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? tApp.accountSecurity.email.saving : tApp.accountSecurity.email.submit}
        </Button>
      </FormActionBar>
      {state?.ok === true ? <p className="text-[length:var(--text-small)] text-muted-foreground">{tApp.accountSecurity.email.requestedNote}</p> : null}
    </form>
  );
}

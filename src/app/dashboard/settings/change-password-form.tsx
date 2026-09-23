"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChangeMyPasswordInput, type ChangeMyPasswordInput as ChangeMyPasswordInputType } from "@/lib/validation/account-security";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { changeMyPassword } from "./actions";

/**
 * Feature 010 RUN F010-ACCOUNT-MEDIA — the in-session password-change form, shared by EVERY role
 * (mounted on `/dashboard/settings` for Buyer/Seller and `/dashboard-admin/account` for Admin/Super
 * Admin — the SAME sharing pattern `ProfileSettingsForm` already established). Client-side validation
 * mirrors the Server Action's own enforced Zod gate (one schema file, imported by both). The password
 * value itself is never logged, never echoed back in any success/error state, and the form clears its
 * own fields after a successful submit (React Hook Form's `reset()`).
 */
export function ChangePasswordForm() {
  const { tApp } = useLocale();
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState(changeMyPassword, undefined);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeMyPasswordInputType>({ resolver: zodResolver(ChangeMyPasswordInput), defaultValues: { password: "", confirmPassword: "" } });

  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: tApp.accountSecurity.password.success }
      : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
        ? state.code === ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED
          ? { tone: "warning", message: tApp.feedback.mfaStepUpRequired, action: { label: tApp.feedback.mfaStepUpAction, onClick: () => router.push("/mfa/") } }
          : { tone: "error", message: tApp.accountSecurity.password.failure }
        : null
  );

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("password", data.password);
    formData.set("confirmPassword", data.confirmPassword);
    startTransition(() => {
      dispatch(formData);
      reset();
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-4" data-account-form="password">
      <FieldGroup>
        <Field
          label={tApp.accountSecurity.password.newLabel}
          control={<Input type="password" autoComplete="new-password" {...register("password")} />}
          error={errors.password?.message}
        />
        <Field
          label={tApp.accountSecurity.password.confirmLabel}
          control={<Input type="password" autoComplete="new-password" {...register("confirmPassword")} />}
          error={errors.confirmPassword?.message}
        />
      </FieldGroup>
      <FormActionBar className="static justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? tApp.accountSecurity.password.saving : tApp.accountSecurity.password.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

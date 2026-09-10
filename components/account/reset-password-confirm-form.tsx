"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResetPasswordConfirmInput } from "@/lib/validation/reset-password";

import { confirmPasswordReset } from "@/src/app/(auth)/reset-password/confirm/actions";

/** The new-password form on `/reset-password/confirm/` (Feature 003 T008). */
export function ResetPasswordConfirmForm() {
  const { t } = useLocale();
  const copy = t.auth.resetPassword;
  const [state, dispatch, isPending] = useActionState(confirmPasswordReset, undefined);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordConfirmInput>({ resolver: zodResolver(ResetPasswordConfirmInput) });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("password", data.password);
    formData.set("confirmPassword", data.confirmPassword);
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <Field
          label={copy.newPassword}
          control={<Input type="password" autoComplete="new-password" {...register("password")} />}
          error={errors.password?.message}
        />
        <Field
          label={copy.confirmNewPassword}
          control={<Input type="password" autoComplete="new-password" {...register("confirmPassword")} />}
          error={errors.confirmPassword?.message}
        />
      </div>

      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? copy.confirmSubmitting : copy.confirmSubmit}
        </Button>
      </FormActionBar>

      {state?.ok === false ? (
        <p role="alert" className="hc-meta text-center text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

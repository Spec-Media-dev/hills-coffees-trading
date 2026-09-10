"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResetPasswordRequestInput } from "@/lib/validation/reset-password";

import { requestPasswordReset } from "@/src/app/(auth)/reset-password/actions";

/** The password-reset request form (Feature 003 T008). Always resolves to the same acknowledgement. */
export function ResetPasswordRequestForm() {
  const { t } = useLocale();
  const copy = t.auth.resetPassword;
  const [state, dispatch, isPending] = useActionState(requestPasswordReset, undefined);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordRequestInput>({ resolver: zodResolver(ResetPasswordRequestInput) });

  if (state?.ok === true) {
    return (
      <p role="status" className="text-center text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
        {copy.acknowledgement}
      </p>
    );
  }

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("email", data.email);
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-6">
      <Field label={copy.email} control={<Input type="email" autoComplete="email" {...register("email")} />} error={errors.email?.message} />
      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? copy.submitting : copy.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

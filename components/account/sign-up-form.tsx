"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { useLocale } from "@/components/locale/locale-provider";
import { useActionToast } from "@/components/app/use-action-toast";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SignUpInput } from "@/lib/validation/sign-up";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { signUp } from "@/src/app/(auth)/sign-up/actions";

/**
 * The sign-up form (Feature 003 T010a). Same shape as `SignInForm`: React Hook Form +
 * `zodResolver(SignUpInput)` for inline UX only, the Server Action re-validates with the identical
 * schema. On success this renders ONLY the generic "check your email" acknowledgement — never a
 * form reset that implies something more specific happened, since the action itself never
 * distinguishes a brand-new account from an already-registered email.
 */
export function SignUpForm() {
  const { t } = useLocale();
  const copy = t.auth.signUp;
  const [state, dispatch, isPending] = useActionState(signUp, undefined);
  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: copy.acknowledgement }
      : state?.ok === false &&
          state.code !== ACTION_FEEDBACK.VALIDATION_ERROR &&
          state.code !== ACTION_FEEDBACK.WEAK_PASSWORD
        ? {
            tone: "error",
            message:
              state.code === ACTION_FEEDBACK.RATE_LIMITED ? copy.rateLimited : copy.genericError,
          }
        : null
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({ resolver: zodResolver(SignUpInput) });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("fullName", data.fullName);
    formData.set("email", data.email);
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
          label={copy.fullName}
          control={<Input autoComplete="name" {...register("fullName")} />}
          error={errors.fullName?.message}
        />
        <Field
          label={copy.email}
          control={<Input type="email" autoComplete="email" {...register("email")} />}
          error={errors.email?.message ?? (state?.ok === false && state.fieldErrors?.email ? copy.invalidEmail : undefined)}
        />
        <Field
          label={copy.password}
          control={
            <PasswordInput
              autoComplete="new-password"
              showLabel={t.auth.password.show}
              hideLabel={t.auth.password.hide}
              {...register("password")}
            />
          }
          error={
            errors.password?.message ??
            (state?.ok === false && state.code === ACTION_FEEDBACK.WEAK_PASSWORD ? copy.weakPassword : undefined)
          }
        />
        <Field
          label={copy.confirmPassword}
          control={
            <PasswordInput
              autoComplete="new-password"
              showLabel={t.auth.password.show}
              hideLabel={t.auth.password.hide}
              {...register("confirmPassword")}
            />
          }
          error={errors.confirmPassword?.message}
        />
      </div>

      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? copy.submitting : copy.submit}
        </Button>
      </FormActionBar>

    </form>
  );
}

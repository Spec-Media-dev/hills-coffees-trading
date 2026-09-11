"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SignUpInput } from "@/lib/validation/sign-up";

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

  if (state?.ok === true) {
    return (
      <p role="status" className="text-center text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
        {copy.acknowledgement}
      </p>
    );
  }

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <Field
          label={copy.fullName}
          control={<Input autoComplete="name" {...register("fullName")} />}
          error={errors.fullName?.message}
        />
        <Field label={copy.email} control={<Input type="email" autoComplete="email" {...register("email")} />} error={errors.email?.message} />
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
          error={errors.password?.message}
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

      {state?.ok === false ? (
        <p role="alert" className="hc-meta text-center text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

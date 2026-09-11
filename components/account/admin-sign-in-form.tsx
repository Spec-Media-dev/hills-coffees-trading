"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { useLocale } from "@/components/locale/locale-provider";
import { useActionToast } from "@/components/app/use-action-toast";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { SignInInput } from "@/lib/validation/sign-in";

import { adminSignIn } from "@/src/app/admin/sign-in/actions";

/**
 * The dedicated ADMIN sign-in form (admin-auth correction pass). Same `SignInInput` schema and the
 * same `PasswordInput`/`Field`/`FormActionBar` primitives `SignInForm` uses — no second form
 * pattern, no duplicated password-toggle logic. The ONLY structural differences from `SignInForm`:
 * it posts to `adminSignIn` (not `signIn`), and it renders no "Don't have an account?"/"Create
 * account" link anywhere — there is no public admin registration, so this component has no prop,
 * copy key, or code path capable of rendering that CTA even by mistake (run directive §5).
 *
 * Invalid credentials remain one enumeration-safe message. A successfully authenticated account
 * without an operational role is signed out server-side and receives a controlled, localized
 * portal-denial toast without role details.
 */
export function AdminSignInForm() {
  const { t } = useLocale();
  const copy = t.auth.adminSignIn;
  const [state, dispatch, isPending] = useActionState(adminSignIn, undefined);
  useActionToast(
    state,
    state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
      ? {
          tone: "error",
          message:
            state.code === ACTION_FEEDBACK.ADMIN_ACCESS_DENIED
              ? copy.accessDenied
              : state.code === ACTION_FEEDBACK.INVALID_CREDENTIALS
                ? copy.genericError
                : copy.serverError,
        }
      : null
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({ resolver: zodResolver(SignInInput) });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("email", data.email);
    formData.set("password", data.password);
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <Field label={copy.email} control={<Input type="email" autoComplete="email" {...register("email")} />} error={errors.email?.message} />
        <Field
          label={copy.password}
          control={
            <PasswordInput
              autoComplete="current-password"
              showLabel={t.auth.password.show}
              hideLabel={t.auth.password.hide}
              {...register("password")}
            />
          }
          error={errors.password?.message}
        />
      </div>

      <Link
        href="/reset-password/"
        className="self-end text-[length:var(--text-small)] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {copy.forgotPassword}
      </Link>

      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? copy.submitting : copy.submit}
        </Button>
      </FormActionBar>

    </form>
  );
}

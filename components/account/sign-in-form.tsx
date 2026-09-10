"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SignInInput, SIGN_IN_GENERIC_ERROR } from "@/lib/validation/sign-in";

import { signIn } from "@/src/app/(auth)/sign-in/actions";

/**
 * The sign-in form (Feature 003 T005). React Hook Form + `zodResolver(SignInInput)` — the SAME
 * schema `signIn` enforces server-side (client validation is UX only). Every field through
 * `Field`/`FieldGroup`/`FormActionBar` (the same UIF-008 primitives every other form in this
 * product uses), so this page shares the exact form language of `/contact/`'s RFQ form and
 * `/dashboard/settings`'s profile form rather than inventing a fourth pattern.
 *
 * The failure state is ALWAYS the same generic message regardless of what `signIn` returned as its
 * cause (spec SC-005) — this component does not branch on the error value at all, only on
 * ok/not-ok, which is what makes it structurally impossible for this form to leak a distinction
 * the server action itself doesn't already refuse to make.
 */
export function SignInForm() {
  const { t } = useLocale();
  const copy = t.auth.signIn;
  const [state, dispatch, isPending] = useActionState(signIn, undefined);

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
          control={<Input type="password" autoComplete="current-password" {...register("password")} />}
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

      {state?.ok === false ? (
        <p role="alert" className="hc-meta text-center text-destructive">
          {state.error === SIGN_IN_GENERIC_ERROR ? copy.genericError : state.error}
        </p>
      ) : null}
    </form>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

import { signIn } from "@/src/app/(auth)/sign-in/actions";

/**
 * The sign-in form (Feature 003 T005). React Hook Form + `zodResolver(SignInInput)` — the SAME
 * schema `signIn` enforces server-side (client validation is UX only). Every field through
 * `Field`/`FieldGroup`/`FormActionBar` (the same UIF-008 primitives every other form in this
 * product uses), so this page shares the exact form language of `/contact/`'s RFQ form and
 * `/dashboard/settings`'s profile form rather than inventing a fourth pattern.
 *
 * Invalid credentials always map to one localized message. An authenticated operational account
 * is signed out by the action and receives a safe toast link to the dedicated Admin Portal.
 */
export function SignInForm() {
  const { t } = useLocale();
  const router = useRouter();
  const copy = t.auth.signIn;
  const [state, dispatch, isPending] = useActionState(signIn, undefined);
  useActionToast(
    state,
    state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
      ? {
          tone: "error",
          message:
            state.code === ACTION_FEEDBACK.ADMIN_PORTAL_REQUIRED
              ? copy.adminPortalRequired
              : state.code === ACTION_FEEDBACK.INVALID_CREDENTIALS
                ? copy.genericError
                : copy.serverError,
          action:
            state.code === ACTION_FEEDBACK.ADMIN_PORTAL_REQUIRED
              ? { label: copy.adminPortalAction, onClick: () => router.push("/admin/sign-in/") }
              : undefined,
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

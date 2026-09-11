"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MyProfileInput, type MyProfileInput as MyProfileInputType } from "@/lib/validation/my-profile";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { updateMyProfile } from "./actions";

type Props = {
  initialValues: {
    fullName: string;
    phone: string;
    companyName: string;
    avatarPath: string;
  };
};

/**
 * Client-side half of the FR-018 layered-validation proof: React Hook Form + the SAME Zod schema
 * (`MyProfileInput`, lib/validation/my-profile.ts) the Server Action enforces — one schema file,
 * imported by both layers (research.md §7). Client validation is UX only; the Server Action's own
 * `MyProfileInput.safeParse` call is the enforced gate and runs regardless of what this component
 * does. `updateMyProfile` itself, and everything it validates, is UNTOUCHED by Phase 5.5.
 *
 * ── CONVERGED ONTO THE UIF-008 FIELD SCAFFOLD (Phase 5.5, UIF-036) ──────────────────────────────
 *
 * Each field is now `Field` (`components/ui/field.tsx`) rather than a hand-rolled
 * `Label`+`Input`+conditional-`<p role="alert">` trio: `Field` wires `aria-describedby`/
 * `aria-invalid` itself, so this file no longer constructs those ids by hand and cannot drift from
 * the UIF-008 contract. `FieldGroup` stacks two columns at `md:` and collapses to one at 390px
 * (UIF-008's own Verify: "multi-column groups stack at 390px"). `FormActionBar` is the shared
 * sticky action-row pattern rather than a bespoke `<div>`. No field, label, error or validation
 * BEHAVIOUR changed — only the primitive each one renders through.
 *
 * `useActionState` drives `updateMyProfile`. React Hook Form's `handleSubmit` always calls
 * `event.preventDefault()` before it validates (so the browser's native `<form action>` submission
 * never runs), so the dispatch returned by `useActionState` is invoked manually — inside
 * `startTransition`, the documented pattern for calling a `useActionState` action outside of a
 * form's native `action` prop — only once client-side validation has passed.
 */
export function ProfileSettingsForm({ initialValues }: Props) {
  const { tApp } = useLocale();
  const [state, dispatch, isPending] = useActionState(updateMyProfile, undefined);
  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: tApp.feedback.profileSaved }
      : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
        ? {
            tone: "error",
            message:
              state.code === ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED
                ? tApp.feedback.signInRequired
                : tApp.feedback.profileSaveFailed,
          }
        : null
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MyProfileInputType>({
    resolver: zodResolver(MyProfileInput),
    values: initialValues,
  });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("fullName", data.fullName ?? "");
    formData.set("phone", data.phone ?? "");
    formData.set("companyName", data.companyName ?? "");
    formData.set("avatarPath", data.avatarPath ?? "");

    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="mt-6 flex flex-col gap-6">
      <FieldGroup>
        <Field
          label="Full name"
          control={<Input {...register("fullName")} />}
          error={errors.fullName?.message}
        />
        <Field label="Phone" control={<Input {...register("phone")} />} error={errors.phone?.message} />
        <Field
          label="Company name"
          control={<Input {...register("companyName")} />}
          error={errors.companyName?.message}
        />
        <Field
          label="Avatar path"
          control={<Input {...register("avatarPath")} />}
          error={errors.avatarPath?.message}
        />
      </FieldGroup>

      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </FormActionBar>
    </form>
  );
}

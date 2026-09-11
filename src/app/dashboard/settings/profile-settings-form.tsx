"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MyProfileInput, type MyProfileInput as MyProfileInputType } from "@/lib/validation/my-profile";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { updateMyProfile } from "./actions";

/**
 * Feature 003 T027 — no approved avatar upload workflow exists in this repository (no Storage
 * bucket, no signed-URL/media contract). Rather than fabricate one, this derives a stable initials
 * fallback from the user's own current name — the directive's explicit "a fallback initials/avatar
 * is acceptable" allowance — and nothing else. `avatarPath` itself is preserved unedited via a
 * hidden field below so `update_my_profile`'s full-column-replace semantics never null it out.
 */
function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

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
    control,
    formState: { errors },
  } = useForm<MyProfileInputType>({
    resolver: zodResolver(MyProfileInput),
    values: initialValues,
  });

  const watchedFullName = useWatch({ control, name: "fullName" });

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
      <div className="flex items-center gap-4">
        <Avatar size="lg">
          <AvatarFallback>{initialsFromName(watchedFullName || initialValues.fullName)}</AvatarFallback>
        </Avatar>
        <p className="text-[length:var(--text-small)] text-muted-foreground">{tApp.profile.avatarFallbackHint}</p>
      </div>
      {/* No approved avatar upload workflow exists — preserve the current stored value unedited so
          `update_my_profile`'s full-column-replace semantics never null it out on save. */}
      <input type="hidden" {...register("avatarPath")} />

      <FieldGroup>
        <Field
          label={tApp.profile.fullName}
          control={<Input {...register("fullName")} />}
          error={errors.fullName?.message}
        />
        <Field label={tApp.profile.phone} control={<Input {...register("phone")} />} error={errors.phone?.message} />
        <Field
          label={tApp.profile.companyName}
          hint={tApp.profile.companyNameHint}
          control={<Input {...register("companyName")} />}
          error={errors.companyName?.message}
        />
      </FieldGroup>

      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? tApp.profile.saving : tApp.profile.save}
        </Button>
      </FormActionBar>
    </form>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MyProfileInput, type MyProfileInput as MyProfileInputType } from "@/lib/validation/my-profile";

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
 * does.
 *
 * `useActionState` drives `updateMyProfile`. React Hook Form's `handleSubmit` always calls
 * `event.preventDefault()` before it validates (so the browser's native `<form action>` submission
 * never runs), so the dispatch returned by `useActionState` is invoked manually — inside
 * `startTransition`, the documented pattern for calling a `useActionState` action outside of a
 * form's native `action` prop — only once client-side validation has passed.
 */
export function ProfileSettingsForm({ initialValues }: Props) {
  const [state, dispatch, isPending] = useActionState(updateMyProfile, undefined);

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
    <form onSubmit={onValid} noValidate className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
          {...register("fullName")}
        />
        {errors.fullName ? (
          <p id="fullName-error" role="alert" className="text-xs text-destructive">
            {errors.fullName.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? "phone-error" : undefined}
          {...register("phone")}
        />
        {errors.phone ? (
          <p id="phone-error" role="alert" className="text-xs text-destructive">
            {errors.phone.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          aria-invalid={errors.companyName ? true : undefined}
          aria-describedby={errors.companyName ? "companyName-error" : undefined}
          {...register("companyName")}
        />
        {errors.companyName ? (
          <p id="companyName-error" role="alert" className="text-xs text-destructive">
            {errors.companyName.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatarPath">Avatar path</Label>
        <Input
          id="avatarPath"
          aria-invalid={errors.avatarPath ? true : undefined}
          aria-describedby={errors.avatarPath ? "avatarPath-error" : undefined}
          {...register("avatarPath")}
        />
        {errors.avatarPath ? (
          <p id="avatarPath-error" role="alert" className="text-xs text-destructive">
            {errors.avatarPath.message}
          </p>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
        {state?.ok === true ? (
          <p role="status" className="text-xs text-muted-foreground">
            Saved.
          </p>
        ) : null}
        {state?.ok === false ? (
          <p role="alert" className="text-xs text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

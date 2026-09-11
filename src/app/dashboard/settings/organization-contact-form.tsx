"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { OrganizationContactInput } from "@/lib/validation/organization-contact";

import { updateOrganizationContact } from "./actions";

/**
 * Feature 003 T026 — organization (business) contact self-service. Same UIF-008 `Field`/
 * `FieldGroup`/`FormActionBar` primitives `ProfileSettingsForm` uses — one form language across
 * both sections of the settings page, not a second pattern. Editable fields are exactly the three
 * `update_organization_contact` accepts: trading name, business email, business phone — never the
 * organization's legal identity, KYB, or approval state, none of which this form even has a field
 * for.
 */
export function OrganizationContactForm({
  initialValues,
}: {
  initialValues: { displayName: string; email: string; phone: string };
}) {
  const { tApp } = useLocale();
  const router = useRouter();
  const copy = tApp.organization;
  const [state, dispatch, isPending] = useActionState(updateOrganizationContact, undefined);
  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: tApp.feedback.organizationContactSaved }
      : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
        ? state.code === ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED
          ? {
              tone: "warning",
              message: tApp.feedback.mfaStepUpRequired,
              action: { label: tApp.feedback.mfaStepUpAction, onClick: () => router.push("/mfa/") },
            }
          : { tone: "error", message: tApp.feedback.organizationContactSaveFailed }
        : null
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrganizationContactInput>({ resolver: zodResolver(OrganizationContactInput), values: initialValues });

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("displayName", data.displayName ?? "");
    formData.set("email", data.email ?? "");
    formData.set("phone", data.phone ?? "");
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate className="mt-6 flex flex-col gap-6">
      <FieldGroup>
        <Field label={copy.displayName} control={<Input {...register("displayName")} />} error={errors.displayName?.message} />
        <Field label={copy.email} control={<Input type="email" {...register("email")} />} error={errors.email?.message} />
        <Field label={copy.phone} control={<Input {...register("phone")} />} error={errors.phone?.message} />
      </FieldGroup>

      <FormActionBar className="justify-start bg-transparent backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? copy.saving : copy.save}
        </Button>
      </FormActionBar>
    </form>
  );
}

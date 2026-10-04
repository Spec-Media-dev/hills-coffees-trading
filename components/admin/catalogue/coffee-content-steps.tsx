"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CoffeeWorkflowState } from "@/lib/admin/catalogue";
import { SLUG_PATTERN } from "@/lib/admin/catalogue-validation";
import { createCoffeeAction, saveArabicAction, saveIdentityAction, saveTaxonomyAction } from "@/src/app/dashboard-admin/(catalogue)/coffees/workflow-actions";

import { fieldMessage, slugify, StepSection, useWorkflowAction, WorkflowNotice } from "./workflow-shared";

/**
 * Feature 018 — identity, Arabic and origin/profile steps. Every form is uncontrolled and keyed by the stored revision:
 * a failed save keeps exactly what the operator typed (no remount), a successful save re-reads the saved record.
 * English and Arabic are separate steps and separate database operations, so one never overwrites the other.
 */

type Hidden = { coffeeId: string; revision: number };

function HiddenFields({ coffeeId, revision }: Hidden) {
  return (
    <>
      <input type="hidden" name="coffeeId" value={coffeeId} />
      <input type="hidden" name="revision" value={revision} />
    </>
  );
}

function formDataOf(event: FormEvent<HTMLFormElement>): FormData {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

/** New Coffee: the first confirmed save creates ONE draft for this intent, then moves to the saved Coffee. */
export function CreateCoffeeForm() {
  const router = useRouter();
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [clientErrors, setClientErrors] = useState<{ name?: string; slug?: string }>({});
  const { state, pending, submit, requestId, copy } = useWorkflowAction({
    action: createCoffeeAction,
    success: (_result, c) => c.toasts.created,
    onSuccess: (result) => router.replace(`/dashboard-admin/coffees/${result.data.coffeeId}?step=arabic`),
  });
  const v = copy.validation;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const data = formDataOf(event);
    const name = String(data.get("name") ?? "").trim();
    const address = String(data.get("slug") ?? "").trim().toLowerCase();
    const errors: { name?: string; slug?: string } = {};
    if (!name) errors.name = v.NAME_REQUIRED;
    if (!address) errors.slug = v.SLUG_REQUIRED;
    else if (!SLUG_PATTERN.test(address)) errors.slug = v.SLUG_INVALID;
    setClientErrors(errors);
    if (errors.name || errors.slug) return;
    submit(data);
  };
  return (
    <StepSection heading={copy.identity.heading} lead={copy.newLead}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-workflow-form="create">
        <FieldGroup>
          <Field
            label={copy.identity.name}
            hint={copy.identity.nameHint}
            error={clientErrors.name ?? fieldMessage(copy, state, "name")}
            control={
              <Input
                name="name"
                dir="ltr"
                lang="en"
                maxLength={120}
                required
                onChange={(event) => {
                  if (!slugTouched) setSlug(slugify(event.currentTarget.value));
                }}
              />
            }
          />
          <Field
            label={copy.identity.slug}
            hint={copy.identity.slugHint}
            error={clientErrors.slug ?? fieldMessage(copy, state, "slug") ?? (state && !state.ok && state.code === "SLUG_TAKEN" ? copy.errors.SLUG_TAKEN : undefined)}
            control={
              <Input
                name="slug"
                dir="ltr"
                className="font-mono"
                maxLength={100}
                required
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.currentTarget.value);
                }}
              />
            }
          />
          <Field className="md:col-span-2" label={copy.identity.description} hint={copy.identity.descriptionHint} error={fieldMessage(copy, state, "description")} control={<Textarea name="description" dir="ltr" lang="en" rows={5} maxLength={4000} />} />
        </FieldGroup>
        <WorkflowNotice result={state} requestId={requestId} />
        <FormActionBar className="bg-[var(--surface-card)]">
          <Button type="submit" disabled={pending} data-state={pending ? "loading" : undefined}>
            {pending ? copy.common.saving : copy.identity.createAction}
          </Button>
        </FormActionBar>
      </form>
    </StepSection>
  );
}

export function IdentityStep({ workflow, onSaved }: { workflow: CoffeeWorkflowState; onSaved: () => void }) {
  const { coffee } = workflow;
  const [clientErrors, setClientErrors] = useState<{ name?: string; slug?: string }>({});
  const { state, pending, submit, requestId, copy } = useWorkflowAction({ action: saveIdentityAction, success: (_r, c) => c.toasts.identitySaved, onSuccess: onSaved });
  const v = copy.validation;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const data = formDataOf(event);
    const name = String(data.get("name") ?? "").trim();
    const address = String(data.get("slug") ?? "").trim().toLowerCase();
    const errors: { name?: string; slug?: string } = {};
    if (!name) errors.name = v.NAME_REQUIRED;
    if (!address) errors.slug = v.SLUG_REQUIRED;
    else if (!SLUG_PATTERN.test(address)) errors.slug = v.SLUG_INVALID;
    setClientErrors(errors);
    if (errors.name || errors.slug) return;
    submit(data);
  };
  return (
    <StepSection heading={copy.identity.heading} lead={copy.identity.lead}>
      <form key={coffee.revision} onSubmit={onSubmit} noValidate className="flex flex-col gap-5" data-workflow-form="identity">
        <HiddenFields coffeeId={coffee.id} revision={coffee.revision} />
        <FieldGroup>
          <Field label={copy.identity.name} hint={copy.identity.nameHint} error={clientErrors.name ?? fieldMessage(copy, state, "name")} control={<Input name="name" dir="ltr" lang="en" maxLength={120} required defaultValue={coffee.name} />} />
          <Field
            label={copy.identity.slug}
            hint={copy.identity.slugHint}
            error={clientErrors.slug ?? fieldMessage(copy, state, "slug") ?? (state && !state.ok && state.code === "SLUG_TAKEN" ? copy.errors.SLUG_TAKEN : undefined)}
            control={<Input name="slug" dir="ltr" className="font-mono" maxLength={100} required defaultValue={coffee.slug} />}
          />
          <Field className="md:col-span-2" label={copy.identity.description} hint={copy.identity.descriptionHint} error={fieldMessage(copy, state, "description")} control={<Textarea name="description" dir="ltr" lang="en" rows={5} maxLength={4000} defaultValue={coffee.description ?? ""} />} />
        </FieldGroup>
        <WorkflowNotice result={state} requestId={requestId} coffeeId={coffee.id} />
        <FormActionBar className="bg-[var(--surface-card)]">
          <Button type="submit" disabled={pending} data-state={pending ? "loading" : undefined}>
            {pending ? copy.common.saving : copy.common.saveContinue}
          </Button>
        </FormActionBar>
      </form>
    </StepSection>
  );
}

export function ArabicStep({ workflow, onSaved }: { workflow: CoffeeWorkflowState; onSaved: () => void }) {
  const { coffee, arabic } = workflow;
  const { state, pending, submit, requestId, copy } = useWorkflowAction({ action: saveArabicAction, success: (_r, c) => c.toasts.arabicSaved, onSuccess: onSaved });
  const saved = arabic && arabic !== "unavailable" ? arabic : { name: "", description: "" };
  return (
    <StepSection heading={copy.arabic.heading} lead={copy.arabic.lead}>
      <form key={`${coffee.revision}-${saved.name.length}-${saved.description.length}`} onSubmit={(event) => submit(formDataOf(event))} noValidate className="flex flex-col gap-5" data-workflow-form="arabic">
        <HiddenFields coffeeId={coffee.id} revision={coffee.revision} />
        <Field label={copy.arabic.name} error={fieldMessage(copy, state, "name")} control={<Input name="name" dir="rtl" lang="ar" maxLength={200} defaultValue={saved.name} />} />
        <Field label={copy.arabic.description} hint={copy.arabic.englishFallback} error={fieldMessage(copy, state, "description")} control={<Textarea name="description" dir="rtl" lang="ar" rows={5} maxLength={4000} defaultValue={saved.description} />} />
        <p className="text-[length:var(--text-micro)] text-muted-foreground">{copy.arabic.requiredToPublish}</p>
        <WorkflowNotice result={state} requestId={requestId} coffeeId={coffee.id} />
        <FormActionBar className="bg-[var(--surface-card)]">
          <Button type="submit" disabled={pending} data-state={pending ? "loading" : undefined}>
            {pending ? copy.common.saving : copy.common.saveContinue}
          </Button>
        </FormActionBar>
      </form>
    </StepSection>
  );
}

const SELECT_CLASS =
  "h-11 w-full rounded-[var(--radius-sm)] border border-input bg-[var(--surface-card)] px-3 text-base text-foreground hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] aria-invalid:border-destructive md:text-sm dark:bg-input/30";

export function TaxonomyStep({ workflow, onSaved }: { workflow: CoffeeWorkflowState; onSaved: () => void }) {
  const { coffee, options } = workflow;
  const { state, pending, submit, requestId, copy } = useWorkflowAction({ action: saveTaxonomyAction, success: (_r, c) => c.toasts.taxonomySaved, onSuccess: onSaved });
  const t = copy.taxonomy;
  const select = (name: string, label: string, rows: readonly { id: string; name: string; status?: string }[], value: string | null, error?: string) => (
    <Field
      label={label}
      error={error}
      control={
        <select name={name} defaultValue={value ?? ""} className={SELECT_CLASS}>
          <option value="">{copy.common.none}</option>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
              {row.status && row.status !== "ACTIVE" ? ` (${t.inactive})` : ""}
            </option>
          ))}
        </select>
      }
    />
  );
  return (
    <StepSection heading={t.heading} lead={t.lead}>
      <form key={coffee.revision} onSubmit={(event) => submit(formDataOf(event))} noValidate className="flex flex-col gap-5" data-workflow-form="taxonomy">
        <HiddenFields coffeeId={coffee.id} revision={coffee.revision} />
        <FieldGroup>
          {select("originId", t.origin, options.origins, coffee.originId, fieldMessage(copy, state, "originId") ?? (state && !state.ok && state.code === "ORIGIN_INACTIVE" ? copy.errors.ORIGIN_INACTIVE : undefined))}
          {select("coffeeTypeId", t.coffeeType, options.coffeeTypes, coffee.coffeeTypeId, fieldMessage(copy, state, "coffeeTypeId"))}
          {select("varietyId", t.variety, options.varieties, coffee.varietyId, fieldMessage(copy, state, "varietyId"))}
          {select("processingMethodId", t.processing, options.processingMethods, coffee.processingMethodId, fieldMessage(copy, state, "processingMethodId"))}
          {select("packagingTypeId", t.packaging, options.packagingTypes, coffee.packagingTypeId, fieldMessage(copy, state, "packagingTypeId"))}
        </FieldGroup>
        <WorkflowNotice result={state} requestId={requestId} coffeeId={coffee.id} />
        <FormActionBar className="bg-[var(--surface-card)]">
          <Button type="submit" disabled={pending} data-state={pending ? "loading" : undefined}>
            {pending ? copy.common.saving : copy.common.saveContinue}
          </Button>
        </FormActionBar>
      </form>
    </StepSection>
  );
}

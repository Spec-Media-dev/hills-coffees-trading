"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";

import { useActionToast, type ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/** Every record write returns the row id plus the public tags it revalidated (empty for system configuration). */
export type RecordWriteOutcome = { id: string; revalidatedTags: readonly string[] };

/**
 * Feature 010 RUN E (T021/T022) — the ONE catalogue record form. Each resource page declares its
 * own field list (a per-resource DTO path — this is not a table editor: the Server Action it is
 * given validates through that resource's own zod contract and writes only that resource's
 * columns). Field errors from the server (`fieldErrors[name][0]` = a validation key) render inline
 * on the exact field through the shared `Field` primitive (`aria-invalid` + `aria-describedby`);
 * outcomes surface through Sonner with the copy for the returned code — never raw database text.
 * After a successful CREATE the form navigates to the new record's detail route.
 *
 * Feature 010 RUN F reuses it for the SUPER_ADMIN system-configuration forms (`resource: "system"` +
 * `copyKey`): labels/validation/feedback then resolve from `admin.system.*`, and the `number` /
 * `datetime` field kinds carry the numeric bounds and instants those forms need.
 */

export type RecordFieldOption = { value: string; label: string };

export type RecordField = {
  name: string;
  /** Key into the client-side label dictionary (`admin.catalogue.common` ∪ `warehouses.form` ∪ `warehouses.locations`) — resolved in the viewer's locale. */
  labelKey: string;
  hintKey?: string;
  kind: "text" | "textarea" | "select" | "checkbox" | "number" | "datetime";
  /** Numeric bounds for `number` fields (rendered as HTML attributes only — the server contract decides). */
  min?: number;
  max?: number;
  step?: number | "any";
  defaultValue?: string | boolean | null;
  /** Static options (names are data — single-language by nature). */
  options?: readonly RecordFieldOption[];
  /** Localized status options from the approved vocabularies. */
  statusOptions?: "coffee" | "origin" | "role" | "taxableBase";
  /** For selects: show an empty ("none") option; omitted = the select is required. */
  allowEmpty?: boolean;
  required?: boolean;
  readOnly?: boolean;
  /** Force LTR rendering for codes/slugs inside an RTL page. */
  ltr?: boolean;
  maxLength?: number;
};

export type RecordFormProps = {
  fields: readonly RecordField[];
  hiddenFields: Record<string, string>;
  action: (prev: ActionFeedbackResult<RecordWriteOutcome> | undefined, formData: FormData) => Promise<ActionFeedbackResult<RecordWriteOutcome>>;
  /** Which resource copy block supplies heading/lead (resolved client-side in the viewer's locale). */
  resource: "coffees" | "origins" | "regions" | "taxonomy" | "warehouses" | "locations" | "system";
  /** For `resource: "system"` — the `admin.system.forms` entry that supplies heading/lead. */
  copyKey?: "commissionPolicy" | "commissionTier" | "taxRule" | "shippingRule" | "paymentAccount" | "roleGrant";
  mode: "create" | "edit";
  /**
   * Detail route to navigate to after a successful CREATE, with `{id}` standing for the new record's
   * id — a plain string because a server page cannot hand a function to this client component.
   */
  successHrefTemplate?: string;
  /** `data-record-form` attribute for tests. */
  formKey: string;
};

export function RecordForm({ fields, hiddenFields, action, resource, copyKey, mode, successHrefTemplate, formKey }: RecordFormProps) {
  const { tApp } = useLocale();
  const copy = tApp.admin.catalogue;
  const system = tApp.admin.system;
  const isSystem = resource === "system";
  const formCopy =
    resource === "system"
      ? (system.forms[copyKey ?? "commissionPolicy"] as { createTitle: string; editTitle: string; lead?: string; createLead?: string; editLead?: string })
      : resource === "locations"
        ? { createTitle: copy.warehouses.locations.add, editTitle: copy.warehouses.locations.heading, lead: undefined }
        : (copy[resource].form as { createTitle: string; editTitle: string; lead?: string; createLead?: string; editLead?: string });
  const heading = mode === "create" ? formCopy.createTitle : formCopy.editTitle;
  const lead = mode === "create" ? (formCopy.createLead ?? formCopy.lead) : (formCopy.editLead ?? formCopy.lead);
  const submitLabel = isSystem ? (mode === "create" ? system.common.create : system.common.save) : resource === "locations" ? copy.warehouses.locations.save : mode === "create" ? copy.common.create : copy.common.save;
  const successMessage = isSystem ? system.feedback.saved : mode === "create" && resource === "coffees" ? copy.feedback.created : copy.feedback.saved;
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState(action, undefined);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const baseId = useId();
  const navigated = useRef<object | null>(null);

  const feedbackFor = (result: ActionFeedbackResult<RecordWriteOutcome>): ActionToastFeedback | null => {
    if (result.ok) return { tone: "success", message: successMessage ?? copy.feedback.saved };
    switch (result.code) {
      case ACTION_FEEDBACK.SYSTEM_NOT_CAPABLE:
        return { tone: "error", message: system.feedback.notCapable };
      case ACTION_FEEDBACK.SYSTEM_STALE:
        return { tone: "warning", message: system.feedback.stale };
      case ACTION_FEEDBACK.SYSTEM_NOT_FOUND:
        return { tone: "error", message: system.feedback.notFound };
      case ACTION_FEEDBACK.SYSTEM_DUPLICATE:
        return { tone: "error", message: system.feedback.duplicate };
      case ACTION_FEEDBACK.SYSTEM_REFERENCE_INVALID:
        return { tone: "error", message: system.feedback.referenceInvalid };
      case ACTION_FEEDBACK.SYSTEM_VALUE_INVALID:
        return { tone: "error", message: system.feedback.valueInvalid };
      case ACTION_FEEDBACK.SYSTEM_SAVE_FAILED:
        return { tone: "error", message: system.feedback.failed };
      case ACTION_FEEDBACK.ROLE_SELF_CHANGE_REFUSED:
        return { tone: "error", message: system.feedback.selfChangeRefused };
      case ACTION_FEEDBACK.VALIDATION_ERROR:
        return { tone: "error", message: isSystem ? system.feedback.validationError : copy.feedback.validationError };
      case ACTION_FEEDBACK.CATALOGUE_NOT_CAPABLE:
        return { tone: "error", message: copy.feedback.notCapable };
      case ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED:
        return { tone: "error", message: tApp.feedback.signInRequired };
      case ACTION_FEEDBACK.CATALOGUE_SLUG_TAKEN:
        return { tone: "error", message: copy.feedback.slugTaken };
      case ACTION_FEEDBACK.CATALOGUE_REFERENCE_INVALID:
        return { tone: "error", message: copy.feedback.referenceInvalid };
      case ACTION_FEEDBACK.CATALOGUE_STATUS_INVALID:
        return { tone: "error", message: copy.feedback.statusInvalid };
      case ACTION_FEEDBACK.CATALOGUE_STALE:
        return { tone: "warning", message: copy.feedback.stale };
      case ACTION_FEEDBACK.CATALOGUE_NOT_FOUND:
        return { tone: "error", message: copy.feedback.notFound };
      default:
        return { tone: "error", message: copy.feedback.failed };
    }
  };
  useActionToast(state, state ? feedbackFor(state) : null);

  useEffect(() => {
    if (state?.ok && successHrefTemplate && navigated.current !== state) {
      navigated.current = state;
      router.push(successHrefTemplate.replace("{id}", encodeURIComponent(state.data.id)));
    }
  }, [state, successHrefTemplate, router]);

  const serverErrors = state?.ok === false && state.code === ACTION_FEEDBACK.VALIDATION_ERROR ? (state.fieldErrors ?? {}) : {};
  const validationCopy = (isSystem ? system.validation : copy.common.validation) as Record<string, string>;
  const labels: Record<string, string> = isSystem
    ? { ...(system.common as unknown as Record<string, string>), ...(system.fields as unknown as Record<string, string>) }
    : { ...(copy.common as unknown as Record<string, string>), ...(copy.warehouses.form as unknown as Record<string, string>), ...(copy.warehouses.locations as unknown as Record<string, string>) };
  const labelOf = (key: string) => labels[key] ?? key;
  const optionsOf = (field: RecordField): readonly RecordFieldOption[] => {
    if (field.statusOptions === "coffee") return Object.entries(copy.statuses.coffee).map(([value, label]) => ({ value, label }));
    if (field.statusOptions === "origin") return Object.entries(copy.statuses.origin).map(([value, label]) => ({ value, label }));
    if (field.statusOptions === "role") return Object.entries(system.roles.roleLabels).map(([value, label]) => ({ value, label }));
    if (field.statusOptions === "taxableBase") return Object.entries(system.tax.taxableBases).map(([value, label]) => ({ value, label }));
    return field.options ?? [];
  };
  const errorFor = (field: RecordField): string | undefined => {
    if (clientErrors[field.name]) return clientErrors[field.name];
    const key = serverErrors[field.name]?.[0];
    if (!key) return undefined;
    return validationCopy[key] ?? copy.feedback.validationError;
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      if (field.readOnly || !field.required) continue;
      const value = formData.get(field.name);
      if (typeof value !== "string" || value.trim().length === 0) nextErrors[field.name] = field.kind === "select" ? validationCopy.INVALID_REFERENCE! : field.kind === "datetime" ? (validationCopy.DATE_REQUIRED ?? validationCopy.NAME_REQUIRED!) : field.kind === "number" ? (validationCopy.QUANTITY_INVALID ?? validationCopy.NAME_REQUIRED!) : validationCopy.NAME_REQUIRED!;
    }
    setClientErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    for (const [key, value] of Object.entries(hiddenFields)) formData.set(key, value);
    startTransition(() => {
      dispatch(formData);
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-record-form={formKey}>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{heading}</h2>
        {lead ? <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{lead}</p> : null}
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FieldGroup className="md:grid-cols-2">
          {fields.map((field) => {
            const id = `${baseId}-${field.name}`;
            const error = errorFor(field);
            const label = (
              <>
                {labelOf(field.labelKey)}
                {field.required ? (
                  <span aria-hidden="true" className="text-[length:var(--text-micro)] text-[var(--status-danger)]">
                    {" "}
                    *
                  </span>
                ) : null}
              </>
            );
            if (field.kind === "checkbox") {
              return (
                <div key={field.name} className="flex items-start gap-3 md:col-span-2">
                  <input id={id} name={field.name} type="checkbox" defaultChecked={field.defaultValue === true} disabled={field.readOnly} className="mt-1 size-5 rounded-[var(--radius-xs)] border border-input accent-[var(--forest-500)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" />
                  <label htmlFor={id} className="flex flex-col gap-0.5 text-[length:var(--text-small)] text-foreground">
                    <span className="font-medium">{labelOf(field.labelKey)}</span>
                    {field.hintKey ? <span className="text-[length:var(--text-micro)] text-muted-foreground">{labelOf(field.hintKey)}</span> : null}
                  </label>
                </div>
              );
            }
            const control =
              field.kind === "textarea" ? (
                <Textarea id={id} name={field.name} defaultValue={typeof field.defaultValue === "string" ? field.defaultValue : ""} rows={4} maxLength={field.maxLength} readOnly={field.readOnly} required={field.required} dir={field.ltr ? "ltr" : undefined} />
              ) : field.kind === "select" ? (
                <select id={id} name={field.name} defaultValue={typeof field.defaultValue === "string" ? field.defaultValue : ""} disabled={field.readOnly} required={field.required} className="h-11 w-full rounded-[var(--radius-sm)] border border-input bg-[var(--surface-card)] px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] md:text-sm dark:bg-input/30">
                  {field.allowEmpty ? <option value="">{copy.common.none}</option> : null}
                  {optionsOf(field).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.kind === "number" ? (
                <Input id={id} name={field.name} type="number" inputMode="decimal" min={field.min} max={field.max} step={field.step ?? "any"} defaultValue={typeof field.defaultValue === "string" ? field.defaultValue : ""} readOnly={field.readOnly} required={field.required} dir="ltr" className="font-mono" />
              ) : field.kind === "datetime" ? (
                <Input id={id} name={field.name} type="datetime-local" defaultValue={typeof field.defaultValue === "string" ? field.defaultValue : ""} readOnly={field.readOnly} required={field.required} dir="ltr" className="font-mono" />
              ) : (
                <Input id={id} name={field.name} defaultValue={typeof field.defaultValue === "string" ? field.defaultValue : ""} maxLength={field.maxLength} readOnly={field.readOnly} required={field.required} dir={field.ltr ? "ltr" : undefined} className={field.ltr ? "font-mono" : undefined} />
              );
            return (
              <Field key={field.name} id={id} label={label} hint={field.hintKey ? labelOf(field.hintKey) : undefined} error={error} className={field.kind === "textarea" ? "md:col-span-2" : undefined} control={control} />
            );
          })}
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isPending} variant="primary">
            {isPending ? copy.common.saving : submitLabel}
          </Button>
          <p className="text-[length:var(--text-micro)] text-muted-foreground">{isSystem ? system.common.futureOnlyTitle : copy.common.publicNote}</p>
        </div>
      </form>
    </section>
  );
}

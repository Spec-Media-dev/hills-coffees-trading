"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ArabicTranslation } from "@/lib/admin/catalogue";
import type { TranslationKind } from "@/lib/admin/catalogue-validation";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { saveCatalogueArabic } from "@/src/app/dashboard-admin/(catalogue)/actions";

/**
 * Hardening run — the Arabic half of a catalogue record. The record form above it edits the ENGLISH
 * (canonical) base columns; this panel edits the separate `locale = 'ar'` translation row. The two
 * never share a field, so neither the admin UI's own language nor saving one form can overwrite the
 * other language. Arabic inputs are `lang="ar" dir="rtl"` in every admin locale.
 *
 * `initial === "unavailable"` means the translation store could not be read (migration not applied
 * yet) — the panel states that and disables saving instead of pretending.
 */
export function ArabicContentPanel({
  kind,
  entityId,
  hasDescription,
  initial,
  returnPath,
}: {
  kind: TranslationKind;
  entityId: string;
  hasDescription: boolean;
  initial: ArabicTranslation | null | "unavailable";
  returnPath: string;
}) {
  const { tApp } = useLocale();
  const copy = tApp.admin.catalogue.arabic;
  const [state, dispatch, isPending] = useActionState(saveCatalogueArabic, undefined);
  const unavailable = initial === "unavailable";
  const rootRef = useRef<HTMLElement>(null);
  const announced = useRef<object | null>(null);
  useEffect(() => {
    if (state?.ok && announced.current !== state) {
      announced.current = state;
      rootRef.current?.dispatchEvent(new CustomEvent("hc:content-saved", { bubbles: true }));
    }
  }, [state]);
  const values = initial && initial !== "unavailable" ? initial : { name: "", description: "" };

  useActionToast(
    state,
    state?.ok === true
      ? { tone: "success", message: copy.saved }
      : state?.ok === false && state.code !== ACTION_FEEDBACK.VALIDATION_ERROR
        ? { tone: "error", message: state.code === ACTION_FEEDBACK.CATALOGUE_NOT_CAPABLE ? tApp.admin.catalogue.feedback.notCapable : copy.failed }
        : null
  );

  const fieldError = (key: "name" | "description") => {
    if (state?.ok !== false || state.code !== ACTION_FEEDBACK.VALIDATION_ERROR) return undefined;
    const errors = state.fieldErrors?.[key];
    if (!errors || errors.length === 0) return undefined;
    return errors.includes("NAME_REQUIRED") ? copy.nameRequired : copy.tooLong;
  };

  return (
    <section ref={rootRef} className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-arabic-panel={kind} data-arabic-state={unavailable ? "unavailable" : initial ? "saved" : "empty"}>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          {copy.heading} <span lang="ar" dir="rtl" className="text-muted-foreground">· العربية</span>
        </h2>
        <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{copy.lead}</p>
        <p className="text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground">{copy.fallbackNote}</p>
      </div>

      {unavailable ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] text-muted-foreground" data-arabic-unavailable>
          {copy.unavailable}
        </p>
      ) : null}

      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          formData.set("kind", kind);
          formData.set("entityId", entityId);
          formData.set("returnPath", returnPath);
          startTransition(() => dispatch(formData));
        }}
      >
        <Field
          label={
            <>
              {copy.nameLabel} <span lang="ar" dir="rtl">(الاسم)</span>
            </>
          }
          control={<Input name="name" lang="ar" dir="rtl" defaultValue={values.name} maxLength={200} disabled={unavailable} className="text-start" />}
          error={fieldError("name")}
        />
        {hasDescription ? (
          <Field
            label={
              <>
                {copy.descriptionLabel} <span lang="ar" dir="rtl">(الوصف)</span>
              </>
            }
            control={<Textarea name="description" lang="ar" dir="rtl" rows={5} defaultValue={values.description} maxLength={4000} disabled={unavailable} className="text-start" />}
            error={fieldError("description")}
          />
        ) : null}
        <p className="text-[length:var(--text-micro)] text-muted-foreground">{copy.clearHint}</p>
        <FormActionBar className="static justify-start bg-transparent backdrop-blur-none">
          <Button type="submit" disabled={isPending || unavailable}>
            {isPending ? copy.saving : copy.save}
          </Button>
        </FormActionBar>
      </form>
    </section>
  );
}

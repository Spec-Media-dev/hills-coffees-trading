"use client";

import { startTransition, useActionState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { AppCopy } from "@/lib/app/copy";
import { DISPUTE_TEXT_MAX, DisputeEvidenceNoteInput, isDisputeFieldErrorKey } from "@/lib/disputes/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { addEvidenceNoteAction } from "@/src/app/dashboard/disputes/actions";

type EvidenceCopy = AppCopy["disputes"]["evidence"];

function feedbackMessage(copy: EvidenceCopy, result: ActionFeedbackResult<{ id: string }> | undefined): string | null {
  if (!result || result.ok) return null;
  switch (result.code) {
    case ACTION_FEEDBACK.VALIDATION_ERROR:
      return copy.feedback.validation;
    case ACTION_FEEDBACK.DISPUTE_NOT_FOUND:
      return copy.feedback.notFound;
    case ACTION_FEEDBACK.DISPUTE_NOT_CAPABLE:
      return copy.feedback.notCapable;
    default:
      return copy.feedback.failed;
  }
}

/**
 * Feature 012 RUN B (T008) — the ONLY evidence input: one plain-text note. There is no file input,
 * disabled or otherwise (DB-BLOCK-01 — see `EvidenceFilesNotice`). Inline errors are keyed messages
 * in the page language, associated with the textarea by `Field`.
 */
export function EvidenceNoteForm({ disputeId }: { disputeId: string }) {
  const { tApp } = useLocale();
  const copy = tApp.disputes.evidence;
  const [state, dispatch, isPending] = useActionState(addEvidenceNoteAction, undefined);
  const errorMessage = feedbackMessage(copy, state);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.added } : errorMessage ? { tone: "error", message: errorMessage } : null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof DisputeEvidenceNoteInput>, unknown, DisputeEvidenceNoteInput>({
    resolver: zodResolver(DisputeEvidenceNoteInput),
    defaultValues: { disputeId, note: "" },
  });

  useEffect(() => {
    if (state?.ok === true) reset({ disputeId, note: "" });
  }, [disputeId, reset, state]);

  const serverNoteError = state && !state.ok ? state.fieldErrors?.note?.[0] : undefined;
  const rawError = errors.note?.message ?? serverNoteError;
  const noteError = rawError ? (isDisputeFieldErrorKey(rawError) ? tApp.disputes.raise.errors[rawError] : copy.feedback.validation) : undefined;

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("disputeId", disputeId);
    formData.set("note", data.note);
    startTransition(() => {
      dispatch(formData);
    });
  });

  return (
    <form onSubmit={onValid} noValidate data-slot="evidence-note-form" className="flex flex-col gap-4">
      <input type="hidden" {...register("disputeId")} />
      <Field label={copy.noteLabel} hint={copy.noteHint} control={<Textarea rows={4} maxLength={DISPUTE_TEXT_MAX} {...register("note")} />} error={noteError} />
      <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? copy.submitting : copy.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

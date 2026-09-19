"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FormActionBar } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { DISPUTE_TEXT_MAX, RaiseDisputeInput, isDisputeFieldErrorKey } from "@/lib/disputes/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import type { AppCopy } from "@/lib/app/copy";
import { raiseDisputeAction } from "@/src/app/dashboard/disputes/actions";

export type RaisableOrder = { id: string; orderCode: string; status: string };

type RaiseCopy = AppCopy["disputes"]["raise"];

/** Validation issues carry a stable key (`lib/disputes/validation.ts`); unknown text never renders. */
function fieldMessage(copy: RaiseCopy, message: string | undefined): string | undefined {
  if (!message) return undefined;
  return isDisputeFieldErrorKey(message) ? copy.errors[message] : copy.feedback.validation;
}

function feedbackMessage(copy: RaiseCopy, result: ActionFeedbackResult<{ id: string }> | undefined): string | null {
  if (!result || result.ok) return null;
  switch (result.code) {
    case ACTION_FEEDBACK.VALIDATION_ERROR:
      return copy.feedback.validation;
    case ACTION_FEEDBACK.ORDER_NOT_FOUND:
      return copy.feedback.orderNotFound;
    case ACTION_FEEDBACK.DISPUTE_NOT_CAPABLE:
      return copy.feedback.notCapable;
    default:
      return copy.feedback.failed;
  }
}

/**
 * Feature 012 RUN A (T006) — the raise-dispute form. Exactly two fields (order, description); the
 * status, organization and user are never form fields. Inline errors are associated with their
 * control by `Field` (`aria-describedby` + `aria-invalid`); a server refusal is announced once as a
 * toast in the page language, never as raw database text. On success the member lands on the new
 * dispute's own tracking page.
 */
export function RaiseDisputeForm({ orders, defaultOrderId }: { orders: readonly RaisableOrder[]; defaultOrderId?: string }) {
  const { tApp } = useLocale();
  const copy = tApp.disputes.raise;
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState(raiseDisputeAction, undefined);

  const errorMessage = feedbackMessage(copy, state);
  useActionToast(state, state?.ok === true ? { tone: "success", message: copy.raised } : errorMessage ? { tone: "error", message: errorMessage } : null);

  useEffect(() => {
    if (state?.ok === true) router.push(`/dashboard/disputes/${state.data.id}`);
  }, [router, state]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof RaiseDisputeInput>, unknown, RaiseDisputeInput>({
    resolver: zodResolver(RaiseDisputeInput),
    defaultValues: { orderId: defaultOrderId ?? "", reason: "" },
  });

  const serverFieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const orderError = fieldMessage(copy, errors.orderId?.message ?? serverFieldErrors?.orderId?.[0]);
  const reasonError = fieldMessage(copy, errors.reason?.message ?? serverFieldErrors?.reason?.[0]);

  const onValid = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("orderId", data.orderId);
    formData.set("reason", data.reason);
    startTransition(() => {
      dispatch(formData);
    });
  });

  const orderStatusLabel = (status: string) => (tApp.orders.status as Record<string, string | undefined>)[status] ?? status;

  return (
    <form onSubmit={onValid} noValidate className="flex flex-col gap-5" aria-describedby="raise-dispute-description">
      <p id="raise-dispute-description" className="text-[length:var(--text-small)] text-muted-foreground">
        {copy.description}
      </p>
      <Field
        label={copy.orderLabel}
        control={
          <select className="h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] aria-invalid:border-destructive" {...register("orderId")}>
            <option value="">{copy.orderPlaceholder}</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderCode} — {orderStatusLabel(order.status)}
              </option>
            ))}
          </select>
        }
        error={orderError}
      />
      <Field label={copy.reasonLabel} hint={copy.reasonHint} control={<Textarea rows={5} maxLength={DISPUTE_TEXT_MAX} {...register("reason")} />} error={reasonError} />
      <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" disabled={isPending || state?.ok === true}>
          {isPending ? copy.submitting : copy.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

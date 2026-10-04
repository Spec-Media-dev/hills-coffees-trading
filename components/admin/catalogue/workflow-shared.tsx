"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useActionToast, type ActionToastFeedback } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { WorkflowFailure, WorkflowRecovery, WorkflowResult } from "@/lib/admin/catalogue";
import { recoverOperationAction } from "@/src/app/dashboard-admin/(catalogue)/coffees/workflow-actions";

/**
 * Feature 018 — shared client plumbing for the Coffee workflow steps.
 *
 * - ONE stable `requestId` per user intent. It is reused for retries (so an uncertain outcome can never duplicate a
 *   write) and rotated only after a committed success or a payload conflict.
 * - Results are plain unions from the Server Actions. Success → a localized toast, a server re-read (`router.refresh`),
 *   a fresh intent key. Failure → a classified message (never raw database text), inline field errors, and the
 *   operator's input stays in the form because the form is uncontrolled and is not remounted on failure.
 * - Toasts are emitted once per result object (`useActionToast`), so retries and rerenders cannot spam.
 */

export type WorkflowCopy = ReturnType<typeof useWorkflowCopy>;

export function useWorkflowCopy() {
  const { tApp } = useLocale();
  return tApp.admin.catalogue.workflow;
}

export function newIntentKey(): string {
  return globalThis.crypto.randomUUID();
}

export function useIntentKey(): { key: string; rotate: () => void } {
  const [key, setKey] = useState<string>(() => newIntentKey());
  const rotate = useCallback(() => setKey(newIntentKey()), []);
  return { key, rotate };
}

type Failure = WorkflowFailure;
const isFailure = (result: { ok: boolean }): result is Failure => !result.ok;

export function failureMessage(copy: WorkflowCopy, failure: Failure): string {
  return copy.errors[failure.code] ?? copy.errors.SAVE_FAILED;
}

/** Inline, accessible per-field message from a classified validation failure. */
export function fieldMessage(copy: WorkflowCopy, result: { ok: boolean } | undefined, ...names: string[]): string | undefined {
  if (!result || !isFailure(result) || !result.fieldErrors) return undefined;
  for (const name of names) {
    const first = result.fieldErrors[name]?.[0];
    if (first) return (copy.validation as Record<string, string>)[first] ?? copy.validation.INVALID;
  }
  return undefined;
}

type UseWorkflowActionOptions<R extends { ok: boolean }> = {
  action: (previous: R | undefined, formData: FormData) => Promise<R>;
  /** Localized success message; `null` stays silent. */
  success: (result: Extract<R, { ok: true }>, copy: WorkflowCopy) => string | null;
  /** Called after a committed success, before the server re-read. */
  onSuccess?: (result: Extract<R, { ok: true }>) => void;
};

/**
 * Binds a workflow Server Action to a form: returns the dispatcher, the last result, the pending flag and the intent key
 * to put in the hidden `requestId` field.
 */
export function useWorkflowAction<R extends { ok: boolean }>({ action, success, onSuccess }: UseWorkflowActionOptions<R>) {
  const copy = useWorkflowCopy();
  const router = useRouter();
  const intent = useIntentKey();
  const [state, dispatch, pending] = useActionState<R | undefined, FormData>(action, undefined);

  const feedback: ActionToastFeedback | null = !state
    ? null
    : state.ok
      ? (() => {
          const message = success(state as Extract<R, { ok: true }>, copy);
          return message ? { tone: "success", message } : null;
        })()
      : failureToast(copy, state as unknown as Failure, () => router.refresh());
  useActionToast(state, feedback);

  const handled = useRef<object | undefined>(undefined);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      onSuccess?.(state as Extract<R, { ok: true }>);
      intent.rotate();
      router.refresh();
    } else if ((state as unknown as Failure).code === "REQUEST_CONFLICT") {
      intent.rotate();
    }
  }, [state, onSuccess, intent, router]);

  const submit = useCallback(
    (formData: FormData) => {
      formData.set("requestId", intent.key);
      startTransition(() => dispatch(formData));
    },
    [dispatch, intent.key],
  );

  return { state, pending, submit, requestId: intent.key, copy };
}

function failureToast(copy: WorkflowCopy, failure: Failure, reload: () => void): ActionToastFeedback {
  const message = failureMessage(copy, failure);
  if (failure.code === "REVISION_CONFLICT") return { tone: "warning", message, action: { label: copy.conflict.action, onClick: reload } };
  if (failure.code === "OUTCOME_UNKNOWN") return { tone: "warning", message };
  return { tone: "error", message };
}

/**
 * The inline recovery surface for a failed step: a stale revision offers the latest version; an uncertain outcome offers
 * to check the ORIGINAL intent (never re-sending the payload). Rendered under the form so the input stays visible.
 */
export function WorkflowNotice({ result, requestId, coffeeId }: { result: WorkflowResult<unknown> | undefined; requestId: string; coffeeId?: string }): ReactNode {
  const copy = useWorkflowCopy();
  const router = useRouter();
  const [recovery, setRecovery] = useState<{ ok: true; recovery: WorkflowRecovery } | WorkflowFailure | undefined>();
  const [checking, setChecking] = useState(false);
  // The notice belongs to one failed result; a new result clears any previous recovery verdict.
  const lastResult = useRef(result);
  useEffect(() => {
    if (lastResult.current !== result) {
      lastResult.current = result;
      setRecovery(undefined);
    }
  }, [result]);

  if (!result || result.ok) return null;

  if (result.code === "REVISION_CONFLICT") {
    return (
      <InlineAlert tone="warning" title={copy.conflict.title} data-workflow-notice="conflict">
        <p>{copy.conflict.body}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => router.refresh()}>
          {copy.conflict.action}
        </Button>
      </InlineAlert>
    );
  }

  if (result.code === "OUTCOME_UNKNOWN") {
    const verdict = recovery && recovery.ok ? recovery.recovery.status : null;
    return (
      <InlineAlert tone="warning" title={copy.unknown.title} data-workflow-notice="unknown">
        <p>{verdict === "COMMITTED" ? copy.toasts.recoveredCommitted : verdict === "NOT_COMMITTED" ? copy.toasts.recoveredNotCommitted : copy.unknown.body}</p>
        {verdict === null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={checking}
            onClick={() => {
              setChecking(true);
              const form = new FormData();
              form.set("requestId", requestId);
              if (coffeeId) form.set("coffeeId", coffeeId);
              void recoverOperationAction(undefined, form)
                .then((next) => {
                  setRecovery(next);
                  if (next.ok && next.recovery.status === "COMMITTED") router.refresh();
                })
                .catch(() => setRecovery({ ok: false, code: "OUTCOME_UNKNOWN" }))
                .finally(() => setChecking(false));
            }}
          >
            {checking ? copy.unknown.checking : copy.unknown.check}
          </Button>
        ) : null}
      </InlineAlert>
    );
  }

  if (result.code === "VALIDATION") return null; // shown inline per field
  return (
    <InlineAlert tone="danger" title={failureMessage(copy, result)} data-workflow-notice={result.code}>
      {result.code === "NOT_READY" && result.missing?.length ? (
        <ul className="mt-1 list-disc ps-5">
          {result.missing.map((item) => (
            <li key={item}>{(copy.readiness.items as Record<string, string>)[item] ?? item}</li>
          ))}
        </ul>
      ) : null}
    </InlineAlert>
  );
}

/** One step's frame: heading, lead and body in the Hills panel language (token surfaces; works in light, dark, LTR and RTL). */
export function StepSection({ heading, lead, children, id }: { heading: ReactNode; lead?: ReactNode; children: ReactNode; id?: string }): ReactNode {
  return (
    <section id={id} className="flex min-w-0 flex-col gap-5 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 md:p-6">
      <header className="flex flex-col gap-1.5">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">{heading}</h2>
        {lead ? <p className="max-w-[68ch] text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Direction-isolated technical value (codes, ids, USD/kg) so it stays readable inside Arabic text. */
export function Ltr({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <bdi dir="ltr" className={className ? `font-mono ${className}` : "font-mono"}>
      {children}
    </bdi>
  );
}

/** Lowercase, hyphenated public address from a free-form name (matches the server's slug shape). */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{ASCII}]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

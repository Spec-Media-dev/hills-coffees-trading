"use client";

import { startTransition, useActionState, useState } from "react";

import { useActionToast } from "@/components/app/use-action-toast";
import { useLocale } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/field";
import {
  NOTIFICATION_PREFERENCE_CHANNELS,
  NOTIFICATION_PREFERENCE_TYPES,
  preferenceFieldName,
  type NotificationPreferenceCell,
} from "@/lib/notifications/types";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";
import { saveNotificationPreferencesAction } from "@/src/app/dashboard/notifications/preferences/actions";

/**
 * Feature 012 RUN B (T011) — own-user preference form: one fieldset per notification type (legend =
 * the type, description associated), one labelled native checkbox per approved channel. All twelve
 * cells are always submitted as explicit booleans. No delivery claim is made here — the page's
 * honesty note states that nothing is sent yet (DB-BLOCK-04).
 */
export function NotificationPreferencesForm({ cells }: { cells: readonly NotificationPreferenceCell[] }) {
  const { tApp } = useLocale();
  const copy = tApp.notificationPreferences;
  const [values, setValues] = useState<Record<string, boolean>>(() => Object.fromEntries(cells.map((cell) => [preferenceFieldName(cell.type, cell.channel), cell.enabled])));
  const [state, dispatch, isPending] = useActionState(saveNotificationPreferencesAction, undefined);

  const message =
    state?.ok === true
      ? copy.saved
      : state?.ok === false
        ? state.code === ACTION_FEEDBACK.VALIDATION_ERROR
          ? copy.validation
          : state.code === ACTION_FEEDBACK.NOTIFICATION_PREFERENCES_NOT_CAPABLE
            ? copy.notCapable
            : copy.failed
        : null;
  useActionToast(state, state ? { tone: state.ok ? "success" : "error", message: message ?? copy.failed } : null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value ? "true" : "false");
    startTransition(() => {
      dispatch(formData);
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate data-slot="notification-preferences-form" className="flex flex-col gap-5">
      {NOTIFICATION_PREFERENCE_TYPES.map((type) => {
        const descriptionId = `pref-${type}-description`;
        return (
          <fieldset key={type} aria-describedby={descriptionId} className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-foreground">{copy.types[type].label}</legend>
            <p id={descriptionId} className="text-[length:var(--text-small)] text-muted-foreground">
              {copy.types[type].description}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {NOTIFICATION_PREFERENCE_CHANNELS.map((channel) => {
                const name = preferenceFieldName(type, channel);
                const id = `pref-${name}`;
                return (
                  <label key={channel} htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      id={id}
                      name={name}
                      type="checkbox"
                      className="size-5 accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                      checked={values[name] ?? false}
                      onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.checked }))}
                    />
                    {copy.channels[channel]}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <FormActionBar className="static bg-transparent px-0 backdrop-blur-none">
        <Button type="submit" disabled={isPending}>
          {isPending ? copy.submitting : copy.submit}
        </Button>
      </FormActionBar>
    </form>
  );
}

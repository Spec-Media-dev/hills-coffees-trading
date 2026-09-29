"use client";

import { useState, useTransition } from "react";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { useLocale } from "@/components/locale/locale-provider";
import { Icon } from "@/components/ui/icon";
import { markAllNotificationsReadAction } from "@/src/app/dashboard/notifications/actions";

export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const { tApp } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (unreadCount <= 0) return null;

  return (
    <div className="flex flex-col gap-1">
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          setError(!result.ok);
        });
      }}
      data-slot="mark-all-read-button"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-[color-mix(in_srgb,transparent,var(--forest-700)_8%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name="check" className="size-4" />
      <span>
        {isPending ? (
          <AppBilingual pick={(c) => c.notificationCenter.markingAsRead} />
        ) : (
          <AppBilingual pick={(c) => c.notificationCenter.markAllAsRead} />
        )}
      </span>
    </button>
    {error ? <p role="alert" className="text-xs text-destructive">{tApp.notificationCenter.actionFailed}</p> : null}
    </div>
  );
}

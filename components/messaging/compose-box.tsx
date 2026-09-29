"use client";

import { useState, useTransition } from "react";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { useLocale } from "@/components/locale/locale-provider";
import { Icon } from "@/components/ui/icon";
import { sendSupportMessageAction } from "@/src/app/dashboard/messages/actions";

export function ComposeBox({
  ticketId,
  isClosed,
}: {
  ticketId: string;
  isClosed: boolean;
}) {
  const { tApp } = useLocale();
  const [body, setBody] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isClosed) {
    return (
      <div
        data-slot="ticket-closed-notice"
        className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] p-4 text-center text-sm text-muted-foreground"
      >
        <AppBilingual pick={(c) => c.supportMessaging.ticketClosedNotice} />
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await sendSupportMessageAction({
        ticketId,
        body: body.trim(),
      });

      if (!res.ok) {
        setErrorMsg(res.error === "TICKET_CLOSED" ? tApp.supportMessaging.ticketClosedNotice : "Failed to send message. Please try again.");
      } else {
        setBody("");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} data-slot="message-compose-form" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm">
      <label htmlFor="reply-body" className="text-sm font-semibold text-foreground">
        <AppBilingual pick={(c) => c.supportMessaging.reply} />
      </label>

      <textarea
        id="reply-body"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={tApp.supportMessaging.replyPlaceholder}
        disabled={isPending}
        maxLength={4000}
        className="w-full resize-y rounded-[var(--radius-md)] border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
      />

      {errorMsg && (
        <p className="text-xs font-medium text-destructive">{errorMsg}</p>
      )}

      <div className="flex items-center justify-between gap-4 pt-1">
        <span className="text-xs text-muted-foreground">
          {body.length} / 4000
        </span>

        <button
          type="submit"
          disabled={isPending || !body.trim()}
          data-slot="send-reply-button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--brand-primary),black_10%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="check" className="size-4" />
          <span>
            {isPending ? (
              <AppBilingual pick={(c) => c.supportMessaging.sendingReply} />
            ) : (
              <AppBilingual pick={(c) => c.supportMessaging.sendReply} />
            )}
          </span>
        </button>
      </div>
    </form>
  );
}

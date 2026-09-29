"use client";

import { useState, useTransition } from "react";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { useLocale } from "@/components/locale/locale-provider";
import { MessageThread } from "@/components/messaging/message-thread";
import { TicketStatusPill } from "@/components/messaging/ticket-status-pill";
import { Icon } from "@/components/ui/icon";
import type { SupportTicketDetailDTO, SupportTicketStatus } from "@/lib/messaging/types";
import {
  adminSendSupportReplyAction,
  adminUpdateTicketStatusAction,
} from "@/src/app/dashboard-admin/(system)/messages/actions";

export function AdminThreadView({ ticket }: { ticket: SupportTicketDetailDTO }) {
  const { tApp } = useLocale();
  const [replyBody, setReplyBody] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (newStatus: SupportTicketStatus) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await adminUpdateTicketStatusAction({
        ticketId: ticket.id,
        status: newStatus,
      });
      if (!res.ok) {
        setErrorMsg(tApp.supportMessaging.errors.updateFailed);
      }
    });
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await adminSendSupportReplyAction({
        ticketId: ticket.id,
        body: replyBody.trim(),
      });
      if (!res.ok) {
        setErrorMsg(res.error === "VALIDATION_FAILED" ? tApp.supportMessaging.errors.reopenFirst : tApp.supportMessaging.errors.replyFailed);
      } else {
        setReplyBody("");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Ticket Meta & Status Controls Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-xs">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span dir="ltr" className="font-mono text-lg font-bold text-foreground">
              {ticket.ticketCode}
            </span>
            <TicketStatusPill status={ticket.status} />
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              <AppBilingual pick={(c) => c.supportMessaging.priorities[ticket.priority]} />
            </span>
            {ticket.orderCodeSnapshot && (
              <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                <AppBilingual pick={(c) => c.supportMessaging.orderReference} />: {ticket.orderCodeSnapshot}
              </span>
            )}
          </div>
          <p className="break-words text-sm font-semibold text-foreground">{ticket.subject}</p>
          <div className="text-xs text-muted-foreground">
            <AdminDateTime value={ticket.createdAt} fallback="—" />
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {ticket.status !== "RESOLVED" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleStatusChange("RESOLVED")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--success)]/40 bg-[var(--success-surface)] px-3 py-1 text-xs font-semibold text-[var(--success)] hover:bg-[var(--success-surface)]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50"
            >
              <Icon name="badge-check" className="size-3.5" />
              <AppBilingual pick={(c) => c.supportMessaging.markResolved} />
            </button>
          )}

          {ticket.status !== "CLOSED" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleStatusChange("CLOSED")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50"
            >
              <Icon name="circle-x" className="size-3.5" />
              <AppBilingual pick={(c) => c.supportMessaging.closeTicket} />
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleStatusChange("IN_PROGRESS")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--warning)]/40 bg-[var(--warning-surface)] px-3 py-1 text-xs font-semibold text-[var(--warning)] hover:bg-[var(--warning-surface)]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50"
            >
              <Icon name="clock" className="size-3.5" />
              <AppBilingual pick={(c) => c.supportMessaging.reopenTicket} />
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          {errorMsg}
        </div>
      )}

      {/* Conversation Thread */}
      <section aria-labelledby="thread-heading" className="flex flex-col gap-4">
        <h2 id="thread-heading" className="text-sm font-semibold text-foreground">
          <AppBilingual pick={(c) => c.supportMessaging.conversationHistory} />
        </h2>
        <MessageThread messages={ticket.messages} />
      </section>

      {/* Staff Reply Composer */}
      {ticket.status === "CLOSED" ? (
        <p className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] p-4 text-sm text-muted-foreground">
          <AppBilingual pick={(c) => c.supportMessaging.ticketClosedNotice} />
        </p>
      ) : (
      <form onSubmit={handleSendReply} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-xs">
        <label htmlFor="staff-reply" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <AppBilingual pick={(c) => c.supportMessaging.postStaffReply} />
        </label>
        <textarea
          id="staff-reply"
          rows={3}
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder={tApp.supportMessaging.staffReplyPlaceholder}
          disabled={isPending}
          maxLength={4000}
          className="w-full resize-y rounded-[var(--radius-md)] border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {replyBody.length} / 4000
          </span>
          <button
            type="submit"
            disabled={isPending || !replyBody.trim()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--brand-primary)] px-4 text-xs font-semibold text-white hover:bg-[color-mix(in_srgb,var(--brand-primary),black_10%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50"
          >
            <Icon name="check" className="size-4" />
            <span>
              <AppBilingual
                pick={(c) =>
                  isPending
                    ? c.supportMessaging.sendingStaffReply
                    : c.supportMessaging.sendStaffReply
                }
              />
            </span>
          </button>
        </div>
      </form>
      )}
    </div>
  );
}

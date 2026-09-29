"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { useLocale } from "@/components/locale/locale-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import type { SupportTicketPriority } from "@/lib/messaging/types";
import { createSupportTicketAction } from "@/src/app/dashboard/messages/actions";

export function NewTicketModal({
  initialOrderId,
  initialOrderCode,
  initialOpen = false,
}: {
  initialOrderId?: string;
  initialOrderCode?: string;
  initialOpen?: boolean;
}) {
  const { tApp } = useLocale();
  const [open, setOpen] = useState(initialOpen);
  const [subject, setSubject] = useState(
    initialOrderCode ? `Inquiry regarding order ${initialOrderCode}` : ""
  );
  const [priority, setPriority] = useState<SupportTicketPriority>("NORMAL");
  const [initialMessage, setInitialMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<{
    ticketId: string;
    ticketCode: string;
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset after close
      setCreatedTicket(null);
      setErrorMessage(null);
      if (!initialOrderCode) {
        setSubject("");
        setInitialMessage("");
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !initialMessage.trim()) {
      setErrorMessage("Please complete all required fields.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await createSupportTicketAction({
        subject: subject.trim(),
        initialMessage: initialMessage.trim(),
        priority,
        orderId: initialOrderId ?? null,
      });

      if (!res.ok) {
        setErrorMessage(res.message || "Failed to create ticket. Please try again.");
      } else {
        setCreatedTicket({
          ticketId: res.ticketId,
          ticketCode: res.ticketCode,
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        data-slot="new-inquiry-trigger"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--brand-primary),black_10%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <Icon name="plus" className="size-4" />
        <AppBilingual pick={(c) => c.supportMessaging.newInquiry} />
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        {createdTicket ? (
          <div data-slot="ticket-created-success" className="flex flex-col gap-4 py-2">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--success-surface)] text-[var(--success)]">
              <Icon name="badge-check" className="size-6" />
            </div>

            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                <AppBilingual pick={(c) => c.supportMessaging.title} />
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                <AppBilingual
                  pick={(c) =>
                    c.supportMessaging.ticketCreatedSuccess.replace("{code}", createdTicket.ticketCode)
                  }
                />
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-muted/40 p-4">
              <span className="text-xs text-muted-foreground">
                <AppBilingual pick={(c) => c.supportMessaging.ticketReference} />:
              </span>
              <p dir="ltr" className="mt-1 font-mono text-lg font-bold text-foreground">
                {createdTicket.ticketCode}
              </p>
            </div>

            <DialogFooter className="mt-4 flex flex-row items-center justify-end gap-3">
              <DialogClose className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-input px-4 text-sm font-medium hover:bg-muted">
                <AppBilingual pick={(c) => c.supportMessaging.cancel} />
              </DialogClose>
              <Link
                href={`/dashboard/messages/${createdTicket.ticketId}/`}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand-primary)] px-4 text-sm font-semibold text-white hover:bg-[color-mix(in_srgb,var(--brand-primary),black_10%)]"
              >
                <AppBilingual pick={(c) => c.supportMessaging.viewTicket} />
              </Link>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} data-slot="new-ticket-form" className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">
                <AppBilingual pick={(c) => c.supportMessaging.newInquiry} />
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                <AppBilingual pick={(c) => c.supportMessaging.newInquiryDescription} />
              </DialogDescription>
            </DialogHeader>

            {initialOrderCode && (
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-muted/30 px-3 py-2 text-xs">
                <Icon name="package" className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.supportMessaging.orderReference} />:
                </span>
                <span dir="ltr" className="font-mono font-semibold text-foreground">
                  {initialOrderCode}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="ticket-subject" className="text-xs font-semibold text-foreground">
                <AppBilingual pick={(c) => c.supportMessaging.subject} /> *
              </label>
              <input
                id="ticket-subject"
                type="text"
                required
                minLength={3}
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={tApp.supportMessaging.subjectPlaceholder}
                className="rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="ticket-priority" className="text-xs font-semibold text-foreground">
                <AppBilingual pick={(c) => c.supportMessaging.priority} />
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                className="rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <option value="LOW">{tApp.supportMessaging.priorities.LOW}</option>
                <option value="NORMAL">{tApp.supportMessaging.priorities.NORMAL}</option>
                <option value="HIGH">{tApp.supportMessaging.priorities.HIGH}</option>
                <option value="URGENT">{tApp.supportMessaging.priorities.URGENT}</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="ticket-message" className="text-xs font-semibold text-foreground">
                <AppBilingual pick={(c) => c.supportMessaging.initialMessage} /> *
              </label>
              <textarea
                id="ticket-message"
                required
                rows={4}
                maxLength={4000}
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                placeholder={tApp.supportMessaging.initialMessagePlaceholder}
                className="resize-y rounded-[var(--radius-md)] border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              />
            </div>

            {errorMessage && (
              <p className="text-xs font-medium text-destructive">{errorMessage}</p>
            )}

            <DialogFooter className="mt-2 flex flex-row items-center justify-end gap-3">
              <DialogClose className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-input px-4 text-sm font-medium hover:bg-muted">
                <AppBilingual pick={(c) => c.supportMessaging.cancel} />
              </DialogClose>
              <button
                type="submit"
                disabled={isPending || !subject.trim() || !initialMessage.trim()}
                data-slot="submit-ticket-button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--brand-primary)] px-4 text-sm font-semibold text-white hover:bg-[color-mix(in_srgb,var(--brand-primary),black_10%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <AppBilingual pick={(c) => c.supportMessaging.submitting} />
                ) : (
                  <AppBilingual pick={(c) => c.supportMessaging.submit} />
                )}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

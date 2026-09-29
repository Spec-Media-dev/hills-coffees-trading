"use client";

import { useState, useTransition } from "react";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { UntrustedText } from "@/components/disputes/untrusted-text";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { useLocale } from "@/components/locale/locale-provider";
import { Icon } from "@/components/ui/icon";
import type { OwnNotificationDTO } from "@/lib/notifications/types";
import { markNotificationReadAction } from "@/src/app/dashboard/notifications/actions";

function generatedOrderCode(notification: OwnNotificationDTO): string | null {
  const patterns: Record<string, [string, RegExp]> = {
    ORDER_PROFORMA_ISSUED: ["Proforma Invoice Issued", /^A proforma invoice has been generated for order (ORD-\d{8}-\d{7})$/],
    RESERVATION_CONFIRMED: ["Stock Reservation Confirmed", /^Inventory reserved for 20 minutes for order (ORD-\d{8}-\d{7})$/],
    RESERVATION_EXPIRED: ["Stock Reservation Expired", /^The reservation window for order (ORD-\d{8}-\d{7}) has expired$/],
  };
  const generated = patterns[notification.notificationType];
  return generated && notification.title === generated[0] ? generated[1].exec(notification.body)?.[1] ?? null : null;
}

export function NotificationItem({ notification }: { notification: OwnNotificationDTO }) {
  const { tApp } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const isUnread = !notification.readAt;
  const eventType = notification.notificationType;
  const orderCode = generatedOrderCode(notification);
  const eventCopy = orderCode && Object.hasOwn(tApp.notificationCenter.events, eventType)
    ? tApp.notificationCenter.events[eventType as keyof typeof tApp.notificationCenter.events]
    : null;
  const [bodyBeforeCode, bodyAfterCode] = eventCopy?.body.split("{code}") ?? [];

  return (
    <li
      data-slot="notification-item"
      data-unread={isUnread ? "true" : "false"}
      className={`flex flex-col gap-3 rounded-[var(--radius-lg)] border p-4 transition-colors ${
        isUnread
          ? "border-[var(--brand-primary)]/40 bg-[color-mix(in_srgb,var(--card),var(--brand-primary)_3%)] shadow-sm"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {isUnread && (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--brand-primary)]"
              aria-hidden="true"
            />
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <UntrustedText
              value={eventCopy?.title ?? notification.title}
              slot="notification-title"
              className={`font-semibold ${isUnread ? "text-foreground" : "text-foreground/90"}`}
            />
            {eventCopy ? (
              <p data-slot="notification-body" className="text-muted-foreground">
                {bodyBeforeCode}<bdi dir="ltr">{orderCode}</bdi>{bodyAfterCode}
              </p>
            ) : (
              <UntrustedText value={notification.body} slot="notification-body" className="text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--text-micro)] font-medium ${
              isUnread
                ? "bg-[color-mix(in_srgb,transparent,var(--brand-primary)_12%)] text-[var(--brand-primary)]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isUnread ? (
              <AppBilingual pick={(c) => c.notificationCenter.unreadStatus} />
            ) : (
              <AppBilingual pick={(c) => c.notificationCenter.readStatus} />
            )}
          </span>

          {isUnread && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const result = await markNotificationReadAction({ notificationId: notification.id });
                  setError(!result.ok);
                });
              }}
              data-slot="mark-read-button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[color-mix(in_srgb,transparent,var(--forest-700)_8%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="check" className="me-1 size-3.5" />
              <span>
                {isPending ? (
                  <AppBilingual pick={(c) => c.notificationCenter.markingAsRead} />
                ) : (
                  <AppBilingual pick={(c) => c.notificationCenter.markAsRead} />
                )}
              </span>
            </button>
          )}
        </div>
      </div>

      {error ? <p role="alert" className="text-xs text-destructive">{tApp.notificationCenter.actionFailed}</p> : null}

      <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border/50 pt-2 text-[length:var(--text-micro)] text-muted-foreground">
        <div className="flex gap-1.5">
          <dt>
            <AppBilingual pick={(c) => c.notificationCenter.receivedLabel} />:
          </dt>
          <dd className="text-foreground">
            <AdminDateTime value={notification.createdAt} fallback="—" />
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>
            <AppBilingual pick={(c) => c.notificationCenter.typeLabel} />:
          </dt>
          <dd className={eventCopy ? "text-foreground" : "font-mono text-foreground"} dir={eventCopy ? undefined : "ltr"}>
            {eventCopy?.title ?? notification.notificationType}
          </dd>
        </div>
      </dl>
    </li>
  );
}

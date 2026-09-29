import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { NotificationItem } from "@/components/notifications/notification-item";
import { NotificationLimitationNotice } from "@/components/notifications/notification-limitation-notice";
import { Icon } from "@/components/ui/icon";
import { getRequestIdentity } from "@/lib/auth/dal";
import { listOwnNotifications } from "@/lib/notifications/read";

export const metadata: Metadata = {
  title: "Notifications",
};

/**
 * Feature 014 — Notification Center with database-backed read/unread lifecycle.
 *
 * WHAT IT SHOWS: rows that genuinely exist in `notifications` for the signed-in user
 * (`listOwnNotifications`, own-user only). Feature 014 enables database RPCs for marking
 * individual or all notifications read.
 *
 * TITLES AND BODIES: sanitized with `UntrustedText` (SEC-005).
 *
 * AUTH CONTRACT: identical to every other `/dashboard/*` page.
 */
export default async function NotificationsPage() {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const result = await listOwnNotifications();
  if (!result) return <StateScreen kind="unauthorized" />;
  const { rows } = result;
  const unreadCount = rows.filter((r) => !r.readAt).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.notificationCenter.title} />}
        description={<AppBilingual pick={(c) => c.notificationCenter.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.notificationCenter.breadcrumb} /> }]}
        actions={
          <div className="flex items-center gap-3">
            <MarkAllReadButton unreadCount={unreadCount} />
            <Link
              href="/dashboard/notifications/preferences/"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <AppBilingual pick={(c) => c.notificationCenter.preferencesLink} />
            </Link>
          </div>
        }
      />

      <NotificationLimitationNotice />

      <section aria-labelledby="notification-list-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="notification-list-heading" className="text-base font-semibold text-foreground">
            <AppBilingual pick={(c) => c.notificationCenter.listCaption} />
          </h2>
          {unreadCount > 0 && (
            <span
              data-slot="unread-summary-badge"
              className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,transparent,var(--brand-primary)_12%)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-primary)]"
            >
              <AppBilingual pick={(c) => c.notificationCenter.unreadCountBadge.replace("{count}", String(unreadCount))} />
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div data-slot="notifications-empty" className="flex min-h-40 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-8 text-center">
            <Icon name="inbox" className="mb-4 size-8 text-muted-foreground" />
            <p className="hc-heading-3 font-semibold">
              <AppBilingual pick={(c) => c.notificationCenter.empty.title} />
            </p>
            <p className="mt-2 max-w-[62ch] text-sm leading-[var(--lh-body)] text-muted-foreground">
              <AppBilingual pick={(c) => c.notificationCenter.empty.description} />
            </p>
          </div>
        ) : (
          <ol data-slot="notification-list" className="flex flex-col gap-3">
            {rows.map((row) => (
              <NotificationItem key={row.id} notification={row} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { PageHeader } from "@/components/app/page-header";
import { UntrustedText } from "@/components/disputes/untrusted-text";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { NotificationLimitationNotice } from "@/components/notifications/notification-limitation-notice";
import { Icon } from "@/components/ui/icon";
import { getRequestIdentity } from "@/lib/auth/dal";
import { listOwnNotifications } from "@/lib/notifications/read";

export const metadata: Metadata = {
  title: "Notifications",
};

/**
 * Feature 012 RUN B (T010) — the honest notification surface.
 *
 * WHAT IT SHOWS: only rows that genuinely exist in `notifications` for the signed-in user
 * (`listOwnNotifications`, own-user only). In the approved system nothing creates them (DB-BLOCK-04),
 * so the normal state is the honest empty state plus the limitation notice.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: no unread count, no read/unread styling, no "mark as read"
 * control, no client/local-storage read state, and no notification synthesised from orders,
 * disputes, payments or any other table. Titles/bodies are untrusted text (`UntrustedText`).
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.notificationCenter.title} />}
        description={<AppBilingual pick={(c) => c.notificationCenter.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.notificationCenter.breadcrumb} /> }]}
        actions={
          <Link
            href="/dashboard/notifications/preferences/"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <AppBilingual pick={(c) => c.notificationCenter.preferencesLink} />
          </Link>
        }
      />

      <NotificationLimitationNotice />

      <section aria-labelledby="notification-list-heading" className="flex flex-col gap-4">
        <h2 id="notification-list-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.notificationCenter.listCaption} />
        </h2>
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
              <li key={row.id} data-slot="notification-item" className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-4">
                <UntrustedText value={row.title} slot="notification-title" className="font-semibold" />
                <UntrustedText value={row.body} slot="notification-body" className="text-muted-foreground" />
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[length:var(--text-micro)] text-muted-foreground">
                  <div className="flex gap-1.5">
                    <dt>
                      <AppBilingual pick={(c) => c.notificationCenter.receivedLabel} />:
                    </dt>
                    <dd className="text-foreground">
                      <AdminDateTime value={row.createdAt} fallback="—" />
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>
                      <AppBilingual pick={(c) => c.notificationCenter.typeLabel} />:
                    </dt>
                    <dd className="font-mono text-foreground" dir="ltr">
                      {row.notificationType}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

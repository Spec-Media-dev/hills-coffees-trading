import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { Icon } from "@/components/ui/icon";
import { getRequestIdentity } from "@/lib/auth/dal";
import { readOwnNotificationPreferences } from "@/lib/notifications/preferences";

export const metadata: Metadata = {
  title: "Notification preferences",
};

/**
 * Feature 012 RUN B (T011) — own-user notification preferences. Reads and writes ONLY the caller's
 * own `notification_preferences` rows. The honesty note is always shown: preferences are saved
 * choices, and no channel delivers anything yet (DB-BLOCK-04; no provider approved, SRS §12).
 */
export default async function NotificationPreferencesPage() {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const cells = await readOwnNotificationPreferences();
  if (!cells) return <StateScreen kind="unauthorized" />;
  const nothingSaved = cells.every((cell) => !cell.stored);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.notificationPreferences.title} />}
        description={<AppBilingual pick={(c) => c.notificationPreferences.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.notificationCenter.breadcrumb} />, href: "/dashboard/notifications" },
          { label: <AppBilingual pick={(c) => c.notificationPreferences.breadcrumb} /> },
        ]}
      />

      <div data-slot="preferences-honesty" className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] border border-[var(--info)] bg-[var(--info-surface)] p-4 text-sm text-foreground">
        <Icon name="alert-circle" className="mt-0.5 size-5 text-[var(--info)]" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <p>
            <AppBilingual pick={(c) => c.notificationPreferences.honesty} />
          </p>
          {nothingSaved ? (
            <p data-slot="preferences-not-saved">
              <AppBilingual pick={(c) => c.notificationPreferences.notSaved} />
            </p>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <NotificationPreferencesForm cells={cells} />
      </section>

      <Link
        href="/dashboard/notifications/"
        className="inline-flex min-h-11 w-fit items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <AppBilingual pick={(c) => c.notificationPreferences.backToNotifications} />
      </Link>
    </div>
  );
}

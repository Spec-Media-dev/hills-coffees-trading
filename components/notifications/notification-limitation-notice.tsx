import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import { NOTIFICATION_LIMITATIONS } from "@/lib/notifications/limitations";

/**
 * Feature 012 RUN B (T010) — the in-product DB-BLOCK-04 statement. A static note (not an alert):
 * the platform cannot generate notifications, cannot mark them read, and sends nothing by any
 * channel. Each sentence is driven by `NOTIFICATION_LIMITATIONS`, so the statement cannot silently
 * outlive the limitation it describes.
 */
export function NotificationLimitationNotice() {
  const { canGenerate, canMarkRead, deliveryChannelsApproved, blocker } = NOTIFICATION_LIMITATIONS;
  return (
    <section data-slot="notification-limitation" data-blocker={blocker} aria-labelledby="notification-limitation-heading" className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] border border-[var(--info)] bg-[var(--info-surface)] p-4 text-sm text-foreground">
      <Icon name="alert-circle" className="mt-0.5 size-5 text-[var(--info)]" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="notification-limitation-heading" className="font-semibold">
          <AppBilingual pick={(c) => c.notificationCenter.limitation.heading} />
        </h2>
        {!canGenerate ? (
          <p>
            <AppBilingual pick={(c) => c.notificationCenter.limitation.generate} />
          </p>
        ) : null}
        {!canMarkRead ? (
          <p>
            <AppBilingual pick={(c) => c.notificationCenter.limitation.readState} />
          </p>
        ) : null}
        {!deliveryChannelsApproved ? (
          <p>
            <AppBilingual pick={(c) => c.notificationCenter.limitation.delivery} />
          </p>
        ) : null}
      </div>
    </section>
  );
}

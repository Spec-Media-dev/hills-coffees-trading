import { AppBilingual } from "@/components/locale/app-bilingual";
import type { SupportTicketStatus } from "@/lib/messaging/types";

const STATUS_STYLES: Record<SupportTicketStatus, string> = {
  OPEN: "border-[var(--info)]/30 bg-[var(--info-surface)] text-[var(--info)]",
  IN_PROGRESS: "border-[var(--warning)]/30 bg-[var(--warning-surface)] text-[var(--warning)]",
  RESOLVED: "border-[var(--success)]/30 bg-[var(--success-surface)] text-[var(--success)]",
  CLOSED: "border-border bg-muted text-muted-foreground",
};

export function TicketStatusPill({ status }: { status: SupportTicketStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.OPEN;

  return (
    <span
      data-slot="ticket-status-pill"
      data-status={status}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}`}
    >
      <AppBilingual pick={(c) => c.supportMessaging.status[status]} />
    </span>
  );
}

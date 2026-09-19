import { AppBilingual } from "@/components/locale/app-bilingual";
import { cn } from "cn";
import type { DisputeStatus } from "@/lib/disputes/types";

/**
 * Feature 012 RUN A (T006) — status presentation for `disputes.status`, all six approved values.
 * Same dot + ALWAYS-present textual label pattern as `ShipmentStatusBadge`/`OrderStatusBadge`
 * (status is never communicated by colour alone), reusing the established `--status-*` tokens.
 * `FROZEN` uses the attention tone but its label and description say only what the record says —
 * no freeze of the order/payment/inventory is implied (DB-OPEN-09).
 */
const STATUS_TONE: Record<DisputeStatus, string> = {
  OPEN: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  UNDER_REVIEW: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  FROZEN: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  RESOLVED: "bg-[var(--status-complete-surface)] text-[var(--status-complete)]",
  REJECTED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  CLOSED: "bg-[var(--status-draft-surface)] text-[var(--status-draft)]",
};

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  return (
    <span
      data-slot="dispute-status-badge"
      data-status={status}
      className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", STATUS_TONE[status])}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={(c) => c.disputes.status[status]} />
      </span>
    </span>
  );
}

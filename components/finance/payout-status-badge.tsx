import { AppBilingual } from "@/components/locale/app-bilingual";
import { cn } from "cn";
import type { PayoutStatus } from "@/lib/finance/validation";

/**
 * Feature 008 T023 — status presentation for `payouts.status`. Mirrors
 * `components/finance/payment-status-badge.tsx`'s exact dot + textual-label pattern, scoped to all
 * 4 approved `PayoutStatus` values (`payouts_status_check`) — no invented provider-release status. A
 * `PAID` payout is still a platform ACCOUNTING record, never proof of actual money movement (FR-017);
 * that distinction lives in this feature's copy/notice text, not in the badge itself.
 */
const STATUS_TONE: Record<PayoutStatus, string> = {
  PENDING_PAYOUT: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  PROCESSING: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  PAID: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  VOID: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  return (
    <span
      data-slot="payout-status-badge"
      data-status={status}
      className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", STATUS_TONE[status])}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={(c) => c.finance.payouts.status[status]} />
      </span>
    </span>
  );
}

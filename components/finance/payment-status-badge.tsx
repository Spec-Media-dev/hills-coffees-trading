import { AppBilingual } from "@/components/locale/app-bilingual";
import { cn } from "cn";
import type { PaymentStatus } from "@/lib/finance/validation";

/**
 * Feature 008 T022 — status presentation for `payments.status`. Mirrors
 * `components/orders/order-status-badge.tsx`'s exact dot + textual-label pattern (status
 * communicated by more than color alone), scoped to all 7 approved `PaymentStatus` values
 * (`payments_status_check`) — no invented escrow/provider status (spec.md "No invented escrow
 * vocabulary"). Reuses the SAME `--status-*` design tokens `OrderStatusBadge` already established.
 */
const STATUS_TONE: Record<PaymentStatus, string> = {
  PENDING: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  PROOF_SUBMITTED: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  UNDER_REVIEW: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  CONFIRMED: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  REJECTED: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  EXPIRED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  VOID: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      data-slot="payment-status-badge"
      data-status={status}
      className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", STATUS_TONE[status])}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={(c) => c.finance.payments.status[status]} />
      </span>
    </span>
  );
}

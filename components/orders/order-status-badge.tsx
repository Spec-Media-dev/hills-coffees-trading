import { AppBilingual } from "@/components/locale/app-bilingual";
import { cn } from "cn";
import type { OrderStatus } from "@/lib/orders/validation";

/**
 * Feature 007 RUN A (T001/T005) — status presentation for `orders.status`. Mirrors
 * `components/listings/listing-status-badge.tsx`'s exact dot + textual-label pattern (status
 * communicated by more than color alone), scoped to all 12 approved `OrderStatus` values. Reuses the
 * SAME `--status-*` design tokens already established — several statuses intentionally share a tone,
 * disambiguated by the ALWAYS-present label text, never color-only.
 */
const STATUS_TONE: Record<OrderStatus, string> = {
  DRAFT: "bg-[var(--status-draft-surface)] text-[var(--status-draft)]",
  CONFIRMED: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  HOLD: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  PAYMENT_PROOF_SUBMITTED: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  PAYMENT_UNDER_REVIEW: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  PAID: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  FULFILLMENT_IN_PROGRESS: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  PARTIALLY_DELIVERED: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  COMPLETED: "bg-[var(--status-complete-surface)] text-[var(--status-complete)]",
  EXPIRED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  VOID: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  DISPUTED: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      data-slot="order-status-badge"
      data-status={status}
      className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", STATUS_TONE[status])}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={(c) => c.orders.status[status]} />
      </span>
    </span>
  );
}

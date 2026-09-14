import { AppBilingual } from "@/components/locale/app-bilingual";
import { cn } from "cn";
import type { OrderShipmentStatus } from "@/lib/delivery/types";

/**
 * Feature 009 RUN C (T021/T033) — status presentation for `order_shipments.status`. Mirrors
 * `components/orders/order-status-badge.tsx`'s exact dot + textual-label pattern (status
 * communicated by more than color alone, SC-004/FR-007), scoped to all 13 approved
 * `OrderShipmentStatus` values. Reuses the SAME `--status-*` design tokens already established;
 * several statuses intentionally share a tone, disambiguated by the ALWAYS-present label text.
 */
const STATUS_TONE: Record<OrderShipmentStatus, string> = {
  DRAFT: "bg-[var(--status-draft-surface)] text-[var(--status-draft)]",
  REQUESTED: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  CAPACITY_CONFIRMED: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  READY: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  RESERVED: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  PICKING: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  BOOKED: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  DISPATCHED: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  PARTIALLY_DELIVERED: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  DELIVERED: "bg-[var(--status-complete-surface)] text-[var(--status-complete)]",
  CANCELLED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  FAILED: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  DISPUTED: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
};

export function ShipmentStatusBadge({ status }: { status: OrderShipmentStatus }) {
  return (
    <span
      data-slot="shipment-status-badge"
      data-status={status}
      className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", STATUS_TONE[status])}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={(c) => c.deliveries.status[status]} />
      </span>
    </span>
  );
}

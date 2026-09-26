import { AppBilingual } from "@/components/locale/app-bilingual";
import { cn } from "cn";
import type { ProformaStatus } from "@/lib/finance/validation";

/**
 * Feature 008 T023 — status presentation for `proforma_invoices.status`. Mirrors
 * `components/finance/payment-status-badge.tsx`'s exact dot + textual-label pattern, scoped to all 3
 * approved `ProformaStatus` values (`proforma_invoices_status_check`).
 */
const STATUS_TONE: Record<ProformaStatus, string> = {
  ISSUED: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  CONFIRMED: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  PAID: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  EXPIRED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  SUPERSEDED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  CANCELLED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  VOID: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
};

export function ProformaStatusBadge({ status }: { status: ProformaStatus }) {
  return (
    <span
      data-slot="proforma-status-badge"
      data-status={status}
      className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", STATUS_TONE[status])}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={(c) => c.finance.proforma.status[status]} />
      </span>
    </span>
  );
}

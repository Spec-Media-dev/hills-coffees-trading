import { useLocale } from "@/components/locale/locale-provider";
import { cn } from "cn";

/**
 * Feature 013 T084 — a small, order/proforma/reservation-specific status badge. `components/ui/status-badge.tsx`'s
 * `StatusValue` is a fixed, English-only enum with no localization hook, so this component is a standalone sibling
 * that reuses the SAME `--status-*` CSS token convention (visual consistency) with the app's own EN/AR copy.
 */
const TONE: Record<string, string> = {
  DRAFT: "bg-[var(--status-draft-surface)] text-[var(--status-draft)]",
  PROFORMA_ISSUED: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  HOLD: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  CONFIRMED: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  ISSUED: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  EXPIRED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  CANCELLED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  VOID: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  SUPERSEDED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
  PAID: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
};

export function CommerceStatusBadge({ status, className }: { status: string; className?: string }) {
  const { tApp } = useLocale();
  const label = (tApp.commerce.statusLabels as Record<string, string | undefined>)[status] ?? status;
  return (
    <span data-slot="commerce-status-badge" data-status={status} className={cn("inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold", TONE[status] ?? TONE.DRAFT, className)}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>{label}</span>
    </span>
  );
}

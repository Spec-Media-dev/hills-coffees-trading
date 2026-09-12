import { AppBilingual } from "@/components/locale/app-bilingual";
import { cn } from "cn";
import type { ListingStatus } from "@/lib/listings/types";

/**
 * Feature 006 RUN B (T011) — status presentation for `coffee_offers.status`. Mirrors
 * `components/inventory/storage-status-badge.tsx`'s exact dot + textual-label pattern (status
 * communicated by more than color alone), scoped to the 9 approved `ListingStatus` values — never a
 * tenth. Reuses the SAME `--status-*` design tokens as that component and `globals.css`'s existing
 * palette; two statuses intentionally share the `danger` tone (REJECTED, SUSPENDED — both a "blocked"
 * severity), disambiguated by the label text, which is always present, never color-only.
 */
const STATUS_TONE: Record<ListingStatus, string> = {
  DRAFT: "bg-[var(--status-draft-surface)] text-[var(--status-draft)]",
  PENDING_REVIEW: "bg-[var(--status-pending-surface)] text-[var(--status-pending)]",
  APPROVED: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  REJECTED: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  PUBLISHED: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  PARTIALLY_FILLED: "bg-[var(--status-transit-surface)] text-[var(--status-transit)]",
  SUSPENDED: "bg-[var(--status-danger-surface)] text-[var(--status-danger)]",
  SOLD_OUT: "bg-[var(--status-complete-surface)] text-[var(--status-complete)]",
  ARCHIVED: "bg-[var(--status-cancelled-surface)] text-[var(--status-cancelled)]",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span
      data-slot="listing-status-badge"
      data-status={status}
      className={cn(
        "inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold",
        STATUS_TONE[status]
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={(c) => c.marketplace.status[status]} />
      </span>
    </span>
  );
}

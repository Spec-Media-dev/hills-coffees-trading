import { AppBilingual } from "@/components/locale/app-bilingual";
import { cn } from "cn";
import type { StorageAllocationStatus } from "@/lib/inventory/types";

/**
 * Feature 005 RUN B (T010) — status presentation for `storage_allocations.status`. A NEW, narrow
 * badge (not `components/ui/status-badge.tsx`'s `StatusBadge`) because that component's
 * `STATUS_VALUES` closed union does not include `"STORED"`/`"RELEASED"` — inventing a mapping onto
 * its existing English-only values would either misuse an unrelated status word or require widening
 * that component's own vocabulary for an unrelated domain. This badge preserves the SAME
 * dot + textual-label pattern (status communicated by more than color alone) and the same design
 * tokens, scoped to exactly the three approved `StorageAllocationStatus` values — never a fourth.
 */
const STATUS_TONE: Record<StorageAllocationStatus, string> = {
  STORED: "bg-[var(--status-paid-surface)] text-[var(--status-paid)]",
  RELEASED: "bg-[var(--status-review-surface)] text-[var(--status-review)]",
  DELIVERED: "bg-[var(--status-complete-surface)] text-[var(--status-complete)]",
};

export function StorageStatusBadge({ status }: { status: StorageAllocationStatus }) {
  return (
    <span
      data-slot="storage-status-badge"
      data-status={status}
      className={cn(
        "inline-flex min-h-6 w-fit items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-semibold",
        STATUS_TONE[status]
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span>
        <AppBilingual pick={(c) => c.inventory.storage.status[status]} />
      </span>
    </span>
  );
}

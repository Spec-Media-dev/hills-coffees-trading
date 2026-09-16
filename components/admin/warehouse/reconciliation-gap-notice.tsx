import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";

/**
 * Feature 010 RUN D (T020) — the honest variance/reconciliation capability statement. The approved
 * schema (live `docs/database/database-schema-report.json` + every applied migration under
 * `supabase/migrations/`) contains NO variance, discrepancy, reconciliation, quarantine, warehouse-hold
 * or stock-count table, column, status value or function: `storage_allocations.status` is exactly
 * `STORED`/`RELEASED`/`DELIVERED`; `inventory_positions` has only the two quantity columns; the only
 * `HOLD` is `orders.status` (a payment hold) and the only `FROZEN` is `disputes.status`; the
 * `ADJUSTMENT` ownership-event type has no warehouse write path (`inventory_ownership_events` has no
 * INSERT policy for `is_warehouse_operator()` — only `admin_review_payment` writes it). Building a
 * reconciliation screen would therefore mean inventing a model, which FR-016/FR-017 forbid. This
 * component renders the recorded gap and the minimum capability a future approved change must add.
 * Server Component; no control, no action, no fabricated figure.
 */
export function ReconciliationGapNotice() {
  return (
    <section data-admin-state="capability-gap" data-capability-gap="variance-reconciliation" aria-labelledby="reconciliation-gap-heading" className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-card)] p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-subtle)] text-foreground" aria-hidden="true">
          <Icon name="clock" className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[length:var(--text-micro)] font-semibold uppercase tracking-wide text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.warehouse.inventory.reconciliation.heading} />
          </p>
          <h2 id="reconciliation-gap-heading" className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
            <AppBilingual pick={(c) => c.admin.warehouse.inventory.reconciliation.title} />
          </h2>
          <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.warehouse.inventory.reconciliation.description} />
          </p>
          <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-foreground">
            <AppBilingual pick={(c) => c.admin.warehouse.inventory.reconciliation.minimum} />
          </p>
        </div>
      </div>
    </section>
  );
}

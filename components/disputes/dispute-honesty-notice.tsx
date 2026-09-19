import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";

/**
 * Feature 012 RUN A (T006) — the in-product statement of what a dispute does and does not do.
 * A static note (not `role="alert"` — nothing has gone wrong). Its three sentences mirror the three
 * preserved database gaps exactly: no automatic freeze (DB-OPEN-09), no notifications (DB-BLOCK-04),
 * no file evidence (DB-BLOCK-01). Rendered on both dispute surfaces so the limitation is never hidden.
 */
export function DisputeHonestyNotice() {
  return (
    <section data-slot="dispute-honesty-notice" aria-labelledby="dispute-honesty-heading" className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] border border-[var(--info)] bg-[var(--info-surface)] p-4 text-sm text-foreground">
      <Icon name="alert-circle" className="mt-0.5 size-5 text-[var(--info)]" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="dispute-honesty-heading" className="font-semibold">
          <AppBilingual pick={(c) => c.disputes.honesty.heading} />
        </h2>
        <p>
          <AppBilingual pick={(c) => c.disputes.honesty.body} />
        </p>
        <p>
          <AppBilingual pick={(c) => c.disputes.honesty.tracking} />
        </p>
        <p>
          <AppBilingual pick={(c) => c.disputes.honesty.evidence} />
        </p>
      </div>
    </section>
  );
}

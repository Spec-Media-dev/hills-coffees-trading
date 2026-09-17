import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import { evaluateTierCoverage, type CommissionTierRow } from "@/lib/admin/commission";

/**
 * Feature 010 RUN F — T045: DISPLAYS a policy's band coverage exactly as `checkout_order` would see
 * it (`min <= qty < max`, NULL max open-ended). An uncovered range is an operational warning citing
 * COMMISSION-OPEN-01; the panel offers no fallback, no fix and no checkout block.
 */
const kg = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 3 });

export function TierCoveragePanel({ tiers }: { tiers: readonly CommissionTierRow[] }) {
  const coverage = evaluateTierCoverage(tiers);
  return (
    <section data-coverage={coverage.covered ? "covered" : "gaps"} data-coverage-gap-count={coverage.gaps.length} className={`flex flex-col gap-3 rounded-[var(--radius-lg)] border p-5 ${coverage.covered ? "border-border bg-[var(--surface-card)]" : "border-[var(--status-pending)] bg-[var(--status-pending-surface)]"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--surface-card)] text-foreground">
          <Icon name={coverage.covered ? "check" : "warning"} className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
            <AppBilingual pick={(c) => c.admin.system.commission.coverage.heading} />
          </h2>
          <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-foreground">
            <AppBilingual pick={(c) => (coverage.covered ? c.admin.system.commission.coverage.covered : c.admin.system.commission.coverage.warning)} />
          </p>
        </div>
      </div>
      {coverage.gaps.length > 0 ? (
        <ul className="list-disc ps-5 text-[length:var(--text-small)] text-foreground">
          {coverage.gaps.map((gap) => (
            <li key={`${gap.from}-${gap.to ?? "open"}`} data-coverage-gap={`${gap.from}-${gap.to ?? "open"}`}>
              <AppBilingual pick={(c) => (gap.to === null ? c.admin.system.commission.coverage.gapOpen.replace("{from}", kg(gap.from)) : c.admin.system.commission.coverage.gapRange.replace("{from}", kg(gap.from)).replace("{to}", kg(gap.to)))} />
            </li>
          ))}
        </ul>
      ) : null}
      {coverage.overlaps.length > 0 ? (
        <ul className="list-disc ps-5 text-[length:var(--text-small)] text-foreground">
          {coverage.overlaps.map(({ a, b }) => (
            <li key={`${a.id}-${b.id}`} data-coverage-overlap={`${a.id}-${b.id}`}>
              <AppBilingual pick={(c) => c.admin.system.commission.coverage.overlap.replace("{a}", `${kg(a.minQuantityKg)}–${a.maxQuantityKg === null ? "∞" : kg(a.maxQuantityKg)}`).replace("{b}", `${kg(b.minQuantityKg)}–${b.maxQuantityKg === null ? "∞" : kg(b.maxQuantityKg)}`)} />
            </li>
          ))}
        </ul>
      ) : null}
      <p data-open-item="commission-open-01" className="text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground">
        <AppBilingual pick={(c) => c.admin.system.commission.coverage.openItem} />
      </p>
    </section>
  );
}

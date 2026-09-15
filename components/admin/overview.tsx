import Link from "next/link";

import { AppBilingual } from "@/components/locale/app-bilingual";
import { Icon } from "@/components/ui/icon";
import { getAdminArea } from "@/lib/admin/areas";
import type { AdminMetric, AdminOverviewSection } from "@/lib/admin/read";
import { cn } from "cn";

/**
 * Feature 010 T006 — the Operations Console overview: role-shaped sections of KPI tiles built from
 * `lib/admin/read.ts`'s real counts (the approved design system's `KpiCard` shape — value, label,
 * hint — rendered with project tokens, never a second design system).
 *
 * ── HONEST STATES, NEVER A FABRICATED FIGURE ─────────────────────────────────────────────────────
 *
 * - `value > 0`  → the number (tabular, with its label — a count of records, never a currency or
 *                  quantity without its unit; every figure here is a record count).
 * - `value === 0` → the word "None" as the tile's value and `data-metric-state="empty"`: a genuine
 *                  empty state, not a bare zero presented as activity (spec FR-016 / SC-008).
 * - `value === null` → "Unavailable" plus its hint — the query could not be read under this role
 *                  (or is recorded as unreadable, e.g. DB-OPEN-06).
 * - A section whose every metric is `0` additionally shows its empty-section message.
 *
 * Each tile links to its declared console area (which itself states honestly whether the workflow
 * is live, planned or blocked). Server Component; no client state.
 */

function MetricTile({ metric }: { metric: AdminMetric }) {
  const area = getAdminArea(metric.areaKey);
  const state = metric.value === null ? "unavailable" : metric.value === 0 ? "empty" : "value";

  const body = (
    <>
      <span className="flex items-baseline gap-2">
        {state === "value" ? (
          <span className="font-heading text-[length:var(--text-h2)] font-bold leading-none tabular-nums text-foreground">{metric.value}</span>
        ) : (
          <span className="font-heading text-[length:var(--text-h4)] font-semibold leading-none text-muted-foreground">
            <AppBilingual pick={(c) => (state === "empty" ? c.admin.overview.none : c.admin.overview.unavailable)} />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[length:var(--text-small)] font-medium text-foreground">
          <AppBilingual pick={(c) => c.admin.overview.metrics[metric.key]} />
        </span>
        {state === "unavailable" ? (
          <span className="text-[length:var(--text-micro)] text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.overview.unavailableHint} />
          </span>
        ) : null}
      </span>
    </>
  );

  const className = cn(
    "flex min-w-0 flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5 shadow-[var(--shadow-xs)]",
    area ? "transition-[border-color,box-shadow] duration-[var(--dur-fast)] hover:border-[var(--forest-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" : null,
  );

  if (!area) {
    return (
      <div data-metric={metric.key} data-metric-state={state} className={className}>
        {body}
      </div>
    );
  }

  return (
    <Link href={area.href} data-metric={metric.key} data-metric-state={state} className={className}>
      {body}
      <span className="mt-auto inline-flex items-center gap-1 text-[length:var(--text-micro)] font-semibold text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
        <AppBilingual pick={(c) => c.admin.overview.openArea.replace("{area}", c.admin.areas[area.key])} />
        <Icon name="arrow-right" className="size-3.5" />
      </span>
    </Link>
  );
}

export function AdminOverviewSections({ sections }: { sections: readonly AdminOverviewSection[] }) {
  return (
    <div className="flex flex-col gap-10">
      {sections.map((section) => {
        const allEmpty = section.metrics.length > 0 && section.metrics.every((metric) => metric.value === 0);
        return (
          <section key={section.group} data-overview-section={section.group} className="flex flex-col gap-4">
            <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.admin.overview.sections[section.group]} />
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {section.metrics.map((metric) => (
                <MetricTile key={metric.key} metric={metric} />
              ))}
            </div>
            {allEmpty ? (
              <p data-overview-empty={section.group} className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.overview.emptySection} />
              </p>
            ) : null}
            {section.note ? (
              <p data-overview-note={section.note} className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.overview.notes[section.note!]} />
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

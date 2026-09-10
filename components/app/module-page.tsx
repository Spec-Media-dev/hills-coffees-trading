import type { ReactNode } from "react"

import { PageHeader, type PageHeaderProps } from "@/components/app/page-header"

/**
 * Reusable Member/Admin "module index" layout pattern (Phase 5.5, UIF-037 buyer patterns / UIF-040
 * admin operational patterns).
 *
 * ── LAYOUT ONLY (UIF-037/UIF-040 MUST NOT) ───────────────────────────────────────────────────────
 *
 * The shape every future queue/list module will share: page header + breadcrumb, an optional
 * toolbar (filters, search, a primary action), a content region, and an optional pagination row.
 * This component reads no business data of its own — `toolbar`, `children` and `pagination` are
 * slots the CALLING feature fills with its own real `DataTable`/`FilterChip`/`Pagination` instances
 * once that feature exists. Composing with the already-approved shared primitives (`DataTable`,
 * `EmptyState`, `Pagination`, `FilterChip`) rather than a one-off table is deliberate reuse
 * (contract §30 of this run's directive).
 *
 * Documented candidate modules this visual foundation is built for (none implemented here, none routed):
 * Discovery, Orders, Deliveries, Invoices, Notifications (Member/005-009, 012). Admin/010:
 * Organizations,
 * Members,
 * KYB,
 * Catalogue,
 * Inventory,
 * Listings,
 * Orders,
 * Payment proofs,
 * Finance,
 * Settlement,
 * Payouts,
 * Delivery,
 * Pricing,
 * Commission,
 * Disputes,
 * Audit.
 * Rendering one instance with
 * an honest empty state, as `tests/design/uif-f.test.tsx` and `uif-g.test.tsx` do, is what proves
 * the pattern — it does not create a live route for any of them.
 */
export type ModulePageProps = PageHeaderProps & {
  toolbar?: ReactNode
  children: ReactNode
  pagination?: ReactNode
}

export function ModulePage({ toolbar, children, pagination, ...header }: ModulePageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader {...header} />
      {toolbar ? <div className="flex flex-wrap items-center gap-3">{toolbar}</div> : null}
      <div className="min-w-0">{children}</div>
      {pagination ? <div>{pagination}</div> : null}
    </div>
  )
}

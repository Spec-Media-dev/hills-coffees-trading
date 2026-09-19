import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { DisputeStatusBadge } from "@/components/disputes/dispute-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { checkAreaAccess } from "@/lib/admin/guards";
import { appCopy } from "@/lib/app/copy";
import { listDisputesForCompliance } from "@/lib/disputes/read";
import type { DisputeStatus, OperatorDisputeDTO } from "@/lib/disputes/types";

/**
 * Feature 010 T012 — the Compliance dispute review queue, composed ONLY from Feature 012's
 * `listDisputesForCompliance` (its own `is_compliance_operator()` check + `disputes_view` RLS; no
 * Feature 010 dispute read exists). "Awaiting action" is every status that still accepts a change
 * (everything except CLOSED); "All disputes" adds closed ones. A pure COMPLIANCE role cannot read the
 * order itself (`orders_view` is `can_view_order`), so the order column shows the reference and says
 * so — never a guessed value.
 */
const ACTIONABLE: readonly DisputeStatus[] = ["OPEN", "UNDER_REVIEW", "FROZEN", "RESOLVED", "REJECTED"];

export default async function DisputeReviewQueuePage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const access = await checkAreaAccess("disputes");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_compliance_operator" />;

  const params = await searchParams;
  const showAll = params.view === "all";
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  let result: Awaited<ReturnType<typeof listDisputesForCompliance>> = null;
  try {
    result = await listDisputesForCompliance({ statuses: showAll ? undefined : ACTIONABLE, page });
  } catch {
    result = null;
  }

  const columns = [
    {
      key: "dispute",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.compliance.disputes.columns.dispute} />,
      render: (row: OperatorDisputeDTO) => <span className="font-mono text-[length:var(--text-micro)] [overflow-wrap:anywhere]">{row.id}</span>,
    },
    {
      key: "order",
      header: <AppBilingual pick={(c) => c.admin.compliance.disputes.columns.order} />,
      render: (row: OperatorDisputeDTO) =>
        row.orderContextReadable && row.orderCode ? (
          <span className="font-mono text-[length:var(--text-small)]">{row.orderCode}</span>
        ) : (
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-[length:var(--text-micro)] [overflow-wrap:anywhere]">{row.orderId}</span>
            <span className="text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.disputes.orderReferenceOnly} />
            </span>
          </span>
        ),
    },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.compliance.disputes.columns.status} />, render: (row: OperatorDisputeDTO) => <DisputeStatusBadge status={row.status} /> },
    { key: "opened", header: <AppBilingual pick={(c) => c.admin.compliance.disputes.columns.opened} />, render: (row: OperatorDisputeDTO) => <AdminDateTime value={row.openedAt} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} /> },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.compliance.disputes.columns.updated} />, render: (row: OperatorDisputeDTO) => <AdminDateTime value={row.updatedAt} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.compliance.disputes.columns.open} />,
      render: (row: OperatorDisputeDTO) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/disputes/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.compliance.disputes.columns.open} />
        </Button>
      ),
    },
  ];

  const pageHref = (target: number) => `/dashboard-admin/disputes?${showAll ? "view=all&" : ""}page=${target}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.compliance.disputes.title} />}
        description={<AppBilingual pick={(c) => c.admin.compliance.disputes.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.groups.compliance} /> },
          { label: <AppBilingual pick={(c) => c.admin.compliance.disputes.breadcrumb} /> },
        ]}
      />

      <section data-dispute-freeze-note className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] p-4">
        <h2 className="text-[length:var(--text-small)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.compliance.disputes.freezeNote.heading} />
        </h2>
        <p className="mt-1 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.compliance.disputes.freezeNote.body} />
        </p>
      </section>

      {result === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.compliance.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.common.loadError.description} />} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" data-dispute-filter={showAll ? "all" : "actionable"}>
            <Button variant={showAll ? "outline" : "primary"} size="sm" nativeButton={false} render={<Link href="/dashboard-admin/disputes" />}>
              <AppBilingual pick={(c) => c.admin.compliance.disputes.filters.actionable} />
            </Button>
            <Button variant={showAll ? "primary" : "outline"} size="sm" nativeButton={false} render={<Link href="/dashboard-admin/disputes?view=all" />}>
              <AppBilingual pick={(c) => c.admin.compliance.disputes.filters.all} />
            </Button>
          </div>
          <TableCardList
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
            caption={appCopy.admin.compliance.disputes.title}
            emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.compliance.disputes.empty.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.disputes.empty.description} />} />}
          />
          {result.hasMore || page > 0 ? (
            <div className="flex justify-end gap-2">
              {page > 0 ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={pageHref(page - 1)} />}>
                  ‹
                </Button>
              ) : null}
              {result.hasMore ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={pageHref(page + 1)} />}>
                  ›
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

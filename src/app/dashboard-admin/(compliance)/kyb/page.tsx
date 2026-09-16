import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStatusBadge, KYB_STATUS_TONE } from "@/components/admin/compliance/status-badge";
import { AdminStateCard } from "@/components/admin/state-card";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { appCopy } from "@/lib/app/copy";
import { Button } from "@/components/ui/button";
import { KYB_QUEUE_ACTIONABLE_STATUSES, listKybApplications, type KybQueueRow } from "@/lib/admin/compliance";
import { checkAreaAccess } from "@/lib/admin/guards";
import { KYB_APPLICATION_STATUSES } from "@/lib/kyb/status-types";

/**
 * Feature 010 RUN B (T007) — the Compliance KYB review queue. Guarded twice (the `(compliance)`
 * layout, then this page's own `checkAreaAccess("kyb")` — segments render in parallel). Every row is
 * a real `kyb_applications` record read under the operator's own session; outstanding items come
 * from Feature 003's own completeness rule over the readable document rows. Organization names are
 * shown when the operator's role can read `organizations` and stated as unavailable otherwise —
 * never fabricated (see `lib/admin/compliance.ts`'s header for the recorded policy gap).
 */
export default async function KybQueuePage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const access = await checkAreaAccess("kyb");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_compliance_operator" />;

  const params = await searchParams;
  const showAll = params.view === "all";
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);

  let result: Awaited<ReturnType<typeof listKybApplications>> | null = null;
  try {
    result = await listKybApplications({ statuses: showAll ? KYB_APPLICATION_STATUSES : KYB_QUEUE_ACTIONABLE_STATUSES, page });
  } catch {
    result = null;
  }

  const columns = [
    {
      key: "organization",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.compliance.kyb.columns.organization} />,
      render: (row: KybQueueRow) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          {row.organizationName ? (
            <span className="truncate font-medium text-foreground">{row.organizationName}</span>
          ) : (
            <span className="text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.common.organizationNameUnavailable} />
            </span>
          )}
          <span className="font-mono text-[length:var(--text-micro)] text-muted-foreground">{row.organizationId}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.admin.compliance.kyb.columns.status} />,
      render: (row: KybQueueRow) => <AdminStatusBadge status={row.status} tone={KYB_STATUS_TONE[row.status] ?? "draft"} pick={(c) => c.admin.compliance.statuses.kyb[row.status]} />,
    },
    {
      key: "submitted",
      header: <AppBilingual pick={(c) => c.admin.compliance.kyb.columns.submitted} />,
      render: (row: KybQueueRow) => <AdminDateTime value={row.submittedAt} fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} />,
    },
    {
      key: "outstanding",
      header: <AppBilingual pick={(c) => c.admin.compliance.kyb.columns.outstanding} />,
      render: (row: KybQueueRow) => (
        <span className="flex flex-col gap-0.5 text-[length:var(--text-small)]">
          {row.outstanding.length === 0 ? (
            <AppBilingual pick={(c) => c.admin.compliance.kyb.outstandingNone} />
          ) : (
            <AppBilingual pick={(c) => c.admin.compliance.kyb.outstandingCount.replace("{count}", String(row.outstanding.length))} />
          )}
          {row.expiredDocumentCount > 0 ? (
            <span className="text-[var(--status-danger)]">
              <AppBilingual pick={(c) => c.admin.compliance.kyb.expiredCount.replace("{count}", String(row.expiredDocumentCount))} />
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.compliance.kyb.open} />,
      render: (row: KybQueueRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/kyb/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.compliance.kyb.open} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.compliance.kyb.title} />}
        description={<AppBilingual pick={(c) => c.admin.compliance.kyb.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.groups.compliance} /> },
          { label: <AppBilingual pick={(c) => c.admin.compliance.kyb.breadcrumb} /> },
        ]}
        actions={
          <div className="flex items-center gap-2" data-kyb-filter={showAll ? "all" : "actionable"}>
            <Button variant={showAll ? "outline" : "primary"} size="sm" nativeButton={false} render={<Link href="/dashboard-admin/kyb" />}>
              <AppBilingual pick={(c) => c.admin.compliance.kyb.filters.actionable} />
            </Button>
            <Button variant={showAll ? "primary" : "outline"} size="sm" nativeButton={false} render={<Link href="/dashboard-admin/kyb?view=all" />}>
              <AppBilingual pick={(c) => c.admin.compliance.kyb.filters.all} />
            </Button>
          </div>
        }
      />

      {result === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.compliance.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.common.loadError.description} />} />
      ) : (
        <>
          {!result.organizationNamesReadable && result.rows.length > 0 ? (
            <p data-organization-gap className="rounded-[var(--radius-md)] border border-dashed border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.compliance.common.organizationGapNote} />
            </p>
          ) : null}
          <TableCardList
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
            caption={appCopy.admin.compliance.kyb.title}
            emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.compliance.kyb.empty.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.kyb.empty.description} />} />}
          />
          {result.hasMore || page > 0 ? (
            <div className="flex justify-end gap-2">
              {page > 0 ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/kyb?${showAll ? "view=all&" : ""}page=${page - 1}`} />}>
                  ‹
                </Button>
              ) : null}
              {result.hasMore ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/kyb?${showAll ? "view=all&" : ""}page=${page + 1}`} />}>
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

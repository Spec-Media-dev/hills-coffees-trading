import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStatusBadge, ORGANIZATION_STATUS_TONE } from "@/components/admin/compliance/status-badge";
import { AdminStateCard } from "@/components/admin/state-card";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { appCopy } from "@/lib/app/copy";
import { Button } from "@/components/ui/button";
import { listOrganizations, probeOrganizationsRead, type OrganizationListRow } from "@/lib/admin/compliance";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 010 RUN B (T010) — organization status / suspension. For a role that cannot read
 * `organizations` under the current policy set (a pure COMPLIANCE operator — verified live), this
 * page renders the RECORDED capability gap rather than an empty list pretending nothing exists; a
 * platform admin sees the real rows.
 */
export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await checkAreaAccess("organizations");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_compliance_operator" />;

  const page = Math.max(0, Number.parseInt((await searchParams).page ?? "0", 10) || 0);
  let probe = await probeOrganizationsRead();
  let result: { rows: readonly OrganizationListRow[]; hasMore: boolean } = { rows: [], hasMore: false };
  if (probe === "readable") {
    try {
      result = await listOrganizations({ page });
    } catch {
      probe = "error"; // a failed read renders the error state, never an empty list pretending nothing exists
    }
  }

  const columns = [
    {
      key: "name",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.compliance.organizations.columns.name} />,
      render: (row: OrganizationListRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{row.displayName}</span>
          <span className="truncate text-[length:var(--text-micro)] text-muted-foreground">{row.legalName}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.admin.compliance.organizations.columns.status} />,
      render: (row: OrganizationListRow) => (
        <AdminStatusBadge status={row.status} tone={ORGANIZATION_STATUS_TONE[row.status] ?? "draft"} pick={(c) => c.admin.compliance.statuses.organization[row.status as keyof typeof c.admin.compliance.statuses.organization] ?? row.status} />
      ),
    },
    { key: "type", header: <AppBilingual pick={(c) => c.admin.compliance.organizations.columns.type} />, render: (row: OrganizationListRow) => <span className="font-mono text-[length:var(--text-micro)]">{row.accountType}</span> },
    { key: "country", header: <AppBilingual pick={(c) => c.admin.compliance.organizations.columns.country} />, render: (row: OrganizationListRow) => row.countryCode },
    {
      key: "created",
      header: <AppBilingual pick={(c) => c.admin.compliance.organizations.columns.created} />,
      render: (row: OrganizationListRow) => <AdminDateTime value={row.createdAt} dateOnly fallback={<AppBilingual pick={(c) => c.admin.compliance.common.notRecorded} />} />,
    },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.compliance.organizations.columns.open} />,
      render: (row: OrganizationListRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/organizations/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.compliance.organizations.columns.open} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.compliance.organizations.title} />}
        description={<AppBilingual pick={(c) => c.admin.compliance.organizations.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.groups.compliance} /> },
          { label: <AppBilingual pick={(c) => c.admin.compliance.organizations.breadcrumb} /> },
        ]}
      />
      {probe === "error" ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.compliance.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.common.loadError.description} />} />
      ) : probe === "gap" ? (
        <AdminStateCard kind="capability-gap" icon="shield" title={<AppBilingual pick={(c) => c.admin.compliance.organizations.gap.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.organizations.gap.description} />} />
      ) : (
        <>
          <TableCardList
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
            caption={appCopy.admin.compliance.organizations.title}
            emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.compliance.organizations.empty.title} />} description={<AppBilingual pick={(c) => c.admin.compliance.organizations.empty.description} />} />}
          />
          {result.hasMore || page > 0 ? (
            <div className="flex justify-end gap-2">
              {page > 0 ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/organizations?page=${page - 1}`} />}>
                  ‹
                </Button>
              ) : null}
              {result.hasMore ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/organizations?page=${page + 1}`} />}>
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

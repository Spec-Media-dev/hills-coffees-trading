import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { OriginStatusBadge } from "@/components/admin/catalogue/status-badges";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { listOrigins, type OriginRow } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";

/** Feature 010 RUN E (T022) — origins list (`origins_status_check`: ACTIVE / INACTIVE / ARCHIVED). */
export default async function OriginsPage() {
  const access = await checkAreaAccess("origins");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  let rows: readonly OriginRow[] | null = null;
  try {
    rows = await listOrigins();
  } catch {
    rows = null;
  }
  const columns = [
    {
      key: "origin",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.catalogue.origins.columns.origin} />,
      render: (row: OriginRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.name}</span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            /origins/{row.slug}/
          </span>
        </span>
      ),
    },
    { key: "region", header: <AppBilingual pick={(c) => c.admin.catalogue.origins.columns.region} />, render: (row: OriginRow) => row.regionName ?? <span className="text-muted-foreground"><AppBilingual pick={(c) => c.admin.catalogue.common.notSet} /></span> },
    { key: "country", header: <AppBilingual pick={(c) => c.admin.catalogue.origins.columns.country} />, render: (row: OriginRow) => <span dir="ltr">{row.countryCode ?? "—"}</span> },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.catalogue.origins.columns.status} />, render: (row: OriginRow) => <OriginStatusBadge status={row.status} /> },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.catalogue.origins.columns.updated} />, render: (row: OriginRow) => <AdminDateTime value={row.updatedAt} fallback="—" /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.catalogue.origins.columns.open} />,
      render: (row: OriginRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/origins/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.catalogue.origins.columns.open} />
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.origins.title} />}
        description={<AppBilingual pick={(c) => c.admin.catalogue.origins.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.groups.catalogue} /> }, { label: <AppBilingual pick={(c) => c.admin.catalogue.origins.breadcrumb} /> }]}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/origins/new" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.origins.newOrigin} />
          </Button>
        }
      />
      {rows === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.description} />} />
      ) : (
        <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.origins.caption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.catalogue.origins.empty.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.origins.empty.description} />} />} />
      )}
    </div>
  );
}

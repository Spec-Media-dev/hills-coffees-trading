import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { listRegions, type RegionRow } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";

/** Feature 010 RUN E (T022) — regions list (reference data, no status column). */
export default async function RegionsPage() {
  const access = await checkAreaAccess("regions");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  let rows: readonly RegionRow[] | null = null;
  try {
    rows = await listRegions();
  } catch {
    rows = null;
  }
  const columns = [
    {
      key: "region",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.catalogue.regions.columns.region} />,
      render: (row: RegionRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.name}</span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.slug}
          </span>
        </span>
      ),
    },
    { key: "country", header: <AppBilingual pick={(c) => c.admin.catalogue.regions.columns.country} />, render: (row: RegionRow) => <span dir="ltr">{row.countryCode ?? "—"}</span> },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.catalogue.regions.columns.updated} />, render: (row: RegionRow) => <AdminDateTime value={row.updatedAt} fallback="—" /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.catalogue.regions.columns.open} />,
      render: (row: RegionRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/regions/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.catalogue.regions.columns.open} />
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.regions.title} />}
        description={<AppBilingual pick={(c) => c.admin.catalogue.regions.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.groups.catalogue} /> }, { label: <AppBilingual pick={(c) => c.admin.catalogue.regions.breadcrumb} /> }]}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/regions/new" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.regions.newRegion} />
          </Button>
        }
      />
      {rows === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.description} />} />
      ) : (
        <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.regions.caption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.catalogue.regions.empty.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.regions.empty.description} />} />} />
      )}
    </div>
  );
}

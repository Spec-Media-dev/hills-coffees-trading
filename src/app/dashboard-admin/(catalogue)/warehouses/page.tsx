import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { WarehouseActiveBadge } from "@/components/admin/catalogue/status-badges";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { listWarehouses, type WarehouseRow } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 010 RUN E (T022) — warehouse REFERENCE management (code/name/location/owner/is_active).
 * Distinct from the Phase 6 Warehouse OPERATIONS area: nothing here reads or writes inventory,
 * custody or shipments, and no stock adjustment/reconciliation control exists (DB-OPEN-19).
 */
export default async function WarehousesPage() {
  const access = await checkAreaAccess("warehouses");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  let rows: readonly WarehouseRow[] | null = null;
  try {
    rows = await listWarehouses();
  } catch {
    rows = null;
  }
  const columns = [
    {
      key: "warehouse",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.columns.warehouse} />,
      render: (row: WarehouseRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.name}</span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.code}
          </span>
        </span>
      ),
    },
    { key: "location", header: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.columns.location} />, render: (row: WarehouseRow) => row.city || row.countryCode ? <span>{row.city ? `${row.city}${row.countryCode ? ", " : ""}` : ""}<span dir="ltr">{row.countryCode ?? ""}</span></span> : <span className="text-muted-foreground"><AppBilingual pick={(c) => c.admin.catalogue.common.notSet} /></span> },
    { key: "owner", header: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.columns.owner} />, render: (row: WarehouseRow) => row.ownerOrganizationName ?? <span className="text-muted-foreground"><AppBilingual pick={(c) => c.admin.catalogue.warehouses.form.ownerNone} /></span> },
    { key: "active", header: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.columns.active} />, render: (row: WarehouseRow) => <WarehouseActiveBadge isActive={row.isActive} /> },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.columns.updated} />, render: (row: WarehouseRow) => <AdminDateTime value={row.updatedAt} fallback="—" /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.columns.open} />,
      render: (row: WarehouseRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/warehouses/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.catalogue.warehouses.columns.open} />
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.warehouses.title} />}
        description={<AppBilingual pick={(c) => c.admin.catalogue.warehouses.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.groups.catalogue} /> }, { label: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.breadcrumb} /> }]}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/warehouses/new" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.warehouses.newWarehouse} />
          </Button>
        }
      />
      {rows === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.description} />} />
      ) : (
        <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.warehouses.caption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.catalogue.warehouses.empty.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.warehouses.empty.description} />} />} />
      )}
      <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-operations-note>
        <AppBilingual pick={(c) => c.admin.catalogue.warehouses.operationsNote} />
      </p>
    </div>
  );
}

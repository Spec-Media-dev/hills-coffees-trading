import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { warehouseFields, warehouseLocationFields } from "@/components/admin/catalogue/reference-fields";
import { WarehouseActiveBadge } from "@/components/admin/catalogue/status-badges";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { getWarehouse, listOrganizationOptions } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveWarehouse, saveWarehouseLocation } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T022) — edit a warehouse's reference fields and its named locations. */
export default async function WarehouseDetailPage({ params }: { params: Promise<{ warehouseId: string }> }) {
  const access = await checkAreaAccess("warehouses");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const { warehouseId } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(warehouseId) ? await getWarehouse(warehouseId) : null;
  const trail = [{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.breadcrumb} />, href: "/dashboard-admin/warehouses" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.form.editTitle} /> }];
  if (!detail) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.warehouses.form.editTitle} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/warehouses" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.common.back} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }
  const { warehouse, locations } = detail;
  const organizations = await listOrganizationOptions();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={warehouse.name} description={<span className="font-mono text-[length:var(--text-micro)]" dir="ltr">{warehouse.code}</span>} trail={trail} actions={<WarehouseActiveBadge isActive={warehouse.isActive} />} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <RecordForm resource="warehouses" mode="edit" formKey="warehouse" fields={warehouseFields(warehouse, organizations)} hiddenFields={{ warehouseId: warehouse.id }} action={saveWarehouse} />
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5" data-warehouse-locations>
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
                <AppBilingual pick={(c) => c.admin.catalogue.warehouses.locations.heading} />
              </h2>
              <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.catalogue.warehouses.locations.lead} />
              </p>
            </div>
            {locations.length === 0 ? (
              <p className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.catalogue.warehouses.locations.none} />
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {locations.map((location) => (
                  <li key={location.id} data-warehouse-location={location.id} className="py-3">
                    <RecordForm resource="locations" mode="edit" formKey={`location-${location.id}`} fields={warehouseLocationFields(location)} hiddenFields={{ warehouseId: warehouse.id, locationId: location.id }} action={saveWarehouseLocation} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <RecordForm resource="locations" mode="create" formKey="location-new" fields={warehouseLocationFields(null)} hiddenFields={{ warehouseId: warehouse.id }} action={saveWarehouseLocation} />
          <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-operations-note>
            <AppBilingual pick={(c) => c.admin.catalogue.warehouses.operationsNote} />
          </p>
        </div>
      </div>
    </div>
  );
}

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { warehouseFields } from "@/components/admin/catalogue/reference-fields";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { listOrganizationOptions } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveWarehouse } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T022) — create a warehouse (reference fields only). */
export default async function NewWarehousePage() {
  const access = await checkAreaAccess("warehouses");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const organizations = await listOrganizationOptions();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.warehouses.form.createTitle} />} trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.breadcrumb} />, href: "/dashboard-admin/warehouses" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.warehouses.form.createTitle} /> }]} />
      <RecordForm resource="warehouses" mode="create" formKey="warehouse" fields={warehouseFields(null, organizations)} hiddenFields={{}} action={saveWarehouse} successHref={(id) => `/dashboard-admin/warehouses/${id}`} />
    </div>
  );
}

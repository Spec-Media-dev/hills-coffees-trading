import { AdminAccessDenied } from "@/components/admin/access-denied";
import { arabicCreateFields } from "@/components/admin/catalogue/arabic-fields";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { regionFields } from "@/components/admin/catalogue/reference-fields";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveRegion } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T022) — create a region. */
export default async function NewRegionPage() {
  const access = await checkAreaAccess("regions");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.regions.form.createTitle} />} trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.regions.breadcrumb} />, href: "/dashboard-admin/regions" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.regions.form.createTitle} /> }]} />
      <RecordForm resource="regions" mode="create" formKey="region" fields={[...regionFields(null), ...arabicCreateFields(false)]} hiddenFields={{}} action={saveRegion} successHrefTemplate="/dashboard-admin/regions/{id}" />
    </div>
  );
}

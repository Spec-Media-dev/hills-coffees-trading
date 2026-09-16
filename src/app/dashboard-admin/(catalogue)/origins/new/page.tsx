import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { originFields } from "@/components/admin/catalogue/reference-fields";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { listOrigins, listRegions } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveOrigin } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T022) — create an origin. */
export default async function NewOriginPage() {
  const access = await checkAreaAccess("origins");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const [regions, parents] = await Promise.all([listRegions(), listOrigins()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.origins.form.createTitle} />} trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.origins.breadcrumb} />, href: "/dashboard-admin/origins" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.origins.form.createTitle} /> }]} />
      <RecordForm resource="origins" mode="create" formKey="origin" fields={originFields(null, regions, parents)} hiddenFields={{}} action={saveOrigin} successHrefTemplate="/dashboard-admin/origins/{id}" />
    </div>
  );
}

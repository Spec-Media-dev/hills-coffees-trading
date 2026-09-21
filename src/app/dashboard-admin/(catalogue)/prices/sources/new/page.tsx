import { AdminAccessDenied } from "@/components/admin/access-denied";
import { priceSourceFields } from "@/components/admin/catalogue/price-fields";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { savePriceSource } from "@/src/app/dashboard-admin/(catalogue)/prices/actions";

/** Feature 010 T049 — create a reference-price source (PENDING by default: never public until approved). */
export default async function NewPriceSourcePage() {
  const access = await checkAreaAccess("prices");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.prices.forms.priceSource.createTitle} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.breadcrumb} />, href: "/dashboard-admin/prices" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.forms.priceSource.createTitle} /> }]}
      />
      <RecordForm resource="prices" priceForm="priceSource" mode="create" formKey="price-source" fields={priceSourceFields(null)} hiddenFields={{}} action={savePriceSource} successHrefTemplate="/dashboard-admin/prices/sources/{id}" />
    </div>
  );
}

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { priceDifferentialCreateFields } from "@/components/admin/catalogue/price-fields";
import { PriceNotes } from "@/components/admin/catalogue/price-parts";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { checkAreaAccess } from "@/lib/admin/guards";
import { getPriceScopeOptions, type PriceScopeOptions } from "@/lib/admin/prices";
import { savePriceDifferential } from "@/src/app/dashboard-admin/(catalogue)/prices/actions";

/** Feature 010 T049 — create a basis differential (general, one coffee, or one origin). */
export default async function NewPriceDifferentialPage() {
  const access = await checkAreaAccess("prices");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  let scope: PriceScopeOptions | null = null;
  try {
    scope = await getPriceScopeOptions();
  } catch {
    scope = null;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.prices.forms.priceDifferential.createTitle} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.breadcrumb} />, href: "/dashboard-admin/prices" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.prices.forms.priceDifferential.createTitle} /> }]}
      />
      <PriceNotes notes={["noConversionNote"]} />
      {scope === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.description} />} />
      ) : (
        <RecordForm resource="prices" priceForm="priceDifferential" mode="create" formKey="price-differential" fields={priceDifferentialCreateFields(scope)} hiddenFields={{}} action={savePriceDifferential} successHrefTemplate="/dashboard-admin/prices/differentials/{id}" />
      )}
    </div>
  );
}

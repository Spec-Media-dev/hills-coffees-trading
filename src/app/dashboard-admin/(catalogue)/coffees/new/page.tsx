import { AdminAccessDenied } from "@/components/admin/access-denied";
import { coffeeFields } from "@/components/admin/catalogue/coffee-fields";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { getCoffeeReferenceOptions } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveCoffee } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T021) — create a coffee (always as DRAFT; publication is a separate confirmed step on the detail page). */
export default async function NewCoffeePage() {
  const access = await checkAreaAccess("coffees");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const options = await getCoffeeReferenceOptions();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.coffees.form.createTitle} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.catalogue.coffees.breadcrumb} />, href: "/dashboard-admin/coffees" },
          { label: <AppBilingual pick={(c) => c.admin.catalogue.coffees.form.createTitle} /> },
        ]}
      />
      <RecordForm resource="coffees" mode="create" formKey="coffee" fields={coffeeFields(options, null)} hiddenFields={{}} action={saveCoffee} successHrefTemplate="/dashboard-admin/coffees/{id}" />
    </div>
  );
}

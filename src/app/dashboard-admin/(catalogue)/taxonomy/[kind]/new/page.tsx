import { AdminAccessDenied } from "@/components/admin/access-denied";
import { arabicCreateFields } from "@/components/admin/catalogue/arabic-fields";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { taxonomyFields } from "@/components/admin/catalogue/reference-fields";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { listTaxonomy } from "@/lib/admin/catalogue";
import { isTaxonomyKind } from "@/lib/admin/catalogue-validation";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveTaxonomyEntry } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T022) — create one taxonomy entry of a known kind. */
export default async function NewTaxonomyEntryPage({ params }: { params: Promise<{ kind: string }> }) {
  const access = await checkAreaAccess("taxonomy");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const { kind } = await params;
  const trail = [{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.breadcrumb} />, href: "/dashboard-admin/taxonomy" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.form.createTitle} /> }];
  if (!isTaxonomyKind(kind)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.taxonomy.form.createTitle} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.description} />} />
      </div>
    );
  }
  const coffeeTypes = kind === "varieties" ? await listTaxonomy("coffeeTypes") : [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.taxonomy.kinds[kind]} />} description={<AppBilingual pick={(c) => c.admin.catalogue.taxonomy.form.createTitle} />} trail={trail} />
      <RecordForm resource="taxonomy" mode="create" formKey={`taxonomy-${kind}`} fields={[...taxonomyFields(kind, null, coffeeTypes), ...arabicCreateFields(false)]} hiddenFields={{ kind }} action={saveTaxonomyEntry} successHrefTemplate={`/dashboard-admin/taxonomy/${kind}/{id}`} />
    </div>
  );
}

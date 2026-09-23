import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { ArabicContentPanel } from "@/components/admin/catalogue/arabic-content-panel";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { taxonomyFields } from "@/components/admin/catalogue/reference-fields";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { getArabicTranslation, getTaxonomyEntry, listTaxonomy } from "@/lib/admin/catalogue";
import { isTaxonomyKind, translationKindForTaxonomy } from "@/lib/admin/catalogue-validation";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveTaxonomyEntry } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T022) — edit one taxonomy entry of a known kind. */
export default async function TaxonomyEntryPage({ params }: { params: Promise<{ kind: string; entryId: string }> }) {
  const access = await checkAreaAccess("taxonomy");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const { kind, entryId } = await params;
  const entry = isTaxonomyKind(kind) && /^[0-9a-f-]{36}$/i.test(entryId) ? await getTaxonomyEntry(kind, entryId) : null;
  const trail = [{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.breadcrumb} />, href: "/dashboard-admin/taxonomy" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.form.editTitle} /> }];
  if (!entry || !isTaxonomyKind(kind)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.taxonomy.form.editTitle} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/taxonomy" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.common.back} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }
  const translationKind = translationKindForTaxonomy(kind);
  const [coffeeTypes, arabic] = await Promise.all([kind === "varieties" ? listTaxonomy("coffeeTypes") : Promise.resolve([]), translationKind ? getArabicTranslation(translationKind, entry.id) : Promise.resolve(null)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={entry.name} description={<span className="font-mono text-[length:var(--text-micro)]" dir="ltr">{entry.slug}</span>} trail={trail} actions={<span className="text-[length:var(--text-small)] text-muted-foreground"><AppBilingual pick={(c) => c.admin.catalogue.taxonomy.kinds[kind]} /></span>} />
      <RecordForm resource="taxonomy" mode="edit" contentLanguage="en" formKey={`taxonomy-${kind}`} fields={taxonomyFields(kind, entry, coffeeTypes)} hiddenFields={{ kind, entryId: entry.id }} action={saveTaxonomyEntry} />
      {translationKind ? (
        <ArabicContentPanel kind={translationKind} entityId={entry.id} hasDescription={false} initial={arabic} returnPath={`/dashboard-admin/taxonomy/${kind}/${entry.id}`} />
      ) : (
        <p className="text-[length:var(--text-micro)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.catalogue.arabic.noTranslationForTags} />
        </p>
      )}
    </div>
  );
}

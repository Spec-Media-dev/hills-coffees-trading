import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { BilingualEditor } from "@/components/admin/catalogue/bilingual-editor";
import { ArabicContentPanel } from "@/components/admin/catalogue/arabic-content-panel";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { originFields } from "@/components/admin/catalogue/reference-fields";
import { OriginStatusBadge } from "@/components/admin/catalogue/status-badges";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { getArabicTranslation, getOrigin, listOrigins, listRegions } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveOrigin } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T022) — edit an origin (status is the database vocabulary, chosen in the form). */
export default async function OriginDetailPage({ params }: { params: Promise<{ originId: string }> }) {
  const access = await checkAreaAccess("origins");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const { originId } = await params;
  const origin = /^[0-9a-f-]{36}$/i.test(originId) ? await getOrigin(originId) : null;
  const trail = [{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.origins.breadcrumb} />, href: "/dashboard-admin/origins" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.origins.form.editTitle} /> }];
  if (!origin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.origins.form.editTitle} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/origins" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.common.back} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }
  const [regions, parents, arabic] = await Promise.all([listRegions(), listOrigins(), getArabicTranslation("origin", origin.id)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={origin.name} description={<span className="font-mono text-[length:var(--text-micro)]" dir="ltr">/origins/{origin.slug}/</span>} trail={trail} actions={<OriginStatusBadge status={origin.status} />} />
      <BilingualEditor
        english={<RecordForm resource="origins" mode="edit" contentLanguage="en" formKey="origin" fields={originFields(origin, regions, parents)} hiddenFields={{ originId: origin.id }} action={saveOrigin} />}
        arabic={<ArabicContentPanel kind="origin" entityId={origin.id} hasDescription initial={arabic} returnPath={`/dashboard-admin/origins/${origin.id}`} />}
      />
      <p className="text-[length:var(--text-micro)] text-muted-foreground">
        <AppBilingual pick={(c) => c.admin.catalogue.common.noDeleteNote} />
      </p>
    </div>
  );
}

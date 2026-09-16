import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { RecordForm } from "@/components/admin/catalogue/record-form";
import { regionFields } from "@/components/admin/catalogue/reference-fields";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { getRegion } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";
import { saveRegion } from "@/src/app/dashboard-admin/(catalogue)/actions";

/** Feature 010 RUN E (T022) — edit a region. */
export default async function RegionDetailPage({ params }: { params: Promise<{ regionId: string }> }) {
  const access = await checkAreaAccess("regions");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const { regionId } = await params;
  const region = /^[0-9a-f-]{36}$/i.test(regionId) ? await getRegion(regionId) : null;
  const trail = [{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.regions.breadcrumb} />, href: "/dashboard-admin/regions" }, { label: <AppBilingual pick={(c) => c.admin.catalogue.regions.form.editTitle} /> }];
  if (!region) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.regions.form.editTitle} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/regions" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.common.back} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={region.name} description={<span className="font-mono text-[length:var(--text-micro)]" dir="ltr">{region.slug}</span>} trail={trail} />
      <RecordForm resource="regions" mode="edit" formKey="region" fields={regionFields(region)} hiddenFields={{ regionId: region.id }} action={saveRegion} />
    </div>
  );
}

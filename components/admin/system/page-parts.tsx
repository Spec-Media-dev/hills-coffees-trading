import Link from "next/link";
import type { ReactNode } from "react";

import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { AppBilingual, type AppCopySelector } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";

/** Feature 010 RUN F — small server-side building blocks shared by the system-configuration pages. */

export function systemTrail(area: AppCopySelector, areaHref?: string, leaf?: AppCopySelector) {
  const trail: { label: ReactNode; href?: string }[] = [
    { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
    { label: <AppBilingual pick={(c) => c.admin.groups.system} /> },
    { label: <AppBilingual pick={area} />, href: leaf ? areaHref : undefined },
  ];
  if (leaf) trail.push({ label: <AppBilingual pick={leaf} /> });
  return trail;
}

export function SystemNotFound({ title, trail, backHref }: { title: AppCopySelector; trail: { label: ReactNode; href?: string }[]; backHref: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={title} />} trail={trail} />
      <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.system.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.system.common.notFound.description} />}>
        <Button variant="outline" nativeButton={false} render={<Link href={backHref} />}>
          <AppBilingual pick={(c) => c.admin.system.common.back} />
        </Button>
      </AdminStateCard>
    </div>
  );
}

export function SystemLoadError() {
  return <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.system.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.system.common.loadError.description} />} />;
}

export function EffectiveWindow({ from, until }: { from: string; until: string | null }) {
  return (
    <span className="flex flex-col text-[length:var(--text-micro)]" dir="ltr">
      <span>
        <AdminDateTime value={from} fallback="—" />
      </span>
      <span className="text-muted-foreground">
        → <AdminDateTime value={until} fallback={<AppBilingual pick={(c) => c.admin.system.common.openEnded} />} />
      </span>
    </span>
  );
}

export function YesNo({ value }: { value: boolean }) {
  return <AppBilingual pick={(c) => (value ? c.admin.system.common.yes : c.admin.system.common.no)} />;
}

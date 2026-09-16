import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { CATALOGUE_MEDIA_UPLOAD_AVAILABLE, listAllCoffeeMedia, type CoffeeMediaListRow } from "@/lib/admin/catalogue";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 010 RUN E (T024) — every `coffee_media` record across the catalogue, exactly as stored,
 * with the honest byte-upload gap (DB-BLOCK-01: no public media bucket exists). Record management
 * (primary/order) lives on each coffee's detail page; nothing here uploads or deletes.
 */
export default async function MediaPage() {
  const access = await checkAreaAccess("media");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  let rows: readonly CoffeeMediaListRow[] | null = null;
  try {
    rows = await listAllCoffeeMedia();
  } catch {
    rows = null;
  }
  const columns = [
    {
      key: "coffee",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.catalogue.media.columns.coffee} />,
      render: (row: CoffeeMediaListRow) => (
        <Link href={`/dashboard-admin/coffees/${row.coffeeId}`} className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
          {row.coffeeName}
        </Link>
      ),
    },
    { key: "file", header: <AppBilingual pick={(c) => c.admin.catalogue.media.columns.file} />, render: (row: CoffeeMediaListRow) => <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">{row.file?.originalName ?? row.fileAssetId}</span> },
    { key: "type", header: <AppBilingual pick={(c) => c.admin.catalogue.media.columns.type} />, render: (row: CoffeeMediaListRow) => <span dir="ltr">{row.file?.mimeType ?? "—"}</span> },
    { key: "size", header: <AppBilingual pick={(c) => c.admin.catalogue.media.columns.size} />, render: (row: CoffeeMediaListRow) => <span dir="ltr">{row.file ? `${Math.round(row.file.sizeBytes / 1024)} KB` : "—"}</span> },
    { key: "primary", header: <AppBilingual pick={(c) => c.admin.catalogue.media.columns.primary} />, render: (row: CoffeeMediaListRow) => <AppBilingual pick={(c) => (row.isPrimary ? c.admin.compliance.common.yes : c.admin.compliance.common.no)} /> },
    { key: "order", header: <AppBilingual pick={(c) => c.admin.catalogue.media.columns.order} />, render: (row: CoffeeMediaListRow) => <span className="tabular-nums" dir="ltr">{row.sortOrder}</span> },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.admin.catalogue.media.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.media.description} />} trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.groups.catalogue} /> }, { label: <AppBilingual pick={(c) => c.admin.catalogue.media.breadcrumb} /> }]} />
      {rows === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.description} />} />
      ) : (
        <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.media.caption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.catalogue.media.empty.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.media.empty.description} />} />} />
      )}
      <section data-media-upload={CATALOGUE_MEDIA_UPLOAD_AVAILABLE ? "available" : "unavailable"} className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-card)] p-5">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.catalogue.coffees.media.uploadUnavailableTitle} />
        </h2>
        <p className="mt-2 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.catalogue.coffees.media.uploadUnavailableDescription} />
        </p>
        <Button variant="outline" size="sm" nativeButton={false} className="mt-4" render={<Link href="/dashboard-admin/coffees" />}>
          <AppBilingual pick={(c) => c.admin.catalogue.coffees.breadcrumb} />
        </Button>
      </section>
    </div>
  );
}

import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { listTaxonomy, type TaxonomyRow } from "@/lib/admin/catalogue";
import { TAXONOMY_KINDS, isTaxonomyKind } from "@/lib/admin/catalogue-validation";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 010 RUN E (T022) — the five reference vocabularies (coffee types, varieties, processing
 * methods, packaging types, tags), one table each with its own DTO path. None has a status column and
 * none can be deleted from the console.
 */
export default async function TaxonomyPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const access = await checkAreaAccess("taxonomy");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;
  const params = await searchParams;
  const kind = isTaxonomyKind(params.kind) ? params.kind : "coffeeTypes";
  let rows: readonly TaxonomyRow[] | null = null;
  try {
    rows = await listTaxonomy(kind);
  } catch {
    rows = null;
  }
  const columns = [
    { key: "entry", primary: true, header: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.columns.entry} />, render: (row: TaxonomyRow) => <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.name}</span> },
    { key: "slug", header: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.columns.slug} />, render: (row: TaxonomyRow) => <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">{row.slug}</span> },
    ...(kind === "varieties" ? [{ key: "coffeeType", header: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.columns.coffeeType} />, render: (row: TaxonomyRow) => row.coffeeTypeName ?? <span className="text-muted-foreground"><AppBilingual pick={(c) => c.admin.catalogue.common.notSet} /></span> }] : []),
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.columns.open} />,
      render: (row: TaxonomyRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/taxonomy/${kind}/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.columns.open} />
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.taxonomy.title} />}
        description={<AppBilingual pick={(c) => c.admin.catalogue.taxonomy.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" }, { label: <AppBilingual pick={(c) => c.admin.groups.catalogue} /> }, { label: <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.breadcrumb} /> }]}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/taxonomy/${kind}/new`} />}>
            <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.newEntry} />
          </Button>
        }
      />
      <nav aria-label={appCopy.admin.catalogue.taxonomy.title} className="flex flex-wrap gap-2" data-taxonomy-kind={kind}>
        {TAXONOMY_KINDS.map((value) => (
          <Button key={value} variant={kind === value ? "primary" : "outline"} size="sm" nativeButton={false} aria-current={kind === value ? "page" : undefined} render={<Link href={value === "coffeeTypes" ? "/dashboard-admin/taxonomy" : `/dashboard-admin/taxonomy?kind=${value}`} />}>
            <AppBilingual pick={(c) => c.admin.catalogue.taxonomy.kinds[value]} />
          </Button>
        ))}
      </nav>
      {rows === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.description} />} />
      ) : (
        <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.taxonomy.caption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.catalogue.taxonomy.empty.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.taxonomy.empty.description} />} />} />
      )}
      <p className="text-[length:var(--text-micro)] text-muted-foreground">
        <AppBilingual pick={(c) => c.admin.catalogue.common.noDeleteNote} />
      </p>
    </div>
  );
}

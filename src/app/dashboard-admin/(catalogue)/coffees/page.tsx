import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { CoffeeStatusBadge } from "@/components/admin/catalogue/status-badges";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { listCoffees, type CoffeeListRow } from "@/lib/admin/catalogue";
import { COFFEE_STATUSES, type CoffeeStatus } from "@/lib/admin/catalogue-validation";
import { checkAreaAccess } from "@/lib/admin/guards";

/**
 * Feature 010 RUN E (T021) — the coffee catalogue list. `is_platform_admin()` is re-verified by the
 * page itself; rows are the real `coffees` table under RLS (`catalog_admin_coffees`), status badges
 * are the database vocabulary (DRAFT/PUBLISHED/ARCHIVED), and every mutation lives on the detail page.
 */
export default async function CoffeesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const access = await checkAreaAccess("coffees");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_platform_admin" />;

  const params = await searchParams;
  const status = (COFFEE_STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as CoffeeStatus) : undefined;
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  let result: Awaited<ReturnType<typeof listCoffees>> | null = null;
  try {
    result = await listCoffees({ page, status });
  } catch {
    result = null;
  }

  const href = (target?: CoffeeStatus, targetPage = 0) => `/dashboard-admin/coffees${target ? `?status=${target}` : ""}${targetPage > 0 ? `${target ? "&" : "?"}page=${targetPage}` : ""}`;

  const columns = [
    {
      key: "coffee",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.catalogue.coffees.columns.coffee} />,
      render: (row: CoffeeListRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">{row.name}</span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            /coffee/{row.slug}/
          </span>
        </span>
      ),
    },
    { key: "origin", header: <AppBilingual pick={(c) => c.admin.catalogue.coffees.columns.origin} />, render: (row: CoffeeListRow) => row.originName ?? <span className="text-muted-foreground"><AppBilingual pick={(c) => c.admin.catalogue.common.notSet} /></span> },
    { key: "type", header: <AppBilingual pick={(c) => c.admin.catalogue.coffees.columns.type} />, render: (row: CoffeeListRow) => row.coffeeTypeName ?? <span className="text-muted-foreground"><AppBilingual pick={(c) => c.admin.catalogue.common.notSet} /></span> },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.catalogue.coffees.columns.status} />, render: (row: CoffeeListRow) => <CoffeeStatusBadge status={row.status} /> },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.catalogue.coffees.columns.updated} />, render: (row: CoffeeListRow) => <AdminDateTime value={row.updatedAt} fallback="—" /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.catalogue.coffees.columns.open} />,
      render: (row: CoffeeListRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/coffees/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.catalogue.coffees.columns.open} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.catalogue.coffees.title} />}
        description={<AppBilingual pick={(c) => c.admin.catalogue.coffees.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.groups.catalogue} /> },
          { label: <AppBilingual pick={(c) => c.admin.catalogue.coffees.breadcrumb} /> },
        ]}
        actions={
          <Button variant="primary" size="sm" nativeButton={false} render={<Link href="/dashboard-admin/coffees/new" />}>
            <AppBilingual pick={(c) => c.admin.catalogue.coffees.newCoffee} />
          </Button>
        }
      />

      <nav aria-label={appCopy.admin.catalogue.coffees.title} className="flex flex-wrap gap-2" data-coffee-filter={status ?? "all"}>
        <Button variant={status ? "outline" : "primary"} size="sm" nativeButton={false} aria-current={status ? undefined : "page"} render={<Link href={href()} />}>
          <AppBilingual pick={(c) => c.admin.catalogue.coffees.filters.all} />
        </Button>
        {COFFEE_STATUSES.map((value) => (
          <Button key={value} variant={status === value ? "primary" : "outline"} size="sm" nativeButton={false} aria-current={status === value ? "page" : undefined} render={<Link href={href(value)} />}>
            <AppBilingual pick={(c) => c.admin.catalogue.coffees.filters[value]} />
          </Button>
        ))}
      </nav>

      {result === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.common.loadError.description} />} />
      ) : (
        <>
          <TableCardList columns={columns} rows={result.rows} getRowKey={(row) => row.id} caption={appCopy.admin.catalogue.coffees.caption} emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.catalogue.coffees.empty.title} />} description={<AppBilingual pick={(c) => c.admin.catalogue.coffees.empty.description} />} />} />
          {result.hasMore || page > 0 ? (
            <div className="flex justify-end gap-2">
              {page > 0 ? (
                <Button variant="outline" size="sm" nativeButton={false} aria-label={appCopy.admin.warehouse.common.previous} render={<Link href={href(status, page - 1)} />}>
                  ‹
                </Button>
              ) : null}
              {result.hasMore ? (
                <Button variant="outline" size="sm" nativeButton={false} aria-label={appCopy.admin.warehouse.common.next} render={<Link href={href(status, page + 1)} />}>
                  ›
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      <p className="text-[length:var(--text-micro)] text-muted-foreground">
        <AppBilingual pick={(c) => c.admin.catalogue.common.noDeleteNote} />
      </p>
    </div>
  );
}

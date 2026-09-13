import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getSellerSalesLineItems, type SalesLineItem } from "@/lib/listings/sales";

export const metadata: Metadata = {
  title: "Sales",
};

const PAGE_SIZE = 25;

/**
 * Feature 006 RUN C (T019) — seller sales reconciliation. A READ/RECONCILIATION view only — no
 * Feature 008 settlement logic lives here. Reads exclusively through `lib/listings/sales.ts`, which
 * itself reads only `order_items`/`orders`' own stored snapshots — never a UI-side tally, never a
 * fabricated "sold" outcome when no such row exists. In the current live database, no settled order
 * exists for ANY organization yet (RUN A/B's own established finding — no MEMBER_SELLER listing can
 * be created without a settled order, and none exists), so this page's honest, correct behavior for
 * every real seller today is the EMPTY state — not an error, not a fabricated example row.
 */
export default async function SellerSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }
  if (!identity.organization.canSell) {
    return (
      <StateScreen
        kind="forbidden"
        title={appCopy.listings.manage.capabilityRequired.title}
        description={appCopy.listings.manage.capabilityRequired.description}
      />
    );
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);

  const { rows, hasMore } = await getSellerSalesLineItems({
    organizationId: identity.organization.organizationId,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: TableCardListColumn<SalesLineItem>[] = [
    {
      key: "listing",
      header: <AppBilingual pick={(c) => c.listings.sales.columns.listing} />,
      primary: true,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.productNameSnapshot ?? row.lotCodeSnapshot ?? row.id}</span>
          {row.orderCode ? <span className="text-muted-foreground" dir="ltr">{row.orderCode}</span> : null}
        </div>
      ),
    },
    {
      key: "quantity",
      header: <AppBilingual pick={(c) => c.listings.sales.columns.quantity} />,
      render: (row) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {row.quantityKg} kg
        </span>
      ),
    },
    {
      key: "unitPrice",
      header: <AppBilingual pick={(c) => c.listings.sales.columns.unitPrice} />,
      render: (row) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {row.currency} {row.unitPricePerKg}
        </span>
      ),
    },
    {
      key: "total",
      header: <AppBilingual pick={(c) => c.listings.sales.columns.total} />,
      render: (row) => (
        <span className="font-mono font-semibold tabular-nums" dir="ltr">
          {row.currency} {(row.quantityKg * row.unitPricePerKg).toFixed(2)}
        </span>
      ),
    },
    {
      key: "outcome",
      header: <AppBilingual pick={(c) => c.listings.sales.columns.outcome} />,
      render: (row) => <span className="text-foreground">{row.orderStatus ?? "—"}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.listings.sales.title} />}
        description={<AppBilingual pick={(c) => c.listings.sales.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.listings.sales.title} /> }]}
      />

      {rows.length === 0 && page === 0 ? (
        <EmptyState title={appCopy.listings.sales.empty.title} description={appCopy.listings.sales.empty.description} />
      ) : (
        <>
          <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.listings.sales.caption} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" render={<Link href={`/dashboard/sales?page=${page - 1}`} />}>
                  <AppBilingual pick={(c) => c.listings.sales.pagination.previous} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.listings.sales.pagination.previous} />
                </Button>
              )}
              <span className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.listings.sales.pagination.pageLabel.replace("{page}", String(page + 1))} />
              </span>
              {hasMore ? (
                <Button variant="outline" render={<Link href={`/dashboard/sales?page=${page + 1}`} />}>
                  <AppBilingual pick={(c) => c.listings.sales.pagination.next} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.listings.sales.pagination.next} />
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

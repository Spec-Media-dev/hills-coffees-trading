import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getOrdersForOrganization } from "@/lib/orders/read";
import type { OrderSummary } from "@/lib/orders/validation";

import { StartOrderButton } from "./start-order-button";

export const metadata: Metadata = {
  title: "Orders",
};

const PAGE_SIZE = 25;

/**
 * Feature 007 RUN A (T005) — the buyer's own orders list. Only `DRAFT` orders can genuinely exist
 * this run (Phase 4's checkout is out of scope) — this page nonetheless renders whatever statuses
 * are actually present via the SAME closed `OrderStatusBadge` vocabulary Phase 6 (T015, out of RUN A
 * scope) will build on, rather than hard-coding a DRAFT-only assumption into the UI.
 *
 * SECURITY: re-verifies `isAuthorizedMember` server-side, independent of nav visibility (T018's own
 * registry entry, Phase 7, is out of RUN A scope — this route has no nav entry yet at all). Reads
 * exclusively through `lib/orders/read.ts` — `organizationId` is the caller's already-resolved
 * ACTING organization, never a client-supplied value.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);

  const { rows, hasMore } = await getOrdersForOrganization({
    organizationId: identity.organization.organizationId,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: TableCardListColumn<OrderSummary>[] = [
    {
      key: "code",
      header: <AppBilingual pick={(c) => c.orders.list.columns.code} />,
      primary: true,
      render: (row) => (
        <span className="font-mono text-foreground" dir="ltr">
          {row.orderCode}
        </span>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.orders.list.columns.status} />,
      render: (row) => <OrderStatusBadge status={row.status} />,
    },
    {
      key: "updated",
      header: <AppBilingual pick={(c) => c.orders.list.columns.updated} />,
      render: (row) => (
        <span className="text-muted-foreground" dir="ltr">
          {row.updatedAt}
        </span>
      ),
    },
    {
      key: "action",
      header: (
        <span className="sr-only">
          <AppBilingual pick={(c) => c.orders.list.columns.actions} />
        </span>
      ),
      render: (row) => (
        <Link
          href={`/dashboard/orders/${row.id}`}
          className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <AppBilingual pick={(c) => c.orders.list.viewDetails} />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.orders.list.title} />}
        description={<AppBilingual pick={(c) => c.orders.list.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.orders.list.breadcrumb} /> }]}
        actions={identity.organization.canBuy ? <StartOrderButton /> : null}
      />

      {rows.length === 0 && page === 0 ? (
        <EmptyState
          title={appCopy.orders.list.empty.title}
          description={appCopy.orders.list.empty.description}
          action={identity.organization.canBuy ? <StartOrderButton /> : undefined}
        />
      ) : (
        <>
          <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.orders.list.caption} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" render={<Link href={`/dashboard/orders?page=${page - 1}`} />}>
                  <AppBilingual pick={(c) => c.orders.list.pagination.previous} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.orders.list.pagination.previous} />
                </Button>
              )}
              <span className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.orders.list.pagination.pageLabel.replace("{page}", String(page + 1))} />
              </span>
              {hasMore ? (
                <Button variant="outline" render={<Link href={`/dashboard/orders?page=${page + 1}`} />}>
                  <AppBilingual pick={(c) => c.orders.list.pagination.next} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.orders.list.pagination.next} />
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

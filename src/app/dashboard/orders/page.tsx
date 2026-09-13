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
import { ensureHoldFresh, selectStaleHolds } from "@/lib/orders/expiry";
import { getOrderFinancialsForOrders, getOrdersForOrganization } from "@/lib/orders/read";
import type { OrderFinancialsDTO, OrderSummary } from "@/lib/orders/validation";

import { StartOrderButton } from "./start-order-button";

export const metadata: Metadata = {
  title: "Orders",
};

const PAGE_SIZE = 25;

type OrderListRow = { order: OrderSummary; financials: OrderFinancialsDTO | null };

/**
 * Feature 007 (T005 → T015) — the buyer's own orders list. Reads exclusively through
 * `lib/orders/read.ts`: one bounded, deterministically-ordered page (`created_at DESC, id DESC`,
 * `PAGE_SIZE` + 1 probe row) scoped by the server-resolved acting organization, plus ONE bounded
 * `order_financials` read keyed by that page's ids — never an org-wide aggregate, never a
 * recomputation (the amount shown is `buyer_total_amount` verbatim, currency explicit).
 *
 * LAZY EXPIRY (T012/T014): a stale hold on this page is processed through `ensureHoldFresh` (the
 * sole `expire_order_hold()` caller) before the page is rendered, then the page is re-read so what
 * the buyer sees is the database's own post-expiry truth. Only rows whose stored
 * `hold_expires_at` has passed ever trigger the RPC; nothing else is mutated. An order that no page
 * or action ever touches stays stale — no scheduler exists (spec Open Items).
 *
 * SECURITY: `isAuthorizedMember` re-verified server-side, independent of nav visibility (T018's
 * registry entry is presentational only).
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
  const organizationId = identity.organization.organizationId;

  let { rows, hasMore } = await getOrdersForOrganization({ organizationId, page, pageSize: PAGE_SIZE });

  const staleHolds = selectStaleHolds(rows);
  if (staleHolds.length > 0) {
    await Promise.all(staleHolds.map((stale) => ensureHoldFresh(stale.id)));
    ({ rows, hasMore } = await getOrdersForOrganization({ organizationId, page, pageSize: PAGE_SIZE }));
  }

  const financialsByOrder = await getOrderFinancialsForOrders({ orderIds: rows.map((order) => order.id) });
  const listRows: OrderListRow[] = rows.map((order) => ({ order, financials: financialsByOrder.get(order.id) ?? null }));

  const columns: TableCardListColumn<OrderListRow>[] = [
    {
      key: "code",
      header: <AppBilingual pick={(c) => c.orders.list.columns.code} />,
      primary: true,
      render: ({ order }) => (
        <span className="font-mono break-all text-foreground" dir="ltr">
          {order.orderCode}
        </span>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.orders.list.columns.status} />,
      render: ({ order }) => (
        <div className="flex flex-col items-start gap-1">
          <OrderStatusBadge status={order.status} />
          {order.status === "HOLD" && order.holdExpiresAt ? (
            <span className="text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
              {appCopy.orders.listExtra.holdUntil.replace("{time}", order.holdExpiresAt)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "amount",
      header: <AppBilingual pick={(c) => c.orders.listExtra.amountColumn} />,
      render: ({ financials }) => (
        <span className="font-mono tabular-nums text-foreground" dir="ltr">
          {financials ? `${financials.currency} ${financials.buyerTotalAmount}` : appCopy.orders.listExtra.amountPending}
        </span>
      ),
    },
    {
      key: "created",
      header: <AppBilingual pick={(c) => c.orders.listExtra.createdColumn} />,
      render: ({ order }) => (
        <span className="text-muted-foreground" dir="ltr">
          {order.createdAt}
        </span>
      ),
    },
    {
      key: "updated",
      header: <AppBilingual pick={(c) => c.orders.list.columns.updated} />,
      render: ({ order }) => (
        <span className="text-muted-foreground" dir="ltr">
          {order.updatedAt}
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
      render: ({ order }) => (
        <Link
          href={`/dashboard/orders/${order.id}`}
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

      {listRows.length === 0 && page === 0 ? (
        <EmptyState title={appCopy.orders.list.empty.title} description={appCopy.orders.list.empty.description} action={identity.organization.canBuy ? <StartOrderButton /> : undefined} />
      ) : (
        <>
          <TableCardList columns={columns} rows={listRows} getRowKey={(row) => row.order.id} caption={appCopy.orders.list.caption} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/orders?page=${page - 1}`} />}>
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
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/orders?page=${page + 1}`} />}>
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

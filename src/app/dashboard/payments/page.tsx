import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PaymentStatusBadge } from "@/components/finance/payment-status-badge";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getPaymentsForOrders } from "@/lib/finance/read";
import type { PaymentDTO } from "@/lib/finance/types";
import { getOrdersForOrganization } from "@/lib/orders/read";
import type { OrderSummary } from "@/lib/orders/validation";

export const metadata: Metadata = {
  title: "Payments",
};

const PAGE_SIZE = 25;

/**
 * Feature 008 T022 — the caller's own organization's payment state, one row per order that already
 * has a `payments` row (an order still in DRAFT, before checkout, has nothing finance-related to
 * show — it is simply absent, never a fabricated "no payment" row). Sourced ENTIRELY from
 * already-approved outputs: `getOrdersForOrganization` (Feature 007, buyer-scoped, existing) supplies
 * the bounded page of order ids; `getPaymentsForOrders` (Feature 008 T003's own read layer, a new
 * BOUNDED batch over exactly those ids — never an org-wide payments scan) supplies the payment state
 * for that same page. No money arithmetic: every amount rendered is `PaymentDTO.amount` verbatim.
 *
 * SCOPE (this list is the BUYER's own view — PS1: "A permitted buyer sees the stored amount,
 * currency, order/proforma reference, hold/payment state..."; "A permitted seller sees only their
 * payout record" is Feature 008 T023, not built here). `getOrdersForOrganization` is buyer-scoped by
 * its own established convention (`orders.buyer_organization_id = organizationId`); this list
 * therefore shows only orders the caller's organization BOUGHT. The detail page a row links to
 * relies on RLS alone (`payments_view`), which ALSO admits a seller-of-record on that specific order
 * — see the detail page's own header for why that is not duplicated here.
 *
 * NO ACTION: every row is a plain "View details" navigation link — no fund/approve/reject control
 * exists anywhere on this page (PS2, provider-neutral).
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
  const { rows: orders, hasMore } = await getOrdersForOrganization({ organizationId: identity.organization.organizationId, page, pageSize: PAGE_SIZE });
  const payments = await getPaymentsForOrders({ orderIds: orders.map((order) => order.id) });

  const rows = orders.filter((order) => payments.has(order.id)).map((order) => ({ order, payment: payments.get(order.id)! }));

  const columns: TableCardListColumn<{ order: OrderSummary; payment: PaymentDTO }>[] = [
    {
      key: "order",
      primary: true,
      header: <AppBilingual pick={(c) => c.finance.payments.list.columns.order} />,
      render: ({ order }) => (
        <span className="font-mono break-all text-foreground" dir="ltr">
          {order.orderCode}
        </span>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.finance.payments.list.columns.status} />,
      render: ({ payment }) => <PaymentStatusBadge status={payment.status} />,
    },
    {
      key: "amount",
      header: <AppBilingual pick={(c) => c.finance.payments.list.columns.amount} />,
      render: ({ payment }) => (
        <span className="font-mono tabular-nums text-foreground" dir="ltr">
          {payment.currency} {payment.amount}
        </span>
      ),
    },
    {
      key: "action",
      header: (
        <span className="sr-only">
          <AppBilingual pick={(c) => c.finance.payments.list.viewDetails} />
        </span>
      ),
      render: ({ order }) => (
        <Link
          href={`/dashboard/payments/${order.id}`}
          className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <AppBilingual pick={(c) => c.finance.payments.list.viewDetails} />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.finance.payments.list.title} />}
        description={<AppBilingual pick={(c) => c.finance.payments.list.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.finance.payments.list.breadcrumb} /> }]}
      />

      {rows.length === 0 && page === 0 ? (
        <EmptyState title={appCopy.finance.payments.list.empty.title} description={appCopy.finance.payments.list.empty.description} />
      ) : (
        <>
          <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.order.id} caption={appCopy.finance.payments.list.caption} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/payments?page=${page - 1}`} />}>
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
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/payments?page=${page + 1}`} />}>
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

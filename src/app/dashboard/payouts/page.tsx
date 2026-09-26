import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PayoutStatusBadge } from "@/components/finance/payout-status-badge";
import { formatMoney } from "@/components/orders/financial-summary";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getPayoutsForOrganization } from "@/lib/finance/read";
import type { PayoutDTO } from "@/lib/finance/types";

export const metadata: Metadata = {
  title: "Payouts",
};

const PAGE_SIZE = 25;

/**
 * Feature 008 T023 — the seller's own payout records (spec.md's third named primary surface,
 * `/dashboard/payouts`, alongside `/dashboard/payments`). Sourced entirely from
 * `getPayoutsForOrganization` (`lib/finance/read.ts`, T003/T006 — RLS-scoped `payouts_view`, snapshot
 * fields only, never recomputed). Gated on `canSell` exactly like `/dashboard/sales`
 * (Feature 006 T019's own established pattern, including its capability-required copy) — a
 * buyer-only organization can never have a `payouts` row at all (`payouts.seller_organization_id` is
 * only ever a MEMBER_SELLER line's seller), so this route reuses the SAME state instead of inventing
 * a new one.
 *
 * Every row links to `/dashboard/payments/{orderId}`. Since Feature 013 M3 (T063) that page shows a seller of the
 * order only its seller-safe view (`SellerOrderDetail`: its own lines through `v_seller_order_lines` plus its own
 * payout) — never the buyer's payment, totals or documents, which M3 removed from sellers. This list adds NO new
 * authorization surface, only a seller-scoped entry point.
 */
export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }
  if (!identity.organization.canSell) {
    return <StateScreen kind="forbidden" title={appCopy.listings.manage.capabilityRequired.title} description={appCopy.listings.manage.capabilityRequired.description} />;
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
  const { rows, hasMore } = await getPayoutsForOrganization({ organizationId: identity.organization.organizationId, page, pageSize: PAGE_SIZE });

  const columns: TableCardListColumn<PayoutDTO>[] = [
    {
      key: "order",
      primary: true,
      header: <AppBilingual pick={(c) => c.finance.payouts.list.columns.order} />,
      render: (payout) => (
        <span className="font-mono break-all text-foreground" dir="ltr">
          {payout.orderId}
        </span>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.finance.payouts.list.columns.status} />,
      render: (payout) => <PayoutStatusBadge status={payout.status} />,
    },
    {
      key: "amount",
      header: <AppBilingual pick={(c) => c.finance.payouts.list.columns.amount} />,
      render: (payout) => (
        <span className="font-mono tabular-nums text-foreground" dir="ltr">
          {formatMoney(payout.currency, payout.amount)}
        </span>
      ),
    },
    {
      key: "paidAt",
      header: <AppBilingual pick={(c) => c.finance.payouts.list.columns.paidAt} />,
      render: (payout) => (
        <span className="text-foreground" dir="ltr">
          {payout.paidAt ?? <AppBilingual pick={(c) => c.finance.payments.detail.notYetAssigned} />}
        </span>
      ),
    },
    {
      key: "action",
      header: (
        <span className="sr-only">
          <AppBilingual pick={(c) => c.finance.payouts.list.viewOrder} />
        </span>
      ),
      render: (payout) => (
        <Link
          href={`/dashboard/payments/${payout.orderId}`}
          className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <AppBilingual pick={(c) => c.finance.payouts.list.viewOrder} />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.finance.payouts.list.title} />}
        description={<AppBilingual pick={(c) => c.finance.payouts.list.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.finance.payouts.list.breadcrumb} /> }]}
      />

      {rows.length === 0 && page === 0 ? (
        <EmptyState title={appCopy.finance.payouts.list.empty.title} description={appCopy.finance.payouts.list.empty.description} />
      ) : (
        <>
          <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.finance.payouts.list.caption} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/payouts?page=${page - 1}`} />}>
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
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/payouts?page=${page + 1}`} />}>
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

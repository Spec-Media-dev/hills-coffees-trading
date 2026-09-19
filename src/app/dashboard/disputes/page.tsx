import type { Metadata } from "next";
import Link from "next/link";

import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { DisputeHonestyNotice } from "@/components/disputes/dispute-honesty-notice";
import { DisputeStatusBadge } from "@/components/disputes/dispute-status-badge";
import { RaiseDisputeForm } from "@/components/disputes/raise-dispute-form";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { listDisputesForMember } from "@/lib/disputes/read";
import type { MemberDisputeSummaryDTO } from "@/lib/disputes/types";
import { getOrdersForOrganization } from "@/lib/orders/read";

export const metadata: Metadata = {
  title: "Disputes",
};

const PAGE_SIZE = 25;
/** Upper bound of orders offered in the raise form (the order read's own maximum page). */
const RAISABLE_ORDER_LIMIT = 100;

/**
 * Feature 012 RUN A (T006) — the member's dispute list + raise-dispute entry point.
 *
 * SCOPE: `listDisputesForMember` returns ONLY disputes on orders the ACTING organization bought —
 * RLS (`disputes_view`) is the real boundary, the buyer-organization filter is defence in depth. The
 * raise form offers only the acting organization's own orders (`getOrdersForOrganization`); the
 * domain layer and `disputes_create` re-verify regardless of what the form offered.
 *
 * AUTH CONTRACT: identical to every other `/dashboard/*` page (e.g. `/dashboard/deliveries`) — no
 * acting organization → unauthorized; not `is_authorized_member()` (blocked user, suspended/not yet
 * approved organization) → forbidden, before any dispute data is read.
 *
 * HONESTY: the notice states plainly that raising a dispute freezes/holds nothing (DB-OPEN-09), that
 * updates are not sent as notifications (DB-BLOCK-04) and that files cannot be attached (DB-BLOCK-01).
 */
export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ page?: string; orderId?: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { page: pageParam, orderId: orderIdParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
  const organizationId = identity.organization.organizationId;
  const [{ rows, hasMore }, orders] = await Promise.all([
    listDisputesForMember({ organizationId, userId: identity.userId, page, pageSize: PAGE_SIZE }),
    getOrdersForOrganization({ organizationId, pageSize: RAISABLE_ORDER_LIMIT }),
  ]);
  const raisableOrders = orders.rows.map((order) => ({ id: order.id, orderCode: order.orderCode, status: order.status }));
  // RUN B (T007): "Raise a dispute on this order" prefills the select — honoured only when the id is
  // one of the acting organization's own orders just read above; anything else is ignored.
  const defaultOrderId = raisableOrders.some((order) => order.id === orderIdParam) ? orderIdParam : undefined;

  const columns: TableCardListColumn<MemberDisputeSummaryDTO>[] = [
    {
      key: "order",
      header: <AppBilingual pick={(c) => c.disputes.list.columns.order} />,
      primary: true,
      render: (row) => (
        <span className="font-mono break-all text-foreground" dir="ltr">
          {row.orderCode}
        </span>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.disputes.list.columns.status} />,
      render: (row) => <DisputeStatusBadge status={row.status} />,
    },
    {
      key: "opened",
      header: <AppBilingual pick={(c) => c.disputes.list.columns.opened} />,
      render: (row) => (
        <span className="text-muted-foreground">
          <AdminDateTime value={row.openedAt} fallback="—" />
        </span>
      ),
    },
    {
      key: "raisedBy",
      header: <AppBilingual pick={(c) => c.disputes.list.columns.raisedBy} />,
      render: (row) => (
        <span className="text-muted-foreground">
          <AppBilingual pick={(c) => (row.raisedByYou ? c.disputes.list.raisedByYou : c.disputes.list.raisedByColleague)} />
        </span>
      ),
    },
    {
      key: "action",
      header: (
        <span className="sr-only">
          <AppBilingual pick={(c) => c.disputes.list.viewDetails} />
        </span>
      ),
      render: (row) => (
        <Link
          href={`/dashboard/disputes/${row.id}`}
          className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <AppBilingual pick={(c) => c.disputes.list.viewDetails} />
          <span className="sr-only">
            {" "}
            <span dir="ltr">{row.orderCode}</span>
          </span>
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.disputes.list.title} />}
        description={<AppBilingual pick={(c) => c.disputes.list.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.disputes.list.breadcrumb} /> }]}
      />

      <DisputeHonestyNotice />

      <section aria-labelledby="raise-dispute-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="raise-dispute-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.raise.heading} />
        </h2>
        {raisableOrders.length === 0 ? (
          <div data-slot="dispute-no-orders" className="flex flex-col gap-1">
            <p className="text-[length:var(--text-small)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.disputes.raise.noOrders.title} />
            </p>
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.disputes.raise.noOrders.description} />
            </p>
          </div>
        ) : (
          <RaiseDisputeForm orders={raisableOrders} defaultOrderId={defaultOrderId} />
        )}
      </section>

      <section aria-labelledby="disputes-list-heading" className="flex flex-col gap-4">
        <h2 id="disputes-list-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.disputes.list.caption} />
        </h2>
        {rows.length === 0 && page === 0 ? (
          <div data-slot="empty-state" className="flex min-h-40 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-8 text-center">
            <Icon name="inbox" className="mb-4 size-8 text-muted-foreground" />
            <p className="hc-heading-3 font-semibold">
              <AppBilingual pick={(c) => c.disputes.list.empty.title} />
            </p>
            <p className="mt-2 max-w-[62ch] text-sm leading-[var(--lh-body)] text-muted-foreground">
              <AppBilingual pick={(c) => c.disputes.list.empty.description} />
            </p>
          </div>
        ) : (
          <>
            <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.disputes.list.caption} />

            {page > 0 || hasMore ? (
              <div className="flex items-center justify-between gap-4">
                {page > 0 ? (
                  <Link href={`/dashboard/disputes?page=${page - 1}`} className={buttonVariants({ variant: "outline" })}>
                    <AppBilingual pick={(c) => c.orders.list.pagination.previous} />
                  </Link>
                ) : (
                  <Button variant="outline" disabled>
                    <AppBilingual pick={(c) => c.orders.list.pagination.previous} />
                  </Button>
                )}
                <span className="text-[length:var(--text-small)] text-muted-foreground">
                  <AppBilingual pick={(c) => c.orders.list.pagination.pageLabel.replace("{page}", String(page + 1))} />
                </span>
                {hasMore ? (
                  <Link href={`/dashboard/disputes?page=${page + 1}`} className={buttonVariants({ variant: "outline" })}>
                    <AppBilingual pick={(c) => c.orders.list.pagination.next} />
                  </Link>
                ) : (
                  <Button variant="outline" disabled>
                    <AppBilingual pick={(c) => c.orders.list.pagination.next} />
                  </Button>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

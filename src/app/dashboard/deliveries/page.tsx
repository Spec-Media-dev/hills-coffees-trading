import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { ShipmentStatusBadge } from "@/components/delivery/shipment-status-badge";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getShipmentsForOrganization } from "@/lib/delivery/read";
import type { ShipmentWithOrderContextDTO } from "@/lib/delivery/types";

export const metadata: Metadata = {
  title: "Deliveries",
};

const PAGE_SIZE = 25;

/**
 * Feature 009 RUN C (T019) — the buyer's own shipment list, every status rendered with its exact
 * approved label (`ShipmentStatusBadge`, all 13 values). `getShipmentsForOrganization` (T019's own
 * new read) resolves ONLY the caller's own organization's shipments — RLS (`shipments_view`) is the
 * real boundary regardless of what this page's own query shapes; a cross-org id is never reachable
 * through this list at all (unlike the detail page, which must independently refuse one directly).
 */
export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
  const { rows, hasMore } = await getShipmentsForOrganization({ organizationId: identity.organization.organizationId, page, pageSize: PAGE_SIZE });

  const columns: TableCardListColumn<ShipmentWithOrderContextDTO>[] = [
    {
      key: "code",
      header: <AppBilingual pick={(c) => c.deliveries.list.columns.code} />,
      primary: true,
      render: (row) => (
        <span className="font-mono break-all text-foreground" dir="ltr">
          {row.shipmentCode}
        </span>
      ),
    },
    {
      key: "order",
      header: <AppBilingual pick={(c) => c.deliveries.list.columns.order} />,
      render: (row) => (
        <span className="font-mono break-all text-muted-foreground" dir="ltr">
          {row.orderCode}
        </span>
      ),
    },
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.deliveries.list.columns.status} />,
      render: (row) => <ShipmentStatusBadge status={row.status} />,
    },
    {
      key: "updated",
      header: <AppBilingual pick={(c) => c.deliveries.list.columns.updated} />,
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
          <AppBilingual pick={(c) => c.deliveries.list.viewDetails} />
        </span>
      ),
      render: (row) => (
        <Link
          href={`/dashboard/deliveries/${row.id}`}
          className="inline-flex min-h-11 min-w-11 items-center rounded-[var(--radius-sm)] px-1 text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <AppBilingual pick={(c) => c.deliveries.list.viewDetails} />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.deliveries.list.title} />}
        description={<AppBilingual pick={(c) => c.deliveries.list.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.deliveries.list.breadcrumb} /> }]}
      />

      {rows.length === 0 && page === 0 ? (
        <EmptyState title={appCopy.deliveries.list.empty.title} description={appCopy.deliveries.list.empty.description} />
      ) : (
        <>
          <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.deliveries.list.caption} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/deliveries?page=${page - 1}`} />}>
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
                <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/deliveries?page=${page + 1}`} />}>
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

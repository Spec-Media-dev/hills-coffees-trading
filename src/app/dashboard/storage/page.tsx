import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { TableCardList, type TableCardListColumn } from "@/components/dashboard/responsive/table-card-list";
import { StorageStatusBadge } from "@/components/inventory/storage-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getStorageAllocations } from "@/lib/inventory/allocations";
import type { StorageAllocation } from "@/lib/inventory/types";

export const metadata: Metadata = {
  title: "Storage",
};

const PAGE_SIZE = 25;

/**
 * Feature 005 RUN B (T010) — member storage/custody allocations.
 *
 * Reads exclusively through `lib/inventory/allocations.ts` (FR-001). `status` renders the database's
 * own closed vocabulary (`STORED`/`RELEASED`/`DELIVERED`) via `StorageStatusBadge` — no invented
 * synonym. `quantityKg`/`releasedQuantityKg` are shown as two separate authoritative fields, never
 * one derived from the other.
 *
 * ORDER REFERENCE (T010, RUN B reconciliation): `getStorageAllocations` resolves each allocation's
 * originating order through `order_items`/`orders`, gated by `can_view_order` at both steps — a
 * genuinely member-readable chain (empirically proven live; see
 * `lib/inventory/types.ts#StorageAllocationOrderContext`'s doc comment), unlike DB-OPEN-12's
 * `inventory_reservation_items`. This renders the order CODE as plain reference text, not a
 * hyperlink: no `/dashboard/orders/[id]` (or equivalent) destination exists yet in this codebase
 * (Features 007/008 own that surface) — linking to a route that does not exist would be exactly the
 * "guessed/fabricated relationship" the run directive forbids. When the order_item is absent or the
 * order genuinely is not readable, "Order reference unavailable" renders instead — never a raw id,
 * never a guess.
 */
export default async function StoragePage({
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

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);

  const { rows, hasMore } = await getStorageAllocations({
    organizationId: identity.organization.organizationId,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: TableCardListColumn<StorageAllocation>[] = [
    {
      key: "status",
      header: <AppBilingual pick={(c) => c.inventory.storage.columns.status} />,
      primary: true,
      render: (row) => <StorageStatusBadge status={row.status} />,
    },
    {
      key: "allocated",
      header: <AppBilingual pick={(c) => c.inventory.storage.columns.allocatedQuantity} />,
      render: (row) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {row.quantityKg} kg
        </span>
      ),
    },
    {
      key: "released",
      header: <AppBilingual pick={(c) => c.inventory.storage.columns.releasedQuantity} />,
      render: (row) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {row.releasedQuantityKg} kg
        </span>
      ),
    },
    {
      key: "order",
      header: <AppBilingual pick={(c) => c.inventory.storage.columns.order} />,
      render: (row) =>
        row.order ? (
          <span className="font-mono" dir="ltr">
            {row.order.orderCode ?? row.order.orderId}
          </span>
        ) : (
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.storage.orderUnavailable} />
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.inventory.storage.title} />}
        description={<AppBilingual pick={(c) => c.inventory.storage.description} />}
        trail={[{ label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" }, { label: <AppBilingual pick={(c) => c.inventory.storage.title} /> }]}
      />

      {rows.length === 0 && page === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-8 text-center">
          <h2 className="hc-heading-4 font-semibold text-foreground">
            <AppBilingual pick={(c) => c.inventory.storage.empty.title} />
          </h2>
          <p className="mt-2 text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.inventory.storage.empty.description} />
          </p>
        </div>
      ) : (
        <>
          <TableCardList columns={columns} rows={rows} getRowKey={(row) => row.id} caption={appCopy.inventory.storage.caption} />

          {page > 0 || hasMore ? (
            <div className="flex items-center justify-between gap-4">
              {page > 0 ? (
                <Button variant="outline" render={<Link href={`/dashboard/storage?page=${page - 1}`} />}>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.previous} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.previous} />
                </Button>
              )}
              <span className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.inventory.list.pagination.pageLabel.replace("{page}", String(page + 1))} />
              </span>
              {hasMore ? (
                <Button variant="outline" render={<Link href={`/dashboard/storage?page=${page + 1}`} />}>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.next} />
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <AppBilingual pick={(c) => c.inventory.list.pagination.next} />
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

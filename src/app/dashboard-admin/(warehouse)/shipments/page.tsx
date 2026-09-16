import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { ShipmentStatusBadge } from "@/components/delivery/shipment-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { DEFAULT_WAREHOUSE_QUEUE, WAREHOUSE_QUEUE_KEYS, isWarehouseQueueKey, listWarehouseQueue, type WarehouseQueueRow } from "@/lib/admin/warehouse";
import { formatQuantity } from "@/lib/dashboard/format";

/**
 * Feature 010 RUN D (T016) — the warehouse shipment queues. Each queue is Feature 009's own
 * `getShipmentsForWarehouseQueue` read for the exact status set `WAREHOUSE_QUEUES` declares (the
 * live `order_shipments.status` vocabulary), rendered with Feature 009's `ShipmentStatusBadge`
 * (label + dot, never colour alone) and quantities always in kg. The page re-verifies
 * `is_warehouse_operator()` itself (segments render in parallel); a direct URL with the wrong role
 * renders the forbidden state, never the queue. Order references degrade honestly for a pure
 * WAREHOUSE role (no `orders` read path) — the gap is stated, nothing is invented.
 */
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ queue?: string; page?: string }> }) {
  const access = await checkAreaAccess("shipments");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_warehouse_operator" />;

  const params = await searchParams;
  const queue = isWarehouseQueueKey(params.queue) ? params.queue : DEFAULT_WAREHOUSE_QUEUE;
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);

  let result: Awaited<ReturnType<typeof listWarehouseQueue>> | null = null;
  try {
    result = await listWarehouseQueue({ queue, page });
  } catch {
    result = null;
  }
  const orderGap = result?.rows.some((row) => row.orderCode === null) ?? false;

  const columns = [
    {
      key: "shipment",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.shipment} />,
      render: (row: WarehouseQueueRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="break-all font-mono font-medium text-foreground" dir="ltr">
            {row.shipmentCode}
          </span>
          <span className="font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.id}
          </span>
        </span>
      ),
    },
    {
      key: "order",
      header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.order} />,
      render: (row: WarehouseQueueRow) =>
        row.orderCode ? (
          <span className="font-mono" dir="ltr">
            {row.orderCode}
          </span>
        ) : (
          <span className="text-[length:var(--text-micro)] text-muted-foreground" data-order-gap>
            <AppBilingual pick={(c) => c.admin.warehouse.common.orderUnavailable} />
          </span>
        ),
    },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.status} />, render: (row: WarehouseQueueRow) => <ShipmentStatusBadge status={row.status} /> },
    { key: "method", header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.method} />, render: (row: WarehouseQueueRow) => <span>{row.deliveryMethod}</span> },
    {
      key: "destination",
      header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.destination} />,
      render: (row: WarehouseQueueRow) => (
        <span className="text-[length:var(--text-small)]">
          {row.city ? `${row.city}, ` : ""}
          <span dir="ltr">{row.countryCode}</span>
        </span>
      ),
    },
    {
      key: "planned",
      header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.planned} />,
      render: (row: WarehouseQueueRow) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {formatQuantity(row.totals.plannedQuantityKg, "kg")}
        </span>
      ),
    },
    {
      key: "delivered",
      header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.delivered} />,
      render: (row: WarehouseQueueRow) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {formatQuantity(row.totals.deliveredQuantityKg, "kg")}
        </span>
      ),
    },
    {
      key: "updated",
      header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.updated} />,
      render: (row: WarehouseQueueRow) => <AdminDateTime value={row.updatedAt} fallback={<AppBilingual pick={(c) => c.admin.warehouse.common.notRecorded} />} />,
    },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.open} />,
      render: (row: WarehouseQueueRow) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/shipments/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.warehouse.shipments.columns.open} />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.warehouse.shipments.title} />}
        description={<AppBilingual pick={(c) => c.admin.warehouse.shipments.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.groups.warehouse} /> },
          { label: <AppBilingual pick={(c) => c.admin.warehouse.shipments.breadcrumb} /> },
        ]}
      />

      <nav aria-label={appCopy.admin.warehouse.shipments.title} className="flex flex-wrap gap-2" data-warehouse-queue={queue}>
        {WAREHOUSE_QUEUE_KEYS.map((key) => (
          <Button key={key} variant={key === queue ? "primary" : "outline"} size="sm" nativeButton={false} aria-current={key === queue ? "page" : undefined} render={<Link href={key === DEFAULT_WAREHOUSE_QUEUE ? "/dashboard-admin/shipments" : `/dashboard-admin/shipments?queue=${key}`} />}>
            <AppBilingual pick={(c) => c.admin.warehouse.shipments.queues[key]} />
          </Button>
        ))}
      </nav>
      <p className="text-[length:var(--text-small)] text-muted-foreground">
        <AppBilingual pick={(c) => c.admin.warehouse.shipments.queueDescriptions[queue]} />
      </p>

      {result === null ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.warehouse.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.common.loadError.description} />} />
      ) : (
        <>
          <TableCardList
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
            caption={appCopy.admin.warehouse.shipments.caption}
            emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.warehouse.shipments.empty.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.shipments.empty.description} />} />}
          />
          {orderGap ? (
            <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-read-gap-note>
              <AppBilingual pick={(c) => c.admin.warehouse.common.readGapNote} />
            </p>
          ) : null}
          {result.hasMore || page > 0 ? (
            <div className="flex justify-end gap-2">
              {page > 0 ? (
                <Button variant="outline" size="sm" nativeButton={false} aria-label={appCopy.admin.warehouse.common.previous} render={<Link href={`/dashboard-admin/shipments?queue=${queue}&page=${page - 1}`} />}>
                  ‹
                </Button>
              ) : null}
              {result.hasMore ? (
                <Button variant="outline" size="sm" nativeButton={false} aria-label={appCopy.admin.warehouse.common.next} render={<Link href={`/dashboard-admin/shipments?queue=${queue}&page=${page + 1}`} />}>
                  ›
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { StorageStatusBadge } from "@/components/inventory/storage-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { formatQuantity } from "@/lib/dashboard/format";
import { getStorageAllocationsForWarehouseOversight } from "@/lib/inventory/allocations";
import { getInventoryPositionForWarehouseOversight } from "@/lib/inventory/positions";
import type { StorageAllocation } from "@/lib/inventory/types";

/**
 * Feature 010 RUN D (T019) — one inventory position for warehouse oversight (cross-organization by
 * design; the route group and this page both verify `is_warehouse_operator()`), plus the storage
 * allocations sharing its lot / owner / warehouse — Feature 005's own DTOs, read-only, verbatim.
 * `availableQuantityKg` is "On hand (gross)"; `reservedQuantityKg` is "Reserved"; nothing else is
 * derived. No control on this page changes a quantity (no approved warehouse adjustment operation
 * exists — see the T020 gap on the inventory list).
 */

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
      <dt className="text-[length:var(--text-small)] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[length:var(--text-small)] text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function InventoryPositionPage({ params }: { params: Promise<{ positionId: string }> }) {
  const access = await checkAreaAccess("inventory");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_warehouse_operator" />;

  const { positionId } = await params;
  const position = /^[0-9a-f-]{36}$/i.test(positionId) ? await getInventoryPositionForWarehouseOversight({ positionId }) : null;
  const trail = [
    { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
    { label: <AppBilingual pick={(c) => c.admin.warehouse.inventory.breadcrumb} />, href: "/dashboard-admin/inventory" },
    { label: <AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.breadcrumb} /> },
  ];

  if (!position) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.title} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.warehouse.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/inventory" />}>
            <AppBilingual pick={(c) => c.admin.warehouse.common.backToInventory} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }

  const allocations = await getStorageAllocationsForWarehouseOversight({ lotId: position.lotId, ownerOrganizationId: position.ownerOrganizationId, warehouseId: position.warehouseId, pageSize: 100 });
  const notRecorded = <AppBilingual pick={(c) => c.admin.warehouse.common.notRecorded} />;

  const columns = [
    {
      key: "allocation",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.status} />,
      render: (row: StorageAllocation) => (
        <span className="flex min-w-0 flex-col gap-1">
          <StorageStatusBadge status={row.status} />
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.id}
          </span>
        </span>
      ),
    },
    {
      key: "allocated",
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.allocated} />,
      render: (row: StorageAllocation) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {formatQuantity(row.quantityKg, "kg")}
        </span>
      ),
    },
    {
      key: "released",
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.released} />,
      render: (row: StorageAllocation) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {formatQuantity(row.releasedQuantityKg, "kg")}
        </span>
      ),
    },
    {
      key: "order",
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.order} />,
      render: (row: StorageAllocation) =>
        row.order?.orderCode ? (
          <span className="font-mono" dir="ltr">
            {row.order.orderCode}
          </span>
        ) : row.orderItemId ? (
          <span className="text-[length:var(--text-micro)] text-muted-foreground" data-order-gap>
            <AppBilingual pick={(c) => c.admin.warehouse.common.orderUnavailable} />
          </span>
        ) : (
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.warehouse.common.none} />
          </span>
        ),
    },
    { key: "started", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.started} />, render: (row: StorageAllocation) => <AdminDateTime value={row.startedAt} fallback={notRecorded} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={position.lot ? position.lot.lotCode : <AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.title} />}
        description={
          <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
            {position.id}
          </span>
        }
        trail={trail}
      />

      <section data-position-section="identity" className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
        <dl className="divide-y divide-border">
          <Row label={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.lot} />}>
            {position.lot ? <span>{position.lot.coffeeName ? `${position.lot.coffeeName} · ${position.lot.lotCode}` : position.lot.lotCode}</span> : null}
            <span className="block font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
              {position.lotId}
            </span>
            {!position.lot ? (
              <span className="block text-[length:var(--text-micro)] text-muted-foreground" data-lot-gap>
                <AppBilingual pick={(c) => c.admin.warehouse.common.lotUnavailable} />
              </span>
            ) : null}
          </Row>
          <Row label={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.owner} />}>
            <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
              {position.ownerOrganizationId}
            </span>
            <span className="block text-[length:var(--text-micro)] text-muted-foreground" data-organization-gap>
              <AppBilingual pick={(c) => c.admin.warehouse.common.organizationUnavailable} />
            </span>
          </Row>
          <Row label={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.warehouse} />}>
            {position.warehouse ? (
              <>
                <span>{position.warehouse.name}</span>
                <span className="block font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
                  {position.warehouse.code}
                  {position.warehouse.city ? ` · ${position.warehouse.city}` : ""}
                  {position.warehouse.countryCode ? ` · ${position.warehouse.countryCode}` : ""}
                </span>
                {!position.warehouse.isActive ? (
                  <span className="block text-[length:var(--text-micro)] text-[var(--status-danger)]" data-warehouse-inactive>
                    <AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.warehouseInactive} />
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.warehouse.common.warehouseUnavailable} />
              </span>
            )}
          </Row>
          <Row label={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.location} />}>
            {position.warehouse?.locationCode ? (
              <span dir="ltr">{position.warehouse.locationName ? `${position.warehouse.locationCode} · ${position.warehouse.locationName}` : position.warehouse.locationCode}</span>
            ) : (
              <span className="text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.warehouse.common.none} />
              </span>
            )}
          </Row>
          <Row label={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.onHand} />}>
            <span className="font-mono tabular-nums" dir="ltr" data-on-hand={position.availableQuantityKg}>
              {formatQuantity(position.availableQuantityKg, "kg")}
            </span>
          </Row>
          <Row label={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.reserved} />}>
            <span className="font-mono tabular-nums" dir="ltr" data-reserved={position.reservedQuantityKg}>
              {formatQuantity(position.reservedQuantityKg, "kg")}
            </span>
          </Row>
          <Row label={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.createdAt} />}>
            <AdminDateTime value={position.createdAt} fallback={notRecorded} />
          </Row>
          <Row label={<AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.updatedAt} />}>
            <AdminDateTime value={position.updatedAt} fallback={notRecorded} />
          </Row>
        </dl>
        <p className="mt-3 text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.warehouse.inventory.semantics.free} />
        </p>
      </section>

      <section data-position-section="allocations" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
        <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.allocationsHeading} />
        </h2>
        <TableCardList
          columns={columns}
          rows={allocations.rows}
          getRowKey={(row) => row.id}
          caption={appCopy.admin.warehouse.inventory.detail.allocationsHeading}
          emptyState={
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.warehouse.inventory.detail.allocationsNone} />
            </p>
          }
        />
      </section>
    </div>
  );
}

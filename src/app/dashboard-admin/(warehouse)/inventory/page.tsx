import Link from "next/link";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { ReconciliationGapNotice } from "@/components/admin/warehouse/reconciliation-gap-notice";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { StorageStatusBadge } from "@/components/inventory/storage-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { formatQuantity } from "@/lib/dashboard/format";
import { getStorageAllocationsForWarehouseOversight } from "@/lib/inventory/allocations";
import { getInventoryPositionsForWarehouseOversight } from "@/lib/inventory/positions";
import type { InventoryPosition, StorageAllocation } from "@/lib/inventory/types";

/**
 * Feature 010 RUN D (T019/T020) — cross-organization custody/inventory oversight for warehouse
 * operators. Two read-only views over Feature 005's own read model (the warehouse-oversight variants
 * of its position/allocation reads — same DTOs, same mappers, RLS `inventory_owner_read` /
 * `storage_owner_read`'s `is_warehouse_operator()` branch as the real boundary):
 *
 * - Positions: `availableQuantityKg` is labelled "On hand (gross)" and `reservedQuantityKg`
 *   "Reserved" — the authoritative stored values, which now include Feature 009's live delivery
 *   reservation. No third figure is computed here (LOT-02; T019 Verify).
 * - Storage allocations: the approved `STORED`/`RELEASED`/`DELIVERED` vocabulary, verbatim.
 *
 * T020: no variance/reconciliation/HOLD/QUARANTINE representation exists in the approved schema, so
 * no reconciliation screen is built — the notice states the gap and the minimum future capability.
 * Not a placeholder: the page performs its own `is_warehouse_operator()` check and shows real rows.
 */
const PAGE_SIZE = 50;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const access = await checkAreaAccess("inventory");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_warehouse_operator" />;

  const params = await searchParams;
  const view = params.view === "allocations" ? "allocations" : "positions";
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);

  let positions: Awaited<ReturnType<typeof getInventoryPositionsForWarehouseOversight>> | null = null;
  let allocations: Awaited<ReturnType<typeof getStorageAllocationsForWarehouseOversight>> | null = null;
  try {
    if (view === "positions") positions = await getInventoryPositionsForWarehouseOversight({ page, pageSize: PAGE_SIZE });
    else allocations = await getStorageAllocationsForWarehouseOversight({ page, pageSize: PAGE_SIZE });
  } catch {
    positions = null;
    allocations = null;
  }
  const loadFailed = view === "positions" ? positions === null : allocations === null;
  const hasMore = view === "positions" ? (positions?.hasMore ?? false) : (allocations?.hasMore ?? false);

  const lotCell = (lotId: string, lot: InventoryPosition["lot"]) => (
    <span className="flex min-w-0 flex-col">
      {lot ? <span className="[overflow-wrap:anywhere] font-medium text-foreground">{lot.coffeeName ? `${lot.coffeeName} · ${lot.lotCode}` : lot.lotCode}</span> : null}
      <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
        {lotId}
      </span>
      {!lot ? (
        <span className="text-[length:var(--text-micro)] text-muted-foreground" data-lot-gap>
          <AppBilingual pick={(c) => c.admin.warehouse.common.lotUnavailable} />
        </span>
      ) : null}
    </span>
  );
  const ownerCell = (organizationId: string) => (
    <span className="flex min-w-0 flex-col">
      <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">
        {organizationId}
      </span>
      <span className="text-[length:var(--text-micro)] text-muted-foreground" data-organization-gap>
        <AppBilingual pick={(c) => c.admin.warehouse.common.organizationUnavailable} />
      </span>
    </span>
  );
  const warehouseCell = (warehouse: InventoryPosition["warehouse"], warehouseId: string) =>
    warehouse ? (
      <span className="flex min-w-0 flex-col">
        <span className="[overflow-wrap:anywhere] text-foreground">{warehouse.name}</span>
        <span className="font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
          {warehouse.code}
          {warehouse.city ? ` · ${warehouse.city}` : ""}
        </span>
      </span>
    ) : (
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
          {warehouseId}
        </span>
        <span className="text-[length:var(--text-micro)] text-muted-foreground">
          <AppBilingual pick={(c) => c.admin.warehouse.common.warehouseUnavailable} />
        </span>
      </span>
    );
  const kg = (value: number, attr?: Record<string, string | number>) => (
    <span className="font-mono tabular-nums" dir="ltr" {...attr}>
      {formatQuantity(value, "kg")}
    </span>
  );

  const positionColumns = [
    { key: "lot", primary: true, header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.lot} />, render: (row: InventoryPosition) => lotCell(row.lotId, row.lot) },
    { key: "owner", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.owner} />, render: (row: InventoryPosition) => ownerCell(row.ownerOrganizationId) },
    { key: "warehouse", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.warehouse} />, render: (row: InventoryPosition) => warehouseCell(row.warehouse, row.warehouseId) },
    {
      key: "location",
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.location} />,
      render: (row: InventoryPosition) =>
        row.warehouse?.locationCode ? (
          <span dir="ltr">{row.warehouse.locationName ? `${row.warehouse.locationCode} · ${row.warehouse.locationName}` : row.warehouse.locationCode}</span>
        ) : (
          <span className="text-muted-foreground">
            <AppBilingual pick={(c) => c.admin.warehouse.common.none} />
          </span>
        ),
    },
    { key: "onHand", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.onHand} />, render: (row: InventoryPosition) => kg(row.availableQuantityKg, { "data-on-hand": row.availableQuantityKg }) },
    { key: "reserved", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.reserved} />, render: (row: InventoryPosition) => kg(row.reservedQuantityKg, { "data-reserved": row.reservedQuantityKg }) },
    { key: "updated", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.updated} />, render: (row: InventoryPosition) => <AdminDateTime value={row.updatedAt} fallback={<AppBilingual pick={(c) => c.admin.warehouse.common.notRecorded} />} /> },
    {
      key: "open",
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.open} />,
      render: (row: InventoryPosition) => (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard-admin/inventory/${row.id}`} />}>
          <AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.columns.open} />
        </Button>
      ),
    },
  ];

  const allocationColumns = [
    { key: "lot", primary: true, header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.lot} />, render: (row: StorageAllocation) => lotCell(row.lotId, null) },
    { key: "owner", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.owner} />, render: (row: StorageAllocation) => ownerCell(row.ownerOrganizationId) },
    {
      key: "warehouse",
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.warehouse} />,
      render: (row: StorageAllocation) => (
        <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
          {row.warehouseId}
        </span>
      ),
    },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.status} />, render: (row: StorageAllocation) => <StorageStatusBadge status={row.status} /> },
    { key: "allocated", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.allocated} />, render: (row: StorageAllocation) => kg(row.quantityKg) },
    { key: "released", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.released} />, render: (row: StorageAllocation) => kg(row.releasedQuantityKg) },
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
    { key: "started", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.started} />, render: (row: StorageAllocation) => <AdminDateTime value={row.startedAt} fallback={<AppBilingual pick={(c) => c.admin.warehouse.common.notRecorded} />} /> },
  ];

  const viewHref = (target: "positions" | "allocations", targetPage = 0) => `/dashboard-admin/inventory${target === "allocations" ? "?view=allocations" : ""}${targetPage > 0 ? `${target === "allocations" ? "&" : "?"}page=${targetPage}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.admin.warehouse.inventory.title} />}
        description={<AppBilingual pick={(c) => c.admin.warehouse.inventory.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
          { label: <AppBilingual pick={(c) => c.admin.groups.warehouse} /> },
          { label: <AppBilingual pick={(c) => c.admin.warehouse.inventory.breadcrumb} /> },
        ]}
        actions={
          <nav aria-label={appCopy.admin.warehouse.inventory.title} className="flex flex-wrap gap-2" data-inventory-view={view}>
            <Button variant={view === "positions" ? "primary" : "outline"} size="sm" nativeButton={false} aria-current={view === "positions" ? "page" : undefined} render={<Link href={viewHref("positions")} />}>
              <AppBilingual pick={(c) => c.admin.warehouse.inventory.views.positions} />
            </Button>
            <Button variant={view === "allocations" ? "primary" : "outline"} size="sm" nativeButton={false} aria-current={view === "allocations" ? "page" : undefined} render={<Link href={viewHref("allocations")} />}>
              <AppBilingual pick={(c) => c.admin.warehouse.inventory.views.allocations} />
            </Button>
          </nav>
        }
      />

      <section data-inventory-semantics className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-subtle)] p-4">
        <h2 className="text-[length:var(--text-small)] font-semibold text-foreground">
          <AppBilingual pick={(c) => c.admin.warehouse.inventory.semantics.heading} />
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
          <li>
            <AppBilingual pick={(c) => c.admin.warehouse.inventory.semantics.onHand} />
          </li>
          <li>
            <AppBilingual pick={(c) => c.admin.warehouse.inventory.semantics.reserved} />
          </li>
          <li>
            <AppBilingual pick={(c) => c.admin.warehouse.inventory.semantics.free} />
          </li>
        </ul>
      </section>

      {loadFailed ? (
        <AdminStateCard kind="error" icon="warning" title={<AppBilingual pick={(c) => c.admin.warehouse.common.loadError.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.common.loadError.description} />} />
      ) : view === "positions" && positions ? (
        <TableCardList
          columns={positionColumns}
          rows={positions.rows}
          getRowKey={(row) => row.id}
          caption={appCopy.admin.warehouse.inventory.positions.caption}
          emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.empty.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.inventory.positions.empty.description} />} />}
        />
      ) : allocations ? (
        <TableCardList
          columns={allocationColumns}
          rows={allocations.rows}
          getRowKey={(row) => row.id}
          caption={appCopy.admin.warehouse.inventory.allocations.caption}
          emptyState={<AdminStateCard kind="empty" icon="inbox" className="min-h-0 py-4" title={<AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.empty.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.empty.description} />} />}
        />
      ) : null}

      {!loadFailed && (hasMore || page > 0) ? (
        <div className="flex justify-end gap-2">
          {page > 0 ? (
            <Button variant="outline" size="sm" nativeButton={false} aria-label={appCopy.admin.warehouse.common.previous} render={<Link href={viewHref(view, page - 1)} />}>
              ‹
            </Button>
          ) : null}
          {hasMore ? (
            <Button variant="outline" size="sm" nativeButton={false} aria-label={appCopy.admin.warehouse.common.next} render={<Link href={viewHref(view, page + 1)} />}>
              ›
            </Button>
          ) : null}
        </div>
      ) : null}

      {!loadFailed ? (
        <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-read-gap-note>
          <AppBilingual pick={(c) => c.admin.warehouse.common.readGapNote} />
        </p>
      ) : null}

      <ReconciliationGapNotice />
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminDateTime } from "@/components/admin/compliance/date-time";
import { AdminStateCard } from "@/components/admin/state-card";
import { RecordDeliveryForm } from "@/components/admin/warehouse/record-delivery-form";
import { ShipmentOperationsPanel } from "@/components/admin/warehouse/shipment-operations-panel";
import { PageHeader } from "@/components/app/page-header";
import { TableCardList } from "@/components/dashboard/responsive/table-card-list";
import { ShipmentStatusBadge } from "@/components/delivery/shipment-status-badge";
import { StorageStatusBadge } from "@/components/inventory/storage-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { checkAreaAccess } from "@/lib/admin/guards";
import { canRecordDelivery, displayableOperations, getWarehouseShipmentDetail, queueForStatus } from "@/lib/admin/warehouse";
import type { ShipmentItemDTO } from "@/lib/delivery/types";
import { formatQuantity } from "@/lib/dashboard/format";
import type { StorageAllocation } from "@/lib/inventory/types";

/**
 * Feature 010 RUN D (T016–T018) — one shipment for the warehouse: identity/destination/contact
 * (warehouse-authorized session only — the route group and this page both verify
 * `is_warehouse_operator()`), per-item planned vs. delivered quantities exactly as stored, the linked
 * Feature 005 custody record (read-only), the operations valid for the current state (T017) and the
 * delivered-quantity form when the shipment is dispatched (T018). Every mutation goes through the
 * Server Actions → `lib/admin/warehouse.ts` → Feature 009's named operations; nothing here writes.
 */

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4">
      <dt className="text-[length:var(--text-small)] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[length:var(--text-small)] text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

const notRecorded = <AppBilingual pick={(c) => c.admin.warehouse.common.notRecorded} />;

export default async function WarehouseShipmentPage({ params }: { params: Promise<{ shipmentId: string }> }) {
  const access = await checkAreaAccess("shipments");
  if (!access.ok) return <AdminAccessDenied denial={access.denial} requiredFunction="is_warehouse_operator" />;

  const { shipmentId } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(shipmentId) ? await getWarehouseShipmentDetail({ shipmentId }) : null;
  const trail = [
    { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard-admin" },
    { label: <AppBilingual pick={(c) => c.admin.warehouse.shipments.breadcrumb} />, href: "/dashboard-admin/shipments" },
    { label: <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.breadcrumb} /> },
  ];

  if (!detail) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.title} />} trail={trail} />
        <AdminStateCard kind="not-found" title={<AppBilingual pick={(c) => c.admin.warehouse.common.notFound.title} />} description={<AppBilingual pick={(c) => c.admin.warehouse.common.notFound.description} />}>
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard-admin/shipments" />}>
            <AppBilingual pick={(c) => c.admin.warehouse.common.backToShipments} />
          </Button>
        </AdminStateCard>
      </div>
    );
  }

  const { shipment, items, orderItems, custody, custodyResolvedWithoutOrganization } = detail;
  const itemLabels: Record<string, string> = Object.fromEntries(orderItems.map((item) => [item.id, item.productNameSnapshot]));
  const operations = displayableOperations(shipment.status);
  const queue = queueForStatus(shipment.status);
  const readGap = shipment.orderCode === null || shipment.buyerOrganizationId === null || orderItems.length === 0;

  const itemColumns = [
    {
      key: "item",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.delivery.item} />,
      render: (row: ShipmentItemDTO) =>
        itemLabels[row.orderItemId] ? (
          <span className="text-foreground">{itemLabels[row.orderItemId]}</span>
        ) : (
          <span className="flex min-w-0 flex-col">
            <span className="text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.itemFallback} />
            </span>
            <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">
              {row.orderItemId}
            </span>
          </span>
        ),
    },
    {
      key: "planned",
      header: <AppBilingual pick={(c) => c.deliveries.detail.itemsTable.planned} />,
      render: (row: ShipmentItemDTO) => (
        <span className="font-mono tabular-nums" dir="ltr">
          {formatQuantity(row.plannedQuantityKg, "kg")}
        </span>
      ),
    },
    {
      key: "delivered",
      header: <AppBilingual pick={(c) => c.deliveries.detail.itemsTable.delivered} />,
      render: (row: ShipmentItemDTO) => (
        <span className="font-mono tabular-nums" dir="ltr" data-item-delivered={row.deliveredQuantityKg}>
          {formatQuantity(row.deliveredQuantityKg, "kg")}
        </span>
      ),
    },
    {
      key: "progress",
      header: <AppBilingual pick={(c) => c.deliveries.detail.itemsTable.progress} />,
      render: (row: ShipmentItemDTO) => (
        <span className="text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual
            pick={(c) => {
              const t = c.deliveries.detail.itemsTable;
              return row.deliveredQuantityKg <= 0 ? t.notStarted : row.deliveredQuantityKg < row.plannedQuantityKg ? t.partial : t.complete;
            }}
          />
        </span>
      ),
    },
  ];

  const custodyColumns = [
    {
      key: "allocation",
      primary: true,
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.lot} />,
      render: (row: StorageAllocation) => (
        <span className="flex min-w-0 flex-col">
          <span className="break-all font-mono text-[length:var(--text-micro)]" dir="ltr">
            {row.lotId}
          </span>
          <span className="break-all font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
            {row.id}
          </span>
        </span>
      ),
    },
    { key: "status", header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.status} />, render: (row: StorageAllocation) => <StorageStatusBadge status={row.status} /> },
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
      key: "owner",
      header: <AppBilingual pick={(c) => c.admin.warehouse.inventory.allocations.columns.owner} />,
      render: (row: StorageAllocation) => (
        <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
          {row.ownerOrganizationId}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="font-mono break-all" dir="ltr">
            {shipment.shipmentCode}
          </span>
        }
        description={
          <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
            {shipment.id}
          </span>
        }
        trail={trail}
        actions={<ShipmentStatusBadge status={shipment.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section data-shipment-section="identity" className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <dl className="divide-y divide-border">
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.queue} />}>{queue ? <AppBilingual pick={(c) => c.admin.warehouse.shipments.queues[queue]} /> : <AppBilingual pick={(c) => c.deliveries.status.DRAFT} />}</Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.order} />}>
                {shipment.orderCode ? (
                  <span className="font-mono" dir="ltr">
                    {shipment.orderCode}
                  </span>
                ) : (
                  <span className="text-muted-foreground" data-order-gap>
                    <AppBilingual pick={(c) => c.admin.warehouse.common.orderUnavailable} />
                  </span>
                )}
                <span className="block font-mono text-[length:var(--text-micro)] text-muted-foreground" dir="ltr">
                  {shipment.orderId}
                </span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.buyerOrganization} />}>
                {shipment.buyerOrganizationId ? (
                  <span className="font-mono text-[length:var(--text-micro)]" dir="ltr">
                    {shipment.buyerOrganizationId}
                  </span>
                ) : (
                  <span className="text-muted-foreground" data-organization-gap>
                    <AppBilingual pick={(c) => c.admin.warehouse.common.organizationUnavailable} />
                  </span>
                )}
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.method} />}>{shipment.deliveryMethod}</Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.destination} />}>
                {shipment.addressLine}
                {shipment.city ? `, ${shipment.city}` : ""}, <span dir="ltr">{shipment.countryCode}</span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.contact} />}>
                {shipment.contactName} · <span dir="ltr">{shipment.contactPhone}</span>
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.readyAt} />}>
                <AdminDateTime value={shipment.readyAt} fallback={notRecorded} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.deliveredAt} />}>
                <AdminDateTime value={shipment.deliveredAt} fallback={notRecorded} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.createdAt} />}>
                <AdminDateTime value={shipment.createdAt} fallback={notRecorded} />
              </Row>
              <Row label={<AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.updatedAt} />}>
                <AdminDateTime value={shipment.updatedAt} fallback={notRecorded} />
              </Row>
            </dl>
            {readGap ? (
              <p className="mt-3 rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-read-gap-note>
                <AppBilingual pick={(c) => c.admin.warehouse.common.readGapNote} />
              </p>
            ) : null}
          </section>

          <section data-shipment-section="items" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
                <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.itemsHeading} />
              </h2>
              <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.itemsLead} />
              </p>
            </div>
            <TableCardList columns={itemColumns} rows={items} getRowKey={(row) => row.id} caption={appCopy.admin.warehouse.shipments.detail.itemsHeading} emptyState={<p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.admin.warehouse.common.none}</p>} />
          </section>

          <section data-shipment-section="custody" className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-card)] p-5">
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
                <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.custodyHeading} />
              </h2>
              <p className="text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.custodyLead} />
              </p>
            </div>
            <TableCardList
              columns={custodyColumns}
              rows={custody}
              getRowKey={(row) => row.id}
              caption={appCopy.admin.warehouse.shipments.detail.custodyHeading}
              emptyState={
                <p className="text-[length:var(--text-small)] text-muted-foreground">
                  <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.custodyNone} />
                </p>
              }
            />
            {custodyResolvedWithoutOrganization ? (
              <p className="text-[length:var(--text-micro)] text-muted-foreground" data-custody-by-item>
                <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.custodyByItemNote} />
              </p>
            ) : null}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ShipmentOperationsPanel shipmentId={shipment.id} status={shipment.status} operations={operations} />

          {shipment.status === "DRAFT" ? (
            <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-state-note="draft">
              <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.draftNote} />
            </p>
          ) : null}
          {shipment.status === "FAILED" || shipment.status === "DISPUTED" ? (
            <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-state-note="held">
              <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.heldNote} />
            </p>
          ) : null}
          {shipment.status === "DELIVERED" || shipment.status === "CANCELLED" ? (
            <p className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-subtle)] px-4 py-3 text-[length:var(--text-small)] leading-[var(--lh-body)] text-muted-foreground" data-state-note="terminal">
              <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.terminalNote} />
            </p>
          ) : null}

          {canRecordDelivery(shipment.status) ? (
            <RecordDeliveryForm shipmentId={shipment.id} items={items} itemLabels={itemLabels} />
          ) : (
            <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-[var(--surface-subtle)] p-5" data-delivery-form="not-applicable">
              <h2 className="font-heading text-[length:var(--text-h4)] font-semibold text-foreground">
                <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.delivery.heading} />
              </h2>
              <p className="mt-1 text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.delivery.notApplicable} />
              </p>
            </section>
          )}

          <p className="text-[length:var(--text-micro)] leading-[var(--lh-body)] text-muted-foreground" data-suspension-note>
            <AppBilingual pick={(c) => c.admin.warehouse.shipments.detail.suspensionNote} />
          </p>
        </div>
      </div>
    </div>
  );
}

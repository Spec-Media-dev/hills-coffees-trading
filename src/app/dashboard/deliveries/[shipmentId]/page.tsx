import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { ShipmentStatusBadge } from "@/components/delivery/shipment-status-badge";
import { ShipmentDisputeLinkage } from "@/components/disputes/dispute-linkage";
import { StatusTimeline } from "@/components/delivery/status-timeline";
import { ItemQuantitiesTable } from "@/components/delivery/item-quantities-table";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getCustodyForOrderItems } from "@/lib/delivery/custody";
import { getShipmentById, getShipmentItems } from "@/lib/delivery/read";
import { listDisputesForOrder } from "@/lib/disputes/read";
import { getOrderItems } from "@/lib/orders/read";

export const metadata: Metadata = {
  title: "Delivery",
};

/**
 * Feature 009 RUN C (T020) — the buyer's own shipment tracking detail: status, per-item planned vs.
 * delivered quantities, address/contact, and (T022) the linked custody record.
 *
 * PRIVACY (SEC-005/FR-014): address/contact/custody are shown ONLY when the shipment's OWN order
 * belongs to the caller's acting organization — checked explicitly here (`shipment.buyerOrganizationId
 * === identity.organization.organizationId`), independent of whatever `shipments_view`'s RLS itself
 * would additionally permit (a seller-of-record or warehouse operator could also read this row under
 * RLS, but neither is this page's audience — a mismatch refuses identically to a nonexistent shipment,
 * no existence leak).
 *
 * `DISPUTED` (T020's own verify line): Feature 012 RUN B (T007) now links a shipment whose OWN status is
 * `DISPUTED` to the order's dispute records (`ShipmentDisputeLinkage`) — it implements no dispute
 * mechanics itself and never infers a hold from a dispute record (DB-OPEN-09).
 *
 * `FAILED`/`CANCELLED`/`DISPUTED` "reason" — see `lib/app/copy`'s own `deliveries.detail.reason`
 * comment: `order_shipments` has no reason column in the live schema; the honest `notRecorded` copy
 * renders instead of fabricating one.
 */
export default async function DeliveryDetailPage({ params }: { params: Promise<{ shipmentId: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { shipmentId } = await params;
  const shipment = await getShipmentById({ shipmentId });
  if (!shipment || shipment.buyerOrganizationId !== identity.organization.organizationId) {
    notFound();
  }

  const [shipmentItems, orderItems] = await Promise.all([getShipmentItems({ shipmentId }), getOrderItems({ orderId: shipment.orderId })]);
  // Feature 012 RUN B (T007): only a shipment whose OWN status is DISPUTED links to dispute records.
  const linkedDisputes = shipment.status === "DISPUTED" ? await listDisputesForOrder({ organizationId: identity.organization.organizationId, userId: identity.userId, orderId: shipment.orderId }) : [];
  const custody = await getCustodyForOrderItems({ organizationId: identity.organization.organizationId, orderItemIds: shipmentItems.map((item) => item.orderItemId) });

  const needsReason = shipment.status === "FAILED" || shipment.status === "CANCELLED" || shipment.status === "DISPUTED";
  const copy = appCopy.deliveries.detail;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={
          <span className="font-mono break-all" dir="ltr">
            {shipment.shipmentCode}
          </span>
        }
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.deliveries.list.title} />, href: "/dashboard/deliveries" },
          { label: <AppBilingual pick={(c) => c.deliveries.detail.breadcrumb} /> },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <ShipmentStatusBadge status={shipment.status} />
            <Link href={`/dashboard/orders/${shipment.orderId}`} className="text-[length:var(--text-small)] font-medium text-foreground underline underline-offset-4 hover:no-underline">
              <span className="font-mono" dir="ltr">
                {shipment.orderCode}
              </span>
            </Link>
          </div>
        }
      />

      <section aria-labelledby="timeline-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="timeline-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.deliveries.detail.timelineHeading} />
        </h2>
        <StatusTimeline shipment={shipment} />
      </section>

      {needsReason ? (
        <section aria-labelledby="reason-heading" className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
          <h2 id="reason-heading" className="text-base font-semibold text-foreground">
            <AppBilingual pick={(c) => c.deliveries.detail.reason.heading} />
          </h2>
          <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.reason.notRecorded}</p>
          {shipment.status === "DISPUTED" ? <ShipmentDisputeLinkage disputes={linkedDisputes} /> : null}
        </section>
      ) : null}

      <section aria-labelledby="items-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="items-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.deliveries.detail.itemsHeading} />
        </h2>
        <ItemQuantitiesTable items={shipmentItems} orderItems={orderItems} />
      </section>

      <section aria-labelledby="address-heading" className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
          <h2 id="address-heading" className="text-base font-semibold text-foreground">
            <AppBilingual pick={(c) => c.deliveries.detail.addressHeading} />
          </h2>
          <p className="text-[length:var(--text-small)] text-foreground">
            {shipment.addressLine}
            {shipment.city ? `, ${shipment.city}` : ""}, {shipment.countryCode}
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
          <h2 className="text-base font-semibold text-foreground">
            <AppBilingual pick={(c) => c.deliveries.detail.contactHeading} />
          </h2>
          <p className="text-[length:var(--text-small)] text-foreground">{shipment.contactName}</p>
          <p className="text-[length:var(--text-small)] text-foreground" dir="ltr">
            {shipment.contactPhone}
          </p>
        </div>
      </section>

      <section aria-labelledby="custody-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="custody-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.deliveries.detail.custodyHeading} />
        </h2>
        {custody.length === 0 ? (
          <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.custodyEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {custody.map((allocation) => (
              <li key={allocation.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 text-[length:var(--text-small)] last:border-b-0">
                <span className="text-foreground">{allocation.status}</span>
                <span className="font-mono tabular-nums text-muted-foreground" dir="ltr">
                  {allocation.releasedQuantityKg} / {allocation.quantityKg} kg
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

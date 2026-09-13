import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { CheckoutConfirmButton } from "@/components/orders/checkout-confirm-button";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Separator } from "@/components/ui/separator";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getOrderById, getOrderItems, getOrderShipments, getShipmentItems } from "@/lib/orders/read";

export const metadata: Metadata = {
  title: "Checkout",
};

const READY_SHIPMENT_STATUSES = ["READY", "RESERVED"] as const;
const POST_CHECKOUT_STATUSES = ["HOLD", "PAYMENT_PROOF_SUBMITTED", "PAYMENT_UNDER_REVIEW", "PAID", "FULFILLMENT_IN_PROGRESS", "PARTIALLY_DELIVERED", "COMPLETED"] as const;

/**
 * Feature 007 RUN B (T009) — the checkout review page. Shows ONLY facts already stored on the
 * order at this stage: the item price snapshots (`order_items.unit_price_per_kg`, taken when each
 * item was added), quantities with unit, currency, and the delivery plan. It never computes a
 * subtotal, VAT, commission or buyer total — `checkout_order()` writes the one authoritative
 * `order_financials` snapshot at confirmation, and the detail page (T010) presents it from there.
 *
 * The readiness notice mirrors `lib/orders/checkout.ts`'s own pre-check (items, a READY/RESERVED
 * delivery, matching planned quantities) so the buyer sees WHY confirmation is not yet available —
 * it never pre-checks availability (T011: the RPC is the authority on that).
 */
export default async function CheckoutReviewPage({ params }: { params: Promise<{ orderId: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }
  if (!identity.organization.canBuy) {
    return <StateScreen kind="forbidden" title={appCopy.orders.capabilityRequired.title} description={appCopy.orders.capabilityRequired.description} />;
  }

  const { orderId } = await params;
  const order = await getOrderById({ organizationId: identity.organization.organizationId, orderId });
  if (!order) notFound();

  if ((POST_CHECKOUT_STATUSES as readonly string[]).includes(order.status)) {
    redirect(`/dashboard/orders/${order.id}`);
  }

  const [items, shipments] = await Promise.all([getOrderItems({ orderId }), getOrderShipments({ orderId })]);
  const shipment = shipments.length > 0 ? shipments[shipments.length - 1]! : null;
  const shipmentItems = shipment ? await getShipmentItems({ shipmentId: shipment.id }) : [];

  const readyShipment = shipments.some((row) => (READY_SHIPMENT_STATUSES as readonly string[]).includes(row.status) && row.readyAt !== null);
  const plannedByItem = new Map<string, number>();
  for (const shipmentItem of shipmentItems) {
    plannedByItem.set(shipmentItem.orderItemId, (plannedByItem.get(shipmentItem.orderItemId) ?? 0) + shipmentItem.plannedQuantityKg);
  }
  const quantitiesMatch = items.every((item) => (plannedByItem.get(item.id) ?? 0) === item.quantityKg);

  const readinessProblem = items.length === 0 ? "noItems" : !readyShipment ? "shipmentNotReady" : !quantitiesMatch ? "quantitiesMismatch" : null;
  const canConfirm = readinessProblem === null && (order.status === "DRAFT" || order.status === "CONFIRMED");
  const shipmentStatusLabel = shipment ? (appCopy.orders.detail.shipment.status as Record<string, string>)[shipment.status] ?? shipment.status : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.orders.checkout.title} />}
        description={<AppBilingual pick={(c) => c.orders.checkout.description} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.orders.list.title} />, href: "/dashboard/orders" },
          { label: order.orderCode, href: `/dashboard/orders/${order.id}` },
          { label: <AppBilingual pick={(c) => c.orders.checkout.breadcrumb} /> },
        ]}
        actions={<OrderStatusBadge status={order.status} />}
      />

      <div className="flex flex-col gap-8 rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.orders.checkout.itemsHeading} />
          </h2>
          {items.length === 0 ? (
            <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.detail.itemsEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 text-[length:var(--text-small)] last:border-b-0">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">{item.productNameSnapshot}</span>
                    <span className="font-mono text-muted-foreground" dir="ltr">
                      {item.lotCodeSnapshot}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-3 font-mono tabular-nums text-foreground" dir="ltr">
                    <span>{item.quantityKg} kg</span>
                    <span className="text-muted-foreground">
                      {item.currency} {item.unitPricePerKg}/kg
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.checkout.totalsNote}</p>
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.orders.checkout.shipmentHeading} />
          </h2>
          {shipment ? (
            <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{appCopy.orders.detail.shipment.statusLabel}</dt>
                <dd className="text-foreground">{shipmentStatusLabel}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{appCopy.orders.detail.shipment.create.addressLabel}</dt>
                <dd className="text-foreground">
                  {shipment.addressLine}
                  {shipment.city ? `, ${shipment.city}` : ""}, {shipment.countryCode}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.checkout.noShipment}</p>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-4">
          {readinessProblem ? (
            <InlineAlert tone="warning" title={appCopy.orders.checkout.readiness.notReady}>
              <p>{appCopy.orders.checkout.readiness[readinessProblem]}</p>
            </InlineAlert>
          ) : (
            <InlineAlert tone="info" title={appCopy.orders.checkout.readiness.ready}>
              <p>{appCopy.orders.checkout.advisoryNote}</p>
            </InlineAlert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <CheckoutConfirmButton orderId={order.id} disabled={!canConfirm} />
            <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/orders/${order.id}`} />}>
              <AppBilingual pick={(c) => c.orders.checkout.viewOrder} />
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

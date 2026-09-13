import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { DraftEditor } from "@/components/orders/draft-editor";
import { HoldCountdown } from "@/components/orders/hold-countdown";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { ShipmentPlanner } from "@/components/orders/shipment-planner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getOrderById, getOrderFinancials, getOrderItems, getOrderShipments, getProforma, getShipmentItems } from "@/lib/orders/read";

export const metadata: Metadata = {
  title: "Order",
};

/**
 * Feature 007 RUN A (T005/T006/T007) — the buyer's draft-order editor: items (add-only, see
 * `lib/orders/drafts.ts`'s own DB-OPEN-13 header for why there is no remove/edit control) and the
 * buyer-owned shipment-planning slice.
 *
 * PRIVACY: `getOrderById` is org-scoped exactly like `lib/listings/manage.ts`'s established
 * convention — a cross-org id and a nonexistent id return the IDENTICAL `null`, so this page calls
 * `notFound()` for both with no branching that could reveal which case occurred (SEC-002).
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { orderId } = await params;
  const organizationId = identity.organization.organizationId;

  const order = await getOrderById({ organizationId, orderId });
  if (!order) notFound();

  // T010 — `order_financials` and the proforma exist ONLY once `checkout_order()` has written them;
  // both are verbatim pass-throughs (`null` before checkout), never computed here.
  const [items, shipments, financials, proforma] = await Promise.all([getOrderItems({ orderId }), getOrderShipments({ orderId }), getOrderFinancials({ orderId }), getProforma({ orderId })]);

  // RUN A supports at most one buyer-owned shipment plan per order (a narrowing, not a schema
  // limit) — the most recent one, if any, is what this page's ShipmentPlanner renders/acts on.
  const shipment = shipments.length > 0 ? shipments[shipments.length - 1]! : null;
  const shipmentItems = shipment ? await getShipmentItems({ shipmentId: shipment.id }) : [];

  const isEditable = order.status === "DRAFT";
  const canCheckout = order.status === "DRAFT" || order.status === "CONFIRMED";
  const isOnHold = order.status === "HOLD";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={
          <span className="font-mono" dir="ltr">
            {order.orderCode}
          </span>
        }
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.orders.list.title} />, href: "/dashboard/orders" },
          { label: order.orderCode },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={order.status} />
            {canCheckout ? (
              <Button nativeButton={false} render={<Link href={`/dashboard/orders/${order.id}/checkout`} />}>
                <AppBilingual pick={(c) => c.orders.detail.checkoutAction} />
              </Button>
            ) : null}
          </div>
        }
      />

      {isOnHold && order.holdExpiresAt ? (
        <section data-slot="hold-outcome" aria-labelledby="hold-outcome-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--status-review)] bg-[var(--status-review-surface)] p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="hold-outcome-heading" className="text-lg font-semibold text-foreground">
                <AppBilingual pick={(c) => c.orders.hold.title} />
              </h2>
              <p className="max-w-[62ch] text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.orders.hold.description} />
              </p>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[length:var(--text-small)] text-muted-foreground">
                <AppBilingual pick={(c) => c.orders.hold.remainingLabel} />
              </span>
              <HoldCountdown holdExpiresAt={order.holdExpiresAt} />
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">
                <AppBilingual pick={(c) => c.orders.hold.expiresLabel} />
              </dt>
              <dd className="font-mono text-foreground" dir="ltr">
                {order.holdExpiresAt}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">
                <AppBilingual pick={(c) => c.orders.hold.proformaLabel} />
              </dt>
              <dd className="font-mono text-foreground" dir="ltr">
                {proforma?.proformaCode ?? appCopy.orders.hold.proformaPending}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">
                <AppBilingual pick={(c) => c.orders.financials.buyerTotal} />
              </dt>
              <dd className="font-mono font-semibold tabular-nums text-foreground" dir="ltr">
                {financials ? `${financials.currency} ${financials.buyerTotalAmount}` : appCopy.orders.financials.pending}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <div className="flex flex-col gap-8 rounded-[var(--radius-xl)] border border-border bg-card p-7 shadow-[var(--shadow-md)] sm:p-9">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.orders.detail.itemsHeading} />
          </h2>

          {items.length === 0 ? (
            <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.detail.itemsEmpty}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 text-[length:var(--text-small)] last:border-b-0">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{item.productNameSnapshot}</span>
                      {item.originNameSnapshot ? <span className="text-muted-foreground">{item.originNameSnapshot}</span> : null}
                    </div>
                    <div className="flex items-baseline gap-3 font-mono tabular-nums text-foreground" dir="ltr">
                      <span>{item.quantityKg} kg</span>
                      <span className="text-muted-foreground">
                        {item.currency} {item.unitPricePerKg}/kg
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.detail.itemsNote}</p>
            </>
          )}

          {isEditable ? (
            <>
              <Separator />
              <DraftEditor orderId={order.id} />
              <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.detail.advisoryNote}</p>
            </>
          ) : (
            <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.detail.notEditableNote}</p>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-3" aria-labelledby="financials-heading">
          <h2 id="financials-heading" className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.orders.financials.heading} />
          </h2>
          {financials ? (
            <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.orders.financials.baseSubtotal} />
                </dt>
                <dd className="font-mono tabular-nums text-foreground" dir="ltr">
                  {financials.currency} {financials.baseSubtotal}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.orders.financials.shipping} />
                </dt>
                <dd className="font-mono tabular-nums text-foreground" dir="ltr">
                  {financials.currency} {financials.shippingAmount}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.orders.financials.vat} />
                </dt>
                <dd className="font-mono tabular-nums text-foreground" dir="ltr">
                  {financials.currency} {financials.vatAmount}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.orders.financials.buyerTotal} />
                </dt>
                <dd className="font-mono font-semibold tabular-nums text-foreground" dir="ltr">
                  {financials.currency} {financials.buyerTotalAmount}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.financials.pending}</p>
          )}
        </section>

        <Separator />

        <section>
          <ShipmentPlanner orderId={order.id} items={items} shipment={shipment} shipmentItems={shipmentItems} />
        </section>
      </div>
    </div>
  );
}

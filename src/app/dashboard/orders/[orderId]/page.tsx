import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { DraftEditor } from "@/components/orders/draft-editor";
import { DraftItemControls } from "@/components/orders/draft-item-controls";
import { FinancialSummary } from "@/components/orders/financial-summary";
import { HoldCountdown } from "@/components/orders/hold-countdown";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { ShipmentPlanner } from "@/components/orders/shipment-planner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { ensureHoldFresh } from "@/lib/orders/expiry";
import { getOrderFinancials, getOrderItems, getOrderShipments, getOrderStatusHistory, getPaymentStatus, getProforma, getShipmentItems } from "@/lib/orders/read";

export const metadata: Metadata = {
  title: "Order",
};

/**
 * Feature 007 — the buyer's order detail (RUN A: draft editor + shipment planning; RUN B: HOLD
 * outcome; RUN C/T016: lazy expiry, expired state, financial/proforma/payment/history views).
 *
 * ORDER OF TRUTH (T016's own critical rule): `ensureHoldFresh(orderId)` runs FIRST — it is the sole
 * `expire_order_hold()` caller and processes a stale hold lazily — and only its RETURNED order (the
 * separate authorized re-read it performs) is rendered. Nothing below reads the order before that.
 *
 * DB-OPEN-13: items are add-only (no remove/edit control exists because none could succeed).
 * PRIVACY: a cross-org/nonexistent id yields the identical `ORDER_NOT_FOUND` → `notFound()`.
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

  // T012/T016 — lazy expiry BEFORE final truth. Its own re-read is the order we render.
  const freshness = await ensureHoldFresh(orderId);
  if (!freshness.ok) {
    if (freshness.code === "order_not_found" || freshness.code === "validation_error") notFound();
    return <StateScreen kind="error" />;
  }
  // `ensureHoldFresh` already read the order org-scoped for THIS identity's acting organization.
  const order = freshness.data.order;

  // `order_financials`/proforma/payment exist ONLY once `checkout_order()` has written them — all
  // verbatim pass-throughs (`null` before checkout), never computed here.
  const [items, shipments, financials, proforma, payment, history] = await Promise.all([
    getOrderItems({ orderId }),
    getOrderShipments({ orderId }),
    getOrderFinancials({ orderId }),
    getProforma({ orderId }),
    getPaymentStatus({ orderId }),
    getOrderStatusHistory({ orderId }),
  ]);

  // At most one buyer-owned shipment plan per order (a RUN A narrowing, not a schema limit).
  const shipment = shipments.length > 0 ? shipments[shipments.length - 1]! : null;
  const shipmentItems = shipment ? await getShipmentItems({ shipmentId: shipment.id }) : [];

  const isEditable = order.status === "DRAFT";
  const canCheckout = order.status === "DRAFT" || order.status === "CONFIRMED";
  const isOnHold = order.status === "HOLD" && freshness.data.fresh;
  const isExpired = order.status === "EXPIRED";
  const statusLabels = appCopy.orders.status as Record<string, string>;
  const paymentLabels = appCopy.orders.payment.status as Record<string, string>;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={
          <span className="font-mono break-all" dir="ltr">
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
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">
                <AppBilingual pick={(c) => c.orders.hold.expiresLabel} />
              </dt>
              <dd className="font-mono break-all text-foreground" dir="ltr">
                {order.holdExpiresAt}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground">
                <AppBilingual pick={(c) => c.orders.hold.proformaLabel} />
              </dt>
              <dd className="font-mono break-all text-foreground" dir="ltr">
                {proforma?.proformaCode ?? appCopy.orders.hold.proformaPending}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
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

      {isExpired ? (
        <section data-slot="expired-outcome" role="status" aria-labelledby="expired-outcome-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--danger)] bg-[var(--danger-surface)] p-6 sm:p-7">
          <div className="flex flex-col gap-1">
            <h2 id="expired-outcome-heading" className="text-lg font-semibold text-foreground">
              <AppBilingual pick={(c) => c.orders.expired.title} />
            </h2>
            <p className="max-w-[62ch] text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.orders.expired.description} />
            </p>
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.orders.history.reasonLabel} />: <AppBilingual pick={(c) => c.orders.expired.reason} />
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link href="/dashboard/orders" />}>
              <AppBilingual pick={(c) => c.orders.expired.startNewOrder} />
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/coffee" />}>
              <AppBilingual pick={(c) => c.orders.expired.backToMarketplace} />
            </Button>
          </div>
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
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-foreground">{item.productNameSnapshot}</span>
                      <span className="font-mono break-all text-muted-foreground" dir="ltr">
                        {item.lotCodeSnapshot}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-3 font-mono tabular-nums text-foreground" dir="ltr">
                      <span>{item.quantityKg} kg</span>
                      <span className="text-muted-foreground">
                        {item.currency} {item.unitPricePerKg}/kg
                      </span>
                    </div>
                    {isEditable ? <DraftItemControls orderId={order.id} orderItemId={item.id} quantityKg={item.quantityKg} /> : null}
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
          {financials ? <FinancialSummary financials={financials} /> : <p className="text-[length:var(--text-small)] text-muted-foreground">{appCopy.orders.financials.pending}</p>}
          {proforma ? (
            <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.orders.hold.proformaLabel} />
                </dt>
                <dd className="font-mono break-all text-foreground" dir="ltr">
                  {proforma.proformaCode}
                </dd>
              </div>
              {payment ? (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-muted-foreground">
                    <AppBilingual pick={(c) => c.orders.payment.label} />
                  </dt>
                  <dd className="text-foreground">
                    {paymentLabels[payment.status] ?? payment.status}
                    <span className="block text-muted-foreground">{appCopy.orders.payment.note}</span>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>

        <Separator />

        <section>
          <ShipmentPlanner orderId={order.id} items={items} shipment={shipment} shipmentItems={shipmentItems} />
        </section>

        <Separator />

        <section className="flex flex-col gap-3" aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-lg font-semibold text-foreground">
            <AppBilingual pick={(c) => c.orders.history.heading} />
          </h2>
          {history.length === 0 ? (
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.orders.history.empty} />
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 text-[length:var(--text-small)] last:border-b-0">
                  <span className="text-foreground">
                    {entry.oldStatus ? `${statusLabels[entry.oldStatus] ?? entry.oldStatus} → ` : ""}
                    {statusLabels[entry.newStatus] ?? entry.newStatus}
                    {entry.reason ? <span className="block text-muted-foreground">{entry.reason}</span> : null}
                  </span>
                  <span className="font-mono text-muted-foreground" dir="ltr">
                    {entry.createdAt}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

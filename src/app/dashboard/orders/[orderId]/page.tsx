import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { DraftEditor } from "@/components/orders/draft-editor";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { ShipmentPlanner } from "@/components/orders/shipment-planner";
import { Separator } from "@/components/ui/separator";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getOrderById, getOrderItems, getOrderShipments, getShipmentItems } from "@/lib/orders/read";

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

  const [items, shipments] = await Promise.all([getOrderItems({ orderId }), getOrderShipments({ orderId })]);

  // RUN A supports at most one buyer-owned shipment plan per order (a narrowing, not a schema
  // limit) — the most recent one, if any, is what this page's ShipmentPlanner renders/acts on.
  const shipment = shipments.length > 0 ? shipments[shipments.length - 1]! : null;
  const shipmentItems = shipment ? await getShipmentItems({ shipmentId: shipment.id }) : [];

  const isEditable = order.status === "DRAFT";

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
        actions={<OrderStatusBadge status={order.status} />}
      />

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

        <section>
          <ShipmentPlanner orderId={order.id} items={items} shipment={shipment} shipmentItems={shipmentItems} />
        </section>
      </div>
    </div>
  );
}

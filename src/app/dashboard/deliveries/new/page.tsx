import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { ShipmentPlanner } from "@/components/orders/shipment-planner";
import { Button } from "@/components/ui/button";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getOrderById, getOrderItems, getOrderShipments, getShipmentItems } from "@/lib/orders/read";

export const metadata: Metadata = {
  title: "Plan a delivery",
};

/**
 * Feature 009 RUN B (T015) — the delivery-request entry point. Deliberately requires an `orderId`
 * (`?orderId=`) rather than building a second "pick an order" UI here: `/dashboard/orders` already IS
 * that picker, and each order's own detail page already links a buyer into their delivery plan for
 * THAT order. Missing `orderId` renders an honest, actionable empty state instead of guessing one.
 *
 * REUSE, NOT DUPLICATION: the actual plan editor is `components/orders/shipment-planner.tsx` —
 * the SAME component `/dashboard/orders/[orderId]` renders, already live-tested (Feature 007) and
 * extended for cancel-from-DRAFT (T014). This page supplies only its own framing (breadcrumb, title,
 * the honest reservation disclosure) around that shared component — never a second implementation of
 * "select order items, planned quantities, address/contact/method."
 *
 * PRIVACY: mirrors `[orderId]/page.tsx`'s own rule — a cross-org/nonexistent order id yields the
 * identical `notFound()`, never a distinguishable error.
 */
export default async function NewDeliveryPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { orderId } = await searchParams;
  const copy = appCopy.deliveries.new;

  if (!orderId) {
    return (
      <StateScreen kind="empty" title={copy.noOrderSelected.title} description={copy.noOrderSelected.description}>
        <Button nativeButton={false} render={<Link href="/dashboard/orders" />}>
          {copy.noOrderSelected.action}
        </Button>
      </StateScreen>
    );
  }

  const order = await getOrderById({ organizationId: identity.organization.organizationId, orderId });
  if (!order) {
    notFound();
  }

  const [items, shipments] = await Promise.all([getOrderItems({ orderId }), getOrderShipments({ orderId })]);

  // Same CANCELLED-exclusion rule as `[orderId]/page.tsx` (T014/T015) — a withdrawn plan never blocks a fresh one.
  const activeShipments = shipments.filter((row) => row.status !== "CANCELLED");
  const shipment = activeShipments.length > 0 ? activeShipments[activeShipments.length - 1]! : null;
  const shipmentItems = shipment ? await getShipmentItems({ shipmentId: shipment.id }) : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={copy.title}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.orders.list.title} />, href: "/dashboard/orders" },
          { label: order.orderCode, href: `/dashboard/orders/${order.id}` },
          { label: copy.breadcrumb },
        ]}
      />

      <section className="rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <ShipmentPlanner orderId={order.id} items={items} shipment={shipment} shipmentItems={shipmentItems} />
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { CommerceStatusBadge } from "@/components/commerce/commerce-status-badge";
import { OrderTimeline } from "@/components/commerce/order-timeline";
import { ProformaDocument } from "@/components/commerce/proforma-document";
import { ReservationCountdown } from "@/components/commerce/reservation-countdown";
import { PaymentProofUploadDropzone } from "@/components/commerce/payment-proof-upload-dropzone";
import { PendingVerificationCard } from "@/components/commerce/pending-verification-card";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getProformaDetail } from "@/lib/commerce/read";
import { ensureReservationFresh } from "@/lib/commerce/reservation";
import { getOrderById } from "@/lib/orders/read";

export const metadata: Metadata = { title: "Proforma" };

/**
 * Feature 013 / Feature 015 — the frozen proforma, 20-minute countdown, and private payment proof upload
 * for `BANK_TRANSFER_V1` orders.
 */
function isPastDeadline(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

export default async function ProformaPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.organization) return <StateScreen kind="unauthorized" />;
  if (!identity.isAuthorizedMember) return <StateScreen kind="forbidden" />;

  const order = await getOrderById({ organizationId: identity.organization.organizationId, orderId });
  if (!order) return <StateScreen kind="not-found" />;
  if (order.commerceFlow !== "BANK_TRANSFER_V1") redirect(`/dashboard/orders/${orderId}`);
  if (order.status === "DRAFT") redirect("/dashboard/cart");

  // Lazy expiry-on-read (research.md R-9): a no-op unless this order's reservation is genuinely
  // ACTIVE past its deadline. Re-read afterward — status may have just flipped to EXPIRED.
  await ensureReservationFresh(orderId);
  const [freshOrder, proforma] = await Promise.all([
    getOrderById({ organizationId: identity.organization.organizationId, orderId }),
    getProformaDetail({ orderId }),
  ]);
  const status = freshOrder?.status ?? order.status;

  if (!proforma) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.commerce.proformaUi.title} />} />
        <p className="text-[length:var(--text-small)] text-muted-foreground"><AppBilingual pick={(c) => c.commerce.errors.proforma_not_found} /></p>
      </div>
    );
  }

  const isHold = status === "HOLD" && freshOrder?.holdExpiresAt;
  const isTerminal = status === "EXPIRED" || status === "CANCELLED" || status === "VOID" || (status === "HOLD" && isPastDeadline(freshOrder?.holdExpiresAt ?? ""));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={<AppBilingual pick={(c) => c.commerce.proformaUi.title} />}
        description={<span className="font-mono" dir="ltr">{order.orderCode}</span>}
      />

      <OrderTimeline
        status={status}
        labels={{
          DRAFT: <AppBilingual pick={(c) => c.commerce.statusLabels.DRAFT} />,
          PROFORMA_ISSUED: <AppBilingual pick={(c) => c.commerce.statusLabels.PROFORMA_ISSUED} />,
          HOLD: <AppBilingual pick={(c) => c.commerce.statusLabels.HOLD} />,
        }}
        terminalLabel={isTerminal ? <CommerceStatusBadge status={status} /> : null}
      />

      {isHold && freshOrder?.holdExpiresAt && !isTerminal ? (
        <ReservationCountdown expiresAt={freshOrder.holdExpiresAt} label={<AppBilingual pick={(c) => c.commerce.proformaUi.reservationActive} />} />
      ) : null}

      <ProformaDocument
        proforma={proforma}
        displayStatus={isTerminal ? "EXPIRED" : proforma.status}
        sellerTypeLabel={(sellerType) => <AppBilingual pick={(c) => c.marketplace.card.sellerType[sellerType === "HILLS" ? "HILLS" : "MEMBER_SELLER"]} />}
        notATaxInvoiceLabel={<AppBilingual pick={(c) => c.commerce.proformaUi.notATaxInvoice} />}
        validUntilLabel={<AppBilingual pick={(c) => c.commerce.proformaUi.validUntil} />}
        totalsCopy={{
          merchandiseNet: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.merchandiseNet} />,
          shippingGroup: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.shippingGroup} />,
          shipping: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.shipping} />,
          shippingVat: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.shippingVat} />,
          vat: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.vat} />,
          total: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.total} />,
        }}
      />

      {status === "PAYMENT_PROOF_SUBMITTED" ? (
        <PendingVerificationCard orderCode={order.orderCode} />
      ) : isHold && !isTerminal ? (
        <PaymentProofUploadDropzone
          orderId={orderId}
          buyerTotal={proforma.buyerTotal ?? 0}
          currency={proforma.currency ?? "USD"}
          expiresAt={freshOrder?.holdExpiresAt ?? proforma.validUntil}
        />
      ) : isTerminal ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-muted p-4">
          <p className="text-[length:var(--text-small)] text-muted-foreground"><AppBilingual pick={(c) => c.commerce.proformaUi.terminalNotice} /></p>
          <Button className="min-h-11 self-start" nativeButton={false} render={<Link href="/dashboard/coffee" />}>
            <AppBilingual pick={(c) => c.commerce.cartUi.browse} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

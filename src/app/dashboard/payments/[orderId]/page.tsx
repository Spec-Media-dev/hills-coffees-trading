import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FinancialSummary } from "@/components/orders/financial-summary";
import { FundingUnavailableNotice } from "@/components/finance/funding-unavailable-notice";
import { PageHeader } from "@/components/app/page-header";
import { PaymentStatusBadge } from "@/components/finance/payment-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { requestFunding } from "@/lib/finance/funding";
import { getOrderFinancials, getPayment } from "@/lib/finance/read";

export const metadata: Metadata = {
  title: "Payment",
};

/**
 * Feature 008 T022 — one order's stored payment state, order-financial snapshot, and the honest
 * funding-unavailable notice. Sourced ENTIRELY from the already-approved provider-neutral foundation:
 * `getPayment`/`getOrderFinancials` (`lib/finance/read.ts`, T003/T006 — RLS-scoped, no arithmetic) and
 * `requestFunding` (`lib/finance/funding.ts`, T004 — the real seam, not a hardcoded string; always
 * returns `FINANCE_FUNDING_UNAVAILABLE` today, since no provider is selected and no approved DB gate
 * exists). No settlement/provider outcome is rendered — T017–T021 have not run, so no such outcome
 * can exist to display (this page never fabricates one).
 *
 * AUTHORIZATION — deliberately RLS-only, unlike `/dashboard/deliveries/[shipmentId]` (which narrows
 * to the buyer org for address/contact privacy reasons that do not apply here): `payments_view`/
 * `financials_view` (`can_view_order`) already admit BOTH the order's buyer organization AND any
 * seller organization with a line item on it — confirmed live in `lib/finance/read.ts`'s own header
 * and `tests/finance/rls-policy.test.ts`. `PaymentDTO`/`OrderFinancialsDTO` carry no buyer- or
 * seller-identifying field, so there is nothing to leak by trusting RLS as the sole boundary; adding
 * an extra buyer-only filter here would incorrectly refuse a genuine seller-of-record (SEC-002 would
 * then have no live coverage for the seller branch at all). A cross-org id and a nonexistent id
 * produce the IDENTICAL `null` from `getPayment` — both render `notFound()`, never a distinguishable
 * "exists but not yours" signal.
 *
 * SCOPE: T023's fields (proforma, tax invoice, payout record) are deliberately NOT rendered here —
 * out of T022's scope. The raw `orderId` is shown as the order reference (not `orders.order_code`,
 * which Feature 007's own read function is buyer-org-scoped only — fetching it here would silently
 * exclude a genuine seller-of-record; the raw id keeps buyer/seller symmetry with no extra read).
 */
export default async function PaymentDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) {
    return <StateScreen kind="unauthorized" />;
  }
  if (!identity.isAuthorizedMember) {
    return <StateScreen kind="forbidden" />;
  }

  const { orderId } = await params;
  const payment = await getPayment({ orderId });
  if (!payment) {
    notFound();
  }

  const [financials, funding] = await Promise.all([getOrderFinancials({ orderId }), requestFunding({ orderId })]);
  const copy = appCopy.finance.payments.detail;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={<AppBilingual pick={(c) => c.finance.payments.detail.breadcrumb} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.finance.payments.list.title} />, href: "/dashboard/payments" },
          { label: <AppBilingual pick={(c) => c.finance.payments.detail.breadcrumb} /> },
        ]}
        actions={<PaymentStatusBadge status={payment.status} />}
      />

      <section aria-labelledby="payment-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="payment-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.finance.payments.detail.paymentSectionHeading} />
        </h2>
        <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">{copy.orderReferenceLabel}</dt>
            <dd className="font-mono break-all tabular-nums text-foreground" dir="ltr">
              {orderId}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">{copy.amountLabel}</dt>
            <dd className="font-mono tabular-nums text-foreground" dir="ltr">
              {payment.currency} {payment.amount}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">{copy.correlationLabel}</dt>
            <dd className="font-mono break-all text-foreground" dir="ltr">
              {payment.correlationId ?? copy.notYetAssigned}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">{copy.externalReferenceLabel}</dt>
            <dd className="font-mono break-all text-foreground" dir="ltr">
              {payment.externalReference ?? copy.notYetAssigned}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="financials-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="financials-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.finance.payments.detail.financialsSectionHeading} />
        </h2>
        {financials ? <FinancialSummary financials={financials} /> : <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.financialsNotCalculated}</p>}
      </section>

      <section aria-labelledby="funding-heading" className="flex flex-col gap-4">
        <h2 id="funding-heading" className="sr-only">
          <AppBilingual pick={(c) => c.finance.payments.detail.fundingSectionHeading} />
        </h2>
        {!funding.ok ? <FundingUnavailableNotice /> : null}
      </section>
    </div>
  );
}

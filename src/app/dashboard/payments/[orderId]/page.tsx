import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FinancialSummary, formatMoney } from "@/components/orders/financial-summary";
import { FundingUnavailableNotice } from "@/components/finance/funding-unavailable-notice";
import { PageHeader } from "@/components/app/page-header";
import { PaymentStatusBadge } from "@/components/finance/payment-status-badge";
import { PayoutStatusBadge } from "@/components/finance/payout-status-badge";
import { ProformaStatusBadge } from "@/components/finance/proforma-status-badge";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { requestFunding } from "@/lib/finance/funding";
import { getOrderFinancials, getPayment, getPayoutsForOrder, getProforma, getTaxInvoice } from "@/lib/finance/read";

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
 * SCOPE: the raw `orderId` is shown as the order reference (not `orders.order_code`, which Feature
 * 007's own read function is buyer-org-scoped only — fetching it here would silently exclude a
 * genuine seller-of-record; the raw id keeps buyer/seller symmetry with no extra read).
 *
 * FEATURE 008 T023 (this run) — Documents (proforma + tax invoice) and Payout sections, added on the
 * SAME RLS-only authorization this page already established for T022. `getProforma`/`getTaxInvoice`
 * (`proforma_view`/`tax_invoice_view`, both `can_view_order`) admit the same buyer/seller/admin
 * audience as `payments_view`. `getPayoutsForOrder` (`payouts_view`:
 * `is_platform_admin() OR is_org_member(seller_organization_id)`) is NARROWER — a buyer with no
 * seller line on this order simply gets `[]` back (never an error, never a distinguishable "exists
 * but not yours" signal), so the payout section renders its own empty state for that caller rather
 * than fabricating a zero. A payout row is ALWAYS the caller's own seller record (RLS never returns
 * another organization's line), so no seller-identifying column is rendered. `fileAssetId` on both
 * document DTOs is an internal reference with no download surface yet (no Storage signed-URL
 * generation exists for these buckets) and is deliberately never rendered (FR-019, T023 Verify: "no
 * file-byte URL fabrication") — only genuinely user-meaningful metadata is shown.
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

  const [financials, funding, proforma, taxInvoice, payouts] = await Promise.all([
    getOrderFinancials({ orderId }),
    requestFunding({ orderId }),
    getProforma({ orderId }),
    getTaxInvoice({ orderId }),
    getPayoutsForOrder({ orderId }),
  ]);
  const copy = appCopy.finance.payments.detail;
  // Neither `ProformaDTO` nor its item rows carry their own `currency` column (the schema stores one
  // currency per order, not per proforma line) — reuse the SAME order's already-fetched currency
  // rather than fabricating one, falling back to the payment's own (guaranteed non-null here) if the
  // financial snapshot were ever absent.
  const documentCurrency = financials?.currency ?? payment.currency;

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

      <section aria-labelledby="documents-heading" className="flex flex-col gap-6 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="documents-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.finance.payments.detail.documentsSectionHeading} />
        </h2>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[length:var(--text-small)] font-semibold text-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.proforma.heading} />
            </h3>
            {proforma ? <ProformaStatusBadge status={proforma.status} /> : null}
          </div>
          {proforma ? (
            <>
              <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-muted-foreground">{copy.proforma.codeLabel}</dt>
                  <dd className="font-mono break-all text-foreground" dir="ltr">
                    {proforma.proformaCode}
                  </dd>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-muted-foreground">{copy.proforma.issuedAtLabel}</dt>
                  <dd className="text-foreground" dir="ltr">
                    {proforma.issuedAt}
                  </dd>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-muted-foreground">{copy.proforma.validUntilLabel}</dt>
                  <dd className="text-foreground" dir="ltr">
                    {proforma.validUntil ?? copy.notYetAssigned}
                  </dd>
                </div>
              </dl>
              {proforma.items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-[length:var(--text-small)]">
                    <caption className="sr-only">
                      <AppBilingual pick={(c) => c.finance.payments.detail.proforma.itemsHeading} />
                    </caption>
                    <thead>
                      <tr className="border-b border-border text-start text-muted-foreground">
                        <th scope="col" className="py-2 text-start font-medium">
                          {copy.proforma.itemColumns.description}
                        </th>
                        <th scope="col" className="py-2 text-start font-medium">
                          {copy.proforma.itemColumns.quantity}
                        </th>
                        <th scope="col" className="py-2 text-start font-medium">
                          {copy.proforma.itemColumns.unitPrice}
                        </th>
                        <th scope="col" className="py-2 text-start font-medium">
                          {copy.proforma.itemColumns.amount}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {proforma.items.map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-b-0">
                          <td className="py-2 text-foreground">{item.description}</td>
                          <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                            {item.quantityKg === null ? copy.notYetAssigned : `${item.quantityKg} kg`}
                          </td>
                          <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                            {item.unitPrice === null ? copy.notYetAssigned : formatMoney(documentCurrency, item.unitPrice)}
                          </td>
                          <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                            {formatMoney(documentCurrency, item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.proforma.none}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-6">
          <h3 className="text-[length:var(--text-small)] font-semibold text-foreground">
            <AppBilingual pick={(c) => c.finance.payments.detail.taxInvoice.heading} />
          </h3>
          {taxInvoice ? (
            <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-muted-foreground">{copy.taxInvoice.numberLabel}</dt>
                <dd className="font-mono break-all text-foreground" dir="ltr">
                  {taxInvoice.invoiceNumber}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-muted-foreground">{copy.taxInvoice.issuedAtLabel}</dt>
                <dd className="text-foreground" dir="ltr">
                  {taxInvoice.issuedAt ?? copy.notYetAssigned}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.taxInvoice.none}</p>
          )}
        </div>
      </section>

      <section aria-labelledby="payouts-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="payouts-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.finance.payments.detail.payoutsSectionHeading} />
        </h2>
        {payouts.length > 0 ? (
          <div className="flex flex-col gap-4">
            {payouts.map((payout) => (
              <div key={payout.id} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-dashed border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono tabular-nums text-foreground" dir="ltr">
                    {formatMoney(payout.currency, payout.amount)}
                  </span>
                  <PayoutStatusBadge status={payout.status} />
                </div>
                <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-muted-foreground">{copy.payoutColumns.paidAt}</dt>
                    <dd className="text-foreground" dir="ltr">
                      {payout.paidAt ?? copy.notYetAssigned}
                    </dd>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-muted-foreground">{copy.payoutColumns.reference}</dt>
                    <dd className="font-mono break-all text-foreground" dir="ltr">
                      {payout.paymentReference ?? copy.notYetAssigned}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
            <p className="text-[length:var(--text-micro)] text-muted-foreground">{copy.payoutAccountingNotice}</p>
          </div>
        ) : (
          <p className="text-[length:var(--text-small)] text-muted-foreground">{copy.noPayout}</p>
        )}
      </section>
    </div>
  );
}

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
import { StripePaymentCollector } from "@/components/finance/stripe-payment-collector";
import { appCopy } from "@/lib/app/copy";
import { getRequestIdentity } from "@/lib/auth/dal";
import { requestFunding } from "@/lib/finance/funding";
import { stripePublishableKey } from "@/lib/finance/stripe/config";
import { getOrderFinancials, getPayment, getPayoutsForOrder, getProforma, getSellerOrderLines, getTaxInvoice } from "@/lib/finance/read";
import type { PayoutDTO, SellerOrderViewDTO } from "@/lib/finance/types";

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
 * AUTHORIZATION — RLS-only. Feature 013 M3 (T063): `payments_read`/`order_financials_read`/`proforma_invoices_read`/
 * `tax_invoices_read` admit the order's BUYER (and finance/platform admins), NEVER a seller. So:
 *   - a buyer (or finance) gets the full view below, whose payout section is simply empty for a buyer;
 *   - a SELLER of the order gets `null` from `getPayment` and is shown `SellerOrderDetail` instead — its own lines
 *     through the M3 projection `v_seller_order_lines` plus its own payout, and nothing the buyer owns;
 *   - anyone else (nonexistent, cross-organization) gets the IDENTICAL `notFound()`, never a distinguishable
 *     "exists but not yours" signal.
 *
 * SCOPE: the raw `orderId` is shown as the order reference (not `orders.order_code`, which Feature
 * 007's own read function is buyer-org-scoped only — fetching it here would silently exclude a
 * genuine seller-of-record; the raw id keeps buyer/seller symmetry with no extra read).
 *
 * FEATURE 008 T023 (this run) — Documents (proforma + tax invoice) and Payout sections, added on the
 * SAME RLS-only authorization this page already established for T022. `getProforma`/`getTaxInvoice`
 * (M3: `proforma_invoices_read`/`tax_invoices_read`) admit the same buyer/finance/admin audience as
 * `payments_read` — never a seller (see AUTHORIZATION above). `getPayoutsForOrder` (`payouts_view`:
 * `is_platform_admin() OR is_org_member(seller_organization_id)`) is NARROWER — a buyer with no
 * seller line on this order simply gets `[]` back (never an error, never a distinguishable "exists
 * but not yours" signal), so the payout section renders its own empty state for that caller rather
 * than fabricating a zero. A payout row is ALWAYS the caller's own seller record (RLS never returns
 * another organization's line), so no seller-identifying column is rendered. `fileAssetId` on both
 * document DTOs is an internal reference with no download surface yet (no Storage signed-URL
 * generation exists for these buckets) and is deliberately never rendered (FR-019, T023 Verify: "no
 * file-byte URL fabrication") — only genuinely user-meaningful metadata is shown.
 *
 * FEATURE 008 T034 (this run, real Chrome + axe) found and fixed a genuine, pervasive defect: every
 * data-row `<dt>` label, table-column header and empty-state message on this page — INCLUDING every
 * one T022 itself had already shipped — read `appCopy.finance.payments.detail.X` directly (always
 * English; `appCopy` is the static `en` import, never locale-reactive) instead of
 * `<AppBilingual pick={(c) => c.finance.payments.detail.X} />`. T022's own real-browser pass never
 * caught it because its `expected` regex only required SOME Arabic text to appear anywhere on the
 * page (the heading/badge), not that every specific label did. Every such usage below is now
 * `<AppBilingual>`; the ONE deliberate exception is the `aria-label` on the scrollable items-table
 * region a few lines down — an HTML attribute must be a plain string, and `appCopy.X` there matches
 * this codebase's own established convention (`src/app/dashboard/coffee/page.tsx`'s search
 * `aria-label`, `listings/[offerId]/page.tsx`'s section `aria-label`) — a known, pre-existing,
 * English-only limitation of that one specific pattern, not newly introduced here.
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
    // Feature 013 T063 — M3 removed sellers from `payments` (and from `order_financials`, the proforma header and
    // `tax_invoices`). A seller of this order therefore lands here and is shown ONLY its own lines through the
    // seller-safe projection `v_seller_order_lines`, plus its own payout. Nothing the buyer owns is read. A caller
    // with no own line gets the same `notFound()` as a nonexistent or cross-organization order (no existence leak).
    const sellerView = await getSellerOrderLines({ orderId, organizationId: identity.organization.organizationId });
    if (!sellerView) {
      notFound();
    }
    const sellerPayouts = await getPayoutsForOrder({ orderId });
    return <SellerOrderDetail view={sellerView} payouts={sellerPayouts} />;
  }

  const [financials, funding, proforma, taxInvoice, payouts] = await Promise.all([
    getOrderFinancials({ orderId }),
    requestFunding({ orderId }),
    getProforma({ orderId }),
    getTaxInvoice({ orderId }),
    getPayoutsForOrder({ orderId }),
  ]);
  // Neither `ProformaDTO` nor its item rows carry their own `currency` column (the schema stores one
  // currency per order, not per proforma line) — reuse the SAME order's already-fetched currency
  // rather than fabricating one, falling back to the payment's own (guaranteed non-null here) if the
  // financial snapshot were ever absent.
  const documentCurrency = financials?.currency ?? payment.currency;
  const notYetAssigned = <AppBilingual pick={(c) => c.finance.payments.detail.notYetAssigned} />;

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
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.orderReferenceLabel} />
            </dt>
            <dd className="font-mono break-all tabular-nums text-foreground" dir="ltr">
              {orderId}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.amountLabel} />
            </dt>
            <dd className="font-mono tabular-nums text-foreground" dir="ltr">
              {payment.currency} {payment.amount}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.correlationLabel} />
            </dt>
            <dd className="font-mono break-all text-foreground" dir="ltr">
              {payment.correlationId ?? notYetAssigned}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.externalReferenceLabel} />
            </dt>
            <dd className="font-mono break-all text-foreground" dir="ltr">
              {payment.externalReference ?? notYetAssigned}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="financials-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <h2 id="financials-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.finance.payments.detail.financialsSectionHeading} />
        </h2>
        {financials ? (
          <FinancialSummary financials={financials} />
        ) : (
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.finance.payments.detail.financialsNotCalculated} />
          </p>
        )}
      </section>

      <section aria-labelledby="funding-heading" className="flex flex-col gap-4">
        <h2 id="funding-heading" className="sr-only">
          <AppBilingual pick={(c) => c.finance.payments.detail.fundingSectionHeading} />
        </h2>
        {!funding.ok ? <FundingUnavailableNotice /> : null}
        {funding.ok && funding.data.clientSecret ? (
          // Feature 008 RUN E (Stripe provider decision) T014 — genuinely reachable only once Stripe is
          // configured AND the create-payment-intent Edge Function is deployed (neither is true today,
          // so this branch is real code, not yet a live path — see lib/finance/funding.ts's own header).
          (() => {
            const publishableKey = stripePublishableKey();
            return publishableKey ? <StripePaymentCollector clientSecret={funding.data.clientSecret} publishableKey={publishableKey} /> : null;
          })()
        ) : null}
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
                  <dt className="text-muted-foreground">
                    <AppBilingual pick={(c) => c.finance.payments.detail.proforma.codeLabel} />
                  </dt>
                  <dd className="font-mono break-all text-foreground" dir="ltr">
                    {proforma.proformaCode}
                  </dd>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-muted-foreground">
                    <AppBilingual pick={(c) => c.finance.payments.detail.proforma.issuedAtLabel} />
                  </dt>
                  <dd className="text-foreground" dir="ltr">
                    {proforma.issuedAt}
                  </dd>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-muted-foreground">
                    <AppBilingual pick={(c) => c.finance.payments.detail.proforma.validUntilLabel} />
                  </dt>
                  <dd className="text-foreground" dir="ltr">
                    {proforma.validUntil ?? notYetAssigned}
                  </dd>
                </div>
              </dl>
              {proforma.items.length > 0 ? (
                // T034 (real Chrome + axe, this run) found a genuine `scrollable-region-focusable`
                // violation here: on a narrow viewport this table overflows and scrolls horizontally,
                // but the scrollable element itself was not reachable by keyboard (WCAG 2.1.1). Fixed
                // by making the scroll container a focusable, named region — the minimal correct fix
                // for this axe rule, not present as a wrapper anywhere else in the codebase to copy.
                // The `aria-label` is deliberately the raw (English-only) `appCopy` string — an HTML
                // attribute cannot hold a `<AppBilingual>` element; see this file's own header comment.
                <div
                  className="overflow-x-auto"
                  role="region"
                  tabIndex={0}
                  aria-label={appCopy.finance.payments.detail.proforma.itemsHeading}
                >
                  <table className="w-full min-w-[480px] text-[length:var(--text-small)]">
                    <caption className="sr-only">
                      <AppBilingual pick={(c) => c.finance.payments.detail.proforma.itemsHeading} />
                    </caption>
                    <thead>
                      <tr className="border-b border-border text-start text-muted-foreground">
                        <th scope="col" className="py-2 text-start font-medium">
                          <AppBilingual pick={(c) => c.finance.payments.detail.proforma.itemColumns.description} />
                        </th>
                        <th scope="col" className="py-2 text-start font-medium">
                          <AppBilingual pick={(c) => c.finance.payments.detail.proforma.itemColumns.quantity} />
                        </th>
                        <th scope="col" className="py-2 text-start font-medium">
                          <AppBilingual pick={(c) => c.finance.payments.detail.proforma.itemColumns.unitPrice} />
                        </th>
                        <th scope="col" className="py-2 text-start font-medium">
                          <AppBilingual pick={(c) => c.finance.payments.detail.proforma.itemColumns.amount} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {proforma.items.map((item) => (
                        <tr key={item.id} className="border-b border-border last:border-b-0">
                          <td className="py-2 text-foreground">{item.description}</td>
                          <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                            {item.quantityKg === null ? notYetAssigned : `${item.quantityKg} kg`}
                          </td>
                          <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                            {item.unitPrice === null ? notYetAssigned : formatMoney(documentCurrency, item.unitPrice)}
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
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.proforma.none} />
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-6">
          <h3 className="text-[length:var(--text-small)] font-semibold text-foreground">
            <AppBilingual pick={(c) => c.finance.payments.detail.taxInvoice.heading} />
          </h3>
          {taxInvoice ? (
            <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.finance.payments.detail.taxInvoice.numberLabel} />
                </dt>
                <dd className="font-mono break-all text-foreground" dir="ltr">
                  {taxInvoice.invoiceNumber}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-muted-foreground">
                  <AppBilingual pick={(c) => c.finance.payments.detail.taxInvoice.issuedAtLabel} />
                </dt>
                <dd className="text-foreground" dir="ltr">
                  {taxInvoice.issuedAt ?? notYetAssigned}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-[length:var(--text-small)] text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.taxInvoice.none} />
            </p>
          )}
        </div>
      </section>

      <PayoutsSection payouts={payouts} />
    </div>
  );
}

/**
 * The caller's own payout records for one order (`payouts_view`: always the caller's OWN seller record, never another
 * organization's). Shared by the buyer/finance view (where a buyer simply gets the empty state) and the seller view.
 */
function PayoutsSection({ payouts }: { payouts: readonly PayoutDTO[] }) {
  const notYetAssigned = <AppBilingual pick={(c) => c.finance.payments.detail.notYetAssigned} />;
  return (
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
                    <dt className="text-muted-foreground">
                      <AppBilingual pick={(c) => c.finance.payments.detail.payoutColumns.paidAt} />
                    </dt>
                    <dd className="text-foreground" dir="ltr">
                      {payout.paidAt ?? notYetAssigned}
                    </dd>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-muted-foreground">
                      <AppBilingual pick={(c) => c.finance.payments.detail.payoutColumns.reference} />
                    </dt>
                    <dd className="font-mono break-all text-foreground" dir="ltr">
                      {payout.paymentReference ?? notYetAssigned}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
            <p className="text-[length:var(--text-micro)] text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.payoutAccountingNotice} />
            </p>
          </div>
        ) : (
          <p className="text-[length:var(--text-small)] text-muted-foreground">
            <AppBilingual pick={(c) => c.finance.payments.detail.noPayout} />
          </p>
        )}
      </section>
  );
}

/**
 * Feature 013 T063 — the seller-safe order view. Every value comes from `v_seller_order_lines` (the caller's own lines,
 * own snapshot economics) or the caller's own payout rows. It renders NO payment, buyer total, order_financials,
 * proforma header or items, tax invoice, funding, bank or destination data, and no other seller's line.
 */
function SellerOrderDetail({ view, payouts }: { view: SellerOrderViewDTO; payouts: readonly PayoutDTO[] }) {
  const pending = <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.amountsPending} />;
  const money = (currency: string, value: number | null) => (value === null ? pending : formatMoney(currency, value));
  return (
    <div className="flex flex-col gap-8" data-slot="seller-order-view">
      <PageHeader
        title={<AppBilingual pick={(c) => c.finance.payments.detail.sellerView.breadcrumb} />}
        trail={[
          { label: <AppBilingual pick={(c) => c.overview} />, href: "/dashboard" },
          { label: <AppBilingual pick={(c) => c.finance.payouts.list.title} />, href: "/dashboard/payouts" },
          { label: <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.breadcrumb} /> },
        ]}
      />

      <section aria-labelledby="seller-lines-heading" className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:p-7">
        <p className="max-w-[70ch] text-[length:var(--text-small)] text-muted-foreground">
          <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.description} />
        </p>
        <dl className="grid grid-cols-1 gap-3 text-[length:var(--text-small)] sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.orderCodeLabel} />
            </dt>
            <dd className="font-mono break-all text-foreground" dir="ltr">
              {view.orderCode}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">
              <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.orderStatusLabel} />
            </dt>
            <dd className="text-foreground">
              <AppBilingual pick={(c) => (c.orders.status as Record<string, string>)[view.orderStatus] ?? view.orderStatus} />
            </dd>
          </div>
        </dl>
        <h2 id="seller-lines-heading" className="text-base font-semibold text-foreground">
          <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.linesHeading} />
        </h2>
        <div className="overflow-x-auto" role="region" tabIndex={0} aria-label={appCopy.finance.payments.detail.sellerView.linesHeading}>
          <table className="w-full min-w-[560px] text-[length:var(--text-small)]">
            <thead>
              <tr className="border-b border-border text-start text-muted-foreground">
                <th scope="col" className="py-2 text-start font-medium">
                  <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.columns.product} />
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.columns.quantity} />
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.columns.gross} />
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.columns.commission} />
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  <AppBilingual pick={(c) => c.finance.payments.detail.sellerView.columns.net} />
                </th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((line) => (
                <tr key={line.orderItemId} data-slot="seller-order-line" className="border-b border-border last:border-b-0">
                  <td className="py-2 text-foreground">
                    <span className="block">{line.productNameSnapshot}</span>
                    <span className="block font-mono text-muted-foreground" dir="ltr">
                      {line.lotCodeSnapshot}
                    </span>
                  </td>
                  <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                    {line.quantityKg} kg
                  </td>
                  <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                    {money(line.currency, line.ownGrossAmount)}
                  </td>
                  <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                    {money(line.currency, line.ownCommissionAmount)}
                  </td>
                  <td className="py-2 font-mono tabular-nums text-foreground" dir="ltr">
                    {money(line.currency, line.ownSellerNetAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PayoutsSection payouts={payouts} />
    </div>
  );
}

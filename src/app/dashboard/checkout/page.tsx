import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { DestinationPicker } from "@/components/commerce/destination-picker";
import { EstimateSummary } from "@/components/commerce/estimate-summary";
import { IssueProformaButton } from "@/components/commerce/issue-proforma-button";
import { AppBilingual } from "@/components/locale/app-bilingual";
import { StateScreen } from "@/components/layout/state-screen";
import { Button } from "@/components/ui/button";
import { getRequestIdentity } from "@/lib/auth/dal";
import { readCart } from "@/lib/commerce/cart";
import { commerceErrorMessageKey } from "@/lib/commerce/errors";
import { readDestinations } from "@/lib/commerce/destinations";
import { getCheckoutEstimate } from "@/lib/commerce/quote";

export const metadata: Metadata = { title: "Checkout" };

/**
 * Feature 013 T084 — checkout estimate + issuance page. Launch scope: no promo-code control or funding
 * label (zero discount unless the server itself returns one); non-UAE/unsupported-destination refusal
 * is explained without ever displaying a final payable proforma. This page computes nothing — every
 * number comes from `getCheckoutEstimate`/`estimate_cart` (SEC-002/SEC-003). Bilingual text renders
 * both languages server-side (`AppBilingual`), matching the rest of the app — never a resolved
 * "current locale", which a Server Component does not have.
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ destinationId?: string }> }) {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.organization) return <StateScreen kind="unauthorized" />;
  if (!identity.isAuthorizedMember || !identity.organization.canBuy) return <StateScreen kind="forbidden" />;

  const [cart, destinations, { destinationId: requestedDestinationId }] = await Promise.all([
    readCart(identity.organization.organizationId),
    readDestinations(identity.organization.organizationId),
    searchParams,
  ]);

  if (!cart.orderId || cart.lines.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={<AppBilingual pick={(c) => c.commerce.checkoutUi.title} />} />
        <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card p-6 text-center sm:p-10">
          <h2 className="text-xl font-semibold"><AppBilingual pick={(c) => c.commerce.checkoutUi.emptyCartTitle} /></h2>
          <Button className="mt-5 min-h-11" nativeButton={false} render={<Link href="/dashboard/cart" />}>
            <AppBilingual pick={(c) => c.commerce.cartUi.title} />
          </Button>
        </section>
      </div>
    );
  }

  const selectedId = requestedDestinationId ?? destinations.find((destination) => destination.isDefault)?.id ?? destinations[0]?.id ?? null;
  const estimateResult = selectedId ? await getCheckoutEstimate(cart.orderId, selectedId) : null;
  const errorKey = estimateResult && !estimateResult.ok ? commerceErrorMessageKey(estimateResult.code) : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={<AppBilingual pick={(c) => c.commerce.checkoutUi.title} />} description={<AppBilingual pick={(c) => c.commerce.checkoutUi.description} />} />

      <section className="flex flex-col gap-2">
        <h2 className="text-[length:var(--text-h4)] font-semibold text-foreground"><AppBilingual pick={(c) => c.commerce.checkoutUi.destinationHeading} /></h2>
        <DestinationPicker
          destinations={destinations}
          selectedId={selectedId}
          href={(id) => `/dashboard/checkout?destinationId=${id}`}
          pickLabel={<AppBilingual pick={(c) => c.commerce.checkoutUi.destinationHeading} />}
          addHref="/dashboard/destinations"
          addLabel={<AppBilingual pick={(c) => c.commerce.destinationsUi.add} />}
        />
      </section>

      {!selectedId ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-border bg-muted p-4 text-[length:var(--text-small)]">
          <AppBilingual pick={(c) => c.commerce.errors.destination_required} />
        </p>
      ) : errorKey ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/5 p-4 text-[length:var(--text-small)] text-destructive">
          <AppBilingual pick={(c) => c.commerce.errors[errorKey]} />
        </p>
      ) : estimateResult && estimateResult.ok ? (
        <>
          <EstimateSummary
            estimate={estimateResult.data}
            copy={{
              lineHeader: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.lineHeader} />,
              quantityHeader: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.quantityHeader} />,
              unitPriceHeader: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.unitPriceHeader} />,
              netHeader: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.netHeader} />,
              discount: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.discount} />,
              shippingGroup: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.shippingGroup} />,
              shipping: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.shipping} />,
              shippingVat: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.shippingVat} />,
              merchandiseNet: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.merchandiseNet} />,
              vat: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.vat} />,
              total: <AppBilingual pick={(c) => c.commerce.checkoutUi.estimate.total} />,
              destinationRequired: <AppBilingual pick={(c) => c.commerce.errors.destination_required} />,
            }}
          />
          <IssueProformaButton
            orderId={cart.orderId}
            destinationId={selectedId}
            disabled={estimateResult.data.buyerTotal === null}
            label={<AppBilingual pick={(c) => c.commerce.checkoutUi.requestProforma} />}
            pendingLabel={<AppBilingual pick={(c) => c.commerce.checkoutUi.requestingProforma} />}
          />
        </>
      ) : null}
    </div>
  );
}

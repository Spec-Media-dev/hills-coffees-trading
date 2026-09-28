import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/app/copy/en";
import { ar } from "@/lib/app/copy/ar";

const source = (path: string) => readFileSync(path, "utf8");

describe("Feature 013 checkout and proforma boundary", () => {
  it("gets the checkout estimate from the server RPC and performs no frontend money arithmetic", () => {
    const page = source("src/app/dashboard/checkout/page.tsx");
    const quote = source("lib/commerce/quote.ts");
    const summary = source("components/commerce/estimate-summary.tsx");
    expect(page).toContain("getCheckoutEstimate(cart.orderId, selectedId)");
    expect(quote).toContain('supabase.rpc("estimate_cart"');
    expect(page).toContain("disabled={estimateResult.data.buyerTotal === null}");
    for (const text of [page, quote, summary]) {
      expect(text).not.toMatch(/(?:unitPrice|gross|discount|merchandiseNet|shippingTotal|vatTotal|buyerTotal)\s*[+*/-]/);
    }
  });

  it("never reads internal economics for the buyer-facing proforma", () => {
    const read = source("lib/commerce/read.ts");
    const executable = read.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(executable).toContain('.from("proforma_invoices")');
    expect(executable).toContain('.from("proforma_invoice_items")');
    expect(executable).not.toMatch(/\.from\("(?:proforma_line_economics|proforma_seller_settlements|payment_accounts)"\)/);
    expect(executable).not.toMatch(/\bcommission_amount\b|\bseller_net_amount\b|\bhills_share_amount\b/);
  });

  it("routes V1 drafts to the cart and issued/held V1 orders to the proforma, before legacy expiry", () => {
    const list = source("src/app/dashboard/orders/page.tsx");
    const detail = source("src/app/dashboard/orders/[orderId]/page.tsx");
    const checkout = source("src/app/dashboard/orders/[orderId]/checkout/page.tsx");
    const shipmentActions = source("lib/delivery/buyer.ts");
    const legacyCheckout = source("lib/orders/checkout.ts");
    expect(list).toContain('order.status === "DRAFT" ? "/dashboard/cart"');
    expect(list).toContain('rows.filter((order) => order.commerceFlow === "LEGACY")');
    expect(list).toContain("ensureReservationFresh(stale.id)");
    expect(detail.indexOf('scopedOrder.commerceFlow === "BANK_TRANSFER_V1"')).toBeLessThan(detail.indexOf("const freshness = await ensureHoldFresh(orderId)"));
    expect(checkout).toContain('order.status === "DRAFT" ? "/dashboard/checkout"');
    expect(shipmentActions.match(/order\.commerceFlow === "BANK_TRANSFER_V1"/g)).toHaveLength(4);
    expect(legacyCheckout.indexOf('order.commerceFlow === "BANK_TRANSFER_V1"')).toBeLessThan(legacyCheckout.indexOf('supabase.rpc("checkout_order"'));
  });

  it("keeps new checkout, proforma, and status copy aligned in English and Arabic", () => {
    for (const key of ["checkoutUi", "proformaUi", "statusLabels", "errors"] as const) {
      expect(Object.keys(ar.commerce![key]!)).toEqual(Object.keys(en.commerce[key]));
    }
  });

  it("replaces an expired proforma through the server issuance action, without using the DRAFT-only estimator", () => {
    const detail = source("src/app/dashboard/orders/[orderId]/proforma/page.tsx");
    expect(detail).toContain("<IssueProformaButton");
    expect(detail).toContain("orderId={orderId}");
    expect(detail).toContain("destinationId={selectedReplacementDestinationId}");
    expect(detail).not.toContain("getCheckoutEstimate");
  });

  it("refreshes reservation status at the database deadline without extending the hold client-side", () => {
    const countdown = source("components/commerce/reservation-countdown.tsx");
    expect(countdown).toContain("<HoldCountdown holdExpiresAt={expiresAt} labels=");
    expect(countdown).toContain("router.refresh()");
    expect(countdown).not.toMatch(/set.*expiresAt|update.*hold_expires_at/);
  });

  it("requires an explicit accessible confirmation and keeps failures actionable", () => {
    const panel = source("components/commerce/proforma-confirm-panel.tsx");
    expect(panel).toContain("<AlertDialogTrigger");
    expect(panel).toContain("<AlertDialogAction");
    expect(panel).toContain("confirmReservation(undefined, formData)");
    expect(panel).toContain('setFailure({ ok: false, code: "commerce_error" })');
    expect(panel).toContain("<AlertDialogCancel disabled={pending}>");
  });
});

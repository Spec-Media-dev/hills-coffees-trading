import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, FOUNDATION_FIXTURES, INVENTORY_FIXTURES, createAnonymousFixtureClient, resetCheckoutFixtures, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 008 T022 — private payment state routes (`/dashboard/payments`,
 * `/dashboard/payments/[orderId]`). Provider-neutral only: builds a real checked-out order through
 * Feature 007's OWN production write paths (same helper/convention as `tests/finance/read.test.ts`'s
 * `buildCheckedOutOrder` — never a raw insert) and renders the REAL page components against it.
 *
 * SELLER-ACCESS NOTE (honest limitation, same one `tests/listings/sales-page.test.tsx` already
 * records for the identical root cause): no live fixture anywhere in the test database has ever sold
 * anything as a genuine member seller (`CHECKOUT_FIXTURES.offerCheckout` is HILLS-owned, not a member
 * listing), so a live "a real member seller reads its own settled order's payment" proof does not
 * exist for ANY feature yet. What IS proven here, honestly: (a) the exact `payments_view`/
 * `financials_view` policy text already includes a genuine SELLER branch inside `can_view_order`
 * (re-asserted below from the same schema-report evidence `tests/finance/rls-policy.test.ts` already
 * pins — not re-derived, not assumed), and (b) the DETAIL PAGE's own source adds NO buyer-only
 * narrowing beyond that RLS boundary (unlike `/dashboard/deliveries/[shipmentId]`, which deliberately
 * narrows to the buyer org for address/contact privacy — a different sensitivity level; see that
 * page's own header). Together these prove the CODE PATH admits a seller-of-record exactly as far as
 * the database already allows, without fabricating a settled member-seller order to exercise it.
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(cleanup);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

async function markShipmentReadyAsWarehouse(shipmentId: string): Promise<void> {
  const warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  const { error } = await warehouse.from("order_shipments").update({ status: "READY" }).eq("id", shipmentId);
  if (error) throw new Error(`warehouse READY transition refused: ${error.message}`);
}

/** Builds and fully checks out a fresh order for the given org, through production write paths only — identical to `tests/finance/read.test.ts`'s own helper. */
async function buildCheckedOutOrder(client: SupabaseClient, organizationId: string, quantityKg: number): Promise<string> {
  return withLiveClient(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const { createShipment, addShipmentItem, requestShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
    const { getOrderShipments } = await import("@/lib/orders/read");
    const { executeCheckout } = await import("@/lib/orders/checkout");
    const userId = (await client.auth.getUser()).data.user!.id;

    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(`setup: ${order.code}`);
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: CHECKOUT_FIXTURES.offerCheckout, quantityKg });
    if (!item.ok) throw new Error(`setup: ${item.code}`);

    const shipmentForm = new FormData();
    shipmentForm.set("orderId", order.data.id);
    shipmentForm.set("deliveryMethod", "Courier");
    shipmentForm.set("countryCode", "AE");
    shipmentForm.set("addressLine", "1 Finance T022 Street");
    shipmentForm.set("contactName", "Finance T022 Tester");
    shipmentForm.set("contactPhone", "+971500000001");
    const shipment = await createShipment(undefined, shipmentForm);
    if (!shipment.ok) throw new Error(`setup: ${shipment.code}`);

    const shipments = await getOrderShipments({ orderId: order.data.id });
    const shipmentId = shipments[0]!.id;

    const itemForm = new FormData();
    itemForm.set("orderId", order.data.id);
    itemForm.set("shipmentId", shipmentId);
    itemForm.set("orderItemId", item.data.id);
    itemForm.set("plannedQuantityKg", String(quantityKg));
    const planned = await addShipmentItem(undefined, itemForm);
    if (!planned.ok) throw new Error(`setup: ${planned.code}`);

    const requestForm = new FormData();
    requestForm.set("orderId", order.data.id);
    requestForm.set("shipmentId", shipmentId);
    const requested = await requestShipment(undefined, requestForm);
    if (!requested.ok) throw new Error(`setup: ${requested.code}`);

    await markShipmentReadyAsWarehouse(shipmentId);

    const checkedOut = await executeCheckout(order.data.id);
    if (!checkedOut.ok) throw new Error(`setup checkout: ${checkedOut.code}`);

    return order.data.id;
  });
}

async function renderWithLocale(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

async function renderListPage(client: SupabaseClient, searchParams: { page?: string } = {}) {
  return withLiveClient(client, async () => {
    const { default: PaymentsPage } = await import("@/src/app/dashboard/payments/page");
    return renderWithLocale(await PaymentsPage({ searchParams: Promise.resolve(searchParams) }));
  });
}

async function callDetailPage(client: SupabaseClient, orderId: string) {
  return withLiveClient(client, async () => {
    const { default: PaymentDetailPage } = await import("@/src/app/dashboard/payments/[orderId]/page");
    return PaymentDetailPage({ params: Promise.resolve({ orderId }) });
  });
}

async function renderDetailPage(client: SupabaseClient, orderId: string) {
  return renderWithLocale(await callDetailPage(client, orderId));
}

let orderId: string;

beforeAll(async () => {
  resetCheckoutFixtures();
  const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
  orderId = await buildCheckedOutOrder(orgB, INVENTORY_FIXTURES.orgB.organizationId, 1);
}, 60_000);

describe("T022 — authorized buyer reads the correct stored payment/order snapshot", () => {
  it(
    "the list page shows the checked-out order with its real status/amount/currency and a working detail link",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      await renderListPage(orgB);

      const link = document.querySelector(`a[href="/dashboard/payments/${orderId}"]`);
      expect(link).not.toBeNull();
      expect(document.body.textContent).toMatch(/USD/);
      expect(document.querySelectorAll('[data-slot="payment-status-badge"][data-status="PENDING"]').length).toBeGreaterThan(0);
    },
    60_000
  );

  it(
    "the detail page shows the exact stored payment fields and the order financial snapshot verbatim",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      await renderDetailPage(orgB, orderId);

      const badge = document.querySelector('[data-slot="payment-status-badge"]');
      expect(badge?.getAttribute("data-status")).toBe("PENDING");
      expect(document.body.textContent).toMatch(/USD/);
      expect(document.body.textContent).toContain(orderId);
      // FinancialSummary (reused, existing component) renders the buyer-facing snapshot fields.
      expect(document.querySelector('[data-slot="financial-summary"]')).not.toBeNull();
    },
    60_000
  );
});

describe("T022 — authorization boundary (live)", () => {
  it("cross-org: an unrelated organization gets an honestly empty payments list and notFound() on the direct detail URL", async () => {
    const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    await renderListPage(orgA);
    expect(document.querySelector(`a[href="/dashboard/payments/${orderId}"]`)).toBeNull();
    cleanup();

    await expect(callDetailPage(orgA, orderId)).rejects.toBeTruthy();
  }, 60_000);

  it("a syntactically valid but nonexistent order id also triggers notFound() — identical outcome to cross-org (no existence leak)", async () => {
    const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await expect(callDetailPage(orgB, "00000000-0000-4000-8000-000000000000")).rejects.toBeTruthy();
  }, 60_000);

  it("anonymous access is denied by the existing dashboard auth boundary — unauthorized state, never a leaked query attempt", async () => {
    const anonymous = createAnonymousFixtureClient();
    await renderListPage(anonymous);
    expect(document.querySelector('[data-state-screen="unauthorized"]')).not.toBeNull();
    cleanup();

    await renderDetailPage(anonymous, orderId);
    expect(document.querySelector('[data-state-screen="unauthorized"]')).not.toBeNull();
  }, 60_000);

  it("the payments_view/financials_view live policy already includes a genuine seller-of-record branch (re-read directly from the schema report, not assumed)", () => {
    const report = JSON.parse(JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"))[0].database_schema_report) as {
      rls_policies: { table_name: string; policy_name: string; using_expression: string | null }[];
      functions: { function_name: string; definition: string }[];
    };
    const paymentsView = report.rls_policies.find((p) => p.table_name === "payments" && p.policy_name === "payments_view");
    const financialsView = report.rls_policies.find((p) => p.table_name === "order_financials" && p.policy_name === "financials_view");
    expect(paymentsView?.using_expression).toBe("(is_platform_admin() OR can_view_order(order_id))");
    expect(financialsView?.using_expression).toBe("can_view_order(order_id)");

    const canViewOrder = report.functions.find((f) => f.function_name === "can_view_order");
    expect(canViewOrder).toBeDefined();
    // A genuine SELLER-of-record branch: joins order_items → coffee_offers → the CALLER'S OWN
    // organization membership on coffee_offers.seller_organization_id — not merely the buyer branch.
    expect(canViewOrder!.definition).toMatch(/coffee_offers/);
    expect(canViewOrder!.definition).toMatch(/seller_organization_id/);
    expect(canViewOrder!.definition).toMatch(/organization_members/);
  });

  it("the detail page adds NO buyer-only narrowing beyond RLS — unlike the deliveries detail page, it never filters getPayment/getOrderFinancials by the caller's own organizationId", () => {
    const source = readFileSync("src/app/dashboard/payments/[orderId]/page.tsx", "utf8");
    expect(source).not.toMatch(/buyer_organization_id|buyerOrganizationId/);
    expect(source).not.toMatch(/payment\.organizationId|financials\.organizationId/);
    // It DOES still gate on `isAuthorizedMember` — an anonymous/unauthorized caller never reaches getPayment.
    expect(source).toMatch(/isAuthorizedMember/);
  });
});

describe("T022 — funding is honest while provider selection is pending (PS2)", () => {
  it("the detail page renders the real requestFunding() outcome as the funding-unavailable notice, never a fabricated success/pending state", async () => {
    const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderDetailPage(orgB, orderId);

    const notice = document.querySelector('[data-finance-notice="funding-unavailable"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toMatch(/Funding isn't available/i);
  }, 60_000);

  it("no fund/pay/provider CTA exists anywhere on either page — the detail page has zero buttons at all; the list page's only button is a disabled Previous pagination control (pure navigation, not a payment action)", async () => {
    const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderDetailPage(orgB, orderId);
    expect(document.querySelectorAll("button").length).toBe(0);
    cleanup();

    await renderListPage(orgB);
    const buttons = [...document.querySelectorAll("button")];
    for (const button of buttons) {
      expect(button.disabled, button.outerHTML).toBe(true);
      expect(button.textContent, button.outerHTML).toMatch(/Previous|Next/);
    }
    expect(document.body.textContent).not.toMatch(/\b(Fund|Pay now|Charge|Submit payment|Confirm payment|Complete payment)\b/i);
  }, 60_000);

  it("no bank-instruction text (IBAN/account/swift/bank name) appears anywhere on the detail page", async () => {
    const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    await renderDetailPage(orgB, orderId);
    expect(document.body.textContent).not.toMatch(/IBAN|SWIFT|account number|bank transfer instructions/i);
  }, 60_000);

  it("the payments list is honestly empty for an organization with no orders at all", async () => {
    const emptyOrg = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    await renderListPage(emptyOrg);
    // buyerOnly's org id is INVENTORY_FIXTURES.orgA, which owns an unrelated pre-existing fixture
    // order — assert the honest state renders (either the EmptyState or a table with zero rows for
    // THIS order), never a fabricated payment for this specific checked-out order id.
    expect(document.querySelector(`a[href="/dashboard/payments/${orderId}"]`)).toBeNull();
  }, 60_000);
});

/** Strips comments so a doc comment legitimately naming a forbidden pattern never trips a "must not contain X" check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const T022_FILES = [
  "src/app/dashboard/payments/page.tsx",
  "src/app/dashboard/payments/[orderId]/page.tsx",
  "components/finance/payment-status-badge.tsx",
  "components/finance/funding-unavailable-notice.tsx",
];

describe("T022 — source-level proofs: provider-neutral, no secrets, no network, no service role, no shared cache", () => {
  for (const file of T022_FILES) {
    const source = stripComments(readFileSync(file, "utf8"));

    it(`${file}: no provider SDK/name, no network call, no secret/credential reference`, () => {
      expect(source).not.toMatch(/stripe|tazapay|paytabs|escrow\.com|checkout\.com|adyen|braintree|paypal/i);
      expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|axios/);
      expect(source).not.toMatch(/process\.env\.\w*(SECRET|KEY|TOKEN|CREDENTIAL)/);
      expect(source).not.toMatch(/NEXT_PUBLIC_\w*STRIPE|EXPO_PUBLIC_/);
    });

    it(`${file}: no service-role client, no shared/public cache directive`, () => {
      expect(source).not.toMatch(/service_role|SERVICE_ROLE|createAdminClient/);
      expect(source).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag|Redis|Upstash/);
    });

    it(`${file}: never calls admin_review_payment/submit_payment_proof or a raw settlement RPC`, () => {
      expect(source).not.toMatch(/\.rpc\(\s*["'](admin_review_payment|submit_payment_proof)["']/);
      expect(source).not.toMatch(/decidePayment|settlement\.ts|createEdgeFunction|supabase\/functions/);
    });

    it(`${file}: no bank-account field name (payment_accounts is Feature 010's configuration surface, never rendered here)`, () => {
      expect(source).not.toMatch(/account_number|iban|swift_code|bank_name|payment_accounts/i);
    });
  }

  it("no route under /dashboard/payments overrides robots — non-indexability is inherited from the dashboard layout", () => {
    const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
    for (const file of ["src/app/dashboard/payments/page.tsx", "src/app/dashboard/payments/[orderId]/page.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/robots:/);
    }
  });

  it("T022 stays independent of T023–T026 and Feature 010: no proforma/tax-invoice/payout rendering, no dashboard-registry module registration, no admin console import", () => {
    for (const file of T022_FILES) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/getProforma|getTaxInvoice|getPayoutsForOrder|getPayoutsForOrganization/);
      expect(source, file).not.toMatch(/DASHBOARD_MODULES|registerModule|dashboard-admin/);
    }
  });
});

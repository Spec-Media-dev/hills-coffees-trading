import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import { ORG_A, ORG_B, chainHelpers, prepareChain, teardownChain, type ChainSessions, type ChainTeardown } from "@/tests/listings/live-chain";

/**
 * Feature 008 T023/T025/T027 (this run) — LIVE proof of the documents (proforma + tax invoice) and
 * payout presentation added to `/dashboard/payments/[orderId]` and the new `/dashboard/payouts` list,
 * against a GENUINE settled MEMBER_SELLER sale (`payouts` rows are only ever created by
 * `admin_review_payment()` for a `seller_type_snapshot = 'MEMBER_SELLER'` line — `tests/finance/
 * read.test.ts`'s own header records that no earlier Feature 008 test had ever exercised one).
 *
 * WHY `tests/listings/live-chain.ts`, NOT a new fixture chain: it already builds exactly this shape
 * (orgB buys Hills stock and settles, lists it as a MEMBER_SELLER resale offer, a second buyer
 * purchases and settles) through the SAME real production paths (`createDraftOrder`/`executeCheckout`/
 * `admin_review_payment`) Features 005/006/007/009 already prove against — reusing it is the DRY
 * choice, not a new invention, and its `teardownChain()` cleanup is already reviewed.
 *
 * RECONCILIATION (per this run's directive to reconcile task status against reality, not blindly
 * trust it): T023's stated `Depends: T021` assumed settlement only ever happens after a FUTURE
 * Stripe-trusted-funding gate (Phase 4, still blocked — see T007–T021 remain open in tasks.md). That
 * assumption is false: `admin_review_payment()` ALREADY performs real, atomic settlement today (FR-008
 * classifies it "B — reusable... currently does not require a trusted provider-funding condition"),
 * and every Feature 005/006/007/009 live-chain test already calls it as "the currently authoritative
 * settlement primitive." The payout/proforma/tax-invoice RECORDS this task needs to present already
 * exist for real today; only the FUTURE gated procedure (T017) does not. T023 is closed on that basis.
 */
/**
 * GATED (mirrors Feature 005/006's own convention for the SAME expensive multi-order settlement
 * chain — `tests/inventory/variance-live.test.ts`/`tests/listings/fills.test.ts`'s T018+T024 block):
 * two full checkout→settlement cycles are genuinely expensive and only needed for this deep proof,
 * not every routine `npm test` run. `F008_LIVE_PROOF=1 npx vitest run tests/finance/
 * t023-documents-payouts.test.tsx` runs it.
 */
const F008_LIVE = process.env.F008_LIVE_PROOF === "1";

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));

afterEach(cleanup);

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

async function renderWithLocale(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

async function renderDetailPage(client: SupabaseClient, orderId: string) {
  return withLiveClient(client, async () => {
    const { default: PaymentDetailPage } = await import("@/src/app/dashboard/payments/[orderId]/page");
    return renderWithLocale(await PaymentDetailPage({ params: Promise.resolve({ orderId }) }));
  });
}

async function renderPayoutsPage(client: SupabaseClient, searchParams: { page?: string } = {}) {
  return withLiveClient(client, async () => {
    const { default: PayoutsPage } = await import("@/src/app/dashboard/payouts/page");
    return renderWithLocale(await PayoutsPage({ searchParams: Promise.resolve(searchParams) }));
  });
}

describe.skipIf(!F008_LIVE)("T023 — documents and payout presentation over a real settled MEMBER_SELLER sale", () => {
  let sessions: ChainSessions;
  let helpers: ReturnType<typeof chainHelpers>;
  let sellerOrderId: string; // orgB's own purchase from Hills — a PAID order with NO payout (HILLS seller)
  let resaleOrderId: string; // orgA's purchase from orgB's resale listing — a PAID order WITH a real payout to orgB
  let payoutAmount = 0; // set from the REAL stored row by test 1, below — read verbatim, never computed here
  let teardown: ChainTeardown | null = null;

  beforeAll(async () => {
    sessions = await prepareChain();
    helpers = chainHelpers(withLiveClient, sessions);

    const stock = await helpers.giveOrgBSettledStock(20);
    sellerOrderId = stock.orderId;

    const draft = await helpers.createDraft(stock.position.id, 10, "F008 T023 payout proof");
    if (!draft.ok) throw new Error(`setup: createListingDraft refused: ${draft.code}`);
    await helpers.publishListing(draft.data.id);

    const purchase = await helpers.buyAndSettle(sessions.orgA, ORG_A, draft.data.id, 5);
    resaleOrderId = purchase.orderId;
  }, 900_000);

  afterAll(() => {
    if (!teardown) teardown = teardownChain();
  }, 300_000);

  it("1 read layer: the seller (orgB) sees its own payout for the resale order; the buyer (orgA) sees none — RLS never returns another organization's payout", async () => {
    const sellerRead = await withLiveClient(sessions.orgB, async () => {
      const { getPayoutsForOrder } = await import("@/lib/finance/read");
      return getPayoutsForOrder({ orderId: resaleOrderId });
    });
    expect(sellerRead).toHaveLength(1);
    expect(sellerRead[0]).toMatchObject({ orderId: resaleOrderId, sellerOrganizationId: ORG_B, currency: "USD" });
    expect(sellerRead[0]!.amount).toBeGreaterThan(0);
    payoutAmount = sellerRead[0]!.amount;

    // orgA is a genuine PARTY to this order (the buyer) but NOT the seller-of-record — proves the
    // payout boundary is seller-scoped, not merely "any party to the order" like proforma/payment are.
    const buyerRead = await withLiveClient(sessions.orgA, async () => {
      const { getPayoutsForOrder } = await import("@/lib/finance/read");
      return getPayoutsForOrder({ orderId: resaleOrderId });
    });
    expect(buyerRead).toEqual([]);

    // The org-wide list contains it for the seller...
    const orgWide = await withLiveClient(sessions.orgB, async () => {
      const { getPayoutsForOrganization } = await import("@/lib/finance/read");
      return getPayoutsForOrganization({ organizationId: ORG_B });
    });
    expect(orgWide.rows.some((row) => row.orderId === resaleOrderId)).toBe(true);
    // ...and NEVER for the buyer's own organization-wide payout list (orgA sold nothing here).
    const buyerOrgWide = await withLiveClient(sessions.orgA, async () => {
      const { getPayoutsForOrganization } = await import("@/lib/finance/read");
      return getPayoutsForOrganization({ organizationId: ORG_A });
    });
    expect(buyerOrgWide.rows.some((row) => row.orderId === resaleOrderId)).toBe(false);

    // Feature 013 M3 (T063): the seller-of-record is NOT a party to the buyer's money or documents. The seller reads
    // none of the buyer's payment, full-order financials, proforma header or tax invoice — only its own lines through
    // the seller-safe projection.
    const sellerForbidden = await withLiveClient(sessions.orgB, async () => {
      const { getPayment, getOrderFinancials, getProforma, getTaxInvoice, getSellerOrderLines } = await import("@/lib/finance/read");
      return {
        payment: await getPayment({ orderId: resaleOrderId }),
        financials: await getOrderFinancials({ orderId: resaleOrderId }),
        proforma: await getProforma({ orderId: resaleOrderId }),
        taxInvoice: await getTaxInvoice({ orderId: resaleOrderId }),
        own: await getSellerOrderLines({ orderId: resaleOrderId, organizationId: ORG_B }),
      };
    });
    expect(sellerForbidden.payment).toBeNull();
    expect(sellerForbidden.financials).toBeNull();
    expect(sellerForbidden.proforma).toBeNull();
    expect(sellerForbidden.taxInvoice).toBeNull();
    expect(sellerForbidden.own).not.toBeNull();
    expect(sellerForbidden.own!.lines.length).toBeGreaterThan(0);
    // the seller-safe projection never carries a buyer total, payment, bank, destination or proforma-header field
    for (const line of sellerForbidden.own!.lines) {
      expect(Object.keys(line).sort()).toEqual(["currency", "lotCodeSnapshot", "orderItemId", "ownCommissionAmount", "ownGrossAmount", "ownGroupShipmentStatus",
        "ownPayoutStatus", "ownSellerNetAmount", "productNameSnapshot", "quantityKg"]);
    }
    // ...and the BUYER has no seller view of its own purchase (it owns no line on it)
    const buyerAsSeller = await withLiveClient(sessions.orgA, async () => {
      const { getSellerOrderLines } = await import("@/lib/finance/read");
      return getSellerOrderLines({ orderId: resaleOrderId, organizationId: ORG_A });
    });
    expect(buyerAsSeller).toBeNull();
  }, 120_000);

  it("2 read layer: a real FINANCE operator sees the payout, the payment AND (since Feature 013 M3 closed the documented gap) the proforma", async () => {
    const financeReads = await withLiveClient(sessions.finance, async () => {
      const { getPayoutsForOrder, getPayment, getProforma } = await import("@/lib/finance/read");
      return { payouts: await getPayoutsForOrder({ orderId: resaleOrderId }), payment: await getPayment({ orderId: resaleOrderId }), proforma: await getProforma({ orderId: resaleOrderId }) };
    });
    expect(financeReads.payouts).toHaveLength(1);
    expect(financeReads.payouts[0]!.sellerOrganizationId).toBe(ORG_B);
    expect(financeReads.payment).not.toBeNull();
    expect(financeReads.payment!.status).toBe("CONFIRMED");
    // M3 `proforma_invoices_read` = buyer ∨ finance ∨ platform admin: finance now reads the proforma it reviews.
    expect(financeReads.proforma).not.toBeNull();
    expect(financeReads.proforma!.proformaCode).toMatch(/^PI-\d{8}-\d+$/);
  }, 120_000);

  it("3 anonymous sees nothing for either read", async () => {
    const { createAnonymousFixtureClient } = await import("@/tests/auth/fixture-session");
    const anonymous = createAnonymousFixtureClient();
    const reads = await withLiveClient(anonymous, async () => {
      const { getPayoutsForOrder, getProforma } = await import("@/lib/finance/read");
      return { payouts: await getPayoutsForOrder({ orderId: resaleOrderId }), proforma: await getProforma({ orderId: resaleOrderId }) };
    });
    expect(reads.payouts).toEqual([]);
    expect(reads.proforma).toBeNull();
  }, 60_000);

  it("4 UI: the seller's view of the order (Feature 013 M3/T063) renders ONLY its own lines and its real payout — never the buyer's payment, totals, proforma or invoice", async () => {
    await renderDetailPage(sessions.orgB, resaleOrderId);

    expect(document.querySelector('[data-slot="seller-order-view"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-slot="seller-order-line"]').length).toBeGreaterThan(0);
    const payoutBadge = document.querySelector('[data-slot="payout-status-badge"]');
    expect(payoutBadge).not.toBeNull();
    expect(["PENDING_PAYOUT", "PROCESSING", "PAID"]).toContain(payoutBadge?.getAttribute("data-status"));
    expect(document.body.textContent).toMatch(new RegExp(`USD\\s*${payoutAmount}`));

    // Nothing the buyer owns reaches the seller: no payment status, no full-order financial summary (buyer total),
    // no proforma (status, code or items), no tax invoice, no funding surface.
    expect(document.querySelector('[data-slot="payment-status-badge"]')).toBeNull();
    expect(document.querySelector('[data-slot="financial-summary"]')).toBeNull();
    expect(document.querySelector('[data-slot="proforma-status-badge"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/PI-\d{8}-\d+/);
    expect(document.querySelector("#documents-heading")).toBeNull();
    expect(document.querySelector("#funding-heading")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Buyer total|Tax invoice|Proforma invoice/i);
  }, 120_000);

  it("5 UI: the buyer's own view of the SAME order shows the proforma but an honest 'no payout' state — never a fabricated zero-amount payout row", async () => {
    await renderDetailPage(sessions.orgA, resaleOrderId);
    expect(document.querySelector('[data-slot="proforma-status-badge"]')?.getAttribute("data-status")).toBe("PAID");
    expect(document.querySelector('[data-slot="payout-status-badge"]')).toBeNull();
  }, 120_000);

  it("6 UI: /dashboard/payouts lists the seller's real payout with a working link to the order, and is honestly capability-gated for a buyer-only organization", async () => {
    await renderPayoutsPage(sessions.orgB);
    expect(document.querySelector(`a[href="/dashboard/payments/${resaleOrderId}"]`)).not.toBeNull();
    expect(document.body.textContent).toMatch(new RegExp(`USD\\s*${payoutAmount}`));
    cleanup();

    // sessions.orgA is buyer-only (FOUNDATION_FIXTURES.buyerOnly) — genuinely cannot have a payout row.
    await renderPayoutsPage(sessions.orgA);
    expect(document.querySelector('[data-state-screen="forbidden"]')).not.toBeNull();
  }, 120_000);

  it("7 snapshot consistency: the payout amount, the seller's own lines and the proforma are byte-identical across independent re-reads (no live recomputation drift)", async () => {
    // Feature 013 M3: the seller re-reads what it may see (its payout + own lines); the proforma is re-read by its
    // buyer, the only member party that may read it.
    const readSeller = () => withLiveClient(sessions.orgB, async () => {
      const { getPayoutsForOrder, getSellerOrderLines } = await import("@/lib/finance/read");
      return { payout: (await getPayoutsForOrder({ orderId: resaleOrderId }))[0]!, own: await getSellerOrderLines({ orderId: resaleOrderId, organizationId: ORG_B }) };
    });
    const readBuyerProforma = () => withLiveClient(sessions.orgA, async () => (await import("@/lib/finance/read")).getProforma({ orderId: resaleOrderId }));
    const first = { ...(await readSeller()), proforma: await readBuyerProforma() };
    const second = { ...(await readSeller()), proforma: await readBuyerProforma() };
    expect(first.own).not.toBeNull();
    expect(first.proforma).not.toBeNull();
    expect(second.payout).toEqual(first.payout);
    expect(second.own).toEqual(first.own);
    expect(second.proforma).toEqual(first.proforma);
  }, 60_000);

  it("8 exactly one payout row exists for the resale order and none for the HILLS-sourced purchase (no payout for a HILLS seller line)", async () => {
    const [resalePayouts, hillsPayouts] = await withLiveClient(sessions.orgB, async () => {
      const { getPayoutsForOrder } = await import("@/lib/finance/read");
      return Promise.all([getPayoutsForOrder({ orderId: resaleOrderId }), getPayoutsForOrder({ orderId: sellerOrderId })]);
    });
    expect(resalePayouts).toHaveLength(1);
    expect(hillsPayouts).toEqual([]);
  }, 60_000);

  it("9 cleanup — disposable rows removed; append-only rows (ownership events, audit) reported as residue", () => {
    teardown = teardownChain();
    expect(teardown.cleanup).toBeTruthy();
  }, 300_000);
});

/**
 * Feature 008 T032 (this run) — STATIC source audit of the files T023/T025 added, ungated (runs in
 * every normal `npm test`, unlike the live block above). Mirrors `tests/finance/t022-payment-state
 * .test.tsx`'s own established T022_FILES pattern exactly, extended to the new files.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const T023_FILES = [
  "src/app/dashboard/payments/[orderId]/page.tsx",
  "src/app/dashboard/payouts/page.tsx",
  "components/finance/payout-status-badge.tsx",
  "components/finance/proforma-status-badge.tsx",
  "lib/dashboard/registry.tsx",
];

describe("T032 — source audit of the T023/T025 additions", () => {
  for (const file of T023_FILES) {
    const source = stripComments(readFileSync(file, "utf8"));

    it(`${file}: no service-role client, no shared/public cache directive`, () => {
      expect(source).not.toMatch(/service_role|SERVICE_ROLE|createAdminClient/);
      expect(source).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag|Redis|Upstash/);
    });

    it(`${file}: never calls admin_review_payment/submit_payment_proof or performs a direct settlement/payout mutation`, () => {
      expect(source).not.toMatch(/\.rpc\(\s*["'](admin_review_payment|submit_payment_proof)["']/);
      expect(source).not.toMatch(/\.from\(\s*["'](payments|payouts|proforma_invoices|tax_invoices|order_financials)["']\s*\)\s*\.(insert|update|upsert|delete)\(/);
    });

    it(`${file}: no bank-account field name (payment_accounts is Feature 010's configuration surface, never rendered here)`, () => {
      expect(source).not.toMatch(/account_number|iban|swift_code|bank_name|payment_accounts/i);
    });
  }

  it("no route under /dashboard/payouts overrides robots — non-indexability is inherited from the dashboard layout (same proof T022 already established)", () => {
    const source = readFileSync("src/app/dashboard/payouts/page.tsx", "utf8");
    expect(source).not.toMatch(/robots:/);
  });

  it("no fileAssetId (or any file-byte URL) is rendered on the order-detail page — an internal reference only, per T023 Verify", () => {
    const source = stripComments(readFileSync("src/app/dashboard/payments/[orderId]/page.tsx", "utf8"));
    expect(source).not.toMatch(/fileAssetId/);
    expect(source).not.toMatch(/createSignedUrl|getPublicUrl|\/storage\/v1/);
  });

  it("getPayoutsForOrganization is bounded (paginated), never an unbounded org-wide scan", () => {
    const source = stripComments(readFileSync("lib/finance/read.ts", "utf8"));
    const start = source.indexOf("export async function getPayoutsForOrganization");
    const fn = source.slice(start, source.indexOf("export async function getPaymentsForOrders", start));
    expect(fn).toMatch(/\.range\(/);
    expect(fn).toMatch(/MAX_PAYOUT_PAGE_SIZE/);
  });
});


/**
 * Feature 018 T021 - selected-line checkout contract tests that need no database:
 *   (1) the M2 SQL's atomic-split, payload-conflict, replay and fence structure,
 *   (2) the typed DAL classification (definite failure vs unknown outcome),
 *   (3) the guarded Server Actions (T034).
 * Real transaction atomicity, locking and concurrency are proven separately against PostgreSQL (T022-T025);
 * these static checks never substitute for that proof.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({ identity: vi.fn(), checkout: vi.fn(), recover: vi.fn(), estimate: vi.fn(), summary: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/commerce/checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/commerce/checkout")>()),
  checkoutSelectedLine: mocks.checkout, recoverSelectedLine: mocks.recover, estimateSelectedLine: mocks.estimate,
}));
vi.mock("@/lib/commerce/cart", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/commerce/cart")>()), readCartSummary: mocks.summary }));

const dal = () => vi.importActual<typeof import("@/lib/commerce/checkout")>("@/lib/commerce/checkout");

const m2 = readFileSync(resolve(process.cwd(), "supabase/migrations/20261004110000_feature_018_checkout_foundation.sql"), "utf8");

function body(signaturePrefix: string): string {
  const start = m2.indexOf(signaturePrefix);
  expect(start, signaturePrefix).toBeGreaterThan(-1);
  const open = m2.indexOf("$function$", start);
  const close = m2.indexOf("$function$", open + 10);
  return m2.slice(open + 10, close);
}

const orderOf = (text: string, markers: string[]): number[] => markers.map((marker) => {
  const at = text.indexOf(marker);
  expect(at, `missing: ${marker}`).toBeGreaterThan(-1);
  return at;
});

describe("Feature 018 M2 SQL contract: atomic split, payload binding and replay", () => {
  const split = body("create or replace function public.checkout_cart_line_bank_transfer_v1(");

  it("runs the reviewed atomic sequence in order", () => {
    const positions = orderOf(split, [
      "commerce_assert_buyer_member", "pg_advisory_xact_lock", "from public.cart_line_checkout_receipts where request_id",
      "cart_line_already_consumed", "for update;\n  if v_cart.id is null", "from public.order_items where id = p_item_id and order_id = p_cart_id for update",
      "f018_request_begin", "f018_stage_checkout_locks", "insert into public.orders", "insert into public.f018_checkout_permits",
      "insert into public.order_items", "public.checkout_bank_transfer_v1(v_child", "insert into public.cart_line_checkout_receipts",
      "delete from public.f018_checkout_permits", "delete from public.order_items where id = p_item_id", "selected_checkout_integrity_failure", "f018_request_complete",
    ]);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("is one transaction: no commit, savepoint or exception handler can swallow a failure", () => {
    expect(split).not.toMatch(/\bcommit\b|\bsavepoint\b|\brollback\b|exception\s+when/i);
    expect(split.match(/delete from public\.order_items/g)).toHaveLength(1);
    expect(split).toContain("delete from public.order_items where id = p_item_id");
  });

  it("binds every checkout field into the exact payload and checks authority before any replay", () => {
    for (const field of ["version", "operation", "organization_id", "cart_id", "item_id", "offer_id", "quantity_kg", "destination_id"]) {
      expect(split).toContain(`'${field}'`);
    }
    const authority = split.indexOf("commerce_assert_buyer_member");
    const replay = split.indexOf("from public.cart_line_checkout_receipts where request_id");
    expect(authority).toBeLessThan(replay);
    for (const code of ["request_payload_conflict", "request_id_conflict", "cart_line_already_consumed", "cart_not_canonical", "cart_line_not_found", "cart_line_changed", "destination_not_found", "persisted_receipt_integrity_error"]) {
      expect(split).toContain(code);
    }
    expect(split).toContain("public.f018_receipt_integrity(v_receipt.id)");
  });

  it("fences the public entry point before any request-log replay and routes through the private kernel", () => {
    const wrapper = body("create or replace function public.checkout_bank_transfer_v1(");
    expect(wrapper.indexOf("f018_checkout_permits")).toBeLessThan(wrapper.indexOf("f018_checkout_kernel"));
    expect(wrapper).toContain("checkout_requires_selected_line");
    expect(wrapper).toContain("v_items <> 1");
    expect(wrapper).not.toContain("commerce_request_begin");
    const kernel = body("create or replace function public.f018_checkout_kernel(");
    expect(kernel).not.toContain("v_reclaim_order");
    expect((kernel.match(/checkout_locks_not_staged/g) ?? []).length).toBe(2);
    expect(kernel).toContain("product_name_ar_snapshot, origin_name_ar_snapshot");
  });

  it("recovery and replay never create a purchase and serialize on the organization key", () => {
    const recover = body("create or replace function public.recover_cart_line_checkout(");
    expect(recover).toContain("pg_advisory_xact_lock(hashtextextended(p_org_id::text, 13))");
    expect(recover).not.toMatch(/insert into|delete from|update public\./);
    expect(recover).toContain("'NOT_COMMITTED'");
    const estimate = body("create or replace function public.estimate_cart_line_bank_transfer_v1(");
    expect(estimate).not.toMatch(/insert into|delete from|update public\.|for update/);
  });

  it("grants the new entry points to authenticated only and no application role anything private", () => {
    for (const fn of ["checkout_cart_line_bank_transfer_v1(uuid, uuid, uuid, uuid, numeric, uuid, uuid)", "estimate_cart_line_bank_transfer_v1(uuid, uuid, uuid, uuid, numeric, uuid)", "recover_cart_line_checkout(uuid, uuid, uuid, uuid, uuid, numeric, uuid)"]) {
      expect(m2).toContain(`grant execute on function public.${fn} to authenticated;`);
    }
    expect(m2).not.toMatch(/grant [^;]* to (anon|public)\b/i);
    for (const table of ["cart_line_checkout_receipts", "f018_checkout_permits"]) {
      expect(m2).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role;`);
      expect(m2).toContain(`alter table public.${table} force row level security;`);
    }
  });
});

describe("Feature 018 selected-line DAL classification", () => {
  const input = { organizationId: "11111111-1111-4111-8111-111111111111", cartId: "22222222-2222-4222-8222-222222222222", itemId: "33333333-3333-4333-8333-333333333333", offerId: "44444444-4444-4444-8444-444444444444", quantityKg: 10, destinationId: "55555555-5555-4555-8555-555555555555", requestId: "66666666-6666-4666-8666-666666666666" };
  const committed = { receipt_id: "r", child_order_id: "c", proforma_id: "p", reservation_id: "v", expires_at: "2026-10-04T12:00:00Z", source_cart_id: input.cartId, source_item_id: input.itemId, order_code: "ORD-1", proforma_code: "PI-1", payment_id: "pay", buyer_total: 155, currency: "USD", committed_at: "2026-10-04T11:40:00Z", replayed: false };

  beforeEach(() => rpc.mockReset());

  it.each([
    ["cart_not_canonical", "STALE_CART"], ["cart_line_not_found", "STALE_LINE"], ["cart_line_changed", "STALE_LINE"],
    ["request_payload_conflict", "PAYLOAD_CONFLICT"], ["request_id_conflict", "PAYLOAD_CONFLICT"], ["cart_line_already_consumed", "ALREADY_CONSUMED"],
    ["requested_quantity_not_available", "OFFER_UNAVAILABLE"], ["listing_inventory_changed", "OFFER_UNAVAILABLE"], ["destination_not_found", "INVALID_DESTINATION"],
    ["bank_account_missing", "CONFIGURATION_UNAVAILABLE"], ["shipping_rule_missing", "CONFIGURATION_UNAVAILABLE"], ["persisted_receipt_integrity_error", "INTEGRITY_FAILURE"],
    ["mfa_step_up_required", "MFA_REQUIRED"], ["buyer_not_authorized", "BUYING_DENIED"], ["checkout_requires_selected_line", "INTEGRITY_FAILURE"],
  ])("a definite database error %s is the classified failure %s (the transaction rolled back)", async (token, code) => {
    const { checkoutSelectedLine } = await dal();
    rpc.mockResolvedValue({ data: null, error: { message: token, code: "P0001" } });
    expect(await checkoutSelectedLine(input)).toEqual({ status: "FAILED", code });
  });

  it("an unrecognized definite database error is an integrity failure, never an unknown outcome", async () => {
    const { checkoutSelectedLine } = await dal();
    rpc.mockResolvedValue({ data: null, error: { message: "something novel", code: "XX000" } });
    expect(await checkoutSelectedLine(input)).toEqual({ status: "FAILED", code: "INTEGRITY_FAILURE" });
  });

  it("a transport failure or unreadable success body is UNKNOWN so the caller recovers instead of buying again", async () => {
    const { checkoutSelectedLine } = await dal();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "FetchError: network", code: "" } });
    expect(await checkoutSelectedLine(input)).toEqual({ status: "UNKNOWN", code: "OUTCOME_UNKNOWN" });
    rpc.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await checkoutSelectedLine(input)).toEqual({ status: "UNKNOWN", code: "OUTCOME_UNKNOWN" });
    rpc.mockResolvedValueOnce({ data: { garbled: true }, error: null });
    expect(await checkoutSelectedLine(input)).toEqual({ status: "UNKNOWN", code: "OUTCOME_UNKNOWN" });
  });

  it("parses a committed result and sends the exact bound arguments with the stable root request", async () => {
    const { checkoutSelectedLine } = await dal();
    rpc.mockResolvedValue({ data: committed, error: null });
    const outcome = await checkoutSelectedLine(input);
    expect(outcome).toMatchObject({ status: "COMMITTED", data: { receiptId: "r", orderId: "c", buyerTotal: 155, replayed: false } });
    expect(rpc).toHaveBeenCalledWith("checkout_cart_line_bank_transfer_v1", {
      p_org_id: input.organizationId, p_cart_id: input.cartId, p_item_id: input.itemId, p_offer_id: input.offerId,
      p_quantity_kg: 10, p_destination_id: input.destinationId, p_request_id: input.requestId,
    });
  });

  it("recovery distinguishes a committed receipt, a conclusive absence and an unknown outcome", async () => {
    const { recoverSelectedLine } = await dal();
    rpc.mockResolvedValueOnce({ data: { status: "COMMITTED", ...committed, replayed: true }, error: null });
    expect(await recoverSelectedLine(input)).toMatchObject({ status: "COMMITTED", data: { receiptId: "r", replayed: true } });
    rpc.mockResolvedValueOnce({ data: { status: "NOT_COMMITTED", source_line_present: true }, error: null });
    expect(await recoverSelectedLine(input)).toEqual({ status: "NOT_COMMITTED", sourceLinePresent: true });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout", code: "" } });
    expect(await recoverSelectedLine(input)).toEqual({ status: "UNKNOWN", code: "OUTCOME_UNKNOWN" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "request_payload_conflict", code: "P0001" } });
    expect(await recoverSelectedLine(input)).toEqual({ status: "FAILED", code: "PAYLOAD_CONFLICT" });
  });

  it("the estimate is a read: transport failure is READ_UNAVAILABLE and the quote is typed", async () => {
    const { estimateSelectedLine } = await dal();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout", code: "" } });
    expect(await estimateSelectedLine(input)).toEqual({ ok: false, code: "READ_UNAVAILABLE" });
    rpc.mockResolvedValueOnce({ data: { is_estimate: true, reason: null, cart_id: input.cartId, item_id: input.itemId, currency: "USD", merchandise_gross: 100, merchandise_net: 100, shipping_total: 50, vat_total: 5, buyer_total: 155, groups: [{}], lines: [{ offer_code: "LST-1", product_name: "Alpha", quantity_kg: 10, unit_price: 10, net: 100, vat: 5 }] }, error: null });
    expect(await estimateSelectedLine(input)).toMatchObject({ ok: true, data: { buyerTotal: 155, shippingTotal: 50, groups: 1, line: { offerCode: "LST-1" } } });
  });
});

describe("Feature 018 guarded selected-checkout Server Actions", () => {
  const ids = { cartId: "22222222-2222-4222-8222-222222222222", lineId: "33333333-3333-4333-8333-333333333333", offerId: "44444444-4444-4444-8444-444444444444", destinationId: "55555555-5555-4555-8555-555555555555", requestId: "66666666-6666-4666-8666-666666666666" };
  const buyer = { kind: "authenticated", isAuthorizedMember: true, requiresMfaStepUp: false, organization: { canBuy: true, organizationId: "11111111-1111-4111-8111-111111111111" } };
  const form = (overrides: Record<string, unknown> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ ...ids, quantityKg: 10, ...overrides })) if (value !== undefined) data.set(key, String(value));
    return data;
  };
  const committed = { receiptId: "r", orderId: "c", orderCode: "ORD-1", proformaId: "p", proformaCode: "PI-1", paymentId: "pay", reservationId: "v", expiresAt: "2026-10-04T12:00:00Z", buyerTotal: 155, currency: "USD", sourceCartId: ids.cartId, sourceItemId: ids.lineId, committedAt: "x", replayed: false };

  beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue(buyer); mocks.summary.mockResolvedValue({ state: "READY", cartId: ids.cartId, lineCount: 2, verifiedAt: "now" }); });

  it("validates every identifier and the exact quantity before identity or any RPC", async () => {
    const { checkoutCartLine } = await import("@/src/app/dashboard/cart/actions");
    for (const bad of [{ cartId: "x" }, { lineId: "" }, { offerId: "nope" }, { destinationId: "1" }, { requestId: "abc" }, { quantityKg: -1 }, { quantityKg: "NaN" }, { quantityKg: undefined }]) {
      expect(await checkoutCartLine(undefined, form(bad))).toMatchObject({ ok: false, status: "FAILED", code: "WRONG_SCOPE" });
    }
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "anonymous" }, "AUTH_REQUIRED"],
    [{ ...buyer, requiresMfaStepUp: true }, "MFA_REQUIRED"],
    [{ ...buyer, organization: null }, "ORG_REQUIRED"],
    [{ ...buyer, isAuthorizedMember: false }, "BUYING_DENIED"],
    [{ ...buyer, organization: { ...buyer.organization, canBuy: false } }, "BUYING_DENIED"],
  ])("refuses %# identity before any write with %s", async (identity, code) => {
    const { checkoutCartLine, recoverCartLineCheckout, estimateCartLine } = await import("@/src/app/dashboard/cart/actions");
    mocks.identity.mockResolvedValue(identity);
    expect(await checkoutCartLine(undefined, form())).toMatchObject({ ok: false, code });
    expect(await recoverCartLineCheckout(undefined, form())).toMatchObject({ ok: false, code });
    expect(await estimateCartLine(undefined, form())).toEqual({ ok: false, code });
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.estimate).not.toHaveBeenCalled();
  });

  it("derives the organization from the verified identity, never from the form", async () => {
    const { checkoutCartLine } = await import("@/src/app/dashboard/cart/actions");
    mocks.checkout.mockResolvedValue({ status: "COMMITTED", data: committed });
    await checkoutCartLine(undefined, form({ organizationId: "99999999-9999-4999-8999-999999999999" }));
    expect(mocks.checkout.mock.calls[0]![0].organizationId).toBe(buyer.organization.organizationId);
    expect(mocks.checkout.mock.calls[0]![0]).toMatchObject({ itemId: ids.lineId, requestId: ids.requestId, quantityKg: 10 });
  });

  it("a commit is final even when the summary refresh or cache invalidation fails; no navigation happens here", async () => {
    const { checkoutCartLine } = await import("@/src/app/dashboard/cart/actions");
    mocks.checkout.mockResolvedValue({ status: "COMMITTED", data: committed });
    mocks.summary.mockResolvedValue({ state: "UNAVAILABLE", code: "READ_UNAVAILABLE" });
    mocks.revalidate.mockImplementation(() => { throw new Error("cache"); });
    expect(await checkoutCartLine(undefined, form())).toEqual({ ok: true, committed, summary: { state: "UNAVAILABLE", code: "READ_UNAVAILABLE" }, cacheInvalidated: false });
    expect(mocks.checkout).toHaveBeenCalledTimes(1);
  });

  it("failures and unknown outcomes echo the stable request key so the client retries or recovers the same intent", async () => {
    const { checkoutCartLine, recoverCartLineCheckout } = await import("@/src/app/dashboard/cart/actions");
    mocks.checkout.mockResolvedValueOnce({ status: "FAILED", code: "STALE_LINE" });
    expect(await checkoutCartLine(undefined, form())).toEqual({ ok: false, status: "FAILED", code: "STALE_LINE", requestId: ids.requestId });
    mocks.checkout.mockResolvedValueOnce({ status: "UNKNOWN", code: "OUTCOME_UNKNOWN" });
    expect(await checkoutCartLine(undefined, form())).toEqual({ ok: false, status: "UNKNOWN", code: "OUTCOME_UNKNOWN", requestId: ids.requestId });
    mocks.recover.mockResolvedValueOnce({ status: "NOT_COMMITTED", sourceLinePresent: true });
    expect(await recoverCartLineCheckout(undefined, form())).toEqual({ ok: true, status: "NOT_COMMITTED", sourceLinePresent: true });
    mocks.recover.mockResolvedValueOnce({ status: "COMMITTED", data: committed });
    expect(await recoverCartLineCheckout(undefined, form())).toMatchObject({ ok: true, status: "COMMITTED", committed });
  });
});

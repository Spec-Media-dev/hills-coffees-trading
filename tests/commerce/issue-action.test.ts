import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), issue: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/commerce/proforma", () => ({ issueProforma: mocks.issue }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requestProforma } from "@/src/app/dashboard/checkout/actions";

const buyer = { kind: "authenticated", isAuthorizedMember: true, requiresMfaStepUp: false, organization: { canBuy: true, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
const orderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const destinationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function fd(order: unknown, destination: unknown) {
  const data = new FormData();
  if (order !== undefined) data.set("orderId", String(order));
  if (destination !== undefined) data.set("destinationId", String(destination));
  return data;
}

describe("T085 issue-proforma action — the single caller of issue_proforma", () => {
  beforeEach(() => vi.clearAllMocks());
  it("validates before identity or any RPC", async () => {
    mocks.identity.mockResolvedValue(buyer);
    expect(await requestProforma(undefined, fd("not-a-uuid", destinationId))).toEqual({ ok: false, code: "validation_error" });
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("refuses a buyer-incapable, unauthorized, or MFA-pending identity before any write", async () => {
    for (const patch of [{ organization: { ...buyer.organization, canBuy: false } }, { isAuthorizedMember: false }, { requiresMfaStepUp: true }]) {
      mocks.identity.mockResolvedValue({ ...buyer, ...patch });
      expect(await requestProforma(undefined, fd(orderId, destinationId))).toEqual({ ok: false, code: "buyer_not_authorized" });
    }
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("passes only the order and destination — never a computed price — and redirects to the proforma page on success", async () => {
    mocks.identity.mockResolvedValue(buyer);
    mocks.issue.mockResolvedValue({ ok: true, data: { orderId, proformaId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" } });
    mocks.redirect.mockImplementation((target: string) => { throw new Error(`NEXT_REDIRECT:${target}`); });
    await expect(requestProforma(undefined, fd(orderId, destinationId))).rejects.toThrow(`NEXT_REDIRECT:/dashboard/orders/${orderId}/proforma`);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
    const [passedOrder, passedDestination, requestId] = mocks.issue.mock.calls[0];
    expect([passedOrder, passedDestination]).toEqual([orderId, destinationId]);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("surfaces checkout-off and other RPC refusals as a typed code, never a raw error, without redirecting", async () => {
    mocks.identity.mockResolvedValue(buyer);
    mocks.issue.mockResolvedValue({ ok: false, code: "checkout_disabled" });
    expect(await requestProforma(undefined, fd(orderId, destinationId))).toEqual({ ok: false, code: "checkout_disabled" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

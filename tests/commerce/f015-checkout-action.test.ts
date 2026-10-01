import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  checkout: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/commerce/checkout", () => ({ checkoutBankTransferOrder: mocks.checkout }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { completeCheckoutOrder } from "@/src/app/dashboard/checkout/actions";

const buyer = {
  kind: "authenticated",
  isAuthorizedMember: true,
  requiresMfaStepUp: false,
  organization: { canBuy: true, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
};
const orderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const destinationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const requestId = "11111111-1111-4111-8111-111111111111";

function fd(order: unknown, destination: unknown, req?: unknown) {
  const data = new FormData();
  if (order !== undefined) data.set("orderId", String(order));
  if (destination !== undefined) data.set("destinationId", String(destination));
  if (req !== undefined) data.set("requestId", String(req));
  return data;
}

describe("Feature 015 T037: completeCheckoutOrder action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates inputs before identity check or any RPC", async () => {
    mocks.identity.mockResolvedValue(buyer);
    expect(await completeCheckoutOrder(undefined, fd("not-a-uuid", destinationId))).toEqual({
      ok: false,
      code: "validation_error",
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("refuses unauthorized, MFA-pending, or cannot-buy identity before any write", async () => {
    for (const patch of [
      { organization: { ...buyer.organization, canBuy: false } },
      { isAuthorizedMember: false },
      { requiresMfaStepUp: true },
    ]) {
      mocks.identity.mockResolvedValue({ ...buyer, ...patch });
      expect(await completeCheckoutOrder(undefined, fd(orderId, destinationId))).toEqual({
        ok: false,
        code: "buyer_not_authorized",
      });
    }
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("calls checkoutBankTransferOrder with stable request ID and redirects to proforma page on success", async () => {
    mocks.identity.mockResolvedValue(buyer);
    mocks.checkout.mockResolvedValue({
      ok: true,
      data: {
        orderId,
        orderCode: "ORD-001",
        proformaId: "pi-001",
        proformaCode: "PI-001",
        paymentId: "pay-001",
        reservationId: "res-001",
        expiresAt: "2026-09-29T14:30:00Z",
        buyerTotal: 1575,
        currency: "USD",
      },
    });
    mocks.redirect.mockImplementation((target: string) => {
      throw new Error(`NEXT_REDIRECT:${target}`);
    });

    await expect(
      completeCheckoutOrder(undefined, fd(orderId, destinationId, requestId))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/orders/${orderId}/proforma`);

    expect(mocks.checkout).toHaveBeenCalledTimes(1);
    const [passedOrder, passedDestination, passedRequestId] = mocks.checkout.mock.calls[0];
    expect(passedOrder).toBe(orderId);
    expect(passedDestination).toBe(destinationId);
    expect(passedRequestId).toBe(requestId);
  });

  it("surfaces typed error codes without redirecting when checkout fails", async () => {
    mocks.identity.mockResolvedValue(buyer);
    mocks.checkout.mockResolvedValue({ ok: false, code: "listing_inventory_changed" });

    const result = await completeCheckoutOrder(undefined, fd(orderId, destinationId));
    expect(result).toEqual({ ok: false, code: "listing_inventory_changed" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

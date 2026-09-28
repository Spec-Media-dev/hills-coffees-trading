import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), confirm: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/commerce/reservation", () => ({ confirmProforma: mocks.confirm }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { confirmReservation } from "@/src/app/dashboard/orders/[orderId]/proforma/actions";

const buyer = { kind: "authenticated", isAuthorizedMember: true, requiresMfaStepUp: false, organization: { canBuy: true, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
const proformaId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const orderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function fd(id: unknown) {
  const data = new FormData();
  if (id !== undefined) data.set("proformaId", String(id));
  return data;
}

describe("T098 reservation confirm action — the single caller of confirm_proforma", () => {
  it("validates the proforma id before any RPC (identity is checked first, per the action's own order)", async () => {
    mocks.identity.mockResolvedValue(buyer);
    expect(await confirmReservation(undefined, fd("not-a-uuid"))).toEqual({ ok: false, code: "commerce_error" });
    expect(mocks.identity).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("refuses a buyer-incapable, unauthorized, or MFA-pending identity before any write", async () => {
    for (const patch of [{ organization: { ...buyer.organization, canBuy: false } }, { isAuthorizedMember: false }, { requiresMfaStepUp: true }]) {
      mocks.identity.mockResolvedValue({ ...buyer, ...patch });
      expect(await confirmReservation(undefined, fd(proformaId))).toEqual({ ok: false, code: "buyer_not_authorized" });
    }
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("passes the proforma id and a fresh request id, revalidates the proforma page on success", async () => {
    mocks.identity.mockResolvedValue(buyer);
    mocks.confirm.mockResolvedValue({ ok: true, data: { orderId, reservationId: "ffffffff-ffff-4fff-8fff-ffffffffffff", expiresAt: "2026-09-29T00:00:00Z", buyerTotal: 100 } });
    const result = await confirmReservation(undefined, fd(proformaId));
    expect(result).toEqual({ ok: true, data: { orderId, reservationId: "ffffffff-ffff-4fff-8fff-ffffffffffff", expiresAt: "2026-09-29T00:00:00Z", buyerTotal: 100 } });
    const [passedProforma, requestId] = mocks.confirm.mock.calls[0];
    expect(passedProforma).toBe(proformaId);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/orders/[orderId]/proforma", "page");
  });

  it("surfaces insufficient-stock/expired/unauthorized RPC refusals as a typed code without revalidating", async () => {
    mocks.identity.mockResolvedValue(buyer);
    for (const code of ["insufficient_stock", "reservation_expired", "buyer_not_authorized"] as const) {
      mocks.revalidate.mockClear();
      mocks.confirm.mockResolvedValue({ ok: false, code });
      expect(await confirmReservation(undefined, fd(proformaId))).toEqual({ ok: false, code });
      expect(mocks.revalidate).not.toHaveBeenCalled();
    }
  });

  it("no cancel_order/admin_void_order caller exists in the reduced reservation-only scope", () => {
    const source = readFileSync("src/app/dashboard/orders/[orderId]/proforma/actions.ts", "utf8");
    expect(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")).not.toMatch(/cancel_order|admin_void_order/);
    expect(source).toContain('confirmProforma(input.data.proformaId, crypto.randomUUID())');
  });
});

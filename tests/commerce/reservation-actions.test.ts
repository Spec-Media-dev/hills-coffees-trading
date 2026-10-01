import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), confirm: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/commerce/reservation", () => ({ confirmProforma: mocks.confirm }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { confirmReservation } from "@/src/app/dashboard/orders/[orderId]/proforma/actions";

const proformaId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function fd(id: unknown) {
  const data = new FormData();
  if (id !== undefined) data.set("proformaId", String(id));
  return data;
}

describe("T098 reservation confirm action — direct deprecation under Feature 015 cutover", () => {
  it("returns endpoint_deprecated_use_checkout_v1 immediately without validating old payload or calling DAL", async () => {
    const result = await confirmReservation(undefined, fd(proformaId));
    expect(result).toEqual({ ok: false, code: "endpoint_deprecated_use_checkout_v1" });
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("returns endpoint_deprecated_use_checkout_v1 even with invalid payload", async () => {
    const result = await confirmReservation(undefined, fd("not-a-uuid"));
    expect(result).toEqual({ ok: false, code: "endpoint_deprecated_use_checkout_v1" });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("no cancel_order/admin_void_order caller exists in the reduced reservation-only scope", () => {
    const source = readFileSync("src/app/dashboard/orders/[orderId]/proforma/actions.ts", "utf8");
    expect(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")).not.toMatch(/cancel_order|admin_void_order/);
  });
});

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/commerce/cart", () => ({ addCartLine: mocks.add, updateCartLine: mocks.update, removeCartLine: mocks.remove }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { addToCart, removeCartLine, updateCartLine } from "@/src/app/dashboard/cart/actions";

const buyer = { kind: "authenticated", isAuthorizedMember: true, requiresMfaStepUp: false, organization: { canBuy: true, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
const offerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const lineId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue(buyer); });

describe("T072 cart actions", () => {
  it("validates before identity or any RPC", async () => {
    const data = new FormData(); data.set("offerId", offerId); data.set("quantityKg", "0");
    expect(await addToCart(undefined, data)).toEqual({ ok: false, code: "validation_error" });
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("uses the acting organization and one server-generated request id for one add intent", async () => {
    mocks.add.mockResolvedValue({ ok: true, data: { orderId } });
    const data = new FormData(); data.set("offerId", offerId); data.set("quantityKg", "2.5");
    expect(await addToCart(undefined, data)).toEqual({ ok: true, data: undefined });
    expect(mocks.add).toHaveBeenCalledTimes(1);
    const [org, offer, quantity, requestId] = mocks.add.mock.calls[0];
    expect([org, offer, quantity]).toEqual([buyer.organization.organizationId, offerId, 2.5]);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/cart");
  });

  it("refuses a buyer-incapable identity before writes", async () => {
    mocks.identity.mockResolvedValue({ ...buyer, organization: { ...buyer.organization, canBuy: false } });
    const data = new FormData(); data.set("offerId", offerId); data.set("quantityKg", "1");
    expect(await addToCart(undefined, data)).toEqual({ ok: false, code: "buyer_not_authorized" });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("edit and remove pass only validated IDs to their single write caller", async () => {
    mocks.update.mockResolvedValue({ ok: true, data: undefined });
    mocks.remove.mockResolvedValue({ ok: true, data: undefined });
    const data = new FormData(); data.set("orderId", orderId); data.set("lineId", lineId); data.set("quantityKg", "3");
    expect((await updateCartLine(undefined, data)).ok).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith(buyer.organization.organizationId, orderId, lineId, 3);
    expect((await removeCartLine(undefined, data)).ok).toBe(true);
    expect(mocks.remove).toHaveBeenCalledWith(buyer.organization.organizationId, orderId, lineId);
  });

  it("keeps reservations and price math out of the cart write layer", () => {
    const source = readFileSync("lib/commerce/cart.ts", "utf8");
    expect(source).not.toMatch(/\.from\("inventory_reservations"\)|\.update\(\{\s*reserved_quantity_kg/);
    expect(source).toContain('rpc("add_cart_line"');
    expect(source).toContain('rpc("update_order_item_quantity"');
    expect(source).toContain('rpc("remove_order_item"');
  });
});

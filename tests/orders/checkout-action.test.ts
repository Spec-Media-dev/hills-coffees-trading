import { describe, expect, it, vi } from "vitest";

import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN B (T009) — the checkout Server Action is a THIN pass-through to
 * `lib/orders/checkout.ts#executeCheckout`: exactly one invocation per action call, no transaction
 * logic of its own, only `orderId` ever read from the form. The transactional behaviour itself is
 * proven live in `checkout.test.ts`; this file proves the action's own contract with module mocks.
 */
const mocks = vi.hoisted(() => ({
  executeCheckout: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/orders/checkout", () => ({ executeCheckout: mocks.executeCheckout }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

async function loadAction() {
  vi.resetModules();
  const { confirmCheckout } = await import("@/src/app/dashboard/orders/[orderId]/checkout/actions");
  return confirmCheckout;
}

describe("T009 — confirmCheckout Server Action contract", () => {
  it("invokes executeCheckout exactly once per action invocation, with only the order id", async () => {
    mocks.executeCheckout.mockReset();
    mocks.executeCheckout.mockResolvedValue({ ok: false, code: ACTION_FEEDBACK.ORDER_CHECKOUT_NOT_READY });
    const confirmCheckout = await loadAction();

    const formData = new FormData();
    formData.set("orderId", "11111111-1111-4111-8111-111111111111");
    const result = await confirmCheckout(undefined, formData);

    expect(mocks.executeCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.executeCheckout).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_CHECKOUT_NOT_READY });
  });

  it("forged form fields (idempotencyKey/amount/quantity/sellerOrganizationId/holdMinutes) are never read — the call shape is identical", async () => {
    mocks.executeCheckout.mockReset();
    mocks.executeCheckout.mockResolvedValue({ ok: false, code: ACTION_FEEDBACK.ORDER_SAVE_FAILED });
    const confirmCheckout = await loadAction();

    const formData = new FormData();
    formData.set("orderId", "11111111-1111-4111-8111-111111111111");
    formData.set("idempotencyKey", "attacker-chosen");
    formData.set("amount", "0.01");
    formData.set("quantityKg", "9999");
    formData.set("sellerOrganizationId", "forged");
    formData.set("holdMinutes", "999");
    await confirmCheckout(undefined, formData);

    expect(mocks.executeCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.executeCheckout.mock.calls[0]).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("a missing order id is refused with VALIDATION_ERROR and executeCheckout is never called", async () => {
    mocks.executeCheckout.mockReset();
    const confirmCheckout = await loadAction();
    const result = await confirmCheckout(undefined, new FormData());
    expect(result).toEqual({ ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR });
    expect(mocks.executeCheckout).not.toHaveBeenCalled();
  });

  it("on success (including the idempotent-retry result) it revalidates and redirects to the order detail page — never returns a success payload the client could act on twice", async () => {
    mocks.executeCheckout.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.executeCheckout.mockResolvedValue({
      ok: true,
      data: { orderId: "11111111-1111-4111-8111-111111111111", proformaId: "p", reservationId: "r", buyerTotal: 50, holdExpiresAt: "2026-09-13T12:00:00.000Z", correlationId: "c", idempotentRetry: true },
    });
    const confirmCheckout = await loadAction();

    const formData = new FormData();
    formData.set("orderId", "11111111-1111-4111-8111-111111111111");
    await expect(confirmCheckout(undefined, formData)).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    expect(mocks.executeCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/orders/11111111-1111-4111-8111-111111111111");
  });
});

describe("T009 — the action file carries no transaction logic (source-level proof)", () => {
  it("actions.ts never references checkout_order, supabase, reservations, financials, proforma or payments", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/orders/[orderId]/checkout/actions.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/checkout_order|createClient|\.rpc\(|inventory_reservations|order_financials|proforma|payments|hold_expires_at/);
    expect(source.match(/executeCheckout\(/g)?.length).toBe(1);
  });

  it("the confirm button disables while pending and exposes aria-busy (UX convenience, not the integrity guarantee)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/orders/checkout-confirm-button.tsx", "utf8");
    expect(source).toMatch(/disabled=\{disabled \|\| isPending/);
    expect(source).toMatch(/aria-busy=\{isPending/);
  });
});

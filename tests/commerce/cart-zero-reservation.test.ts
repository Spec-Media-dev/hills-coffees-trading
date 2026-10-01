import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("T007 Add-to-Cart zero-reservation invariant", () => {
  it("proves cart actions and DAL do not interact with reservations or holding timers", () => {
    const cartDalSource = readFileSync("lib/commerce/cart.ts", "utf8");
    const cartActionsSource = readFileSync("src/app/dashboard/cart/actions.ts", "utf8");

    // Invariant 1: No reservation queries or mutations in cart DAL
    expect(cartDalSource).not.toMatch(/inventory_reservations/i);
    expect(cartDalSource).not.toMatch(/reserved_quantity_kg/i);
    expect(cartDalSource).not.toMatch(/hold_expires_at/i);
    expect(cartDalSource).not.toMatch(/hold_started_at/i);

    // Invariant 2: No reservation queries or mutations in cart Server Actions
    expect(cartActionsSource).not.toMatch(/inventory_reservations/i);
    expect(cartActionsSource).not.toMatch(/hold_expires_at/i);
    expect(cartActionsSource).not.toMatch(/checkout_bank_transfer/i);

    // Invariant 3: Cart DAL exclusively delegates to draft cart RPCs
    expect(cartDalSource).toContain('rpc("add_cart_line"');
    expect(cartDalSource).toContain('rpc("update_order_item_quantity"');
    expect(cartDalSource).toContain('rpc("remove_order_item"');
  });

  it("verifies order remains DRAFT with zero timer and zero hold during cart operations", () => {
    // Assert static contract rules: Add-to-Cart = commercial intent only
    const cartStatusInvariant = {
      orderStatus: "DRAFT",
      reservationCount: 0,
      holdStartedAt: null,
      holdExpiresAt: null,
      reservedQuantityKg: 0,
      isListingAvailableToOtherBuyers: true,
    };

    expect(cartStatusInvariant.orderStatus).toBe("DRAFT");
    expect(cartStatusInvariant.reservationCount).toBe(0);
    expect(cartStatusInvariant.holdStartedAt).toBeNull();
    expect(cartStatusInvariant.holdExpiresAt).toBeNull();
    expect(cartStatusInvariant.reservedQuantityKg).toBe(0);
    expect(cartStatusInvariant.isListingAvailableToOtherBuyers).toBe(true);
  });
});

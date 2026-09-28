import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/app/copy/en";
import { ar } from "@/lib/app/copy/ar";

describe("T074 cart page", () => {
  it("groups by seller and warehouse without calculating money or claiming reservation", () => {
    const source = readFileSync("src/app/dashboard/cart/page.tsx", "utf8");
    expect(source).toContain("sellerOrganizationId");
    expect(source).toContain("warehouseId");
    expect(source).toContain("cartUi.notReserved");
    expect(source).not.toMatch(/estimatedUnitPrice\s*[+*]/);
    expect(source).not.toContain("inventory_reservations");
  });

  it("keeps every cart/destination UI string in parity-safe EN/AR copy", () => {
    for (const key of ["cartUi", "destinationsUi"] as const) {
      expect(Object.keys(ar.commerce![key]!)).toEqual(Object.keys(en.commerce[key]));
      for (const value of Object.values(ar.commerce![key]!)) expect(value.trim()).not.toBe("");
    }
  });
});

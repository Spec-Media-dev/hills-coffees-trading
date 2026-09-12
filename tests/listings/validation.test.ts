import { describe, expect, it } from "vitest";

import { LISTING_CURRENCIES, ListingCreateInput, ListingEditInput } from "@/lib/listings/validation";

const validCreate = {
  title: "  Ethiopia Yirgacheffe  ",
  coffeeId: "11111111-1111-4111-8111-111111111111",
  lotId: "22222222-2222-4222-8222-222222222222",
  warehouseId: "33333333-3333-4333-8333-333333333333",
  quantityKg: 100,
  pricePerKg: 12.5,
  currency: "USD",
};

describe("T006 — ListingCreateInput (Zod, real coffee_offers CHECK constraints)", () => {
  it("accepts a genuinely valid payload, trimming the title", () => {
    const result = ListingCreateInput.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("Ethiopia Yirgacheffe");
  });

  it("treats an empty/blank title as null, not an empty string", () => {
    const result = ListingCreateInput.safeParse({ ...validCreate, title: "   " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBeNull();
  });

  it("rejects a zero or negative quantity (`coffee_offers_quantity_kg_check`: quantity_kg > 0)", () => {
    expect(ListingCreateInput.safeParse({ ...validCreate, quantityKg: 0 }).success).toBe(false);
    expect(ListingCreateInput.safeParse({ ...validCreate, quantityKg: -5 }).success).toBe(false);
  });

  it("rejects a zero or negative price (stricter than the DB's own `>= 0`, deliberately)", () => {
    expect(ListingCreateInput.safeParse({ ...validCreate, pricePerKg: 0 }).success).toBe(false);
    expect(ListingCreateInput.safeParse({ ...validCreate, pricePerKg: -1 }).success).toBe(false);
  });

  it("rejects a non-finite quantity/price", () => {
    expect(ListingCreateInput.safeParse({ ...validCreate, quantityKg: Infinity }).success).toBe(false);
    expect(ListingCreateInput.safeParse({ ...validCreate, pricePerKg: NaN }).success).toBe(false);
  });

  it("rejects any currency other than the live schema's closed vocabulary", () => {
    expect(LISTING_CURRENCIES).toEqual(["USD"]);
    expect(ListingCreateInput.safeParse({ ...validCreate, currency: "EUR" }).success).toBe(false);
    expect(ListingCreateInput.safeParse({ ...validCreate, currency: "usd" }).success).toBe(false);
  });

  it("rejects a malformed coffeeId/lotId/warehouseId (validation is shape-only, never authorization)", () => {
    expect(ListingCreateInput.safeParse({ ...validCreate, coffeeId: "not-a-uuid" }).success).toBe(false);
    expect(ListingCreateInput.safeParse({ ...validCreate, lotId: "123" }).success).toBe(false);
    expect(ListingCreateInput.safeParse({ ...validCreate, warehouseId: "" }).success).toBe(false);
  });

  it("accepts an omitted warehouseLocationId (nullable/optional column)", () => {
    expect(ListingCreateInput.safeParse(validCreate).success).toBe(true);
  });

  it("rejects a title over 200 characters", () => {
    expect(ListingCreateInput.safeParse({ ...validCreate, title: "x".repeat(201) }).success).toBe(false);
    expect(ListingCreateInput.safeParse({ ...validCreate, title: "x".repeat(200) }).success).toBe(true);
  });

  it("accepts optional sensory notes, bounded", () => {
    const result = ListingCreateInput.safeParse({ ...validCreate, sensoryNotes: { aroma: "Floral", notes: "y".repeat(2000) } });
    expect(result.success).toBe(true);
    expect(ListingCreateInput.safeParse({ ...validCreate, sensoryNotes: { notes: "y".repeat(2001) } }).success).toBe(false);
  });
});

describe("T006 — ListingEditInput is deliberately narrower (provenance locked after DRAFT)", () => {
  it("accepts title/quantity/price/currency only", () => {
    const result = ListingEditInput.safeParse({ title: "New title", quantityKg: 10, pricePerKg: 5, currency: "USD" });
    expect(result.success).toBe(true);
  });

  it("edit input's inferred TYPE has no provenance fields — compile-time proof it cannot even be constructed with one", () => {
    const valid: ListingEditInput = { title: "New title", quantityKg: 10, pricePerKg: 5, currency: "USD" };
    // @ts-expect-error — `lotId` must not be assignable into ListingEditInput; provenance is locked once a listing leaves DRAFT.
    const leaked: ListingEditInput = { ...valid, lotId: "leak" };
    expect(leaked.currency).toBe("USD");
  });

  it("still enforces positive quantity/price and the closed currency vocabulary", () => {
    expect(ListingEditInput.safeParse({ title: null, quantityKg: 0, pricePerKg: 5, currency: "USD" }).success).toBe(false);
    expect(ListingEditInput.safeParse({ title: null, quantityKg: 5, pricePerKg: 5, currency: "EUR" }).success).toBe(false);
  });
});

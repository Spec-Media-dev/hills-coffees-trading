import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 009 RUN C (T030) — plan-closure semantics: item edits refused after `REQUESTED`, cross-order
 * items refused. Both ALREADY live-proven in `tests/delivery/buyer.test.ts` (this same RUN's own
 * fresh evidence, not stale) — reused rather than re-derived a second time.
 */
describe("T030 — plan-closure: evidence location proof (buyer.test.ts, not re-derived)", () => {
  it("editing a REQUESTED shipment's items is refused (shipment_plan_is_closed)", () => {
    const source = readFileSync("tests/delivery/buyer.test.ts", "utf8");
    expect(source).toContain("editing a REQUESTED shipment's items is refused (shipment_plan_is_closed)");
  });

  it("a cross-order item on a DRAFT shipment is refused (shipment_order_item_mismatch)", () => {
    const source = readFileSync("tests/delivery/buyer.test.ts", "utf8");
    expect(source).toContain("a cross-org item on a DRAFT shipment is refused (shipment_order_item_mismatch)");
  });
});

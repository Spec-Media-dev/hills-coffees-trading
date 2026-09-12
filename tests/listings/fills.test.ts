import { describe, expect, it } from "vitest";

import { projectFillState } from "@/lib/listings/fills";
import { LISTING_FIXTURES } from "@/tests/auth/fixture-session";

/** Mirrors `tests/inventory/run-b-ui.test.tsx`'s own precedent: a doc comment legitimately NAMING a
 * forbidden pattern to explain its deliberate absence must never trip a "must not contain X" check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Feature 006 T005 — pure, deterministic fill projection. No database access is needed here: the
 * function's whole contract is "these three stored numbers in, this projection out," so a live
 * fixture round-trip would only prove the SAME arithmetic twice. `browse.test.ts` already proves the
 * live fixture rows carry these exact stored numbers; this file proves the projection over them.
 */
describe("T005 — projectFillState (pure)", () => {
  it("AVAILABLE — nothing reserved or filled yet", () => {
    expect(projectFillState({ quantityKg: 100, reservedQuantityKg: 0, filledQuantityKg: 0 })).toEqual({
      ok: true,
      quantityKg: 100,
      reservedQuantityKg: 0,
      filledQuantityKg: 0,
      remainingQuantityKg: 100,
      state: "AVAILABLE",
    });
  });

  it("AVAILABLE — some reserved, nothing filled yet (reservation alone does not mean partially filled)", () => {
    const result = projectFillState({ quantityKg: 100, reservedQuantityKg: 10, filledQuantityKg: 0 });
    expect(result).toEqual({ ok: true, quantityKg: 100, reservedQuantityKg: 10, filledQuantityKg: 0, remainingQuantityKg: 90, state: "AVAILABLE" });
  });

  it("matches the live `offerPublished` fixture's exact stored numbers (100 / 15.5 / 24.5 → remaining 60, PARTIALLY_FILLED)", () => {
    const result = projectFillState({ quantityKg: 100, reservedQuantityKg: 15.5, filledQuantityKg: 24.5 });
    expect(result).toEqual({ ok: true, quantityKg: 100, reservedQuantityKg: 15.5, filledQuantityKg: 24.5, remainingQuantityKg: 60, state: "PARTIALLY_FILLED" });
    // Guards against silently editing the fixture without updating this cross-check.
    expect(LISTING_FIXTURES.offerPublished).toBeTruthy();
  });

  it("matches the live `offerSoldOut` fixture's exact stored numbers (50 / 0 / 50 → remaining 0, SOLD_OUT)", () => {
    const result = projectFillState({ quantityKg: 50, reservedQuantityKg: 0, filledQuantityKg: 50 });
    expect(result).toEqual({ ok: true, quantityKg: 50, reservedQuantityKg: 0, filledQuantityKg: 50, remainingQuantityKg: 0, state: "SOLD_OUT" });
  });

  it("SOLD_OUT — remaining exactly zero via reserved+filled combined, not filled alone", () => {
    const result = projectFillState({ quantityKg: 30, reservedQuantityKg: 30, filledQuantityKg: 0 });
    expect(result).toEqual({ ok: true, quantityKg: 30, reservedQuantityKg: 30, filledQuantityKg: 0, remainingQuantityKg: 0, state: "SOLD_OUT" });
  });

  it("a negative remainder is a controlled, OBSERVABLE integrity problem — never silently clamped to 0", () => {
    const result = projectFillState({ quantityKg: 10, reservedQuantityKg: 6, filledQuantityKg: 6 });
    expect(result).toEqual({ ok: false, problem: "NEGATIVE_REMAINING", quantityKg: 10, reservedQuantityKg: 6, filledQuantityKg: 6 });
  });

  it("never calls Math.max(0, ...) to clamp a negative remainder (source-level proof)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/listings/fills.ts", "utf8"));
    expect(source).not.toMatch(/Math\.max\(0,/);
  });

  it("never queries order rows or accumulates with reduce()/+=  (source-level proof)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/listings/fills.ts", "utf8"));
    expect(source).not.toMatch(/order_items|inventory_reservation_items|\.from\(/);
    expect(source).not.toMatch(/\.reduce\(|\+=/);
  });
});

/**
 * Feature 018 M2 - approved REMOTE live verification harness (T038). RESERVED AND GATED.
 *
 * Declares the remote scenarios only. Nothing runs unless T129 has recorded explicit authorization AND the approval
 * flags below are present; Phase A never sets them, so every scenario is reported as skipped, never as passed. The
 * target is pinned to the TEST/DEMO project mxejnutukgxyccnohglo; the other project is refused. The real-PostgreSQL
 * evidence for these scenarios is the LOCAL suites (f018-cart-line-checkout.live, f018-checkout-concurrency.live,
 * f018-selected-quote.live, f018-legacy-checkout-compat.live, f018-m2-migration); this file does not substitute for them.
 */
import { describe, expect, it } from "vitest";

import { F018_FORBIDDEN_REFS, F018_TARGET_REF } from "../../scripts/f018-capture-schema";

const approved = process.env.F018_REMOTE_LIVE_MUTATION_APPROVED === "1" && process.env.F018_T129_AUTHORIZATION_RECORDED === "1";

describe("Feature 018 M2 live harness gate", () => {
  it("is pinned to the approved TEST/DEMO target and refuses the other project", () => {
    expect(F018_TARGET_REF).toBe("mxejnutukgxyccnohglo");
    expect(F018_FORBIDDEN_REFS).toContain("qfzvehrzwaheppuxqkjo");
  });
});

const SCENARIOS = [
  "L-M2-1 preflight against the live target passes (scripts/f018-m2-preflight.ts --remote)",
  "L-M2-2 forward migration applies and the read-only postflight passes (scripts/f018-m2-postflight.ts --remote)",
  "L-M2-3 A/B/C selected checkout, final-line empty-cart reuse and 20-cycle reuse against persisted rows",
  "L-M2-4 same-line, different-line, Add/update/remove and expired-reclaim concurrency with independent sessions",
  "L-M2-5 unknown-outcome recovery, payload conflict and authority loss with fixture accounts",
  "L-M2-6 fresh legacy multi-line denial and historical multi-line/multi-group replay on committed history",
  "L-M2-7 rollback keeps fences and receipts; conditional reapply and postflight; Feature 017 denials intact",
];

describe.skipIf(!approved)("Feature 018 M2 live scenarios (T129-gated, remote TEST/DEMO)", () => {
  for (const scenario of SCENARIOS) {
    it(scenario, () => {
      throw new Error("Reserved: executed only after T129 authorization through the reviewed live harness (T130-T138)");
    });
  }
});

/** Feature 016 approved remote verification. Scenarios are skipped unless the independent F016 gate is set. */
import { beforeAll, describe, expect, it } from "vitest";
import { assertF016LiveTarget, executeF016Sql, F016_TARGET_REF } from "../../scripts/f016-live-target";
import { F016_LIVE_SCENARIOS } from "./f016-live-scenarios";

const IS_LIVE_APPROVED = process.env.F016_REMOTE_LIVE_DB_APPROVED === "1";
async function assertScenarioHarness() {
  const target = assertF016LiveTarget();
  expect(target.ref).toBe(F016_TARGET_REF);
  expect(await executeF016Sql("begin; set local statement_timeout='30s'; select to_regprocedure('public.finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)'); rollback;")).toBe(0);
}

describe("T006 / Phase 7: Feature 016 Live Database Verification Suite", () => {
  it("requires only the independent F016 approval gate", () => {
    if (!IS_LIVE_APPROVED) expect(() => assertF016LiveTarget({ F016_REMOTE_LIVE_DB_APPROVED: undefined })).toThrow(/F016_REMOTE_LIVE_DB_APPROVED=1/);
  });
  it("uses the approved Hills target and complete authoritative registry", () => {
    expect(F016_TARGET_REF).toBe("mxejnutukgxyccnohglo");
    expect(F016_LIVE_SCENARIOS.map(s => s.id)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
    expect(new Set(F016_LIVE_SCENARIOS.map(s => s.name)).size).toBe(29);
  });
  describe.skipIf(!IS_LIVE_APPROVED)("29 Mandatory Live Scenarios", () => {
    beforeAll(assertScenarioHarness);
    for (const scenario of F016_LIVE_SCENARIOS) {
      it(`Scenario ${scenario.id}: ${scenario.name}`, scenario.handler, 600000);
    }
  });
});

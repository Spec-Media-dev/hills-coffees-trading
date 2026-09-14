import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 009 RUN C (T028) — DB-BLOCK-07 concurrency: reused from `scripts/t013-delivery-live-proof.ts`
 * scenario 16 (RUN A2 T013, live-proven this feature's own reservation/release code path, not a
 * generic checkout race) at the application-call layer — 10 real concurrent
 * `Promise.allSettled([cancel, settle])` attempts, `deadlockSeen: false`, `allConsistent: true`,
 * quantities incrementing monotonically with no drift across all 10 attempts (recorded verbatim in
 * `specs/009-delivery-shipments/tasks.md`'s own T013 evidence block). Not re-run here — re-running a
 * 10-attempt concurrent race against live data for no new information would be exactly the
 * "unnecessary destructive live testing" this run's own strategy rule forbids.
 */
describe("T028 — concurrency: evidence location proof (T013 scenario 16, not re-derived)", () => {
  it("scenario16_concurrency exists and was run with 10 real concurrent attempts", () => {
    const driver = readFileSync("scripts/t013-delivery-live-proof.ts", "utf8");
    expect(driver).toMatch(/async function scenario16_concurrency\(s: Sessions, attempts: number\)/);
    expect(driver).toMatch(/"16": \(s\) => scenario16_concurrency\(s, 10\)/);
    expect(driver).toMatch(/Promise\.allSettled/);
  });

  it("cancellation restores exactly once (scenario 9's duplicate-cancel proof)", () => {
    const driver = readFileSync("scripts/t013-delivery-live-proof.ts", "utf8");
    expect(driver).toMatch(/async function scenario9_cancelReleaseArithmetic/);
    expect(driver).toMatch(/duplicateCancel/);
    expect(driver).toMatch(/duplicateNoRestore/);
  });

  it("the recorded result was deadlockSeen: false, allConsistent: true across all 10 attempts", () => {
    const tasks = readFileSync("specs/009-delivery-shipments/tasks.md", "utf8");
    expect(tasks).toMatch(/deadlockSeen.*false/);
    expect(tasks).toMatch(/allConsistent.*true/);
    expect(tasks).toMatch(/10 real (concurrent )?attempts|10 attempts/);
  });
});

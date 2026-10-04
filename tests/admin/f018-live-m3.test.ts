/**
 * Feature 018 M3 - approved REMOTE live verification harness (T046). RESERVED AND GATED.
 *
 * Declares the remote scenarios only. Nothing runs unless T129 has recorded explicit authorization AND the approval
 * flags below are present; Phase A never sets them, so every scenario is reported as skipped, never as passed. The
 * target is pinned to the TEST/DEMO project mxejnutukgxyccnohglo; the other project is refused. The real-PostgreSQL
 * evidence for the same behavior is the LOCAL suites (f018-catalogue-orchestration, f018-m3-migration,
 * f018-payment-accounts); this file does not substitute for them.
 */
import { describe, expect, it } from "vitest";

import { F018_FORBIDDEN_REFS, F018_TARGET_REF } from "../../scripts/f018-capture-schema";

const approved = process.env.F018_REMOTE_LIVE_MUTATION_APPROVED === "1" && process.env.F018_T129_AUTHORIZATION_RECORDED === "1";

describe("Feature 018 M3 live harness gate", () => {
  it("is pinned to the approved TEST/DEMO target and refuses the other project", () => {
    expect(F018_TARGET_REF).toBe("mxejnutukgxyccnohglo");
    expect(F018_FORBIDDEN_REFS).toContain("qfzvehrzwaheppuxqkjo");
  });
});

const SCENARIOS = [
  "L-M3-1 preflight against the live target passes (scripts/f018-m3-preflight.ts --remote)",
  "L-M3-2 forward migration applies and the read-only postflight passes (scripts/f018-m3-postflight.ts --remote)",
  "L-M3-3 repeated and uncertain first save creates one DRAFT; interrupted steps resume; changed intent and stale revision conflict",
  "L-M3-4 role/MFA split with fixture operators: no universal catalogue authority; forged backing and no-stock handoff",
  "L-M3-5 media lost-response recovery and verified-orphan compensation against the real public-assets bucket",
  "L-M3-6 catalogue-only and coordinated publication with injected failure leaving neither published; Featured lifecycle",
  "L-M3-7 atomic Compliance decision exactly-once and public cache invalidation after commit",
  "L-M3-8 rollback keeps revisions and the readiness gate; conditional reapply and postflight",
];

describe.skipIf(!approved)("Feature 018 M3 live scenarios (T129-gated, remote TEST/DEMO)", () => {
  for (const scenario of SCENARIOS) {
    it(scenario, () => {
      throw new Error("Reserved: executed only after T129 authorization through the reviewed live harness (T130-T138)");
    });
  }
});

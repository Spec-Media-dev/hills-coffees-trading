/**
 * Feature 018 M1 - approved REMOTE live verification harness (T019). RESERVED AND GATED.
 *
 * This file only declares the scenarios. It performs nothing unless every explicit approval below is present, and the
 * only authorized remote mutation gate is T129 (Phase C). Phase A does not execute it, so the scenarios are reported as
 * skipped, never as passed. The target is pinned to the TEST/DEMO project mxejnutukgxyccnohglo; the other project is
 * refused. Remote migration application is performed through reviewed scripts only after T129 records authorization.
 */
import { describe, expect, it } from "vitest";

import { F018_FORBIDDEN_REFS, F018_TARGET_REF } from "../../scripts/f018-capture-schema";

const approved = process.env.F018_REMOTE_LIVE_MUTATION_APPROVED === "1" && process.env.F018_T129_AUTHORIZATION_RECORDED === "1";

describe("Feature 018 M1 live harness gate", () => {
  it("is pinned to the approved TEST/DEMO target and refuses the other project", () => {
    expect(F018_TARGET_REF).toBe("mxejnutukgxyccnohglo");
    expect(F018_FORBIDDEN_REFS).toContain("qfzvehrzwaheppuxqkjo");
  });
});

describe.skipIf(!approved)("Feature 018 M1 live scenarios (T129-gated, remote TEST/DEMO)", () => {
  it("L-M1-1 preflight against the live target passes before the forward migration", () => {
    throw new Error("Reserved: executed only after T129 authorization through scripts/f018-m1-preflight.ts --remote");
  });
  it("L-M1-2 forward migration applies and the read-only postflight passes", () => {
    throw new Error("Reserved: executed only after T129 authorization (T131)");
  });
  it("L-M1-3 rollback retains populated Featured/Arabic history and reapply restores the postflight", () => {
    throw new Error("Reserved: executed only after T129 authorization (T134/T135)");
  });
});

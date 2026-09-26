import { describe, expect, it } from "vitest";

import { T056_PRE_M3_MATRIX_FAILURES } from "./t056-baseline";
import { LINKED_REF, RLS_PHASE, T056_STATE_SQL, decodeResult, linkedRef, phaseProblems, query, runSqlFile, type CaseResult } from "./t056-live-runner";
import { ROLES, T062_VIEW_ROW_CASES, TABLES, VIEWS, buildT056ProofSql } from "./t056-rls-proof";

/**
 * Feature 013 T056 — full role matrix (gated: F013_LIVE=1), written BEFORE M3: buyer / other buyer / seller 1 /
 * seller 2 / finance / warehouse / auditor / anon over every contracts/rls-storage.md §1 table (plus payment_accounts and
 * the payment-proofs bucket) and every §2 view, each case stating the desired post-M3 visibility of the fixture rows.
 *
 * One rolled-back transaction (see t056-rls-proof.ts). PRE_M3 (default) pins the exact failing baseline — the C2
 * over-exposure plus the not-yet-granted Feature 013 tables and the missing §2 views; T062 sets F013_RLS_PHASE=POST_M3.
 */
const LIVE = process.env.F013_LIVE === "1";

describe.skipIf(!LIVE)(`T056 — role matrix (${RLS_PHASE}; one rolled-back transaction; F013_LIVE=1)`, () => {
  let results: CaseResult[] = [];

  it("runs against the verified linked project and leaves production unchanged", () => {
    expect(linkedRef()).toBe(LINKED_REF);
    const before = query(T056_STATE_SQL)[0]!;
    expect(before.checkout_enabled).toBe(false);
    // T062: the §2 row-level assertions exist only once the views do (POST_M3).
    results = decodeResult(runSqlFile(buildT056ProofSql("matrix", { viewRows: RLS_PHASE === "POST_M3" })), "T056_RESULT");
    const after = query(T056_STATE_SQL)[0]!;
    expect(after, "production state after the proof equals the state before it").toEqual(before);
  }, 600_000);

  it("the fixture is coherent and every role × relation cell was exercised", () => {
    expect(results.filter((r) => r.relation === "fixture" && !r.ok)).toEqual([]);
    for (const relation of [...TABLES, ...VIEWS]) {
      for (const role of relation.roles ?? ROLES) {
        expect(results.some((r) => r.relation === relation.name && r.role === role), `${relation.name} × ${role}`).toBe(true);
      }
    }
  });

  it.skipIf(RLS_PHASE !== "POST_M3")("T062: every §2 row-level assertion was exercised", () => {
    for (const c of T062_VIEW_ROW_CASES) expect(results.some((r) => r.case === `${c.name} × ${c.role}`), c.name).toBe(true);
  });

  it(RLS_PHASE === "POST_M3" ? "every matrix case passes (M3 applied)" : "matches the exact PRE-M3 baseline: pinned failures still fail, everything else passes", () => {
    expect(phaseProblems(results, T056_PRE_M3_MATRIX_FAILURES)).toEqual([]);
  });
});

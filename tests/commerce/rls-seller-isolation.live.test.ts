import { describe, expect, it } from "vitest";

import { T056_PRE_M3_SELLER_FAILURES } from "./t056-baseline";
import { LINKED_REF, RLS_PHASE, T056_STATE_SQL, decodeResult, linkedRef, phaseProblems, query, runSqlFile, type CaseResult } from "./t056-live-runner";
import { buildT056ProofSql } from "./t056-rls-proof";

/**
 * Feature 013 T056 — seller isolation for a two-seller fixture order (gated: F013_LIVE=1), written BEFORE M3.
 * Accept (a)–(h) + T029 R1 + the T031 deferred assertion: SELLER_1 / SELLER_2, each an order-linked seller, must read
 * 0 rows of the buyer's payments, proofs (and proof storage), order_financials, the proforma header, the buyer's
 * destination (table, orders columns, embedded selects, views, RPCs), bank instructions and payment accounts, and only
 * their OWN lines / economics / groups / settlements / payouts / shipments.
 *
 * One rolled-back transaction (see t056-rls-proof.ts). PRE_M3 (default) pins the exact failing baseline; T062 sets
 * F013_RLS_PHASE=POST_M3 and every case must pass.
 */
const LIVE = process.env.F013_LIVE === "1";

describe.skipIf(!LIVE)(`T056 — seller isolation (${RLS_PHASE}; one rolled-back transaction; F013_LIVE=1)`, () => {
  let results: CaseResult[] = [];

  it("runs against the verified linked project and leaves production unchanged", () => {
    expect(linkedRef()).toBe(LINKED_REF);
    const before = query(T056_STATE_SQL)[0]!;
    expect(before.checkout_enabled).toBe(false);
    results = decodeResult(runSqlFile(buildT056ProofSql("seller")), "T056_RESULT");
    const after = query(T056_STATE_SQL)[0]!;
    expect(after, "production state after the proof equals the state before it").toEqual(before);
  }, 600_000);

  it("the fixture is coherent: two order-linked sellers, no MFA masking", () => {
    const fixture = results.filter((r) => r.relation === "fixture");
    expect(fixture.length).toBe(2);
    expect(fixture.filter((r) => !r.ok), JSON.stringify(fixture)).toEqual([]);
  });

  it("covers every T056 accept item for both sellers", () => {
    const names = results.map((r) => r.case);
    for (const relation of ["payments", "payment_proofs", "storage payment-proofs objects", "order_financials", "order_items", "proforma_invoice_items",
                            "proforma_line_economics", "payouts", "proforma_seller_settlements", "proforma_invoices", "delivery_destinations",
                            "orders.delivery_destination_id/destination_snapshot (R1)", "orders destination via embedded order_items→orders select (R1)",
                            "orders destination via any public view (R1)", "proforma_bank_instructions", "payment_accounts"]) {
      for (const role of ["SELLER_1", "SELLER_2"]) expect(names, `${relation} × ${role}`).toContain(`${relation} × ${role}`);
    }
    expect(names).toContain("orders destination via a client-callable RPC (R1) × SELLER_1/SELLER_2");
  });

  it(RLS_PHASE === "POST_M3" ? "every seller-isolation case passes (M3 applied)" : "matches the exact PRE-M3 baseline: pinned C2 exposures still fail, everything else passes", () => {
    expect(phaseProblems(results, T056_PRE_M3_SELLER_FAILURES)).toEqual([]);
  });
});

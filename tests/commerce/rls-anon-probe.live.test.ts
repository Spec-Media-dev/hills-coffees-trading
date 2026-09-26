import { describe, expect, it } from "vitest";

import { T056_PRE_M3_ANON_FAILURES } from "./t056-baseline";
import { LINKED_REF, RLS_PHASE, decodeResult, env, linkedRef, phaseProblems, runSqlFile, type CaseResult } from "./t056-live-runner";
import { buildT056AnonProbeSql } from "./t056-rls-proof";

/**
 * Feature 013 T056 — DB-OPEN-C15 anonymous boundary + AC-014 anon-key probe (gated: F013_LIVE=1), written BEFORE M3.
 * Desired (T057): anon / PUBLIC cannot EXECUTE `mfa_satisfied()` or `kyb_storage_object_authorized(text, boolean)`;
 * authenticated and service_role still can; bodies, SECURITY DEFINER and search_path unchanged.
 *
 * In-database probes run in one rolled-back block; the REST probes use the publishable (anon) key and only call the two
 * read-only helpers or read tables (no write is possible). PRE_M3 pins the current C15 exposure; T062 sets
 * F013_RLS_PHASE=POST_M3.
 */
const LIVE = process.env.F013_LIVE === "1";
const PROBE_OBJECT = "org/13000000-0000-4000-8000-000000000001/application/13000000-0000-4000-8000-000000000002/x.pdf";
/** Tables holding buyer, seller or finance data: the anon key must reach 0 rows of each. */
const ANON_TABLES = ["orders", "order_items", "order_financials", "proforma_invoices", "proforma_invoice_items", "proforma_line_economics",
  "proforma_fulfillment_groups", "proforma_seller_settlements", "proforma_bank_instructions", "payments", "payment_proofs", "payment_reviews",
  "reconciliation_cases", "manual_financial_adjustments", "tax_invoices", "payouts", "inventory_reservations", "order_shipments", "delivery_destinations",
  "payment_accounts", "commerce_settings", "notification_events", "offer_price_tiers", "promotions"];

describe.skipIf(!LIVE)(`T056 — anonymous boundary / DB-OPEN-C15 (${RLS_PHASE}; F013_LIVE=1)`, () => {
  const results: CaseResult[] = [];

  it("in-database: anon / authenticated / service_role EXECUTE and ACL probes (one rolled-back block)", () => {
    expect(linkedRef()).toBe(LINKED_REF);
    results.push(...decodeResult(runSqlFile(buildT056AnonProbeSql()), "T056_RESULT"));
    expect(results.length).toBe(17);
  }, 300_000);

  it("the real anonymous REST path: both helpers via rpc/ (publishable key)", async () => {
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    const rpc = async (fn: string, body: object) => {
      const response = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, text: await response.text() };
    };
    const mfa = await rpc("mfa_satisfied", {});
    results.push({ case: "C15 REST: anon POST rpc/mfa_satisfied is refused", relation: "C15 REST", role: "anon", expected: "refused", got: `${mfa.status} ${mfa.text.slice(0, 120)}`, ok: mfa.status >= 400 });
    const kyb = await rpc("kyb_storage_object_authorized", { p_object_name: PROBE_OBJECT, p_require_editable: false });
    results.push({ case: "C15 REST: anon POST rpc/kyb_storage_object_authorized is refused", relation: "C15 REST", role: "anon", expected: "refused", got: `${kyb.status} ${kyb.text.slice(0, 120)}`, ok: kyb.status >= 400 });
  }, 60_000);

  it("the real anonymous REST path reaches 0 rows of every buyer/seller/finance table (AC-014; read-only GETs)", async () => {
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    for (const table of ANON_TABLES) {
      const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: key } });
      const body = (await response.json()) as unknown;
      const rows = Array.isArray(body) ? body.length : 0;
      results.push({ case: `AC-014 REST: anon reads 0 rows of ${table}`, relation: table, role: "anon", expected: "0 rows", got: `${response.status} rows=${rows}`, ok: rows === 0 });
    }
  }, 120_000);

  it(RLS_PHASE === "POST_M3" ? "every anonymous-boundary case passes (M3 applied)" : "matches the exact PRE-M3 baseline: the C15 exposure still fails, everything else passes", () => {
    expect(results.length).toBe(17 + 2 + ANON_TABLES.length);
    expect(phaseProblems(results, T056_PRE_M3_ANON_FAILURES)).toEqual([]);
  });
});

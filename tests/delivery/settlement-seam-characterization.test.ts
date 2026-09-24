import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 013 T008 — characterization of research.md C1 (DB-OPEN-C1).
 *
 * The applied Feature 009 migration added `perform public.reserve_ready_deliveries_for_settlement(...)` to
 * `admin_review_payment()`. The later, applied Feature 008 migration re-created `admin_review_payment()` from the
 * 2026-09-07 baseline body, so the LAST definition in migration order no longer calls the Feature 009 hook.
 *
 * This test documents that current truth from the repository alone. It is NOT a fix: the live function is not
 * patched in Batch A. The owner of the fix is Feature 013 T117 (`finance_confirm_payment`, migration M5b), which must
 * call the hook; when that migration lands, this characterization is superseded by T118/T124.
 * Live confirmation: section 6 of supabase/maintenance/20260925_feature_013_preflight.sql (`has_009_settlement_hook`).
 */
const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const HOOK = "reserve_ready_deliveries_for_settlement(";

function adminReviewPaymentBodies(): { file: string; body: string }[] {
  const out: { file: string; body: string }[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
    const re = /create or replace function public\.admin_review_payment\(/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sql))) {
      const end = sql.indexOf("$function$;", match.index);
      out.push({ file, body: sql.slice(match.index, end === -1 ? undefined : end) });
    }
  }
  return out;
}

describe("T008 — C1 settlement seam characterization (current repository truth)", () => {
  const bodies = adminReviewPaymentBodies();

  it("the Feature 009 migration's admin_review_payment calls the settlement hook", () => {
    const f009 = bodies.filter((b) => b.file === "20260914120000_feature_009_db_block_07.sql");
    expect(f009).toHaveLength(1);
    expect(f009[0]!.body).toContain(HOOK);
  });

  it("the LAST definition in migration order (Feature 008, applied later) does NOT call it — the C1 regression", () => {
    const last = bodies[bodies.length - 1]!;
    expect(last.file).toBe("20260922120000_feature_008_stripe_trusted_funding.sql");
    expect(last.body).toContain("trusted_funding_required");
    expect(last.body).not.toContain(HOOK);
  });

  it("no Feature 013 migration has redefined admin_review_payment (the fix lands in finance_confirm_payment, M5b)", () => {
    expect(bodies.filter((b) => /feature_013/.test(b.file))).toEqual([]);
  });
});

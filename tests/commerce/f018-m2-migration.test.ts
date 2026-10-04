/**
 * Feature 018 T037 - M2 migration contract, SQL syntax and local PostgreSQL dry-run (apply, idempotent re-apply,
 * rollback, reapply, retained fences). Static checks always run; the PostgreSQL sections need F018_LOCAL_PG=1. LOCAL ONLY.
 */
import { readFileSync } from "node:fs";
import { parse } from "@pgsql/parser/v17";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createLocalDockerRunner, F018_LOCAL_DATABASE } from "../../scripts/f018-capture-schema";
import { M2_POSTFLIGHT_SPEC, M2_RETAINED_AFTER_ROLLBACK, runM2Postflight } from "../../scripts/f018-m2-postflight";
import { M2_PREFLIGHT_SPEC, runM2Preflight } from "../../scripts/f018-m2-preflight";
import { loadCheckSection, maintenancePath, runMigrationChecks } from "../../scripts/f018-migration-checks";
import { Actor, canonicalCart, lineFor, nextRequest } from "./f018-checkout-helpers";
import { W, buildWorldTemplate } from "./f018-fixtures";
import { conventionViolations, stripComments } from "./migrations/sql-rules";
import { F018_LOCAL_PG_ENABLED, F018_M1, F018_M2, applyForward, applyRollback, freshWorkDatabase, migrationPath, resetFromWorldTemplate, rollbackPath, tryWork, work, workScalar } from "./f018-local-pg";

const forward = readFileSync(migrationPath(F018_M2), "utf8");
const rollback = readFileSync(rollbackPath(F018_M2), "utf8");

describe("Feature 018 M2 migration static contract", () => {
  it("is a valid PostgreSQL 17 script (forward, rollback, preflight and postflight parse)", async () => {
    for (const sql of [forward, rollback, readFileSync(maintenancePath(M2_PREFLIGHT_SPEC.file), "utf8"), readFileSync(maintenancePath(M2_POSTFLIGHT_SPEC.file), "utf8")]) {
      const ast = await parse(sql);
      expect(ast.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("satisfies the repository migration conventions", () => {
    expect(conventionViolations(F018_M2, forward)).toEqual([]);
    expect(rollback.trimStart()).toMatch(/^(--[^\n]*\n)*\s*begin;/);
    expect(rollback.trimEnd()).toMatch(/commit;$/);
  });

  it("applies only after M1 and its guard precedes every change", () => {
    expect(F018_M2 > F018_M1).toBe(true);
    expect(forward).toContain("feature_018_m2_requires_m1");
    expect(forward.indexOf("do $guard$")).toBeLessThan(forward.indexOf("alter table public.commerce_request_log"));
  });

  it("never restores history or provider execution and the rollback keeps the fence", () => {
    const forwardCode = stripComments(forward);
    const rollbackCode = stripComments(rollback);
    expect(forward).toContain("feature_018_m2_feature_017_not_retired");
    expect(forwardCode).not.toMatch(/grant [^;]*(record_stripe_payment_intent|record_payment_transfer|ingest_stripe_event|admin_review_payment)/);
    expect(rollbackCode).not.toMatch(/grant /);
    expect(rollbackCode).not.toMatch(/checkout_bank_transfer_v1|f018_checkout_kernel|drop table|recover_cart_line_checkout|drop trigger|alter table/);
    expect(rollbackCode.match(/drop function if exists/g)).toHaveLength(2);
  });
});

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 M2 local PostgreSQL migration (real database)", { timeout: 240_000 }, () => {
  const runner = () => createLocalDockerRunner(F018_LOCAL_DATABASE);

  describe("migration lifecycle", () => {
    beforeAll(() => { freshWorkDatabase(); });

    it("refuses to apply without M1 and leaves nothing behind", () => {
      const refused = tryWork(forward);
      expect(refused.ok).toBe(false);
      expect(refused.error).toContain("feature_018_m2_requires_m1");
      expect(workScalar("select to_regclass('public.cart_line_checkout_receipts') is null")).toBe("t");
    });

    it("preflight passes after M1; forward applies; postflight passes; re-apply is idempotent", () => {
      applyForward(F018_M1);
      expect(runM2Preflight(runner()).every((row) => row.ok)).toBe(true);
      applyForward(F018_M2);
      expect(runM2Postflight(runner()).every((row) => row.ok)).toBe(true);
      applyForward(F018_M2);
      expect(runM2Postflight(runner()).every((row) => row.ok)).toBe(true);
    });

    it("rollback removes only the purchase-creating entry points and retains every fence and history object", () => {
      applyRollback(F018_M2);
      const results = runMigrationChecks(runner(), loadCheckSection("m2-postflight", maintenancePath(M2_POSTFLIGHT_SPEC.file)));
      const byName = new Map(results.map((row) => [row.check, row.ok]));
      for (const retained of M2_RETAINED_AFTER_ROLLBACK) expect(byName.get(retained), retained).toBe(true);
      expect(byName.get("new public entry points exist, are SECURITY DEFINER with a pinned search_path and are authenticated-only")).toBe(false);
      expect(workScalar("select count(*) from pg_proc where proname in ('checkout_cart_line_bank_transfer_v1', 'estimate_cart_line_bank_transfer_v1')")).toBe("0");
      expect(workScalar("select count(*) from pg_proc where proname = 'recover_cart_line_checkout'")).toBe("1");
      // M1 cannot drop the Arabic columns while the retained kernel still inserts them.
      applyRollback(F018_M1);
      expect(workScalar("select count(*) from information_schema.columns where table_name = 'proforma_invoice_items' and column_name like '%_ar_snapshot'")).toBe("2");
      applyForward(F018_M1);
    });

    it("re-applying after rollback restores the complete applied state", () => {
      applyForward(F018_M2);
      expect(runM2Postflight(runner()).every((row) => row.ok)).toBe(true);
    });

    it("fails closed on checkout definition drift or a re-exposed Feature 017 provider function before any change", () => {
      work("create or replace function public.checkout_bank_transfer_v1(p_order_id uuid, p_destination_id uuid, p_request_id uuid) returns jsonb language sql as $$ select null::jsonb $$;");
      expect(tryWork(forward).error).toContain("feature_018_m2_checkout_definition_drift");
      freshWorkDatabase();
      applyForward(F018_M1);
      work("grant execute on function public.record_stripe_payment_intent(uuid,text,text) to authenticated;", "supabase_admin");
      expect(tryWork(forward).error).toContain("feature_018_m2_feature_017_not_retired");
      expect(workScalar("select to_regclass('public.cart_line_checkout_receipts') is null")).toBe("t");
    });
  });

  describe("frozen Arabic snapshots", () => {
    const open: Actor[] = [];
    beforeAll(() => { buildWorldTemplate(); }, 240_000);
    beforeEach(() => { resetFromWorldTemplate(); });
    afterEach(async () => { await Promise.all(open.splice(0).map((actor) => actor.close())); });

    it("captures Arabic names only at issuance, keeps missing translations NULL, and later edits never change them", async () => {
      const a = await Actor.open("a1", W.users.buyerA1, W.orgs.buyerA);
      open.push(a);
      for (const [offer, quantity] of [[W.offers.A, 10], [W.offers.B, 10], [W.offers.C, 10]] as Array<[string, number]>) expect((await a.addLine(offer, quantity)).ok).toBe(true);
      const cart = canonicalCart(W.orgs.buyerA)!;
      for (const offer of [W.offers.A, W.offers.B, W.offers.C]) {
        const done = await a.checkout({ cartId: cart.id, itemId: lineFor(canonicalCart(W.orgs.buyerA)!, offer).id, offerId: offer, quantity: 10, destinationId: W.destinations.A, requestId: nextRequest() });
        expect(done.ok, `checkout ${offer}`).toBe(true);
      }
      const snapshot = work("select product_name_snapshot || '|' || coalesce(origin_name_snapshot, '-') || '|' || coalesce(product_name_ar_snapshot, 'NULL') || '|' || coalesce(origin_name_ar_snapshot, 'NULL') from public.proforma_invoice_items order by product_name_snapshot").trim().split("\n");
      expect(snapshot).toEqual(["Alpha|Ethiopia|ألفا|إثيوبيا", "Bravo|Ethiopia|NULL|إثيوبيا", "Charlie|-|NULL|NULL"]);

      work(`update public.coffee_translations set name = 'ألفا (محدّث)' where coffee_id = '${W.coffees.c1}' and locale = 'ar'; update public.origin_translations set name = 'تغيير' where locale = 'ar'; insert into public.coffee_translations (coffee_id, locale, name) values ('${W.coffees.c2}', 'ar', 'برافو');`);
      expect(work("select coalesce(product_name_ar_snapshot, 'NULL') from public.proforma_invoice_items order by product_name_snapshot").trim().split("\n")).toEqual(["ألفا", "NULL", "NULL"]);
      expect(tryWork("update public.proforma_invoice_items set product_name_ar_snapshot = 'x'").error).toContain("snapshot_immutable");
      expect(tryWork("delete from public.proforma_invoice_items").error).toContain("snapshot_immutable");
      // A new checkout of the same Coffee now freezes the NEW Arabic name; the old proforma is unchanged.
      expect((await a.addLine(W.offers.B, 5)).ok).toBe(true);
      const again = canonicalCart(W.orgs.buyerA)!;
      expect((await a.checkout({ cartId: again.id, itemId: again.lines[0]!.id, offerId: W.offers.B, quantity: 5, destinationId: W.destinations.A, requestId: nextRequest() })).ok).toBe(true);
      expect(work("select count(*) from public.proforma_invoice_items where product_name_ar_snapshot = 'برافو'").trim()).toBe("1");
    });
  });
});

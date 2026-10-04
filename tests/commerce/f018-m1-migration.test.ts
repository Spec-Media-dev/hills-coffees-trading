/**
 * Feature 018 M1 - local PostgreSQL migration verification (T018). Real PostgreSQL 17 in the local Supabase container.
 * Opt in with F018_LOCAL_PG=1. No remote host is contacted.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { createLocalDockerRunner, F018_LOCAL_DATABASE } from "../../scripts/f018-capture-schema";
import { runM1Postflight } from "../../scripts/f018-m1-postflight";
import { runM1Preflight } from "../../scripts/f018-m1-preflight";
import { F018_LOCAL_PG_ENABLED, F018_M1, applyForward, applyRollback, freshWorkDatabase, migrationPath, tryWork, work, workScalar } from "./f018-local-pg";

const runner = () => createLocalDockerRunner(F018_LOCAL_DATABASE);

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 M1 local PostgreSQL migration (real database)", { timeout: 180_000 }, () => {
  beforeAll(() => { freshWorkDatabase(); });

  it("preflight passes on the Feature 017 base and the objects are absent", () => {
    expect(runM1Preflight(runner()).every((row) => row.ok)).toBe(true);
    expect(workScalar("select count(*) from information_schema.columns where table_name = 'coffees' and column_name = 'featured_at'")).toBe("0");
  });

  it("forward migration applies, postflight passes, and it is idempotent", () => {
    applyForward(F018_M1);
    expect(runM1Postflight(runner()).every((row) => row.ok)).toBe(true);
    applyForward(F018_M1);
    expect(runM1Postflight(runner()).every((row) => row.ok)).toBe(true);
  });

  it("backfills nothing: every pre-existing Coffee is unselected and no snapshot carries Arabic values", () => {
    expect(workScalar("select count(*) from public.coffees where featured_at is not null")).toBe("0");
    expect(workScalar("select count(*) from public.proforma_invoice_items where product_name_ar_snapshot is not null or origin_name_ar_snapshot is not null")).toBe("0");
  });

  it("the Featured index serves the public query shape (ordering and predicate)", () => {
    const plan = work(`
      set enable_seqscan = off;
      explain select id from public.coffees where status = 'PUBLISHED' and featured_at is not null order by featured_at desc, id desc limit 6;
    `);
    expect(plan).toContain("idx_coffees_featured_published");
  });

  it("legacy proforma items cannot carry Arabic snapshots but may stay null", () => {
    const ok = tryWork(`
      begin; set local session_replication_role = replica;
      insert into public.proforma_invoice_items (proforma_id, order_item_id, description, amount) values (gen_random_uuid(), gen_random_uuid(), 'legacy', 1);
      rollback;
    `);
    expect(ok.ok).toBe(true);
    const bad = tryWork(`
      begin; set local session_replication_role = replica;
      insert into public.proforma_invoice_items (proforma_id, order_item_id, description, amount, product_name_ar_snapshot) values (gen_random_uuid(), gen_random_uuid(), 'legacy', 1, 'x');
      rollback;
    `);
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("proforma_invoice_items_ar_snapshot_v1_only_check");
  });

  it("anon can read only PUBLISHED coffees (public boundary preserved) and cannot write featured_at", () => {
    const write = tryWork("begin; set local role anon; update public.coffees set featured_at = now(); rollback;");
    expect(write.ok).toBe(false);
    expect(write.error).toMatch(/permission denied/i);
    work("begin; insert into public.coffees (name, slug, status, featured_at) values ('F018 hidden', 'f018-hidden', 'DRAFT', now()); insert into public.coffees (name, slug, status) values ('F018 shown', 'f018-shown', 'PUBLISHED'); commit;");
    const visible = work("set role anon; select slug from public.coffees where slug like 'f018-%' order by slug;");
    expect(visible).toContain("f018-shown");
    expect(visible).not.toContain("f018-hidden");
  });

  it("rollback retains populated Featured data and Arabic-capable schema; reapply restores the postflight", () => {
    applyRollback(F018_M1);
    expect(workScalar("select count(*) from information_schema.columns where table_name = 'coffees' and column_name = 'featured_at'")).toBe("1");
    work("delete from public.coffees where slug like 'f018-%'");
    applyRollback(F018_M1);
    expect(workScalar("select count(*) from information_schema.columns where table_name = 'coffees' and column_name = 'featured_at'")).toBe("0");
    expect(workScalar("select count(*) from information_schema.columns where table_name = 'proforma_invoice_items' and column_name like '%_ar_snapshot'")).toBe("0");
    expect(runM1Preflight(runner()).every((row) => row.ok)).toBe(true);
    applyForward(F018_M1);
    expect(runM1Postflight(runner()).every((row) => row.ok)).toBe(true);
  });

  it("fails closed when Feature 017 retirement is violated (the guard fires before any change)", () => {
    applyRollback(F018_M1);
    work("grant execute on function public.record_stripe_payment_intent(uuid,text,text) to authenticated;", "supabase_admin");
    try {
      const refused = tryWork(readFileSync(migrationPath(F018_M1), "utf8"));
      expect(refused.ok).toBe(false);
      expect(refused.error).toContain("feature_018_m1_feature_017_not_retired");
      expect(workScalar("select count(*) from information_schema.columns where table_name = 'coffees' and column_name = 'featured_at'")).toBe("0");
    } finally {
      work("revoke execute on function public.record_stripe_payment_intent(uuid,text,text) from authenticated;", "supabase_admin");
      applyForward(F018_M1);
    }
    expect(runM1Postflight(runner()).every((row) => row.ok)).toBe(true);
  });
});

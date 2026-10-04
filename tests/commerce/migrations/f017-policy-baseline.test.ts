// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  assertHistoricalPolicyManifest, captureCanonicalPolicies, createHistoricalPolicyDatabase,
  historicalPolicyStatements, POLICY_POSTFLIGHT_PATH, policyTextLiteral, type CanonicalPolicy,
} from "../../../scripts/f017-policy-baseline";

const postflight = readFileSync(POLICY_POSTFLIGHT_PATH, "utf8");
let db: PGlite;
let historical: CanonicalPolicy[];

const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
const policy = (name: string) => historical.find(row => row.policyname === name)!;

beforeAll(async () => {
  db = await createHistoricalPolicyDatabase();
  historical = await captureCanonicalPolicies(db);
  // Supply the unchanged non-policy security seams so the COMPLETE executable
  // postflight runs. No historical RPC business logic is emulated or tested here.
  await db.exec(`
    create table storage.buckets (id text primary key, public boolean);
    insert into storage.buckets values ('payment-proofs', false);
    create table public.payment_events (id uuid);
    create table public.payment_transfers (id uuid);
  `);
  const retired = [
    "admin_review_payment(uuid, boolean, text)", "record_stripe_payment_intent(uuid, text, text)",
    "record_payment_transfer(uuid, text, text, text)", "ingest_stripe_event(text, text, text, uuid, jsonb, boolean)",
  ];
  const active = [
    "checkout_bank_transfer_v1(uuid, uuid, uuid)", "issue_proforma(uuid, uuid, text, uuid)", "confirm_proforma(uuid, uuid)",
    "prepare_payment_proof_upload(uuid, uuid, text)", "finalize_payment_proof(uuid, uuid, numeric, date, text, text, uuid)",
    "finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)",
    "finance_payment_proof_projection(uuid)", "finance_payment_proof_asset_projection(uuid)",
    "checkout_order(uuid)", "submit_payment_proof(uuid, uuid, text)",
  ];
  for (const signature of [...retired, ...active]) {
    const body = signature.startsWith("admin_review_payment")
      ? "begin raise exception 'endpoint_deprecated_use_finance_review_bank_transfer_v1'; end"
      : signature.startsWith("submit_payment_proof")
        ? "begin raise exception 'endpoint_deprecated_use_finalize_payment_proof'; end"
        : "begin return; end";
    await db.exec(`create function public.${signature} returns void language plpgsql security definer
      set search_path = pg_catalog, public, auth as ${quote(body)};
      revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
    if (active.includes(signature)) await db.exec(`grant execute on function public.${signature} to authenticated;`);
  }
}, 30000);
beforeEach(async () => { await db.exec("begin;"); });
afterEach(async () => { await db.exec("rollback;"); });
afterAll(async () => { await db?.close(); });

describe("F017 independent PostgreSQL historical policy baseline", () => {
  it("captures complete effective policies from actual historical migrations and runs the full postflight", async () => {
    expect(historical).toHaveLength(14);
    expect(historical.map(row => row.policyname)).toEqual(expect.arrayContaining([
      "payment_proofs_read", "payment_proof_storage_select", "payment_proof_storage_insert",
      "public_assets_select", "public_assets_write", "public_assets_update", "public_assets_delete",
      "listing_media_select", "listing_media_insert", "listing_media_delete",
    ]));
    assertHistoricalPolicyManifest(postflight, historical);
    await expect(db.exec(postflight)).resolves.toBeDefined();
  });

  it("detects an incorrect F017-only manifest even when historical migrations remain healthy", () => {
    const original = policyTextLiteral(policy("payment_proofs_read").using_expr!);
    for (const mutation of ["true", `(${policy("payment_proofs_read").using_expr}) OR true`]) {
      const corruptedManifest = postflight.replace(original, policyTextLiteral(mutation));
      expect(corruptedManifest).not.toBe(postflight);
      expect(() => assertHistoricalPolicyManifest(corruptedManifest, historical)).toThrow("independently captured");
    }
  });

  it("canonicalizes historical qualification, whitespace, parentheses and identity boolean/text casts through PostgreSQL", async () => {
    await db.exec("set local search_path = public, pg_catalog;");
    await db.exec(`alter policy public_assets_update on storage.objects using (
      (((bucket_id = ('public-assets')::text))::boolean AND
       ((public_asset_object_authorized((name)::text, ('write')::text))::boolean))
    );`);
    await expect(db.exec(postflight)).resolves.toBeDefined();
    // Postflight restores caller visibility after its pinned capture comparison.
    expect((await db.query<{ path: string }>("select current_setting('search_path') as path")).rows[0].path).toBe("public, pg_catalog");
  });

  it("accepts CRLF checkout formatting without changing captured deparser newlines", async () => {
    const windowsPostflight = postflight.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n");
    assertHistoricalPolicyManifest(windowsPostflight, historical);
    await expect(db.exec(windowsPostflight)).resolves.toBeDefined();
  });

  it("lets PostgreSQL canonicalize name casts and ANY arrays without a handwritten normalizer", async () => {
    await db.exec(`create table public.name_cast_probe (role_name name);
      create policy probe on public.name_cast_probe using (role_name = any(array['authenticated'::name, 'anon'::name]));`);
    const canonical = async () => (await db.query<{ qual: string }>("select qual from pg_policies where policyname = 'probe'")).rows[0].qual;
    const before = await canonical();
    await db.exec(`alter policy probe on public.name_cast_probe using (
      ((role_name)::name = ANY ((ARRAY[(('authenticated')::name), ('anon')::name])::name[]))
    );`);
    expect(await canonical()).toBe(before);
  });

  it("uses the generic UPDATE/ALL USING fallback when WITH CHECK is omitted", async () => {
    const row = (await db.query<{ qual: string; with_check: string | null }>(
      "select qual, with_check from pg_policies where policyname = 'public_assets_update'"
    )).rows[0];
    expect(row.with_check).toBeNull();
    expect(policy("public_assets_update").check_expr).toBe(row.qual);
    await expect(db.exec(postflight)).resolves.toBeDefined();
    const predicate = policy("public_assets_update").using_expr!;
    await db.exec(`alter policy public_assets_update on storage.objects with check (${predicate});`);
    await expect(db.exec(postflight)).resolves.toBeDefined();
  });

  it.each([
    ["OR true", (value: string) => `(${value}) OR true`],
    ["true OR", (value: string) => `true OR (${value})`],
    ["NOT", (value: string) => `NOT (${value})`],
    ["USING true", () => "true"],
    ["buyer branch removed", () => "public.is_platform_admin() OR public.is_finance_operator()"],
    ["buyer membership removed", (value: string) => value.replace("public.is_org_member(o.buyer_organization_id)", "true")],
    ["organization eligibility removed", (value: string) => value.replace("public.organization_can_buy(o.buyer_organization_id)", "true")],
  ])("rejects payment proof predicate mutation: %s", async (_name, mutate) => {
    await db.exec(`alter policy payment_proofs_read on public.payment_proofs using (${mutate(policy("payment_proofs_read").using_expr!)});`);
    await expect(db.exec(postflight)).rejects.toThrow("payment_proofs policy manifest mismatch");
  });

  it.each([
    ["proof SELECT OR true", "alter policy payment_proof_storage_select on storage.objects using ((bucket_id = 'payment-proofs' and public.payment_proof_storage_object_authorized(name, false)) OR true)"],
    ["proof INSERT WITH CHECK OR true", "alter policy payment_proof_storage_insert on storage.objects with check ((bucket_id = 'payment-proofs' and public.payment_proof_storage_object_authorized(name, true)) OR true)"],
    ["NOT bucket", "alter policy public_assets_select on storage.objects using (NOT (bucket_id = 'public-assets'))"],
    ["public-assets broadened USING", "alter policy public_assets_update on storage.objects using (true)"],
    ["public-assets broadened explicit WITH CHECK", "alter policy public_assets_update on storage.objects with check (true)"],
    ["role broadening", "alter policy listing_media_select on storage.objects to public"],
    ["unexpected PUBLIC read", "create policy unexpected on storage.objects for select to public using (true)"],
    ["unexpected anon read", "create policy unexpected on storage.objects for select to anon using (true)"],
    ["unexpected authenticated read", "create policy unexpected on storage.objects for select to authenticated using (true)"],
    ["command mutation", "drop policy public_assets_select on storage.objects; create policy public_assets_select on storage.objects for all to anon, authenticated using (bucket_id = 'public-assets')"],
    ["public bucket", "update storage.buckets set public = true where id = 'payment-proofs'"],
  ])("rejects Storage mutation through the full executable postflight: %s", async (_name, sql) => {
    await db.exec(sql);
    await expect(db.exec(postflight)).rejects.toThrow("Feature 017 postflight failed");
  });

  it.each([
    ["extra permissive policy", "create policy unexpected on public.payment_proofs for select to authenticated using (true)"],
    ["role broadening", "alter policy payment_proofs_read on public.payment_proofs to public"],
    ["command mutation", "drop policy payment_proofs_read on public.payment_proofs; create policy payment_proofs_read on public.payment_proofs for all to authenticated using (true)"],
    ["restrictive mode changed", "drop policy mfa_gate_payment_proofs on public.payment_proofs; create policy mfa_gate_payment_proofs on public.payment_proofs for select to authenticated using (public.mfa_satisfied())"],
  ])("rejects complete payment_proofs manifest mutation: %s", async (_name, sql) => {
    await db.exec(sql);
    await expect(db.exec(postflight)).rejects.toThrow("payment_proofs policy manifest mismatch");
  });

  it("preserves the AND/OR/NOT tree and detects removing either required conjunct", async () => {
    const base = policy("public_assets_update").using_expr!;
    for (const mutation of [
      `(${base}) OR true`, `true OR (${base})`, `NOT (${base})`,
      "bucket_id = 'public-assets'", "public.public_asset_object_authorized(name, 'write')", "true",
    ]) {
      await db.exec("savepoint mutation;");
      await db.exec(`alter policy public_assets_update on storage.objects using (${mutation});`);
      await expect(db.exec(postflight)).rejects.toThrow("Storage policy manifest mismatch");
      await db.exec("rollback to savepoint mutation;");
    }
  });

  it("reads F010/F015 policy statements intact rather than comparing F017 constants with themselves", async () => {
    const statements = await historicalPolicyStatements();
    expect(statements.some(sql => sql.includes("public_asset_object_authorized(name, 'write')"))).toBe(true);
    expect(statements.some(sql => sql.includes("public.organization_can_buy(o.buyer_organization_id)"))).toBe(true);
    expect(policy("payment_proofs_read").using_expr).toContain("public.organization_can_buy(o.buyer_organization_id)");
  });

  it("requires a checked T023 to have an independently correct executable postflight after recorded remote closure", async () => {
    const tasks = readFileSync("specs/017-stripe-runtime-retirement/tasks.md", "utf8");
    for (let number = 36; number <= 46; number++) {
      expect(tasks).toContain(`- [x] T${String(number).padStart(3, "0")} `);
    }
    for (let number = 47; number <= 49; number++) {
      expect(tasks).toContain(`- [x] T${String(number).padStart(3, "0")} `);
    }
    if (tasks.includes("- [x] T023 ")) {
      assertHistoricalPolicyManifest(postflight, historical);
      await expect(db.exec(postflight)).resolves.toBeDefined();
    } else {
      expect(tasks).toContain("- [ ] T023 ");
    }
  });
});

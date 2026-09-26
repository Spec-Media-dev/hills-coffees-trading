import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { T049, T049_EXISTING, buildT049ProofSql } from "./t049-pricing-inputs-proof";

/**
 * Feature 013 T049 (MP-6) — LIVE proof of M2d against the linked project (gated: F013_LIVE=1; nothing else runs).
 *
 * 1. The whole database proof is ONE rolled-back transaction (see `t049-pricing-inputs-proof.ts`, the T037/T043 method):
 *    CHECKs, generated funding_source, and anon/buyer/seller/admin access are exercised with fixture rows that never
 *    survive. Read-only state queries before and after prove production is exactly as before.
 * 2. The real anonymous API path: read-only PostgREST requests with the publishable (anon) key must reach 0 rows of the
 *    three pricing tables.
 */

const LIVE = process.env.F013_LIVE === "1";
const LINKED_REF = "mxejnutukgxyccnohglo";
const IDS = Object.values(T049).map((id) => `'${id}'`).join(", ");

function cli(args: string[]): string {
  try {
    return execFileSync("npx", ["supabase", ...args], { encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  }
}
/** Runs SQL from a temp file (a multi-line argument does not survive the Windows shell). */
function runSqlFile(sql: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "t049-"));
  const file = path.join(dir, "query.sql");
  try {
    writeFileSync(file, sql);
    return cli(["db", "query", "--linked", "-f", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function query<T = Record<string, unknown>>(sql: string): T[] {
  const out = runSqlFile(sql);
  const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { rows?: T[] };
  if (!json.rows) throw new Error(`query failed: ${out.slice(0, 500)}`);
  return json.rows;
}
function env(name: string): string {
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env.local`);
  return line.slice(name.length + 1).replace(/^"|"$/g, "");
}

type CaseResult = { case: string; ok: boolean; got: string | null };
const STATE_SQL = `select
  (select count(*) from public.offer_price_tiers)::int as tiers,
  (select count(*) from public.promotions)::int as promotions,
  (select count(*) from public.promotion_targets)::int as targets,
  (select count(*) from public.audit_logs where entity_type = 'promotions' or entity_id in (${IDS}))::int as promotion_audit_rows,
  (select count(*) from public.platform_admins where user_id = '${T049_EXISTING.sellerUser}')::int as seller_admin_rows,
  (select count(*) from public.organization_members where organization_id = '${T049_EXISTING.hillsOrg}' and user_id = '${T049_EXISTING.sellerUser}')::int as seller_hills_membership,
  (select count(*) from public.coffee_offers)::int as offers,
  (select md5(string_agg(id::text || status || is_visible::text || reserved_quantity_kg::text, '|' order by id)) from public.coffee_offers) as offers_fingerprint,
  (select count(*) from public.organization_members)::int as memberships,
  (select count(*) from public.platform_admins)::int as platform_admins,
  (select bank_transfer_checkout_enabled from public.commerce_settings) as checkout_enabled`;

describe.skipIf(!LIVE)("T049 — M2d live proof (one rolled-back transaction + anon API probe; F013_LIVE=1)", () => {
  let results: CaseResult[] = [];

  it("runs against the verified linked project and leaves production unchanged", () => {
    expect(readFileSync("supabase/.temp/project-ref", "utf8").trim()).toBe(LINKED_REF);
    const before = query(STATE_SQL)[0]!;
    expect(before).toMatchObject({ tiers: 0, promotions: 0, targets: 0, promotion_audit_rows: 0, seller_admin_rows: 0, seller_hills_membership: 0, checkout_enabled: false });
    const raw = runSqlFile(buildT049ProofSql());
    const match = /T049_RESULT:([A-Za-z0-9+/=]+)/.exec(raw);
    expect(match, raw.slice(0, 2000)).not.toBeNull();
    results = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf8")) as CaseResult[];
    const after = query(STATE_SQL)[0]!;
    expect(after, "production state after the proof equals the state before it").toEqual(before);
  }, 400_000);

  it("every proof case passed (CHECKs, generated funding_source, anon/buyer/seller/admin access, code hiding, no client writes, redacted audit)", () => {
    expect(results.length).toBeGreaterThanOrEqual(50);
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
    const names = results.map((r) => r.case);
    for (const fragment of ["ANON: reading offer_price_tiers", "ANON: reading promotions", "ANON: reading promotion_targets", "FUNDING: inserting an explicit funding_source",
                            "FUNDING: updating funding_source", "CHECK: PERCENT 101", "CHECK: starts_at = ends_at", "CHECK: a SELLER promotion without", "BUYER:", "SELLER:", "ADMIN:",
                            "CODE: the owning seller cannot read", "WRITE: service_role cannot INSERT"]) {
      expect(names.some((n) => n.includes(fragment)), fragment).toBe(true);
    }
  });

  it("the real anonymous API path reaches 0 rows of tiers, promotions and targets (publishable key, read-only)", async () => {
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    for (const table of ["offer_price_tiers", "promotions", "promotion_targets"]) {
      const response = await fetch(`${url}/rest/v1/${table}?select=id`, { headers: { apikey: key } });
      const body = (await response.json()) as unknown;
      const rows = Array.isArray(body) ? body : [];
      expect(rows, `${table}: ${response.status} ${JSON.stringify(body).slice(0, 200)}`).toEqual([]);
      expect(response.ok, `${table}: anon must be refused, got ${response.status}`).toBe(false);
    }
  }, 60_000);
});

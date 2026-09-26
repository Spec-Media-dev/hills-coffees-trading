import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { T055, T055_EXISTING, buildT055ProofSql } from "./t055-outbox-proof";

/**
 * Feature 013 T055 (MP-6) — LIVE proof of M2e against the linked project (gated: F013_LIVE=1; nothing else runs).
 *
 * 1. The whole database proof is ONE rolled-back transaction (see `t055-outbox-proof.ts`, the T037/T043/T049 method):
 *    dedupe, the owner-run definer emit path, client/service_role refusal, params/catalogue/immutability CHECKs. Read-only
 *    state queries before and after prove production is exactly as before.
 * 2. The real anonymous API path: read-only / refused PostgREST requests with the publishable (anon) key. The RPC probe
 *    uses an event_type outside the catalogue, so even an unexpected EXECUTE grant could not persist a row.
 */

const LIVE = process.env.F013_LIVE === "1";
const LINKED_REF = "mxejnutukgxyccnohglo";
const EMIT = "public.emit_notification_event(text,text,uuid,text,jsonb,text,jsonb)";

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
  const dir = mkdtempSync(path.join(tmpdir(), "t055-"));
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
  (select count(*) from public.notification_events)::int as outbox_events,
  (select count(*) from public.audit_logs)::int as audit_logs,
  (select max(id) from public.audit_logs)::text as audit_max_id,
  (select count(*) from public.platform_admins)::int as platform_admins,
  (select count(*) from public.platform_admins where user_id = '${T055_EXISTING.sellerUser}')::int as seller_admin_rows,
  (select count(*) from public.organization_members)::int as memberships,
  (select count(*) from public.orders)::int as orders,
  (select count(*) from public.notifications)::int as notifications,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace)::int as public_functions,
  (select count(*) from pg_proc where proname like '__t055%')::int as temp_functions,
  (select md5(prosrc) || coalesce(proacl::text, '') from pg_proc where oid = '${EMIT}'::regprocedure) as emitter_fingerprint,
  (select coalesce(relacl::text, '') from pg_class where oid = 'public.notification_events'::regclass) as outbox_acl,
  (select bank_transfer_checkout_enabled from public.commerce_settings) as checkout_enabled`;

describe.skipIf(!LIVE)("T055 — M2e live proof (one rolled-back transaction + anon API probe; F013_LIVE=1)", () => {
  let results: CaseResult[] = [];

  it("runs against the verified linked project and leaves production unchanged", () => {
    expect(readFileSync("supabase/.temp/project-ref", "utf8").trim()).toBe(LINKED_REF);
    const before = query(STATE_SQL)[0]!;
    expect(before).toMatchObject({ outbox_events: 0, seller_admin_rows: 0, temp_functions: 0, checkout_enabled: false });
    const raw = runSqlFile(buildT055ProofSql());
    const match = /T055_RESULT:([A-Za-z0-9+/=]+)/.exec(raw);
    expect(match, raw.slice(0, 2000)).not.toBeNull();
    results = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf8")) as CaseResult[];
    const after = query(STATE_SQL)[0]!;
    expect(after, "production state after the proof equals the state before it").toEqual(before);
  }, 400_000);

  it("every proof case passed (dedupe, definer emit path, no client/service_role access, params/catalogue/immutability)", () => {
    expect(results.length).toBeGreaterThanOrEqual(55);
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
    const names = results.map((r) => r.case);
    for (const fragment of ["DEDUPE: a second emit", "DEDUPE: exactly one event", "DEDUPE: the unique constraint", "INTERNAL: an authenticated buyer calling", "INTERNAL: the buyer who triggered",
                            "ANON: SELECT", "ANON: EXECUTE emit_notification_event", "BUYER (authenticated): SELECT", "BUYER (authenticated): EXECUTE", "SELLER (authenticated): EXECUTE",
                            "PLATFORM ADMIN (authenticated, temporary grant): SELECT", "SERVICE_ROLE: SELECT", "SERVICE_ROLE: INSERT", "SERVICE_ROLE: EXECUTE",
                            "PARAMS: a bank identifier", "PARAMS: a proof path", "PARAMS: a free-text finance note", "PARAMS: an array", "SECRETS: no refused value", "IMMUTABLE:"]) {
      expect(names.some((n) => n.includes(fragment)), fragment).toBe(true);
    }
  });

  it("the real anonymous API path cannot read the outbox or call the emitter (publishable key)", async () => {
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const key = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    const read = await fetch(`${url}/rest/v1/notification_events?select=id`, { headers: { apikey: key } });
    const readBody = (await read.json()) as unknown;
    expect(Array.isArray(readBody) ? readBody : [], `read: ${read.status} ${JSON.stringify(readBody).slice(0, 200)}`).toEqual([]);
    expect(read.ok, `anon read must be refused, got ${read.status}`).toBe(false);
    const rpc = await fetch(`${url}/rest/v1/rpc/emit_notification_event`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_event_type: "t055.probe", p_aggregate_type: "order", p_aggregate_id: T055.aggregateProbe, p_dedupe_key: "T055-anon-rpc",
                             p_audience: { rule: "none" }, p_template_key: "t055_probe", p_params: {} }),
    });
    const rpcBody = await rpc.text();
    expect(rpc.ok, `anon RPC must be refused, got ${rpc.status} ${rpcBody.slice(0, 200)}`).toBe(false);
    expect(rpcBody, "refused for lack of privilege / not exposed, never by the CHECK").not.toMatch(/notification_events_(event_type|template_key)_check/);
  }, 60_000);
});

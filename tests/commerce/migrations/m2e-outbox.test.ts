import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T051 (MP-2) — static and security tests for M2e
 * `supabase/migrations/20260925115000_feature_013_notification_outbox.sql`, its rollback and its postflight.
 * No database access. The live proof is T055 (`tests/commerce/outbox-table.live.test.ts`, after the OPERATOR apply).
 *
 * Accept (tasks.md T050): data-model §6.1; internal `emit_notification_event` (no client EXECUTE);
 * `UNIQUE(event_type, aggregate_id, dedupe_key)`; no client read. Expected values are read from data-model.md,
 * contracts/notification-provider.md, contracts/database-rpc.md and contracts/rls-storage.md, never from memory.
 */

const FILE = "20260925115000_feature_013_notification_outbox.sql";
const SPEC = "specs/013-bank-transfer-commerce-core";
const EMITTER = "public.emit_notification_event(text, text, uuid, text, jsonb, text, jsonb)";
const migrationRaw = readFileSync(`supabase/migrations/${FILE}`, "utf8").replace(/\r/g, "");
const rollbackRaw = readFileSync(`supabase/rollback/${FILE.replace(/\.sql$/, ".rollback.sql")}`, "utf8").replace(/\r/g, "");
const postflightRaw = readFileSync("supabase/maintenance/20260925_feature_013_notification_outbox_postflight.sql", "utf8");
const migration = normalize(stripComments(migrationRaw));
const migrationTop = normalize(maskStrings(stripDollarBodies(stripComments(migrationRaw))));
const rollbackTop = normalize(maskStrings(stripDollarBodies(stripComments(rollbackRaw))));
const rollback = normalize(stripComments(rollbackRaw));
/** Asserts `needle` occurs in an already-normalized (whitespace-collapsed, lower-cased) text. */
const contains = (haystack: string, needle: string, label?: string) => expect(haystack, label ?? needle).toContain(normalize(needle));

// ── expectations from the approved artifacts ─────────────────────────────────────────────────────────────────────
const dataModel = readFileSync(`${SPEC}/data-model.md`, "utf8").replace(/\r/g, "");
const provider = readFileSync(`${SPEC}/contracts/notification-provider.md`, "utf8").replace(/\r/g, "");
const rpc = readFileSync(`${SPEC}/contracts/database-rpc.md`, "utf8").replace(/\r/g, "");
const rlsStorage = readFileSync(`${SPEC}/contracts/rls-storage.md`, "utf8").replace(/\r/g, "");
const s61 = dataModel.slice(dataModel.indexOf("### 6.1"), dataModel.indexOf("### 6.2"));
const s61Columns = s61.slice(s61.indexOf("- Columns:"), s61.indexOf("- Constraints and indexes:"));
const DM_COLUMNS = [...new Set([...s61Columns.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.trim().split(/\s+/)[0]!).filter((n) => /^[a-z][a-z0-9_]*$/.test(n)))].sort();
const DM_STATUSES = [...s61Columns.matchAll(/`([A-Z]+)`/g)].map((m) => m[1]!).sort();
const catalogue = provider.slice(provider.indexOf("## 1. Event catalogue"), provider.indexOf("`params` allowlist"));
const catalogueRows = catalogue.split("\n").filter((l) => /^\| `/.test(l)).map((l) => l.split("|").map((c) => c.trim()));
const ticks = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
const CATALOGUE_EVENTS = catalogueRows.flatMap((r) => ticks(r[1]!)).sort();
const CATALOGUE_TEMPLATES = catalogueRows.flatMap((r) => ticks(r[4]!)).sort();
const CATALOGUE_AGGREGATES = [...new Set(catalogueRows.map((r) => r[2]!))].sort();

const tableColumns = () => {
  const body = /create table public\.notification_events \(([\s\S]*?)\n\);/.exec(migrationRaw)![1]!;
  return body.split("\n").map((line) => /^\s{2}([a-z_0-9]+) /.exec(line)?.[1]).filter((n): n is string => !!n && !["constraint", "primary"].includes(n)).sort();
};
const checkValues = (constraint: string) => {
  const m = new RegExp(`constraint ${constraint} check \\(\\w+ in \\(([^)]*)\\)\\)`).exec(migrationRaw);
  if (!m) throw new Error(`no ${constraint}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((v) => v[1]!).sort();
};
const emitterBody = () => normalize(/create or replace function public\.emit_notification_event\([\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(migrationRaw)![1]!);

/** M2e-specific invariants (the mutation cases prove each bites). */
function m2eViolations(raw: string): string[] {
  const sql = normalize(stripComments(raw));
  const top = normalize(maskStrings(stripDollarBodies(stripComments(raw))));
  const problems: string[] = [];
  const functions = [...raw.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]!.toLowerCase()).sort();
  if (JSON.stringify(functions) !== JSON.stringify(["emit_notification_event", "protect_notification_event"])) problems.push(`unexpected functions: ${functions.join(",")}`);
  // No client role may read (or write) the outbox; no policy.
  if (!/revoke all on table public\.notification_events from public, anon, authenticated, service_role;/.test(top)) problems.push("outbox not revoked from every API role");
  if (/grant [^;]* on (table )?public\.notification_events\b/.test(top)) problems.push("a grant on the outbox");
  if (/create policy \w+ on public\.notification_events\b/.test(top)) problems.push("a policy on the outbox");
  if (!/alter table public\.notification_events force row level security;/.test(top)) problems.push("RLS not forced");
  // Internal emitter: no EXECUTE for any API role, not SECURITY DEFINER, pinned search_path.
  if (!/revoke all on function public\.emit_notification_event\(text, text, uuid, text, jsonb, text, jsonb\) from public, anon, authenticated, service_role;/.test(top)) problems.push("emitter not revoked from every API role");
  if (/grant [^;]* on function public\.emit_notification_event\b/.test(top)) problems.push("EXECUTE granted on the emitter");
  const header = /create or replace function public\.emit_notification_event\([\s\S]*?as \$function\$/.exec(sql)?.[0] ?? "";
  if (/security definer/.test(header)) problems.push("the emitter is SECURITY DEFINER");
  if (!/set search_path = pg_catalog, public/.test(header)) problems.push("the emitter search_path is not pinned");
  const body = /create or replace function public\.emit_notification_event\([\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(sql)?.[1] ?? "";
  if (!/on conflict \(event_type, aggregate_id, dedupe_key\) do nothing/.test(body)) problems.push("the emitter is not INSERT … ON CONFLICT DO NOTHING");
  if (/\b(update|delete from)\b/.test(body)) problems.push("the emitter mutates existing events");
  if (!/constraint notification_events_dedupe_key unique \(event_type, aggregate_id, dedupe_key\)/.test(sql)) problems.push("dedupe UNIQUE missing");
  if (!/create index idx_notification_events_queue on public\.notification_events \(status, next_attempt_at\);/.test(top)) problems.push("queue index missing");
  // Params allow-list (never bank identifiers, proof paths, economics of others, free-text notes).
  const allowList = /constraint notification_events_params_check check \([\s\S]*?\(params - array\[([^\]]*)\]\) = '\{\}'::jsonb/.exec(raw)?.[1];
  if (allowList === undefined) problems.push("params are not allow-listed");
  else if (/iban|swift|bank|account|proof|path|note|reference|email|phone/i.test(allowList)) problems.push("a forbidden key in the params allow-list");
  // Nothing beyond the table + emitter: no delivery/claim function, no cron, no notifications change.
  if (/cron\./.test(top)) problems.push("pg_cron work");
  if (/\bpublic\.notifications\b|notification_deliveries|process_notification_events/.test(top)) problems.push("delivery/consumer work");
  return problems;
}

describe("T051 — M2e satisfies the generic MP-2 rules", () => {
  it("conventions: guard first, one transaction, RLS forced, no anon grant, no authenticated write grant, no config-table change, no top-level DML", () => {
    expect(conventionViolations(FILE, migrationRaw)).toEqual([]);
    expect(migrationTop).not.toMatch(/\b(insert into|update|delete from|truncate) public\./);
  });
  it("the postflight is a single read-only query that ends in an ALL CHECKS PASSED summary (13 checks)", () => {
    expect(postflightViolations(postflightRaw)).toEqual([]);
    expect(postflightRaw).toContain("'ALL CHECKS PASSED'");
    expect([...postflightRaw.matchAll(/^\s*select (\d+), '/gm)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
  });
  it("the M2e-specific invariants hold", () => {
    expect(m2eViolations(migrationRaw)).toEqual([]);
  });
  it.each([
    ["a SELECT grant on the outbox to authenticated", (s: string) => s.replace("revoke all on table public.notification_events from public, anon, authenticated, service_role;",
      "revoke all on table public.notification_events from public, anon, authenticated, service_role;\ngrant select on table public.notification_events to authenticated;")],
    ["a SELECT grant on the outbox to service_role", (s: string) => s.replace("revoke all on table public.notification_events from public, anon, authenticated, service_role;",
      "revoke all on table public.notification_events from public, anon, authenticated, service_role;\ngrant select on table public.notification_events to service_role;")],
    ["a read policy on the outbox", (s: string) => s.replace("alter table public.notification_events force row level security;",
      "alter table public.notification_events force row level security;\ncreate policy ne_read on public.notification_events for select to authenticated using (true);")],
    ["EXECUTE on the emitter for authenticated", (s: string) => s.replace(`revoke all on function ${EMITTER} from public, anon, authenticated, service_role;`,
      `revoke all on function ${EMITTER} from public, anon, authenticated, service_role;\ngrant execute on function ${EMITTER} to authenticated;`)],
    ["the emitter no longer revoked from service_role", (s: string) => s.replace(`revoke all on function ${EMITTER} from public, anon, authenticated, service_role;`, `revoke all on function ${EMITTER} from public, anon, authenticated;`)],
    ["the emitter as SECURITY DEFINER", (s: string) => s.replace("returns uuid\nlanguage plpgsql\n", "returns uuid\nlanguage plpgsql\nsecurity definer\n")],
    ["ON CONFLICT DO NOTHING removed", (s: string) => s.replace("  on conflict (event_type, aggregate_id, dedupe_key) do nothing\n", "")],
    ["the dedupe UNIQUE removed", (s: string) => s.replace("  constraint notification_events_dedupe_key unique (event_type, aggregate_id, dedupe_key),\n", "")],
    ["a bank key in the params allow-list", (s: string) => s.replace("'amount', 'currency']", "'amount', 'currency', 'bank_iban']")],
    ["a consumer function added in M2e", (s: string) => s.replace("-- 2. emit_notification_event", "create or replace function public.process_notification_events(p_limit int) returns int language sql as $function$ select 0 $function$;\n-- 2. emit_notification_event")],
    ["a cron schedule added in M2e", (s: string) => s.replace("\ncommit;", "\nselect cron.schedule('f013_process_outbox', '* * * * *', 'select 1');\ncommit;")],
  ])("mutation: %s is caught", (_label, mutate) => {
    const mutated = mutate(migrationRaw);
    expect(mutated).not.toBe(migrationRaw);
    expect(m2eViolations(mutated).length).toBeGreaterThan(0);
  });
});

describe("T051 — data-model §6.1 outbox", () => {
  it("notification_events has exactly the §6.1 columns", () => {
    expect(DM_COLUMNS).toHaveLength(16);
    expect(tableColumns()).toEqual(DM_COLUMNS);
  });
  it("status CHECK equals §6.1 (PENDING | PROCESSING | PROCESSED | FAILED), default PENDING; attempts >= 0", () => {
    expect(DM_STATUSES).toEqual(["FAILED", "PENDING", "PROCESSED", "PROCESSING"]);
    expect(checkValues("notification_events_status_check")).toEqual(DM_STATUSES);
    contains(migration, "status text not null default 'PENDING'");
    contains(migration, "attempts int not null default 0 constraint notification_events_attempts_check check (attempts >= 0)");
  });
  it("§6.1 constraints and index: UNIQUE(event_type, aggregate_id, dedupe_key); (status, next_attempt_at)", () => {
    expect(s61).toContain("`UNIQUE(event_type, aggregate_id, dedupe_key)`; index `(status, next_attempt_at)`");
    contains(migration, "constraint notification_events_dedupe_key unique (event_type, aggregate_id, dedupe_key)");
    contains(migrationTop, "create index idx_notification_events_queue on public.notification_events (status, next_attempt_at);");
  });
  it("event_type, template_key and aggregate_type CHECKs equal the notification-provider §1 catalogue", () => {
    expect(CATALOGUE_EVENTS).toHaveLength(17);
    expect(checkValues("notification_events_event_type_check")).toEqual(CATALOGUE_EVENTS);
    expect(CATALOGUE_TEMPLATES).toHaveLength(18);
    expect(checkValues("notification_events_template_key_check")).toEqual(CATALOGUE_TEMPLATES);
    expect(checkValues("notification_events_aggregate_type_check")).toEqual(CATALOGUE_AGGREGATES);
  });
  it("audience holds resolution rules (a JSON object), not user lists; params are allow-listed scalars", () => {
    expect(s61Columns).toContain("`audience jsonb` (resolution rules, not user lists)");
    contains(migration, "constraint notification_events_audience_check check (jsonb_typeof(audience) = 'object')");
    expect(provider).toContain("There are never bank identifiers, proof paths, other parties' economics or free-text finance notes.");
    contains(migration, "(params - array['order_code', 'proforma_code', 'case_code', 'shipment_code', 'status_key', 'deadline', 'amount', 'currency']) = '{}'::jsonb");
    // strict: in lax mode `$.*` unwraps an array value into its elements, so an array would pass as scalars.
    contains(migration, "not jsonb_path_exists(params, 'strict $.* ? (@.type() == \"object\" || @.type() == \"array\")')");
  });
  it("last_error is bounded (sanitized codes only); claims are paired; PROCESSED iff processed_at", () => {
    contains(migration, "constraint notification_events_last_error_check check (char_length(last_error) <= 500)");
    contains(migration, "constraint notification_events_claim_pair_check check ((claimed_at is null) = (claimed_by is null))");
    contains(migration, "((processed_at is not null) = (status = 'PROCESSED'))");
  });
  it("identity and content are frozen once queued; only the processing columns may change", () => {
    const body = normalize(/create or replace function public\.protect_notification_event\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(migrationRaw)![1]!);
    contains(body, "array['status', 'attempts', 'next_attempt_at', 'claimed_at', 'claimed_by', 'processed_at', 'last_error']");
    contains(body, "raise exception 'notification_event_immutable'");
    contains(migrationTop, "create trigger trg_notification_events_immutable before update on public.notification_events for each row execute function public.protect_notification_event();");
  });
});

describe("T051 — no client read; internal emitter only (rls-storage §1/§4, database-rpc)", () => {
  it("rls-storage says: SELECT none for clients, no writes; the emitter belongs to 'Nobody'", () => {
    expect(rlsStorage).toContain("| `notification_events` | none (F ∨ PA via the admin outbox view only) | none |");
    expect(rlsStorage).toMatch(/- Nobody: [^\n]*`emit_notification_event`/);
  });
  it("the outbox: RLS enabled + forced, no policy, every API role revoked, no grant at all", () => {
    contains(migrationTop, "alter table public.notification_events enable row level security;");
    contains(migrationTop, "alter table public.notification_events force row level security;");
    contains(migrationTop, "revoke all on table public.notification_events from public, anon, authenticated, service_role;");
    expect(migrationTop).not.toMatch(/grant [^;]* on (table )?public\.notification_events\b/);
    expect(migrationTop).not.toMatch(/create policy/);
  });
  it("database-rpc: emit_notification_event(p_event_type, p_aggregate_type, p_aggregate_id, p_dedupe_key, p_audience, p_template_key, p_params) = INSERT … ON CONFLICT DO NOTHING", () => {
    expect(rpc).toContain("`emit_notification_event(p_event_type text, p_aggregate_type text, p_aggregate_id uuid, p_dedupe_key text, p_audience jsonb, p_template_key text, p_params jsonb)` | none (internal) | `INSERT ... ON CONFLICT DO NOTHING`.");
    contains(migration, "create or replace function public.emit_notification_event( p_event_type text, p_aggregate_type text, p_aggregate_id uuid, p_dedupe_key text, p_audience jsonb, p_template_key text, p_params jsonb ) returns uuid language plpgsql set search_path = pg_catalog, public as");
    const body = emitterBody();
    contains(body, "on conflict (event_type, aggregate_id, dedupe_key) do nothing returning id into v_id;");
    expect(body).not.toMatch(/\b(update|delete)\b/);
  });
  it("no EXECUTE on the emitter for public, anon, authenticated or service_role; SECURITY INVOKER (owner-only)", () => {
    contains(migrationTop, `revoke all on function ${EMITTER} from public, anon, authenticated, service_role;`);
    expect(migrationTop).not.toMatch(/grant [^;]* on function public\.emit_notification_event\b/);
    expect(/create or replace function public\.emit_notification_event\([\s\S]*?as \$function\$/.exec(migration)![0]).not.toContain("security definer");
    expect(migrationTop).not.toContain("security definer");
  });
  it("M2e adds no delivery, provider, claim or cron work and changes no existing object", () => {
    expect(migrationTop).not.toMatch(/cron\./);
    expect(migrationTop).not.toMatch(/notification_deliveries|public\.notifications\b|process_notification_events|claim_notification|campaign/);
    expect(migrationTop).not.toMatch(/alter table public\.(?!notification_events\b)\w+/);
    expect(migrationTop).not.toMatch(/(drop|alter) (policy|trigger|function)|drop table/);
    expect(migrationTop).not.toMatch(/create trigger \w+ [^;]* on public\.(?!notification_events\b)\w+/);
  });
});

describe("T051 — guard and preservation", () => {
  it("the guard pins M1/M2b, requires M2a–M2d, refuses on the kill switch / an existing M2e object / a non-bypass role", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
    for (const probe of ["'603d04c58bbcf987c38e2aa6f7d73d9b'", "'286e02091213c1be4236b144dff1f383'", "to_regclass('public.delivery_destinations') is null",
                         "to_regclass('public.proforma_line_economics') is null", "to_regclass('public.reconciliation_cases') is null",
                         "to_regclass('public.promotions') is null", "to_regclass('public.offer_price_tiers') is null",
                         "bank_transfer_checkout_enabled", "an m2e object already exists", "rolbypassrls"]) {
      expect(guard, probe).toContain(probe);
    }
  });
});

describe("T051 — the rollback removes exactly M2e", () => {
  it("drops the table, the immutability trigger function and the emitter — nothing else", () => {
    const drops = [...rollbackTop.matchAll(/drop (table|function|sequence) (public\.\w+(?:\([^)]*\))?)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(drops).toEqual(["table public.notification_events", "function public.protect_notification_event()", `function ${EMITTER}`]);
    expect(rollbackTop).not.toMatch(/\b(alter|create|grant)\b/);
  });
  it("refuses (changing nothing) while any event exists, another function/view references the outbox, or M3+ is applied", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(rollback)![0];
    expect(rollback.startsWith("begin; do $guard$")).toBe(true);
    for (const probe of ["select exists (select 1 from public.notification_events)", "p.prosrc like '%emit_notification_event%'", "from pg_views",
                         "'is_order_buyer_member'", "'compute_order_quote'", "raise exception"]) {
      contains(guard, probe);
    }
  });
  it("the M2d rollback already refuses while M2e is applied (rollbacks run newest first)", () => {
    expect(normalize(readFileSync("supabase/rollback/20260925112000_feature_013_pricing_inputs.rollback.sql", "utf8"))).toContain("to_regclass('public.notification_events') is not null");
  });
});

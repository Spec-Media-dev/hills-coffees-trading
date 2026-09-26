import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T045 (MP-2) — static and security tests for M2d
 * `supabase/migrations/20260925112000_feature_013_pricing_inputs.sql`, its rollback and its postflight.
 * No database access. The live proof is T049 (`tests/commerce/pricing-inputs.live.test.ts`, after the OPERATOR apply).
 *
 * Accept (tasks.md T044): data-model §3.8 tables + CHECKs (types, PERCENT ≤ 100, window, scope ↔ seller, generated
 * funding_source); RLS per rls-storage §1 (tiers never anon; promotion codes hidden); tables only, no RPCs. Expected values
 * are read from data-model.md, contracts/rls-storage.md, research.md and the approved schema report, never from memory.
 */

const FILE = "20260925112000_feature_013_pricing_inputs.sql";
const SPEC = "specs/013-bank-transfer-commerce-core";
const migrationRaw = readFileSync(`supabase/migrations/${FILE}`, "utf8").replace(/\r/g, "");
const rollbackRaw = readFileSync(`supabase/rollback/${FILE.replace(/\.sql$/, ".rollback.sql")}`, "utf8").replace(/\r/g, "");
const postflightRaw = readFileSync("supabase/maintenance/20260925_feature_013_pricing_inputs_postflight.sql", "utf8");
const migration = normalize(stripComments(migrationRaw));
const migrationTop = normalize(maskStrings(stripDollarBodies(stripComments(migrationRaw))));
const rollbackTop = normalize(maskStrings(stripDollarBodies(stripComments(rollbackRaw))));
const rollback = normalize(stripComments(rollbackRaw));
/** Asserts `needle` occurs in an already-normalized (whitespace-collapsed, lower-cased) text. */
const contains = (haystack: string, needle: string, label?: string) => expect(haystack, label ?? needle).toContain(normalize(needle));

// ── expectations from the approved artifacts ─────────────────────────────────────────────────────────────────────
const dataModel = readFileSync(`${SPEC}/data-model.md`, "utf8").replace(/\r/g, "");
const rlsStorage = readFileSync(`${SPEC}/contracts/rls-storage.md`, "utf8").replace(/\r/g, "");
const s38 = dataModel.slice(dataModel.indexOf("### 3.8"), dataModel.indexOf("## 4. Reservation"));
const identifiers = (text: string) =>
  [...new Set([...text.matchAll(/`([^`]+)`/g)].flatMap((m) => m[1]!.split("/").map((p) => p.trim().split(/\s+/)[0]!)).filter((n) => /^[a-z][a-z0-9_]*$/.test(n)))].sort();
const upper = (text: string) => [...new Set([...text.matchAll(/`([A-Z][A-Z_]+)`/g)].map((m) => m[1]!))].sort();
const tiersPara = s38.slice(s38.indexOf("**`offer_price_tiers`**"), s38.indexOf("`UNIQUE(offer_id"));
const DM_TIER_COLUMNS = identifiers(tiersPara.replace("**`offer_price_tiers`**", "")).filter((n) => n !== "coffee_offers");
const promotionsTable = s38.slice(s38.indexOf("**`promotions`**"), s38.indexOf("**`promotion_targets`**"));
const DM_PROMOTION_COLUMNS = promotionsTable.split("\n").filter((l) => /^\| `/.test(l)).flatMap((l) => identifiers(l.split("|")[1]!)).sort();
const rowOf = (column: string) => promotionsTable.split("\n").find((l) => l.startsWith(`| \`${column}\``))!;
const targetsPara = s38.slice(s38.indexOf("**`promotion_targets`**"), s38.indexOf("Configuration validation"));
const DM_TARGET_COLUMNS = identifiers(targetsPara.replace("**`promotion_targets`**", ""));
const DM_TARGET_KINDS = upper(targetsPara);
const rlsRow = (table: string) => rlsStorage.split("\n").find((l) => l.startsWith(`| \`${table}\``) || l.includes(`\`${table}\`,`) && l.startsWith("| `promotions`"))!;

// production's coffee_offers member read predicate (docs/database/database-schema-report.json)
const report = JSON.parse(JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"))[0].database_schema_report) as {
  rls_policies: { table_name: string; policy_name: string; using_expression: string | null }[];
};
const memberRead = report.rls_policies.find((p) => p.table_name === "coffee_offers" && p.policy_name === "member_read_published_offers")!;

const tableColumns = (table: string) => {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(migrationRaw)![1]!;
  return body.split("\n").map((line) => /^\s{2}([a-z_0-9]+) /.exec(line)?.[1]).filter((n): n is string => !!n && !["constraint", "primary"].includes(n)).sort();
};
const checkValues = (constraint: string) => {
  const m = new RegExp(`constraint ${constraint} check \\(\\w+ in \\(([^)]*)\\)\\)`).exec(migrationRaw);
  if (!m) throw new Error(`no ${constraint}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((v) => v[1]!).sort();
};
const NEW_TABLES = ["offer_price_tiers", "promotions", "promotion_targets"];
const policyOf = (name: string) => new RegExp(`create policy ${name} on public\\.\\w+ ([\\s\\S]*?);`).exec(migration)![0];

/** M2d-specific invariants (the mutation cases prove each bites). */
function m2dViolations(raw: string): string[] {
  const sql = normalize(stripComments(raw));
  const top = normalize(maskStrings(stripDollarBodies(stripComments(raw))));
  const problems: string[] = [];
  const functions = [...raw.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]!.toLowerCase()).sort();
  if (JSON.stringify(functions) !== JSON.stringify(["next_promotion_code_ref", "write_audit_log_promotions"])) problems.push(`functions other than the code generator/audit: ${functions.join(",")}`);
  for (const m of top.matchAll(/grant ([^;]*?) on (?:table )?public\.(offer_price_tiers|promotions|promotion_targets) to ([^;]*?);/g)) {
    const [privileges, table, roles] = [m[1]!.trim(), m[2]!, m[3]!.trim()];
    if (/\b(anon|public)\b/.test(roles)) problems.push(`${table}: grant to ${roles}`);
    if (!/^select(\s*\([a-z0-9_,\s]+\))?$/.test(privileges)) problems.push(`${table}: non-select grant ${privileges}`);
    if (table === "promotions" && /\bauthenticated\b/.test(roles) && (privileges === "select" || /\bcode\b/.test(privileges))) problems.push("promotions.code granted to authenticated");
  }
  for (const t of NEW_TABLES) {
    if (!new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated, service_role;`).test(top)) problems.push(`${t}: not revoked from every API role`);
    if (!new RegExp(`alter table public\\.${t} force row level security;`).test(top)) problems.push(`${t}: RLS not forced`);
  }
  for (const m of top.matchAll(/create policy (\w+) on public\.\w+ for (\w+) to ([^ ]+) /g)) {
    if (m[2] !== "select" || m[3] !== "authenticated") problems.push(`policy ${m[1]}: ${m[2]} to ${m[3]}`);
  }
  if (!/funding_source text generated always as \(case scope when 'platform' then 'hills' else 'seller' end\) stored/.test(sql)) problems.push("funding_source is not generated from scope");
  if (!/constraint promotions_percent_check check \(discount_type <> 'percent' or value <= 100\)/.test(sql)) problems.push("PERCENT <= 100 missing");
  if (!/constraint promotions_window_check check \(starts_at < ends_at\)/.test(sql)) problems.push("window check missing");
  if (!/constraint promotions_scope_seller_check check \(\(scope = 'seller'\) = \(seller_organization_id is not null\)\)/.test(sql)) problems.push("scope ↔ seller check missing");
  const audit = /create or replace function public\.write_audit_log_promotions\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(sql)?.[1] ?? "";
  if (/to_jsonb\(|'code', (new|old)\.code\b/.test(audit)) problems.push("the audit copies the code");
  if (/execute function public\.write_audit_log\(\)/.test(top)) problems.push("a generic audit trigger");
  return problems;
}

describe("T045 — M2d satisfies the generic MP-2 rules", () => {
  it("conventions: guard first, one transaction, RLS forced, no anon grant, no authenticated write grant, no config-table change, no top-level DML", () => {
    expect(conventionViolations(FILE, migrationRaw)).toEqual([]);
    expect(migrationTop).not.toMatch(/\b(insert into|update|delete from|truncate) public\./);
  });
  it("the postflight is a single read-only query that ends in an ALL CHECKS PASSED summary (18 rows)", () => {
    expect(postflightViolations(postflightRaw)).toEqual([]);
    expect(postflightRaw).toContain("'ALL CHECKS PASSED'");
    expect([...postflightRaw.matchAll(/^\s*select (\d+), '/gm)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });
  it("the M2d-specific invariants hold", () => {
    expect(m2dViolations(migrationRaw)).toEqual([]);
  });
  it.each([
    ["the code column granted to authenticated", (s: string) => s.replace("grant select (id, promotion_code_ref, scope,", "grant select (id, code, promotion_code_ref, scope,")],
    ["a table-wide promotions SELECT for authenticated", (s: string) => s.replace(/grant select \(id, promotion_code_ref[\s\S]*?on table public\.promotions to authenticated;/, "grant select on table public.promotions to authenticated;")],
    ["a tier grant to anon", (s: string) => s.replace("grant select on table public.offer_price_tiers to authenticated;", "grant select on table public.offer_price_tiers to authenticated, anon;")],
    ["a client write grant", (s: string) => s.replace("grant select on table public.promotion_targets to authenticated;", "grant select, insert on table public.promotion_targets to authenticated;")],
    ["a policy open to public", (s: string) => s.replace("create policy offer_price_tiers_read on public.offer_price_tiers\n  for select to authenticated", "create policy offer_price_tiers_read on public.offer_price_tiers\n  for select to public")],
    ["funding_source as a writable column", (s: string) => s.replace("funding_source text generated always as (case scope when 'PLATFORM' then 'HILLS' else 'SELLER' end) stored", "funding_source text not null")],
    ["PERCENT <= 100 removed", (s: string) => s.replace("constraint promotions_percent_check check (discount_type <> 'PERCENT' or value <= 100),", "")],
    ["an RPC added in M2d", (s: string) => s.replace("-- 5. RLS and grants", "create or replace function public.upsert_seller_promotion() returns void language sql as $function$ select 1 $function$;\n-- 5. RLS and grants")],
    ["the audit copying the code", (s: string) => s.replace("'updated_at', new.updated_at, 'code_present', new.code is not null);", "'updated_at', new.updated_at, 'code_present', new.code is not null, 'code', new.code);")],
    ["a generic audit trigger", (s: string) => s.replace("execute function public.write_audit_log_promotions();", "execute function public.write_audit_log();")],
  ])("mutation: %s is caught", (_label, mutate) => {
    const mutated = mutate(migrationRaw);
    expect(mutated).not.toBe(migrationRaw);
    expect(m2dViolations(mutated).length).toBeGreaterThan(0);
  });
});

describe("T045 — data-model §3.8 tables", () => {
  it("offer_price_tiers has exactly the §3.8 columns; threshold > 0, price >= 0, USD, UNIQUE(offer_id, min_quantity_kg)", () => {
    expect(DM_TIER_COLUMNS).toEqual(["created_at", "created_by", "currency", "id", "min_quantity_kg", "offer_id", "price_per_kg"]);
    expect(tableColumns("offer_price_tiers")).toEqual(DM_TIER_COLUMNS);
    expect(s38).toContain("`min_quantity_kg numeric(14,3) > 0`, `price_per_kg numeric(14,2) ≥ 0`");
    contains(migration, "min_quantity_kg numeric(14,3) not null constraint offer_price_tiers_min_quantity_check check (min_quantity_kg > 0)");
    contains(migration, "price_per_kg numeric(14,2) not null constraint offer_price_tiers_price_check check (price_per_kg >= 0)");
    contains(migration, "constraint offer_price_tiers_offer_threshold_key unique (offer_id, min_quantity_kg)");
    contains(migration, "constraint offer_price_tiers_currency_check check (currency = 'USD')");
  });
  it("promotions has exactly the §3.8 columns", () => {
    expect(DM_PROMOTION_COLUMNS).toHaveLength(16);
    expect(tableColumns("promotions")).toEqual(DM_PROMOTION_COLUMNS);
  });
  it("promotion CHECK sets equal §3.8: scope, discount_type (v1 only), status", () => {
    expect(checkValues("promotions_scope_check")).toEqual(upper(rowOf("scope")));
    expect(checkValues("promotions_discount_type_check")).toEqual(upper(rowOf("discount_type")));
    expect(checkValues("promotions_status_check")).toEqual(["ACTIVE", "ARCHIVED", "DRAFT", "ENDED", "PAUSED", "SCHEDULED"]);
    expect(rowOf("status")).toContain("`DRAFT`/`SCHEDULED`/`ACTIVE`/`PAUSED`/`ENDED`/`ARCHIVED`");
  });
  it("value > 0 and PERCENT <= 100; starts_at < ends_at; SELLER iff seller_organization_id", () => {
    expect(rowOf("value")).toContain("CHECK `discount_type <> 'PERCENT' OR value <= 100`");
    expect(rowOf("starts_at")).toContain("CHECK `starts_at < ends_at`");
    expect(rowOf("seller_organization_id")).toContain("NOT NULL iff `SELLER`");
    contains(migration, "value numeric(14,4) not null constraint promotions_value_check check (value > 0)");
    contains(migration, "constraint promotions_percent_check check (discount_type <> 'PERCENT' or value <= 100)");
    contains(migration, "constraint promotions_window_check check (starts_at < ends_at)");
    contains(migration, "constraint promotions_scope_seller_check check ((scope = 'SELLER') = (seller_organization_id is not null))");
  });
  it("funding_source is GENERATED from scope exactly as §3.8 states (FIN-011)", () => {
    expect(rowOf("funding_source")).toContain("generated as `CASE scope WHEN 'PLATFORM' THEN 'HILLS' ELSE 'SELLER' END` (FIN-011)");
    contains(migration, "funding_source text generated always as (case scope when 'PLATFORM' then 'HILLS' else 'SELLER' end) stored");
  });
  it("code: nullable, [A-Z0-9-]{1,40}, lower(code) unique among non-archived rows; PRM-<7> references", () => {
    expect(rowOf("code")).toContain("`lower(code)` unique among non-archived rows; `[A-Z0-9-]{1,40}`");
    contains(migration, "code text constraint promotions_code_check check (code ~ '^[A-Z0-9-]{1,40}$')");
    contains(migration, "create unique index uq_promotions_code_live on public.promotions (lower(code)) where code is not null and status <> 'ARCHIVED';");
    expect(rowOf("id")).toContain("`promotion_code_ref` (`PRM-<7>`)");
    contains(migration, "select 'PRM-' || lpad(nextval('public.promotion_code_ref_seq')::text, 7, '0');");
  });
  it("eligibility is derived, never cron-driven: the §3.8 predicate is the member read predicate; plan §3's index exists", () => {
    expect(rowOf("status")).toContain("a promotion is eligible iff `status IN ('SCHEDULED','ACTIVE') AND starts_at <= clock_timestamp() < ends_at`");
    contains(policyOf("promotions_read"), "scope = 'PLATFORM' and public.is_authorized_member() and status in ('SCHEDULED', 'ACTIVE') and starts_at <= now() and now() < ends_at");
    contains(migration, "create index idx_promotions_eligibility on public.promotions (scope, status, starts_at, ends_at);");
    expect(migrationTop).not.toMatch(/cron\./);
  });
  it("promotion_targets: the §3.8 columns (+ surrogate id), the four kinds, reference and uniqueness CHECKs", () => {
    expect(DM_TARGET_COLUMNS).toEqual(["coffee_id", "offer_id", "promotion_id", "target_kind"]);
    expect(tableColumns("promotion_targets")).toEqual([...DM_TARGET_COLUMNS, "id"].sort());
    expect(checkValues("promotion_targets_kind_check")).toEqual(DM_TARGET_KINDS);
    contains(migration, "(target_kind = 'OFFER') = (offer_id is not null) and (target_kind = 'COFFEE') = (coffee_id is not null)");
    contains(migration, "constraint promotion_targets_unique_key unique nulls not distinct (promotion_id, target_kind, offer_id, coffee_id)");
  });
});

describe("T045 — RLS per rls-storage §1: tiers never anon, promotion codes hidden, no client writes", () => {
  it("rls-storage §1 says what is enforced", () => {
    expect(rlsRow("offer_price_tiers")).toContain("**Never anon**");
    expect(rlsStorage).toContain("Code values are visible only to the creating scope and PA.");
  });
  it("anon: revoked from all three tables, no grant, every policy TO authenticated", () => {
    for (const t of NEW_TABLES) {
      contains(migrationTop, `revoke all on table public.${t} from public, anon, authenticated, service_role;`);
      contains(migrationTop, `alter table public.${t} force row level security;`);
    }
    expect(migrationTop).not.toMatch(/grant [^;]* to [^;]*\banon\b/);
    const policies = [...migrationTop.matchAll(/create policy (\w+) on public\.(\w+) for (\w+) to (\w+)/g)].map((m) => `${m[2]}.${m[1]}:${m[3]}:${m[4]}`).sort();
    expect(policies).toEqual(["offer_price_tiers.offer_price_tiers_read:select:authenticated", "promotion_targets.promotion_targets_read:select:authenticated", "promotions.promotions_read:select:authenticated"]);
  });
  it("tier read = production's coffee_offers.member_read_published_offers predicate ∨ own seller org ∨ platform admin", () => {
    expect(memberRead.using_expression).toBe("(is_authorized_member() AND (status = ANY (ARRAY['PUBLISHED'::text, 'PARTIALLY_FILLED'::text])) AND (is_visible = true) AND (deleted_at IS NULL) AND (((quantity_kg - filled_quantity_kg) - reserved_quantity_kg) > (0)::numeric))");
    const policy = policyOf("offer_price_tiers_read");
    for (const part of ["public.is_platform_admin()", "public.is_org_member(o.seller_organization_id)", "public.is_authorized_member()", "o.status in ('PUBLISHED', 'PARTIALLY_FILLED')",
                        "o.is_visible = true", "o.deleted_at is null", "o.quantity_kg - o.filled_quantity_kg - o.reserved_quantity_kg > 0"]) {
      contains(policy, part);
    }
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
    contains(guard, `qual = '${memberRead.using_expression!.replace(/'/g, "''")}'`);
  });
  it("promotion codes are hidden: authenticated receives every promotions column EXCEPT code; the rest SELECT only", () => {
    const grant = /grant select \(([^)]*)\) on table public\.promotions to authenticated;/.exec(migration)!;
    const granted = grant[1]!.split(",").map((c) => c.trim()).sort();
    expect(granted).toEqual(tableColumns("promotions").filter((c) => c !== "code"));
    expect(granted).not.toContain("code");
    expect(migrationTop).not.toMatch(/grant select on table public\.promotions to authenticated/);
    contains(migrationTop, "grant select on table public.offer_price_tiers to authenticated;");
    contains(migrationTop, "grant select on table public.promotion_targets to authenticated;");
  });
  it("promotions are read by authorized members only when eligible PLATFORM, by the own seller org, or by platform admins; targets follow their promotion", () => {
    const policy = policyOf("promotions_read");
    contains(policy, "public.is_platform_admin() or (scope = 'SELLER' and public.is_org_member(seller_organization_id))");
    contains(policyOf("promotion_targets_read"), "using (exists (select 1 from public.promotions p where p.id = promotion_targets.promotion_id))");
  });
  it("tables only: no RPC, no client or service_role write grant, no MFA gate or policy on another table", () => {
    const functions = [...migrationRaw.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]!.toLowerCase()).sort();
    expect(functions).toEqual(["next_promotion_code_ref", "write_audit_log_promotions"]);
    for (const m of migrationTop.matchAll(/grant ([^;]*?) on table public\.(\w+) to ([^;]*?);/g)) expect(m[1]!.trim(), m[0]).toMatch(/^select\b/);
    expect(migrationTop).not.toMatch(/create policy \w+ on public\.(?!offer_price_tiers|promotions|promotion_targets)\w+/);
    expect(migrationTop).not.toMatch(/as restrictive/);
  });
});

describe("T045 — audit, guard and preservation", () => {
  it("promotions are audited by a redacted allow-list (code as booleans only); no generic audit trigger", () => {
    const body = normalize(stripComments(/create or replace function public\.write_audit_log_promotions\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(migrationRaw)![1]!));
    expect(body).not.toMatch(/to_jsonb\(/);
    expect(body).not.toMatch(/'code', (new|old)\.code\b/);
    contains(body, "'code_present', new.code is not null");
    contains(body, "'code_changed', new.code is distinct from old.code");
    contains(body, "jsonb_build_object('redacted_fields', jsonb_build_array('code'), 'redaction', 'allow_list')");
    contains(migrationTop, "create trigger trg_audit_promotions after insert or update or delete on public.promotions for each row execute function public.write_audit_log_promotions();");
    expect(migrationTop).not.toContain("execute function public.write_audit_log()");
  });
  it("the guard pins M1/M2b, requires M2a–M2c, refuses on the kill switch / an existing M2d object", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
    for (const probe of ["'603d04c58bbcf987c38e2aa6f7d73d9b'", "'286e02091213c1be4236b144dff1f383'", "to_regclass('public.reconciliation_cases') is null",
                         "bank_transfer_checkout_enabled", "an m2d object already exists", "rolbypassrls"]) {
      expect(guard, probe).toContain(probe);
    }
  });
  it("M2d changes no existing object: no ALTER of an existing table, no policy/trigger/function outside the three new tables", () => {
    expect(migrationTop).not.toMatch(/alter table public\.(?!offer_price_tiers|promotions|promotion_targets)\w+/);
    expect(migrationTop).not.toMatch(/(drop|alter) (policy|trigger|function)/);
    expect(migrationTop).not.toMatch(/create trigger \w+ [^;]* on public\.(?!promotions\b)\w+/);
  });
});

describe("T045 — the rollback removes exactly M2d", () => {
  it("drops the three tables, the audit function, the code generator and its sequence — nothing else", () => {
    const drops = [...rollbackTop.matchAll(/drop (table|function|sequence) ([\w.()]+)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(drops).toEqual(["table public.promotion_targets", "table public.promotions", "table public.offer_price_tiers",
                           "function public.write_audit_log_promotions()", "function public.next_promotion_code_ref()", "sequence public.promotion_code_ref_seq"]);
    expect(rollbackTop).not.toMatch(/\b(alter|create)\b/);
  });
  it("refuses (changing nothing) while any tier/promotion/target exists or M2e+ is applied", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(rollback)![0];
    expect(rollback.startsWith("begin; do $guard$")).toBe(true);
    for (const probe of ["exists (select 1 from public.offer_price_tiers)", "exists (select 1 from public.promotions)", "exists (select 1 from public.promotion_targets)",
                         "to_regclass('public.notification_events') is not null"]) {
      contains(guard, probe);
    }
  });
  it("the M2c rollback already refuses while M2d is applied (rollbacks run newest first)", () => {
    expect(normalize(readFileSync("supabase/rollback/20260925109000_feature_013_finance_fulfillment_records.rollback.sql", "utf8"))).toContain("to_regclass('public.offer_price_tiers') is not null");
  });
});

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TierCoveragePanel } from "@/components/admin/system/coverage-panel";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { ADMIN_AREAS } from "@/lib/admin/areas";
import { evaluateTierCoverage, resolveInForce, type CommissionPolicyRow, type CommissionTierRow } from "@/lib/admin/commission";
import { maskIdentifier } from "@/lib/admin/payment-accounts";
import { SHIPPING_RULES_CONSUMED_BY_CHECKOUT, resolveInForceTaxRule } from "@/lib/admin/pricing-rules";
import {
  COMMISSION_POLICY_STATUSES,
  COMMISSION_POLICY_TRANSITIONS,
  CommissionTierFieldsInput,
  CONFIG_CURRENCY,
  PLATFORM_ADMIN_ROLES,
  PaymentAccountFieldsInput,
  RoleGrantInput,
  TAXABLE_BASES,
  TaxRuleFieldsInput,
} from "@/lib/admin/system-validation";
import { ar } from "@/lib/app/copy/ar";
import { en } from "@/lib/app/copy/en";

/**
 * Feature 010 RUN F — Phase 9 STATIC proof (no database, no session): every configuration
 * vocabulary is the schema's own CHECK list; every read/write path re-verifies `is_super_admin()`
 * (T043) before any query; the commission UI states the six checkout semantics (T042) and the
 * future-only rule (T044) in EN and AR; no restatement/backfill action exists anywhere under
 * `src/app/dashboard-admin` (T044 grep pin); the coverage-gap rule reproduces `checkout_order`'s
 * inequality and is display-only (T045); T029 is admin-only, masked, high-risk with OPS-01 stated;
 * no RUN F file reaches for a service role, a shared cache, a hard delete or a shadow table; no
 * migration / RLS / grant / trigger appears in the tree.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function schemaReport(): { constraints: { table_name: string; constraint_name: string; definition: string }[]; rls_policies: { table_name: string; policy_name: string; command: string; using_expression: string | null; with_check_expression: string | null }[]; table_grants: { table_name: string; grantee: string; privilege: string }[]; triggers: { table_name: string; function_name: string }[] } {
  const raw = JSON.parse(source("docs", "database", "database-schema-report.json")) as unknown;
  const find = (node: unknown): unknown => {
    if (Array.isArray(node)) for (const item of node) {
      const hit = find(item);
      if (hit) return hit;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "database_schema_report" && typeof value === "string") return JSON.parse(value);
        const hit = find(value);
        if (hit) return hit;
      }
    }
    return null;
  };
  return find(raw) as ReturnType<typeof schemaReport>;
}
const CHECK_VALUES = (definition: string) => definition.match(/'[A-Z_]+'::text/g)?.map((v) => v.slice(1, -7)) ?? [];

const SYSTEM_LIBS = ["lib/admin/system-validation.ts", "lib/admin/system-errors.ts", "lib/admin/roles.ts", "lib/admin/commission.ts", "lib/admin/pricing-rules.ts", "lib/admin/payment-accounts.ts"];
const SYSTEM_FILES = [...SYSTEM_LIBS, ...walk("src/app/dashboard-admin/(system)"), ...walk("components/admin/system")];
const BRANDING_RPCS = new Set(["set_platform_logo", "remove_platform_logo"]);
const CONFIG_TABLES = ["platform_admins", "tax_rules", "shipping_rules", "commission_policies", "commission_tiers", "payment_accounts"] as const;

afterEach(cleanup);

describe("Phase 9 — vocabularies are the schema's own CHECK constraints; policies untouched", () => {
  it("roles, policy statuses, taxable bases and the USD-only currency match the schema report exactly", () => {
    const { constraints } = schemaReport();
    const check = (name: string) => constraints.find((c) => c.constraint_name === name)!.definition;
    expect([...PLATFORM_ADMIN_ROLES].sort()).toEqual(CHECK_VALUES(check("platform_admins_role_check")).sort());
    expect([...COMMISSION_POLICY_STATUSES].sort()).toEqual(CHECK_VALUES(check("commission_policies_status_check")).sort());
    expect([...TAXABLE_BASES].sort()).toEqual(CHECK_VALUES(check("tax_rules_taxable_base_check")).sort());
    expect(check("shipping_rules_currency_check")).toContain(`'${CONFIG_CURRENCY}'`);
    expect(check("payment_accounts_currency_check")).toContain(`'${CONFIG_CURRENCY}'`);
    expect(check("commission_tiers_check")).toBe("CHECK (max_quantity_kg IS NULL OR max_quantity_kg > min_quantity_kg)");
  });

  it("the six RLS policies stay exactly as reported (super-admin USING+CHECK; payment_accounts USING platform admin / CHECK super admin) — no migration ever changes an RLS policy or grant on them; the only migration touching the tables at all is the human-approved DB-OPEN-21 M1 (updated_at + audit triggers)", () => {
    const { rls_policies, table_grants, triggers } = schemaReport();
    const policy = (table: string) => rls_policies.filter((p) => p.table_name === table);
    for (const table of ["platform_admins", "tax_rules", "shipping_rules", "commission_policies", "commission_tiers"]) {
      expect(policy(table).length, table).toBe(1);
      expect(policy(table)[0].using_expression, table).toBe("is_super_admin()");
      expect(policy(table)[0].with_check_expression, table).toBe("is_super_admin()");
    }
    expect(policy("commission_policies")[0].policy_name).toBe("commission_admin");
    expect(policy("commission_tiers")[0].policy_name).toBe("tiers_admin");
    expect(policy("payment_accounts")[0]).toMatchObject({ policy_name: "payment_accounts_admin", using_expression: "is_platform_admin()", with_check_expression: "is_super_admin()" });
    for (const table of CONFIG_TABLES) {
      expect(table_grants.filter((g) => g.table_name === table && g.privilege === "DELETE").map((g) => g.grantee), table).not.toContain("authenticated");
      // The BASELINE report (2026-09-07, frozen) has no audit trigger on any configuration table — that was the
      // DB-OPEN-21 gap. Migration `20260920120000_feature_010_db_open_21_config_attribution.sql` (M1) adds them; its
      // own contract is pinned in `config-attribution-migration.test.ts`, its effect in `config-attribution-live.test.ts`.
      expect(triggers.filter((t) => t.table_name === table && /audit/.test(t.function_name)), table).toEqual([]);
    }
    const migrations = readdirSync(path.join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
    // Rollback scripts live under `supabase/rollback/` (outside the CLI's migration folder); they get the
    // same content checks as the forward migrations.
    const rollbacks = readdirSync(path.join(root, "supabase", "rollback")).filter((f) => f.endsWith(".sql"));
    expect(rollbacks).toHaveLength(migrations.length);
    // RUN F added no migration. Two later, human-approved Feature 010 migrations are exempted BY NAME only:
    // RUN J (DB-OPEN-22 — `organizations` read path + compliance guard) and M1 (DB-OPEN-21 — updated_at +
    // audit triggers on the six configuration tables). The content checks below still apply to every file.
    // Final non-payment closure run: the (also human-approved, applied) T047 branding/avatar/listing-media migration is
    // exempted by name too — it touches none of the six configuration tables (it adds `platform_settings`).
    const APPROVED_010_MIGRATIONS = /feature_010_db_open_22_compliance_organization_read|feature_010_db_open_21_config_attribution|feature_010_branding_avatar_listing_media/;
    expect(migrations.filter((f) => !APPROVED_010_MIGRATIONS.test(f)).some((f) => /feature_010|run_f|commission|platform_admins|payment_accounts/i.test(f))).toBe(false);
    for (const [dir, files] of [["migrations", migrations], ["rollback", rollbacks]] as const) {
      for (const file of files) {
        const sql = source("supabase", dir, file);
        // No migration or rollback may create/drop/alter an RLS POLICY on a configuration table — ever.
        for (const table of CONFIG_TABLES) expect(sql, `${dir}/${file} changes a policy on ${table}`).not.toMatch(new RegExp(`(create|drop|alter)\\s+policy[^;]*on\\s+public\\.${table}\\b`, "i"));
        // Triggers on those tables are allowed ONLY in the M1 migration (and its rollback), which adds/removes exactly the
        // updated_at + audit triggers (`trg_<table>_updated_at`, `trg_audit_<table>`).
        for (const table of CONFIG_TABLES) {
          const triggerStatements = [...sql.replace(/--[^\n]*/g, "").matchAll(new RegExp(`(create|drop)\\s+trigger\\s+(?:if\\s+exists\\s+)?(\\w+)[^;]*?on\\s+public\\.${table}\\b`, "gi"))].map((match) => match[2]);
          if (/feature_010_db_open_21_config_attribution/.test(file)) expect(triggerStatements.every((name) => name === `trg_${table}_updated_at` || name === `trg_audit_${table}`), `${dir}/${file} ${table}`).toBe(true);
          else expect(triggerStatements, `${dir}/${file} alters a trigger on ${table}`).toEqual([]);
        }
      }
    }
  });

  it("no RUN F file uses a service role, a shared cache, a hard delete, an RPC other than the six role attests, or any table outside the six configuration tables (+ profiles for names)", async () => {
    const { ROLE_FUNCTION_ATTESTS } = await import("@/lib/admin/areas");
    const approved = new Set(Object.keys(ROLE_FUNCTION_ATTESTS));
    expect(SYSTEM_FILES.length).toBeGreaterThan(20);
    for (const file of SYSTEM_FILES) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/\.delete\(|SERVICE_ROLE|service_role|unstable_cache|"use cache"|cacheTag|cacheLife|createSignedUrl/);
      // The T047 branding settings page (a singleton, not a RUN F configuration table) writes ONLY through its own two
      // admin-gated RPCs — admitted for that folder alone, by exact name.
      const branding = /\(system\)[\/]branding[\/]/.test(file);
      for (const match of src.matchAll(/\.rpc\(\s*([^)]*)\)/g)) {
        const fnName = match[1].match(/^["']([a-z_]+)["']/)?.[1] ?? match[1];
        expect(match[1] === "fn" || approved.has(fnName) || (branding && BRANDING_RPCS.has(fnName)), `${file}: rpc(${match[1]})`).toBe(true);
      }
      for (const match of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) expect([...CONFIG_TABLES, "profiles"], `${file}: .from("${match[1]}")`).toContain(match[1]);
    }
  });
});

describe("T027 — platform-admin role management (SUPER_ADMIN only; grant attributed via created_by, every change audited by the database)", () => {
  it("every roles.ts read/write re-verifies is_super_admin() before createClient(); self-change is refused; the grant is attributed via created_by", () => {
    const src = stripComments(source("lib", "admin", "roles.ts"));
    const exported = src.match(/export async function \w+\(/g) ?? [];
    expect(exported.length).toBe(5);
    expect((src.match(/await requireSuperAdmin\(\)/g) ?? []).length).toBe(exported.length);
    expect(src.indexOf("requireSuperAdmin()")).toBeLessThan(src.indexOf("createClient()"));
    expect(src).toContain("ACTION_FEEDBACK.ROLE_SELF_CHANGE_REFUSED");
    expect(src).toContain("created_by: authority.userId");
    expect(src).not.toMatch(/is_org_member|organization_members|is_authorized_member/);
    expect(RoleGrantInput.safeParse({ userId: "f0000000-0000-4000-8000-000000000001", role: "OWNER" }).success).toBe(false);
    for (const file of walk("src/app/dashboard-admin/(system)/(super)/roles").filter((f) => f.endsWith("page.tsx"))) expect(source(file), file).toContain('checkAreaAccess("roles")');
    const area = ADMIN_AREAS.find((a) => a.key === "roles")!;
    expect(area).toMatchObject({ roleFunction: "is_super_admin", availability: "live", group: "system" });
    expect(source("src", "app", "dashboard-admin", "(system)", "(super)", "layout.tsx")).toContain('checkRoleFunctionAccess("is_super_admin")');
  });
});

describe("T028 — tax and shipping rules (future snapshots only; shipping honestly unconsumed)", () => {
  it("pricing-rules.ts never touches order_financials/orders; tax resolution mirrors checkout_order; shipping_rules has no consumer in any migration or lib path", () => {
    const src = stripComments(source("lib", "admin", "pricing-rules.ts"));
    expect(src).not.toMatch(/order_financials|\.from\("orders"\)|payouts|commission/);
    expect((src.match(/await requireSuperAdmin\(\)/g) ?? []).length).toBe((src.match(/export async function \w+\(/g) ?? []).length);
    expect(SHIPPING_RULES_CONSUMED_BY_CHECKOUT).toBe(false);
    for (const dir of ["migrations", "rollback"]) {
      for (const file of readdirSync(path.join(root, "supabase", dir)).filter((f) => f.endsWith(".sql"))) {
        expect(source("supabase", dir, file), `${dir}/${file}`).not.toMatch(/from\s+public\.shipping_rules|join\s+public\.shipping_rules/i);
      }
    }
    for (const file of [...walk("lib/orders"), ...walk("lib/delivery"), ...walk("lib/finance")]) expect(stripComments(source(file)), file).not.toMatch(/shipping_rules/);
    const rules = [
      { id: "old", countryCode: "AE", taxName: "VAT", ratePercentage: 5, taxableBase: "MERCHANDISE_ONLY" as const, isActive: true, effectiveFrom: "2020-01-01T00:00:00Z", effectiveUntil: null, createdBy: null },
      { id: "new", countryCode: "AE", taxName: "VAT", ratePercentage: 7, taxableBase: "MERCHANDISE_ONLY" as const, isActive: true, effectiveFrom: "2025-01-01T00:00:00Z", effectiveUntil: null, createdBy: null },
      { id: "future", countryCode: "AE", taxName: "VAT", ratePercentage: 9, taxableBase: "MERCHANDISE_ONLY" as const, isActive: true, effectiveFrom: "2099-01-01T00:00:00Z", effectiveUntil: null, createdBy: null },
      { id: "inactive", countryCode: "AE", taxName: "VAT", ratePercentage: 1, taxableBase: "MERCHANDISE_ONLY" as const, isActive: false, effectiveFrom: "2026-01-01T00:00:00Z", effectiveUntil: null, createdBy: null },
    ];
    expect(resolveInForceTaxRule(rules, "ae", new Date("2026-09-17"))?.id).toBe("new");
    expect(resolveInForceTaxRule(rules, "ZZ", new Date("2026-09-17"))).toBeNull();
    expect(TaxRuleFieldsInput.safeParse({ countryCode: "zz", taxName: "VAT", ratePercentage: "150", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: "2099-01-01T00:00" }).success).toBe(false);
    expect(TaxRuleFieldsInput.safeParse({ countryCode: "zz", taxName: "VAT", ratePercentage: "5", taxableBase: "MERCHANDISE_ONLY", effectiveFrom: "2099-01-01T00:00", effectiveUntil: "2098-01-01T00:00" }).success).toBe(false);
  });

  it("every tax/shipping page states the future-only rule or the unconsumed-shipping notice; the shipping notice text says no checkout/shipment path applies the rows", () => {
    for (const file of walk("src/app/dashboard-admin/(system)/(super)/tax").filter((f) => f.endsWith("page.tsx"))) expect(source(file), file).toContain("<FutureOnlyNotice />");
    for (const file of walk("src/app/dashboard-admin/(system)/(super)/shipping").filter((f) => f.endsWith("page.tsx"))) expect(source(file), file).toContain("<ShippingUnconsumedNotice />");
    expect(en.admin.system.shipping.unconsumed.description).toMatch(/No database function and no application path reads shipping rules today/);
    expect(ar.admin?.system?.shipping?.unconsumed?.description).toMatch(/لا تقرأ أي دالة/);
    expect(en.admin.system.common.futureOnly).toMatch(/no historical order, commission, tax, seller net amount or payout is recalculated, restated or re-snapshotted/);
  });
});

describe("T042 / T043 — commission configuration over the two existing tables, super-admin verified on every path", () => {
  it("commission.ts reads/writes ONLY commission_policies and commission_tiers, status moves only through the four named operations, a new policy is always DRAFT, and every async export re-verifies is_super_admin() before any query", () => {
    const src = stripComments(source("lib", "admin", "commission.ts"));
    const tables = [...src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["commission_policies", "commission_tiers"]));
    expect(src).toContain('status: "DRAFT"');
    expect(src).toContain("update({ status: spec.to })");
    expect(src).not.toMatch(/status: parsed\.data\.status/);
    const asyncExports = src.match(/export async function \w+\(/g) ?? [];
    expect(asyncExports.length).toBe(7);
    expect((src.match(/await requireSuperAdmin\(\)/g) ?? []).length).toBe(asyncExports.length);
    expect(src).not.toMatch(/order_financials|payouts|\.from\("orders"\)|checkout_order|admin_review_payment/);
    expect(Object.keys(COMMISSION_POLICY_TRANSITIONS).sort()).toEqual(["activate", "archive", "deactivate", "restore"]);
    for (const spec of Object.values(COMMISSION_POLICY_TRANSITIONS)) expect(COMMISSION_POLICY_STATUSES).toContain(spec.to);
    // No member or public commission surface.
    for (const file of [...walk("src/app/dashboard"), ...walk("src/app/(public)"), ...walk("lib/public")]) expect(stripComments(source(file)), file).not.toMatch(/commission_policies|commission_tiers/);
  });

  it("tier contract mirrors commission_tiers_*_check (min ≥ 0, max NULL or > min, 0 ≤ percentage ≤ 100)", () => {
    const base = { policyId: "f0000000-0000-4000-8000-000000000001" };
    expect(CommissionTierFieldsInput.safeParse({ ...base, minQuantityKg: "0", maxQuantityKg: "100", percentage: "5" }).success).toBe(true);
    expect(CommissionTierFieldsInput.safeParse({ ...base, minQuantityKg: "250", maxQuantityKg: "", percentage: "3" }).success).toBe(true);
    expect(CommissionTierFieldsInput.safeParse({ ...base, minQuantityKg: "100", maxQuantityKg: "100", percentage: "5" }).success).toBe(false);
    expect(CommissionTierFieldsInput.safeParse({ ...base, minQuantityKg: "-1", percentage: "5" }).success).toBe(false);
    expect(CommissionTierFieldsInput.safeParse({ ...base, minQuantityKg: "0", percentage: "101" }).success).toBe(false);
  });

  it("the commission surface states all six checkout semantics in EN and AR, and every commission page guards its area", () => {
    const semantics = en.admin.system.commission.semantics;
    expect(semantics.totalQuantity).toMatch(/TOTAL quantity/);
    expect(semantics.minInclusive).toMatch(/minimum is inclusive/);
    expect(semantics.maxExclusive).toMatch(/maximum is exclusive/);
    expect(semantics.nullMax).toMatch(/empty maximum means the band is open-ended/);
    expect(semantics.wholeBase).toMatch(/whole order base subtotal .* not progressively/);
    expect(semantics.overlap).toMatch(/latest effective-from instant wins/);
    for (const key of ["totalQuantity", "minInclusive", "maxExclusive", "nullMax", "wholeBase", "overlap"] as const) expect(ar.admin?.system?.commission?.semantics?.[key], key).toBeTruthy();
    const page = source("src", "app", "dashboard-admin", "(system)", "(super)", "commission", "page.tsx");
    for (const key of ["totalQuantity", "minInclusive", "maxExclusive", "nullMax", "wholeBase", "overlap"]) expect(page).toContain(`"${key}"`);
    for (const file of walk("src/app/dashboard-admin/(system)/(super)/commission").filter((f) => f.endsWith("page.tsx"))) expect(source(file), file).toContain('checkAreaAccess("commission")');
    expect(ADMIN_AREAS.find((a) => a.key === "commission")).toMatchObject({ roleFunction: "is_super_admin", availability: "live" });
  });

  it("resolveInForce mirrors checkout_order: ACTIVE + effective_from ≤ now < effective_until (or open) — latest effective_from wins", () => {
    const policy = (id: string, status: CommissionPolicyRow["status"], from: string, until: string | null): CommissionPolicyRow => ({ id, name: id, status, effectiveFrom: from, effectiveUntil: until, createdBy: "x", createdAt: from, tiers: [] });
    const now = new Date("2026-09-17T12:00:00Z");
    const { winner, inForce } = resolveInForce([policy("old", "ACTIVE", "2025-01-01T00:00:00Z", null), policy("new", "ACTIVE", "2026-06-01T00:00:00Z", null), policy("draft", "DRAFT", "2026-08-01T00:00:00Z", null), policy("future", "ACTIVE", "2099-01-01T00:00:00Z", null), policy("ended", "ACTIVE", "2024-01-01T00:00:00Z", "2025-01-01T00:00:00Z")], now);
    expect(winner?.id).toBe("new");
    expect(inForce.map((p) => p.id)).toEqual(["new", "old"]);
  });
});

describe("T044 — historical immutability is explicit and no restatement action exists", () => {
  it("the future-only copy is present on policy AND tier mutations (form footer + status confirmation) in EN and AR", () => {
    const form = source("components", "admin", "catalogue", "record-form.tsx");
    expect(form).toContain("isSystem ? system.common.futureOnlyTitle : copy.common.publicNote");
    const panel = source("components", "admin", "system", "commission-status-panel.tsx");
    expect(panel).toContain("copy.common.futureOnly");
    expect(en.admin.system.commission.transitions.confirmDescription).toMatch(/Eligible future checkouts only — no existing order changes/);
    expect(ar.admin?.system?.commission?.transitions?.confirmDescription).toMatch(/عمليات الدفع المستقبلية المؤهلة فقط/);
    const detail = source("src", "app", "dashboard-admin", "(system)", "(super)", "commission", "[policyId]", "page.tsx");
    expect(detail).toContain("<FutureOnlyNotice />");
    expect((detail.match(/copyKey="commissionTier"/g) ?? []).length).toBe(2);
  });

  it("grep -rniE 'recalculat|re-?snapshot|restate|backfill' over src/app/dashboard-admin returns nothing that ACTS on historical financial records (only statements of absence in comments/copy)", () => {
    const pattern = /recalculat|re-?snapshot|restate|backfill/i;
    for (const file of walk("src/app/dashboard-admin")) {
      const code = stripComments(source(file));
      for (const line of code.split("\n")) {
        if (!pattern.test(line)) continue;
        expect(line, `${file}: ${line.trim()}`).not.toMatch(/\.rpc\(|\.update\(|\.insert\(|\.upsert\(|async function|action=|onClick|formAction/);
      }
    }
    for (const file of SYSTEM_LIBS) {
      const code = stripComments(source(file));
      expect(code, file).not.toMatch(/(recalculat|resnapshot|restate|backfill)\w*\s*\(/i);
    }
  });
});

describe("T045 — tier coverage gaps are detected and DISPLAYED, never blocked or filled", () => {
  const tier = (id: string, min: number, max: number | null, percentage = 5): CommissionTierRow => ({ id, policyId: "p", minQuantityKg: min, maxQuantityKg: max, percentage });

  it("bands 0–100 and 250–NULL → exactly the uncovered 100–250 range; other shapes as checkout_order would see them", () => {
    expect(evaluateTierCoverage([tier("a", 0, 100), tier("b", 250, null)]).gaps).toEqual([{ from: 100, to: 250 }]);
    expect(evaluateTierCoverage([]).gaps).toEqual([{ from: 0, to: null }]);
    expect(evaluateTierCoverage([tier("a", 0, 100)]).gaps).toEqual([{ from: 100, to: null }]);
    expect(evaluateTierCoverage([tier("a", 50, null)]).gaps).toEqual([{ from: 0, to: 50 }]);
    // max is exclusive and the next min inclusive: 0–100 then 100–NULL is gapless.
    const gapless = evaluateTierCoverage([tier("a", 0, 100), tier("b", 100, null)]);
    expect(gapless).toMatchObject({ gaps: [], covered: true, openEnded: true, overlaps: [] });
    const overlapping = evaluateTierCoverage([tier("a", 0, 200), tier("b", 100, null)]);
    expect(overlapping.covered).toBe(true);
    expect(overlapping.overlaps.map((o) => `${o.a.id}-${o.b.id}`)).toEqual(["a-b"]);
  });

  it("the panel renders the 100–250 warning and cites COMMISSION-OPEN-01; no fallback rate and no checkout block exists in the commission layer", () => {
    render(
      <LocaleProvider>
        <TierCoveragePanel tiers={[tier("a", 0, 100), tier("b", 250, null)]} />
      </LocaleProvider>,
    );
    expect(document.querySelector('[data-coverage="gaps"]')).not.toBeNull();
    expect(document.querySelector('[data-coverage-gap="100-250"]')?.textContent).toMatch(/100 kg ≤ total < 250 kg/);
    expect(document.querySelector('[data-open-item="commission-open-01"]')?.textContent).toMatch(/COMMISSION-OPEN-01/);
    expect(document.body.textContent).toMatch(/does not block checkout and applies no fallback rate/);
    cleanup();
    render(
      <LocaleProvider>
        <TierCoveragePanel tiers={[tier("a", 0, null)]} />
      </LocaleProvider>,
    );
    expect(document.querySelector('[data-coverage="covered"]')).not.toBeNull();
    const src = stripComments(source("lib", "admin", "commission.ts"));
    expect(src).not.toMatch(/fallback|defaultPercentage|blockCheckout/i);
  });
});

describe("T029 — payment accounts: admin read, super-admin write, high-risk + OPS-01 stated, no member path", () => {
  it("reads go through requirePlatformAdmin(), writes through requireSuperAdmin(); identifiers are masked in lists; the contract is USD-only", () => {
    const src = stripComments(source("lib", "admin", "payment-accounts.ts"));
    expect((src.match(/await requirePlatformAdmin\(\)/g) ?? []).length).toBe(2);
    expect((src.match(/await requireSuperAdmin\(\)/g) ?? []).length).toBe(3);
    expect(src).toContain("created_by: authority.userId");
    expect(maskIdentifier("AE070331234567890123456")).toBe("••••••••••••3456");
    expect(maskIdentifier("12")).toBe("••••");
    expect(maskIdentifier(null)).toBeNull();
    expect(PaymentAccountFieldsInput.safeParse({ accountName: "Hills", bankName: "Bank", currency: "AED" }).success).toBe(false);
    expect(PaymentAccountFieldsInput.safeParse({ accountName: "Hills", bankName: "Bank", swiftCode: "ABCDEFGHXXX", iban: "AE07 0331 2345 6789 0123 456" }).success).toBe(true);
  });

  it("no member/public route or module touches payment accounts; the pages show the high-risk and OPS-01 notices; the read-only ADMIN statement exists", () => {
    // `payments` was removed from this list: Feature 008 T022 (commit 3234458, 2026-09-17) legitimately added the
    // member payment-STATE routes `/dashboard/payments` and `/dashboard/payments/[orderId]`. Their exact shape is
    // pinned in `finance-delegation.test.tsx`; what THIS test guards — that no member/public route or module
    // touches payment ACCOUNTS (bank fields) — is still enforced for those routes by the content scan just below.
    for (const segment of ["payment-accounts", "bank"]) expect(existsSync(path.join(root, "src/app/dashboard", segment)), segment).toBe(false);
    for (const file of [...walk("src/app/dashboard"), ...walk("src/app/(public)"), ...walk("lib/finance"), ...walk("lib/public"), ...walk("components/dashboard")]) {
      expect(stripComments(source(file)), file).not.toMatch(/payment_accounts|paymentAccounts|\biban\b|swift_code/);
    }
    for (const file of walk("src/app/dashboard-admin/(system)/payment-accounts").filter((f) => f.endsWith("page.tsx"))) expect(source(file), file).toContain("<HighRiskNotice />");
    expect(en.admin.system.paymentAccounts.dualControl.description).toMatch(/OPS-01/);
    expect(en.admin.system.paymentAccounts.dualControl.description).toMatch(/does not simulate one/);
    expect(ar.admin?.system?.paymentAccounts?.dualControl?.description).toMatch(/OPS-01/);
    expect(source("src", "app", "dashboard-admin", "(system)", "payment-accounts", "page.tsx")).toContain("data-payment-accounts-read-only");
    expect(source("src", "app", "dashboard-admin", "(system)", "payment-accounts", "new", "page.tsx")).toContain('checkRoleFunctionAccess("is_super_admin")');
    expect(ADMIN_AREAS.find((a) => a.key === "paymentAccounts")).toMatchObject({ roleFunction: "is_platform_admin", availability: "live", group: "system" });
  });
});

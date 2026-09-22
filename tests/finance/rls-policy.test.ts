import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Feature 008 Phase 1 (T003/T005/T006) — STATIC proofs against the checked-in, approved
 * `docs/database/database-schema-report.json` baseline (same loading convention as
 * `tests/orders/db-baseline.ts`). These prove the CURRENT database's own RLS/grant decisions —
 * including the two genuine gaps this run's read-layer header comment documents (no independent
 * finance/auditor policy on `proforma_invoices`/`tax_invoices`/`payouts`) — rather than assuming
 * this feature's own application-side behavior. No FINANCE-role or AUDITOR-role test fixture exists
 * in `tests/auth/fixture-session.ts`/`scripts/seed-test-fixtures.ts` yet, so a live authenticated
 * proof of finance/auditor access is not possible without extending that shared, privileged seed
 * script — out of this narrow Phase 1 run's scope (run directive "TEST FIXTURE DISCIPLINE": no new
 * hand-maintained/privileged fixture beyond what the repository's existing convention already
 * permits). This static policy proof is the honest substitute; it is recorded as a Phase 1 finding,
 * not silently worked around.
 *
 * UPDATE (Feature 008 T023, this run): `tests/listings/live-chain.ts#prepareChain` (built later, by
 * Feature 006) now signs in a real `financeAdmin` operator as `sessions.finance` — reused by
 * `tests/finance/t023-documents-payouts.test.tsx`, which live-proves a genuine FINANCE-role read of
 * `payments`/`payouts` (present) and the confirmed absence of a finance-role read of
 * `proforma_invoices` (also present, matching this file's own static finding below). No live AUDITOR
 * fixture exists yet, so the auditor gap below remains a static-only proof.
 */

type RlsPolicy = {
  table_name: string;
  policy_name: string;
  command: string;
  roles: string[];
  using_expression: string | null;
  with_check_expression: string | null;
};

type TableGrant = { table_name: string; grantee: string; privilege_type?: string };

type SchemaReport = {
  rls_policies: RlsPolicy[];
  table_grants: TableGrant[];
};

function loadSchemaReport(): SchemaReport {
  const raw = readFileSync("docs/database/database-schema-report.json", "utf8");
  const wrapper = JSON.parse(raw) as [{ database_schema_report: string }];
  return JSON.parse(wrapper[0].database_schema_report) as SchemaReport;
}

const FINANCE_TABLES = ["payments", "payment_events", "order_financials", "proforma_invoices", "proforma_invoice_items", "tax_invoices", "payouts", "payment_accounts", "commission_policies", "commission_tiers"] as const;

describe("T003 — the live RLS policy set for every finance table matches this feature's documented boundary", () => {
  const report = loadSchemaReport();
  const policiesByTable = new Map<string, RlsPolicy[]>();
  for (const table of FINANCE_TABLES) {
    policiesByTable.set(
      table,
      report.rls_policies.filter((policy) => policy.table_name === table)
    );
  }

  it("payments: buyer/seller-of-record, platform admin, finance operator, and auditor may SELECT", () => {
    const policies = policiesByTable.get("payments")!;
    const view = policies.find((policy) => policy.policy_name === "payments_view");
    const financeRead = policies.find((policy) => policy.policy_name === "payments_finance_read");
    expect(view?.using_expression).toBe("(is_platform_admin() OR can_view_order(order_id))");
    expect(financeRead?.using_expression).toBe("(is_finance_operator() OR is_auditor())");
  });

  it("order_financials: same effective access as payments", () => {
    const policies = policiesByTable.get("order_financials")!;
    const view = policies.find((policy) => policy.policy_name === "financials_view");
    const financeRead = policies.find((policy) => policy.policy_name === "financials_finance_read");
    expect(view?.using_expression).toBe("can_view_order(order_id)");
    expect(financeRead?.using_expression).toBe("(is_finance_operator() OR is_auditor())");
  });

  it("proforma_invoices/proforma_invoice_items: ONLY can_view_order — no independent finance/auditor policy exists", () => {
    for (const table of ["proforma_invoices", "proforma_invoice_items"] as const) {
      const policies = policiesByTable.get(table)!;
      expect(policies.some((policy) => policy.using_expression?.includes("is_finance_operator()"))).toBe(false);
      expect(policies.some((policy) => policy.using_expression?.includes("is_auditor()"))).toBe(false);
    }
  });

  it("tax_invoices: finance operator has ALL access; auditor has no policy at all", () => {
    const policies = policiesByTable.get("tax_invoices")!;
    const financeAll = policies.find((policy) => policy.policy_name === "tax_invoice_finance");
    expect(financeAll?.command).toBe("ALL");
    expect(financeAll?.using_expression).toBe("is_finance_operator()");
    expect(policies.some((policy) => policy.using_expression?.includes("is_auditor()"))).toBe(false);
  });

  it("payouts: seller org (is_org_member) and platform admin may view; finance operator has ALL; auditor has no policy at all", () => {
    const policies = policiesByTable.get("payouts")!;
    const view = policies.find((policy) => policy.policy_name === "payouts_view");
    const financeAll = policies.find((policy) => policy.policy_name === "payouts_finance");
    expect(view?.using_expression).toBe("(is_platform_admin() OR is_org_member(seller_organization_id))");
    expect(financeAll?.command).toBe("ALL");
    expect(policies.some((policy) => policy.using_expression?.includes("is_auditor()"))).toBe(false);
  });

  it("payment_events: ONLY admin/finance/auditor may SELECT — ordinary buyer/seller members have zero access", () => {
    const policies = policiesByTable.get("payment_events")!;
    expect(policies.every((policy) => policy.roles.includes("authenticated") && !policy.using_expression?.includes("can_view_order"))).toBe(true);
    expect(policies.some((policy) => policy.using_expression === "is_platform_admin()")).toBe(true);
    expect(policies.some((policy) => policy.using_expression === "(is_finance_operator() OR is_auditor())")).toBe(true);
  });

  it("payment_accounts: admin-only (SELECT/write); no member-facing policy of any kind", () => {
    const policies = policiesByTable.get("payment_accounts")!;
    expect(policies).toHaveLength(1);
    expect(policies[0]!.using_expression).toBe("is_platform_admin()");
    expect(policies[0]!.with_check_expression).toBe("is_super_admin()");
  });

  it("commission_policies/commission_tiers: super-admin only; no finance/member read policy exists", () => {
    for (const table of ["commission_policies", "commission_tiers"] as const) {
      const policies = policiesByTable.get(table)!;
      expect(policies).toHaveLength(1);
      expect(policies[0]!.using_expression).toBe("is_super_admin()");
    }
  });

  it("no finance table grants SELECT to the anon role at the grant level", () => {
    const anonGrants = report.table_grants.filter((grant) => FINANCE_TABLES.includes(grant.table_name as (typeof FINANCE_TABLES)[number]) && grant.grantee === "anon");
    expect(anonGrants).toEqual([]);
  });
});

/** Strips comments so a doc comment legitimately explaining a forbidden pattern's absence never trips
 * a "must not contain X" check — same precedent as `tests/orders/read.test.ts#stripComments`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("T005 — payment_accounts boundary audit (static, member/public/finance surfaces)", () => {
  /**
   * Feature 010 RUN F (decision D1, 2026-09-17): the ONLY permitted callers of `payment_accounts` are
   * Feature 010's SUPER_ADMIN configuration surface (`lib/admin/payment-accounts.ts`,
   * `src/app/dashboard-admin/(system)/payment-accounts/**`, `components/admin/system/**`) — the
   * configuration UI Feature 008's plan (decision 6) assigns to Feature 010. Every member-facing,
   * public and finance-domain root stays under this audit, and Feature 008 itself still contains no
   * payment-account implementation (`lib/finance` is inside the audited set).
   */
  const sourceRoots = ["lib", "components", "src", "app"];
  const FEATURE_010_PAYMENT_ACCOUNT_OWNERS = [/^lib\/admin\/payment-accounts\.ts$/, /^lib\/admin\/system-validation\.ts$/, /^src\/app\/dashboard-admin\/\(system\)\/payment-accounts\//, /^components\/admin\/system\/fields\.ts$/, /^lib\/app\/copy\/(en|ar)\.ts$/];
  const isFeature010Owner = (file: string) => FEATURE_010_PAYMENT_ACCOUNT_OWNERS.some((pattern) => pattern.test(file));

  function collectSourceFiles(dir: string): string[] {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : collectSourceFiles(path);
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    });
  }

  it("no application source file executes a payment_accounts table operation", () => {
    const offenders: string[] = [];
    for (const root of sourceRoots) {
      for (const file of collectSourceFiles(root)) {
        if (isFeature010Owner(file)) continue;
        const source = stripComments(readFileSync(file, "utf8"));
        if (/\.from\(\s*["']payment_accounts["']\s*\)/.test(source)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Feature 010's permitted payment-account owners are admin-only: none lives under a member, public or finance root, and Feature 008 (lib/finance) still executes no payment_accounts operation", () => {
    const owners = sourceRoots.flatMap((root) => collectSourceFiles(root)).filter((file) => isFeature010Owner(file));
    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) expect(owner, owner).not.toMatch(/^src\/app\/dashboard\/|^src\/app\/\(public\)|^lib\/finance|^lib\/public|^components\/(dashboard|public)/);
    for (const file of collectSourceFiles("lib/finance")) expect(stripComments(readFileSync(file, "utf8")), file).not.toMatch(/payment_accounts/);
  });

  it("no application source file references a bank-account field name (member-facing bank-instruction surface)", () => {
    const bankFieldPattern = /\b(account_number|iban|swift_code|bank_name)\b/;
    const offenders: string[] = [];
    for (const root of sourceRoots) {
      for (const file of collectSourceFiles(root)) {
        if (isFeature010Owner(file)) continue;
        const source = stripComments(readFileSync(file, "utf8"));
        if (bankFieldPattern.test(source)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("T006 — no application source file queries commission_policies/commission_tiers for historical display", () => {
  const financeFiles = ["lib/finance/types.ts", "lib/finance/validation.ts", "lib/finance/errors.ts", "lib/finance/read.ts", "lib/finance/funding.ts"];

  it("lib/finance/*.ts never references commission_policies or commission_tiers", () => {
    for (const file of financeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source).not.toMatch(/commission_policies/);
      expect(source).not.toMatch(/commission_tiers/);
    }
  });

  it("lib/finance/read.ts performs no monetary multiplication (the tell of a recomputed percentage/commission/tax)", () => {
    const source = stripComments(readFileSync("lib/finance/read.ts", "utf8"));
    // Every DTO value is `Number(row.column)` coercion only. The ONE legitimate `*` in this file
    // (Feature 008 T023) is `page * boundedPageSize` — converting a page NUMBER to a row OFFSET for
    // `.range()`, mirroring `lib/orders/read.ts#getOrdersForOrganization`'s exact own pagination
    // arithmetic — never a money/commission/tax value. Lines performing that pagination arithmetic
    // are excluded by name (`boundedPageSize`); nothing else in this file may contain `*` (block
    // comments, which could legitimately contain `*`, are already stripped above; `/` is excluded
    // from this check since import specifiers legitimately contain it, e.g. `@/lib/finance/types`).
    const nonPaginationLines = source
      .split("\n")
      .filter((line) => !line.includes("boundedPageSize"))
      .join("\n");
    expect(nonPaginationLines).not.toMatch(/\*/);
  });
});

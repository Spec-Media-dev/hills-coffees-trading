import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 010 Phase 10 — T033: `tests/admin/no-hard-delete.test.ts` (this file). Literal task: "no
 * console path deletes commercial, inventory, title, payment or audit rows." Depends: Phases 3–9.
 *
 * ── STATUS (2026-09-17) ─────────────────────────────────────────────────────────────────────────
 * The CURRENT console (everything on disk today) is proven here: zero runtime `.delete()` calls
 * anywhere in `lib/admin`, `components/admin` or `src/app/dashboard-admin` (only three DOCSTRING
 * mentions of the word exist, stripped before matching), and — defence in depth — `authenticated`
 * holds NO database DELETE grant on any table the console actually reads or writes (derived from
 * the console's own `.from("…")` calls, not a hand-maintained list, so a newly added table is
 * covered automatically). That is the honest, exhaustive proof available TODAY.
 *
 * The literal `Depends: Phases 3–9` is **NOT fully satisfied**: only T013–T015 (Feature 008 finance
 * layer) remain open (T027/T029 closed with DB-OPEN-21, Database hygiene M1, 2026-09-20). A
 * no-delete proof cannot honestly claim to cover a payment-review queue or a settlement decision
 * surface that DOES NOT EXIST — there is nothing there to grep. T010 (organization suspension) closed
 * in RUN J (DB-OPEN-22 organizations read path) and its surface is part of the console scan above;
 * `organizations` carries no DELETE grant. No delete path is introduced anywhere merely to give this
 * test something to check. T033 therefore stays PARTIAL.
 *
 * T012 (disputes) closed in the Feature 010 dispute-unblock run (2026-09-19) and IS covered below:
 * the console dispute surface composes Feature 012's layer (`lib/disputes/read.ts`,
 * `lib/disputes/compliance.ts`), so those composed files are scanned too, and the dispute tables carry
 * no DELETE grant (`dispute_status_history` additionally refuses DELETE in its own trigger —
 * live-proven by Feature 012). `npm test -- admin/no-hard-delete` passes today.
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const CONSOLE_ROOTS = ["lib/admin", "components/admin", "src/app/dashboard-admin"] as const;
const CONSOLE_FILES = CONSOLE_ROOTS.flatMap((r) => walk(r));

function schemaReport(): { table_grants: { table_name: string; grantee: string; privilege: string }[] } {
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

describe("T033 — no console path (current disk state) issues a runtime .delete() anywhere", () => {
  it("zero .delete( calls in lib/admin, components/admin or src/app/dashboard-admin — comments stripped, so a docstring naming the rule is not mistaken for a violation", () => {
    expect(CONSOLE_FILES.length).toBeGreaterThan(60);
    const offenders: { file: string; line: string }[] = [];
    for (const file of CONSOLE_FILES) {
      const src = stripComments(source(file));
      for (const match of src.matchAll(/.*\.delete\([^)]*\).*/g)) offenders.push({ file, line: match[0].trim() });
    }
    expect(offenders).toEqual([]);
  });

  it("every table the console's .from(\"…\") calls actually name has NO DELETE grant for `authenticated` (or `anon`) — derived from the console's own code, not a hand-maintained list", () => {
    const tables = new Set<string>();
    for (const file of CONSOLE_FILES) {
      const src = stripComments(source(file));
      for (const match of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) tables.add(match[1]);
    }
    expect(tables.size).toBeGreaterThan(15);
    const { table_grants } = schemaReport();
    const violations: string[] = [];
    for (const table of tables) {
      const grantees = table_grants.filter((g) => g.table_name === table && g.privilege === "DELETE").map((g) => g.grantee);
      if (grantees.includes("authenticated") || grantees.includes("anon")) violations.push(`${table}: ${grantees.join(",")}`);
    }
    expect(violations).toEqual([]);
  });

  it("commercial/inventory/title/payment/audit tables that DO exist in the console today carry no DELETE grant for authenticated, named explicitly (not only via the dynamic scan above)", () => {
    const NAMED_TABLES = [
      // commercial / catalogue
      "coffees", "coffee_offers", "origins", "regions", "coffee_types", "coffee_varieties", "processing_methods", "packaging_types", "tags", "coffee_media",
      // inventory / title
      "inventory_positions", "inventory_reservations", "inventory_reservation_items", "inventory_ownership_events", "storage_allocations", "order_shipments", "shipment_items", "warehouses", "warehouse_locations",
      // payment (read-only surface today, but the grant itself is checked regardless)
      "payments", "payment_proofs", "payment_reviews", "payouts", "tax_invoices",
      // audit
      "audit_logs",
      // system configuration (Phase 9)
      "platform_admins", "commission_policies", "commission_tiers", "tax_rules", "shipping_rules", "payment_accounts",
    ] as const;
    const { table_grants } = schemaReport();
    for (const table of NAMED_TABLES) {
      const grantees = table_grants.filter((g) => g.table_name === table && g.privilege === "DELETE").map((g) => g.grantee);
      expect(grantees, table).not.toContain("authenticated");
      expect(grantees, table).not.toContain("anon");
    }
  });

  it("T012 dispute surface: the console composes Feature 012's layer, and neither the console files nor the composed Feature 012 files issue a .delete(); the dispute tables carry no DELETE grant", () => {
    const composed = ["lib/disputes/read.ts", "lib/disputes/compliance.ts", ...CONSOLE_FILES.filter((file) => /disputes|dispute-/.test(file))];
    expect(composed.length).toBeGreaterThanOrEqual(6);
    for (const file of composed) expect(stripComments(source(file)), file).not.toMatch(/\.delete\(/);
    const { table_grants } = schemaReport();
    for (const table of ["disputes", "dispute_evidence"]) {
      const grantees = table_grants.filter((g) => g.table_name === table && g.privilege === "DELETE").map((g) => g.grantee);
      expect(grantees, table).not.toContain("authenticated");
      expect(grantees, table).not.toContain("anon");
    }
    // `dispute_status_history` post-dates the baseline report: its migration grants SELECT only.
    const migration = stripComments(source("supabase", "migrations", "20260919120000_feature_012_dispute_status_history.sql").replace(/--[^\n]*/g, ""));
    expect(migration).toMatch(/grant select on table public\.dispute_status_history to authenticated;/);
    expect(migration).not.toMatch(/grant[^;]*delete[^;]*dispute_status_history/i);
  });

  it("the Phase 3–9 dependency is honestly NOT fully closed — T013–T015 (Feature 008) remain open, so this proof cannot and does not claim exhaustive Phase 3–9 coverage", async () => {
    const tasks = source("specs", "010-admin-operations-console", "tasks.md");
    for (const task of ["T013", "T014", "T015"]) {
      expect(tasks, task).toMatch(new RegExp(`- \\[ \\] ${task}\\b`));
    }
  });
});

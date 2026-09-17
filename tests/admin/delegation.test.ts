import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 010 Phase 10 — T031: `tests/admin/delegation.test.ts` (this file). Literal task: "the
 * console contains no direct `admin_review_payment` call and no raw shipment/inventory write."
 * Depends: T014 (settlement decision UI calling Feature 008's `decidePayment`), T017 (the warehouse
 * operation map with no raw shipment write).
 *
 * ── STATUS (2026-09-17, re-checked) ────────────────────────────────────────────────────────────
 * T017 is COMPLETE (RUN D) — the warehouse layer has no raw shipment/inventory write path, proven
 * below and in `tests/admin/warehouse-operations.test.ts`. T014 is BLOCKED — Feature 008 has not
 * supplied `decidePayment()` (confirmed absent again in this run: `grep -rn decidePayment lib src
 * components` returns nothing), so NO settlement decision UI exists in Feature 010 at all — there is
 * nothing to call `admin_review_payment` OR `decidePayment` from. This file proves the structural
 * guarantee that MUST hold regardless (no direct settlement call, no raw domain write), but per the
 * literal `Depends: T014` this task stays UNCHECKED/BLOCKED until Feature 008 supplies `decidePayment`
 * and Feature 010 builds the decision UI that calls it — a currently-empty settlement surface is not
 * the same thing as a proven delegation. `npm test -- admin/delegation` passes on its own, today.
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
const CONSOLE_FILES = CONSOLE_ROOTS.flatMap((root_) => walk(root_));

describe("T031 — no direct admin_review_payment (or Feature 008's decidePayment substitute) call anywhere in the console", () => {
  it("Feature 008 has not supplied decidePayment(); this file confirms it again, live in this run, rather than trusting a stale RUN C finding", () => {
    for (const file of walk("lib/finance")) {
      expect(stripComments(source(file)), file).not.toContain("export async function decidePayment");
      expect(stripComments(source(file)), file).not.toContain("export function decidePayment");
    }
  });

  it("no console file (lib/admin, components/admin, src/app/dashboard-admin) contains a runtime reference to admin_review_payment or submit_payment_proof", () => {
    expect(CONSOLE_FILES.length).toBeGreaterThan(40);
    for (const file of CONSOLE_FILES) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/admin_review_payment/);
      expect(src, file).not.toMatch(/submit_payment_proof/);
    }
  });

  it("no console file performs an INSERT/UPDATE/UPSERT/DELETE on payments, payment_proofs, payment_reviews, payouts, tax_invoices or order_financials", () => {
    const FINANCE_TABLES = ["payments", "payment_proofs", "payment_reviews", "payouts", "tax_invoices", "order_financials"] as const;
    for (const file of CONSOLE_FILES) {
      const src = stripComments(source(file));
      for (const table of FINANCE_TABLES) {
        for (const call of src.matchAll(new RegExp(`\\.from\\(\\s*"${table}"\\s*\\)([\\s\\S]{0,200})`, "g"))) {
          expect(call[1], `${file}: .from("${table}")`).not.toMatch(/\.(insert|update|upsert|delete)\(/);
        }
      }
    }
  });
});

describe("T031 — no raw shipment/inventory write anywhere in the console (T017, COMPLETE)", () => {
  const RAW_TABLES = ["order_shipments", "shipment_items", "inventory_positions", "inventory_reservations", "inventory_reservation_items", "storage_allocations", "inventory_ownership_events"] as const;

  it("no console file performs an INSERT/UPDATE/UPSERT/DELETE on any shipment or inventory table — the console reads them and delegates every write to Feature 009's own named functions", () => {
    for (const file of CONSOLE_FILES) {
      const src = stripComments(source(file));
      for (const table of RAW_TABLES) {
        for (const call of src.matchAll(new RegExp(`\\.from\\(\\s*"${table}"\\s*\\)([\\s\\S]{0,200})`, "g"))) {
          expect(call[1], `${file}: .from("${table}")`).not.toMatch(/\.(insert|update|upsert|delete)\(/);
        }
      }
    }
  });

  it("the warehouse console's only writes are Feature 009's OWN named functions (`warehouseOperations[spec.key]` / `warehouseOperations.recordDelivery`, dynamically dispatched by the SAME operation key `lib/delivery/warehouse.ts` exports), called with the shipment id only — never a raw table mutation", () => {
    const warehouse = stripComments(source("lib", "admin", "warehouse.ts"));
    expect(warehouse).toContain("import * as warehouseOperations from \"@/lib/delivery/warehouse\";");
    expect(warehouse).toContain("warehouseOperations[spec.key]({ shipmentId })");
    expect(warehouse).toContain("warehouseOperations.recordDelivery(parsed.data)");
    expect(warehouse).not.toMatch(/\.from\(\s*"(order_shipments|shipment_items)"\s*\)\s*\.(insert|update|upsert|delete)\(/);
    // Every dispatch key the console can reach really exists as an export on Feature 009's own module.
    const delivery = stripComments(source("lib", "delivery", "warehouse.ts"));
    for (const fn of ["confirmCapacity", "markReady", "reserve", "startPicking", "book", "dispatch", "fail", "cancel", "recordDelivery"]) {
      expect(delivery, fn).toContain(`export async function ${fn}(`);
    }
  });

  it("no console file uses a service role or a shared/operational cache for shipment or inventory data", () => {
    for (const file of CONSOLE_FILES) {
      const src = stripComments(source(file));
      expect(src, file).not.toMatch(/SERVICE_ROLE|service_role/);
      if (RAW_TABLES.some((table) => src.includes(table))) {
        expect(src, file).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife/);
      }
    }
  });
});

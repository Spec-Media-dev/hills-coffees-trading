import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Structural DTO boundary check (Feature 002, T011 — FR-003, SEC-005, SC-002).
 *
 * This is the SECONDARY net. The primary proof is the canary test, which follows private *values*
 * through the public boundary; this suite is the cheap, fast, offline check that catches the same
 * class of mistake earlier — a denylisted column name, a denylisted table, or a broad select
 * creeping into the public read layer.
 *
 * It is deliberately source-level rather than type-level: renaming a DTO property would defeat a
 * type assertion, and a `select("*")` is invisible to the type system entirely. Reading the files
 * catches both.
 *
 * On its own this suite is INSUFFICIENT (contract §5: "Test 2 alone is insufficient — renaming a
 * field in a DTO would defeat it"). It is meant to run beside `canary-leakage.test.ts`, never
 * instead of it.
 */

const PUBLIC_LIB_DIR = resolve(process.cwd(), "lib", "public");

/** Every `.ts` file under `lib/public/`, recursively. */
function publicLibFiles(dir: string = PUBLIC_LIB_DIR): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...publicLibFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Tables that must never be queried, joined to, or even named in the public read layer
 * (`contracts/public-dto-allowlist.md` §3).
 *
 * `warehouses` is in this list even though RLS exposes it: it carries owner identity and an exact
 * address, which SEO-APP-02 forbids on a public surface. RLS readability is not publication
 * authority.
 */
const DENYLISTED_TABLES = [
  "coffee_offers",
  "coffee_lots",
  "warehouses",
  "orders",
  "order_items",
  "order_financials",
  "payments",
  "payment_proofs",
  "payment_reviews",
  "payment_accounts",
  "proforma_invoices",
  "tax_invoices",
  "payouts",
  "commission_policies",
  "commission_tiers",
  "tax_rules",
  "shipping_rules",
  "inventory_positions",
  "inventory_reservations",
  "inventory_reservation_items",
  "inventory_ownership_events",
  "storage_allocations",
  "organizations",
  "organization_members",
  "profiles",
  "kyb_applications",
  "kyb_documents",
  "kyb_reviews",
  "file_assets",
  "coffee_documents",
  "dispute_evidence",
  "disputes",
  "audit_logs",
  "notifications",
  "support_tickets",
  "support_messages",
  "agreement_acceptances",
  "offer_sensory_notes",
  "listing_reviews",
] as const;

/**
 * Column names that must never appear in the public read layer — either as a selected column or as
 * a DTO property (contract §3).
 */
const DENYLISTED_FIELDS = [
  "owner_organization_id",
  "seller_organization_id",
  "source_organization_id",
  "created_by",
  "updated_by",
  "unit_price_per_kg",
  "total_quantity_kg",
  "reserved_quantity_kg",
  "quality_grade",
  "cup_score",
  "crop_year",
  "lot_code",
  "certificate_number",
  "commission_percentage_snapshot",
  "commission_amount",
  "is_visible",
] as const;

describe("public read layer — structural boundary", () => {
  const files = publicLibFiles();

  it("finds the public read layer", () => {
    // Guards against the whole suite silently passing because the directory moved or is empty.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [file] as const))(
    "%s selects an explicit column allowlist",
    (file) => {
      const source = readFileSync(file, "utf8");

      // `select("*")` in any quoting style, and the implicit-all `select()` with no argument.
      expect(source).not.toMatch(/\.select\(\s*['"`]\s*\*/);
      expect(source).not.toMatch(/\.select\(\s*\)/);
    }
  );

  it.each(files.map((file) => [file] as const))(
    "%s spreads no database row into a DTO",
    (file) => {
      const source = readFileSync(file, "utf8");

      // A spread of anything named like a database row is how an added private column silently
      // starts being published. Mappers in this layer copy named fields one at a time instead.
      expect(source).not.toMatch(/\.\.\.\s*row\b/);
      expect(source).not.toMatch(/\.\.\.\s*data\b/);
    }
  );

  it.each(files.map((file) => [file] as const))(
    "%s names no denylisted table",
    (file) => {
      const source = readFileSync(file, "utf8");
      const found = DENYLISTED_TABLES.filter((table) =>
        new RegExp(`\\b${table}\\b`).test(source)
      );
      expect(found).toEqual([]);
    }
  );

  it.each(files.map((file) => [file] as const))(
    "%s names no denylisted field",
    (file) => {
      const source = readFileSync(file, "utf8");
      const found = DENYLISTED_FIELDS.filter((field) =>
        new RegExp(`\\b${field}\\b`).test(source)
      );
      expect(found).toEqual([]);
    }
  );

  it("never resolves request identity on the public surface", () => {
    // SEC-002: a public cache entry that varied by identity would be served to the wrong visitor.
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toMatch(/getRequestIdentity/);
    }
  });

  it("introduces no external cache and no Cache Components API", () => {
    // Constitution XI and the cache contract §1: Feature 001's pinned API, and nothing else.
    const forbidden = [
      /\buse cache\b/,
      /cacheLife\s*\(/,
      /cacheTag\s*\(/,
      /updateTag\s*\(/,
      /cacheComponents/,
      /\bredis\b/i,
      /\bupstash\b/i,
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});

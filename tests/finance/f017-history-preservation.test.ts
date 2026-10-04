import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Feature 017: T005 & T026 — Historical Financial Evidence Preservation Tests
 *
 * Verifies that Feature 017 preserves:
 * 1. Historical Feature 008 migration, rollback, and postflight files.
 * 2. Historical provider-related database schema definitions and column names.
 * 3. Historical function bodies and signatures without requiring active runtime execution.
 * 4. Preservation exclusions from runtime-absence scans.
 */

const F008_MIGRATION = resolve(process.cwd(), "supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql");
const F008_ROLLBACK = resolve(process.cwd(), "supabase/rollback/20260922120000_feature_008_stripe_trusted_funding.rollback.sql");
const F008_POSTFLIGHT = resolve(process.cwd(), "supabase/maintenance/20260922_feature_008_stripe_trusted_funding_postflight.sql");

describe("T005 / T026 — Historical Feature 008 Artifact Preservation", () => {
  it("preserves Feature 008 migration file with historical definitions", () => {
    expect(existsSync(F008_MIGRATION)).toBe(true);
    const sql = readFileSync(F008_MIGRATION, "utf8");

    // Historical definitions
    expect(sql).toContain("create or replace function public.record_stripe_payment_intent");
    expect(sql).toContain("create or replace function public.record_payment_transfer");
    expect(sql).toContain("create or replace function public.ingest_stripe_event");
    expect(sql).toContain("create or replace function public.admin_review_payment");

    // Historical tables and columns
    expect(sql).toContain("payment_events");
    expect(sql).toContain("create table public.payment_transfers");
    expect(sql).toContain("trusted_funding_confirmed_at");
    expect(sql).toContain("trusted_funding_event_id");
  });

  it("preserves Feature 008 rollback artifact", () => {
    expect(existsSync(F008_ROLLBACK)).toBe(true);
    const sql = readFileSync(F008_ROLLBACK, "utf8");
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toContain("admin_review_payment");
    expect(sql).toContain("record_stripe_payment_intent");
    expect(sql).toContain("record_payment_transfer");
    expect(sql).toContain("ingest_stripe_event");
    expect(sql).toContain("payment_transfers");
  });

  it("preserves Feature 008 postflight verification artifact", () => {
    expect(existsSync(F008_POSTFLIGHT)).toBe(true);
    const sql = readFileSync(F008_POSTFLIGHT, "utf8");
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toContain("payment_transfers");
    expect(sql).toContain("payment_events");
  });

  it("preserves provider schema names in migration evidence", () => {
    const migrationSql = readFileSync(F008_MIGRATION, "utf8");
    const providerSchemaNames = [
      "payment_events",
      "payment_transfers",
      "trusted_funding_confirmed_at",
      "trusted_funding_event_id",
      "record_stripe_payment_intent",
      "record_payment_transfer",
      "ingest_stripe_event",
      "admin_review_payment",
    ];

    for (const name of providerSchemaNames) {
      expect(migrationSql).toContain(name);
    }
  });

  it("inspects historical evidence without retaining Stripe SDK dependencies", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    expect(manifest.dependencies?.stripe).toBeUndefined();
    expect(manifest.dependencies?.["@stripe/stripe-js"]).toBeUndefined();
  });
});

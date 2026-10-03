import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ACTIVE_NOTIFICATION_TYPES, NOTIFICATION_TYPE_METADATA } from "@/lib/notifications/types";

describe("Feature 016 T048: Notifications & Audit Integration Invariants", () => {
  it("verifies all Feature 016 notification types are present in active taxonomy", () => {
    expect(ACTIVE_NOTIFICATION_TYPES).toContain("PAYMENT_PROOF_SUBMITTED");
    expect(ACTIVE_NOTIFICATION_TYPES).toContain("PAYMENT_CONFIRMED");
    expect(ACTIVE_NOTIFICATION_TYPES).toContain("PAYMENT_REJECTED");
    expect(ACTIVE_NOTIFICATION_TYPES).toContain("DELIVERY_HANDOFF_REQUESTED");

    expect(NOTIFICATION_TYPE_METADATA.PAYMENT_PROOF_SUBMITTED.category).toBe("PAYMENT_INVOICES");
    expect(NOTIFICATION_TYPE_METADATA.PAYMENT_CONFIRMED.category).toBe("PAYMENT_INVOICES");
    expect(NOTIFICATION_TYPE_METADATA.PAYMENT_REJECTED.category).toBe("PAYMENT_INVOICES");
    expect(NOTIFICATION_TYPE_METADATA.DELIVERY_HANDOFF_REQUESTED.category).toBe("SHIPMENT_UPDATES");
  });

  it("verifies Server Actions do NOT contain notification insert statements (Single Notification Owner)", () => {
    const actionsFilePath = path.resolve(
      process.cwd(),
      "src/app/dashboard-admin/(finance)/payments/actions.ts"
    );
    const content = fs.readFileSync(actionsFilePath, "utf8");

    // Must not insert into notifications table from server action
    expect(content).not.toMatch(/\.from\(\s*["']notifications["']\s*\)\.insert/);
    expect(content).not.toMatch(/insert\s+into\s+notifications/i);

    // Must document single notification ownership by DB triggers
    expect(content).toContain("Single Notification Owner");
    expect(content).toContain("trg_notify_order_status_change");
    expect(content).toContain("trg_notify_shipment_status_change");
  });

  it("verifies DAL layer review.ts does NOT contain notification insert statements", () => {
    const reviewFilePath = path.resolve(process.cwd(), "lib/finance/review.ts");
    const content = fs.readFileSync(reviewFilePath, "utf8");

    expect(content).not.toMatch(/\.from\(\s*["']notifications["']\s*\)\.insert/);
    expect(content).not.toMatch(/insert\s+into\s+notifications/i);
  });

  it("verifies migration SQL contains deduplication logic and warehouse recipient resolution", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Notification triggers
    expect(sql).toContain("trg_notify_shipment_status_change");
    expect(sql).toContain("commerce_notify_shipment_status_change");
    expect(sql).toContain("DELIVERY_HANDOFF_REQUESTED");

    // Warehouse recipient join
    expect(sql).toContain("public.warehouses w");
    expect(sql).toContain("public.organization_members om");
    expect(sql).toContain("w.owner_organization_id");

    // Deduplication check
    expect(sql).toContain("not exists (");
  });

  it("verifies audit log write for FINANCE_PAYMENT_REVIEW is defined in migration", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("insert into public.audit_logs");
    expect(sql).toContain("'FINANCE_PAYMENT_REVIEW'");
    expect(sql).toContain("'orders'");
  });
});

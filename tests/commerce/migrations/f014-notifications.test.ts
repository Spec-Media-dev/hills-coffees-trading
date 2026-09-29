import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Feature 014 — In-App Notifications Lifecycle Migration Static Tests.
 *
 * Asserts all security, search_path, privilege, and parameter invariants
 * over the migration and postflight files before any database application.
 */

const migrationPath = "supabase/migrations/20260929100000_feature_014_notifications_lifecycle.sql";
const rollbackPath = "supabase/rollback/20260929100000_feature_014_notifications_lifecycle.rollback.sql";
const postflightPath = "supabase/maintenance/20260929_feature_014_notifications_lifecycle_postflight.sql";

const forward = readFileSync(migrationPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const postflight = readFileSync(postflightPath, "utf8");

function functionBody(name: string): string {
  const start = forward.indexOf(`create or replace function public.${name}`);
  expect(start, `Function ${name} not found in forward migration`).toBeGreaterThan(-1);
  const end = forward.indexOf("$function$;", start) !== -1 
    ? forward.indexOf("$function$;", start)
    : forward.indexOf("$$;", start);
  expect(end, `Function terminator for ${name} not found`).toBeGreaterThan(start);
  return forward.slice(start, end);
}

describe("Feature 014 — Notifications Lifecycle Migration Static Security", () => {
  it("declares SECURITY DEFINER and hardened search_path on all RPCs", () => {
    const rpcs = [
      "mark_notification_read",
      "mark_all_notifications_read",
      "get_unread_notification_count",
      "commerce_notify_order_status_change",
    ];

    for (const rpc of rpcs) {
      const body = functionBody(rpc);
      expect(body, `${rpc} must be SECURITY DEFINER`).toMatch(/security\s+definer/i);
      expect(body, `${rpc} must set hardened search_path`).toMatch(/set\s+search_path\s*=\s*pg_catalog,\s*public/i);
    }
  });

  it("derives caller identity internally via auth.uid() without caller user_id parameter", () => {
    // mark_notification_read must only take notification_id
    const markReadSig = forward.match(/create or replace function public\.mark_notification_read\(([^)]*)\)/);
    expect(markReadSig).not.toBeNull();
    const markReadParams = markReadSig![1];
    expect(markReadParams).not.toMatch(/user_id/i);
    expect(markReadParams).toMatch(/p_notification_id\s+uuid/i);

    // mark_all_notifications_read must take zero arguments
    const markAllSig = forward.match(/create or replace function public\.mark_all_notifications_read\(([^)]*)\)/);
    expect(markAllSig).not.toBeNull();
    expect(markAllSig![1].trim()).toBe("");

    // get_unread_notification_count must take zero arguments
    const countSig = forward.match(/create or replace function public\.get_unread_notification_count\(([^)]*)\)/);
    expect(countSig).not.toBeNull();
    expect(countSig![1].trim()).toBe("");

    const markReadBody = functionBody("mark_notification_read");
    expect(markReadBody).toContain("auth.uid()");
    expect(markReadBody).toContain("user_id = auth.uid()");

    const markAllBody = functionBody("mark_all_notifications_read");
    expect(markAllBody).toContain("auth.uid()");
    expect(markAllBody).toContain("user_id = auth.uid()");

    const countBody = functionBody("get_unread_notification_count");
    expect(countBody).toContain("auth.uid()");
    expect(countBody).toContain("user_id = auth.uid()");
  });

  it("strictly constrains mutation to read_at on own notifications", () => {
    const markReadBody = functionBody("mark_notification_read");
    expect(markReadBody).toMatch(/set\s+read_at\s*=/i);
    expect(markReadBody).not.toMatch(/set\s+(?:title|body|notification_type|user_id|organization_id|created_at)\s*=/i);

    const markAllBody = functionBody("mark_all_notifications_read");
    expect(markAllBody).toMatch(/set\s+read_at\s*=/i);
    expect(markAllBody).not.toMatch(/set\s+(?:title|body|notification_type|user_id|organization_id|created_at)\s*=/i);
  });

  it("narrows execution grants to authenticated only (revokes from public, anon, service_role)", () => {
    const rpcs = [
      "mark_notification_read(uuid)",
      "mark_all_notifications_read()",
      "get_unread_notification_count()",
    ];

    for (const rpc of rpcs) {
      expect(forward).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc.replace("(", "\\(").replace(")", "\\)")}\\s+from\\s+public,\\s*anon,\\s*service_role`, "i"));
      expect(forward).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${rpc.replace("(", "\\(").replace(")", "\\)")}\\s+to\\s+authenticated`, "i"));
    }
  });

  it("creates partial index on unread notifications for high-performance badge queries", () => {
    expect(forward).toMatch(/create\s+index\s+if\s+not\s+exists\s+idx_notifications_unread\s+on\s+public\.notifications\s*\(\s*user_id\s*\)\s+where\s+read_at\s+is\s+null/i);
  });

  it("attaches order status notification trigger strictly for active commercial flows (no cancelled scope)", () => {
    const triggerBody = functionBody("commerce_notify_order_status_change");
    expect(triggerBody).toContain("PROFORMA_ISSUED");
    expect(triggerBody).toContain("HOLD");
    expect(triggerBody).toContain("EXPIRED");
    // Cancelled scope must NEVER be referenced
    expect(triggerBody).not.toMatch(/PAYMENT_PROOF_SUBMITTED|DELIVERY|STRIPE|SETTLEMENT/i);

    expect(forward).toContain("trg_notify_order_status_change");
    expect(forward).toMatch(/create trigger trg_notify_order_status_change\s+after update of status on public\.orders/i);
  });

  it("rollback completely removes all added functions, trigger, and index", () => {
    expect(rollback).toContain("drop trigger if exists trg_notify_order_status_change on public.orders");
    expect(rollback).toContain("drop function if exists public.commerce_notify_order_status_change()");
    expect(rollback).toContain("drop function if exists public.mark_notification_read(uuid)");
    expect(rollback).toContain("drop function if exists public.mark_all_notifications_read()");
    expect(rollback).toContain("drop function if exists public.get_unread_notification_count()");
    expect(rollback).toContain("drop index if exists public.idx_notifications_unread");
  });

  it("postflight contains deterministic validation checks", () => {
    expect(postflight).toContain("idx_notifications_unread");
    expect(postflight).toContain("mark_notification_read");
    expect(postflight).toContain("mark_all_notifications_read");
    expect(postflight).toContain("get_unread_notification_count");
    expect(postflight).toContain("trg_notify_order_status_change");
  });
});

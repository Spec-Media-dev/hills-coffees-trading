import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { HistoryTimeline } from "@/components/audit/history-timeline";
import { HISTORY_ACCESS_MATRIX } from "@/lib/audit/access";
import { FOUNDATION_FIXTURES, INVENTORY_FIXTURES, signInAsFixture, verifyInventoryAppendOnlyGuard } from "@/tests/auth/fixture-session";

/**
 * Feature 012 — T020: no delete/edit path exists for the accountability record, and the database
 * refuses ownership-event mutation (FR-003, SC-003, OPS-02, LOT-03). Corrections are new records only.
 *
 * Static checks read real product source (comments stripped) and the committed schema report.
 * Live checks run under real sessions; the one privileged probe is Feature 005's existing fixture
 * command `--verify-inventory-append-only`, which proves the `prevent_ownership_event_mutation`
 * trigger refuses even a write that bypasses RLS. Nothing here adds a mutation in order to test it.
 */

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

function filesUnder(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((entry) => {
    const full = path.join(root, dir, entry);
    if (statSync(full).isDirectory()) return filesUnder(path.join(dir, entry));
    return /\.(ts|tsx)$/.test(entry) ? [path.join(dir, entry)] : [];
  });
}
const PRODUCT_FILES = [...filesUnder("lib"), ...filesUnder("src"), ...filesUnder("components")];

/** The accountability record Feature 012 protects: histories, ownership ledger, audit log, disputes, evidence. */
const PROTECTED = ["order_status_history", "listing_status_history", "account_status_history", "inventory_ownership_events", "audit_logs", "disputes", "dispute_evidence"] as const;
const APPEND_ONLY = ["order_status_history", "listing_status_history", "account_status_history", "inventory_ownership_events", "audit_logs", "dispute_evidence"] as const;

const report = JSON.parse(JSON.parse(read("docs/database/database-schema-report.json"))[0].database_schema_report);

afterEach(() => cleanup());

describe("No delete/edit path exists in product code", () => {
  it("no product file DELETEs any protected record", () => {
    for (const file of PRODUCT_FILES) {
      const code = stripComments(read(file));
      for (const table of PROTECTED) {
        expect(code, `${file} deletes ${table}`).not.toMatch(new RegExp(`from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,300}?\\.delete\\(`));
      }
    }
  });

  it("no product file UPDATEs or UPSERTs a history, ledger, audit or evidence row; `disputes` is updated ONLY by the compliance transition module", () => {
    for (const file of PRODUCT_FILES) {
      const code = stripComments(read(file));
      for (const table of APPEND_ONLY) {
        expect(code, `${file} updates ${table}`).not.toMatch(new RegExp(`from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,300}?\\.(update|upsert)\\(`));
      }
      if (!file.endsWith(path.join("disputes", "compliance.ts"))) {
        expect(code, `${file} updates disputes`).not.toMatch(/from\(\s*["'`]disputes["'`]\s*\)[\s\S]{0,300}?\.(update|upsert)\(/);
      }
    }
  });

  it("no product file writes the ownership ledger or any status-history table directly (they are written only by approved DB functions/triggers)", () => {
    for (const file of PRODUCT_FILES) {
      const code = stripComments(read(file));
      for (const table of ["order_status_history", "listing_status_history", "account_status_history", "inventory_ownership_events", "audit_logs"]) {
        expect(code, `${file} inserts ${table}`).not.toMatch(new RegExp(`from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,300}?\\.insert\\(`));
      }
    }
  });

  it("the history domain (lib/audit) exposes reads only", () => {
    for (const file of filesUnder("lib/audit")) {
      expect(stripComments(read(file)), file).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    }
  });

  it("the history components have no edit/delete/mutation affordance or callback prop", () => {
    for (const file of filesUnder("components/audit")) {
      const code = stripComments(read(file));
      expect(code, file).not.toMatch(/\bon(Edit|Delete|Remove|Correct|Change|Click|Submit|Select)\b|<button|<form|<input|action=|formAction|"use client"/);
    }
    const propsBlock = read("components/audit/history-timeline.tsx").match(/export type HistoryTimelineProps = \{([\s\S]*?)\};/)![1]!;
    const propNames = [...propsBlock.matchAll(/readonly (\w+)\??:/g)].map((match) => match[1]).sort();
    expect(propNames).toEqual(["emptyMessage", "entries", "labelledBy"]);
    const entryBlock = read("components/audit/history-timeline.tsx").match(/export type HistoryTimelineEntry = \{([\s\S]*?)\};/)![1]!;
    expect(entryBlock).not.toMatch(/=>|Function|\bon[A-Z]/);
  });

  it("a rendered timeline contains no interactive control at all, and shows only the fields it was given", () => {
    const { container } = render(
      createElement(HistoryTimeline, {
        labelledBy: "h",
        entries: [
          { id: "1", occurredAt: "2026-09-19T00:00:00Z", title: "Draft → Confirmed", actor: "not-recorded" },
          { id: "2", occurredAt: "2026-09-19T01:00:00Z", title: "Confirmed → On hold", reason: "<b>payment window</b>", correlationId: "ef7040e3-86eb-494a-a2d5-cffb06b93dba" },
        ],
      }),
    );
    expect(container.querySelectorAll("button, a, input, select, textarea, form, [contenteditable], [tabindex]")).toHaveLength(0);
    const [first, second] = [...container.querySelectorAll('[data-slot="history-entry"]')];
    expect(first!.querySelector('[data-slot="history-reason"]')).toBeNull();
    expect(first!.querySelector('[data-slot="correlation-id"]')).toBeNull();
    expect(second!.querySelector('[data-slot="history-actor"]')).toBeNull();
    expect(second!.querySelector('[data-slot="correlation-id"]')?.className).toMatch(/font-mono/);
    expect(second!.querySelector("b")).toBeNull();
  });
});

describe("The database grants no write path and still refuses ownership-event mutation", () => {
  it("every protected append-only table has SELECT policies only — no INSERT/UPDATE/DELETE policy for any role", () => {
    for (const table of APPEND_ONLY.filter((name) => name !== "dispute_evidence")) {
      const commands = report.rls_policies.filter((policy: { table_name: string }) => policy.table_name === table).map((policy: { command: string }) => policy.command);
      expect(commands.length, table).toBeGreaterThan(0);
      expect(commands.every((command: string) => command === "SELECT"), `${table}: ${commands}`).toBe(true);
    }
    const evidence = report.rls_policies.filter((policy: { table_name: string }) => policy.table_name === "dispute_evidence").map((policy: { command: string }) => policy.command).sort();
    expect(evidence).toEqual(["INSERT", "SELECT"]); // append (add a note), never edit or delete
    const disputes = report.rls_policies.filter((policy: { table_name: string }) => policy.table_name === "disputes").map((policy: { command: string }) => policy.command).sort();
    expect(disputes).toEqual(["INSERT", "SELECT", "UPDATE"]); // UPDATE is compliance-only (disputes_ops_update); no DELETE
    for (const table of PROTECTED) {
      const grants = report.table_grants.filter((grant: { table_name: string; grantee: string }) => grant.table_name === table && grant.grantee === "authenticated").map((grant: { privilege: string }) => grant.privilege);
      expect(grants, `${table} authenticated grants`).not.toContain("DELETE");
    }
  });

  it("the ownership ledger's append-only trigger is present, and lib/audit/access.ts mirrors every live history policy", () => {
    const trigger = report.triggers.find((row: { table_name: string; trigger_name: string }) => row.table_name === "inventory_ownership_events" && row.trigger_name === "trg_ownership_events_append_only");
    expect(trigger?.function_name).toBe("prevent_ownership_event_mutation");
    const policyNames = new Set(report.rls_policies.map((policy: { policy_name: string }) => policy.policy_name));
    for (const entry of Object.values(HISTORY_ACCESS_MATRIX)) {
      for (const name of [...entry.policy.matchAll(/(\w+):/g)].map((match) => match[1]!)) expect(policyNames.has(name), name).toBe(true);
    }
  });

  it("LIVE: the prevent_ownership_event_mutation trigger refuses a privileged UPDATE (Feature 005's append-only probe)", () => {
    expect(() => verifyInventoryAppendOnlyGuard()).not.toThrow();
  }, 120_000);

  describe("LIVE: a party to the event and a platform-role outsider cannot edit or delete it", () => {
    let member: SupabaseClient;
    let warehouse: SupabaseClient;
    let eventId: string;
    let before: Record<string, unknown>;

    beforeAll(async () => {
      member = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
      warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
      const { data } = await member.from("inventory_ownership_events").select("id, reason, quantity_kg, correlation_id").eq("id", INVENTORY_FIXTURES.events.hillsToOrgA).single();
      eventId = data!.id as string;
      before = data!;
    }, 120_000);

    it("UPDATE and DELETE from the owning party and from WAREHOUSE change nothing", async () => {
      for (const client of [member, warehouse]) {
        const update = await client.from("inventory_ownership_events").update({ reason: "tampered", quantity_kg: 0 }).eq("id", eventId).select("id");
        expect(update.error === null ? update.data : []).toEqual([]);
        const removal = await client.from("inventory_ownership_events").delete().eq("id", eventId).select("id");
        expect(removal.error === null ? removal.data : []).toEqual([]);
      }
      const { data: after } = await member.from("inventory_ownership_events").select("id, reason, quantity_kg, correlation_id").eq("id", eventId).single();
      expect(after).toEqual(before);
    }, 120_000);
  });
});

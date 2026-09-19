import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAppCopy } from "@/lib/app/copy";
import { DISPUTE_EVIDENCE_FILE_CAPABILITY, attachDisputeEvidenceFile } from "@/lib/disputes/evidence-files";
import { NOTIFICATION_LIMITATIONS } from "@/lib/notifications/limitations";

/**
 * Feature 012 RUN B — T021: a regression test that protects DELIBERATE NON-IMPLEMENTATIONS
 * (DB-BLOCK-04 notifications, DB-OPEN-09 dispute freeze, DB-BLOCK-01 evidence files). Each block
 * below FAILS if someone "helpfully" introduces:
 *   - notification creation, or a notification synthesised from another table;
 *   - a mark-read / read-state mechanism, including client/local-storage read flags or an unread count;
 *   - copy claiming that raising a dispute (or a FROZEN dispute) freezes/holds anything;
 *   - an application-side order/shipment/payment/inventory write from the dispute domain;
 *   - an evidence-file path that stores bytes or pretends a file exists.
 * Static checks read the real source/copy/schema; runtime checks drive the real domain functions
 * against a RECORDING fake client and assert the exact set of writes.
 */

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function filesUnder(dir: string): string[] {
  const absolute = path.join(root, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" ? [] : filesUnder(path.join(dir, entry));
    return /\.(ts|tsx)$/.test(entry) ? [path.join(dir, entry)] : [];
  });
}

/** Every PRODUCT source file (tests and the privileged fixture script are not product paths). */
const PRODUCT_FILES = [...filesUnder("lib"), ...filesUnder("src"), ...filesUnder("components")];
const NOTIFICATION_FILES = PRODUCT_FILES.filter((file) => /notification/i.test(file) || file.endsWith(path.join("dashboard", "topbar.tsx")));
const DISPUTE_FILES = PRODUCT_FILES.filter((file) => /disputes?[\\/]|dispute-/.test(file));

function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(leafStrings);
  return [];
}
const sentencesOf = (value: unknown) => leafStrings(value).flatMap((text) => text.split(/(?<=[.!?؟])\s+/));

describe("DB-BLOCK-04 — no notification generation, read state or synthesis exists anywhere in product code", () => {
  it("the recorded limitation flags are all still false", () => {
    expect(NOTIFICATION_LIMITATIONS).toEqual({ blocker: "DB-BLOCK-04", canGenerate: false, canMarkRead: false, deliveryChannelsApproved: false });
  });

  it("the approved schema still has no notification write path (if a migration adds one, this limitation must be revisited, not silently kept)", () => {
    const report = JSON.parse(JSON.parse(read("docs/database/database-schema-report.json"))[0].database_schema_report);
    const policies = report.rls_policies.filter((policy: { table_name: string }) => policy.table_name === "notifications");
    expect(policies.map((policy: { command: string }) => policy.command)).toEqual(["SELECT"]);
    const generators = report.functions.filter((fn: { definition: string }) => /insert\s+into\s+(public\.)?notifications\b/i.test(fn.definition));
    expect(generators).toEqual([]);
  });

  it("no product file inserts, updates, upserts or deletes a notification, or touches read_at", () => {
    for (const file of PRODUCT_FILES) {
      const code = stripComments(read(file));
      expect(code, file).not.toMatch(/from\(\s*["'`]notifications["'`]\s*\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/);
      expect(code, file).not.toMatch(/from\(\s*["'`]notification_deliveries["'`]\s*\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/);
      expect(code, file).not.toMatch(/\bread_at\b/);
    }
  });

  it("no mark-read control, unread count or read-state identifier exists in product code", () => {
    for (const file of PRODUCT_FILES) {
      const code = stripComments(read(file));
      expect(code, file).not.toMatch(/\b(markRead|markAsRead|mark_as_read|markAllRead|unreadCount|unread_count|isUnread|setRead)\b/);
    }
  });

  it("notification surfaces keep no client/local-storage state at all", () => {
    expect(NOTIFICATION_FILES.length).toBeGreaterThanOrEqual(7);
    for (const file of NOTIFICATION_FILES) {
      const code = stripComments(read(file));
      expect(code, file).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/);
    }
    for (const file of PRODUCT_FILES) {
      expect(read(file), file).not.toMatch(/(localStorage|sessionStorage)\.(setItem|getItem)\(\s*["'`][^"'`]*notif/i);
    }
  });

  it("the notification domain reads ONLY its own tables — nothing is synthesised from orders, disputes, payments, deliveries or listings", () => {
    const domain = NOTIFICATION_FILES.filter((file) => !file.endsWith("topbar.tsx"));
    for (const file of domain) {
      const code = stripComments(read(file));
      expect(code, file).not.toMatch(/@\/lib\/(orders|disputes\/(read|member|compliance)|finance|delivery|listings|inventory|kyb|admin)\b/);
      const tables = [...code.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)].map((match) => match[1]);
      for (const table of tables) expect(["notifications", "notification_preferences"], `${file} reads ${table}`).toContain(table);
    }
  });

  it("the notification copy states the limitation in EN and AR and never promises delivery", () => {
    const en = getAppCopy("en");
    const ar = getAppCopy("ar");
    expect(en.notificationCenter.limitation.generate).toMatch(/does not create notifications/);
    expect(en.notificationCenter.limitation.readState).toMatch(/cannot be marked as read/);
    expect(en.notificationPreferences.honesty).toMatch(/does not send notifications/);
    for (const key of ["generate", "readState", "delivery"] as const) expect(ar.notificationCenter.limitation[key]).not.toBe(en.notificationCenter.limitation[key]);
    for (const sentence of sentencesOf([en.notificationCenter, en.notificationPreferences])) {
      if (/\b(send|sent|deliver|arrive|notify you|we'll let you know|you will be notified)\b/i.test(sentence)) expect(sentence, sentence).toMatch(/\b(not|nothing|no)\b/i);
    }
  });
});

describe("DB-OPEN-09 — no automatic freeze is claimed or implemented", () => {
  const en = getAppCopy("en");
  const ar = getAppCopy("ar");

  it("every English dispute/linkage/notification sentence that mentions freezing or holding negates it (or is the bare FROZEN label / record-only description)", () => {
    const sentences = sentencesOf([en.disputes, en.notificationCenter, en.notificationPreferences]).filter((sentence) => /\b(freez\w*|frozen|hold\w*|halt\w*|block\w*)\b/i.test(sentence));
    expect(sentences.length).toBeGreaterThan(3);
    for (const sentence of sentences) {
      if (sentence === en.disputes.status.FROZEN) continue;
      expect(sentence, sentence).toMatch(/\b(not|isn't|aren't|no|never)\b|as frozen/i);
    }
  });

  it("every Arabic dispute sentence that mentions freezing negates it", () => {
    const sentences = sentencesOf(ar.disputes).filter((sentence) => /تجميد|إيقاف|توقف|يوقف/.test(sentence));
    expect(sentences.length).toBeGreaterThan(2);
    for (const sentence of sentences) expect(sentence, sentence).toMatch(/(^|\s)(لا|ولا|ليس|لم)(\s|$)|فقط/);
  });

  it("the FROZEN description says it applies to the dispute record only", () => {
    expect(en.disputes.statusDescription.FROZEN).toMatch(/dispute record only/);
    expect(en.disputes.statusDescription.FROZEN).toMatch(/does not by itself hold or stop the order/);
  });

  it("no dispute-domain product file references an order/shipment/payment/inventory write or sets DISPUTED", () => {
    expect(DISPUTE_FILES.length).toBeGreaterThanOrEqual(12);
    for (const file of DISPUTE_FILES) {
      const code = stripComments(read(file));
      expect(code, file).not.toMatch(/\.from\(\s*["'`](orders|order_shipments|order_items|payments|payouts|inventory_positions|inventory_reservations|storage_allocations|coffee_offers)["'`]\s*\)/);
      expect(code, file).not.toMatch(/status:\s*["'`]DISPUTED["'`]/);
      expect(code, file).not.toMatch(/\.rpc\(/);
    }
  });
});

/** A fake Supabase client that records every table write and answers reads from canned rows. */
function recordingClient(reads: Record<string, unknown>) {
  const writes: Array<{ table: string; op: string }> = [];
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      let op: string | null = null;
      const chain = () => builder;
      for (const method of ["select", "eq", "is", "in", "order", "range", "limit"]) builder[method] = chain;
      for (const method of ["insert", "update", "upsert", "delete"]) {
        builder[method] = () => {
          op = method;
          writes.push({ table, op: method });
          return builder;
        };
      }
      const result = () => ({ data: op ? (reads[`${table}:${op}`] ?? null) : (reads[table] ?? null), error: null });
      builder.single = async () => result();
      builder.maybeSingle = async () => result();
      builder.then = (resolve: (value: unknown) => void) => resolve(result());
      return builder;
    },
    rpc: async () => ({ data: true, error: null }),
  };
  return { client, writes };
}

describe("Runtime: raising a dispute and every compliance transition write ONLY the disputes table", () => {
  const state = vi.hoisted(() => ({ client: null as unknown }));
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
    vi.doMock("@/lib/orders/read", () => ({
      getOrderById: async () => ({ id: "05000000-0000-4000-8000-00000000000b", correlationId: "ef7040e3-86eb-494a-a2d5-cffb06b93dba", status: "PAID" }),
    }));
    vi.doMock("@/lib/admin/guards", () => ({ checkRoleFunctionAccess: async () => ({ ok: true, identity: { userId: "a0000000-0000-4000-8000-000000000001" }, roles: ["COMPLIANCE"] }) }));
  });
  afterEach(() => {
    vi.doUnmock("@/lib/supabase/server");
    vi.doUnmock("@/lib/orders/read");
    vi.doUnmock("@/lib/admin/guards");
  });

  it("raiseDispute: exactly one INSERT, on disputes, with no status/freeze field", async () => {
    const { client, writes } = recordingClient({ "disputes:insert": { id: "d1", order_id: "05000000-0000-4000-8000-00000000000b", status: "OPEN", correlation_id: "c1" } });
    state.client = client;
    const { raiseDispute } = await import("@/lib/disputes/member");
    const result = await raiseDispute({ organizationId: "o1", userId: "u1", input: { orderId: "05000000-0000-4000-8000-00000000000b", reason: "Bags arrived torn on delivery." } });
    expect(result.ok).toBe(true);
    expect(writes).toEqual([{ table: "disputes", op: "insert" }]);
  });

  it("markFrozen / resolveDispute / closeDispute: each writes one UPDATE on disputes and nothing else", async () => {
    const id = "12000000-0000-4000-8000-0000000000aa";
    for (const [operation, from, input] of [
      ["markFrozen", "UNDER_REVIEW", { disputeId: id }],
      ["resolveDispute", "FROZEN", { disputeId: id, resolution: "Partial credit agreed with the seller." }],
      ["closeDispute", "RESOLVED", { disputeId: id }],
    ] as const) {
      const { client, writes } = recordingClient({ disputes: { id, status: from, resolution: from === "RESOLVED" ? "x" : null, resolved_at: from === "RESOLVED" ? "2026-01-01" : null }, "disputes:update": { id, status: "X" } });
      state.client = client;
      const compliance = await import("@/lib/disputes/compliance");
      const result = await (compliance[operation] as (value: unknown) => Promise<{ ok: boolean }>)(input);
      expect(result.ok, operation).toBe(true);
      expect(writes, operation).toEqual([{ table: "disputes", op: "update" }]);
    }
  });
});

describe("DB-BLOCK-01 — the evidence file seam stays inert", () => {
  it("capability is unavailable and the seam refuses without touching anything", async () => {
    expect(DISPUTE_EVIDENCE_FILE_CAPABILITY).toEqual({ available: false, blocker: "DB-BLOCK-01" });
    await expect(attachDisputeEvidenceFile({ disputeId: "x", bytes: "AAAA" })).resolves.toEqual({ ok: false, code: "dispute_evidence_file_unavailable" });
    const code = stripComments(read("lib/disputes/evidence-files.ts"));
    expect(code).not.toMatch(/\bimport\b[^;]*supabase|\.storage\b|createSignedUploadUrl|\.upload\(|file_assets|\.from\(/);
  });

  it("no dispute product file offers a file input or writes a file reference", () => {
    for (const file of DISPUTE_FILES) {
      const code = stripComments(read(file));
      expect(code, file).not.toMatch(/type=["']file["']|<FileUpload|createSignedUploadUrl|\.storage\.from/);
      // A write payload carrying a file reference (a TypeScript row type naming the column is fine).
      expect(code, file).not.toMatch(/\.(insert|update|upsert)\(\s*\{[^}]*file_asset_id/);
    }
  });
});

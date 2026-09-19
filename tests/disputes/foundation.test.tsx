import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DisputeStatusBadge } from "@/components/disputes/dispute-status-badge";
import { getAppCopy } from "@/lib/app/copy";
import { mapDisputeWriteError } from "@/lib/disputes/errors";
import { DISPUTE_INITIAL_STATUS, DISPUTE_STATUSES, isDisputeStatus } from "@/lib/disputes/types";
import { DISPUTE_FIELD_ERROR_KEYS, RaiseDisputeInput } from "@/lib/disputes/validation";

/**
 * Feature 012 RUN A — static/unit proof for T001 (vocabulary + safe errors), T003/T004's structural
 * boundaries (no member status path, no generic compliance setter), and T006's copy/rendering
 * honesty. The LIVE authority proof is `tests/disputes/role-restriction.test.ts`.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, getAll: () => [] }) }));

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
/** Source with comments removed — the checks below are about code, not the documentation explaining it. */
const code = (...segments: string[]) => source(...segments).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(leafStrings);
  return [];
}

function filesUnder(dir: string): string[] {
  const absolute = path.join(root, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const full = path.join(absolute, entry);
    return statSync(full).isDirectory() ? filesUnder(path.join(dir, entry)) : [path.join(dir, entry)];
  });
}

const DISPUTE_SOURCES = [...filesUnder("lib/disputes"), ...filesUnder("src/app/dashboard/disputes"), ...filesUnder("components/disputes")];

afterEach(() => cleanup());

describe("T001 — the approved dispute status vocabulary, exactly", () => {
  it("matches the live disputes_status_check CHECK constraint value-for-value and in order", () => {
    const report = JSON.parse(JSON.parse(source("docs/database/database-schema-report.json"))[0].database_schema_report);
    const check = report.constraints.find((constraint: { constraint_name: string }) => constraint.constraint_name === "disputes_status_check");
    const liveValues = [...check.definition.matchAll(/'([A-Z_]+)'::text/g)].map((match: RegExpMatchArray) => match[1]);
    expect(DISPUTE_STATUSES).toEqual(["OPEN", "UNDER_REVIEW", "FROZEN", "RESOLVED", "REJECTED", "CLOSED"]);
    expect([...DISPUTE_STATUSES]).toEqual(liveValues);

    const statusColumn = report.columns.find((column: { table_name: string; column_name: string }) => column.table_name === "disputes" && column.column_name === "status");
    expect(statusColumn.default).toBe(`'${DISPUTE_INITIAL_STATUS}'::text`);
  });

  it("rejects anything outside the vocabulary (no invented or generic status)", () => {
    for (const value of ["PENDING", "open", "DISPUTED", "ESCALATED", "", null, undefined, 1]) expect(isDisputeStatus(value)).toBe(false);
    for (const value of DISPUTE_STATUSES) expect(isDisputeStatus(value)).toBe(true);
  });

  it("maps database failures to safe codes and never logs or returns the raw message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = 'new row violates row-level security policy "disputes_create" for table "disputes" — reason: private text';
    expect(mapDisputeWriteError({ code: "42501", message: secret }, "raise")).toBe("order_not_found");
    expect(mapDisputeWriteError({ code: "23503", message: secret }, "raise")).toBe("order_not_found");
    expect(mapDisputeWriteError({ code: "42501", message: secret }, "evidence")).toBe("dispute_not_found");
    expect(mapDisputeWriteError({ code: "42501", message: secret }, "transition")).toBe("dispute_not_found");
    expect(mapDisputeWriteError({ code: "23514", message: secret }, "transition")).toBe("dispute_transition_refused");
    expect(mapDisputeWriteError({ code: "23514", message: secret }, "raise")).toBe("validation_error");
    expect(mapDisputeWriteError({ code: "XX000", message: secret }, "raise")).toBe("dispute_raise_failed");
    expect(mapDisputeWriteError(null, "transition")).toBe("dispute_transition_failed");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("private text");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("row-level security");
    spy.mockRestore();
  });
});

describe("T003 — the member module exposes no status mutation path", () => {
  it("exports exactly raise + text evidence, and issues no UPDATE/DELETE/UPSERT/RPC and no status or file field", async () => {
    const memberModule = await import("@/lib/disputes/member");
    expect(Object.keys(memberModule).sort()).toEqual(["addDisputeEvidenceNote", "raiseDispute"]);
    const member = code("lib/disputes/member.ts");
    for (const forbidden of [".update(", ".delete(", ".upsert(", ".rpc(", "file_asset_id", "resolved_by", "resolved_at", "order_shipments", "payments"]) {
      expect(member, forbidden).not.toContain(forbidden);
    }
    const inserts = member.match(/\.insert\(\{[\s\S]*?\}\)/g) ?? [];
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert).not.toMatch(/status/);
      expect(insert).not.toMatch(/resolution/);
    }
  });

  it("the member Server Action file exposes only raise + text-evidence actions (no status, file or delete action)", async () => {
    const actions = await import("@/src/app/dashboard/disputes/actions");
    expect(Object.keys(actions).sort()).toEqual(["addEvidenceNoteAction", "raiseDisputeAction"]);
  });

  it("the raise schema carries only the order and the description (never status, organization, user or file)", () => {
    expect(Object.keys(RaiseDisputeInput.shape).sort()).toEqual(["orderId", "reason"]);
    const parsed = RaiseDisputeInput.safeParse({ orderId: "05000000-0000-4000-8000-00000000000b", reason: "  short  " });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual(["reasonTooShort"]);
  });
});

describe("T004 — the compliance module: named operations only, conservative transitions, no bypass export", () => {
  it("exports six named operations plus the read-only transition policy — no generic status setter", async () => {
    const compliance = await import("@/lib/disputes/compliance");
    expect(Object.keys(compliance).sort()).toEqual(["DISPUTE_TRANSITIONS", "beginReview", "closeDispute", "isApprovedDisputeTransition", "markFrozen", "rejectDispute", "resolveDispute", "resumeReview"]);
    const compliance_ = code("lib/disputes/compliance.ts");
    expect(compliance_).toContain('checkRoleFunctionAccess("is_compliance_operator")');
    expect(compliance_).not.toMatch(/export\s+(async\s+)?function\s+\w*[sS]et\w*Status/);
    expect(compliance_).not.toMatch(/from\("(orders|order_shipments|payments|inventory_positions|inventory_reservations|storage_allocations)"\)/);
  });

  it("the transition table is closed, terminal at CLOSED, write-once for outcomes and frozen at runtime", async () => {
    const { DISPUTE_TRANSITIONS, isApprovedDisputeTransition } = await import("@/lib/disputes/compliance");
    expect(Object.keys(DISPUTE_TRANSITIONS).sort()).toEqual([...DISPUTE_STATUSES].sort());
    expect(DISPUTE_TRANSITIONS.CLOSED).toEqual([]);
    expect(DISPUTE_TRANSITIONS.RESOLVED).toEqual(["CLOSED"]);
    expect(DISPUTE_TRANSITIONS.REJECTED).toEqual(["CLOSED"]);
    for (const from of DISPUTE_STATUSES) {
      expect(isApprovedDisputeTransition(from, from)).toBe(false);
      expect(isApprovedDisputeTransition(from, "OPEN")).toBe(false);
      for (const to of DISPUTE_TRANSITIONS[from]) expect(DISPUTE_STATUSES).toContain(to);
    }
    expect(Object.isFrozen(DISPUTE_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(DISPUTE_TRANSITIONS.OPEN)).toBe(true);
  });
});

describe("T002/T006 — constitutional checks across every dispute source file", () => {
  it("no service role, no shared/private-data cache API, no raw HTML rendering, no file upload", () => {
    for (const file of DISPUTE_SOURCES) {
      const body = code(file);
      for (const forbidden of ["SERVICE_ROLE", "service_role", "unstable_cache", "cacheTag", "cacheLife", '"use cache"', "dangerouslySetInnerHTML", 'type="file"', "file-upload", "localStorage"]) {
        expect(body, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("every select names its columns explicitly (no select('*'))", () => {
    for (const file of DISPUTE_SOURCES.filter((candidate) => candidate.startsWith(`lib${path.sep}disputes`))) {
      expect(source(file), file).not.toMatch(/select\(\s*["'`]\*["'`]/);
    }
  });

  it("no dispute module writes an order or shipment status (DB-OPEN-09: no application-side freeze)", () => {
    for (const file of DISPUTE_SOURCES) {
      const body = code(file);
      expect(body, file).not.toMatch(/["']DISPUTED["']/);
      expect(body, file).not.toMatch(/from\("(orders|order_shipments)"\)\s*\.(update|upsert|delete)/);
    }
  });
});

describe("T006 — copy: exact labels in EN and AR, and no freeze/notification/file claim", () => {
  const en = getAppCopy("en").disputes;
  const ar = getAppCopy("ar").disputes;

  it("every status has a distinct EN label and a translated AR label", () => {
    expect(Object.keys(en.status)).toEqual([...DISPUTE_STATUSES]);
    expect(new Set(Object.values(en.status)).size).toBe(6);
    for (const status of DISPUTE_STATUSES) {
      expect(ar.status[status]).toBeTruthy();
      expect(ar.status[status]).not.toBe(en.status[status]);
      expect(ar.statusDescription[status]).not.toBe(en.statusDescription[status]);
    }
  });

  it("every validation key has EN and AR text", () => {
    for (const key of DISPUTE_FIELD_ERROR_KEYS) {
      expect(en.raise.errors[key]).toBeTruthy();
      expect(ar.raise.errors[key]).not.toBe(en.raise.errors[key]);
    }
  });

  it("no English dispute sentence claims a freeze/hold, a notification or an attachment without negating it", () => {
    const sentences = leafStrings(en)
      .flatMap((text) => text.split(/(?<=[.!?])\s+/))
      .filter((sentence) => /\b(freez\w*|frozen|hold\w*|notif\w*|attach\w*)\b/i.test(sentence));
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) {
      if (sentence === en.status.FROZEN) continue; // the bare vocabulary label itself
      expect(sentence, sentence).toMatch(/\b(not|isn't|aren't|no)\b|as frozen/i);
    }
  });

  it("the badge renders the textual label for each of the six statuses (never colour alone)", () => {
    for (const status of DISPUTE_STATUSES) {
      const { container, unmount } = render(<DisputeStatusBadge status={status} />);
      const badge = container.querySelector('[data-slot="dispute-status-badge"]');
      expect(badge?.getAttribute("data-status")).toBe(status);
      expect(badge?.querySelector('[lang="en"]')?.textContent).toBe(en.status[status]);
      expect(badge?.querySelector('[lang="ar"]')?.textContent).toBe(ar.status[status]);
      unmount();
    }
  });
});

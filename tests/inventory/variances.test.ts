import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createFakeSupabaseClient } from "./fake-supabase";

/**
 * Feature 005 T014 / DB-OPEN-19 — application layer of the variance / hold / quarantine capability.
 *
 * The AUTHORITY (record / resolve / freeze / listing + delivery guards / append-only / concurrency) is the database
 * migration, proven in `tests/database/inventory-variance-scratch.test.ts` (scratch Postgres) and, after approval, in
 * `tests/inventory/variance-live.test.ts`. This file proves the thin application layer around it: org scoping, the column
 * allowlist, no arithmetic, the eligibility refusal, the safe-error mappings and the migration's static shape.
 */

const clientState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!clientState.client) throw new Error("test has no client installed");
    return clientState.client;
  }),
}));

type Call = { table: string; select?: string; eq: [string, unknown][]; in: [string, unknown][] };

/** A recording fake: per-table rows, and a log of every read's table / column list / filters. */
function recordingClient(tables: Record<string, readonly unknown[]>, opts: { holdsError?: boolean } = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, eq: [], in: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        select: (columns?: string) => {
          call.select = columns;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.eq.push([column, value]);
          return builder;
        },
        in: (column: string, value: unknown) => {
          call.in.push([column, value]);
          return builder;
        },
        order: () => builder,
        then: (resolve: (value: unknown) => void) =>
          Promise.resolve(
            table === "inventory_position_hold_notices" && opts.holdsError
              ? { data: null, error: { message: "boom" } }
              : { data: tables[table] ?? [], error: null },
          ).then(resolve),
      };
      return builder;
    },
  };
  return { client, calls };
}

const HOLD_ROW = {
  variance_id: "var-1",
  inventory_position_id: "pos-1",
  kind: "QUARANTINE",
  recorded_quantity_kg: "100.000",
  counted_quantity_kg: "90.500",
  variance_quantity_kg: "-9.500",
  recorded_at: "2026-09-21T10:00:00.000Z",
};

describe("getOpenInventoryHolds", () => {
  it("returns nothing and reads nothing for an empty id list", async () => {
    const { client, calls } = recordingClient({});
    clientState.client = client;
    const { getOpenInventoryHolds } = await import("@/lib/inventory/variances");
    expect((await getOpenInventoryHolds({ organizationId: "org-a", positionIds: [] })).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("narrows to the acting organization's positions before reading the holds view (organization isolation)", async () => {
    const { client, calls } = recordingClient({ inventory_positions: [{ id: "pos-1" }], inventory_position_hold_notices: [HOLD_ROW] });
    clientState.client = client;
    const { getOpenInventoryHolds } = await import("@/lib/inventory/variances");
    const holds = await getOpenInventoryHolds({ organizationId: "org-a", positionIds: ["pos-1", "pos-other-org"] });

    const ownership = calls.find((c) => c.table === "inventory_positions")!;
    expect(ownership.eq).toContainEqual(["owner_organization_id", "org-a"]);
    const view = calls.find((c) => c.table === "inventory_position_hold_notices")!;
    expect(view.in).toEqual([["inventory_position_id", ["pos-1"]]]); // only ids the fake said the org owns reach the holds read
    expect(holds.get("pos-1")).toMatchObject({ varianceId: "var-1", kind: "QUARANTINE" });
  });

  it("reads nothing from the holds view when the organization owns none of the ids", async () => {
    const { client, calls } = recordingClient({ inventory_positions: [], inventory_position_hold_notices: [HOLD_ROW] });
    clientState.client = client;
    const { getOpenInventoryHold } = await import("@/lib/inventory/variances");
    expect(await getOpenInventoryHold({ organizationId: "org-b", positionId: "pos-1" })).toBeNull();
    expect(calls.some((c) => c.table === "inventory_position_hold_notices")).toBe(false);
  });

  it("selects an explicit column allowlist — never the operator's reason or actor", async () => {
    const { client, calls } = recordingClient({ inventory_positions: [{ id: "pos-1" }], inventory_position_hold_notices: [HOLD_ROW] });
    clientState.client = client;
    const { getOpenInventoryHold } = await import("@/lib/inventory/variances");
    const hold = await getOpenInventoryHold({ organizationId: "org-a", positionId: "pos-1" });
    const columns = calls.find((c) => c.table === "inventory_position_hold_notices")!.select!;
    expect(columns).not.toMatch(/\*|reason|actor/);
    expect(hold).not.toHaveProperty("reason");
    expect(hold).not.toHaveProperty("actorUserId");
  });

  it("passes the database's quantities through verbatim — the variance is a generated column, never recomputed", async () => {
    const { client } = recordingClient({
      inventory_positions: [{ id: "pos-1" }],
      // deliberately inconsistent with counted − recorded: a module that recomputed would return -9.5
      inventory_position_hold_notices: [{ ...HOLD_ROW, variance_quantity_kg: "-7.250" }],
    });
    clientState.client = client;
    const { getOpenInventoryHold } = await import("@/lib/inventory/variances");
    const hold = await getOpenInventoryHold({ organizationId: "org-a", positionId: "pos-1" });
    expect(hold).toMatchObject({ recordedQuantityKg: 100, countedQuantityKg: 90.5, varianceQuantityKg: -7.25 });
  });

  it("ignores a row with an unknown kind rather than guessing", async () => {
    const { client } = recordingClient({ inventory_positions: [{ id: "pos-1" }], inventory_position_hold_notices: [{ ...HOLD_ROW, kind: "MYSTERY" }] });
    clientState.client = client;
    const { getOpenInventoryHold } = await import("@/lib/inventory/variances");
    expect(await getOpenInventoryHold({ organizationId: "org-a", positionId: "pos-1" })).toBeNull();
  });

  it("a failed read returns no holds (advisory only — the database triggers are the authority)", async () => {
    const { client } = recordingClient({ inventory_positions: [{ id: "pos-1" }] }, { holdsError: true });
    clientState.client = client;
    const { getOpenInventoryHold } = await import("@/lib/inventory/variances");
    expect(await getOpenInventoryHold({ organizationId: "org-a", positionId: "pos-1" })).toBeNull();
  });

  it("contains no write, RPC, service-role or cache usage", () => {
    const source = readFileSync(join(process.cwd(), "lib/inventory/variances.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(source).not.toMatch(/service[_-]?role|admin-client|unstable_cache|"use cache"/i);
  });
});

describe("listing eligibility refuses held stock (INVENTORY_HELD)", () => {
  const position = {
    id: "pos-1",
    lot_id: "lot-1",
    owner_organization_id: "org-a",
    warehouse_id: "wh-1",
    warehouse_location_id: null,
    available_quantity_kg: 100,
    reserved_quantity_kg: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const base = { inventory_positions: [position], warehouses: [{ id: "wh-1", name: "W", city: "Dubai", is_active: true }] };

  it("refuses with INVENTORY_HELD and zero eligible quantity when an open case exists", async () => {
    clientState.client = createFakeSupabaseClient({ ...base, inventory_position_hold_notices: [HOLD_ROW] });
    const { checkListingEligibility } = await import("@/lib/listings/eligibility");
    const result = await checkListingEligibility({ organizationId: "org-a", canSell: true, positionId: "pos-1", requestedQuantityKg: 10 });
    expect(result).toEqual({ eligible: false, reason: "INVENTORY_HELD", eligibleQuantityKg: 0 });
  });

  it("does not refuse for a hold reason when there is no open case", async () => {
    clientState.client = createFakeSupabaseClient({ ...base, inventory_position_hold_notices: [] });
    const { checkListingEligibility } = await import("@/lib/listings/eligibility");
    const result = await checkListingEligibility({ organizationId: "org-a", canSell: true, positionId: "pos-1", requestedQuantityKg: 10 });
    expect(result).not.toMatchObject({ reason: "INVENTORY_HELD" });
  });
});

describe("safe-error mappings for inventory_position_held", () => {
  it("maps in the order, shipment and delivery mappers", async () => {
    const orders = await import("@/lib/orders/errors");
    const delivery = await import("@/lib/delivery/errors");
    const raised = { message: "inventory_position_held" };
    expect(orders.mapOrderError(raised)).toBe("order_item_quantity_unavailable");
    expect(orders.mapShipmentError(raised)).toBe("shipment_reservation_unavailable");
    expect(delivery.mapDeliveryError(raised)).toBe("shipment_reservation_unavailable");
  });

  it("has EN and AR refusal copy for INVENTORY_HELD and hold-alert copy", async () => {
    const { en } = await import("@/lib/app/copy/en");
    const { ar } = await import("@/lib/app/copy/ar");
    expect(en.listings.new.refusal.INVENTORY_HELD).toBeTruthy();
    expect(en.inventory.detail.hold.title).toBeTruthy();
    expect(en.inventory.detail.hold.description).toBeTruthy();
    expect(ar.listings?.new?.refusal?.INVENTORY_HELD).toBeTruthy();
    expect(ar.inventory?.detail?.hold?.title).toBeTruthy();
    expect(ar.inventory?.detail?.hold?.description).toBeTruthy();
  });
});

describe("migration / rollback / postflight — static contract", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const strip = (s: string) => s.replace(/--.*$/gm, "");
  const migrationRaw = read("supabase/migrations/20260921120000_feature_005_db_open_19_inventory_variance_hold.sql");
  const migration = strip(migrationRaw);
  const rollback = read("supabase/rollback/20260921120000_feature_005_db_open_19_inventory_variance_hold.rollback.sql");
  const postflight = strip(read("supabase/maintenance/20260921_feature_005_db_open_19_postflight.sql"));

  it("adds the intended table with RLS on and never weakens or grants writes", () => {
    expect(migration).toMatch(/create table public\.inventory_variance_events/i);
    expect(migration).toMatch(/alter table public\.inventory_variance_events enable row level security/i);
    expect(migration).not.toMatch(/disable row level security|no force row level security/i);
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*inventory_variance_events/i);
    expect(migration).not.toMatch(/\bto\s+(anon|public)\b/i);
  });

  it("never drops or alters a pre-existing table or policy", () => {
    expect(migration).not.toMatch(/drop\s+policy/i);
    expect(migration).not.toMatch(/drop\s+table/i);
    expect(migration).not.toMatch(/alter\s+table\s+public\.(?!inventory_variance_events)\w+\s+(add|drop|alter|disable)/i);
  });

  it("exactly two functions are executable by authenticated — the two operator functions", () => {
    expect(migration.match(/grant execute on function/gi)).toHaveLength(2);
    expect(migration).toMatch(/grant execute on function public\.record_inventory_variance\(/i);
    expect(migration).toMatch(/grant execute on function public\.resolve_inventory_variance\(/i);
    expect(migration.match(/set search_path/gi)!.length).toBeGreaterThanOrEqual(5);
  });

  it("H1 — raw INSERT/UPDATE of positions is revoked from authenticated only; every application writer of positions is a SECURITY DEFINER database function (no client raw write exists)", () => {
    expect(migration).toMatch(/revoke insert, update on table public\.inventory_positions from authenticated;/i);
    expect(migration).not.toMatch(/revoke[^;]*on table public\.inventory_positions from (anon|public|service_role)/i);
    expect(migration).not.toMatch(/drop policy|alter policy/i); // the pre-existing policy row is left as it is
    // the migration refuses to run if an invoker-rights function writes positions, and re-grants nothing wider on rollback
    expect(migration).toMatch(/SECURITY INVOKER function\(s\) write inventory_positions/);
    expect(rollback).toMatch(/grant insert, update on table public\.inventory_positions to authenticated;/i);
    // no application source writes positions from a session (the live tables are written by RPC / definer functions only)
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const code = strip(read(rel)).replace(/\/\*[\s\S]*?\*\//g, "");
          if (/from\(\s*["']inventory_positions["']\s*\)\s*\.(insert|update|upsert|delete)\(/.test(code)) offenders.push(rel);
        }
      }
    };
    for (const dir of ["lib", "src", "components"]) walk(dir);
    expect(offenders).toEqual([]);
  });

  it("H2 — the history can never be erased: both foreign keys are ON DELETE RESTRICT (no cascade), delete/update/truncate are refused, service_role's writes are revoked", () => {
    expect(migration).not.toMatch(/on delete cascade/i);
    expect(migration.match(/references public\.\w+\(id\) on delete restrict/gi)).toHaveLength(2);
    expect(migration).toMatch(/before truncate on public\.inventory_variance_events/i);
    expect(migration).toMatch(/revoke insert, update, delete, truncate on table public\.inventory_variance_events from service_role;/i);
    expect(migration).not.toMatch(/pg_trigger_depth/); // the old cascade allowance is gone
  });

  it("H3 — the operator's free-text reason is reachable by warehouse operators and auditors only; members read a reason-free view; the member-visible ledger reason is fixed text", () => {
    expect(migration).toMatch(/using \(public\.is_warehouse_operator\(\) or public\.is_auditor\(\)\);/i);
    expect(migration).not.toMatch(/inventory_variance_events_view[\s\S]{0,400}is_org_member/i);
    const notices = /create view public\.inventory_position_hold_notices[\s\S]*?;\n/i.exec(migration)?.[0] ?? "";
    expect(notices).toMatch(/security_barrier = true/);
    expect(notices).toMatch(/is_org_member\(ip\.owner_organization_id\)/);
    expect(notices).not.toMatch(/reason|actor_user_id|correlation_id/);
    // the internal one-definition view has no client grant
    expect(migration).not.toMatch(/grant select on table public\.inventory_open_cases/i);
    const ledger = /insert into public\.inventory_ownership_events[\s\S]*?\);/i.exec(migration)?.[0] ?? "";
    expect(ledger).toMatch(/Warehouse stock count adjustment/);
    expect(ledger).not.toMatch(/v_reason/);
  });

  it("H4 — a held position is pinned in BOTH directions (the exact invariant is recorded next to the guard) and only the resolution's own flag may move it", () => {
    expect(migrationRaw).toMatch(/H4: the position's on-hand quantity is PINNED while a case is open/);
    expect(migration).toMatch(/new\.available_quantity_kg <> old\.available_quantity_kg/);
    expect(migration).toMatch(/available_quantity_kg <> v_case\.recorded_quantity_kg/);
    expect(migrationRaw).toMatch(/Appendix D guardrail 17/);
  });

  it("rollback refuses while history exists; postflight is read-only", () => {
    expect(rollback).toMatch(/rollback refused/i);
    // string literals (check labels, privilege names, regexes) are data, not statements
    expect(postflight.replace(/'(?:[^']|'')*'/g, "''")).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from|drop\s+|alter\s+table|truncate)\b/i);
  });

  it("T023 / T024 — the application layer adds no quantity mutation and no financial-exchange positioning", () => {
    const appSource = strip(["lib/inventory/variances.ts", "lib/inventory/types.ts"].map(read).join("\n"));
    expect(appSource).not.toMatch(/\b(leverage|margin|futures|derivative|order book)\b/i);
    expect(appSource).not.toMatch(/\.update\(/);
  });
});

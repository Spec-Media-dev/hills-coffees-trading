import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ORDER_SHIPMENT_STATUSES } from "@/lib/delivery/validation";
import { SHIPMENT_TRANSITIONS } from "@/lib/delivery/transitions";
import type { OrderShipmentStatus } from "@/lib/delivery/types";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN D — Phase 6 structural + delegation proofs (no live database needed here; the live
 * legs are `tests/admin/warehouse-pages.test.tsx`).
 *
 * T016 — queue definitions cover Feature 009's vocabulary exactly once (DRAFT excluded).
 * T017 — the console's operation map is byte-for-byte the `fromStatuses`/target each Feature 009
 *        function attempts, every pair is in `SHIPMENT_TRANSITIONS`, and the console has NO raw
 *        shipment write path; `executeWarehouseOperation` delegates to the named function only after
 *        its own live guard and validation, never with a caller-supplied status.
 * T018 — `recordWarehouseDelivery` delegates to Feature 009's `recordDelivery` with the parsed
 *        absolute totals and passes its refusal codes through unchanged.
 * T019/T020 — no inventory/reservation write, no arithmetic on inventory quantities, no service
 *        role, no shared cache; the approved schema has NO variance/reconciliation/HOLD/QUARANTINE
 *        representation and the console builds no reconciliation control.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const CONSOLE_FILES = [...listTsFiles(join(root, "lib", "admin")), ...listTsFiles(join(root, "src", "app", "dashboard-admin")), ...listTsFiles(join(root, "components", "admin"))];
const WAREHOUSE_FILES = CONSOLE_FILES.filter((file) => /lib\/admin\/warehouse\.ts$|\(warehouse\)|components\/admin\/warehouse/.test(file));

const guardState = vi.hoisted(() => ({ access: { ok: true } as { ok: true } | { ok: false; denial: string } }));
const opMocks = vi.hoisted(() => ({
  confirmCapacity: vi.fn(),
  markReady: vi.fn(),
  reserve: vi.fn(),
  startPicking: vi.fn(),
  book: vi.fn(),
  dispatch: vi.fn(),
  fail: vi.fn(),
  cancel: vi.fn(),
  recordDelivery: vi.fn(),
}));
const readMocks = vi.hoisted(() => ({ getShipmentById: vi.fn(), getShipmentItems: vi.fn(), getShipmentsForWarehouseQueue: vi.fn() }));

vi.mock("@/lib/admin/guards", () => ({ checkRoleFunctionAccess: vi.fn(async () => guardState.access) }));
vi.mock("@/lib/delivery/warehouse", () => opMocks);
vi.mock("@/lib/delivery/read", () => readMocks);
vi.mock("@/lib/delivery/custody", () => ({ getCustodyForOrderItems: vi.fn(async () => []) }));
vi.mock("@/lib/inventory/allocations", () => ({ getStorageAllocationsForWarehouseOversight: vi.fn(async () => ({ rows: [], hasMore: false })) }));
vi.mock("@/lib/orders/read", () => ({ getOrderItems: vi.fn(async () => []) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }) })) }));

beforeEach(() => {
  guardState.access = { ok: true };
  for (const fn of Object.values(opMocks)) fn.mockReset();
  for (const fn of Object.values(readMocks)) fn.mockReset();
});
afterEach(() => vi.resetModules());

const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";

describe("T016 — warehouse queues are Feature 009's own vocabulary, each status exactly once", () => {
  it("covers every non-DRAFT status exactly once; DRAFT (the buyer's unsubmitted plan) is never a warehouse queue", async () => {
    const { WAREHOUSE_QUEUES, WAREHOUSE_QUEUE_KEYS, queueForStatus, isWarehouseQueueKey, DEFAULT_WAREHOUSE_QUEUE } = await import("@/lib/admin/warehouse");
    const listed = WAREHOUSE_QUEUE_KEYS.flatMap((key) => [...WAREHOUSE_QUEUES[key]]);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...ORDER_SHIPMENT_STATUSES].filter((s) => s !== "DRAFT").sort());
    expect(queueForStatus("DRAFT")).toBeNull();
    expect(queueForStatus("REQUESTED")).toBe("requested");
    expect(queueForStatus("PARTIALLY_DELIVERED")).toBe("dispatched");
    expect(queueForStatus("DISPUTED")).toBe("held");
    expect(isWarehouseQueueKey("nope")).toBe(false);
    expect(isWarehouseQueueKey(DEFAULT_WAREHOUSE_QUEUE)).toBe(true);
    // The plan's three operational queues exist under these exact keys.
    expect(WAREHOUSE_QUEUES.requested).toEqual(["REQUESTED"]);
    expect(WAREHOUSE_QUEUES.inProgress).toEqual(["CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED"]);
    expect(WAREHOUSE_QUEUES.dispatched).toEqual(["DISPATCHED", "PARTIALLY_DELIVERED"]);
  });

  it("listWarehouseQueue reads through Feature 009's getShipmentsForWarehouseQueue with the queue's exact statuses and degrades an unreadable order reference to null (never a fabricated code)", async () => {
    readMocks.getShipmentsForWarehouseQueue.mockResolvedValue([
      { id: SHIPMENT_ID, orderId: "o1", shipmentCode: "SHP-1", status: "REQUESTED", deliveryMethod: "Courier", countryCode: "AE", city: null, addressLine: "x", contactName: "c", contactPhone: "p", shippingFee: 0, currency: "USD", readyAt: null, deliveredAt: null, createdBy: "u", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", orderCode: "", buyerOrganizationId: "" },
    ]);
    const { listWarehouseQueue, WAREHOUSE_QUEUES } = await import("@/lib/admin/warehouse");
    const result = await listWarehouseQueue({ queue: "requested" });
    expect(readMocks.getShipmentsForWarehouseQueue).toHaveBeenCalledWith({ statuses: WAREHOUSE_QUEUES.requested });
    expect(result.rows[0]!.orderCode).toBeNull();
    expect(result.rows[0]!.buyerOrganizationId).toBeNull();
    expect(result.rows[0]!.totals).toEqual({ itemCount: 0, plannedQuantityKg: 0, deliveredQuantityKg: 0 });
  });
});

describe("T017 — the operation map mirrors lib/delivery/warehouse.ts exactly and the console has no raw shipment write path", () => {
  it("every operation's fromStatuses/toStatus equal the attemptTransition literals of the SAME-named Feature 009 function, and every pair is in SHIPMENT_TRANSITIONS", async () => {
    const { WAREHOUSE_OPERATIONS, WAREHOUSE_OPERATION_KEYS, displayableOperations } = await import("@/lib/admin/warehouse");
    const source = read("lib/delivery/warehouse.ts");
    for (const key of WAREHOUSE_OPERATION_KEYS) {
      const start = source.indexOf(`export async function ${key}(`);
      expect(start, `${key} exists in Feature 009`).toBeGreaterThan(-1);
      const body = source.slice(start, source.indexOf("\n}", start));
      const from = /fromStatuses:\s*\[([^\]]+)\]/.exec(body)![1]!.split(",").map((s) => s.trim().replace(/"/g, ""));
      const to = /toStatus:\s*"([A-Z_]+)"/.exec(body)![1]!;
      expect([...WAREHOUSE_OPERATIONS[key].fromStatuses]).toEqual(from);
      expect(WAREHOUSE_OPERATIONS[key].toStatus).toBe(to);
      for (const status of from) expect(SHIPMENT_TRANSITIONS[status as OrderShipmentStatus], `${status} -> ${to}`).toContain(to);
    }
    // Feature 009 exports exactly these transitions plus recordDelivery — nothing else, nothing invented.
    const exported = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(new Set(exported)).toEqual(new Set([...WAREHOUSE_OPERATION_KEYS, "recordDelivery"]));
    // States with no forward transition (application narrowing / terminal / DRAFT) offer nothing.
    for (const status of ["DRAFT", "FAILED", "DISPUTED", "DELIVERED", "CANCELLED"] as const) expect(displayableOperations(status)).toEqual([]);
    expect(displayableOperations("REQUESTED").map((s) => s.key)).toEqual(["confirmCapacity", "markReady", "fail", "cancel"]);
    expect(displayableOperations("DISPATCHED").map((s) => s.key)).toEqual(["fail"]);
    expect(displayableOperations("PARTIALLY_DELIVERED").map((s) => s.key)).toEqual(["fail"]);
  });

  it("T017 Verify: `order_shipments` appears in the console only as reads — no update/insert/delete/upsert on order_shipments or shipment_items anywhere in lib/admin, src/app/dashboard-admin, components/admin", () => {
    for (const file of CONSOLE_FILES) {
      const source = read(file.replace(`${root}/`, ""));
      for (const table of ["order_shipments", "shipment_items"]) {
        const pattern = new RegExp(`from\\("${table}"\\)[\\s\\S]{0,120}?\\.(update|insert|delete|upsert)\\(`);
        expect(source, `${file} writes ${table}`).not.toMatch(pattern);
      }
      expect(source, file).not.toMatch(/delivered_quantity_kg\s*:/);
    }
    // The warehouse slice itself issues NO table write of any kind — every mutation is a Feature 009 call.
    for (const file of WAREHOUSE_FILES) {
      expect(read(file.replace(`${root}/`, "")), file).not.toMatch(/\.(update|insert|delete|upsert)\(/);
    }
    // `grep -rn "order_shipments" src/app/dashboard-admin lib/admin` — every hit is a read/comment.
    const hits = CONSOLE_FILES.filter((file) => read(file.replace(`${root}/`, "")).includes("order_shipments"));
    expect(hits.length).toBeGreaterThan(0);
  });

  it("no operation accepts a caller-supplied status: the only client-supplied fields are shipmentId, a closed operation key and a reason", () => {
    const source = read("lib/admin/warehouse.ts");
    const actions = read("src/app/dashboard-admin/(warehouse)/shipments/actions.ts");
    expect(source).not.toMatch(/toStatus:\s*input\./);
    expect(source).not.toMatch(/status:\s*input\./);
    expect(actions).not.toMatch(/formData\.get\("(status|toStatus|targetStatus)"\)/);
    expect(actions).toMatch(/formData\.get\("operation"\)/);
  });

  it("executeWarehouseOperation calls the SAME-named Feature 009 function with the shipment id only (delegation), after its own live guard", async () => {
    opMocks.markReady.mockResolvedValue({ ok: true, data: null });
    const { executeWarehouseOperation } = await import("@/lib/admin/warehouse");
    const result = await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation: "markReady" });
    expect(result).toEqual({ ok: true, data: { shipmentId: SHIPMENT_ID, operation: "markReady", toStatus: "READY" } });
    expect(opMocks.markReady).toHaveBeenCalledTimes(1);
    expect(opMocks.markReady).toHaveBeenCalledWith({ shipmentId: SHIPMENT_ID });
    for (const [name, fn] of Object.entries(opMocks)) if (name !== "markReady") expect(fn).not.toHaveBeenCalled();
  });

  it("refuses BEFORE delegating when the console guard fails (wrong role → WAREHOUSE_NOT_CAPABLE; anonymous → PROFILE_AUTH_REQUIRED) — Feature 009's own codes, no second vocabulary", async () => {
    const { executeWarehouseOperation, recordWarehouseDelivery } = await import("@/lib/admin/warehouse");
    guardState.access = { ok: false, denial: "forbidden" };
    expect(await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation: "markReady" })).toEqual({ ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE });
    expect(await recordWarehouseDelivery({ shipmentId: SHIPMENT_ID, items: [{ shipmentItemId: ITEM_ID, deliveredQuantityKg: 1 }] })).toEqual({ ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE });
    guardState.access = { ok: false, denial: "no-operational-role" };
    expect(await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation: "dispatch" })).toEqual({ ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE });
    guardState.access = { ok: false, denial: "anonymous" };
    expect(await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation: "dispatch" })).toEqual({ ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED });
    for (const fn of Object.values(opMocks)) expect(fn).not.toHaveBeenCalled();
  });

  it("validation refuses an unknown operation, a bad id, and fail/cancel without a reason (Feature 009's own FailShipmentInput/CancelShipmentInput) — nothing is delegated", async () => {
    const { executeWarehouseOperation } = await import("@/lib/admin/warehouse");
    const unknown = await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation: "DELIVERED" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    const badId = await executeWarehouseOperation({ shipmentId: "not-a-uuid", operation: "markReady" });
    expect(badId.ok).toBe(false);
    if (!badId.ok) expect(badId.fieldErrors?.shipmentId).toBeTruthy();
    for (const operation of ["fail", "cancel"] as const) {
      const missing = await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation, reason: "   " });
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.fieldErrors?.reason).toBeTruthy();
    }
    for (const fn of Object.values(opMocks)) expect(fn).not.toHaveBeenCalled();
  });

  it("fail/cancel WITH a reason delegate to the named function with the id only (the reason is validated, never sent to a column that does not exist)", async () => {
    opMocks.cancel.mockResolvedValue({ ok: true, data: null });
    const { executeWarehouseOperation } = await import("@/lib/admin/warehouse");
    const result = await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation: "cancel", reason: "Buyer withdrew the request." });
    expect(result.ok).toBe(true);
    expect(opMocks.cancel).toHaveBeenCalledWith({ shipmentId: SHIPMENT_ID });
  });

  it("a Feature 009 refusal (settlement gate, invalid transition) passes through with its own code — the console maps nothing itself", async () => {
    opMocks.reserve.mockResolvedValue({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED });
    opMocks.dispatch.mockResolvedValue({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE });
    const { executeWarehouseOperation } = await import("@/lib/admin/warehouse");
    expect(await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation: "reserve" })).toEqual({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED });
    expect(await executeWarehouseOperation({ shipmentId: SHIPMENT_ID, operation: "dispatch" })).toEqual({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE });
  });
});

describe("T018 — delivered quantity delegates to Feature 009's recordDelivery only", () => {
  it("parses FormData-shaped input into Feature 009's RecordDeliveryInput (absolute totals), delegates once, and returns the RE-READ persisted items", async () => {
    opMocks.recordDelivery.mockResolvedValue({ ok: true, data: null });
    readMocks.getShipmentItems.mockResolvedValue([{ id: ITEM_ID, shipmentId: SHIPMENT_ID, orderItemId: "oi", plannedQuantityKg: 10, deliveredQuantityKg: 4 }]);
    readMocks.getShipmentById.mockResolvedValue({ id: SHIPMENT_ID, status: "PARTIALLY_DELIVERED" });
    const { recordWarehouseDelivery } = await import("@/lib/admin/warehouse");
    const result = await recordWarehouseDelivery({ shipmentId: SHIPMENT_ID, items: [{ shipmentItemId: ITEM_ID, deliveredQuantityKg: "4" }] });
    expect(opMocks.recordDelivery).toHaveBeenCalledTimes(1);
    expect(opMocks.recordDelivery).toHaveBeenCalledWith({ shipmentId: SHIPMENT_ID, items: [{ shipmentItemId: ITEM_ID, deliveredQuantityKg: 4 }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0]!.deliveredQuantityKg).toBe(4);
      expect(result.data.status).toBe("PARTIALLY_DELIVERED");
    }
  });

  it("refuses a negative / non-numeric / empty item set at validation and never delegates", async () => {
    const { recordWarehouseDelivery } = await import("@/lib/admin/warehouse");
    for (const items of [[], [{ shipmentItemId: ITEM_ID, deliveredQuantityKg: "-1" }], [{ shipmentItemId: ITEM_ID, deliveredQuantityKg: "abc" }], [{ shipmentItemId: "bad", deliveredQuantityKg: "1" }]]) {
      const result = await recordWarehouseDelivery({ shipmentId: SHIPMENT_ID, items });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    }
    expect(opMocks.recordDelivery).not.toHaveBeenCalled();
  });

  it("the database's monotonic / over-plan / role / settlement refusals pass through as Feature 009's codes", async () => {
    const { recordWarehouseDelivery } = await import("@/lib/admin/warehouse");
    for (const code of [ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE, ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID, ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE, ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED]) {
      opMocks.recordDelivery.mockResolvedValueOnce({ ok: false, code });
      expect(await recordWarehouseDelivery({ shipmentId: SHIPMENT_ID, items: [{ shipmentItemId: ITEM_ID, deliveredQuantityKg: 3 }] })).toEqual({ ok: false, code });
    }
    expect(readMocks.getShipmentItems).not.toHaveBeenCalled();
  });

  it("the Server Action only forwards `items[<id>]` rows the operator filled in (blank = untouched, never rewritten)", () => {
    const actions = read("src/app/dashboard-admin/(warehouse)/shipments/actions.ts");
    expect(actions).toMatch(/\^items\\\[\(\[\^\\\]\]\+\)\\\]\$/);
    expect(actions).toMatch(/value\.trim\(\)\.length > 0/);
    expect(actions).toContain("recordWarehouseDelivery(");
    expect(actions).toContain("executeWarehouseOperation(");
  });
});

describe("T019/T020 — no inventory mutation, no arithmetic on inventory truth, no fabricated reconciliation model", () => {
  it("no console file writes inventory_positions / inventory_reservations / storage_allocations / shipment_items, assigns reserved/available quantities, uses a service role, or caches operational data", () => {
    for (const file of CONSOLE_FILES) {
      // Comments legitimately NAME the forbidden APIs to say they are absent; strip them before matching.
      const source = read(file.replace(`${root}/`, "")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");
      for (const table of ["inventory_positions", "inventory_reservations", "inventory_reservation_items", "storage_allocations", "inventory_ownership_events"]) {
        expect(source, `${file} writes ${table}`).not.toMatch(new RegExp(`from\\("${table}"\\)[\\s\\S]{0,120}?\\.(update|insert|delete|upsert)\\(`));
      }
      expect(source, file).not.toMatch(/\.update\([^)]*(reserved|available)_quantity_kg/);
      expect(source, file).not.toMatch(/(availableQuantityKg|reservedQuantityKg)\s*[-+*/]\s*(availableQuantityKg|reservedQuantityKg)/);
      expect(source, file).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role|createAdminClient/);
      expect(source, file).not.toMatch(/unstable_cache|cacheTag|cacheLife|"use cache"/);
      expect(source, file).not.toMatch(/\.rpc\("(apply_delivery_reservation|reserve_ready_deliveries_for_settlement|admin_review_payment|checkout_order|expire_order_hold)"/);
    }
    // Feature 005's own anti-arithmetic guard still holds for the two files RUN D extended.
    const pattern = /(available|reserved|owned)QuantityKg\s*[-+*/]|[-+*/]\s*(available|reserved|owned)QuantityKg/;
    expect(read("lib/inventory/positions.ts")).not.toMatch(pattern);
    expect(read("lib/inventory/allocations.ts")).not.toMatch(pattern);
    expect(read("lib/inventory/positions.ts")).not.toMatch(/\.update\(|\.delete\(|\.upsert\(|\.insert\(/);
    expect(read("lib/inventory/allocations.ts")).not.toMatch(/\.update\(|\.delete\(|\.upsert\(|\.insert\(/);
  });

  it("the inventory oversight labels available_quantity_kg as gross/on-hand and reserved as the reserved subset — never 'available to sell' — and never claims DB-BLOCK-07 is unresolved", () => {
    const en = read("lib/app/copy/en.ts");
    const inventoryBlock = en.slice(en.indexOf("      warehouse: {"), en.indexOf("    kyb: {", en.indexOf("      warehouse: {")));
    expect(inventoryBlock).toContain('onHand: "On hand (gross)"');
    expect(inventoryBlock).not.toMatch(/available to sell|available to trade|Available quantity/i);
    for (const file of WAREHOUSE_FILES) {
      const source = read(file.replace(`${root}/`, ""));
      expect(source, file).not.toMatch(/DB-BLOCK-07[^.\n]*(unresolved|open|blocked|not yet)/i);
      expect(source, file).not.toMatch(/delivery reservation[^.\n]{0,60}(not (yet )?(implemented|live|exist)|does not exist)/i);
    }
  });

  it("T020 schema evidence: the live schema report and every applied migration contain NO variance / reconciliation / quarantine / discrepancy / stock-count representation; storage_allocations.status is exactly STORED/RELEASED/DELIVERED", () => {
    const report = JSON.parse(JSON.parse(read("docs/database/database-schema-report.json"))[0].database_schema_report) as {
      tables: { table_name: string }[];
      columns: { table_name: string; column_name: string }[];
      constraints: { table_name: string; constraint_name: string; definition?: string }[];
      functions: { function_name: string }[];
      views: unknown[];
    };
    const vocabulary = /varian(ce|t_status)|reconcil|quarantin|discrepan|stock_?count|cycle_?count|write_?off|shrinkage|warehouse_?hold|inventory_?adjust/i;
    expect(report.views).toEqual([]);
    expect(report.tables.filter((t) => vocabulary.test(t.table_name))).toEqual([]);
    expect(report.columns.filter((c) => vocabulary.test(c.column_name) && c.column_name !== "variant_name_snapshot")).toEqual([]);
    expect(report.functions.filter((f) => vocabulary.test(f.function_name))).toEqual([]);
    const allocationStatus = report.constraints.find((c) => c.table_name === "storage_allocations" && c.constraint_name === "storage_allocations_status_check");
    expect(allocationStatus?.definition).toBe("CHECK (status = ANY (ARRAY['STORED'::text, 'RELEASED'::text, 'DELIVERED'::text]))");
    // No HOLD/QUARANTINE value exists on any inventory/custody constraint (the only HOLD is orders.status; FROZEN is disputes.status).
    for (const c of report.constraints) {
      if (["inventory_positions", "storage_allocations", "shipment_items", "order_shipments", "inventory_ownership_events"].includes(c.table_name)) {
        expect(c.definition ?? "", `${c.table_name}.${c.constraint_name}`).not.toMatch(/'(HOLD|QUARANTINE|QUARANTINED|VARIANCE|ON_HOLD|FROZEN)'/);
      }
    }
    // Every migration applied after the report (2026-09-09 → 2026-09-14) adds none of these either.
    const migrationsDir = join(root, "supabase", "migrations");
    const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql") && !f.includes("rollback"));
    expect(migrations.length).toBeGreaterThanOrEqual(7);
    for (const file of migrations) {
      const sql = read(`supabase/migrations/${file}`).replace(/--[^\n]*/g, "");
      expect(sql, file).not.toMatch(/create\s+table[^;]*\b(varian|reconcil|quarantin|discrepan|stock_count|adjustment)/i);
      expect(sql, file).not.toMatch(/add\s+column[^;]*\b(varian|reconcil|quarantin|discrepan|hold_status|quarantine)/i);
      expect(sql, file).not.toMatch(/'(QUARANTINE|QUARANTINED|VARIANCE|ON_HOLD)'/);
    }
  });

  it("the console builds NO reconciliation/variance/adjustment control: the gap notice has no form, action, button or input, and no console file names a HOLD/VARIANCE/QUARANTINE status or an adjustment write", () => {
    const notice = read("components/admin/warehouse/reconciliation-gap-notice.tsx");
    expect(notice).not.toMatch(/<form|<button|<input|useActionState|"use client"|"use server"|action=/);
    expect(read("src/app/dashboard-admin/(warehouse)/inventory/page.tsx")).toContain("<ReconciliationGapNotice />");
    for (const file of WAREHOUSE_FILES) {
      const source = read(file.replace(`${root}/`, "")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      expect(source, file).not.toMatch(/"(HOLD|QUARANTINE|QUARANTINED|VARIANCE|ON_HOLD|RECONCILED|ADJUSTED)"/);
      expect(source, file).not.toMatch(/\b(adjustInventory|reconcilePosition|recordVariance|quarantine|releaseHold)\s*\(/);
      expect(source, file).not.toMatch(/event_type\s*:\s*["']ADJUSTMENT["']/);
    }
  });
});

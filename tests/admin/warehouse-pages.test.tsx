import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, INVENTORY_FIXTURES, createAnonymousFixtureClient, signInAsFixture } from "@/tests/auth/fixture-session";
import { buildRequestedOrder, type WithLiveClient } from "@/tests/orders/live-helpers";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN D — LIVE page + action proofs for Phase 6 with the repository's real fixture sessions
 * (`warehouse-admin` = `platform_admins.role = 'WAREHOUSE'`, `finance-admin` = `'FINANCE'`, the approved
 * `buyer-and-seller` trading member with no operational role, and an anonymous client). Every write
 * goes through the console's own Server Actions → `lib/admin/warehouse.ts` → Feature 009's named
 * functions → the live database (RLS + `validate_shipment_transition`). Only the legs reachable with
 * the ORDINARY fixtures are exercised here; the PAID-order legs (monotonic decrease / over-plan
 * refusals, full-delivery reservation release) are Feature 009's own recorded live evidence
 * (`tests/delivery/t017-record-delivery-live.test.ts`, `scripts/t013-delivery-live-proof.ts` 18/18),
 * reused per the task's own composition allowance — the console adds no arithmetic to re-prove.
 *
 * COMPLIANCE is proven forbidden structurally in `tests/admin/access-matrix.test.tsx` (the matrix) and
 * live in RUN B (`(compliance)` fixture → WAREHOUSE routes `forbidden`); RUN D's disposable
 * COMPLIANCE fixture is not re-created here (human-authorized per run, not improvised).
 */

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
    set: (name: string, value: string) => {
      if (name === "hills-acting-org") cookieState.value = value;
    },
    getAll: () => [],
  }),
}));
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
const redirectCalls = vi.hoisted(() => ({ targets: [] as string[] }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    redirectCalls.targets.push(target);
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(cleanup);

const withLiveClient: WithLiveClient = async (client, run) => {
  serverClientState.client = client;
  vi.resetModules();
  return run();
};

async function renderPage(element: React.ReactElement) {
  const { LocaleProvider } = await import("@/components/locale/locale-provider");
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

const LIVE_TIMEOUT_MS = 120_000;
const BUYER = INVENTORY_FIXTURES.orgB;

let warehouse: SupabaseClient;
let finance: SupabaseClient;
let member: SupabaseClient;

beforeAll(async () => {
  warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  member = await signInAsFixture(BUYER.email);
}, LIVE_TIMEOUT_MS);

function operationForm(shipmentId: string, operation: string, reason?: string): FormData {
  const form = new FormData();
  form.set("shipmentId", shipmentId);
  form.set("operation", operation);
  if (reason !== undefined) form.set("reason", reason);
  return form;
}

async function runOperationAs(client: SupabaseClient, shipmentId: string, operation: string, reason?: string) {
  return withLiveClient(client, async () => {
    const { runWarehouseOperation } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/actions");
    return runWarehouseOperation(undefined, operationForm(shipmentId, operation, reason));
  });
}

async function readShipmentAs(client: SupabaseClient, shipmentId: string) {
  return withLiveClient(client, async () => {
    const { getShipmentById } = await import("@/lib/delivery/read");
    return getShipmentById({ shipmentId });
  });
}

/** The zero-based queue page a shipment sits on (queues are oldest-first and paged; the long-running test database has many rows). */
async function locateQueuePage(queue: "requested" | "inProgress" | "dispatched" | "held" | "closed", shipmentId: string): Promise<number> {
  return withLiveClient(warehouse, async () => {
    const { listWarehouseQueue } = await import("@/lib/admin/warehouse");
    for (let page = 0; page < 200; page += 1) {
      const result = await listWarehouseQueue({ queue, page });
      if (result.rows.some((row) => row.id === shipmentId)) return page;
      if (!result.hasMore) break;
    }
    throw new Error(`shipment ${shipmentId} not found in queue ${queue}`);
  });
}

/** Privileged-free inventory snapshot through Feature 005's warehouse-oversight read (the console's own view). */
async function inventorySnapshotAsWarehouse() {
  return withLiveClient(warehouse, async () => {
    const { getInventoryPositionsForWarehouseOversight } = await import("@/lib/inventory/positions");
    const { rows } = await getInventoryPositionsForWarehouseOversight({ pageSize: 100 });
    return rows.map((row) => `${row.id}:${row.availableQuantityKg}:${row.reservedQuantityKg}`).sort();
  });
}

describe("T016 — shipment queues (live)", () => {
  it("WAREHOUSE: a freshly requested shipment (another organization's order) appears in the `requested` queue with its code, status label and kg totals; the order reference is stated unreadable for a pure WAREHOUSE role", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    const shipment = (await readShipmentAs(warehouse, shipmentId))!;
    expect(shipment.status).toBe("REQUESTED");

    const page = await locateQueuePage("requested", shipmentId);
    await withLiveClient(warehouse, async () => {
      const { default: ShipmentsPage } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/page");
      await renderPage(await ShipmentsPage({ searchParams: Promise.resolve({ page: String(page) }) }));
    });
    expect(document.querySelector('[data-warehouse-queue="requested"]')).not.toBeNull();
    expect(document.body.textContent).toContain(shipment.shipmentCode);
    const badges = [...document.querySelectorAll('[data-slot="shipment-status-badge"]')].map((el) => el.getAttribute("data-status"));
    expect(badges.length).toBeGreaterThan(0);
    for (const status of badges) expect(status).toBe("REQUESTED");
    expect(document.body.textContent).toMatch(/2 kg/);
    // Honest degradation: `orders_view` is `can_view_order`, so a pure WAREHOUSE role reads no order code.
    expect(shipment.orderCode).toBe("");
    expect(document.querySelector("[data-order-gap]")).not.toBeNull();
    expect(document.querySelector("[data-read-gap-note]")).not.toBeNull();
    // Queue state correctness: the same shipment is NOT in the other queues.
    cleanup();
    await withLiveClient(warehouse, async () => {
      const { default: ShipmentsPage } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/page");
      await renderPage(await ShipmentsPage({ searchParams: Promise.resolve({ queue: "dispatched" }) }));
    });
    expect(document.body.textContent).not.toContain(shipment.shipmentCode);
    for (const status of [...document.querySelectorAll('[data-slot="shipment-status-badge"]')].map((el) => el.getAttribute("data-status"))) {
      expect(["DISPATCHED", "PARTIALLY_DELIVERED"]).toContain(status);
    }
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL isolation: FINANCE and a plain member are refused by the queue page itself; anonymous is redirected to the operator sign-in; no shipment code leaks", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    const shipment = (await readShipmentAs(warehouse, shipmentId))!;

    await withLiveClient(finance, async () => {
      const { default: ShipmentsPage } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/page");
      await renderPage(await ShipmentsPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Required role: Warehouse");
    expect(document.body.textContent).not.toContain(shipment.shipmentCode);
    cleanup();

    await withLiveClient(member, async () => {
      const { default: ShipmentsPage } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/page");
      await renderPage(await ShipmentsPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="no-operational-role"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain(shipment.shipmentCode);
    cleanup();

    await withLiveClient(createAnonymousFixtureClient(), async () => {
      const { default: ShipmentsPage } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/page");
      const element = await ShipmentsPage({ searchParams: Promise.resolve({}) });
      redirectCalls.targets.length = 0;
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
    });

    // The detail route refuses identically (a direct deep link with the wrong role).
    await withLiveClient(finance, async () => {
      const { default: ShipmentPage } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/[shipmentId]/page");
      await renderPage(await ShipmentPage({ params: Promise.resolve({ shipmentId }) }));
    });
    expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain(shipment.contactPhone);
  }, LIVE_TIMEOUT_MS);
});

describe("T017 — operational transitions through the console → Feature 009 (live)", () => {
  it("VALID: markReady (REQUESTED → READY, pre-payment) succeeds through the console action; the persisted status is READY and ready_at is trigger-set; no inventory position moved", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    const before = await inventorySnapshotAsWarehouse();

    const result = await runOperationAs(warehouse, shipmentId, "markReady");
    expect(result).toEqual({ ok: true, data: { shipmentId, operation: "markReady", toStatus: "READY" } });

    const after = (await readShipmentAs(warehouse, shipmentId))!;
    expect(after.status).toBe("READY");
    expect(after.readyAt).not.toBeNull();
    expect(await inventorySnapshotAsWarehouse()).toEqual(before);
  }, LIVE_TIMEOUT_MS);

  it("SETTLEMENT GATE: confirmCapacity and reserve on an unsettled order are refused by the DATABASE with Feature 009's own code (SHIPMENT_ORDER_NOT_SETTLED); status and inventory unchanged", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    const before = await inventorySnapshotAsWarehouse();

    const capacity = await runOperationAs(warehouse, shipmentId, "confirmCapacity");
    expect(capacity).toEqual({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED });
    expect((await readShipmentAs(warehouse, shipmentId))!.status).toBe("REQUESTED");

    const ready = await runOperationAs(warehouse, shipmentId, "markReady");
    expect(ready.ok).toBe(true);
    const reserve = await runOperationAs(warehouse, shipmentId, "reserve");
    expect(reserve).toEqual({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED });
    expect((await readShipmentAs(warehouse, shipmentId))!.status).toBe("READY");
    expect(await inventorySnapshotAsWarehouse()).toEqual(before);
  }, LIVE_TIMEOUT_MS);

  it("INVALID: dispatch on a REQUESTED shipment is refused (no matching source state — nothing written); an unknown operation and a reason-less cancel are refused at validation", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    const dispatch = await runOperationAs(warehouse, shipmentId, "dispatch");
    expect(dispatch.ok).toBe(false);
    expect((await readShipmentAs(warehouse, shipmentId))!.status).toBe("REQUESTED");

    const unknown = await runOperationAs(warehouse, shipmentId, "DELIVERED");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);

    const cancel = await runOperationAs(warehouse, shipmentId, "cancel", "");
    expect(cancel.ok).toBe(false);
    if (!cancel.ok) expect(cancel.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    expect((await readShipmentAs(warehouse, shipmentId))!.status).toBe("REQUESTED");
  }, LIVE_TIMEOUT_MS);

  it("IRREVERSIBLE with reason: cancel (REQUESTED → CANCELLED) succeeds through the console; afterwards the detail page offers no operation and states the terminal note", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    const result = await runOperationAs(warehouse, shipmentId, "cancel", "Buyer withdrew the delivery request.");
    expect(result).toEqual({ ok: true, data: { shipmentId, operation: "cancel", toStatus: "CANCELLED" } });
    expect((await readShipmentAs(warehouse, shipmentId))!.status).toBe("CANCELLED");

    await withLiveClient(warehouse, async () => {
      const { default: ShipmentPage } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/[shipmentId]/page");
      await renderPage(await ShipmentPage({ params: Promise.resolve({ shipmentId }) }));
    });
    expect(document.querySelector('[data-decision-state="not-operable"]')).not.toBeNull();
    expect(document.querySelector('[data-state-note="terminal"]')).not.toBeNull();
    expect(document.querySelector('[data-delivery-form="not-applicable"]')).not.toBeNull();
    expect(document.querySelectorAll("[data-decision-option]").length).toBe(0);
    // A terminal shipment refuses any further operation at the database (terminal_shipment_cannot_change → SHIPMENT_NOT_EDITABLE) or by source-state mismatch.
    const again = await runOperationAs(warehouse, shipmentId, "fail", "Should be refused.");
    expect(again.ok).toBe(false);
  }, LIVE_TIMEOUT_MS);

  it("WRONG ROLE: FINANCE and a plain member invoking the action directly are refused WAREHOUSE_NOT_CAPABLE before any database attempt; anonymous is PROFILE_AUTH_REQUIRED; status unchanged", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    expect(await runOperationAs(finance, shipmentId, "markReady")).toEqual({ ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE });
    expect(await runOperationAs(member, shipmentId, "markReady")).toEqual({ ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE });
    expect(await runOperationAs(createAnonymousFixtureClient(), shipmentId, "markReady")).toEqual({ ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED });
    expect((await readShipmentAs(warehouse, shipmentId))!.status).toBe("REQUESTED");
  }, LIVE_TIMEOUT_MS);

  it("DETAIL PAGE: for a REQUESTED shipment the operations panel shows exactly the Feature 009-valid operations (confirmCapacity, markReady, fail, cancel) with the settlement-gated marker, items in kg, and the suspension/read-gap notes", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    await withLiveClient(warehouse, async () => {
      const { default: ShipmentPage } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/[shipmentId]/page");
      await renderPage(await ShipmentPage({ params: Promise.resolve({ shipmentId }) }));
    });
    const options = [...document.querySelectorAll("[data-decision-option]")].map((el) => el.getAttribute("data-decision-option"));
    expect(options).toEqual(["confirmCapacity", "markReady", "fail", "cancel"]);
    expect(document.querySelectorAll("[data-option-badge]").length).toBe(1);
    expect(document.querySelectorAll('[data-decision-option][data-destructive="true"]').length).toBe(2);
    expect(document.querySelector("[data-settlement-note]")).not.toBeNull();
    expect(document.querySelector("[data-suspension-note]")).not.toBeNull();
    expect(document.querySelector("[data-read-gap-note]")).not.toBeNull();
    expect(document.querySelector('[data-item-delivered="0"]')).not.toBeNull();
    expect(document.body.textContent).toMatch(/2 kg/);
    expect(document.querySelector('[data-delivery-form="not-applicable"]')).not.toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("T018 — delivered quantity through the console → Feature 009 recordDelivery (legs reachable with ordinary fixtures, live)", () => {
  async function recordAs(client: SupabaseClient, shipmentId: string, entries: Record<string, string>) {
    return withLiveClient(client, async () => {
      const { recordShipmentDelivery } = await import("@/src/app/dashboard-admin/(warehouse)/shipments/actions");
      const form = new FormData();
      form.set("shipmentId", shipmentId);
      for (const [itemId, value] of Object.entries(entries)) form.set(`items[${itemId}]`, value);
      return recordShipmentDelivery(undefined, form);
    });
  }

  it("non-warehouse callers are refused WAREHOUSE_NOT_CAPABLE; a WAREHOUSE attempt on a not-yet-dispatched shipment is refused SHIPMENT_NOT_EDITABLE; a negative value is refused at validation — delivered stays 0 and no position moves", async () => {
    const { shipmentId } = await buildRequestedOrder(withLiveClient, member, BUYER.organizationId, 2);
    const items = await withLiveClient(warehouse, async () => {
      const { getShipmentItems } = await import("@/lib/delivery/read");
      return getShipmentItems({ shipmentId });
    });
    const itemId = items[0]!.id;
    const before = await inventorySnapshotAsWarehouse();

    expect(await recordAs(member, shipmentId, { [itemId]: "1" })).toEqual({ ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE });
    expect(await recordAs(finance, shipmentId, { [itemId]: "1" })).toEqual({ ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE });
    expect(await recordAs(warehouse, shipmentId, { [itemId]: "1" })).toEqual({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE });
    const negative = await recordAs(warehouse, shipmentId, { [itemId]: "-1" });
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    const empty = await recordAs(warehouse, shipmentId, {});
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);

    const after = await withLiveClient(warehouse, async () => {
      const { getShipmentItems } = await import("@/lib/delivery/read");
      return getShipmentItems({ shipmentId });
    });
    expect(after[0]!.deliveredQuantityKg).toBe(0);
    expect(await inventorySnapshotAsWarehouse()).toEqual(before);
  }, LIVE_TIMEOUT_MS);

  it("monotonic decrease / over-plan refusals and full-delivery reservation release are NOT re-derived here — Feature 009's recorded live evidence (t017-record-delivery-live, T013 scenarios 9–10) is reused; the console adds no arithmetic to re-prove", () => {
    expect(true).toBe(true);
  });
});

describe("T019 — custody/inventory oversight (live, cross-organization)", () => {
  it("WAREHOUSE reads positions of organizations it is NOT a member of, with the authoritative stored quantities labelled on-hand (gross) / reserved and NO third figure", async () => {
    await withLiveClient(warehouse, async () => {
      const { default: InventoryPage } = await import("@/src/app/dashboard-admin/(warehouse)/inventory/page");
      await renderPage(await InventoryPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-inventory-view="positions"]')).not.toBeNull();
    // Both foundation organizations' seeded positions are visible to the warehouse role (cross-org by design).
    expect(document.body.textContent).toContain(INVENTORY_FIXTURES.orgA.organizationId);
    expect(document.body.textContent).toContain(INVENTORY_FIXTURES.orgB.organizationId);
    const onHand = document.querySelector(`[data-on-hand="${INVENTORY_FIXTURES.quantities.positionAAvailable}"]`);
    const reserved = document.querySelector(`[data-reserved="${INVENTORY_FIXTURES.quantities.positionAReserved}"]`);
    expect(onHand).not.toBeNull();
    expect(reserved).not.toBeNull();
    expect(onHand!.textContent).toBe(`${INVENTORY_FIXTURES.quantities.positionAAvailable} kg`);
    expect(reserved!.textContent).toBe(`${INVENTORY_FIXTURES.quantities.positionAReserved} kg`);
    // No computed "free" figure anywhere: the difference is never rendered.
    const free = (INVENTORY_FIXTURES.quantities.positionAAvailable - INVENTORY_FIXTURES.quantities.positionAReserved).toFixed(3);
    expect(document.body.textContent).not.toContain(`${free} kg`);
    expect(document.body.textContent).not.toContain(`${Number(free)} kg`);
    expect(document.body.textContent).toContain("On hand (gross)");
    expect(document.body.textContent).not.toMatch(/available to sell/i);
    expect(document.querySelector("[data-inventory-semantics]")).not.toBeNull();
    // Owner names are honestly unavailable for a pure WAREHOUSE role (organizations has no read path).
    expect(document.querySelector("[data-organization-gap]")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Foundation Test — Buyer Only");
    // T020: the reconciliation gap is stated, with no control.
    expect(document.querySelector('[data-capability-gap="variance-reconciliation"]')).not.toBeNull();
    expect(document.querySelector('[data-capability-gap="variance-reconciliation"] button, [data-capability-gap="variance-reconciliation"] form')).toBeNull();
  }, LIVE_TIMEOUT_MS);

  it("the allocations view lists the seeded cross-org storage allocations with the approved STORED/RELEASED/DELIVERED vocabulary and both stored quantities", async () => {
    await withLiveClient(warehouse, async () => {
      const { default: InventoryPage } = await import("@/src/app/dashboard-admin/(warehouse)/inventory/page");
      await renderPage(await InventoryPage({ searchParams: Promise.resolve({ view: "allocations" }) }));
    });
    expect(document.querySelector('[data-inventory-view="allocations"]')).not.toBeNull();
    const badges = [...document.querySelectorAll('[data-slot="storage-status-badge"]')].map((el) => el.getAttribute("data-status"));
    expect(badges.length).toBeGreaterThan(0);
    for (const status of badges) expect(["STORED", "RELEASED", "DELIVERED"]).toContain(status);
    expect(document.body.textContent).toContain(`${INVENTORY_FIXTURES.quantities.allocationAQuantity} kg`);
    expect(document.body.textContent).toContain(`${INVENTORY_FIXTURES.quantities.allocationAReleased} kg`);
  }, LIVE_TIMEOUT_MS);

  it("the position detail renders Org A's position for the WAREHOUSE role (not a member of Org A) with its matching allocation", async () => {
    await withLiveClient(warehouse, async () => {
      const { default: PositionPage } = await import("@/src/app/dashboard-admin/(warehouse)/inventory/[positionId]/page");
      await renderPage(await PositionPage({ params: Promise.resolve({ positionId: INVENTORY_FIXTURES.orgA.positionId }) }));
    });
    expect(document.querySelector(`[data-on-hand="${INVENTORY_FIXTURES.quantities.positionAAvailable}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-reserved="${INVENTORY_FIXTURES.quantities.positionAReserved}"]`)).not.toBeNull();
    expect(document.body.textContent).toContain(INVENTORY_FIXTURES.orgA.organizationId);
    expect(document.body.textContent).toContain(`${INVENTORY_FIXTURES.quantities.allocationAQuantity} kg`);
  }, LIVE_TIMEOUT_MS);

  it("the authoritative reserved value is Feature 005's stored column — the console's read returns byte-identical quantities to the member's own org-scoped read", async () => {
    const memberView = await withLiveClient(member, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return (await getInventoryPositions({ organizationId: BUYER.organizationId, pageSize: 100 })).rows;
    });
    const warehouseView = await withLiveClient(warehouse, async () => {
      const { getInventoryPositionsForWarehouseOversight } = await import("@/lib/inventory/positions");
      return (await getInventoryPositionsForWarehouseOversight({ pageSize: 100 })).rows;
    });
    expect(memberView.length).toBeGreaterThan(0);
    for (const position of memberView) {
      const seen = warehouseView.find((row) => row.id === position.id);
      expect(seen, position.id).toBeTruthy();
      expect(seen!.availableQuantityKg).toBe(position.availableQuantityKg);
      expect(seen!.reservedQuantityKg).toBe(position.reservedQuantityKg);
    }
    // And the warehouse sees MORE than one organization (cross-org), which the member cannot.
    expect(new Set(warehouseView.map((row) => row.ownerOrganizationId)).size).toBeGreaterThan(1);
  }, LIVE_TIMEOUT_MS);

  it("DIRECT URL isolation: FINANCE is forbidden, a plain member has no operational role, anonymous is redirected — no quantity leaks; the member's own org-scoped read stays org-scoped", async () => {
    await withLiveClient(finance, async () => {
      const { default: InventoryPage } = await import("@/src/app/dashboard-admin/(warehouse)/inventory/page");
      await renderPage(await InventoryPage({ searchParams: Promise.resolve({}) }));
    });
    expect(document.querySelector('[data-admin-state="forbidden"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain(`${INVENTORY_FIXTURES.quantities.positionAAvailable} kg`);
    cleanup();

    await withLiveClient(member, async () => {
      const { default: PositionPage } = await import("@/src/app/dashboard-admin/(warehouse)/inventory/[positionId]/page");
      await renderPage(await PositionPage({ params: Promise.resolve({ positionId: INVENTORY_FIXTURES.orgA.positionId }) }));
    });
    expect(document.querySelector('[data-admin-state="no-operational-role"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain(`${INVENTORY_FIXTURES.quantities.positionAAvailable} kg`);
    cleanup();

    await withLiveClient(createAnonymousFixtureClient(), async () => {
      const { default: InventoryPage } = await import("@/src/app/dashboard-admin/(warehouse)/inventory/page");
      const element = await InventoryPage({ searchParams: Promise.resolve({}) });
      expect(() => render(element)).toThrow("NEXT_REDIRECT:/admin/sign-in/");
    });

    // RLS itself: the member calling the cross-org read gets ONLY its own organization's rows (never Org A's).
    const memberCrossOrg = await withLiveClient(member, async () => {
      const { getInventoryPositionsForWarehouseOversight } = await import("@/lib/inventory/positions");
      return (await getInventoryPositionsForWarehouseOversight({ pageSize: 100 })).rows;
    });
    expect(memberCrossOrg.some((row) => row.id === INVENTORY_FIXTURES.orgA.positionId)).toBe(false);
    for (const row of memberCrossOrg) expect(row.ownerOrganizationId).toBe(BUYER.organizationId);
  }, LIVE_TIMEOUT_MS);
});

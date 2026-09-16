import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { getCustodyForOrderItems } from "@/lib/delivery/custody";
import { getShipmentById, getShipmentItems, getShipmentsForWarehouseQueue } from "@/lib/delivery/read";
import { SHIPMENT_TRANSITIONS } from "@/lib/delivery/transitions";
import type { OrderShipmentStatus, ShipmentItemDTO, ShipmentWithOrderContextDTO } from "@/lib/delivery/types";
import { CancelShipmentInput, FailShipmentInput, RecordDeliveryInput, ShipmentIdInput } from "@/lib/delivery/validation";
import * as warehouseOperations from "@/lib/delivery/warehouse";
import { getStorageAllocationsForWarehouseOversight } from "@/lib/inventory/allocations";
import type { StorageAllocation } from "@/lib/inventory/types";
import { getOrderItems } from "@/lib/orders/read";
import type { OrderItemDTO } from "@/lib/orders/validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackCode, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN D (Phase 6, T016–T018) — the Warehouse console's ORCHESTRATION layer.
 *
 * This file composes two authoritative domain layers and owns NO transactional logic of its own:
 *
 * - Feature 009 (`lib/delivery/*`) owns shipment reads (`getShipmentsForWarehouseQueue`,
 *   `getShipmentById`, `getShipmentItems`), the transition graph (`SHIPMENT_TRANSITIONS`, a
 *   UI-affordance copy of the live trigger), every named warehouse operation
 *   (`lib/delivery/warehouse.ts`: `confirmCapacity`/`markReady`/`reserve`/`startPicking`/`book`/
 *   `dispatch`/`fail`/`cancel`/`recordDelivery`), the input contracts and the error mapping.
 * - Feature 005 (`lib/inventory/*`) owns custody/inventory truth (`storage_allocations`,
 *   `inventory_positions`).
 *
 * ── WHAT IS DELIBERATELY ABSENT (FR-005, plan.md architecture decision 2) ────────────────────────
 *
 * - No raw write path to the shipment tables anywhere in `lib/admin` or `src/app/dashboard-admin`
 *   (T017's own audit: `grep -rn "order_shipments" src/app/dashboard-admin lib/admin` shows reads
 *   only): every state change below is a call to a NAMED Feature 009 function whose target status
 *   is a literal that function supplies itself. This module never accepts a target status from a
 *   caller and never writes `delivered_quantity_kg` itself.
 * - No inventory arithmetic and no `inventory_positions`/`inventory_reservations`/
 *   `storage_allocations` write: reservation, release and delivery decrements happen inside
 *   `validate_shipment_transition`/`validate_shipment_item`/`apply_delivery_reservation`, which the
 *   Feature 009 layer triggers by attempting its guarded UPDATE. The per-shipment totals below are a
 *   presentation SUM of `shipment_items.planned_quantity_kg`/`delivered_quantity_kg` (plan-vs-progress
 *   facts on the shipment itself), never a stored inventory figure and never a substitute for one.
 * - No second state machine: `WAREHOUSE_OPERATIONS` maps each Feature 009 operation to the exact
 *   `fromStatuses` that function itself attempts (mirrored from `lib/delivery/warehouse.ts` and
 *   cross-checked against `SHIPMENT_TRANSITIONS` by `tests/admin/warehouse-operations.test.ts`).
 *   Hiding a control is never authorization — the database trigger decides every attempt.
 * - No suspended-organization rule: the live trigger consults no organization status, and no
 *   approved policy exists for warehouse work on a newly-suspended organization's in-flight
 *   shipment (spec.md Open items). This module neither blocks nor auto-continues on that basis.
 *
 * ── AUTHORIZATION ORDER (fail closed) ─────────────────────────────────────────────────────────────
 *
 * 1. `checkRoleFunctionAccess("is_warehouse_operator")` — the console's own live guard (shell
 *    boundary + the approved function), so a direct Server Action invocation by a FINANCE/COMPLIANCE
 *    operator, a plain member or an anonymous caller is refused HERE with Feature 009's own
 *    `WAREHOUSE_NOT_CAPABLE` / `PROFILE_AUTH_REQUIRED` codes (no second vocabulary).
 * 2. The Feature 009 function re-verifies `is_warehouse_operator()` itself, live.
 * 3. RLS (`shipments_warehouse_manage`, `shipment_items_warehouse_manage`) and the triggers decide.
 *
 * ── READ DEGRADATION IS HONEST ────────────────────────────────────────────────────────────────────
 *
 * A pure WAREHOUSE operator has no `orders`/`order_items`/`organizations` read path (`orders_view`
 * is `can_view_order(id)`; `organizations_member_select` is member/platform-admin only — the same
 * shape RUN B recorded for COMPLIANCE). Feature 009's reads already degrade `orderCode`/
 * `buyerOrganizationId` to `""` in that case; this module passes those through as `null` and the UI
 * states the gap. A platform admin (ADMIN/SUPER_ADMIN) sees the values. Nothing is fabricated.
 *
 * SERVER-ONLY: imports `lib/supabase/server` (via the domain layers) — never import from a Client
 * Component. No `unstable_cache`/`"use cache"`/`cacheTag`: operational truth is re-read per request.
 */

/* ═══════════════════════════════ T016 — queues ═══════════════════════════════ */

/**
 * Queue → the exact `order_shipments.status` values it lists (Feature 009 vocabulary, verbatim).
 * `requested`/`inProgress`/`dispatched` are the plan's three operational queues; `held` groups the
 * two fail-closed states with no forward transition (`DISPUTED` = FREEZE, `FAILED` — DB-OPEN-18 /
 * Feature 012); `closed` lists the two terminal outcomes. `DRAFT` is deliberately NOT a warehouse
 * queue: it is the buyer's own unsubmitted plan (`lib/delivery/warehouse.ts` header).
 */
export const WAREHOUSE_QUEUES = {
  requested: ["REQUESTED"],
  inProgress: ["CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED"],
  dispatched: ["DISPATCHED", "PARTIALLY_DELIVERED"],
  held: ["DISPUTED", "FAILED"],
  closed: ["DELIVERED", "CANCELLED"],
} as const satisfies Record<string, readonly OrderShipmentStatus[]>;

export type WarehouseQueueKey = keyof typeof WAREHOUSE_QUEUES;
export const WAREHOUSE_QUEUE_KEYS = Object.keys(WAREHOUSE_QUEUES) as readonly WarehouseQueueKey[];
export const DEFAULT_WAREHOUSE_QUEUE: WarehouseQueueKey = "requested";

export function isWarehouseQueueKey(value: string | undefined): value is WarehouseQueueKey {
  return value !== undefined && (WAREHOUSE_QUEUE_KEYS as readonly string[]).includes(value);
}

/** The queue a status belongs to — `null` for `DRAFT` (never a warehouse queue). */
export function queueForStatus(status: OrderShipmentStatus): WarehouseQueueKey | null {
  for (const key of WAREHOUSE_QUEUE_KEYS) {
    if ((WAREHOUSE_QUEUES[key] as readonly OrderShipmentStatus[]).includes(status)) return key;
  }
  return null;
}

/** Presentation totals over a shipment's own items (plan vs. progress) — never an inventory figure. */
export type ShipmentItemTotals = {
  itemCount: number;
  plannedQuantityKg: number;
  deliveredQuantityKg: number;
};

export type WarehouseQueueRow = Omit<ShipmentWithOrderContextDTO, "orderCode" | "buyerOrganizationId"> & {
  /** `null` when the operator's role cannot read `orders` (honest, never `""` in the UI). */
  orderCode: string | null;
  buyerOrganizationId: string | null;
  totals: ShipmentItemTotals;
};

const QUEUE_PAGE_SIZE = 50;

function nullIfEmpty(value: string): string | null {
  return value.length > 0 ? value : null;
}

/**
 * ONE batched, RLS-respecting read of the page's `shipment_items` (`shipment_items_view`:
 * `is_warehouse_operator() OR …`), summed per shipment for the queue table. Read-only; the numbers
 * are the items' own stored `planned_quantity_kg`/`delivered_quantity_kg`, added up for display.
 */
async function getItemTotalsByShipment(shipmentIds: readonly string[]): Promise<Map<string, ShipmentItemTotals>> {
  const totals = new Map<string, ShipmentItemTotals>();
  if (shipmentIds.length === 0) return totals;
  const supabase = await createClient();
  const { data: rows } = await supabase.from("shipment_items").select("shipment_id, planned_quantity_kg, delivered_quantity_kg").in("shipment_id", shipmentIds);
  for (const row of rows ?? []) {
    const current = totals.get(row.shipment_id) ?? { itemCount: 0, plannedQuantityKg: 0, deliveredQuantityKg: 0 };
    totals.set(row.shipment_id, {
      itemCount: current.itemCount + 1,
      plannedQuantityKg: current.plannedQuantityKg + Number(row.planned_quantity_kg),
      deliveredQuantityKg: current.deliveredQuantityKg + Number(row.delivered_quantity_kg),
    });
  }
  return totals;
}

/**
 * T016 — one warehouse queue, oldest request first, through Feature 009's own
 * `getShipmentsForWarehouseQueue` (RLS `shipments_view`'s `is_warehouse_operator()` branch is the
 * real boundary; a non-warehouse caller gets an empty list from RLS — and is refused BEFORE this
 * read by the route's own guard). Bounded to `QUEUE_PAGE_SIZE` rows per page.
 */
export async function listWarehouseQueue({ queue, page = 0 }: { queue: WarehouseQueueKey; page?: number }): Promise<{ rows: readonly WarehouseQueueRow[]; hasMore: boolean }> {
  const shipments = await getShipmentsForWarehouseQueue({ statuses: WAREHOUSE_QUEUES[queue] });
  const from = Math.max(0, page) * QUEUE_PAGE_SIZE;
  const pageRows = shipments.slice(from, from + QUEUE_PAGE_SIZE);
  const totals = await getItemTotalsByShipment(pageRows.map((row) => row.id));
  return {
    rows: pageRows.map((row) => ({
      ...row,
      orderCode: nullIfEmpty(row.orderCode),
      buyerOrganizationId: nullIfEmpty(row.buyerOrganizationId),
      totals: totals.get(row.id) ?? { itemCount: 0, plannedQuantityKg: 0, deliveredQuantityKg: 0 },
    })),
    hasMore: shipments.length > from + QUEUE_PAGE_SIZE,
  };
}

/* ═══════════════════════════ T017 — operation map ═══════════════════════════ */

/**
 * The named Feature 009 warehouse operations, each with the EXACT `fromStatuses` that function
 * attempts (mirrored from `lib/delivery/warehouse.ts`, never widened) and its literal target. This
 * map exists ONLY so the UI can show the operations that are valid for the current status; the
 * database trigger remains the authority on every attempt. `recordDelivery` is not a transition
 * (it is the T018 quantity write) and is handled separately.
 */
export const WAREHOUSE_OPERATION_KEYS = ["confirmCapacity", "markReady", "reserve", "startPicking", "book", "dispatch", "fail", "cancel"] as const;
export type WarehouseOperationKey = (typeof WAREHOUSE_OPERATION_KEYS)[number];

export type WarehouseOperationSpec = {
  key: WarehouseOperationKey;
  fromStatuses: readonly OrderShipmentStatus[];
  toStatus: OrderShipmentStatus;
  /** Irreversible / releasing outcome — the UI requires an explicit confirmation and a reason. */
  destructive: boolean;
  /** Feature 009's own input contract requires a mandatory reason (`FailShipmentInput`/`CancelShipmentInput`). */
  reasonRequired: boolean;
  /** The transition invokes the database's settlement gate (`delivery_reservation_requires_settled_order`). */
  settlementGated: boolean;
};

export const WAREHOUSE_OPERATIONS: Readonly<Record<WarehouseOperationKey, WarehouseOperationSpec>> = {
  confirmCapacity: { key: "confirmCapacity", fromStatuses: ["REQUESTED"], toStatus: "CAPACITY_CONFIRMED", destructive: false, reasonRequired: false, settlementGated: true },
  markReady: { key: "markReady", fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED"], toStatus: "READY", destructive: false, reasonRequired: false, settlementGated: false },
  reserve: { key: "reserve", fromStatuses: ["CAPACITY_CONFIRMED", "READY"], toStatus: "RESERVED", destructive: false, reasonRequired: false, settlementGated: true },
  startPicking: { key: "startPicking", fromStatuses: ["READY", "RESERVED"], toStatus: "PICKING", destructive: false, reasonRequired: false, settlementGated: true },
  book: { key: "book", fromStatuses: ["READY", "RESERVED"], toStatus: "BOOKED", destructive: false, reasonRequired: false, settlementGated: true },
  dispatch: { key: "dispatch", fromStatuses: ["PICKING", "BOOKED"], toStatus: "DISPATCHED", destructive: false, reasonRequired: false, settlementGated: true },
  fail: {
    key: "fail",
    fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED"],
    toStatus: "FAILED",
    destructive: true,
    reasonRequired: true,
    settlementGated: false,
  },
  cancel: { key: "cancel", fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED"], toStatus: "CANCELLED", destructive: true, reasonRequired: true, settlementGated: false },
};

export function isWarehouseOperationKey(value: unknown): value is WarehouseOperationKey {
  return typeof value === "string" && (WAREHOUSE_OPERATION_KEYS as readonly string[]).includes(value);
}

/**
 * UI-affordance hint only: the operations whose own `fromStatuses` include `status` AND whose target
 * Feature 009's `SHIPMENT_TRANSITIONS` lists for that status (the two sources must agree — tested).
 * `FAILED`/`DISPUTED`/`DELIVERED`/`CANCELLED`/`DRAFT` yield an empty list by construction.
 */
export function displayableOperations(status: OrderShipmentStatus): readonly WarehouseOperationSpec[] {
  return WAREHOUSE_OPERATION_KEYS.map((key) => WAREHOUSE_OPERATIONS[key]).filter((spec) => spec.fromStatuses.includes(status) && SHIPMENT_TRANSITIONS[status].includes(spec.toStatus));
}

/** Whether the T018 delivered-quantity form applies (Feature 009's `recordDelivery` own precondition). */
export function canRecordDelivery(status: OrderShipmentStatus): boolean {
  return status === "DISPATCHED" || status === "PARTIALLY_DELIVERED";
}

/* ═══════════════════════════ detail composition ═══════════════════════════ */

export type WarehouseShipmentDetail = {
  shipment: WarehouseQueueRow;
  items: readonly ShipmentItemDTO[];
  /** Empty for a pure WAREHOUSE operator (`order_items_view` is `can_view_order`) — names degrade to ids. */
  orderItems: readonly OrderItemDTO[];
  /** Feature 005's own allocation DTOs linked to this shipment's order items (read-only pass-through). */
  custody: readonly StorageAllocation[];
  /** `true` when the buyer organization could not be read, so custody was resolved by order item only. */
  custodyResolvedWithoutOrganization: boolean;
};

/**
 * One shipment for the warehouse detail page. Reads: Feature 009 (`getShipmentById`,
 * `getShipmentItems`), Feature 007 (`getOrderItems`, degrades to empty for a pure warehouse role) and
 * Feature 005 custody — via Feature 009's `getCustodyForOrderItems` when the buyer organization is
 * readable, otherwise via the warehouse-oversight allocation read keyed by order item (RLS
 * `storage_owner_read`'s `is_warehouse_operator()` branch). `null` = not found or not readable.
 */
export async function getWarehouseShipmentDetail({ shipmentId }: { shipmentId: string }): Promise<WarehouseShipmentDetail | null> {
  const shipment = await getShipmentById({ shipmentId });
  if (!shipment) return null;

  const [items, orderItems] = await Promise.all([getShipmentItems({ shipmentId }), getOrderItems({ orderId: shipment.orderId })]);
  const orderItemIds = items.map((item) => item.orderItemId);
  const buyerOrganizationId = nullIfEmpty(shipment.buyerOrganizationId);

  const custody = buyerOrganizationId
    ? await getCustodyForOrderItems({ organizationId: buyerOrganizationId, orderItemIds })
    : (await getStorageAllocationsForWarehouseOversight({ orderItemIds, pageSize: 100 })).rows;

  const totals = items.reduce<ShipmentItemTotals>(
    (sum, item) => ({ itemCount: sum.itemCount + 1, plannedQuantityKg: sum.plannedQuantityKg + item.plannedQuantityKg, deliveredQuantityKg: sum.deliveredQuantityKg + item.deliveredQuantityKg }),
    { itemCount: 0, plannedQuantityKg: 0, deliveredQuantityKg: 0 },
  );

  return {
    shipment: { ...shipment, orderCode: nullIfEmpty(shipment.orderCode), buyerOrganizationId, totals },
    items,
    orderItems,
    custody,
    custodyResolvedWithoutOrganization: buyerOrganizationId === null,
  };
}

/* ═══════════════════════ T017/T018 — guarded delegation ═══════════════════════ */

async function requireWarehouseConsoleAccess(): Promise<{ ok: true } | { ok: false; code: ActionFeedbackCode }> {
  const access = await checkRoleFunctionAccess("is_warehouse_operator");
  if (!access.ok) return { ok: false, code: access.denial === "anonymous" ? ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED : ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE };
  return { ok: true };
}

function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

export type WarehouseOperationOutcome = { shipmentId: string; operation: WarehouseOperationKey; toStatus: OrderShipmentStatus };

/**
 * T017 — runs ONE named Feature 009 warehouse operation. `operation` is a closed key of
 * `WAREHOUSE_OPERATIONS` (never a status); `reason` is validated through Feature 009's own
 * `FailShipmentInput`/`CancelShipmentInput` for `fail`/`cancel` (mandatory operator discipline —
 * `order_shipments` has no reason column to persist it, as Feature 009 records; it is validated,
 * never silently dropped into a fake success and never written to a column that does not exist).
 * Every refusal is Feature 009's own mapped code — no console vocabulary of its own.
 */
export async function executeWarehouseOperation(input: { shipmentId?: string; operation?: string; reason?: string }): Promise<ActionFeedbackResult<WarehouseOperationOutcome>> {
  const access = await requireWarehouseConsoleAccess();
  if (!access.ok) return { ok: false, code: access.code };

  if (!isWarehouseOperationKey(input.operation)) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { operation: ["OPERATION_UNKNOWN"] } };
  }
  const spec = WAREHOUSE_OPERATIONS[input.operation];

  const parsed = spec.reasonRequired
    ? (spec.key === "fail" ? FailShipmentInput : CancelShipmentInput).safeParse({ shipmentId: input.shipmentId, reason: input.reason })
    : ShipmentIdInput.safeParse({ shipmentId: input.shipmentId });
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const shipmentId = parsed.data.shipmentId;
  const result = await warehouseOperations[spec.key]({ shipmentId });
  if (!result.ok) return result;
  return { ok: true, data: { shipmentId, operation: spec.key, toStatus: spec.toStatus } };
}

export type WarehouseDeliveryOutcome = { shipmentId: string; items: readonly ShipmentItemDTO[]; status: OrderShipmentStatus | null };

/**
 * T018 — records delivered quantities through Feature 009's `recordDelivery` ONLY. Each value is the
 * item's NEW ABSOLUTE delivered total (Feature 009's `RecordDeliveryInput` contract); the database's
 * `validate_shipment_item` decides monotonicity (`delivered_quantity_cannot_decrease`), the plan
 * ceiling (`delivered_quantity_exceeds_plan`), the role (`only_warehouse_can_record_delivery`) and the
 * settlement gate, and performs every position/allocation effect itself. After success the persisted
 * items and status are RE-READ (never echoed from the input) so the UI reflects exactly what was stored.
 */
export async function recordWarehouseDelivery(input: { shipmentId?: string; items?: readonly { shipmentItemId?: string; deliveredQuantityKg?: string | number }[] }): Promise<ActionFeedbackResult<WarehouseDeliveryOutcome>> {
  const access = await requireWarehouseConsoleAccess();
  if (!access.ok) return { ok: false, code: access.code };

  const parsed = RecordDeliveryInput.safeParse({ shipmentId: input.shipmentId, items: input.items ?? [] });
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const result = await warehouseOperations.recordDelivery(parsed.data);
  if (!result.ok) return result;

  const [items, shipment] = await Promise.all([getShipmentItems({ shipmentId: parsed.data.shipmentId }), getShipmentById({ shipmentId: parsed.data.shipmentId })]);
  return { ok: true, data: { shipmentId: parsed.data.shipmentId, items, status: shipment?.status ?? null } };
}

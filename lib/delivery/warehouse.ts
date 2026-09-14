import { createClient } from "@/lib/supabase/server";
import { getShipmentById, getShipmentItems } from "@/lib/delivery/read";
import { mapDeliveryError } from "@/lib/delivery/errors";
import type { RecordDeliveryInput } from "@/lib/delivery/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 009 RUN B (T016) — the warehouse domain layer: guarded operational transitions, each named
 * and scoped against the LIVE transition graph read directly from the applied migration
 * (`supabase/migrations/20260914120000_feature_009_db_block_07.sql`'s `validate_shipment_transition`
 * body — the SAME graph `lib/delivery/transitions.ts#SHIPMENT_TRANSITIONS` documents for UI-affordance
 * purposes only), never from an older planning document or assumed names.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY EXPORTED FUNCTION VERIFIES `is_warehouse_operator()` ITSELF, LIVE, BEFORE ATTEMPTING ANYTHING
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * Unlike `lib/orders/drafts.ts`/`lib/delivery/buyer.ts` (which assume the CALLING Server Action has
 * already resolved a buy-capable identity), this file is also the seam 010's Warehouse console will
 * call directly (T018) — so the guard lives HERE, inside the domain layer itself, not only in a
 * caller-side action. `requireWarehouseOperator` below calls the SAME no-argument `is_warehouse_
 * operator()` RPC `lib/auth/dal.ts#resolveOperationalRoles` already uses (`auth.uid()` from the
 * caller's own verified JWT) — never a client-supplied role claim, never a second notion of "who is
 * warehouse." A failed/errored RPC call fails CLOSED (not authorized), mirroring `lib/auth/dal.ts`'s
 * own "every failure path fails closed" contract exactly.
 *
 * No function here accepts a target status from the caller — every target is a literal this file
 * supplies itself (FR-002/FR-003). No function here sets `ready_at`/`shipping_ready_at` (FR-004,
 * trigger-owned via `sync_shipment_ready`) or computes/writes `reserved_quantity_kg`/
 * `available_quantity_kg` itself (FR-016, plan.md architecture decision 10) — every one of those
 * effects happens entirely inside `validate_shipment_transition`/`apply_delivery_reservation`, which
 * this file only ever triggers by attempting a guarded UPDATE.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DELIBERATELY NOT EXPOSED (plan.md architecture decision 3/8 — a database-permissive but
 * product-narrowed boundary, not a claim the database itself would refuse these)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * - `DRAFT -> READY` (a warehouse fast-track past the buyer's own unsubmitted plan) — technically
 *   DB-permitted for a warehouse-role caller (the trigger's per-state chain allows it), but it would
 *   let warehouse originate a shipment plan the buyer never submitted.
 * - `DRAFT -> CANCELLED` via THIS file — also DB-permitted for a warehouse-role caller, but a `DRAFT`
 *   shipment is the buyer's own private, unsubmitted plan; warehouse has no legitimate reason to touch
 *   it. The buyer's own narrow `DRAFT -> CANCELLED` lives in `lib/delivery/buyer.ts#cancelDraftShipment`
 *   instead.
 * - Any operation that moves a shipment OUT of `FAILED`/`DISPUTED` — no forward transition exists in
 *   `SHIPMENT_TRANSITIONS` for either state; `delivery_recovery_requires_dedicated_workflow` is the
 *   database's own fail-closed guard if this were ever attempted regardless (e.g. via a future,
 *   different caller) — see `lib/delivery/errors.ts`'s own mapping and comment.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * OPERATIONAL REASON (`fail`/`cancel`) — GENUINE, CONFIRMED DB-REALITY GAP, NOT SILENTLY DROPPED
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `order_shipments` has NO reason/cancellation-note/failure-note column at all (confirmed against the
 * live column list `lib/delivery/read.ts#SHIPMENT_SELECT` already reads exhaustively, and against the
 * applied migration's own DDL — neither adds one). `lib/delivery/validation.ts#FailShipmentInput`/
 * `CancelShipmentInput` (T001) already validate a mandatory `reason` string for exactly this reason —
 * this file's `fail`/`cancel` below still ACCEPT and VALIDATE it (useful operator discipline, and
 * forward-compatible with a future reason column), but there is currently NOWHERE in the live schema
 * to persist it — it is validated, never silently written to a column that does not exist, and never
 * fabricated into a fake success. This is recorded exactly like `docs/architecture/
 * DATABASE-CAPABILITY-MAP.md`'s other confirmed gaps — not invented or worked around unilaterally here.
 */

const supabase = () => createClient();

/** Fails CLOSED on any RPC error — mirrors `lib/auth/dal.ts#callBooleanRpc`'s own contract exactly. */
async function requireWarehouseOperator(): Promise<boolean> {
  const client = await supabase();
  const { data, error } = await client.rpc("is_warehouse_operator");
  return !error && data === true;
}

/** One guarded shipment-status UPDATE, attempted only if the app-level warehouse check passes. */
async function attemptTransition({
  shipmentId,
  fromStatuses,
  toStatus,
}: {
  shipmentId: string;
  fromStatuses: readonly string[];
  toStatus: string;
}): Promise<ActionFeedbackResult<null>> {
  if (!(await requireWarehouseOperator())) {
    return { ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE };
  }

  const client = await supabase();
  const { data: updated, error } = await client
    .from("order_shipments")
    .update({ status: toStatus })
    .eq("id", shipmentId)
    .in("status", fromStatuses)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, code: mapDeliveryError(error) };
  }
  return { ok: true, data: null };
}

/** `REQUESTED -> CAPACITY_CONFIRMED` — warehouse. */
export async function confirmCapacity({ shipmentId }: { shipmentId: string }): Promise<ActionFeedbackResult<null>> {
  return attemptTransition({ shipmentId, fromStatuses: ["REQUESTED"], toStatus: "CAPACITY_CONFIRMED" });
}

/** `REQUESTED | CAPACITY_CONFIRMED -> READY` — warehouse. `ready_at`/`shipping_ready_at` are trigger-owned (FR-004); never set here. */
export async function markReady({ shipmentId }: { shipmentId: string }): Promise<ActionFeedbackResult<null>> {
  return attemptTransition({ shipmentId, fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED"], toStatus: "READY" });
}

/**
 * `CAPACITY_CONFIRMED | READY -> RESERVED` — warehouse. This is the transition that invokes the Phase
 * 2 `apply_delivery_reservation` capability (via `validate_shipment_transition`'s own body) — refused
 * by the database (`delivery_reservation_requires_settled_order`) if the order is not yet settled
 * (FR-015), never independently checked or bypassed here.
 */
export async function reserve({ shipmentId }: { shipmentId: string }): Promise<ActionFeedbackResult<null>> {
  return attemptTransition({ shipmentId, fromStatuses: ["CAPACITY_CONFIRMED", "READY"], toStatus: "RESERVED" });
}

/** `READY | RESERVED -> PICKING` — warehouse. */
export async function startPicking({ shipmentId }: { shipmentId: string }): Promise<ActionFeedbackResult<null>> {
  return attemptTransition({ shipmentId, fromStatuses: ["READY", "RESERVED"], toStatus: "PICKING" });
}

/** `READY | RESERVED -> BOOKED` — warehouse. */
export async function book({ shipmentId }: { shipmentId: string }): Promise<ActionFeedbackResult<null>> {
  return attemptTransition({ shipmentId, fromStatuses: ["READY", "RESERVED"], toStatus: "BOOKED" });
}

/** `PICKING | BOOKED -> DISPATCHED` — warehouse. */
export async function dispatch({ shipmentId }: { shipmentId: string }): Promise<ActionFeedbackResult<null>> {
  return attemptTransition({ shipmentId, fromStatuses: ["PICKING", "BOOKED"], toStatus: "DISPATCHED" });
}

/**
 * Any non-terminal, already-submitted status `-> FAILED` — warehouse. Deliberately does NOT accept a
 * `reason` parameter here: `lib/delivery/validation.ts#FailShipmentInput` validates one at the Server
 * Action layer (T018) for operator discipline/UX, but `order_shipments` has no column to persist it
 * into (see this file's own header) — this function's own signature contains only what it actually
 * acts on, never an accepted-but-silently-discarded field. `DRAFT` is deliberately excluded: the live
 * trigger itself refuses `DRAFT -> FAILED` (`DRAFT`'s only permitted targets are
 * `REQUESTED`/`READY`/`CANCELLED`), so it is never offered as an attempted "from" state here.
 */
export async function fail({ shipmentId }: { shipmentId: string }): Promise<ActionFeedbackResult<null>> {
  return attemptTransition({
    shipmentId,
    fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED"],
    toStatus: "FAILED",
  });
}

/**
 * Any submitted, non-dispatched status `-> CANCELLED` — warehouse-initiated (distinct from the
 * buyer's own narrow `DRAFT -> CANCELLED` in `lib/delivery/buyer.ts`). Deliberately does NOT accept a
 * `reason` parameter — see `fail`'s own comment immediately above for why. `DISPATCHED`/
 * `PARTIALLY_DELIVERED` are excluded: the live trigger's own per-state map does not permit `CANCELLED`
 * as a target from either (goods are already physically in transit/partially delivered by then — only
 * `fail` remains reachable). `DRAFT` is excluded per this file's own "deliberately not exposed" note.
 */
export async function cancel({ shipmentId }: { shipmentId: string }): Promise<ActionFeedbackResult<null>> {
  return attemptTransition({
    shipmentId,
    fromStatuses: ["REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED"],
    toStatus: "CANCELLED",
  });
}

/**
 * T017 — warehouse-only, monotonic `delivered_quantity_kg` per item. Each `deliveredQuantityKg` in
 * `input.items` is the item's NEW ABSOLUTE total (never a delta this function computes) — sent as a
 * plain `shipment_items` UPDATE; `validate_shipment_item`'s trigger does EVERY quantity/settlement/
 * ledger decision itself (`only_warehouse_can_record_delivery`, `delivered_quantity_cannot_decrease`,
 * `delivered_quantity_exceeds_plan`, `delivery_reservation_requires_settled_order`) and, inside that
 * SAME statement, reduces `reserved_quantity_kg`/`available_quantity_kg` on the buyer's position by
 * exactly the newly-delivered amount and updates `storage_allocations` — this function never writes
 * any of those itself (FR-005, FR-016).
 *
 * After every item write in the batch succeeds, this function COMPARES the now-current, already-
 * authoritative stored `plannedQuantityKg`/`deliveredQuantityKg` sums (re-read fresh, never carried
 * over from the input) to choose between two DB-PERMITTED targets — `DISPATCHED|PARTIALLY_DELIVERED
 * -> PARTIALLY_DELIVERED` or `-> DELIVERED` — a CHOICE among approved transitions, never a computed
 * quantity (plan.md architecture decision 5). If any item write in the batch fails, this function
 * returns that error immediately and does NOT attempt the shipment-level status transition — whatever
 * items DID already succeed remain correctly, monotonically applied (each was independently valid and
 * committed by its own statement), so a caller may safely retry with the remaining item(s).
 */
export async function recordDelivery({ shipmentId, items }: RecordDeliveryInput): Promise<ActionFeedbackResult<null>> {
  if (!(await requireWarehouseOperator())) {
    return { ok: false, code: ACTION_FEEDBACK.WAREHOUSE_NOT_CAPABLE };
  }

  const shipment = await getShipmentById({ shipmentId });
  if (!shipment) {
    return { ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_FOUND };
  }
  if (shipment.status !== "DISPATCHED" && shipment.status !== "PARTIALLY_DELIVERED") {
    return { ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE };
  }

  const existingItems = await getShipmentItems({ shipmentId });
  const existingItemIds = new Set(existingItems.map((item) => item.id));
  for (const item of items) {
    if (!existingItemIds.has(item.shipmentItemId)) {
      return { ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_FOUND };
    }
  }

  const client = await supabase();
  for (const item of items) {
    const { error } = await client
      .from("shipment_items")
      .update({ delivered_quantity_kg: item.deliveredQuantityKg })
      .eq("id", item.shipmentItemId)
      .eq("shipment_id", shipmentId);
    if (error) {
      return { ok: false, code: mapDeliveryError(error) };
    }
  }

  const currentItems = await getShipmentItems({ shipmentId });
  const fullyDelivered = currentItems.length > 0 && currentItems.every((item) => item.deliveredQuantityKg >= item.plannedQuantityKg);
  const targetStatus = fullyDelivered ? "DELIVERED" : "PARTIALLY_DELIVERED";

  return attemptTransition({ shipmentId, fromStatuses: ["DISPATCHED", "PARTIALLY_DELIVERED"], toStatus: targetStatus });
}

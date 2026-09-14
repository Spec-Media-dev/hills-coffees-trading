import type { OrderShipmentStatus } from "@/lib/delivery/types";

/**
 * Feature 009 RUN A1 (T004) — a documented, READ-ONLY, UI-AFFORDANCE-ONLY copy of
 * `validate_shipment_transition`'s live permitted-transition graph (`order_shipments` status
 * `DRAFT/REQUESTED/CAPACITY_CONFIRMED/READY/RESERVED/PICKING/BOOKED/DISPATCHED/PARTIALLY_DELIVERED/
 * DELIVERED/CANCELLED/FAILED/DISPUTED`). Sourced directly from the LIVE trigger body
 * (`docs/database/database-schema-report.json`'s `functions[]` entry for
 * `validate_shipment_transition`, read 2026-09-14 for Feature 009 RUN 0 and re-confirmed for this
 * run) — never guessed, never copied from an older planning document.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE AUTHORIZES NOTHING. It exists ONLY so a UI can decide which buttons/affordances to show.
 * The database trigger is the sole authority on whether a transition actually succeeds — every write
 * attempt goes through it regardless of what this map says, and a refusal here is ALWAYS a
 * possibility this module cannot prevent or predict with certainty. No function in this file reads
 * or writes any row. No function in this file returns anything resembling "allowed: true" as an
 * authorization decision — only as a display hint.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * FAILED / DISPUTED — NO DB-ENFORCED FORWARD LIMIT (confirmed live, Feature 009 RUN 0, 2026-09-14)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * The live trigger's own if/elsif chain has NO `elsif old.status = 'FAILED'` and NO
 * `elsif old.status = 'DISPUTED'` branch. Every other non-terminal status has an explicit permitted-
 * target list; these two fall through the chain unrefused, so the database itself does not limit
 * what a warehouse-role/internal caller may set next from either state. `SHIPMENT_TRANSITIONS` below
 * deliberately lists NO forward transition for `FAILED`/`DISPUTED` anyway — this is Feature 009's
 * OWN application-level product decision (`plan.md` architecture decision 8), not a claim about what
 * the database would refuse. See `docs/architecture/DATABASE-CAPABILITY-MAP.md`'s `DB-OPEN-18` entry
 * and `spec.md`'s Edge Cases for the full reasoning — recovery/resolution semantics for these two
 * states belong to Feature 010 (warehouse operational recovery) / Feature 012 (dispute resolution),
 * not to this feature inventing one.
 */
export const SHIPMENT_TRANSITIONS: Readonly<Record<OrderShipmentStatus, readonly OrderShipmentStatus[]>> = {
  DRAFT: ["REQUESTED", "READY", "CANCELLED"],
  REQUESTED: ["CAPACITY_CONFIRMED", "READY", "CANCELLED", "FAILED", "DISPUTED"],
  CAPACITY_CONFIRMED: ["RESERVED", "READY", "CANCELLED", "FAILED", "DISPUTED"],
  READY: ["RESERVED", "BOOKED", "PICKING", "CANCELLED", "FAILED", "DISPUTED"],
  RESERVED: ["PICKING", "BOOKED", "CANCELLED", "FAILED", "DISPUTED"],
  PICKING: ["DISPATCHED", "CANCELLED", "FAILED", "DISPUTED"],
  BOOKED: ["DISPATCHED", "CANCELLED", "FAILED", "DISPUTED"],
  DISPATCHED: ["PARTIALLY_DELIVERED", "DELIVERED", "FAILED", "DISPUTED"],
  PARTIALLY_DELIVERED: ["DELIVERED", "FAILED", "DISPUTED"],
  DELIVERED: [],
  CANCELLED: [],
  // Application-level narrowing only — see this file's own header. The database does not itself
  // forbid a further transition from either state.
  FAILED: [],
  DISPUTED: [],
} as const;

/**
 * Buyer-permitted targets from `DRAFT` ONLY — the trigger's own top-level guard, not a subset of
 * `SHIPMENT_TRANSITIONS.DRAFT` above (`DRAFT → READY` IS in the database's own permitted map, but
 * ONLY for `is_warehouse_operator()`/internal callers — see `plan.md` architecture decision 3's own
 * "deliberately not exposed" note for why the application never offers it as a buyer affordance).
 * `CANCELLED` is listed here for UI-affordance completeness even though the LIVE `shipments_buyer_
 * draft_update` RLS policy does not yet permit it (`DB-OPEN-18`) — a UI consuming this map must not
 * assume the button it renders will succeed until Phase 2's RLS widening lands; `mapDeliveryError`
 * still exists precisely to surface that refusal safely if attempted early.
 */
export const BUYER_PERMITTED_FROM_DRAFT: readonly OrderShipmentStatus[] = ["REQUESTED", "CANCELLED"];

/** UI-affordance-only hint — never an authorization decision. See this file's own header. */
export function isTransitionDisplayable(from: OrderShipmentStatus, to: OrderShipmentStatus): boolean {
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

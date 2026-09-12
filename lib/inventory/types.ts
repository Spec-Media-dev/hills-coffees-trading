/**
 * Feature 005 T001 — the audited DTO boundary for the inventory/custody domain. Every consumer
 * (this feature's own future pages, and 006–010) imports these shapes rather than querying
 * `inventory_positions`/`storage_allocations`/`inventory_ownership_events` directly, so
 * cross-organization scoping and field discipline live in exactly one place (`lib/inventory/*`).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * NON-NEGOTIABLE: NO ARITHMETIC-DERIVED INVENTORY TRUTH (SRS LOT-02)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `availableQuantityKg` and `reservedQuantityKg` below are the ONLY two quantity columns that exist
 * on `inventory_positions` (confirmed against the live `docs/database/database-schema-report.json`
 * — there is no `owned_quantity_kg` column anywhere in the approved schema). Every DTO in this file
 * passes these through EXACTLY as the database stores them. Nothing here computes a third quantity
 * from the other two (no `available - reserved`, no `available + reserved`, no reconstruction of any
 * kind) — that is the database's own job (the LOT-02 invariant is enforced there), never this
 * application's.
 *
 * RECONCILIATION (2026-09-12) — SCHEMA-EVIDENCE FINDING, CORRECTED AGAINST THE LIVE FUNCTION BODIES:
 * an earlier pass of this file cited line numbers in the static `supabase/trading_schema.sql` file and
 * concluded `reserved_quantity_kg` "is written by no function." That was wrong, and is retracted here.
 * The LIVE function definitions — pulled directly from `docs/database/database-schema-report.json`
 * (`functions[].definition`, the canonical authority; the static SQL file is stale relative to it) —
 * prove the following, unambiguously, from the database's own logic rather than any inference:
 *
 *   - `checkout_order(p_order_id)`: validates
 *     `(v_position.available_quantity_kg - v_position.reserved_quantity_kg) < v_order_item.quantity_kg`
 *     before allowing a reservation, then `UPDATE inventory_positions SET reserved_quantity_kg =
 *     reserved_quantity_kg + v_order_item.quantity_kg` — i.e. it INCREMENTS `reserved_quantity_kg` at
 *     reservation time. It never touches `available_quantity_kg`.
 *   - `expire_order_hold(p_order_id)`: `UPDATE inventory_positions SET reserved_quantity_kg =
 *     greatest(reserved_quantity_kg - v_item.quantity_kg, 0)` — DECREMENTS `reserved_quantity_kg` when
 *     a hold lapses. It never touches `available_quantity_kg`.
 *   - `admin_review_payment(p_payment_id, ...)`: on settlement, validates
 *     `v_position.available_quantity_kg < v_item.reserved_quantity OR v_position.reserved_quantity_kg
 *     < v_item.reserved_quantity`, then `UPDATE inventory_positions SET available_quantity_kg =
 *     available_quantity_kg - v_item.reserved_quantity, reserved_quantity_kg = reserved_quantity_kg -
 *     v_item.reserved_quantity` on the SELLER's position (both columns debited together — title and
 *     the reservation hold leave at once), and `INSERT ... ON CONFLICT DO UPDATE SET
 *     available_quantity_kg = available_quantity_kg + excluded.available_quantity_kg` crediting the
 *     BUYER's position (a new position row if none exists yet, `reserved_quantity_kg` starting at 0).
 *
 * So: `available_quantity_kg` is the position's TOTAL/gross owned quantity (confirmed by the database
 * itself treating it as the thing settlement debits/credits on title transfer), and
 * `reserved_quantity_kg` is a real, actively-written subset of that total currently held against an
 * active reservation (confirmed by `checkout_order` incrementing it and `expire_order_hold`/
 * `admin_review_payment` decrementing it). `available_quantity_kg - reserved_quantity_kg` is exactly
 * what `checkout_order` computes internally as "truly free to reserve right now" — but the database
 * exposes no column, view, or function that stores or returns that difference as a distinct value.
 * There is no `owned_quantity_kg` column and no view (`database-schema-report.json`'s `views` array is
 * empty). This file does NOT synthesize that missing figure, and does NOT rename either column to
 * "owned"/"free" — it exposes exactly the two stored values, verbatim, under names that mirror the
 * database's own columns, leaving any presentation-layer subtraction (if ever wanted) to be reviewed
 * against LOT-02 explicitly rather than assumed here.
 *
 * The "every live position reads `reservedQuantityKg: 0` today" observation from the earlier pass
 * remains true only as a DATA fact (the table has zero rows right now, before Features 007/008 create
 * real orders) — it was wrongly attributed to "no function writes it." Corrected: the column IS
 * actively written by `checkout_order`/`expire_order_hold`/`admin_review_payment`; it merely has no
 * rows to be written to yet.
 */

/** `inventory_positions.lot_id` → `coffee_lots` context, when readable (see `InventoryLotContext`). */
export type InventoryLotContext = {
  lotId: string;
  lotCode: string;
  cropYear: string | null;
  qualityGrade: string | null;
  cupScore: number | null;
  coffeeId: string | null;
  /** From `coffees.name`, only ever populated when `coffees.status = 'PUBLISHED'` (its own RLS). */
  coffeeName: string | null;
};

/**
 * `null` means: DB-OPEN-05 — `coffee_lots`' member-read policy (`member_read_trade_lots`) has a
 * predicate that compares `coffee_offers.lot_id` to `coffee_offers.id` (a self-referential
 * comparison on the WRONG table, never the lot being looked up), which is never satisfiable for an
 * ordinary member session. The position itself is still real and still returned — only its lot
 * detail is unavailable. This is an honest absence, never a fabricated placeholder.
 */
export type InventoryLotDetail = InventoryLotContext | null;

/** Approved-for-member-display warehouse context — deliberately narrower than the full `warehouses`
 * row (no `address`; not required by spec.md and kept conservative even though the underlying table's
 * own `public_read_warehouses` RLS already permits public read of the exact address). */
export type InventoryWarehouseContext = {
  warehouseId: string;
  code: string;
  name: string;
  city: string | null;
  countryCode: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
};

export type InventoryPosition = {
  id: string;
  lotId: string;
  ownerOrganizationId: string;
  warehouseId: string;
  warehouseLocationId: string | null;
  /** `inventory_positions.available_quantity_kg` — pass-through, see file header. */
  availableQuantityKg: number;
  /** `inventory_positions.reserved_quantity_kg` — pass-through, see file header. */
  reservedQuantityKg: number;
  createdAt: string;
  updatedAt: string;
  /** `null` under the DB-OPEN-05 condition — see `InventoryLotDetail`. */
  lot: InventoryLotDetail;
  warehouse: InventoryWarehouseContext | null;
};

export type PaginatedResult<T> = {
  rows: readonly T[];
  /** `true` when more rows exist beyond this page (bounded by `pageSize`, never an unbounded scan). */
  hasMore: boolean;
};

/** The approved, closed vocabulary — `storage_allocations.status`'s own CHECK constraint. Never
 * rename or invent a fourth value (no `AVAILABLE`/`IN_TRANSIT`/`ON_HOLD`/`QUARANTINED`) unless the
 * approved schema itself grows one. */
export type StorageAllocationStatus = "STORED" | "RELEASED" | "DELIVERED";

/**
 * RUN B reconciliation (2026-09-12) — `storage_allocations.order_item_id` → `order_items.id` →
 * `order_items.order_id` → `orders.id` is a GENUINE, member-readable chain: unlike
 * `inventory_reservation_items`' broken `reservation_items_view` policy (DB-OPEN-12, a plain subquery
 * into the admin-only `inventory_reservations`), both `order_items_view`
 * (`can_view_order(order_id)`) and `orders_view` (`can_view_order(id)`) are TOP-LEVEL policies calling
 * the same `SECURITY DEFINER` `can_view_order()` helper directly — no nesting into an unreadable
 * table. Empirically proven live (service-role setup/teardown only; real authenticated read as the
 * order's buyer and as an unrelated cross-org member, synthetic rows deleted immediately after): the
 * buyer read the full chain through to `orders.order_code`; the unrelated member got zero rows at
 * every step. `null` here means either `order_item_id` is null (no originating order — e.g. a
 * warehouse-operator-created position) or the order genuinely is not readable by the caller
 * (`can_view_order` returned false) — both degrade to the same honest `null`, never fabricated.
 */
export type StorageAllocationOrderContext = {
  orderId: string;
  orderCode: string | null;
};

export type StorageAllocation = {
  id: string;
  orderItemId: string | null;
  ownerOrganizationId: string;
  lotId: string;
  warehouseId: string;
  warehouseLocationId: string | null;
  /** `storage_allocations.quantity_kg` — the allocated total, pass-through. */
  quantityKg: number;
  /** `storage_allocations.released_quantity_kg` — a SEPARATE stored fact, never derived from
   * `quantityKg` (the DB's own CHECK constraint already ensures `0 <= released <= quantity_kg`). */
  releasedQuantityKg: number;
  status: StorageAllocationStatus;
  startedAt: string | null;
  releasedAt: string | null;
  /** `null` when there is no originating order, or the caller cannot read it — see the type's own doc comment. */
  order: StorageAllocationOrderContext | null;
};

/** The approved, closed vocabulary — `inventory_ownership_events.event_type`'s own CHECK constraint. */
export type OwnershipEventType = "INITIAL_ALLOCATION" | "SALE" | "RESALE" | "ADJUSTMENT" | "VOID";

/**
 * The acting organization's role in this event. `"source"` when the acting org is
 * `from_organization_id`, `"destination"` when it is `to_organization_id` — an event can even list
 * the SAME org as both (e.g. an internal adjustment), in which case both are simply reported true
 * from the two independent boolean checks, never collapsed into one assumed direction.
 */
export type OwnershipEventRole = {
  isSource: boolean;
  isDestination: boolean;
};

/**
 * The counterparty organization's raw id is ALWAYS passed through when the column itself has a
 * value — `organizations.id` on that side of the event is not itself secret, and the member is
 * already entitled to read it directly off the `inventory_ownership_events` row (its own RLS already
 * permits that). What is NOT always resolvable is the counterparty's DISPLAY NAME: `organizations`'
 * own RLS (`organizations_member_select`: `is_org_member(id) OR is_platform_admin()`) only ever lets
 * a member read THEIR OWN organization's row — a genuine other organization's `display_name` is
 * unreadable by direct query, full stop. `redacted: true` marks exactly that case (a real
 * counterparty exists but its name could not be resolved) — never used to drop the event itself.
 */
export type OwnershipCounterparty = {
  organizationId: string | null;
  displayName: string | null;
  redacted: boolean;
};

export type OwnershipEvent = {
  id: string;
  lotId: string;
  quantityKg: number;
  eventType: OwnershipEventType;
  role: OwnershipEventRole;
  from: OwnershipCounterparty;
  to: OwnershipCounterparty;
  orderItemId: string | null;
  correlationId: string | null;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
};

/**
 * Where a reservation's cause CAN be resolved through member-readable sources
 * (`inventory_reservation_items` via `can_view_order`, `orders.hold_expires_at`) — never through
 * `inventory_reservations` itself, which is admin-only (see `lib/inventory/availability.ts`'s header
 * comment). `"unknown"` is the honest fallback when the reserved quantity is real (the database says
 * so) but its cause is not resolvable under current RLS — the quantity is still shown; only the
 * cause is withheld, never fabricated.
 */
export type ReservationCause =
  | { kind: "order"; orderId: string; orderCode: string | null; holdExpiresAt: string | null }
  | { kind: "unknown" };

export type AvailabilityBreakdown = {
  positionId: string;
  lotId: string;
  /** Pass-through of `inventory_positions.available_quantity_kg` — see file header. */
  availableQuantityKg: number;
  /** Pass-through of `inventory_positions.reserved_quantity_kg` — see file header. */
  reservedQuantityKg: number;
  /** Zero or more resolvable causes for the reserved quantity above (never an arithmetic split). */
  reservationCauses: readonly ReservationCause[];
};

/**
 * Feature 006 T006 — the narrow FACTUAL shape 006's listing-eligibility RULE will read. This is
 * deliberately not a decision: no `isEligibleToList`/`canList`/`listingAllowed`/`canResell` field
 * exists here or anywhere in `lib/inventory/*`. Feature 005 exposes facts; Feature 006 owns rules.
 *
 * `hillsApprovedCustody` fact is deliberately NOT included: the approved schema has no direct
 * "Hills-approved" boolean on `warehouses` or `inventory_positions` (only `warehouses.is_active`,
 * which means something narrower — "is this warehouse currently operational," not "is this specific
 * custody arrangement Hills-approved"). Inventing a join to approximate it (e.g. via
 * `organizations.is_hills_internal`) would be exactly the kind of assumption-based reconstruction
 * this feature avoids elsewhere — omitted here for the same reason, and left for 006 to resolve
 * explicitly if and when it needs that fact.
 */
export type InventoryEligibilityFacts = {
  positionId: string;
  lotId: string;
  ownerOrganizationId: string;
  warehouseId: string;
  /** Pass-through of `inventory_positions.available_quantity_kg` — see file header. */
  availableQuantityKg: number;
  /** Pass-through of `inventory_positions.reserved_quantity_kg` — see file header. */
  reservedQuantityKg: number;
};

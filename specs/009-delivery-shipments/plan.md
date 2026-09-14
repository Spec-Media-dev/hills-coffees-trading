# Implementation Plan: Delivery & Shipments

**Feature**: `009-delivery-shipments` | **Created**: 2026-09-08 | **Reconciled**: 2026-09-14 (RUN 0 / Phase 0)
**Spec**: [spec.md](./spec.md) | **Status**: Planning reconciled — implementation NOT started

## Summary

Implement the buyer's delivery-request slice, the warehouse domain layer for operational
progression, and honest tracking for both sides — strictly within the state machine and
authorization split the approved database enforces via `validate_shipment_transition` /
`validate_shipment_item` / `sync_shipment_ready`. Before any buyer/warehouse domain code is built,
Phase 2 resolves **DB-BLOCK-07** — confirmed (2026-09-14) to be two related gaps, not one: (1)
delivery reservation does not reduce tradable quantity (SRS DEL-01/AC-04), and (2) physical-
fulfillment progression is not gated on the order's settlement status at all (SRS MKT-04 applied to
release). Both are closed by one authoritative database capability, never an application workaround.

Feature 008 is **not** complete, but this does not block 009: Feature 009 reads only `orders.status`,
which the CURRENT, already-functional `admin_review_payment()` manual-approval path already produces
today. See spec.md's "Feature 008 dependency" section for the full reasoning — repeated here only as
the plan's own Constitution-check line.

## Technical Context

**Data (buyer writes)**: `order_shipments` INSERT `DRAFT`, UPDATE `DRAFT → REQUESTED` (and, once
Phase 2's small RLS widening lands, `DRAFT → CANCELLED`); `shipment_items` INSERT/UPDATE while
shipment is `DRAFT`.
**Data (warehouse writes)**: `order_shipments` ALL, `shipment_items` ALL — via the domain layer, and
(from Phase 2 onward) the new authoritative reserve/release/settlement-gate capability, never a raw
`inventory_positions` write.
**Reads**: shipments/items via `can_view_order` or `is_warehouse_operator()`, plus orders, order
items, `inventory_positions` (for the requesting organization's own tradable-quantity context), 005's
custody data.
**Caching**: none (Constitution XI).
**Testing**: full transition-matrix coverage, role negatives, delivered-quantity monotonicity,
isolation, plus the new DB-BLOCK-07 reservation/concurrency/settlement-gate suite (Phase 5).

## Database capabilities consumed (current, live-verified 2026-09-14)

| Need | Approved mechanism | Live evidence |
|---|---|---|
| Buyer plan/submit | `shipments_buyer_insert` / `shipments_buyer_draft_update` policies + `validate_shipment_transition` (`DRAFT → REQUESTED/CANCELLED` only for non-warehouse) | RLS `WITH CHECK` currently permits only `DRAFT`/`REQUESTED` as target — `CANCELLED` is NOT currently reachable by a buyer; see DB-BLOCK-07 design item 0 below |
| Item planning | `shipment_items_buyer_insert/update` policies + `validate_shipment_item` (order match, DRAFT-only edits, warehouse-only delivered quantity, no decrease) | Confirmed; its only quantity bound is `order_items.quantity_kg`, never `inventory_positions` |
| Warehouse progression | `shipments_warehouse_manage` / `shipment_items_warehouse_manage` (`ALL`, `is_warehouse_operator()`) + the trigger's transition map | Confirmed 13-state graph (`order_shipments_status_allowed`); **`FAILED`/`DISPUTED` have no forward-transition rule in the trigger at all** — the app must narrow this itself (see plan decision 8) |
| Ready timestamps | `sync_shipment_ready` trigger (sets `ready_at` on `CAPACITY_CONFIRMED`/`READY`/`RESERVED`, and `orders.shipping_ready_at`) — application must not set them | Confirmed; fires BEFORE UPDATE |
| Visibility | `shipments_view` (`can_view_order` OR warehouse), `shipment_items_view` | Confirmed |
| Checkout gate | `assert_order_checkout_ready()` requires a shipment in `READY`/`RESERVED` with `ready_at` set, and requires `sum(shipment_items.planned_quantity_kg) = order_items.quantity_kg` per item, **before** `checkout_order()` will run | Confirmed — this is why shipment PLANNING (Phases 1–4's buyer-facing half) is a pre-payment step in the current design, while PICKING/BOOKED/DISPATCHED/DELIVERED are physical execution that should occur only after `orders.status = PAID` |

**Not available today** (both closed by Phase 2, never worked around):

1. Any mechanism that reserves inventory when a delivery is requested (DB-BLOCK-07 original framing).
2. Any mechanism that refuses physical-fulfillment progression or delivered-quantity recording on an
   unsettled order (DB-BLOCK-07's newly confirmed second half — neither `validate_shipment_transition`
   nor `validate_shipment_item` reads `orders.status`).
3. A buyer-authorized path to cancel a `DRAFT` shipment (RLS gap, small and independent of 1–2).
4. Any trigger that auto-derives `order_shipments.status` (`PARTIALLY_DELIVERED`/`DELIVERED`) from the
   sum of `shipment_items.delivered_quantity_kg` versus planned — unlike `sync_shipment_ready` for the
   `ready_at` side, there is no analogous "sync on delivery" trigger. The warehouse domain layer must
   explicitly request the correct status transition after a delivery write, based on comparing
   already-authoritative stored quantities (a comparison, not a computed money/quantity value) — or
   Phase 2 may add such a trigger; see design item 6 below. **Not decided here** — recorded so the
   Phase 2 approver has the full option set.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III Database authority | PASS | Zero schema change in Run 0; DB-BLOCK-07 (both halves) recorded for the approved change process in Phase 2 |
| VIII Server/DB authorization | PASS | FR-002, FR-015, SEC-001 — role split AND settlement gate both enforced by the database, never the application |
| IX/X Transactional & inventory integrity | PASS *pending Phase 2* | FR-016; DB-BLOCK-07 (both halves) means AC-04 and the settlement-before-release invariant cannot pass until Phase 2 lands — stated openly, not simulated |
| XI Caching | PASS | FR-008 |
| XII Server Action discipline | PASS | FR-010 safe error mapping |
| XIV Security | PASS | SEC-001..005; addresses treated as private data |
| XV Ambiguity rule | PASS | DB-BLOCK-07 (both halves), DB-BLOCK-01, the suspension question, and the DB-OPEN-09 shipment extension are all surfaced, not assumed |

## DB-BLOCK-07 — authoritative delivery-reservation design draft (Phase 2; no SQL written here)

> **SUPERSEDED (2026-09-14, RUN A2-PRE)**: `specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md` is
> now the single authoritative design document — read it, not this section, for the current design.
> A human adversarial database/security review found this section's own §4 (Cancellation/release)
> and §5 (Partial delivery) described INCORRECT inventory arithmetic (this section, as originally
> drafted, said cancellation adds back to `available_quantity_kg` — CRITICAL bug, would have
> manufactured inventory from nothing; confirmed wrong and corrected below and in the design doc).
> The rest of this section (options comparison, reserve point, eligibility) remains directionally
> accurate but the design doc's own numbered sections are the current source of truth, including
> corrections to the reserve point's `READY` handling, column-tamper protection, exact-once
> mechanism, and the `FAILED`/`DISPUTED` bypass analysis this section does not cover.

### Design choice: extend the `inventory_positions` available/reserved ledger — not `inventory_reservations`

Considered against the run's own criteria (one inventory truth, transactional safety, auditability,
idempotency, concurrency correctness, minimal schema duplication, existing project convention):

| Option | Verdict | Why |
|---|---|---|
| A. Reuse `inventory_reservations`/`inventory_reservation_items` as-is | **Rejected** | That table is checkout-specific: `expire_order_hold()` blindly expires any `ACTIVE` row for an order past `expires_at` with no purpose discriminator — reusing it for a shipment-lifetime hold risks a checkout-hold-expiry job silently releasing a legitimate in-progress delivery reservation. Its own member-read policy is also unsatisfiable for non-admins (DB-OPEN-12, confirmed live) — reusing it would inherit a visibility bug the buyer-facing delivery UI cannot tolerate. |
| B. Extend `inventory_reservations` with a purpose/type column | **Rejected** | Couples two genuinely different lifecycles (a 20-minute checkout hold vs. a shipment-duration hold that can last days) into one table/enum, forcing every existing checkout reader to filter by purpose. Still inherits DB-OPEN-12's read-policy gap. |
| C. A new shipment-specific reservation table (e.g. `shipment_inventory_reservations`) | **Considered, not preferred** | Would duplicate a quantity ledger `shipment_items.planned_quantity_kg` (already exists, already audited) and `inventory_positions.reserved_quantity_kg` (already the one inventory truth) jointly already express — the constitution's own "minimal schema duplication" guidance argues against a third ledger for the same fact. |
| **D/E/F. An authoritative reserve/release function, invoked by `order_shipments`/`shipment_items` transition triggers, operating directly on the EXISTING `inventory_positions.available_quantity_kg`/`reserved_quantity_kg` columns** | **Recommended** | This is the SAME primitive `checkout_order()`/`admin_review_payment()`/`expire_order_hold()` already use for exactly this kind of available↔reserved movement — no new ledger, no new lifecycle-collision risk, and `inventory_positions`' own RLS (`inventory_owner_read`: `is_org_member(owner_organization_id) OR is_warehouse_operator() OR is_auditor()`) already lets the requesting buyer read the effect, unlike Option A/B's inherited gap. |

**Recommended shape**: one new `SECURITY DEFINER` function pair (draft names —
`reserve_delivery_quantity`/`release_delivery_quantity`, or equivalently folded into
`validate_shipment_transition`'s own body as an `AFTER`-style effect; the real migration author
decides the exact mechanism) that, under `FOR UPDATE` row locks in the SAME lock order the existing
functions already establish (offer/position before quantity mutation), moves quantity between
`available_quantity_kg`/`reserved_quantity_kg` on the **requesting organization's own**
`inventory_positions` row (identified by `lot_id` + `owner_organization_id` = the order's
`buyer_organization_id` + the position's current warehouse/location from `storage_allocations`) —
never the seller's position, which checkout already reserved and settlement already transferred.

### 1. Reserve point — recommendation, not certainty

**Recommended**: the first transition that moves a shipment PAST `READY`/`CAPACITY_CONFIRMED` into
physical-fulfillment territory — concretely, the transition INTO `RESERVED` (or, where a plan skips
`RESERVED` entirely, the transition into `PICKING`/`BOOKED` directly from `READY`/`CAPACITY_CONFIRMED`,
since the live transition graph permits both paths). Reasoning: `RESERVED` is already a named status
in the live CHECK constraint sitting exactly at this hinge, `assert_order_checkout_ready` already
requires only `READY` (not `RESERVED`) before payment — meaning `READY` is reachable and sufficient
pre-payment, and everything past it is naturally post-payment physical work. This same transition is
also where the settlement-eligibility gate (design item 2) naturally belongs, since both invariants
protect the same moment: "physical release/commitment is about to begin."
**This is a recommendation requiring approval, not a certainty** — the SRS does not specify the exact
hinge state, and the current database does not enforce this ordering (a warehouse operator can today
reach `RESERVED`/`PICKING`/etc. before payment, per design item 2's own finding). The Phase 2 approver
may choose an earlier point (e.g., `CAPACITY_CONFIRMED`) if business reasoning favors reserving
capacity sooner; this document does not treat its own recommendation as final.

### 2. Eligibility (verified at DB authority, inside the same function/trigger)

- Requesting organization = `orders.buyer_organization_id` (the position being reserved is the
  buyer's own, post-settlement position — never the original seller's, which is a separate,
  already-settled row).
- Order/item relationship: `shipment_items.order_item_id` → `order_items.order_id` = the shipment's
  own `order_id` (already enforced by `validate_shipment_item`'s `shipment_order_item_mismatch`
  check — reused, not reimplemented).
- **Settlement/release eligibility (new)**: `orders.status` is in the settled family (`PAID` or
  later) — FR-015. Refusing this is a new, distinct exception, never an overload of an existing one.
- Custody/ownership eligibility: an `inventory_positions` row exists for
  `(lot_id, buyer_organization_id, warehouse, location)` with `available_quantity_kg -
  reserved_quantity_kg >= planned_quantity_kg` for every item being reserved.
- Requested quantity: `shipment_items.planned_quantity_kg` per item — already stored, never
  recomputed.
- Existing delivery reservations: covered by the same `reserved_quantity_kg` column other delivery
  reservations already moved into — no separate accounting needed.
- Existing sale/listing reservations: also covered by the SAME column, since a resale listing
  (Feature 006) draws from the identical `available_quantity_kg`/`reserved_quantity_kg` pair — this
  is precisely how "a listing cannot consume delivery-reserved quantity" becomes true by construction
  rather than by a second cross-check.

### 3. Atomicity

`FOR UPDATE` locks the `inventory_positions` row(s) before comparing/mutating available vs. reserved,
in the same lock order convention `checkout_order`/`admin_review_payment` already establish
(offer/shipment row first, then inventory position) — no new locking primitive is introduced.

### 4. Cancellation/release — exactly once — **CORRECTED 2026-09-14 (RUN A2-PRE)**

`available_quantity_kg` is the GROSS on-hand figure, proven by the live `inventory_reserved_within_
available_check` CHECK constraint (`reserved_quantity_kg <= available_quantity_kg`) and by
`checkout_order()`'s own reservation step, which only ever touches `reserved_quantity_kg`. Releasing
a cancelled/failed reservation therefore **only decrements `reserved_quantity_kg`** — it must
**never** increment `available_quantity_kg` (the goods never left custody; only the earmark is
removed). The exact-once guard is a stateful column check under row lock
(`shipment_items.reserved_quantity_kg`, read and compared before every release), not a bare
`greatest()` clamp — see `DB-BLOCK-07-DESIGN.md` §7 for the full mechanism and its coverage of
duplicate-cancel/duplicate-fail/retry scenarios.

### 5. Partial delivery — **CORRECTED 2026-09-14 (RUN A2-PRE)**

`shipment_items.delivered_quantity_kg` increases monotonically (already enforced) up to
`planned_quantity_kg` (already enforced). Each delivery write reduces **BOTH**
`reserved_quantity_kg` AND `available_quantity_kg` on the buyer's position by the newly delivered
amount — the goods leave custody (and the gross on-hand figure) entirely, the same arithmetic
`admin_review_payment()` already uses for a full title transfer. The delivery write also updates
`storage_allocations.released_quantity_kg`/`status` in the same statement (Feature 005's own
existing custody ledger — not a second model). See `DB-BLOCK-07-DESIGN.md` §2/§11 for the full proof
and mechanism.

### 6. Completion

A fully delivered shipment item (`delivered_quantity_kg = planned_quantity_kg` for every item) must
leave zero residual `reserved_quantity_kg` attributable to it — the item-level delivery-write
decrement (design item 5) already achieves this if applied consistently; the migration's own tests
(Phase 2, Phase 5) must prove no stranded reservation remains after full delivery, exactly as the run
directive requires.

### 7. Replay/idempotency

Every reserve/release call is guarded by reading current state before acting (never blindly
adding/subtracting based on a client-supplied delta) — the same discipline `admin_review_payment`'s
own idempotent-no-op branch already demonstrates. A repeated "submit" on an already-`REQUESTED`
shipment, or a repeated "cancel" on an already-`CANCELLED` one, is refused by
`validate_shipment_transition`'s own terminal/invalid-transition checks before the reserve/release
function would even run — reused, not reimplemented.

### 8. Dispute

**Not decided here.** MKT-07 says a dispute can freeze quantity/settlement/trading, but (per
DB-OPEN-09, extended to shipments in spec.md's Open items) no current mechanism lets COMPLIANCE act on
`order_shipments` at all, and the trigger itself has no forward-transition rule from `DISPUTED`. The
warehouse domain layer (Phase 3) narrows this at the application layer only (no operation exposed to
move out of `DISPUTED`) — it does not invent a database-level freeze/release policy. Whether
`DISPUTED` releases or holds the reservation is recorded as an open decision for Phase 2's approver,
informed by whichever business rule 012/010 eventually adopts.

### 9. History

No destructive rewrite of `inventory_ownership_events` (append-only, already trigger-enforced by
`prevent_ownership_event_mutation`) or `storage_allocations` history. The new reserve/release effect
touches only `inventory_positions.available_quantity_kg`/`reserved_quantity_kg`, which are already
mutable working-state columns (not an append-only ledger) — consistent with how checkout/settlement/
expiry already treat them.

### 10. Application boundary

The application (Phase 3's `lib/delivery/warehouse.ts`) invokes the approved capability by attempting
the guarded status transition; it never computes, writes, or infers
`reserved_quantity_kg`/`available_quantity_kg` itself. This is verified mechanically in Phase 7 (grep
for any `inventory_positions` write outside the approved DB function/RLS boundary).

## Required future DB work (Phase 2 — not performed in this planning run)

1. Design document (this section, formalized and approved) — resolves the reserve point (item 1
   above, currently a recommendation) and the `DISPUTED` policy (item 8, currently undecided).
2. Read-only preflight SQL — inspects current data for anything the migration would need to account
   for (e.g., any existing `RESERVED`/`PICKING`/etc. shipment on an unpaid order, given design item 2
   confirms this is currently possible; any existing negative `available_quantity_kg`).
3. Migration SQL — additive: the new reserve/release function(s), their trigger integration, the
   settlement-eligibility check, and (if the small RLS widening from spec.md's Open items is bundled
   in) the `shipments_buyer_draft_update` `WITH CHECK` change permitting `CANCELLED`.
4. Rollback SQL.
5. Static migration tests (schema/RLS-shape assertions against the migration file, no live apply
   required — same convention `tests/finance/rls-policy.test.ts` already established).
6. Manual review of preflight results by a human reviewer.
7. **Explicit user approval before live apply** — this project has one Supabase instance; the run
   directive's own migration-safety section requires this gate, and Phase 2 is flagged below as
   needing its own approval checkpoint distinct from Phase 1/3+'s ordinary implementation flow.
8. Live postflight verification.
9. Concurrency / exact-once reserve-release tests (Phase 5's DB-BLOCK-07 suite, items in spec.md
   SC-008).

## Architecture decisions

1. **Two guarded surfaces, one state machine.** `lib/delivery/buyer.ts` (DRAFT planning + submit, and
   cancel once Phase 2's RLS widening lands) and `lib/delivery/warehouse.ts` (operational transitions
   + delivered quantity + the new reserve/release invocation). Neither contains a state machine —
   both attempt a transition and map the trigger's refusal.
2. **The transition map lives in one documented constant.** A read-only copy of the database's
   permitted-transition map is kept for *UI affordance* purposes (which buttons to show), with an
   explicit comment that the database is authoritative, AND an explicit comment documenting that
   `FAILED`/`DISPUTED` have no DB-enforced forward limit — the map's OWN narrower allowlist for those
   two states is an application-level product decision, not a database mirror.
3. **Warehouse layer is the seam for 010.** `warehouse.ts` exports guarded operations, named and
   verified against the LIVE transition graph rather than the old task list (see plan's own table
   below) — there is no exported raw-update path and no generic `updateShipmentStatus(status)`.

   | Operation | Transition(s) it attempts | Actor |
   |---|---|---|
   | `confirmCapacity` | `REQUESTED → CAPACITY_CONFIRMED` | warehouse |
   | `markReady` | `REQUESTED\|CAPACITY_CONFIRMED → READY` | warehouse |
   | `reserve` | `CAPACITY_CONFIRMED\|READY → RESERVED` (invokes the new Phase 2 reserve capability) | warehouse |
   | `startPicking` | `READY\|RESERVED → PICKING` | warehouse |
   | `book` | `READY\|RESERVED → BOOKED` | warehouse |
   | `dispatch` | `PICKING\|BOOKED → DISPATCHED` | warehouse |
   | `recordDelivery` | writes `shipment_items.delivered_quantity_kg`, then requests `DISPATCHED → PARTIALLY_DELIVERED` or `→ DELIVERED` based on a stored-quantity comparison (never a computed money/quantity value) | warehouse |
   | `fail` | any non-terminal status `→ FAILED` | warehouse |
   | `cancel` | any non-terminal status `→ CANCELLED` (warehouse-initiated; distinct from the buyer's own narrow `DRAFT → CANCELLED`) | warehouse |

   Deliberately **not** exposed: a `DRAFT → READY` warehouse fast-track (technically DB-permitted,
   but it would let warehouse originate a shipment plan the buyer never submitted — a product
   restriction the application applies on top of a permissive database, not a violation of database
   authority), and no operation moves a shipment OUT of `FAILED`/`DISPUTED` (see decision 8/spec.md
   Edge Cases).
4. **Timestamps belong to the trigger.** The application never writes `ready_at` or
   `shipping_ready_at` — verified by grep in the closure phase.
5. **Delivered quantity is warehouse-only and monotonic.** The layer never computes the quantity
   itself, never allows a decrease, and surfaces the database's refusal directly; it MAY compare
   already-stored planned vs. delivered sums to choose which DB-permitted status transition to
   request next (decision 3's `recordDelivery` row) — this is a choice among approved transitions,
   not a computed quantity.
6. **DB-BLOCK-07 is surfaced honestly until Phase 2 lands, never simulated.** Phase 3's buyer/
   warehouse code is built AGAINST the Phase 2 capability (Phase 3 depends on Phase 2, not the
   reverse) so the product never ships a delivery-request flow that silently fails to reserve
   anything.
7. **Custody consequences are read from 005**, not recomputed here.
8. **`FAILED`/`DISPUTED` are application-narrowed dead ends** until 010/012 define real resolution
   semantics — the warehouse layer exposes no operation that moves a shipment out of either state,
   even though the current trigger does not itself forbid it (decision 2's own finding).
9. **The settlement-eligibility gate belongs to the database, not a page-level check.** Any Server
   Action/page MAY also perform a client-friendly early refusal (better UX, earlier error) by reading
   `orders.status` before attempting a transition, but the actual authorization boundary is the Phase
   2 database gate (FR-015) — a page-level check alone would not satisfy SEC-001/SC-009.

## Project structure (files this feature adds)

```text
src/app/dashboard/
├── deliveries/page.tsx + [shipmentId]/page.tsx     # NEW — buyer tracking
├── deliveries/new/page.tsx + actions.ts             # NEW — plan + submit request
└── deliveries/[shipmentId]/actions.ts               # NEW — buyer cancel while DRAFT (Phase 2-gated)

lib/delivery/
├── buyer.ts        # NEW — DRAFT planning, submit, cancel (buyer-permitted only)
├── warehouse.ts    # NEW — guarded operational transitions + delivered quantity (consumed by 010)
├── read.ts         # NEW — shipment/item DTOs, scoped
├── transitions.ts  # NEW — documented UI-affordance copy of the permitted map (never authoritative;
│                   #       documents the FAILED/DISPUTED gap explicitly)
├── errors.ts       # NEW — trigger exception → safe application error mapping
└── validation.ts   # NEW — Zod schemas (address, contact, method, quantities); 13-status enum
                     #       mirrored verbatim from the live order_shipments_status_allowed constraint

components/delivery/  # NEW — plan editor, status timeline, per-item delivered/planned table,
                      #       address panel, failure/cancellation reason display

tests/delivery/       # NEW — transition matrix, role negatives, monotonicity, isolation,
                      #       DB-BLOCK-07 reservation/concurrency/settlement-gate suite

supabase/migrations/  # Phase 2 only — the DB-BLOCK-07 migration + rollback, after explicit approval
```

## Feature boundaries

| Feature | Boundary |
|---|---|
| 005 | Owns custody/storage presentation. 009 reads its outcomes (e.g., `storage_allocations` status changes as delivery progresses) and never recomputes custody. No HOLD/VARIANCE/QUARANTINE state exists anywhere in the current schema (`storage_allocations.status` CHECK is exactly `STORED`/`RELEASED`/`DELIVERED`) — this is NOT a Feature 010-owned blocker already recorded; it is an unresolved SRS LOT-04 concept with no DB mechanism and no assigned owner today. 009 does not invent one. |
| 006 | Owns marketplace/resale presentation. Its T022 (eligibility test for delivery-reserved quantity refusal) is explicitly blocked on DB-BLOCK-07 and can be revisited once Phase 2 lands — this run does not modify 006's tasks. |
| 007 | Closed. Owns checkout/reservation/HOLD/proforma/payment creation and the shipment PLANNING precondition for checkout (`assert_order_checkout_ready` requiring `READY`/`RESERVED`). 009 consumes this, never recreates it. |
| 008 | Not complete, but not a structural dependency — see spec.md's "Feature 008 dependency" section. 009 reads `orders.status` only. |
| 010 | Owns the Warehouse console screens (queues, capacity boards, pick lists), `shipping_rules` configuration, and the compliance-console resolution of the DB-OPEN-09 shipment extension. 009 exposes only the guarded typed warehouse domain interface — never a raw RPC/table bypass, never a generic status setter. |
| 012 | Owns dispute case workflow, adjudication, and notification/audit delivery. 009 may display/link toward `DISPUTED` but implements no dispute mechanics itself. |

## Testing strategy

| Test family | Proves |
|---|---|
| Transition matrix — every permitted and forbidden transition, per role, including the `FAILED`/`DISPUTED` app-level narrowing | SC-002, FR-002/FR-003 |
| Buyer role negatives — buyer attempts each operational status directly | SC-001, SEC-001 |
| Delivered-quantity rules — non-warehouse write, decrease attempt, over-plan attempt, partial→complete | SC-003, FR-005 |
| Plan closure — item edit after `REQUESTED` | FR-001 (`shipment_plan_is_closed`) |
| Cross-order item — item from another order | `shipment_order_item_mismatch` |
| Isolation — another organization's shipment | SC-005, SEC-003 |
| Timestamp ownership — application never sets `ready_at`/`shipping_ready_at` | FR-004 |
| Error mapping — each trigger exception | SC-007 |
| **DB-BLOCK-07 reservation/concurrency (NEW, Phase 5)** — the 14-point suite spec.md SC-008/SC-009 requires: reservation reduces availability atomically; listing/resale cannot consume reserved quantity; a second shipment cannot double-reserve; two competing requests cannot both win beyond available quantity; cancellation restores exactly once; repeated cancel does not restore twice; partial delivery updates reservation correctly; completed delivery leaves no stranded reservation; failure/dispute behavior follows the approved (or explicitly still-open) policy; the application contains no direct `inventory_positions` write; an unsettled order cannot be physically released; a cross-org request cannot reserve another organization's inventory; reservation history remains audit-correlated | SC-008, SC-009, FR-015, FR-016 |

## Live database / test fixture strategy

Reuses `tests/auth/fixture-session.ts` conventions exclusively — no permanent production users, no
new hand-maintained credential outside that shared, already-established mechanism. Where a genuinely
`PAID` order is needed for a Phase 3+/5 test fixture, it is produced through the SAME real production
path Feature 007/008's own tests already use: `createDraftOrder` → `addOrderItem` → shipment plan →
`executeCheckout` → `admin_review_payment(..., true)` via a FINANCE fixture session — never a raw
insert, never a fabricated `orders.status`. If Phase 5 needs a FINANCE or WAREHOUSE fixture beyond
what `tests/auth/fixture-session.ts` already provides (`FOUNDATION_FIXTURES.warehouseAdmin` exists
today; a FINANCE fixture does not — Feature 008's own `IMPLEMENTATION-HANDOFF.md` already recorded
this gap), extending the shared seed script is Phase 5's own explicit task, following the exact
`warehouseAdmin` pattern, not invented ad hoc.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **DB-BLOCK-07 (both halves)** — delivery requests do not reserve inventory, and physical-fulfillment progression is not gated on settlement | **AC-04 cannot pass; a shipment could physically progress before payment** | Phase 2 resolves both through one authoritative database capability; Run 0 records the design draft above but performs no migration; explicit user approval required before live apply |
| Buyer-cancel-from-`DRAFT` RLS gap | FR-001's cancel half is currently unimplementable via RLS | Small, low-risk, recommended bundled into Phase 2's migration; not required for the harder reservation work |
| **DB-BLOCK-01** | Delivery proof documents cannot be stored | Same inert-seam approach as 003/008 — status/reason/metadata may exist without bytes; no bucket reuse |
| Duplicating the state machine in app code | Divergence from the trigger | `transitions.ts` is explicitly UI-affordance-only, verified in review |
| Warehouse layer exposing a raw update path | Role-split bypass | No raw export; verified by grep + review |
| `FAILED`/`DISPUTED` having no DB-enforced forward limit | A warehouse operator could otherwise move a disputed/failed shipment anywhere | Application-level narrowing (decision 8); recorded as a DB-OPEN-09 extension for 010/012's eventual resolution |
| Address/contact data leakage | Privacy | SEC-005: never cached, never logged, scoped reads only |
| Phase 2 migration risk | Single Supabase instance; financially-adjacent (though not financial itself) invariant | Preflight → migration → rollback → static tests → manual review → **explicit user approval** → live apply → postflight → concurrency tests, per the run's own migration-safety sequence |

## RUN A2-PRE2 final pre-apply correction

The current DRAFT package, not any earlier prose, is authoritative for the following final facts:

- The baseline transition trigger is actually enabled `BEFORE UPDATE` only; because buyer DRAFT INSERT
  is currently authorized, the draft recreates this one binding as `BEFORE INSERT OR UPDATE`, resets
  `settlement_verified_at` to NULL on INSERT, and rejects non-DRAFT insertion.
- A parent-trigger child update needs a narrow transaction-local trusted marker. Without it,
  `validate_shipment_item()` can rewrite the value while the parent still observes `ROW_COUNT = 1`.
  The revised reserve/release protocol proves the child guard transition first, then changes the
  position by exactly that amount in the same statement transaction.
- Effective locking is shipment (implicit) → item (ascending) → order → position. Direct delivery's
  implicit item lock shares the item → order → position suffix. The Phase 2 live concurrency suite must prove
  the five actual collision classes documented in `DB-BLOCK-07-DESIGN.md` §19.
- There is no silent no-backfill path. Existing READY/gated rows and their remaining item quantities
  are mandatory zero-row preflight/guard conditions; otherwise a separate reviewed reconciliation is
  required.
- `FAILED`/`DISPUTED` recovery is fail-closed in this DRAFT. It is no longer merely an
  application-level caveat: future operational re-entry needs a dedicated approved workflow that
  proves exact remaining quantity/custody.

The two business decisions remain proposed, not self-approved: **DISPUTED = FREEZE** (recommended)
and bundling buyer `DRAFT → CANCELLED` RLS. T010 remains unchecked, the DRAFT is not a migration, and
no SQL has been applied.

# Feature Specification: Delivery & Shipments

**Feature Directory**: `specs/009-delivery-shipments`
**Created**: 2026-09-08
**Status**: **IMPLEMENTED / VERIFIED / CLOSED — 39/39 tasks (T001–T039), 2026-09-15.** DB-BLOCK-07 (both
halves) RESOLVED by the human-approved, manually-applied, live-proven migration
`supabase/migrations/20260914120000_feature_009_db_block_07.sql` (2026-09-14). Final closure evidence is
recorded in [tasks.md](./tasks.md)'s status block and Phase 7. **This verdict covers Feature 009 only**
— it does not authorize production trading for the platform (Feature 008's own real-payment readiness,
Features 010/012's deferred scope, and the product-wide legal/finance/security/UAT/release gates remain
open — see "Open items / blockers" for the per-item owner).
**Primary surfaces**: Member Portal (`/dashboard/deliveries`) + the delivery domain layer consumed by
010's Warehouse console
**Depends on**: 001, 003, 004, 005, 007 (shipment plan initiation). Reads `orders.status` for the
settlement gate — see "Feature 008 dependency" below; Feature 009 does **not** depend on Feature
008 reaching its own production-ready (Stripe/trusted-funding) state.

## Purpose

Move coffee out of custody and into the buyer's hands: the buyer requests delivery of quantity they
own, warehouse operations confirm capacity, reserve, pick, dispatch and record delivery, and the
custody position is reduced accordingly.

The approved database owns the delivery state machine and its authorization split: **buyers may only
move a shipment `DRAFT → REQUESTED` or `DRAFT → CANCELLED`; every operational state requires
`is_warehouse_operator()`**, and only warehouse may record delivered quantity (which can never
decrease).

## Scope

### In scope

- Buyer delivery request: `order_shipments` DRAFT, `shipment_items` planning, submit to `REQUESTED`,
  cancel while `DRAFT`.
- Delivery address/contact/method capture on the shipment record.
- Buyer-facing delivery status tracking across the approved 13-state vocabulary.
- Warehouse **domain layer** (guarded transitions, delivered-quantity recording, error mapping) that
  010's Warehouse console consumes.
- Partial delivery presentation (`PARTIALLY_DELIVERED`, per-item delivered quantities).
- Failure/cancellation/dispute states with reason and evidence linkage (dispute detail is 012).
- Storage-allocation consequences of delivery (`STORED` → `RELEASED`/`DELIVERED`) as the approved
  model represents them.

### Out of scope

- The Warehouse console **screens** (queues, capacity boards, pick lists) — 010, built on this layer.
- Carrier/logistics provider integrations — not in the approved baseline.
- Capacity/cut-off rule configuration — `shipping_rules` is super-admin configuration (010).
- Order, payment and settlement mechanics — 007/008.
- Dispute workflow itself — 012.

## Feature 008 dependency (reconciled 2026-09-14 — RUN 0 / Phase 0)

**Feature 008 is NOT complete.** As of this reconciliation: Phase 1 (finance foundation, private
reads, controlled errors) is done; Stripe architecture preparation is done at the provisional/
documentation level; real Stripe account verification, credentials, the trusted-funding database
gate, and provider-backed settlement are **not** implemented. `admin_review_payment()` remains
classified **B — reusable only with a formally required database change** (Feature 008's own
`STRIPE-PREPARATION.md` §6): today it settles an order purely on a FINANCE operator's own
`p_approved` input, with **no reference to Stripe or any provider evidence at all**.

This matters for 009 because **Feature 009 reads only `orders.status`, never a provider fact.**
`assert_order_checkout_ready`/`checkout_order`/`admin_review_payment` already move an order through
`HOLD → PAID → FULFILLMENT_IN_PROGRESS/PARTIALLY_DELIVERED → COMPLETED` today, using the CURRENT,
already-functional manual FINANCE-approval path — the same path Feature 007/008's own tests already
use to reach a genuine `PAID` order. Feature 008's remaining Stripe work changes **how** an order
reaches `PAID` (adding a trusted-funding precondition on top of the existing manual approval); it
does not change **that** `orders.status = 'PAID'` is the fact Feature 009 must gate on, and that fact
is fully producible today.

**Conclusion**: no part of Feature 009 is blocked on Feature 008's remaining Stripe/trusted-funding
work. Every phase of 009 can be implemented and release-blocking-tested now, using the existing
`admin_review_payment()` manual-approval path to produce genuinely `PAID` orders for both
implementation and test fixtures — this is not a workaround; it is the actual current production
settlement mechanism. The only thing that remains gated on Feature 008's own completion is
**production trading readiness for the platform as a whole** (whether a `PAID` order can be trusted
to mean real money moved, not whether Feature 009's delivery mechanics are correct) — a
platform-level production gate, not a Feature-009 implementation blocker.

## Actors

| Actor | Interest |
|---|---|
| **Buyer member** | Request delivery of owned quantity, track its progress, receive proof. |
| **Warehouse operator** | Confirm capacity, reserve, pick, dispatch, record delivery, handle failures. |
| **Seller member** (adjacent) | Delivery reservations reduce what can be listed for resale. |
| **Auditor** | Read shipment history as evidence. |

## Business journeys owned

Buyer flow: **Custody/storage → Delivery if requested** (final stage before dispute handling).
Interacts with the Seller flow by removing delivered/reserved quantity from tradable stock.

## Prioritized stories

### PS1 — Buyer requests delivery of owned quantity (P1)

A buyer plans a shipment against order items they own and submits the request.

**Why P1**: without a request there is no delivery.
**Independent test**: as the buying organization, create a shipment plan and submit it to
`REQUESTED`; confirm the trigger accepts it and that a non-owning organization is refused.

**Acceptance scenarios**

1. Given a buyer of the order, when they create a `DRAFT` shipment and add items, then the records
   are created with `planned_quantity_kg` and zero delivered quantity.
2. Given a shipment item referencing an order item from a different order, when added, then the
   database refuses (`shipment_order_item_mismatch`) and a safe error is surfaced.
3. Given a `DRAFT` shipment, when the buyer submits it, then status becomes `REQUESTED` and the
   plan is closed to further item edits.
4. Given a non-`DRAFT` shipment, when the buyer attempts to edit planned quantities, then the
   database refuses (`shipment_plan_is_closed`).
5. Given a buyer attempting any operational status (`CAPACITY_CONFIRMED`, `RESERVED`, `PICKING`,
   `DISPATCHED`, `DELIVERED`), when attempted, then the database refuses
   (`warehouse_required_for_operational_shipment_status`).

### PS2 — Warehouse progresses the shipment (P1)

A warehouse operator moves the shipment through the approved operational states.

**Why P1**: it is the fulfilment path itself.
**Independent test**: as a warehouse fixture, walk a shipment through every permitted transition and
confirm each forbidden transition is refused by the database.

**Acceptance scenarios**

1. Given each approved transition (`REQUESTED → CAPACITY_CONFIRMED/READY/CANCELLED/FAILED/DISPUTED`,
   `CAPACITY_CONFIRMED → RESERVED/READY/…`, `READY → RESERVED/BOOKED/PICKING/…`,
   `RESERVED → PICKING/BOOKED/…`, `PICKING|BOOKED → DISPATCHED/…`), when performed by warehouse, then
   it succeeds.
2. Given any transition not in the approved map, when attempted, then the database refuses
   (`invalid_shipment_transition`) and a safe error is surfaced.
3. Given a shipment reaching `CAPACITY_CONFIRMED`/`READY`/`RESERVED`, when saved, then `ready_at` and
   the order's `shipping_ready_at` are set by the database trigger — not by the application.

### PS3 — Delivered quantity is recorded correctly (P1)

Warehouse records how much was actually delivered per item, supporting partial delivery.

**Why P1**: it is the point where custody actually reduces.
**Independent test**: record a partial delivery and confirm quantities, state and custody
consequences; attempt a decrease and confirm refusal.

**Acceptance scenarios**

1. Given a warehouse operator, when they record `delivered_quantity_kg`, then it is accepted and
   cannot exceed the planned/ordered quantity per the database's validation.
2. Given a non-warehouse actor, when they attempt to set delivered quantity, then it is refused
   (`only_warehouse_can_record_delivery`).
3. Given an attempt to decrease delivered quantity, when made, then the database refuses.
4. Given partial delivery, when displayed, then `PARTIALLY_DELIVERED` renders with per-item delivered
   versus planned quantities.

### PS4 — Buyer tracks delivery honestly (P2)

The buyer sees the shipment's true state, planned and delivered quantities, and delivery details.

**Why P2**: important experience, downstream of the mechanics.
**Independent test**: render a shipment in each of the 13 approved states and confirm labels and
figures.

**Acceptance scenarios**

1. Given each approved shipment status, when displayed, then its exact approved label renders.
2. Given `FAILED`, `CANCELLED` or `DISPUTED`, when displayed, then the recorded reason/evidence route
   is shown.
3. Given a shipment for another organization's order, when requested, then nothing is returned.

### PS5 — Custody reflects delivery (P2)

Delivered quantity reduces the buyer's custody position/storage allocation as the approved model
represents it.

**Why P2**: closes the loop with 005, but depends on how the schema represents the reduction.
**Independent test**: after recording delivery, confirm the storage allocation and custody figures in
005 change consistently with the approved model.

**Acceptance scenarios**

1. Given recorded delivery, when custody is inspected in 005, then allocation status/quantities
   reflect it consistently with the approved model.
2. Given the reduction, when it occurs, then it is represented through approved state transitions —
   never a destructive edit of history.

## Functional Requirements

- **FR-001**: Buyer shipment actions MUST be limited to creating `DRAFT` shipments/items, editing
  them while `DRAFT`, and transitioning `DRAFT → REQUESTED` or `DRAFT → CANCELLED`. The
  `DRAFT → CANCELLED` half currently has no RLS-authorized path (see Open items) — Phase 3 MUST NOT
  expose a buyer cancel action until Phase 2's migration closes that gap, and MUST NOT work around it
  with a service-role or elevated-privilege call.
- **FR-002**: All operational transitions MUST be performed only by `is_warehouse_operator()` actors
  through the warehouse domain layer; the application MUST NOT attempt to bypass
  `validate_shipment_transition`.
- **FR-003**: The application MUST NOT implement its own shipment state machine; it MUST attempt only
  transitions the database permits and surface refusals as safe errors.
- **FR-004**: `ready_at` and `orders.shipping_ready_at` MUST be left to the database trigger; the
  application MUST NOT set them.
- **FR-005**: Delivered quantity MUST be recorded only by warehouse actors, MUST never decrease, and
  MUST NOT be computed or adjusted by application code.
- **FR-006**: Shipment reads MUST be scoped by `can_view_order` (buyers) or `is_warehouse_operator()`
  (operations); no cross-organization visibility.
- **FR-007**: Every shipment status MUST render its exact approved vocabulary label (13 values).
- **FR-008**: Delivery data MUST NOT be placed in any shared cache.
- **FR-009**: The warehouse domain layer MUST be reusable by 010's console without duplicating guards
  or error mapping, and MUST NOT expose a path that bypasses them.
- **FR-010**: Database exceptions (`shipment_plan_is_closed`, `invalid_shipment_transition`,
  `warehouse_required_for_operational_shipment_status`, `only_warehouse_can_record_delivery`,
  `shipment_order_item_mismatch`) MUST be mapped to safe, specific application errors.
- **FR-011**: All buyer delivery routes MUST live under `/dashboard`, register with 004's contract,
  and be non-indexable.
- **FR-012**: Screens MUST provide loading, empty, error, unauthorized, suspended, requested,
  reserved, dispatched, partially-delivered, delivered, failed and cancelled states.
- **FR-013**: Copy externalised; layouts RTL-safe; quantities always with unit; codes monospaced;
  tables collapse to cards at mobile.
- **FR-014**: Delivery/warehouse data MUST never appear on any public surface, including exact
  warehouse locations (SRS SEO-APP-02).
- **FR-015**: Physical-fulfillment progression (any transition past `READY` into an operational
  state that begins picking/dispatch, and any `delivered_quantity_kg` write) MUST be refused by the
  database unless the order's `orders.status` is in the settled family (`PAID` or later). This gate
  is part of the DB-BLOCK-07 database design (Phase 2) — the application MUST NOT implement it as an
  apply-side check in place of a database-enforced one, and MUST NOT compute or infer settlement from
  any signal other than `orders.status`.
- **FR-016**: The delivery-reservation quantity effect (available → reserved on the requesting
  organization's own `inventory_positions` row) MUST be applied, restored on cancellation, and never
  duplicated, entirely inside the approved database capability from Phase 2 — the application only
  invokes it and reads its result; it never computes or writes `reserved_quantity_kg`/
  `available_quantity_kg` itself.

## Security Requirements

- **SEC-001**: A buyer MUST NOT be able to reach any operational shipment status, even by direct
  action invocation — verified by negative tests against the database's own refusal.
- **SEC-002**: A warehouse operator MUST NOT be able to change commercial settlement state (that is
  finance's domain) — verified by ensuring this feature exposes no such path.
- **SEC-003**: A buyer MUST NOT be able to plan a shipment against another organization's order.
- **SEC-004**: No service-role usage anywhere in this feature.
- **SEC-005**: Delivery addresses and contact details MUST be treated as private personal data:
  visible only to the owning organization and operations, never cached publicly, never logged.

## Edge Cases

- Buyer submits a request and then tries to add items → refused (`shipment_plan_is_closed`).
- Warehouse cancels a `REQUESTED` shipment → permitted; the buyer sees the reason.
- Partial delivery followed by a second delivery → delivered quantity increases monotonically; state
  moves `PARTIALLY_DELIVERED` → `DELIVERED` when complete.
- A shipment is `DISPUTED` → progression pauses; 012 owns the dispute record and any freeze. **DB
  reality (found 2026-09-14)**: `validate_shipment_transition`'s live body has no `elsif old.status =
  'DISPUTED'` branch at all, so once a shipment reaches `DISPUTED` the trigger does not itself
  constrain what it can move to next (any target a warehouse-role/internal caller requests falls
  through unrefused). This feature MUST NOT rely on the database to already enforce the pause — the
  warehouse domain layer (Phase 3) treats `DISPUTED` as an application-narrowed dead end (no
  operation exposed to move out of it) until 012/010 defines real resolution semantics, exactly as
  DB-OPEN-09 already records for `orders` (a COMPLIANCE operator cannot even reach `order_shipments`
  today — its only RLS policies are the buyer-DRAFT ones and `shipments_warehouse_manage`, which is
  `is_warehouse_operator()` only). See Open items below.
- The same gap applies to `FAILED`: no `elsif old.status = 'FAILED'` branch exists either — the same
  application-level narrowing (no exposed forward operation from `FAILED`) applies.
- Delivery requested for quantity that has since been listed/sold → the request must not be
  satisfiable; see **DB-BLOCK-07** below, because the approved schema does not currently reserve
  inventory on delivery request, and does not currently gate physical-fulfillment progression on the
  order's settlement status either (a related, newly-confirmed finding — see Open items).
- Two shipments planned against the same order item → combined planned quantity must not exceed the
  ordered quantity (the database's item validation enforces the per-item rule against
  `order_items.quantity_kg` only — it does not check `inventory_positions`, which is exactly
  DB-BLOCK-07's root cause).
- Order not yet settled → delivery of unsettled goods must not be possible; the applicable guard is
  the order's own status (`orders.status`, reached via the CURRENT `admin_review_payment()` — see
  "Feature 008 dependency" above), and the feature must not invent an alternative rule. **DB reality
  (found 2026-09-14)**: no current trigger on `order_shipments`/`shipment_items` reads `orders.status`
  at all, so this guard does not yet exist at the database layer — it is part of the DB-BLOCK-07
  design (Open items below), not something 009 can assume is already enforced.
- Buyer organization suspended mid-delivery → new requests refused (via `organization_can_buy`, which
  `checkout_order`/`assert_order_checkout_ready` already re-check, and which any new delivery-request
  path must re-check identically); existing operational progression is a warehouse/compliance
  decision, not an application invention. Neither the SRS (only "a suspended organization cannot
  start new trading activity" — silent on in-flight progression) nor the current database answers the
  in-flight-progression half of this question. **Not decided here** — see Open items.
- Buyer-initiated cancellation of a `DRAFT` shipment → **DB reality (found 2026-09-14)**: the live
  RLS policy `shipments_buyer_draft_update`'s `WITH CHECK` permits only `status IN ('DRAFT',
  'REQUESTED')` as the target — it does **not** permit `CANCELLED`, even though
  `validate_shipment_transition`'s own top-level guard nominally allows a buyer to move
  `DRAFT → CANCELLED`. No buyer `DELETE` policy exists on `order_shipments` either. **A buyer
  therefore cannot cancel an unwanted `DRAFT` shipment today, through any RLS-authorized path.** This
  is a genuine, narrow, pre-existing RLS gap (trigger permission and RLS permission disagree) — see
  Open items; it does not affect the buyer's ability to create/edit/submit a shipment.

## Success Criteria

- **SC-001**: A buyer can never reach an operational shipment status, in 100% of attempts including
  direct invocation.
- **SC-002**: Every forbidden transition in the approved map is refused by the database and surfaced
  safely; every permitted transition succeeds for the right role.
- **SC-003**: Delivered quantity never decreases and is never written by a non-warehouse actor.
- **SC-004**: All 13 shipment statuses render their exact approved labels.
- **SC-005**: No shipment data is readable across organizations.
- **SC-006**: No delivery data appears in any shared cache or on any public route.
- **SC-007**: No raw database exception text reaches a client.
- **SC-008** *(AC-04, added 2026-09-14)*: A delivery reservation reduces tradable/resellable quantity
  atomically at the moment defined by Phase 2's approved design; a listing/resale/another delivery
  request cannot consume the same reserved quantity; concurrent competing requests never oversubscribe
  available quantity; cancellation restores exactly once, and a repeated/duplicate cancel never
  restores twice.
- **SC-009** *(MKT-04 applied to physical release, added 2026-09-14)*: No shipment can reach an
  operational-fulfillment state, and no `delivered_quantity_kg` can be recorded, while the order's
  `orders.status` is outside the settled family — proven by direct negative test, not merely absent
  from the UI.

## Assumptions

- Warehouse capacity/cut-off rules live in `shipping_rules` (super-admin configuration) and are
  applied operationally; this feature presents outcomes rather than enforcing capacity itself.
- Delivery proof storage depends on DB-BLOCK-01 — reassessed below; it does not block 009
  implementation, only document-byte attachment.
- The order's settlement status (`orders.status`) governs whether goods may be released; this feature
  reads it and does not create its own settlement truth — see "Feature 008 dependency" above.

## Open items / blockers

Each item below is classified using: **BLOCKS IMPLEMENTATION NOW** / **BLOCKS DATABASE PHASE** /
**BLOCKS FINAL FEATURE CLOSURE** / **BLOCKS PRODUCTION ONLY** / **DEFERRED TO 008/010/012** /
**INFORMATIONAL / CONTINUITY ONLY**.

- **DB-BLOCK-07 — delivery reservation does not reduce tradable quantity, AND physical-fulfillment
  progression is not gated on order settlement (release-critical; reconciled 2026-09-14).**
  Classification: **RESOLVED — CLOSED BY FEATURE 009 (2026-09-14, both halves)** — was **BLOCKS
  DATABASE PHASE** / **BLOCKS FINAL FEATURE CLOSURE**. Resolved by the human-approved (T010),
  manually-applied and postflight-verified (T011/T012, 22/22 `ok`) migration
  `supabase/migrations/20260914120000_feature_009_db_block_07.sql`, then live-proven under real
  authenticated sessions and real concurrency (T013, 18/18 scenarios; T017 and T024 live closeouts;
  `tests/delivery/*`). AC-04 now passes live: settlement-time reservation (`apply_delivery_reservation`
  + `reserve_ready_deliveries_for_settlement` from `admin_review_payment`), settlement-gated physical
  progression (`delivery_reservation_requires_settled_order`), exact-once reserve/release, delivery
  arithmetic on both `available_quantity_kg` and `reserved_quantity_kg`, DISPUTED = FREEZE. The
  authoritative record is `docs/architecture/DATABASE-CAPABILITY-MAP.md` (DB-BLOCK-07 row) and
  `DB-BLOCK-07-DESIGN.md` §20/§21. The historical finding is kept below verbatim for continuity. Two
  related, confirmed findings, both resolved by the same authoritative database capability:
  1. SRS DEL-01/AC-04: an approved delivery request must atomically reserve quantity (unavailable for
     new listing/sale/another delivery reservation), with exactly-once cancellation restoration. The
     only triggers on `order_shipments` are `sync_shipment_ready`, `validate_shipment_transition`,
     `set_updated_at` — none touches `inventory_positions.reserved_quantity_kg`, and
     `validate_shipment_item`'s only quantity check is against `order_items.quantity_kg` (the total
     ordered), never against tradable/available inventory. No delivery-reservation function exists.
  2. **Newly confirmed (2026-09-14, direct trigger inspection)**: neither `validate_shipment_transition`
     nor `validate_shipment_item` reads `orders.status` at all. Nothing in the database today prevents
     a warehouse-role caller from progressing a shipment through `RESERVED → PICKING → BOOKED →
     DISPATCHED → DELIVERED` (and recording `delivered_quantity_kg`) for an order that is **not yet
     `PAID`** — a direct gap against SRS MKT-04 ("settlement before title") as applied to physical
     release. This is not a duplicate of DB-BLOCK-07's original framing; it is a second, independent
     gate the same design must close.
  **No application-side workaround may be invented for either** — doing so would create a second,
  competing inventory truth (Constitution IX/X) or a fake settlement gate (Constitution VIII/IX).
- **DB-OPEN-09 extension to `order_shipments` (found 2026-09-14) — DEFERRED TO 010/012,
  INFORMATIONAL for 009's own scope.** The capability map's existing DB-OPEN-09 ("dispute freeze has
  no mechanism, and compliance cannot apply it") was recorded against `orders`; the same root cause
  applies identically to `order_shipments` — its only write policies are the buyer-DRAFT-scoped ones
  and `shipments_warehouse_manage` (`is_warehouse_operator()`, `ALL`). A COMPLIANCE-role account has
  **no RLS path to `order_shipments` at all**, so it cannot itself freeze/dispute a shipment even
  though MKT-07 implies compliance owns dispute resolution. 009 does not need to fix this — it treats
  `DISPUTED`/`FAILED` as application-narrowed dead ends (see Edge Cases) and links toward 012 — but
  the underlying RLS gap is recorded here for whichever feature (010's compliance console, or 012)
  formally resolves it.
- **Buyer-cancel-from-DRAFT RLS gap (found 2026-09-14) — RESOLVED, CLOSED BY FEATURE 009 (bundled
  into the Phase 2 DB-BLOCK-07 migration as recommended below; live-proven by `cancelDraftShipment` in
  `tests/delivery/buyer.test.ts`). Was: BLOCKS IMPLEMENTATION of that one narrow capability only.**
  Historical text kept for continuity: `shipments_buyer_draft_update`'s `WITH CHECK`
  permits only `DRAFT`/`REQUESTED` as a target status, never `CANCELLED`, and no buyer `DELETE`
  policy exists — see Edge Cases. FR-001's "cancel while `DRAFT`" cannot be implemented as an
  RLS-authorized buyer action until this is fixed. Because it is a small, additive, non-financial
  authorization widening (permit an already-trigger-intended value), it is recommended as part of
  Phase 2's migration scope (see plan.md) rather than its own separate migration cycle, but it is
  **not required** for Phase 2's harder reservation/settlement-gate work and could ship independently
  if the business wants incremental delivery.
- **DB-BLOCK-01 — delivery proof document bytes (reassessed 2026-09-14).** Classification:
  **BLOCKS PROOF ATTACHMENT ONLY** — no approved private Storage bucket/policy exists for delivery
  proof bytes (the KYB bucket from DB-BLOCK-01's Feature 003 resolution is explicitly scoped to KYB
  evidence only; reuse is prohibited). This does **not** block 009 implementation: status, reason,
  and metadata/evidence linkage (e.g., a `file_asset_id`-shaped reference column, once such a column
  is formally added) can exist and render honestly without storing bytes. No Storage bucket, fake URL,
  or reused bucket is created in Phase 0 or any phase until a dedicated approved bucket/policy design
  is separately authored and approved — the same discipline Feature 008 applied to its own
  `submit_payment_proof()`/DB-BLOCK-01 boundary.
- **Suspended buyer organization mid-shipment — DEFERRED TO 010/COMPLIANCE OPERATIONS (unresolved
  operational policy).** Neither the SRS nor the current database states whether existing operational
  progression continues, freezes, or requires compliance approval once a buyer organization is
  suspended mid-shipment. **Not decided here.** 009 implements only the answered half (new requests
  refused via the existing `organization_can_buy` check) and does not invent an answer for the
  unanswered half; a future decision may require its own small database change (analogous to
  DB-OPEN-09) if compliance needs to act on an in-flight shipment directly.

## Dependencies

| Depends on | Why |
|---|---|
| 007 | Initiates the shipment plan (DRAFT → REQUESTED); closed, consumed not re-verified |
| 008 | Reads `orders.status` only — NOT a dependency on Feature 008's remaining Stripe/trusted-funding work; see "Feature 008 dependency" above |
| 005 | Custody/storage figures affected by delivery; 009 reads, never recomputes |
| 010 | Builds the Warehouse console on this feature's domain layer; also owns the compliance-console resolution of the DB-OPEN-09 extension above |
| 012 | Dispute records linked from failed/disputed shipments; owns the DISPUTED resolution/recovery semantics 009 deliberately does not invent |

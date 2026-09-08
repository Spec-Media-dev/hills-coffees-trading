# Feature Specification: Delivery & Shipments

**Feature Directory**: `specs/009-delivery-shipments`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surfaces**: Member Portal (`/dashboard/deliveries`) + the delivery domain layer consumed by
010's Warehouse console
**Depends on**: 001, 003, 004, 005, 007 (shipment plan initiation), 008 (settled orders)

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
  them while `DRAFT`, and transitioning `DRAFT → REQUESTED` or `DRAFT → CANCELLED`.
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
- A shipment is `DISPUTED` → progression pauses; 012 owns the dispute record and any freeze.
- Delivery requested for quantity that has since been listed/sold → the request must not be
  satisfiable; see **DB-BLOCK-07** below, because the approved schema does not currently reserve
  inventory on delivery request.
- Two shipments planned against the same order item → combined planned quantity must not exceed the
  ordered quantity (the database's item validation enforces the per-item rule).
- Order not yet settled → delivery of unsettled goods must not be possible; the applicable guard is
  the order's own status, and the feature must not invent an alternative rule.
- Buyer organization suspended mid-delivery → new requests refused; existing operational progression
  is a warehouse/compliance decision, not an application invention.

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

## Assumptions

- Warehouse capacity/cut-off rules live in `shipping_rules` (super-admin configuration) and are
  applied operationally; this feature presents outcomes rather than enforcing capacity itself.
- Delivery proof storage depends on DB-BLOCK-01 (no Storage bucket) exactly as elsewhere.
- The order's settlement status governs whether goods may be released; this feature reads it.

## Open items / blockers

- **DB-BLOCK-07 — delivery reservation does not reduce tradable quantity (NEW, release-critical).**
  SRS DEL-01 and AC-04 require that an approved delivery request atomically reserves quantity, making
  it unavailable for listing, sale or another delivery reservation, and that cancellation restores it
  exactly once. In the approved baseline, the only triggers on `order_shipments` are
  `sync_shipment_ready` (sets `ready_at`/`shipping_ready_at`), `validate_shipment_transition` and
  `set_updated_at` — **none of which touches `inventory_positions.reserved_quantity_kg`** — and there
  is no delivery-reservation function. Consequently quantity reserved for delivery is **not**
  currently excluded from resale/sale availability. This must be resolved through the Constitution's
  database-change process (an approved reservation function/trigger) before AC-04 can pass. **No
  application-side reservation may be invented** — doing so would create a second, competing
  inventory truth (Constitution IX/X).
- **DB-BLOCK-01**: delivery proof documents cannot be stored (no Storage bucket).
- Whether a suspended buyer organization's in-flight shipments continue is an operations/compliance
  decision, not an application default.

## Dependencies

| Depends on | Why |
|---|---|
| 007 | Initiates the shipment plan (DRAFT → REQUESTED) |
| 008 | Settlement determines whether goods may be released |
| 005 | Custody/storage figures affected by delivery |
| 010 | Builds the Warehouse console on this feature's domain layer |
| 012 | Dispute records linked from failed/disputed shipments |

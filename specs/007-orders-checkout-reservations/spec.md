# Feature Specification: Orders, Checkout & Reservations

**Feature Directory**: `specs/007-orders-checkout-reservations`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surface**: Member Portal (`/dashboard/orders`, checkout flow)
**Depends on**: 001, 003 (eligibility), 004 (module contract), 005 (inventory facts),
006 (listings)

## Purpose

Turn a buyer's intent into a **draft order**, then execute the platform's single most
integrity-critical operation: **atomic checkout** — which reserves inventory, mirrors the reservation
onto the listing, computes financial snapshots, issues a proforma, and starts a **20-minute hold**.

That entire operation is already owned by the approved database function `checkout_order()`. This
feature's job is to **call it correctly, exactly once per intent, and present its outcome
truthfully** — never to reimplement any part of it (SRS TXN-01, MKT-03, BUY-02; Constitution IX/X).

Title does **not** move here. Settlement (008) moves title.

## Scope

### In scope

- Cart/draft order construction: `orders` (DRAFT) + `order_items` from eligible listings.
- Shipment-planning prerequisites the buyer owns: `order_shipments` DRAFT → REQUESTED and
  `shipment_items` while DRAFT (fulfilment itself is 009).
- Checkout execution via `checkout_order()`, including idempotent retry behaviour.
- The 20-minute hold: countdown presentation, expiry consequences, re-checkout after expiry.
- Reservation conflict and insufficient-availability handling.
- Partial-fill purchase behaviour (buying part of a listing).
- Order list/detail for buyers, with the approved status vocabulary and status history.
- Proforma presentation (issued at checkout).
- Order expiry/void presentation.

### Out of scope

- Payment proof, finance review, settlement, title transfer, payouts — 008.
- Warehouse/delivery fulfilment states beyond the buyer's request — 009.
- Listing creation and fill projection — 006.
- Any recomputation of pricing, commission or tax — `checkout_order()` computes and snapshots them.
- Automated payment providers (MVP is manual bank transfer — 008).

## Actors

| Actor | Interest |
|---|---|
| **Authorized buyer member** | Build an order, check out, understand the hold, pay within it. |
| **Seller-capable member** (adjacent) | Sees the effect on their listing (006). |
| **Finance operator** (adjacent) | Receives the resulting payment record (008). |
| **Warehouse operator** (adjacent) | Receives the resulting shipment plan (009). |

## Business journeys owned

Buyer flow: **Order → Checkout → Atomic reservation** (then hands to 008 for payment/settlement).
Seller flow: consumes the reservation that reduces the seller's listing availability.

## Prioritized stories

### PS1 — Build a draft order from eligible listings (P1)

An authorized buyer adds quantity from one or more published listings to a draft order.

**Why P1**: nothing can be checked out without it.
**Independent test**: as an approved buyer fixture, create a draft order with items and confirm the
records exist in `DRAFT` with correct snapshots; as a non-approved fixture, confirm refusal.

**Acceptance scenarios**

1. Given `organization_can_buy()` is false, when order creation is attempted, then it is refused
   server-side (the database policy also refuses).
2. Given a valid draft, when an item is added, then `order_items` records the listing reference and
   the price/product snapshots as they are at that moment.
3. Given a listing that is not published/visible, when it is added, then the database's
   `validate_order_item_offer` trigger refuses and the UI surfaces a safe error.
4. Given a draft order, when the buyer edits quantities, then changes are permitted only while the
   order remains `DRAFT`.

### PS2 — Check out atomically with a 20-minute hold (P1)

The buyer confirms the order; `checkout_order()` reserves inventory and the listing, snapshots
financials, issues a proforma, creates the pending payment and starts a 20-minute hold.

**Why P1**: this is the platform's core transactional guarantee (AC-02, MKT-03, TXN-01).
**Independent test**: check out a seeded order and confirm — in the database — a single active
reservation, mirrored listing reservation, order status `HOLD`, `hold_expires_at ≈ now + 20 min`, a
proforma, and a `PENDING` payment.

**Acceptance scenarios**

1. Given a ready draft order, when checkout runs, then `checkout_order()` is called exactly once and
   its returned `reservation_id`, `buyer_total`, `hold_expires_at` and `correlation_id` are used
   verbatim — the application computes none of them itself.
2. Given checkout succeeds, when the order is displayed, then status is `HOLD` and the countdown to
   `hold_expires_at` is shown.
3. Given the buyer double-submits (or retries after a network failure), when checkout runs again,
   then the function's idempotent-retry path returns the existing reservation — no second
   reservation, no duplicated financials, no second proforma.
4. Given insufficient available quantity, when checkout runs, then it fails atomically with no
   partial effect and the buyer sees a specific availability error.

### PS3 — Concurrent buyers cannot oversell (P1)

Two buyers acting on the same remaining quantity at the same moment cannot both succeed beyond what
exists.

**Why P1**: SRS AC-02 is release-blocking.
**Independent test**: fire two concurrent checkouts against the same listing with only enough
quantity for one and confirm exactly one succeeds and the inventory/listing figures remain
consistent.

**Acceptance scenarios**

1. Given two concurrent checkouts for overlapping quantity, when both execute, then at most the
   available quantity is reserved in total.
2. Given the losing request, when it fails, then no reservation, proforma, payment or financial row
   is left behind for it.
3. Given both requests complete, when inventory is inspected, then
   `inventory_positions.reserved_quantity_kg` equals the sum of genuinely successful reservations,
   and `coffee_offers.reserved_quantity_kg` mirrors it exactly.

### PS4 — The hold expires safely (P1)

If payment does not complete within the hold, the reservation releases and the quantity returns to
availability exactly once.

**Why P1**: expired holds that never release would permanently strand inventory.
**Independent test**: create a hold, force expiry, trigger the expiry path, and confirm the
reservation moves out of `ACTIVE` and both inventory and listing reserved quantities decrease by
exactly the reserved amount.

**Acceptance scenarios**

1. Given an expired hold, when the expiry path runs, then `expire_order_hold()` is called and the
   reservation leaves `ACTIVE`.
2. Given expiry has run, when inventory and the listing are inspected, then reserved quantity
   decreased exactly once (no double release).
3. Given expiry ran, when the buyer views the order, then its state and the reason are explicit, with
   a route to start again if still eligible.
4. Given an expired hold, when the buyer attempts to submit payment proof against it, then it is
   refused.

### PS5 — Partial-fill purchasing works (P2)

A buyer may purchase part of a listing's quantity; the remainder stays available to others.

**Why P2**: required by the approved model, but only meaningful once PS2/PS3 hold.
**Independent test**: buy part of a listing, then confirm the remainder is still purchasable by
another buyer and the listing shows partially-filled state after settlement.

**Acceptance scenarios**

1. Given a partial purchase, when checkout completes, then only the purchased quantity is reserved.
2. Given the remainder, when another buyer checks out, then it succeeds independently.

### PS6 — Buyers see order truth (P2)

Order list/detail shows the approved status, financial snapshot, items, proforma, shipment plan and
status history.

**Why P2**: essential experience, downstream of the transaction itself.
**Independent test**: render an order in each approved status and confirm labels, figures and
history.

**Acceptance scenarios**

1. Given each `orders.status` value, when displayed, then its exact approved label renders.
2. Given order financials, when displayed, then base, shipping, VAT, commission and buyer total show
   with currency, exactly as snapshotted.
3. Given status history, when displayed, then transitions with reason and timestamp are listed.
4. Given an order the member's organization does not own, when requested, then nothing is returned
   (`can_view_order`).

## Functional Requirements

- **FR-001**: Checkout MUST be performed **only** by calling `checkout_order(p_order_id)`. The
  application MUST NOT create reservations, compute totals/commission/tax, issue proformas, create
  payments, or set `HOLD`/`hold_expires_at` itself.
- **FR-002**: The application MUST use the values returned by `checkout_order()` (`reservation_id`,
  `proforma_id`, `buyer_total`, `hold_expires_at`, `correlation_id`, `idempotent_retry`) verbatim.
- **FR-003**: Checkout MUST be idempotent per intent: a repeated submission MUST NOT produce a second
  reservation, proforma, payment or financial computation. The `orders.idempotency_key` and the
  function's own retry path MUST both be respected.
- **FR-004**: Order creation MUST occur only in `DRAFT` and only for organizations where
  `organization_can_buy()` is true, with `created_by = auth.uid()`.
- **FR-005**: Order item additions MUST reference published, visible listings; the application MUST
  surface the database trigger's refusal rather than pre-empting it with its own rules.
- **FR-006**: Availability shown before checkout is **advisory**; the authoritative check occurs
  inside `checkout_order()` and its failure MUST be surfaced as a specific, safe availability error.
- **FR-007**: The 20-minute hold MUST be presented from `orders.hold_expires_at`; the application MUST
  NOT compute or extend the hold duration.
- **FR-008**: Expiry MUST be effected by calling `expire_order_hold(p_order_id)`; the application MUST
  NOT release reservations by direct table writes.
- **FR-009**: Expiry MUST be idempotent — running it twice MUST NOT release quantity twice.
- **FR-010**: Financial figures MUST be read from `order_financials` as snapshotted; the application
  MUST NOT recompute commission, tax or totals for display.
- **FR-011**: Order, item, financial, proforma and shipment reads MUST be scoped by `can_view_order`;
  no cross-organization visibility.
- **FR-012**: Order data MUST NOT be placed in any shared cache (Constitution XI).
- **FR-013**: Buyer-owned shipment planning MUST be limited to `order_shipments` DRAFT → REQUESTED and
  `shipment_items` while DRAFT; all later shipment states belong to 009/warehouse.
- **FR-014**: Every order status MUST render its approved vocabulary label with no invented synonyms.
- **FR-015**: All mutations MUST follow 001's Server Action contract with safe error mapping — no raw
  database error text (e.g. `forbidden`, `reservation_expired`) reaching the client verbatim.
- **FR-016**: All order routes MUST live under `/dashboard`, register with 004's contract, and be
  non-indexable.
- **FR-017**: Screens MUST provide loading, empty, error, unauthorized, suspended, reserved, expired,
  partial-fill and unavailable states.
- **FR-018**: Copy externalised; layouts RTL-safe; tables collapse to cards at mobile; reference codes
  monospaced; money and quantity always with unit/currency.

## Security Requirements

- **SEC-001**: Every checkout, order and shipment action MUST verify identity and organization
  capability server-side before calling any database function.
- **SEC-002**: A buyer MUST NOT be able to check out another organization's order, even by supplying
  its id directly — `checkout_order()` refuses, and the application MUST also refuse before calling.
- **SEC-003**: No service-role usage anywhere in this feature.
- **SEC-004**: Raw database exception strings MUST be mapped to safe application errors; no internal
  identifiers, SQL or stack traces reach the client.
- **SEC-005**: Idempotency keys MUST be generated server-side per intent and MUST NOT be attacker-
  controllable in a way that lets one buyer collide with another's order.
- **SEC-006**: Order/financial/proforma data MUST never appear on any public surface.

## Edge Cases

- Buyer submits checkout twice in rapid succession → exactly one reservation; the second returns the
  idempotent-retry result.
- Listing is suspended between draft and checkout → `assert_order_checkout_ready` refuses; safe error.
- Quantity becomes unavailable between draft and checkout → checkout fails atomically; nothing partial.
- Hold expires while the buyer is on the payment page → the payment attempt is refused with an
  explicit expired state and a route to retry.
- Expiry path runs twice (e.g. two requests hit a stale hold) → quantity releases exactly once.
- Buyer's organization is suspended mid-hold → protected actions refuse; the hold still expires
  normally.
- Order contains items from multiple sellers → each item's reservation is handled inside the single
  atomic function call; the application never partially processes them.
- Network failure after `checkout_order()` succeeded but before the response is rendered → the retry
  path returns the same reservation rather than creating a new one.
- Buyer edits a draft while another tab checks it out → the second edit is refused once the order
  leaves `DRAFT`.

## Success Criteria

- **SC-001**: Zero reservations, financial computations, proformas or holds are ever created by
  application code — 100% originate from `checkout_order()`.
- **SC-002**: Two concurrent checkouts against insufficient quantity never both succeed (AC-02),
  verified by an automated concurrency test.
- **SC-003**: Duplicate checkout submissions produce exactly one reservation, one proforma and one
  payment, verified by an automated idempotency test.
- **SC-004**: Expiry releases reserved quantity exactly once, verified by a repeat-execution test.
- **SC-005**: After any checkout, `coffee_offers.reserved_quantity_kg` mirrors
  `inventory_positions.reserved_quantity_kg` for the affected items with zero drift.
- **SC-006**: No order/financial data is readable across organizations, verified by negative tests.
- **SC-007**: No raw database exception text is ever returned to a client.
- **SC-008**: No title transfer occurs anywhere in this feature (verified by asserting zero
  `inventory_ownership_events` are produced by checkout).

## Assumptions

- `checkout_order()` behaves exactly as recorded in the capability map (locks the order, validates
  readiness, reserves inventory first then mirrors the listing, snapshots financials, issues the
  proforma, creates the `PENDING` payment, sets `HOLD` + 20 minutes, and supports idempotent retry).
- Payment collection and settlement are 008's responsibility; this feature only produces the pending
  payment record via the function.
- Shipment/delivery progression beyond REQUESTED belongs to 009 and the warehouse role.

## Open items / blockers

- **Hold-expiry trigger mechanism**: `expire_order_hold()` exists, but nothing in the approved
  baseline schedules it. Options: (a) **lazy expiry** — call it whenever a stale hold is encountered
  on a read/write path (implementable today with no new infrastructure), (b) a scheduled sweep (needs
  approved hosting infrastructure, which is a Sprint 0 decision and not yet approved). The plan
  adopts (a) as the implementable default and records (b) as an infrastructure decision. Without a
  sweep, a hold on an order nobody ever visits could remain `ACTIVE` past expiry — this must be
  stated honestly, not hidden.
- Members cannot read `inventory_reservations` directly (admin-only policy), so hold state is
  presented from `orders.hold_expires_at`/`orders.status` — a documented constraint, not a defect.

## Dependencies

| Depends on | Why |
|---|---|
| 001, 003, 004 | Guard, eligibility, module contract |
| 005 | Availability facts and post-checkout inventory display |
| 006 | Listings that orders reference; fill/reservation effects |
| 008 | Consumes the pending payment; performs settlement and title transfer |
| 009 | Consumes the shipment plan this feature initiates |

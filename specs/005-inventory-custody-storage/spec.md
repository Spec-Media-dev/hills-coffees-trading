# Feature Specification: Inventory, Custody & Storage

**Feature Directory**: `specs/005-inventory-custody-storage`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surface**: Member Portal (`/dashboard/inventory`, `/dashboard/storage`) + the shared
inventory domain layer consumed by 006–010
**Depends on**: 001, 003 (eligibility), 004 (module contract)

## Purpose

Give an approved member an accurate, auditable view of the coffee they own, where it is physically
held, how much of it is actually tradable right now, and how its ownership came to be — and provide
the shared inventory domain layer that the marketplace (006), checkout (007), settlement (008) and
delivery (009) all read from.

The platform's core inventory invariant (SRS LOT-02) is:

```
purchased − delivered − transferred − active reservations = available tradable quantity   (never < 0)
```

That invariant is enforced by the database. This feature's job is to **present it faithfully and
never re-derive it in application code**.

## Scope

### In scope

- Member view of `inventory_positions` (owned quantity, reserved quantity, warehouse, lot).
- Member view of `storage_allocations` (what is in Hills custody, and in what state).
- Member view of the append-only ownership ledger (`inventory_ownership_events`) for their org.
- Availability presentation: available vs reserved vs delivered, with unit/currency discipline.
- Lot context presentation (origin, process, crop, grade, quality evidence) where readable.
- The shared read layer (`lib/inventory/*`) consumed by 006–010.
- Member-initiated custody actions that the approved schema supports; anything requiring a delivery
  request hands off to 009.
- Reconciliation/variance surfacing: when custody is not trustworthy, say so and block affected actions.

### Out of scope

- Warehouse operator screens (receipt, QC, holds, releases, reconciliation workflows) — 010.
- Creating or adjusting inventory (warehouse-operator writes) — 010.
- Listing eligible inventory for resale — 006.
- Reserving inventory at checkout — 007 (via `checkout_order()`).
- Title transfer — 008 (via `admin_review_payment()`).
- Delivery requests and their reservations — 009.

## Actors

| Actor | Interest |
|---|---|
| **Buyer-organization member** | See what I own, where it is, how much is available, and its history. |
| **Seller-capable member** | Additionally: understand which quantity is eligible to list (feeds 006). |
| **Warehouse operator** (adjacent) | Writes this data in 010; reads the same domain layer. |
| **Auditor** (adjacent) | Reads positions/allocations/ledger as evidence. |

## Business journeys owned

Owns the Buyer-flow stage **Buyer inventory → Custody/storage**, and provides the Seller-flow
precondition "Hills-origin owned inventory in approved custody with eligible quantity".

## Prioritized stories

### PS1 — See what I own and where it is (P1)

A member opens inventory and sees each position: lot identity, coffee, warehouse, total owned,
currently reserved, and currently available.

**Why P1**: this is the member's proof that their purchase resulted in real custody.
**Independent test**: with a seeded position, confirm every displayed quantity matches the database
exactly and that available is derived from the database, not computed in the UI.

**Acceptance scenarios**

1. Given an owned position, when the member views inventory, then lot code, coffee, origin,
   warehouse, owned quantity, reserved quantity and available quantity all render with units.
2. Given a position owned by another organization, when the member requests it, then it is not
   returned — RLS denies it and the UI shows nothing about its existence.
3. Given a position with reserved quantity, when displayed, then reserved and available are shown
   distinctly and the member can see *why* it is reserved (order/delivery reference where readable).
4. Given zero positions, when the member views inventory, then an honest empty state explains how
   inventory appears (after settlement of a purchase).

### PS2 — See what is in Hills custody (P1)

A member sees their storage allocations: which lot, which warehouse, what quantity, and the
allocation state (`STORED`, `RELEASED`, `DELIVERED`).

**Why P1**: custody is a headline product capability; members must be able to verify it.
**Independent test**: with seeded allocations in each state, confirm each renders with its exact
approved label and correct quantity.

**Acceptance scenarios**

1. Given allocations in `STORED`, `RELEASED` and `DELIVERED`, when displayed, then each shows its
   approved status label and quantity, with released quantity distinguished from allocated quantity.
2. Given an allocation, when displayed, then it links to the originating order item where the member
   is permitted to view it.

### PS3 — See how ownership came to be (P2)

A member views the append-only ownership event history for their organization: allocations, sales,
resales, adjustments and voids, with reason and correlation ID.

**Why P2**: essential for trust and dispute defence, but not required to transact.
**Independent test**: with seeded events, confirm chronological, immutable presentation including
event type, counterparty (where permitted), quantity, reason and correlation ID.

**Acceptance scenarios**

1. Given ownership events involving the member's organization (as source or destination), when
   viewed, then all are listed with type, quantity, timestamp, reason and correlation ID.
2. Given the ledger view, when rendered, then it offers no edit or delete affordance of any kind.
3. Given an event involving another organization, when displayed, then the counterparty is shown only
   to the extent the member is permitted to see it.

### PS4 — Understand what is actually tradable (P2)

A member sees, per position, the quantity that is genuinely available to sell or deliver right now,
with reserved/blocked quantity explained.

**Why P2**: prevents the most common member confusion and prevents 006 from listing ineligible stock.
**Independent test**: seed a position with an active reservation and confirm the available figure
excludes it and the reason is visible.

**Acceptance scenarios**

1. Given an active reservation against a position, when availability is displayed, then the reserved
   quantity is excluded from available and labelled with its cause.
2. Given a delivery reservation, when displayed, then that quantity is shown as unavailable for
   listing or sale (SRS DEL-01).
3. Given any availability figure shown in the UI, when a member acts on it, then the action re-checks
   authoritative availability in the database at execution time (advisory-UI rule).

### PS5 — Custody trust is visible (P3)

When a lot or position is under an unresolved reconciliation variance, hold or quarantine, the
member sees it and dependent actions are blocked.

**Why P3**: important for integrity, but depends on 010's warehouse workflows producing the signal.
**Independent test**: seed a blocked/held condition and confirm the member sees it and cannot list or
request delivery of the affected quantity.

**Acceptance scenarios**

1. Given an affected position, when displayed, then the member sees an explicit hold/variance state
   with the approved label.
2. Given an affected position, when the member attempts a dependent action, then it is refused
   server-side with a clear reason (SRS LOT-04).

## Functional Requirements

- **FR-001**: Inventory, custody and ownership data MUST be read exclusively through
  `lib/inventory/*` DTO modules; pages MUST NOT issue ad-hoc queries against inventory tables.
- **FR-002**: Available/reserved/owned quantities MUST be taken from the database's own columns
  (`inventory_positions.available_quantity_kg`, `reserved_quantity_kg`) — the application MUST NOT
  recompute the LOT-02 conservation formula client- or server-side.
- **FR-003**: Every quantity MUST render with its unit; every monetary value with unit and currency;
  reference codes in monospace, per the approved design system.
- **FR-004**: A member MUST only ever see positions, allocations and ownership events involving their
  own organization; cross-organization visibility MUST be impossible (enforced by RLS, verified by
  negative tests).
- **FR-005**: The ownership ledger view MUST be strictly read-only and MUST expose no edit, delete or
  reorder affordance (SRS LOT-03; `prevent_ownership_event_mutation` trigger backs this).
- **FR-006**: Storage allocation states MUST render the approved vocabulary (`STORED`, `RELEASED`,
  `DELIVERED`) with no invented synonyms.
- **FR-007**: Any availability figure displayed to a member MUST be treated as advisory; any action
  taken on it MUST re-validate authoritative availability in the database at execution time.
- **FR-008**: Inventory reads MUST NOT be placed in any cache shared across organizations or users;
  inventory is transactional truth and is never served from a shared cache (Constitution XI).
- **FR-009**: The feature MUST surface hold/variance/quarantine conditions where the approved schema
  represents them, and MUST NOT invent a parallel status model.
- **FR-010**: The shared read layer MUST expose the eligibility inputs 006 needs (owned, unreserved,
  Hills-custody quantity per lot/position) without duplicating 006's eligibility rules.
- **FR-011**: Where lot detail is not readable under current RLS (DB-OPEN-05), the UI MUST degrade
  honestly (show what is readable, state what is unavailable) rather than failing or fabricating.
- **FR-012**: All member inventory routes MUST live under `/dashboard` and register with 004's module
  contract; no separate buyer/seller inventory application.
- **FR-013**: All screens MUST provide loading, empty, error, unauthorized and suspended states from
  001's components.
- **FR-014**: All copy externalised; all layouts RTL-safe with logical properties; tables collapse to
  card lists at mobile.
- **FR-015**: Inventory routes MUST be non-indexable.

## Security Requirements

- **SEC-001**: All reads run under the member's own session (RLS-scoped); no service-role client.
- **SEC-002**: Negative tests MUST prove organization A cannot read organization B's positions,
  allocations or ownership events.
- **SEC-003**: Warehouse-operator write paths MUST NOT be reachable from member surfaces.
- **SEC-004**: No inventory quantity, lot identity or warehouse location may appear on any public
  surface (SRS SEO-APP-02).
- **SEC-005**: Correlation IDs and reasons rendered in the ledger MUST be escaped as untrusted text.

## Edge Cases

- A position's available quantity reaches zero while the member is viewing it → next request shows
  zero; any action taken is refused by the database's authoritative check.
- A reservation expires between page load and action → the action's re-validation reflects the newly
  freed quantity (007 owns expiry mechanics).
- An ownership event references an organization the member cannot see → counterparty is redacted, the
  event still appears.
- A lot is `SOLD_OUT` or `ARCHIVED` but historical positions/events exist → history remains visible
  and honest.
- DB-OPEN-05 prevents reading lot detail behind a position → show position-level truth and state that
  lot detail is unavailable, rather than erroring.
- A member belongs to two organizations → inventory reflects only the acting organization.
- Extremely large position counts → pagination with bounded queries; no unbounded scans.

## Success Criteria

- **SC-001**: 100% of displayed quantities match the database's own columns; zero are recomputed by
  application code.
- **SC-002**: Organization A can never read organization B's inventory, allocations or ownership
  events, verified by automated negative tests.
- **SC-003**: The ownership ledger presents zero mutation affordances, and any attempted mutation is
  refused by the database trigger.
- **SC-004**: Every action taken from an advisory availability figure re-validates against the
  database before having any effect.
- **SC-005**: No inventory data appears in any shared cache entry.
- **SC-006**: Every storage allocation and position state renders its approved vocabulary label.
- **SC-007**: No inventory value is reachable from any public route.

## Assumptions

- Positions and allocations are created by the approved transactional functions (`checkout_order`,
  `admin_review_payment`) and by warehouse operators in 010 — never by this feature.
- Lot metadata visible to members is whatever current RLS permits; DB-OPEN-05 may narrow it.
- Reconciliation/variance signalling comes from 010's warehouse workflows; this feature renders it.

## Open items / blockers

- **DB-OPEN-05**: the `coffee_lots` member-read policy predicate appears unsatisfiable
  (`co.lot_id = co.id`), which may prevent members from reading lot detail behind their own
  positions. Requires a product/database decision — either confirm the narrowing is intentional
  (and 005/006 present position-level detail only) or correct the policy through the approved
  database-change process. **Do not work around it with a service-role read.**
- Members cannot SELECT `inventory_reservations` directly (admin-only policy). Reservation context
  for a member must therefore come from readable sources (`orders.hold_expires_at`,
  `inventory_reservation_items` via `can_view_order`). Recorded as a design constraint, not a blocker.
- Whether "hold/quarantine/variance" has a first-class representation for members in the approved
  schema needs confirmation with 010's warehouse model before PS5 is fully implementable.

## Dependencies

| Depends on | Why |
|---|---|
| 001, 003, 004 | Guard, eligibility, module contract |
| 007, 008 | Produce the reservations/positions this feature displays |
| 009 | Delivery reservations that reduce availability |
| 010 | Warehouse operations that create/adjust positions and raise variances |
| 006 | Consumes this feature's eligibility inputs for listing |

# Implementation Plan: Inventory, Custody & Storage

**Feature**: `005-inventory-custody-storage` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Build the member-facing inventory/custody/storage surfaces plus the shared `lib/inventory/*` domain
read layer that 006–010 consume. Everything is read-only in this feature: positions, allocations and
ownership events are written exclusively by approved database functions or by warehouse operators in
010. The application never recomputes the LOT-02 conservation formula and never caches inventory.

## Technical Context

**Data (read-only)**: `inventory_positions` (own org), `storage_allocations` (own org),
`inventory_ownership_events` (org as source or destination), `inventory_reservation_items` (via
`can_view_order`), `warehouses`, `warehouse_locations`, `coffee_lots`/`coffees` (subject to
DB-OPEN-05), `orders` (for reservation context).
**Writes**: none. This feature introduces no mutation.
**Caching**: none — inventory is transactional truth (Constitution XI).
**Testing**: Vitest integration tests against seeded positions/allocations/events, including
cross-organization negative tests.

## Database capabilities consumed

| Need | Approved mechanism | Note |
|---|---|---|
| Own positions | `inventory_positions` SELECT (`inventory_owner_read`) | `is_org_member(owner_organization_id)` |
| Own custody | `storage_allocations` SELECT (`storage_owner_read`) | same scoping |
| Ownership ledger | `inventory_ownership_events` SELECT (`ownership_admin`) | org as `from_` or `to_organization_id` |
| Reservation context | `inventory_reservation_items` SELECT + `orders.hold_expires_at` | `inventory_reservations` itself is **admin-only** |
| Lot/coffee context | `coffee_lots` (DB-OPEN-05 may block), `coffees` | degrade honestly per FR-011 |
| Warehouse context | `warehouses` (public, `is_active`) | never expose exact location publicly |

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III Database authority | PASS | Read-only; zero schema change; DB-OPEN-05 recorded, not bypassed |
| V/VI Surfaces & capability | PASS | `/dashboard` only; registers with 004's contract |
| VIII Server/DB authorization | PASS | RLS is the boundary; SEC-002 negative tests prove it |
| IX Postgres transactional authority | PASS | FR-002: no recomputation of the inventory invariant |
| X Inventory integrity | PASS | FR-007 advisory-UI rule; ledger read-only (FR-005) |
| XI Caching | PASS | FR-008: inventory never cached |
| XIII Design fidelity | PASS | FR-003 unit/currency and status vocabulary discipline |
| XIV Security | PASS | SEC-001..005; nothing public (SEO-APP-02) |
| XV Ambiguity rule | PASS | DB-OPEN-05 and the reservation-visibility constraint surfaced |

## Architecture decisions

1. **A single inventory read layer.** `lib/inventory/positions.ts`, `allocations.ts`,
   `ownership.ts`, `availability.ts` return DTOs. Every consumer (006 eligibility, 007 pre-checkout
   display, 009 delivery quantities, 010 ops views) imports from here, so cross-organization scoping
   and field discipline are enforced in one auditable place.
2. **Availability is passed through, never computed.** `availability.ts` reads
   `available_quantity_kg` / `reserved_quantity_kg` and *labels* them; it contains no arithmetic that
   could drift from the database's invariant. Reserved-quantity *causes* are joined from readable
   sources only.
3. **Reservation context without `inventory_reservations`.** Because that table is admin-only,
   member-facing reservation context is assembled from `inventory_reservation_items` (visible via
   `can_view_order`) and `orders.hold_expires_at`. Documented explicitly so a future agent does not
   "fix" it with a service-role read.
4. **Ledger is a read-only projection.** `ownership.ts` returns an immutable, chronologically-ordered
   projection; the UI component exposes no mutation affordance. The database trigger
   `prevent_ownership_event_mutation` is the real guarantee; the UI simply does not offer the action.
5. **Honest degradation for DB-OPEN-05.** Lot detail is fetched optionally; when the read returns
   nothing, the UI renders position-level truth plus an explicit "lot detail unavailable" note rather
   than erroring or inventing values.
6. **No mutations at all.** This feature ships zero Server Actions. Any member action that would
   change inventory (list for resale, request delivery) is a link into 006 or 009.
7. **Module registration.** Registers `inventory` and `storage` nav entries with 004, plus overview
   cards for "where is it" (custody summary) and "what did I buy" (positions summary).

## Project structure (files this feature adds)

```text
src/app/dashboard/
├── inventory/page.tsx + [positionId]/page.tsx     # NEW — positions list + detail
├── storage/page.tsx                                # NEW — custody allocations
└── inventory/history/page.tsx                      # NEW — ownership ledger view

lib/inventory/
├── positions.ts · allocations.ts · ownership.ts · availability.ts   # NEW — DTO read layer
└── types.ts                                                          # NEW — shared DTO types

components/inventory/                # NEW — position card/row, availability breakdown,
                                     #       custody state badge, ledger timeline, empty states

tests/inventory/                     # NEW — isolation, quantity fidelity, ledger immutability
```

## Testing strategy

- **Cross-organization isolation (highest value)**: org A cannot read org B's positions, allocations
  or ownership events — the release-blocking tenant guarantee.
- **Quantity fidelity**: every displayed figure equals the database column; a deliberate mismatch in
  a test double fails the test (guards against reintroducing computation).
- **Ledger immutability**: attempting an update against `inventory_ownership_events` is refused by
  the database trigger; the UI exposes no such affordance.
- **Advisory-UI rule**: a stale availability figure does not permit an action to succeed — the action
  path re-validates (proven jointly with 006/007's tests).
- **Degradation**: with lot detail unreadable (DB-OPEN-05 condition), the page still renders.
- **States/RTL/a11y/mobile**: empty, loading, error, unauthorized, suspended; card-list collapse.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **DB-OPEN-05** | Lot detail may be unreadable for members | Honest degradation (FR-011); escalate the policy decision |
| `inventory_reservations` admin-only | Reservation cause/expiry not directly readable | Use `inventory_reservation_items` + `orders.hold_expires_at`; documented so nobody "fixes" it with service-role |
| Variance/hold representation unconfirmed | PS5 partially unimplementable | Confirm with 010's warehouse model before building; do not invent a status |
| Data volume growth | Slow pages | Bounded, paginated queries in the read layer |

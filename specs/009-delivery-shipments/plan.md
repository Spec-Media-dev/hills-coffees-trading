# Implementation Plan: Delivery & Shipments

**Feature**: `009-delivery-shipments` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Implement the buyer's delivery-request slice, the warehouse domain layer for operational
progression, and honest tracking for both sides — all strictly within the state machine and
authorization split the approved database already enforces via
`validate_shipment_transition` / `validate_shipment_item` / `sync_shipment_ready`. One
release-critical gap (delivery reservation not reducing tradable quantity) is recorded as
**DB-BLOCK-07**, not worked around.

## Technical Context

**Data (buyer writes)**: `order_shipments` INSERT `DRAFT`, UPDATE `DRAFT → REQUESTED|CANCELLED`;
`shipment_items` INSERT/UPDATE while shipment is `DRAFT`.
**Data (warehouse writes)**: `order_shipments` ALL, `shipment_items` ALL — via the domain layer.
**Reads**: shipments/items via `can_view_order` or `is_warehouse_operator()`, plus orders,
order items, 005's custody data.
**Caching**: none (Constitution XI).
**Testing**: full transition-matrix coverage, role negatives, delivered-quantity monotonicity,
isolation.

## Database capabilities consumed

| Need | Approved mechanism |
|---|---|
| Buyer plan/submit | `shipments_buyer_insert` / `shipments_buyer_draft_update` policies + `validate_shipment_transition` (DRAFT → REQUESTED/CANCELLED only for non-warehouse) |
| Item planning | `shipment_items_buyer_insert/update` policies + `validate_shipment_item` (order match, DRAFT-only edits, warehouse-only delivered quantity, no decrease) |
| Warehouse progression | `shipments_warehouse_manage` / `shipment_items_warehouse_manage` (ALL) + the trigger's transition map |
| Ready timestamps | `sync_shipment_ready` trigger (sets `ready_at`, `orders.shipping_ready_at`) — application must not set them |
| Visibility | `shipments_view` (`can_view_order` OR warehouse), `shipment_items_view` |

**Not available**: any mechanism that reserves inventory when a delivery is requested — see
DB-BLOCK-07.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III Database authority | PASS | Zero schema change; DB-BLOCK-07 recorded for the approved change process |
| VIII Server/DB authorization | PASS | FR-002, SEC-001 — role split enforced by the trigger and mirrored in the layer |
| IX/X Transactional & inventory integrity | PASS *with recorded gap* | FR-005; DB-BLOCK-07 means AC-04 cannot yet pass — stated openly rather than simulated |
| XI Caching | PASS | FR-008 |
| XII Server Action discipline | PASS | FR-010 safe error mapping |
| XIV Security | PASS | SEC-001..005; addresses treated as private data |
| XV Ambiguity rule | PASS | DB-BLOCK-07/01 and the suspension question surfaced |

## Architecture decisions

1. **Two guarded surfaces, one state machine.** `lib/delivery/buyer.ts` (DRAFT planning + submit)
   and `lib/delivery/warehouse.ts` (operational transitions + delivered quantity). Neither contains a
   state machine — both attempt a transition and map the trigger's refusal.
2. **The transition map lives in one documented constant.** A read-only copy of the database's
   permitted-transition map is kept for *UI affordance* purposes (which buttons to show) with an
   explicit comment that the database is authoritative and the copy must never be used to authorise.
3. **Warehouse layer is the seam for 010.** `warehouse.ts` exports guarded operations
   (`confirmCapacity`, `reserve`, `startPicking`, `dispatch`, `recordDelivery`, `fail`, `cancel`) that
   010's console calls; there is no exported raw-update path.
4. **Timestamps belong to the trigger.** The application never writes `ready_at` or
   `shipping_ready_at` — verified by grep in the closure phase.
5. **Delivered quantity is warehouse-only and monotonic.** The layer never computes it, never allows
   a decrease, and surfaces the database's refusal directly.
6. **DB-BLOCK-07 is surfaced in the product, not simulated.** Because delivery requests do not
   currently reserve inventory, the UI must not imply that requested quantity is protected. The
   feature states what the system actually guarantees today and the blocker remains visible until an
   approved database change lands.
7. **Custody consequences are read from 005**, not recomputed here.

## Project structure (files this feature adds)

```text
src/app/dashboard/
├── deliveries/page.tsx + [shipmentId]/page.tsx     # NEW — buyer tracking
├── deliveries/new/page.tsx + actions.ts             # NEW — plan + submit request
└── deliveries/[shipmentId]/actions.ts               # NEW — buyer cancel while DRAFT

lib/delivery/
├── buyer.ts        # NEW — DRAFT planning, submit, cancel (buyer-permitted only)
├── warehouse.ts    # NEW — guarded operational transitions + delivered quantity (consumed by 010)
├── read.ts         # NEW — shipment/item DTOs, scoped
├── transitions.ts  # NEW — documented UI-affordance copy of the permitted map (never authoritative)
├── errors.ts       # NEW — trigger exception → safe application error mapping
└── validation.ts   # NEW — Zod schemas (address, contact, method, quantities)

components/delivery/  # NEW — plan editor, status timeline, per-item delivered/planned table,
                      #       address panel, failure/cancellation reason display

tests/delivery/       # NEW — transition matrix, role negatives, monotonicity, isolation
```

## Testing strategy

| Test | Proves |
|---|---|
| **Transition matrix** — every permitted and forbidden transition, per role | SC-002, FR-002/FR-003 |
| **Buyer role negatives** — buyer attempts each operational status directly | SC-001, SEC-001 |
| **Delivered-quantity rules** — non-warehouse write, decrease attempt, over-plan attempt | SC-003, FR-005 |
| **Plan closure** — item edit after `REQUESTED` | FR-001 (`shipment_plan_is_closed`) |
| **Cross-order item** — item from another order | `shipment_order_item_mismatch` |
| **Isolation** — another organization's shipment | SC-005, SEC-003 |
| **Timestamp ownership** — application never sets `ready_at`/`shipping_ready_at` | FR-004 |
| **Error mapping** — each trigger exception | SC-007 |

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **DB-BLOCK-07** — delivery requests do not reserve inventory | **AC-04 cannot pass**; requested quantity remains sellable/listable | Record in the capability map and spec; do not implement an application-side reservation (it would create a competing inventory truth); escalate for an approved database change |
| **DB-BLOCK-01** | Delivery proof documents cannot be stored | Same inert-seam approach as 003/008 |
| Duplicating the state machine in app code | Divergence from the trigger | `transitions.ts` is explicitly UI-affordance-only, verified in review |
| Warehouse layer exposing a raw update path | Role-split bypass | No raw export; verified by grep + review |
| Address/contact data leakage | Privacy | SEC-005: never cached, never logged, scoped reads only |

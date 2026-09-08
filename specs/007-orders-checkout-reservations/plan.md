# Implementation Plan: Orders, Checkout & Reservations

**Feature**: `007-orders-checkout-reservations` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Build draft-order construction, the checkout call, hold presentation, expiry handling and buyer order
views. The transactional core is **not built here** — it already exists as `checkout_order()`. This
feature is a disciplined caller: verify authorization, call the function once per intent, map its
outcomes to safe application errors, and present its results verbatim. Title never moves in this
feature.

## Technical Context

**Data (writes)**: `orders` (INSERT DRAFT, UPDATE while DRAFT/CONFIRMED), `order_items` (INSERT while
DRAFT), `order_shipments` (INSERT DRAFT, UPDATE DRAFT→REQUESTED), `shipment_items` (while DRAFT).
**Data (via functions)**: `checkout_order()`, `expire_order_hold()`.
**Data (reads)**: `orders`, `order_items`, `order_financials`, `order_status_history`,
`proforma_invoices` + items, `payments` (status only), `inventory_reservation_items`, 005's inventory
layer, 006's listing layer.
**Caching**: none (Constitution XI — transactional truth).
**Testing**: concurrency, idempotency, expiry-idempotence, authorization negatives, state coverage.

## Database capabilities consumed

| Need | Approved mechanism | Note |
|---|---|---|
| Create draft order | `orders` INSERT policy | requires `organization_can_buy` + `created_by = auth.uid()` + `DRAFT` |
| Add items | `order_items` INSERT policy + `validate_order_item_offer` trigger | trigger validates the offer is usable |
| Checkout (atomic) | `checkout_order(p_order_id)` | reserves, snapshots, proforma, payment, HOLD + 20 min, idempotent retry |
| Expire hold | `expire_order_hold(p_order_id)` | releases the reservation |
| Order visibility | `can_view_order(order_id)` | drives orders/items/financials/proforma/shipments reads |
| Status legality | `validate_order_transition` trigger + `orders_status_check` | application never bypasses |
| Hold countdown | `orders.hold_expires_at` | `inventory_reservations` is admin-only |

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III Database authority | PASS | Zero schema change; expiry-scheduling gap recorded honestly |
| VIII Server/DB authorization | PASS | SEC-001/002 + `checkout_order()`'s own checks |
| IX Postgres transactional authority | PASS | FR-001: the application reimplements nothing |
| X Inventory & transactional integrity | PASS | FR-003/006/008/009; SC-002/003/004/005/008 |
| XI Caching | PASS | FR-012 — order data never cached |
| XII Server Action discipline | PASS | FR-015 safe error mapping |
| XIV Security | PASS | SEC-001..006 |
| XV Ambiguity rule | PASS | Expiry-sweep infrastructure question surfaced, not assumed |

## Architecture decisions

1. **One checkout entry point.** `lib/orders/checkout.ts#executeCheckout(orderId)` is the only place
   in the codebase that calls `checkout_order()`. Every UI path routes through it. This makes
   "exactly once per intent" reviewable in one file.
2. **Server-generated idempotency.** The idempotency key is generated server-side when the draft
   enters checkout and stored on the order; the client never supplies it. Repeat submissions reuse
   the same key and hit the function's idempotent-retry path (SEC-005).
3. **Error mapping table.** `lib/orders/errors.ts` maps the function's raised exceptions
   (`order_not_found`, `forbidden`, `buyer_not_authorized`, availability failures,
   `reservation_expired`, …) to safe, specific user-facing messages. No raw text reaches the client
   (FR-015, SC-007).
4. **Lazy expiry, honestly documented.** `lib/orders/expiry.ts#ensureHoldFresh(orderId)` calls
   `expire_order_hold()` when it encounters a stale `HOLD`. It runs on order read paths and before
   any payment action. Because no scheduler is approved, an unvisited stale hold may persist — the
   spec records this rather than hiding it, and the function's own idempotence protects against
   double release.
5. **Advisory-to-authoritative hand-off.** Quantities shown in 006 are advisory; the checkout call
   carries only the order id, never a client-supplied quantity or price. All commercial values come
   from what the database snapshotted.
6. **Financials are displayed, never computed.** `order_financials` is read as-is; there is no
   client- or server-side arithmetic that could disagree with the snapshot (FR-010).
7. **Buyer shipment planning is deliberately narrow.** Only DRAFT→REQUESTED is exposed here, matching
   the RLS boundary; everything downstream is 009's warehouse-owned progression.
8. **No title transfer, provably.** A test asserts checkout produces zero
   `inventory_ownership_events` (SC-008), guarding the MKT-04 rule at the code level.

## Project structure (files this feature adds)

```text
src/app/dashboard/
├── orders/page.tsx + [orderId]/page.tsx        # NEW — order list + detail (status, items, financials, history)
├── orders/[orderId]/checkout/page.tsx          # NEW — review + confirm
├── orders/[orderId]/checkout/actions.ts        # NEW — the single checkout Server Action
├── orders/actions.ts                            # NEW — draft create/edit/item add-remove
└── orders/[orderId]/shipment/actions.ts         # NEW — DRAFT → REQUESTED only

lib/orders/
├── checkout.ts       # NEW — the only caller of checkout_order()
├── expiry.ts         # NEW — the only caller of expire_order_hold()
├── drafts.ts         # NEW — draft/item reads + permitted writes
├── read.ts           # NEW — order/financial/proforma/history DTOs (can_view_order scoped)
├── errors.ts         # NEW — database exception → safe application error mapping
└── validation.ts     # NEW — Zod schemas

components/orders/    # NEW — cart/draft editor, checkout review, hold countdown,
                      #       order status timeline, financial summary, proforma panel

tests/orders/         # NEW — concurrency, idempotency, expiry, authorization, states
```

## Testing strategy (this feature's tests are release-blocking)

| Test | Proves |
|---|---|
| **Concurrency** — two simultaneous checkouts, insufficient quantity | AC-02: at most available is reserved; loser leaves no artefacts |
| **Idempotency** — double submit / retry after simulated failure | SC-003: one reservation, one proforma, one payment |
| **Expiry idempotence** — run expiry twice on the same expired hold | SC-004: quantity released exactly once |
| **Mirror consistency** — after checkout | SC-005: listing reserved mirrors inventory reserved exactly |
| **No-title-transfer** — after checkout | SC-008: zero ownership events produced |
| **Authorization negatives** — other org's order id supplied directly | SEC-002: refused before and by the function |
| **Error mapping** — force each raised exception | SC-007: no raw database text reaches the client |
| **State coverage** — every `orders.status` | FR-014, FR-017 |

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **No approved scheduler for expiry sweeps** | Stale holds on unvisited orders may persist past expiry | Lazy expiry now (idempotent); record the infrastructure decision in spec Open items |
| Temptation to recompute totals for display | Divergence from the snapshot | FR-010 + review rule: `order_financials` is read-only truth |
| Temptation to pre-check availability and skip the function's failure path | Overselling | FR-006 + concurrency test |
| Raw exception leakage (`forbidden`, `reservation_expired`) | Information disclosure / poor UX | Central error-mapping table + test |
| Client-supplied idempotency keys | Cross-order collision | SEC-005: server-generated only |
| Multi-seller orders | Partial processing risk | Single atomic function call handles all items; application never loops over items transactionally |

# DB-BLOCK-07 — Authoritative Delivery-Reservation Design (T005)

**Status**: DRAFT — awaiting human Database/security specialist + Business approval (RUN A2's T010
gate). Nothing in this document has been applied to any database. This document **supersedes**
`plan.md`'s own earlier draft reserve-point recommendation (`RESERVED`) with a corrected, evidence-
based analysis performed during RUN A1, per that run's explicit instruction to re-validate rather
than treat RUN 0's recommendation as pre-approved.

---

## 0. Correction from RUN 0 — the reserve point

**RUN 0 recommended**: reserve at the transition into `RESERVED` (or the first of
`RESERVED`/`PICKING`/`BOOKED` reached).

**RUN A1 finds this was too narrow and, read literally, too late.** SRS DEL-01 says: *"An approved
delivery request atomically reserves quantity."* "Approved" most naturally maps to
`CAPACITY_CONFIRMED` — the live transition graph's own name for the moment warehouse first approves
a request — not to `RESERVED`, which is a later, optional waypoint the graph allows a shipment to
skip entirely (`READY → PICKING` and `READY → BOOKED` are both directly permitted, bypassing
`RESERVED`; `CAPACITY_CONFIRMED → RESERVED` and `CAPACITY_CONFIRMED → READY` are both permitted from
`CAPACITY_CONFIRMED`). Pinning the reserve point to `RESERVED` specifically would leave a real gap:
a shipment taking `REQUESTED → READY → PICKING` (skipping both `CAPACITY_CONFIRMED` and `RESERVED`)
would never trigger reservation at all under RUN 0's draft — exactly the double-booking DB-BLOCK-07
exists to prevent.

**Corrected design**: define a **gated set** of statuses —
`{CAPACITY_CONFIRMED, RESERVED, PICKING, BOOKED, DISPATCHED, PARTIALLY_DELIVERED, DELIVERED}` — and
apply BOTH the settlement-eligibility check (FR-015) and the reservation effect (FR-016) at the
**first transition into this set from outside it**, regardless of which specific status is entered
first. This is a single, uniform rule (one code path in the trigger), not two different rules for
two different statuses:

- A shipment taking `REQUESTED → CAPACITY_CONFIRMED → READY → RESERVED → ...` reserves at
  `CAPACITY_CONFIRMED` (the literal "approval" DEL-01 describes).
- A shipment taking `REQUESTED → READY → PICKING` (skipping `CAPACITY_CONFIRMED` and `RESERVED`
  entirely) reserves at `PICKING` — still the first gated-set entry, so DEL-01's guarantee still
  holds; no path exists where quantity is never reserved before physical work begins.
- `DRAFT`, `REQUESTED`, `READY`, `CANCELLED`, `FAILED`, `DISPUTED` are **never** gated — see §1 for
  why `READY` in particular must remain reachable pre-payment.

## 1. Why this does not conflict with Feature 007's own pre-payment shipment usage

Feature 007 is closed and creates its own `order_shipments` row **before payment**, as part of the
checkout precondition: `assert_order_checkout_ready()` requires a shipment in `READY` **or**
`RESERVED` with `ready_at` set before `checkout_order()` will run at all. This document's gated set
includes `RESERVED` — so does gating `RESERVED` behind settlement break Feature 007's own flow?

**No — proven, not assumed.** `assert_order_checkout_ready()`'s own check is `status IN
('READY','RESERVED')` — `READY` alone already satisfies it. Feature 007's own live-tested fixture
code (`tests/finance/read.test.ts#markShipmentReadyAsWarehouse`, reused by Feature 007/008's own
checkout-fixture helpers) sets the pre-payment shipment directly to `READY`:

```ts
const { error } = await warehouse.from("order_shipments").update({ status: "READY" }).eq("id", shipmentId);
```

— never `CAPACITY_CONFIRMED`, never `RESERVED`. This is **live, already-committed, already-tested
evidence** that the real pre-payment checkout-gating path uses `REQUESTED → READY` directly,
bypassing the entire gated set. Gating `CAPACITY_CONFIRMED`/`RESERVED`/onward behind settlement
therefore does not touch Feature 007's own established, closed, tested behavior — no bypass marker
(the kind DB-OPEN-16's `app.checkout_reservation` needed) is required, because the two flows
structurally never intersect at the gated boundary. This is recorded as a design **finding**, not an
assumption: if a future caller ever DOES attempt `REQUESTED → CAPACITY_CONFIRMED` pre-payment (the
graph does not forbid it structurally), the new gate correctly refuses it — which is the intended
behavior per FR-015, not a regression against anything Feature 007 actually does today.

## 2. Reservation identity and quantity source

- **What is reserved**: the REQUESTING organization's (the order's `buyer_organization_id`) OWN
  `inventory_positions` row — the position created for the buyer by `admin_review_payment()` at
  settlement — never the original seller's position (already reserved/released by checkout/
  settlement, a separate and already-closed lifecycle).
- **How much**: `shipment_items.planned_quantity_kg` per item, already stored (never recomputed) —
  the same value `validate_shipment_item`'s existing `shipment_plan_exceeds_order_item` check already
  validates against `order_items.quantity_kg`.
- **Which position**: resolved the same way `admin_review_payment()`/`checkout_order()` already
  resolve a position — `lot_id` + `owner_organization_id` (= `buyer_organization_id`) +
  `warehouse_id`/`warehouse_location_id` (read from the existing `storage_allocations` row
  `admin_review_payment()` already created for this `order_item_id`, since that is the authoritative
  record of WHERE the buyer's custody physically sits).

## 3. New columns (additive only — no existing column/constraint/policy removed)

| Table | Column (draft name) | Type | Purpose |
|---|---|---|---|
| `shipment_items` | `reserved_quantity_kg` | `numeric(14,3) NOT NULL DEFAULT 0` | The amount THIS item's delivery-reservation currently holds against the buyer's `inventory_positions` row. `0` until the gated-set entry; set to `planned_quantity_kg` at that moment; reduced by exactly the delivered amount on each `recordDelivery` write; reduced to `0` on cancel/fail. **This is the exact-once release mechanism — see §5.** |
| `order_shipments` | `settlement_verified_at` | `timestamptz, nullable` | Set once, the first time the gated-set entry succeeds, recording WHEN the settlement check passed — an audit/diagnostic field, not itself the guard (the guard re-checks `orders.status` live every time, never trusts a cached flag). |

No `payments`/`orders`/`inventory_reservations` table is touched. No existing `order_shipments`/
`shipment_items` column is altered.

## 4. Eligibility (verified inside the same trigger execution, under row locks)

In lock order matching `checkout_order()`/`admin_review_payment()`'s own established convention
(parent row → offer/position → children):

1. Lock the `order_shipments` row (`FOR UPDATE`, already implicit in the `UPDATE` statement itself).
2. Lock the parent `orders` row (`FOR UPDATE`) and require `orders.status IN ('PAID',
   'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED')` — else `raise exception
   'delivery_reservation_requires_settled_order'`. `DISPUTED` is deliberately excluded from this
   settled-family list even though `admin_review_payment()` treats it as PAID-adjacent for its own
   idempotent-retry check — a disputed order's goods must not begin NEW physical fulfillment
   progression while disputed (spec.md Edge Cases; MKT-07).
3. For each `shipment_items` row on this shipment (already fixed — `shipment_plan_is_closed` locked
   the set at `REQUESTED`): lock the buyer's `inventory_positions` row (`FOR UPDATE`) for that
   item's `lot_id`/`warehouse_id`/`warehouse_location_id` (read from `storage_allocations`).
   - If no such position exists: `raise exception 'delivery_reservation_position_missing'`.
   - If `available_quantity_kg - reserved_quantity_kg < planned_quantity_kg` for that item:
     `raise exception 'delivery_reservation_insufficient_inventory'` — this is the SAME
     `available - reserved` availability arithmetic `checkout_order`/`validate_offer_transition`
     already use; no new arithmetic concept is introduced.
4. Only after every item passes: move quantity for every item (see §5) and update
   `shipment_items.reserved_quantity_kg` + `order_shipments.settlement_verified_at`.

Refusing mid-loop leaves NO partial reservation — the entire gated-set transition happens inside the
same `UPDATE`'s trigger execution, which is already inside the caller's own transaction; a raised
exception rolls back the whole statement, matching every existing trigger's own atomicity.

## 5. Atomicity and the exact-once release mechanism — **this is more than `greatest(x, 0)`**

The run directive's own review correctly warns that `greatest(reserved_quantity_kg - qty, 0)` alone
(the clamp `expire_order_hold()` uses) does not, by itself, prove exact-once release — clamping only
prevents a negative result; it does not prevent a SECOND release call from re-subtracting an amount
that was already subtracted once.

**The actual idempotency mechanism is a stateful guard column, checked under row lock — the same
role `inventory_reservations.status = 'ACTIVE'` plays for `expire_order_hold()`.** Here, that role is
played by `shipment_items.reserved_quantity_kg` itself:

- **Reserve** (gated-set entry): `UPDATE shipment_items SET reserved_quantity_kg = planned_quantity_kg
  WHERE id = ... AND reserved_quantity_kg = 0` — the `WHERE reserved_quantity_kg = 0` clause is the
  guard: a shipment_item that already has a nonzero `reserved_quantity_kg` is not re-reserved (this
  also makes the whole gated-set-entry effect idempotent if a caller somehow re-triggers it — e.g. a
  same-status no-op `UPDATE`, which the trigger's own `new.status <> old.status` top-level condition
  already mostly prevents, but the column guard makes it safe even so).
- **Release** (cancel/fail, or a delivery write): `UPDATE shipment_items SET reserved_quantity_kg =
  greatest(reserved_quantity_kg - v_release_amount, 0) WHERE id = ...` — but the amount released and
  whether a release happens AT ALL is gated by reading the CURRENT `reserved_quantity_kg` under
  `FOR UPDATE` first: if it is already `0`, the release is a genuine no-op (nothing left to release),
  not a second subtraction of the same amount. Because `shipment_items` is locked by the same
  `UPDATE ... WHERE id = ...` that triggers this logic, two concurrent release attempts on the SAME
  row serialize through Postgres's own row lock — the second one, once unblocked, reads the
  ALREADY-zeroed value and releases nothing.
- **Corresponding `inventory_positions` update**: `reserved_quantity_kg` decreases and
  `available_quantity_kg` increases by exactly the amount actually released from the
  `shipment_items` row in the SAME statement (not a separately-computed value) — so the
  `inventory_positions` ledger and the `shipment_items` ledger can never drift apart.

This mirrors the established project pattern exactly: `inventory_reservations.status` is the
guard `expire_order_hold()` checks before decrementing; `shipment_items.reserved_quantity_kg` is the
equivalent guard here, at finer (per-item) granularity because delivery — unlike a checkout hold — can
partially release over multiple deliveries.

### Covers explicitly:

- **Duplicate cancel**: second cancel attempt finds `reserved_quantity_kg = 0` already, releases
  nothing, and (separately) `validate_shipment_transition`'s own terminal-state check
  (`CANCELLED`/`DELIVERED` are already terminal) refuses the second status change outright before
  this logic would even run again.
- **Duplicate fail**: same-status `FAILED → FAILED` is a no-op at the trigger's own top level
  (`new.status <> old.status` is false); a distinct-state-but-already-FAILED scenario cannot arise
  because Postgres re-evaluates `OLD`/`NEW` against the current row under the lock, not a stale
  client read.
- **Repeated transition invocation / retry after ambiguous network result**: the `WHERE
  reserved_quantity_kg = 0` (reserve) / current-value-read-under-lock (release) guards make both
  directions safe to retry blindly.
- **Partial delivery**: see §7 — each delivery write releases exactly the newly-delivered amount,
  never the whole remaining reservation.
- **Cancellation concurrent with another request**: two different shipments' reservations touch
  DIFFERENT `shipment_items` rows but the SAME `inventory_positions` row — the `FOR UPDATE` lock on
  that shared position row (§4 step 3) serializes them, so neither can read a stale
  `available_quantity_kg` — this is the SAME concurrency primitive `checkout_order`'s own
  cross-listing race already relies on (Feature 007's DB-OPEN-16 race test proved this exact pattern
  live for checkout; T013/T028 reproduce the equivalent proof for delivery).

## 6. Cancellation / failure

Warehouse-initiated `cancel`/`fail` (any non-terminal status → `CANCELLED`/`FAILED`) releases the
FULL remaining `reserved_quantity_kg` for every item on that shipment, via the exact mechanism in §5.
Buyer-initiated `DRAFT → CANCELLED` (once Phase 2's small RLS widening lands — DB-OPEN-18) never
reaches this logic at all, since `DRAFT` is outside the gated set — nothing was ever reserved to
release.

## 7. Partial delivery and completion

Each `recordDelivery` write for one `shipment_items` row supplies a NEW absolute
`delivered_quantity_kg` (never a delta — `validate_shipment_item`'s existing monotonicity/over-plan
checks are the authority on whether that value is acceptable). The SAME trigger execution that
accepts the new `delivered_quantity_kg` computes `v_newly_delivered = new.delivered_quantity_kg -
old.delivered_quantity_kg` and releases exactly that amount from `reserved_quantity_kg` via §5's
mechanism (the goods are leaving custody entirely, not returning to "available" — the release target
is `reserved_quantity_kg` decreasing, with NO corresponding `available_quantity_kg` increase, unlike
a cancellation). A fully delivered item (`delivered_quantity_kg = planned_quantity_kg`) therefore
reaches `reserved_quantity_kg = 0` through the ordinary course of delivery recording — "no stranded
reservation after completion" (spec.md SC-008) follows automatically from this mechanism rather than
needing a separate cleanup step.

## 8. Replay / idempotency

Covered structurally by §5's guard-column mechanism — no separate idempotency-key scheme is
introduced, consistent with how `expire_order_hold()`/`admin_review_payment()` achieve idempotency
through state guards rather than client-supplied keys.

## 9. Dispute — **still open, not decided here**

Per RUN 0's own finding (DB-OPEN-09, extended to `order_shipments`), no COMPLIANCE-role actor can
currently set `order_shipments.status = 'DISPUTED'` at all — only `is_warehouse_operator()`/internal
callers can, and the trigger itself has no forward-transition rule FROM `DISPUTED`. This design does
not resolve whether entering `DISPUTED` should:

- **(A)** release the reservation immediately (goods become available again, pending dispute outcome
  — risk: the disputed goods could be resold/re-requested while the dispute is unresolved), or
- **(B)** freeze the reservation in place (goods stay reserved, unavailable, until 012 resolves the
  dispute — risk: goods are locked indefinitely if a dispute stalls).

**Recorded as an explicit open decision for the human approver (T010).** The migration (T007) will
implement whichever the approver selects; absent an explicit choice, the SAFER default recommended
here is **(B) freeze** (do not release on entering `DISPUTED` — a reservation can always be manually
released later by an approved compliance/finance action once 012 exists; an accidentally-resold
disputed lot cannot be undone). This is a recommendation, not a silent decision — the approver may
override it.

## 10. History / audit correlation

No append-only table (`inventory_ownership_events`) is touched — this capability operates entirely on
the existing mutable working-state columns (`inventory_positions.available_quantity_kg`/
`reserved_quantity_kg`, the new `shipment_items.reserved_quantity_kg`). Audit correlation is the
shipment/order id itself (already the correlation point for every other read in this feature) plus
`order_shipments.settlement_verified_at` as a diagnostic timestamp — sufficient for tracing "when did
this shipment's reservation take effect," without inventing a new audit-log table Feature 009 does
not need.

## 11. RLS for the new columns

No new table, so no new RLS policy object — `shipment_items`/`order_shipments`'s EXISTING policies
already cover the new columns (they are ordinary columns on already-RLS-protected tables). The new
columns are written ONLY by the `SECURITY DEFINER` trigger logic itself (never directly by an
`authenticated`-role client write) — verified statically in T009 and live in T012/T013.

## 12. `admin_review_payment()` / `checkout_order()` — no change required

Confirmed (RUN 0 and re-confirmed here, by reading both function bodies in full): neither function
needs modification. This capability is purely additive on `order_shipments`/`shipment_items` trigger
logic and the `inventory_positions` columns both existing functions already read/write — it does not
change settlement, checkout, or payment behavior in any way.

## 13. Approval checklist (for T010)

- [ ] Reserve point confirmed: first entry into `{CAPACITY_CONFIRMED, RESERVED, PICKING, BOOKED,
      DISPATCHED, PARTIALLY_DELIVERED, DELIVERED}` (§0).
- [ ] Settlement-eligibility family confirmed: `PAID`, `FULFILLMENT_IN_PROGRESS`,
      `PARTIALLY_DELIVERED`, `COMPLETED` (§4) — `DISPUTED` deliberately excluded.
- [ ] `DISPUTED` reservation policy: **(A) release** or **(B) freeze (recommended)** — §9.
- [ ] New columns approved: `shipment_items.reserved_quantity_kg`,
      `order_shipments.settlement_verified_at` (§3).
- [ ] Exact-once release mechanism reviewed and accepted (§5).
- [ ] Small buyer-cancel-from-DRAFT RLS widening (DB-OPEN-18) — bundle into this migration: YES / NO.

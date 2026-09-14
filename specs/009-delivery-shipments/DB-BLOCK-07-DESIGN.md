# DB-BLOCK-07 — Authoritative Delivery-Reservation Design (T005)

**Status**: DRAFT — awaiting human Database/security specialist + Business approval (RUN A2's T010
gate). Nothing in this document has been applied to any database.

**Revision history**:
- RUN A1 (2026-09-14): first formalized draft. Corrected RUN 0's own reserve-point recommendation
  (`RESERVED` → first gated-set entry).
- **RUN A2-PRE (2026-09-14): hardened after a human adversarial database/security review found
  multiple CRITICAL/HIGH defects in the A1 draft.** This revision supersedes A1's sections 2–9
  entirely — the inventory arithmetic A1 proposed was wrong in two places serious enough to corrupt
  the inventory ledger in production. See §14 for the full defect list and fixes. **Do not use any
  A1-era reasoning about "available_quantity_kg increases on release" — it was incorrect and has been
  removed.**

---

## 0. Correction from RUN 0 — the reserve point

**RUN 0 recommended**: reserve at the transition into `RESERVED` (or the first of
`RESERVED`/`PICKING`/`BOOKED` reached).

**RUN A1 found this too narrow.** SRS DEL-01 says: *"An approved delivery request atomically
reserves quantity."* "Approved" most naturally maps to `CAPACITY_CONFIRMED` — the live transition
graph's own name for the moment warehouse first approves a request — not the later, optional
`RESERVED` waypoint the graph allows a shipment to skip entirely.

**Final design**: a **gated set** — `{CAPACITY_CONFIRMED, RESERVED, PICKING, BOOKED, DISPATCHED,
PARTIALLY_DELIVERED, DELIVERED}` — plus a state-aware rule for `READY` (§8). Both the
settlement-eligibility check (FR-015) and the reservation effect (FR-016) apply at the **first
transition into gated territory**, one uniform code path regardless of which specific status is
entered first.

## 1. Why this does not conflict with Feature 007's own pre-payment shipment usage

Feature 007 creates its own `order_shipments` row **before payment**, as the checkout precondition:
`assert_order_checkout_ready()` requires a shipment in `READY` **or** `RESERVED` with `ready_at` set
before `checkout_order()` will run. `READY` alone already satisfies it — proven by Feature 007's own
live-tested fixture code (`tests/finance/read.test.ts#markShipmentReadyAsWarehouse`), which sets the
pre-payment shipment directly to `READY`, never `CAPACITY_CONFIRMED`/`RESERVED`. Gating
`CAPACITY_CONFIRMED`/`RESERVED`/onward behind settlement therefore never touches Feature 007's own
closed, tested behavior.

## 2. Inventory semantics — proven from live evidence (RUN A2-PRE Issue 1/2, corrects A1)

**A1's draft was wrong.** It incremented `available_quantity_kg` on cancel/fail release, and never
decremented it on delivery. Both were CRITICAL bugs, found by human review before any apply.

**Proof of the correct semantics** (not assumed — read directly from the live schema/functions):

- The live CHECK constraint `inventory_reserved_within_available_check` is
  `reserved_quantity_kg <= available_quantity_kg`. Reserved is always a SUBSET of `available`, never
  larger — meaning `available_quantity_kg` cannot mean "currently free to reserve" (a "free" figure
  can't have a *reserved* portion structurally bounded beneath it in this way); it must be the
  **gross/on-hand quantity** at the position.
- `checkout_order()`'s own reservation step: `update inventory_positions set reserved_quantity_kg =
  reserved_quantity_kg + v_order_item.quantity_kg` — **only** `reserved_quantity_kg` changes.
  `available_quantity_kg` is untouched.
- `admin_review_payment()`'s title transfer, when quantity fully leaves the SELLER's position:
  `update inventory_positions set available_quantity_kg = available_quantity_kg - v_item.
  reserved_quantity, reserved_quantity_kg = reserved_quantity_kg - v_item.reserved_quantity` — **both**
  columns decrease together, because the goods (and the earmark covering them) leave the position
  entirely.
- The "free to commit" quantity is always the COMPUTED value `available_quantity_kg -
  reserved_quantity_kg`, never a stored column — this is what every eligibility check in the codebase
  (`validate_order_item_offer`, `checkout_order`, `validate_offer_transition`) actually tests.

**Corrected arithmetic** (implemented in the hardened migration):

| Event | `available_quantity_kg` (gross on-hand) | `reserved_quantity_kg` (earmark) |
|---|---|---|
| **Reserve** (gated-set entry) | unchanged | `+= planned_quantity_kg` |
| **Cancel/fail** (goods stay in custody) | **unchanged — never incremented** | `-= released amount` |
| **Partial/full delivery** (goods leave custody entirely) | `-= newly-delivered amount` | `-= newly-delivered amount` |

The delivery row additionally updates `storage_allocations.released_quantity_kg`/`status`
(`RELEASED` while partially delivered, `DELIVERED` once `released_quantity_kg >= quantity_kg`) — this
is **Feature 005's own existing custody ledger**, wired up consistently, not a second/competing
model. `storage_allocations` was already tracking exactly this fact (`released_quantity_kg`) and
Feature 005's presentation layer depends on it staying accurate.

## 3. Reservation identity and quantity source

- **What is reserved**: the REQUESTING organization's (the order's `buyer_organization_id`) OWN
  `inventory_positions` row — created for the buyer by `admin_review_payment()` at settlement —
  never the original seller's position.
- **How much**: `shipment_items.planned_quantity_kg` per item, already stored, never recomputed.
- **Which position**: resolved via `storage_allocations` (the authoritative record of where the
  buyer's custody physically sits, written by `admin_review_payment()`), then matched to
  `inventory_positions` by `(lot_id, owner_organization_id, warehouse_id, warehouse_location_id)` —
  the same tuple `inventory_positions`' own live `UNIQUE` constraint
  (`inventory_positions_lot_id_owner_organization_id_warehouse__key`) covers, so at most one row can
  ever match (no ambiguity guard needed there — see §9).

## 4. New columns and constraints (additive only)

| Table | Column/constraint | Type | Purpose |
|---|---|---|---|
| `shipment_items` | `reserved_quantity_kg` | `numeric(14,3) NOT NULL DEFAULT 0` | The amount THIS item's delivery-reservation currently holds. **Trigger-owned — see §6.** |
| `shipment_items` | `shipment_items_reserved_quantity_kg_check` | `CHECK (reserved_quantity_kg >= 0)` | Declarative floor, cheaper than trusting trigger code alone (RUN A2-PRE Issue 10). |
| `shipment_items` | `shipment_items_reserved_within_planned_check` | `CHECK (reserved_quantity_kg <= planned_quantity_kg)` | Declarative ceiling — mirrors `inventory_reserved_within_available_check`'s own precedent shape. |
| `order_shipments` | `settlement_verified_at` | `timestamptz, nullable` | **Diagnostic only** — records WHEN the gate first passed. The actual authorization ALWAYS re-reads `orders.status` live (§8/§12), never trusts this timestamp as a bypass. **Trigger-owned — see §6.** |

## 5. Eligibility (verified inside the same trigger execution, under row locks)

Lock order matches `checkout_order()`/`admin_review_payment()`'s own convention (parent row →
position):

1. Lock `order_shipments` (implicit in the `UPDATE`).
2. Lock the parent `orders` row (`FOR UPDATE`); `v_settled := status IN ('PAID',
   'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED')` — `DISPUTED` deliberately excluded.
3. For each `shipment_items` row (fixed since `REQUESTED`): resolve the buyer's `storage_allocations`
   row (COUNT-checked for ambiguity — §9), then the matching `inventory_positions` row (`FOR UPDATE`,
   schema-unique).
4. Check `available_quantity_kg - reserved_quantity_kg >= planned_quantity_kg`.
5. Reserve — see §6/§7 for the exact-once mechanism.

Refusing mid-loop rolls back the whole statement (same transaction as the triggering `UPDATE`) — no
partial reservation is possible.

## 6. Column-tamper protection (RUN A2-PRE Issues 3/4 — new in this revision)

**Confirmed live**: `authenticated` holds a **blanket table-level `UPDATE` grant** (no column list) on
both `order_shipments` and `shipment_items`. RLS is row authorization; it is **not** a column
allowlist. Without an explicit guard, a warehouse-role client could include
`settlement_verified_at`/`reserved_quantity_kg` directly in the SAME `UPDATE` payload that also flips
`status`, pre-populating the gate's own bypass condition or directly corrupting the reservation
ledger — RLS alone would not stop this.

**Fix**: both columns are made **fully trigger-owned**, exactly like `new.is_visible := ...` already
overwrites client input in `validate_offer_transition()`. At the very top of each trigger function,
BEFORE any conditional logic reads them:

```
-- validate_shipment_transition(), top of body:
if tg_op = 'UPDATE' then
  new.settlement_verified_at := old.settlement_verified_at;
end if;

-- validate_shipment_item(), top of body:
if tg_op = 'INSERT' then
  new.reserved_quantity_kg := 0;
elsif tg_op = 'UPDATE' then
  new.reserved_quantity_kg := old.reserved_quantity_kg;
end if;
```

No transaction-local marker (à la DB-OPEN-16's `app.checkout_reservation`) is needed — that pattern
existed to distinguish two different TRUSTED callers hitting the same function; here every caller
hits the same function, and the column is simply never client-writable, full stop. The function's
OWN later logic still assigns these columns — that assignment runs strictly after the reset, so the
trigger's own authority is preserved.

## 7. Atomicity and the exact-once mechanism — more than `greatest(x, 0)`

Clamping alone does not prove exact-once release — it only prevents a negative result, not a SECOND
release re-subtracting an amount already subtracted once.

**The actual mechanism is a stateful guard, checked under row lock, exactly like
`inventory_reservations.status = 'ACTIVE'` guards `expire_order_hold()`:**

- **Reserve**: `UPDATE shipment_items SET reserved_quantity_kg = planned_quantity_kg WHERE id = ...
  AND reserved_quantity_kg = 0`, followed by `GET DIAGNOSTICS v_rows = ROW_COUNT`. The
  `inventory_positions` increment runs **only if `v_rows = 1`** — proving the per-item guard
  genuinely flipped unreserved → reserved (RUN A2-PRE Issue 5: the two ledgers cannot diverge, since
  the position is never touched on a guard miss).
- **Release** (cancel/fail or delivery): before subtracting, an explicit invariant is asserted —
  `IF position.reserved_quantity_kg < release_amount THEN RAISE 'delivery_reservation_ledger_
  inconsistent'` — and only then does a plain subtraction occur (RUN A2-PRE Issue 7: no `greatest()`
  is used at all in the release paths; an impossible state is never silently normalized, it fails
  closed).
- **Missing/ambiguous authoritative rows** (RUN A2-PRE Issue 6/9): a missing `storage_allocations` or
  `inventory_positions` row RAISES (`delivery_reservation_position_missing` /
  `delivery_release_position_missing`) rather than silently skipping the inventory update while still
  zeroing the shipment-item guard — that would have permanently drifted the ledgers. `storage_
  allocations` has **no** uniqueness constraint on `(order_item_id, owner_organization_id)` (unlike
  `inventory_positions`, which is schema-guaranteed unique) — every lookup of it is preceded by an
  explicit `COUNT(*)` check, raising `delivery_reservation_position_ambiguous` if more than one row
  matches, rather than silently picking the earliest via `ORDER BY ... LIMIT 1`.

## 8. READY-path rule — state-aware, not a global gate (RUN A2-PRE Issue 8 — new in this revision)

**The concern**: leaving `READY` entirely outside the gated set (A1's original design) preserves
Feature 007's pre-payment flow, but leaves a window: a genuinely POST-settlement delivery request
(buyer already owns the goods) could reach `READY` (skipping `CAPACITY_CONFIRMED`, which the graph
permits) and sit there — warehouse-approved-looking, but with `reserved_quantity_kg` still `0`,
leaving the same custodied quantity fully resellable while an active, approved delivery request
exists. This is exactly the DEL-01 violation DB-BLOCK-07 exists to close.

**Fix**: `READY` is gated **only when the order is already settled at that exact transition**:

```
v_newly_gated :=
  (new.status in (<gated set>) and old.status not in (<gated set>))
  or (new.status = 'READY' and old.status <> 'READY' and v_settled);
```

- Feature 007's pre-payment shipment reaches `READY` while `v_settled` is **false** (the order is
  `CONFIRMED`/`HOLD`, never yet `PAID`) — this clause never fires for it, by construction, not by
  convention.
- A genuinely post-settlement shipment reaching `READY` does so with `v_settled` **true** — the gate
  fires, closing the window.
- A shipment that reached `READY` pre-payment and LATER (once the order is paid) progresses
  `READY → RESERVED`/`BOOKED`/`PICKING` is still caught by the ORIGINAL gated-set clause (those three
  targets are already in the gated set) — no separate handling needed; the design already covered
  this path correctly in A1.

This is a live `orders.status` check, computed fresh every invocation — never a UI convention, never
a cached value.

## 9. Ambiguous authoritative lookups — proven, not assumed (RUN A2-PRE Issue 9)

| Table | Uniqueness | Design response |
|---|---|---|
| `inventory_positions` | **Schema-guaranteed** — live `UNIQUE (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)` constraint (`inventory_positions_lot_id_owner_organization_id_warehouse__key`). | No runtime ambiguity guard needed; `ORDER BY created_at LIMIT 1` (retained for stylistic consistency with `checkout_order`/`admin_review_payment`) can never actually select among more than one row. |
| `storage_allocations` | **Not schema-guaranteed** — no unique/exclusion constraint on `(order_item_id, owner_organization_id)`. `admin_review_payment()` creates exactly one row per order_item under normal (idempotent) operation, but this is enforced by ITS OWN idempotency guard, not the schema. | Every lookup is preceded by an explicit `COUNT(*)` — zero rows raises `..._position_missing`; more than one raises `delivery_reservation_position_ambiguous` (fail-closed, Option C). The preflight (§15) also checks TODAY's data is already free of such duplicates. |

## 10. Cancellation / failure

Warehouse-initiated `cancel`/`fail` releases the FULL remaining `reserved_quantity_kg` for every item
on the shipment, via §7's exact-once mechanism. Buyer-initiated `DRAFT → CANCELLED` (once the DB-OPEN-18
RLS widening lands) never reaches this logic — `DRAFT` is outside the gated set, nothing was ever
reserved.

## 11. Partial delivery and completion

Each `recordDelivery` write supplies a NEW absolute `delivered_quantity_kg`; the trigger computes
`v_newly_delivered = new.delivered_quantity_kg - old.delivered_quantity_kg` and releases exactly that
amount via §7's mechanism, decrementing BOTH `inventory_positions` columns together (§2) and updating
`storage_allocations` in the same statement. A fully delivered item (`delivered_quantity_kg =
planned_quantity_kg`) reaches `reserved_quantity_kg = 0` through the ordinary course of delivery
recording — "no stranded reservation after completion" follows automatically from the mechanism.

## 12. Live settlement re-check on every gated progression (RUN A2-PRE Issue 11 — new in this revision)

**The concern**: `settlement_verified_at` is diagnostic only, but does the SQL actually re-verify live
on every transition that matters, or could a historical successful check plus a LATER `DISPUTED`
order permit continued physical progression merely because the timestamp exists?

**Fix**: for an already-gated shipment (`old.settlement_verified_at IS NOT NULL`) attempting ANY
further status change that is not itself entering `CANCELLED`/`FAILED`, the live `v_settled` value
(freshly computed from a locked `orders` read, same statement) is re-checked, refusing with the same
`delivery_reservation_requires_settled_order` exception if the order has since left the settled
family. This closes the exact gap the review described — a shipment already `RESERVED` cannot
progress to `PICKING` if its order became `DISPUTED` in between, even though
`settlement_verified_at` is still non-null from the original (valid, at-the-time) check.

**Reachability confirmed**: `validate_order_transition` permits `is_platform_admin()` (not only
`is_internal_transition()`) to set `orders.status = 'DISPUTED'` directly — this is a real, live-reachable
path (an ADMIN/SUPER_ADMIN account), not a hypothetical one, making this re-check meaningful rather
than defensive-only.

## 13. Dispute policy — FREEZE (recommended, still requires human sign-off)

Entering `DISPUTED` does **not** release the reservation. Reserved goods stay reserved, unavailable
for resale, until 012 resolves the dispute. This is the SAFER of the two options RUN 0 identified
(vs. releasing on dispute, which risks an accidentally-resold disputed lot) — recorded here as the
proposed default; **the human approver may override it.** No mechanism currently lets a COMPLIANCE
role act on a dispute at all (DB-OPEN-09, confirmed to extend to `order_shipments`) — that gap is
Feature 010/012's to close, not this migration's.

## 14. FAILED/DISPUTED forward-transition bypass analysis (RUN A2-PRE Issue 13 — new in this revision)

**The question**: the baseline trigger has no `elsif` branch limiting a forward transition FROM
`FAILED`/`DISPUTED` (confirmed unchanged by this migration — DB-OPEN-18). Can a direct database
action (not merely a hidden UI button) use this to bypass the NEW reservation/settlement lifecycle?

**Proven: no inventory-ledger bypass exists**, because `FAILED`/`DISPUTED` are themselves OUTSIDE the
gated set. ANY transition FROM either INTO the gated set (e.g. `DISPUTED → DELIVERED` directly) is
itself classified as a "first gated-set entry" by `v_newly_gated`'s own definition (`old.status NOT
IN <gated set>`) — so it reruns the FULL settlement check AND the exact-once reserve guard. Under the
FREEZE policy (§13), a shipment entering `DISPUTED` still holds its reservation
(`reserved_quantity_kg > 0`), so the guard's `WHERE reserved_quantity_kg = 0` correctly finds nothing
to re-reserve and the `inventory_positions` increment is correctly skipped (§7's `GET DIAGNOSTICS`
proof) — no double-reservation, no ledger corruption, regardless of which state the gated-set entry
is reached from.

**Not proven safe, and explicitly out of this migration's scope**: the PROCESS-integrity question —
e.g. `FAILED → DELIVERED` skipping the actual physical `PICKING`/`DISPATCHED` steps. The inventory
arithmetic stays correct either way, but this is a workflow/business-process gap, not a security or
ledger-correctness one. Recorded as a continuity item in `DATABASE-CAPABILITY-MAP.md`'s `DB-OPEN-18`
for Feature 010/012's eventual resolution — inventing dispute/failure recovery semantics here would
exceed DB-BLOCK-07's own scope (delivery reservation + settlement gating, not dispute workflow).

## 15. Required future DB work (Phase 2, T005–T009)

1. This design document (formalized; **still requires human approval** — §18).
2. Read-only preflight — `supabase/maintenance/20260914_feature_009_db_block_07_preflight.sql`
   (RUN A2-PRE strengthened: exact fingerprints, overload counts, policy/grant shape, the
   `inventory_reserved_within_available_check`/uniqueness-constraint proofs above, pre-existing
   ambiguous-`storage_allocations` and ledger-health checks, blanket-grant proofs justifying the
   trigger-owned-column design).
3. Migration — `supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.sql`
   (RUN A2-PRE hardened per §2–§14 above).
4. Rollback — `supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.rollback.sql`
   (RUN A2-PRE hardened — see §16 for the schema-vs-business-data distinction it now enforces).
5. Static migration tests — `tests/delivery/db-block-07-migration.test.ts` (41 tests, passing,
   rewritten for the hardened artifacts).
6. **Manual human review + explicit approval (T010)** — not self-approved by this run.
7. Live apply (T011).
8. Live postflight — `supabase/maintenance/20260914_feature_009_db_block_07_postflight.sql` (NEW,
   RUN A2-PRE — fingerprints, column/constraint existence, exact RLS policy text, grant-non-broadening
   proofs; explicitly documents which remaining behaviors require a seeded live-fixture test rather
   than a read-only query — see the file's own §3).
9. Concurrency / exact-once reserve-release tests (T013) — see §17 for the required scenario list.

## 16. Rollback safety — schema rollback ≠ business data reversal (RUN A2-PRE Issue 16)

Dropping the two new columns is mechanically safe **only before any real reservation/release effect
has occurred**. It cannot, and does not attempt to, reverse the `inventory_positions`/
`storage_allocations` effects the migration's trigger logic already applied to live rows while
active — those live in EXISTING columns the rollback never touches. The rollback script's own guard
therefore **refuses to run** (`raise exception`, not merely a warning) if it finds any
`shipment_items.reserved_quantity_kg > 0` row or any `order_shipments.settlement_verified_at IS NOT
NULL` row — this is DB-enforced, not just a comment. If real reservation history exists and a
rollback is still required, it needs a separately authored, reviewed, COMPENSATING migration that
reasons about the specific affected rows — never this mechanical script.

## 17. Concurrency / lock order

Canonical lock order for this capability: `order_shipments` (implicit, via the triggering `UPDATE`)
→ `orders` (`FOR UPDATE`) → `storage_allocations` (read, COUNT-checked) → `inventory_positions`
(`FOR UPDATE`) → `shipment_items` (via its own guarded `UPDATE`). This is `orders`-before-`position`,
the SAME relative order `checkout_order()`/`admin_review_payment()`/`expire_order_hold()` already
establish — no lock-order inversion.

**No realistic collision with `checkout_order()`**: `checkout_order()` requires `orders.status =
'CONFIRMED'` (via `assert_order_checkout_ready`); this migration's reservation logic requires
`orders.status` already in the settled family (`PAID` or later). These are mutually exclusive
timewise — an order cannot be simultaneously `CONFIRMED` and `PAID`-or-later, so the two functions
never race on the SAME order's gated logic.

**Collision with `admin_review_payment()`**: distinct table sets locked in the same relative order
(`orders` before `inventory_positions` in both) — no inversion.

**Two concurrent delivery-domain writers on the SAME shipment** (e.g. a concurrent cancel via
`order_shipments` and a delivery-recording via `shipment_items`): both ultimately touch the same
`shipment_items` row; ordinary Postgres row-level locking on that row serializes them — the second
writer's own `WHERE reserved_quantity_kg = <expected>` guard correctly detects the already-mutated
state, achieving safety through ordinary MVCC, no special handling required.

**Required future live tests** (T013/T028, concurrency/exact-once suite):
- delivery-reserve vs. delivery-reserve, same inventory position (two shipments competing for the
  same buyer-owned quantity).
- delivery-reserve vs. listing/resale (Feature 006) consuming the same position's `available -
  reserved`.
- cancel vs. a new delivery-reserve attempt racing on the same position.
- partial delivery vs. a concurrent cancel/fail on the same shipment.
- duplicate cancel; duplicate fail; retry after an ambiguous client/network result.
- an order becoming `DISPUTED` concurrently with an in-flight gated-progression attempt (§12's live
  re-check).

## 18. Approval checklist (for T010 — updated for RUN A2-PRE)

- [ ] Reserve point confirmed: first entry into `{CAPACITY_CONFIRMED, RESERVED, PICKING, BOOKED,
      DISPATCHED, PARTIALLY_DELIVERED, DELIVERED}`, PLUS `READY` when the order is already settled
      (§0/§8).
- [ ] Inventory arithmetic confirmed correct: reserve/cancel never touch `available_quantity_kg`;
      delivery decrements BOTH columns together (§2) — this is the corrected version; the original
      A1 draft's arithmetic must NOT be revived.
- [ ] Settlement-eligibility family confirmed: `PAID`, `FULFILLMENT_IN_PROGRESS`,
      `PARTIALLY_DELIVERED`, `COMPLETED` — `DISPUTED` deliberately excluded (§5/§12).
- [ ] `DISPUTED` reservation policy: **(A) release** or **(B) freeze (recommended)** — §13.
- [ ] Column-tamper protection (trigger-owned `settlement_verified_at`/`reserved_quantity_kg`)
      reviewed and accepted (§6).
- [ ] Exact-once release mechanism (guard-column, not `greatest()` alone) reviewed and accepted (§7).
- [ ] READY-path state-aware rule reviewed and accepted (§8).
- [ ] Ambiguity fail-closed behavior for `storage_allocations` reviewed and accepted (§9).
- [ ] Live re-check on further gated progression (§12) reviewed and accepted.
- [ ] FAILED/DISPUTED bypass analysis (§14) reviewed — inventory-ledger safety accepted; the
      separate process-integrity gap explicitly deferred to Feature 010/012, not resolved here.
- [ ] Rollback's real-usage guard (§16) reviewed and accepted.
- [ ] New columns/constraints approved: `shipment_items.reserved_quantity_kg` (+2 CHECK constraints),
      `order_shipments.settlement_verified_at` (§4).
- [ ] Small buyer-cancel-from-DRAFT RLS widening (DB-OPEN-18) — bundle into this migration: YES / NO.

## 19. RUN A2-PRE2 final pre-apply consistency correction (2026-09-14)

**This section supersedes the earlier RUN A2-PRE descriptions in §§6, 7, 14 and 17 where they
conflict. Nothing remains approved or applied.** The authoritative schema evidence confirms that
`trg_shipment_transition` is enabled `BEFORE UPDATE` only, while the buyer has an authenticated
`shipments_buyer_insert` policy for `DRAFT` rows. The forward draft therefore deliberately recreates
that one binding as enabled `BEFORE INSERT OR UPDATE`: INSERT force-writes
`settlement_verified_at = NULL` and rejects non-DRAFT creation, so a permitted insert cannot pre-seed
the diagnostic gate or bypass later reservation.

### Internal child mutation and exact coupling

`validate_shipment_item()` owns ordinary client writes to `reserved_quantity_kg` and resets them to
the old value. `validate_shipment_transition()` cannot rely on a child `UPDATE` plus its row count:
that statement can count a row even if the child trigger rewrites the value. The final draft uses the
established transaction-local marker pattern, `app.delivery_reservation_mutation`. Only the SECURITY
DEFINER parent trigger sets it, immediately around a guarded child update; the child trigger rejects
any simultaneous shipment/order/planned/delivered business-field change. The marker is immediately
reset to false. Normal client DML never gets this exemption.

For **reserve** and **cancel/fail release**, the sequence is: lock child item; resolve and lock the
single position; prove the child `WHERE` guard changed exactly one row; then mutate the position by
the exact same amount. A zero/multiple/inconsistent state raises and rolls back the entire triggering
statement. No position change precedes proof of the child state transition, and no clamp is used.

### Canonical lock protocol and re-entry

The real lock order is: implicit `order_shipments` row lock from its triggering update →
`shipment_items` in ascending id → locked `orders` row → one `inventory_positions` row. Direct
delivery already acquires its item lock, then locks the same order and position, so its common suffix
is `shipment_items → orders → inventory_positions`. Cancel vs delivery serializes on the item;
reserve vs reserve and cancel vs reserve serialize on the position; delivery vs resale/listing
serializes on the position without a reverse item lock. T013/T028 must
still live-test cancel/fail vs recordDelivery, reserve vs reserve, cancel vs new reserve, and delivery
vs resale/listing.

Before a fresh gate attempts availability, the draft locks every child and classifies the full set as
either all-unreserved or all-reserved-at-exact-remaining-quantity. Mixed or unexpected values fail
closed. An already-reserved/frozen shipment (including a settled `READY` re-entry) performs no fresh
availability check or reservation.

### Existing rows and failure/dispute safety

This is a **mandatory zero-row no-backfill policy**, not informational reporting. Preflight and the
transaction guard separately require zero settled READY rows, settled gated-set rows, unsettled READY
rows, unsettled gated-set rows, and remaining child items in those states. Any result requires a
separate reviewed reconciliation/backfill before this draft can apply.

`DISPUTED = FREEZE` remains a recommendation awaiting human sign-off. `FAILED` and `DISPUTED` are
both fail-closed against forward operational re-entry with
`delivery_recovery_requires_dedicated_workflow`; this prevents a partial-delivery failure from ever
re-reserving its original planned quantity. A future approved recovery workflow must prove remaining
quantity and custody invariants before widening that rule.

### Binding and live-proof requirements

The read-only preflight now proves names, tables, timing/events, bound functions and enabled state for
both relevant triggers. The postflight proves the new INSERT+UPDATE transition binding. Static tests
cannot prove stored values or concurrency. Before product code depends on DB-BLOCK-07, seeded live
tests must prove client INSERT/UPDATE tampering is absent from stored values; child and position values
change together on reserve/release; all races above; no-backfill data-gate behaviour; and FAILED/
DISPUTED re-entry rejection.

## 20. RUN A2-PRE3 — the settlement-to-READY reservation gap, and its fix (2026-09-14)

A live read-only data check against the actual Supabase project (via the RUN A2 preflight step)
found two real rows: `order_shipments.status = 'READY'` with `orders.status` NOT yet settled — the
ordinary Feature 007 pre-payment `REQUESTED → READY` path
(`tests/finance/read.test.ts#markShipmentReadyAsWarehouse`), not corruption. A human review then asked
the pointed question §8's "state-aware READY gate" had not actually answered: what happens when that
order **later** settles while the shipment is **still** READY? No `order_shipments` UPDATE occurs at
settlement time, so `validate_shipment_transition()` never fires, so nothing reserves the shipment. The
gated set only closes the window for a transition happening *while already settled*; it left a second,
real window open — settlement happening *after* an unsettled shipment reached READY.

### The fix: one shared reservation primitive, called from two authorities

`apply_delivery_reservation(p_shipment_item_id, p_order_item_id, p_lot_id, p_buyer_organization_id,
p_planned_quantity_kg)` is a new internal-only function (no `authenticated`/`anon`/`PUBLIC` EXECUTE —
enforced by an explicit `REVOKE`, so a client cannot call it directly and bypass every state-machine/
ownership check) extracted verbatim from §7's original inline reserve loop: resolve and lock the
buyer's `storage_allocations`/`inventory_positions` row, prove sufficient free quantity, perform the
exact-once guarded child `UPDATE` under the `app.delivery_reservation_mutation` marker, and only then
increment `inventory_positions.reserved_quantity_kg` after `GET DIAGNOSTICS` proves the guard fired.
The caller must already hold the target `shipment_items` row locked with `reserved_quantity_kg = 0`.

It is called from exactly two places, never duplicated:

1. `validate_shipment_transition()`'s own reserve loop — unchanged trigger point, now delegating its
   arithmetic instead of inlining it.
2. `reserve_ready_deliveries_for_settlement(p_order_id, p_buyer_organization_id)` (new, also internal-
   only) — locks every `READY`, not-yet-`settlement_verified_at` shipment for the order in ascending
   `id` order, then its items in ascending `id` order, calls the shared primitive per item, and stamps
   `settlement_verified_at` on the shipment under a second trusted transaction-local marker,
   `app.delivery_settlement_mutation`.

`validate_shipment_transition()`'s tamper-protection reset for `settlement_verified_at` now has exactly
one exception: under `app.delivery_settlement_mutation`, the UPDATE may change `settlement_verified_at`
alone — `status` and every locked detail column (`delivery_method`, `country_code`, `city`,
`address_line`, `contact_name`, `contact_phone`, `shipping_fee`) must stay byte-identical, checked
explicitly and raising `delivery_reservation_ledger_inconsistent` otherwise. `validate_shipment_item()`
needed **no edit** — its existing settlement-gate read (`settlement_verified_at is null or
orders.status not in (settled family)`) already becomes correct the instant the new hook stamps the
column; its fingerprint is unchanged this run.

### Integration point: `admin_review_payment()`

The call site is `perform public.reserve_ready_deliveries_for_settlement(v_order.id,
v_order.buyer_organization_id);`, inserted immediately after the existing per-`order_item` loop (which
already creates the buyer's `storage_allocations`/`inventory_positions` custody rows — the shared
primitive cannot resolve a position that doesn't exist yet) and before the reservation is marked
`CONSUMED` / the payment `CONFIRMED` / the order moved to `PAID`. This is the **only** line changed in
`admin_review_payment()`; every other statement is byte-for-byte its pre-migration baseline, proven by
the migration's own fingerprint guard and `tests/delivery/db-block-07-migration.test.ts`.

### Settlement failure semantics — fail closed, whole-transaction rollback

If `reserve_ready_deliveries_for_settlement(...)` raises for any reason (insufficient inventory, a
missing/ambiguous allocation or position, a ledger inconsistency), the exception is **not caught**
anywhere in `admin_review_payment()` — it propagates out of the `perform` statement and aborts the
entire enclosing transaction. Nothing is confirmed: the payment stays whatever it was, the reservation
stays `ACTIVE`, the order stays in its pre-review status. A settled order can never end up with an
unreserved approved-READY delivery sitting silently unprotected — the alternative (catching the
exception and settling anyway) would recreate exactly the gap this run closes, just moved one step
later.

### Multiple shipments, and why settlement cannot over-reserve

An order can already have more than one shipment for the same or different `order_items` —
`validate_shipment_item()`'s pre-existing `v_other_planned` cross-shipment sum already bounds total
planned quantity per `order_item` to the ordered quantity, across every non-`CANCELLED`/`FAILED`
shipment. `reserve_ready_deliveries_for_settlement(...)` processes every qualifying `READY` shipment in
ascending `id` order and, within each, every item in ascending `id` order, calling the shared primitive
per item. Because the primitive re-reads the live, row-locked `inventory_positions` availability on
*every* call, a second `READY` shipment drawing on the same position sees the first shipment's
already-applied reservation and is refused
(`delivery_reservation_insufficient_inventory`) if the position cannot cover both. No shipment is ever
processed out of the deterministic order, and no partial reservation is left behind (the whole
settlement rolls back on any failure, per the previous section).

### Lock order — a genuine, documented, non-corrupting inversion

Shipment-transition path (unchanged): `order_shipments` (implicit, from the triggering UPDATE) →
`shipment_items` (ascending id) → `orders` → `inventory_positions`.

Settlement path (new): `payments` → `orders` (both already first in `admin_review_payment()`, for
reasons entirely unrelated to delivery — payment idempotency) → `coffee_offers`/`inventory_positions`
(seller title transfer, unrelated, unchanged) → `order_shipments` (ascending id) → `shipment_items`
(ascending id) → `inventory_positions` (via the shared primitive).

These two paths lock `{orders, order_shipments}` in **opposite** relative order. This cannot be
resolved by reordering either path's own locks: the row a triggering `UPDATE` targets is always locked
by PostgreSQL *before* its `BEFORE ROW` trigger body runs (no trigger-body reordering changes that),
and reordering `admin_review_payment()`'s own already-relied-upon payment-first lock sequence is out of
this migration's scope and unrelated to delivery. Concretely: if a warehouse operator's shipment-status
`UPDATE` and a finance operator's `admin_review_payment()` run concurrently on the **same** order, each
holding the lock the other now needs, PostgreSQL's own deadlock detector finds the cycle and aborts
**one** of the two transactions with a clean, retryable `deadlock_detected` error (SQLSTATE `40P01`).
This is not a silent-corruption risk — no partial write occurs on either side, and a retry succeeds
cleanly. It is documented here, and required as a live test (T013/T028: deliberately provoke this exact
collision; assert exactly one side aborts with `40P01`, no partial write on either side, and a retry
succeeds), rather than eliminated, because eliminating it would require restructuring
`admin_review_payment()`'s own existing, unrelated, already-relied-upon lock order.

### Feature 008 integration point (documented now, not built)

Feature 008 (Stripe) does not exist yet and is not touched by this migration. When it is built, its
settlement-confirmation path (whatever function eventually plays the equivalent role to
`admin_review_payment()`'s payment-approval step) **must** call the same
`reserve_ready_deliveries_for_settlement(p_order_id, p_buyer_organization_id)` after it has established
the buyer's `storage_allocations`/`inventory_positions` custody, in the same transaction as its own
order-settlement write — exactly the pattern `admin_review_payment()` uses. It must **not**
re-implement reservation arithmetic, and it must **not** invent a second settlement-authority concept.
This is the one seam both the current manual-review path and the future approved Stripe path share; a
future Feature 008 implementer should treat this section as the integration contract.

### Revised existing-row policy (supersedes §19's blanket "READY = zero")

§19 required zero rows for settled READY, settled gated-set, unsettled READY, and unsettled gated-set,
uniformly. That blanket unsettled-READY-must-be-zero requirement is now understood to be **wrong** —
Feature 007's own supported, live-tested, pre-payment lifecycle produces exactly this shape, and this
run's own settlement-time hook makes it safe by construction. The corrected, narrower policy (now
implemented in the migration's own DDL guard and in the preflight's mandatory summary):

- **Settled READY** (status `READY`, order already in the settled family): **mandatory zero**. A
  pre-migration database has no way to have reserved this row, by definition — there is no column yet.
- **Any operational gated-set row** (`CAPACITY_CONFIRMED`/`RESERVED`/`PICKING`/`BOOKED`/`DISPATCHED`/
  `PARTIALLY_DELIVERED`), **regardless of settlement**: **mandatory zero**. These states imply physical
  progression the pre-migration database could not have gated correctly either way.
- **Unsettled READY**: **permitted, not a stop condition**. `reserve_ready_deliveries_for_settlement`
  guarantees it becomes authoritative automatically, atomically, the moment its order settles. Reported
  for reviewer visibility, `ok = true` unconditionally.
- **Remaining shipment items requiring reconciliation**: **mandatory zero**, redefined to mean items
  belonging to a settled-READY or operational-gated-set shipment (the two dangerous categories above).
  Items belonging to a legitimate unsettled-READY shipment are explicitly excluded — they are not a
  backfill problem, because no reservation was ever supposed to exist for them yet.

### Disposition of the two live rows found during the RUN A2 preflight

`SHP-342E82636729` (order `ORD-20260914-0001199`) and `SHP-A00232A0C688` (order `ORD-20260914-0001198`)
are both ordinary unsettled-READY rows under the corrected policy above — no destructive cleanup, no
manual reconciliation, no backfill migration required. They will each be reserved automatically,
atomically, and audited (via `inventory_ownership_events`/the exact-once ledger coupling) the moment a
finance operator approves payment for their respective orders, through
`reserve_ready_deliveries_for_settlement(...)` inside `admin_review_payment()`. Nothing about them
blocks this migration.

### SQL-Editor-only bugs found and fixed (not previously caught by static tests)

A run of the preflight file in the real Supabase SQL Editor (not merely statically reviewed) found two
genuine execution failures neither the static test suite nor a text-pattern review had caught, because
both require an actual PostgreSQL parser/planner, not just string matching against the file's own text:

- **UNION column-count mismatch** (section 2, `policy` vs `table_privilege` branches): the first branch
  returned 7 columns, the second only 6. PostgreSQL rejects a `UNION`/`UNION ALL` whose branches have
  different column counts at parse time — this is a `SELECT`-shape error a `readFileSync`-based test
  asserting substring presence can never catch, because the file's *text* was self-consistent; only its
  *executed shape* was wrong. Fixed by adding the missing `null` to the shorter branch (now 7 columns
  in both), and a new `function_privilege` branch (also matched to 7 columns) was added at the same
  time for the two new internal helper functions' grant visibility.
- **Implicit `"char"` concatenation** (`pg_trigger.tgenabled`, PostgreSQL's internal 1-byte enum type
  for trigger-enabled state): `pg_get_triggerdef(t.oid) || '; enabled=' || t.tgenabled` has no implicit
  cast from `"char"` to `text` for `||` — PostgreSQL raises `operator does not exist: text || "char"`.
  This is invisible to a static grep for the string `tgenabled` because the *comparison* form
  (`t.tgenabled = 'O'`) is fine (PostgreSQL resolves an unknown-type literal against `"char"`
  automatically); only the *concatenation* form fails, and only at actual execution. Fixed everywhere
  it occurred (preflight and postflight, 2 occurrences each) by adding an explicit `::text` cast —
  exactly the convention Feature 007's own preflight (`20260913_feature_007_db_blockers_preflight.sql`)
  already used for the identical situation, confirmed by grepping that file.

Both classes are now covered by new static regression tests in
`tests/delivery/db-block-07-migration.test.ts` (UNION arities balanced per statement; every `tgenabled`
reference that is concatenated, not merely compared, carries an explicit `::text` cast) — this narrows,
but does not eliminate, the gap between "the file's text passes a Vitest suite" and "the file actually
executes on a real PostgreSQL server"; the RUN A2 preflight step (an actual SQL Editor execution)
remains the only true proof, and is still required before T010.

## 21. RUN A2-PRE3 fingerprints and file map

| Function | Baseline (pre-migration) | Migrated (this file) | Changed this run? |
|---|---|---|---|
| `validate_shipment_transition` | `93102472a7bdcdce52f645c1edb07a25` | `27148260ac07d2d5e7f2e3e61c2d21aa` | Yes — trusted settlement marker, reserve loop now calls the shared primitive |
| `validate_shipment_item` | `ab0d35de1718d58d46f8c71cbbf95b4f` | `3ec3db2cd692958b2ad6d9ec5d15eb88` | No — unchanged since RUN A2-PRE2, no edit needed |
| `admin_review_payment` | `f94544de4180eaba90725a02c1677fb6` | `6c4141a33ac07b564a8f3b0c82a10232` | Yes — exactly one new statement added |
| `apply_delivery_reservation` | (did not exist) | `4aa0a7c7dd8e39bc12a1d36b63dc21cc` | New — internal-only, no client EXECUTE |
| `reserve_ready_deliveries_for_settlement` | (did not exist) | `12226e365e405185845fc4561b87db85` | New — internal-only, no client EXECUTE |

Human decisions still open, unchanged from §19 — not self-approved here: `DISPUTED = FREEZE` (a
recommendation); buyer `DRAFT → CANCELLED` RLS widening bundled into this same migration (a
recommendation). T005–T010 remain unchecked; no SQL has been applied anywhere.

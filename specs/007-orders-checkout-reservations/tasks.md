# Tasks: Orders, Checkout & Reservations (007)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §6/§8/§11 (BUY-02, MKT-03, MKT-04, TXN-01), AC-02/AC-03.

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001, 003, 004, 005, 006 implemented.

> **Standing rule for every task in this feature**: the application never creates reservations,
> computes commercial totals, issues proformas, sets holds, or transfers title. `checkout_order()`
> and `expire_order_hold()` own those effects. Any task that appears to require otherwise is a
> BLOCKER to raise, not a workaround to build.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Order domain layer & error mapping

- [ ] T001 Create `lib/orders/validation.ts` + order DTO types (draft, item, financial summary,
  proforma, status history).
  - Req: FR-015, FR-018 | Depends: —
  - Verify: no DTO exposes a computed total; financial fields map 1:1 to `order_financials` columns
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing/schema work.

- [ ] T002 Implement `lib/orders/errors.ts` — an explicit map from the database function's raised
  exceptions (`order_not_found`, `forbidden`, `buyer_not_authorized`, `active_reservation_missing`,
  `reservation_expired`, availability failures) to safe, specific application errors.
  - Req: FR-015, SEC-004, SC-007 | Depends: —
  - Verify: every known raised string has a mapping; an unmapped error falls back to a generic safe message and is logged without payload
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the boundary that prevents internal database semantics leaking to buyers while keeping messages actionable.

- [ ] T003 Implement `lib/orders/read.ts` — `can_view_order`-scoped reads for orders, items,
  financials, proforma (+items), status history and shipment plan.
  - Req: FR-010, FR-011 | Depends: T001
  - Verify: a cross-organization order id returns nothing; financial values are passed through unmodified
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: read scoping is security-relevant and the pass-through rule must hold.

---

## Phase 2 — Draft orders

- [ ] T004 [PS1] Implement `lib/orders/drafts.ts` + `src/app/dashboard/orders/actions.ts` — create a
  `DRAFT` order and add/remove items, respecting the RLS policies and the
  `validate_order_item_offer` trigger.
  - Req: FR-004, FR-005, FR-016 | Depends: T001, T002
  - Verify: `organization_can_buy = false` fixture is refused; adding a non-published listing is refused by the trigger and surfaced as a safe error
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the first write path into the commercial ledger; capability and trigger cooperation must be exactly right.

- [ ] T005 [PS1] Build the draft-order UI (`components/orders/draft-editor.tsx` + order pages)
  showing item snapshots, quantities and advisory availability from 006.
  - Req: FR-006, FR-018, PS1 | Depends: T004
  - Verify: quantities/prices display with unit and currency; the UI passes no quantity/price into the checkout action
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard UI work with one strict data-flow constraint.

- [ ] T006 [PS1] Enforce edit-only-while-`DRAFT` in both UI and action paths.
  - Req: FR-004 | Depends: T004
  - Verify: editing an order in `HOLD` is refused server-side even when invoked directly
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: a stale-tab edit after checkout would corrupt a live reservation's basis.

---

## Phase 3 — Buyer shipment planning (narrow slice)

- [ ] T007 [P] Implement buyer shipment planning (`orders/[orderId]/shipment/actions.ts`):
  `order_shipments` INSERT as `DRAFT`, UPDATE to `REQUESTED`, and `shipment_items` while `DRAFT`.
  - Req: FR-013 | Depends: T004
  - Verify: any attempt to set a state beyond `REQUESTED` is refused (RLS/trigger); `shipment_items` edits after DRAFT are refused
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the buyer/warehouse boundary must not be crossed accidentally.

---

## Phase 4 — Checkout execution (the transactional core)

- [ ] T008 [PS2] Implement `lib/orders/checkout.ts#executeCheckout(orderId)` — the **only** caller of
  `checkout_order()`. Verify identity/capability/order ownership first, generate and persist a
  server-side idempotency key, call the function, map errors via T002, return its values verbatim.
  - Req: FR-001, FR-002, FR-003, SEC-001, SEC-002, SEC-005, SC-001 | Depends: T002, T004
  - Verify: `grep -rn "checkout_order" src lib` matches only this file; the function's returned values are used unmodified; no total/reservation/proforma is created in application code
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the single highest-blast-radius function in the entire platform — overselling, duplicate reservations and financial divergence all live or die here.

- [ ] T009 [PS2] Implement the checkout Server Action + review page
  (`orders/[orderId]/checkout/`) calling `executeCheckout` exactly once per submission, with
  double-submit protection in the UI as a convenience (never as the guarantee).
  - Req: FR-001, FR-003, PS2 | Depends: T008
  - Verify: a double submit results in one reservation (function idempotent-retry path observed in the return value)
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the UI must not become the idempotency mechanism; the database's guarantee must be the one being exercised.

- [ ] T010 [PS2] Present the checkout outcome: `HOLD` status, `hold_expires_at` countdown, proforma
  reference, buyer total — all read from the database, never recomputed.
  - Req: FR-002, FR-007, FR-010 | Depends: T008, T003
  - Verify: the countdown derives from `orders.hold_expires_at`; totals match `order_financials` exactly
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: presentation is where a "helpful" recomputation would silently diverge from the snapshot.

- [ ] T011 [PS2] Map and present the availability-failure path with a specific, safe message and a
  route back to the listing.
  - Req: FR-006, FR-015 | Depends: T002, T008
  - Verify: forcing an availability failure yields a specific message with no raw database text
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: this is the most common real-world checkout failure; clarity here prevents duplicate attempts.

---

## Phase 5 — Hold expiry

- [ ] T012 [PS4] Implement `lib/orders/expiry.ts#ensureHoldFresh(orderId)` — the **only** caller of
  `expire_order_hold()`, invoked on order read paths and before any payment action.
  - Req: FR-008, FR-009, PS4 | Depends: T003
  - Verify: `grep -rn "expire_order_hold" src lib` matches only this file; calling it twice releases quantity once
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: double-release would corrupt inventory; single-call discipline plus idempotence is the guard.

- [ ] T013 [PS4] Present expired-hold state with the reason and a route to start again if still
  eligible; refuse payment actions against an expired hold.
  - Req: FR-017, PS4 | Depends: T012
  - Verify: an expired hold shows the explicit state; a payment-proof attempt against it is refused server-side
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the refusal must be server-side, not merely a hidden button.

- [ ] T014 [PS4] Document the lazy-expiry limitation in code and in the feature's Open items: an
  unvisited stale hold may persist until touched; no scheduler is approved.
  - Req: spec Open items | Depends: T012
  - Verify: a code comment and the spec both state the limitation; no scheduler/infrastructure was silently added
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honestly recording a known gap rather than papering over it is a judgment call with continuity value.

---

## Phase 6 — Order views

- [ ] T015 [PS6] Implement `src/app/dashboard/orders/page.tsx` — buyer order list with approved
  status labels and key figures.
  - Req: FR-011, FR-014, PS6 | Depends: T003
  - Verify: all twelve `orders.status` values render their exact labels; only own-organization orders appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: list page over a scoped read layer with a closed vocabulary.

- [ ] T016 [PS6] Implement `src/app/dashboard/orders/[orderId]/page.tsx` — items, financial snapshot,
  proforma, shipment plan, status history, hold countdown where applicable.
  - Req: FR-010, FR-014, PS6 | Depends: T003, T010, T012
  - Verify: financials match snapshots; history renders transitions with reason/timestamp; `ensureHoldFresh` runs on load
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the buyer's single source of order truth; several data sources must agree.

- [ ] T017 [P] Build `components/orders/hold-countdown.tsx` and `financial-summary.tsx` with
  unit/currency discipline and monospace order/proforma codes.
  - Req: FR-018 | Depends: T001
  - Verify: `HC-2026-0418`-style codes render monospaced; all money shows currency
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: focused presentational components.

---

## Phase 7 — Module registration

- [ ] T018 Register the `orders` nav entry and the "what did I buy" / "what do I owe" overview cards
  with 004's contract.
  - Req: FR-016 | Depends: T015
  - Verify: entries appear for buy-capable organizations; summary queries are bounded
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: contract-conformant registration.

---

## Phase 8 — Release-blocking transactional tests

- [ ] T019 [PS3] Write `tests/orders/concurrency.test.ts` (AC-02): two simultaneous checkouts against
  insufficient quantity — exactly one succeeds; the loser leaves no reservation, proforma, payment or
  financial row; totals remain consistent.
  - Req: SC-002, PS3 | Depends: T008
  - Verify: `npm test -- orders/concurrency` passes repeatedly (run it multiple times to catch flakiness)
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the platform's release-blocking double-sell protection; concurrency tests demand careful construction to be meaningful rather than accidentally serialised.

- [ ] T020 [PS2] Write `tests/orders/idempotency.test.ts`: duplicate submission and post-failure retry
  produce exactly one reservation, proforma and payment.
  - Req: FR-003, SC-003 | Depends: T008, T009
  - Verify: `npm test -- orders/idempotency` passes; the second call reports the function's retry path
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: BUY-02 retry-safety is release-blocking and subtle.

- [ ] T021 [PS4] Write `tests/orders/expiry.test.ts`: expiry releases exactly once even when invoked
  twice concurrently.
  - Req: FR-009, SC-004 | Depends: T012
  - Verify: `npm test -- orders/expiry` passes; reserved quantity decreases by exactly the reserved amount
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: double-release is a silent inventory corruption with no obvious symptom.

- [ ] T022 Write `tests/orders/mirror-consistency.test.ts`: after checkout,
  `coffee_offers.reserved_quantity_kg` mirrors `inventory_positions.reserved_quantity_kg` exactly.
  - Req: SC-005 | Depends: T008
  - Verify: `npm test -- orders/mirror-consistency` passes with zero drift
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the offer/inventory mirror is an audited invariant; drift would break the marketplace's availability truth.

- [ ] T023 Write `tests/orders/no-title-transfer.test.ts`: checkout produces zero
  `inventory_ownership_events` (MKT-04 / AC-03).
  - Req: SC-008 | Depends: T008
  - Verify: `npm test -- orders/no-title-transfer` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: guards the settlement-before-title rule at the code boundary, where a future "helpful" change could break it.

- [ ] T024 [P] Write `tests/orders/authorization.test.ts`: another organization's order id is refused
  before and by the function; suspended organization refused; `can_view_order` scoping holds.
  - Req: SEC-001, SEC-002, SC-006 | Depends: T008, T003
  - Verify: `npm test -- orders/authorization` passes for all cases
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: cross-tenant commercial access is the most severe failure class here.

- [ ] T025 [P] Write `tests/orders/error-mapping.test.ts`: each database exception maps to a safe,
  specific message; no raw text escapes.
  - Req: SEC-004, SC-007 | Depends: T002
  - Verify: `npm test -- orders/error-mapping` passes; no test observes `forbidden`/`reservation_expired` verbatim in client output
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: information-disclosure boundary with many cases.

---

## Phase 9 — States, accessibility, responsive, RTL

- [ ] T026 State coverage: loading, empty, error, unauthorized, suspended, reserved, expired,
  partial-fill, unavailable across order and checkout screens.
  - Req: FR-017 | Depends: Phases 4–6
  - Verify: each state renders for a seeded fixture
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.

- [ ] T027 Accessibility, RTL and mobile pass (countdown announced accessibly, tables → cards,
  logical properties, externalised copy).
  - Req: FR-018 | Depends: Phases 4–6
  - Verify: a11y check clean; the countdown is exposed to assistive technology without spamming updates; grep for physical properties returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: a live countdown is a known accessibility hazard (over-announcement) needing judgment.

---

## Phase 10 — Verification & closure

- [ ] T028 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T029 Confirm single-caller discipline for both database functions and zero application-side
  transactional logic.
  - Req: FR-001, FR-008, SC-001 | Depends: T028
  - Verify: `grep -rn "checkout_order\|expire_order_hold" src lib` matches only `lib/orders/checkout.ts` and `lib/orders/expiry.ts`; no reservation/proforma/total insert exists in application code
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the structural guarantee behind this feature's entire integrity story.

- [ ] T030 Confirm no service-role usage, no caching of order data, and no order data on public routes.
  - Req: SEC-003, SEC-006, FR-012 | Depends: T028
  - Verify: `grep -rn "SERVICE_ROLE\|cacheTag\|unstable_cache" lib/orders src/app/dashboard/orders` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.

- [ ] T031 Re-run the concurrency and idempotency tests several times to confirm stability, and record
  the results in the handoff notes.
  - Req: SC-002, SC-003 | Depends: T019, T020
  - Verify: repeated runs pass consistently; any flake is investigated, not retried away
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: a flaky concurrency test is worse than none — it hides the very race it exists to catch.

- [ ] T032 Update the roadmap for 007 and confirm the expiry-scheduler decision remains open.
  - Req: spec Open items | Depends: T028
  - Verify: roadmap accurate; the lazy-expiry limitation is stated, not silently closed
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest continuity reporting on a known operational gap.

---

## Dependencies & parallelisation

- Phase 1 blocks everything.
- Phase 2 blocks Phases 3–5; Phase 4 (checkout) blocks Phases 5–6 in practice.
- T007 (shipment slice) is parallel to Phase 4.
- Phase 8's tests: T024/T025 parallel; T019–T023 should be run and reviewed individually because
  each targets a distinct integrity invariant.
- Phase 10 depends on everything.

**Parallel-safe tasks**: T007, T017, T024, T025 (4 of 32) — deliberately low, because most of this
feature converges on one transactional path.

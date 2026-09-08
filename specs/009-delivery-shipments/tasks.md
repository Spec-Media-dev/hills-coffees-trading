# Tasks: Delivery & Shipments (009)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §7 (DEL-01, DEL-02), AC-04.

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001, 003, 004, 005, 007, 008 implemented.

> **Standing rule**: the shipment state machine and the buyer/warehouse authorization split are owned
> by `validate_shipment_transition` and `validate_shipment_item`. The application attempts
> transitions and maps refusals — it never implements, mirrors-as-authority, or bypasses them.
> **DB-BLOCK-07 (delivery requests do not reserve inventory) must not be worked around in
> application code.**

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Delivery domain layer

- [ ] T001 Create `lib/delivery/validation.ts` + DTO types (shipment, item, address/contact/method,
  planned vs delivered quantities).
  - Req: FR-013 | Depends: —
  - Verify: no DTO exposes a computed delivered quantity; address fields are marked private
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing/schema work.

- [ ] T002 Create `lib/delivery/transitions.ts` — a documented, read-only copy of the database's
  permitted-transition map, used **only** to decide which UI affordances to show, with an explicit
  comment that the database is authoritative.
  - Req: FR-003 | Depends: —
  - Verify: the file exports no function that authorises an action; its doc comment states the UI-affordance-only rule
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: a mirrored state map is exactly the artefact that later drifts into being treated as authority — the framing must be unambiguous.

- [ ] T003 Implement `lib/delivery/errors.ts` — map `shipment_plan_is_closed`,
  `invalid_shipment_transition`, `warehouse_required_for_operational_shipment_status`,
  `only_warehouse_can_record_delivery`, `shipment_order_item_mismatch`,
  `delivered_quantity_*` to safe, specific messages.
  - Req: FR-010, SC-007 | Depends: —
  - Verify: every known trigger exception is mapped; unmapped falls back safely
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the error surface is how both buyers and operators understand refusals; precision matters.

- [ ] T004 Implement `lib/delivery/read.ts` — shipment/item reads scoped by `can_view_order` or
  `is_warehouse_operator()`, with per-item planned/delivered quantities.
  - Req: FR-006, SEC-003 | Depends: T001
  - Verify: another organization's shipment id returns nothing; warehouse sees operational rows
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: dual-audience scoping (buyer vs warehouse) is easy to get subtly wrong.

---

## Phase 2 — Buyer delivery request

- [ ] T005 [PS1] Implement `lib/delivery/buyer.ts` — create `DRAFT` shipment, add/edit
  `shipment_items` while `DRAFT`, submit to `REQUESTED`, cancel from `DRAFT`. No other transition is
  reachable from this module.
  - Req: FR-001, SEC-003 | Depends: T001, T003
  - Verify: the module exposes no operational transition; a cross-order item is refused; editing after `REQUESTED` is refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this module defines the buyer's entire write surface into fulfilment — over-exposure here breaks the role split.

- [ ] T006 [PS1] Build `src/app/dashboard/deliveries/new/page.tsx` + `actions.ts` — plan editor
  (select order items, planned quantities, address/contact/method) and submission.
  - Req: FR-001, FR-013, PS1 | Depends: T005
  - Verify: submitting moves status to `REQUESTED`; planned quantities respect the per-item rule the database enforces
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: a multi-entity form whose validity rules live in the database, not the form.

- [ ] T007 [PS1] Present the honest guarantee: because delivery requests do not reserve inventory
  (DB-BLOCK-07), the UI MUST NOT imply the requested quantity is protected from sale or listing.
  - Req: spec Open items, FR-003 | Depends: T006
  - Verify: no copy states or implies reservation; a code comment and the spec both cite DB-BLOCK-07
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the honest-product judgment — claiming a guarantee the platform does not yet provide would be a serious commercial misstatement.

---

## Phase 3 — Warehouse domain layer (consumed by 010)

- [ ] T008 [PS2] Implement `lib/delivery/warehouse.ts` — guarded operations (`confirmCapacity`,
  `reserve`, `markReady`, `startPicking`, `book`, `dispatch`, `fail`, `cancel`) each verifying
  `is_warehouse_operator()` before attempting the transition.
  - Req: FR-002, FR-009, SEC-001 | Depends: T002, T003
  - Verify: each operation is refused for non-warehouse fixtures both in the app and by the trigger; no raw update path is exported
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the operational authority boundary for physical goods movement; a bypass would let a buyer move their own goods through fulfilment states.

- [ ] T009 [PS3] Implement `recordDelivery` — warehouse-only, monotonic delivered quantity per item,
  never computed by the application.
  - Req: FR-005, SC-003 | Depends: T008
  - Verify: non-warehouse write refused; a decrease attempt refused; over-plan attempt refused by the database
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the write that actually reduces custody — irreversible and audit-relevant.

- [ ] T010 Confirm the application never sets `ready_at` or `orders.shipping_ready_at`.
  - Req: FR-004 | Depends: T008
  - Verify: `grep -rn "ready_at\|shipping_ready_at" lib/delivery src/app/dashboard/deliveries` shows reads only
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical structural check of a trigger-owned field.

- [ ] T011 Expose the warehouse layer to 010 with guards and error mapping included, and no path that
  bypasses them.
  - Req: FR-009 | Depends: T008, T009
  - Verify: the exported surface contains no generic "update shipment status" function
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: seam design that prevents a future console from routing around the role split.

---

## Phase 4 — Buyer tracking surfaces

- [ ] T012 [PS4] Implement `src/app/dashboard/deliveries/page.tsx` — buyer shipment list with approved
  status labels.
  - Req: FR-007, PS4 | Depends: T004
  - Verify: all 13 statuses render exact labels; only own-organization shipments appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: list page with a large closed vocabulary to honour.

- [ ] T013 [PS4] Implement `src/app/dashboard/deliveries/[shipmentId]/page.tsx` — status timeline,
  per-item planned vs delivered quantities, address/contact, failure/cancellation reason.
  - Req: FR-007, FR-012, PS3, PS4 | Depends: T004
  - Verify: partial delivery shows per-item figures; `FAILED`/`CANCELLED`/`DISPUTED` show reasons and (for disputes) a route into 012
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: several data relationships must render coherently, including failure paths.

- [ ] T014 [P] Build `components/delivery/status-timeline.tsx` and `item-quantities-table.tsx`.
  - Req: FR-007, FR-013 | Depends: T001
  - Verify: quantities render with units; the timeline uses dot + label badges, never colour alone
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: focused presentational components.

- [ ] T015 [PS5] Link delivery outcomes to custody changes in 005 (read-only composition).
  - Req: PS5 | Depends: T013, 005's read layer
  - Verify: after recorded delivery, the linked custody view reflects the approved model's change; nothing is recomputed here
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature read composition.

---

## Phase 5 — Module registration

- [ ] T016 Register the `deliveries` nav entry and the "where is it" overview contribution with 004's
  contract.
  - Req: FR-011 | Depends: T012
  - Verify: entry appears for member organizations; summary query is bounded
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: contract-conformant registration.

---

## Phase 6 — Tests

- [ ] T017 [P] Write `tests/delivery/transition-matrix.test.ts` — every permitted transition succeeds
  for the correct role; every forbidden one is refused by the database.
  - Req: FR-002, FR-003, SC-002 | Depends: T005, T008
  - Verify: `npm test -- delivery/transition-matrix` passes across the full map
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the state machine is large; systematic coverage is the only way to know the app cooperates with it correctly.

- [ ] T018 [P] Write `tests/delivery/buyer-role-negatives.test.ts` — a buyer attempting each
  operational status directly is refused.
  - Req: SEC-001, SC-001 | Depends: T005, T008
  - Verify: `npm test -- delivery/buyer-role-negatives` passes for every operational status
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the role-split guarantee for physical goods movement.

- [ ] T019 [P] Write `tests/delivery/delivered-quantity.test.ts` — non-warehouse write refused,
  decrease refused, over-plan refused, partial→complete progression works.
  - Req: FR-005, SC-003 | Depends: T009
  - Verify: `npm test -- delivery/delivered-quantity` passes for all four cases
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: monotonic, warehouse-only custody reduction is audit-critical.

- [ ] T020 [P] Write `tests/delivery/isolation.test.ts` and `plan-closure.test.ts` — cross-organization
  invisibility; item edits refused after `REQUESTED`; cross-order items refused.
  - Req: FR-001, FR-006, SC-005 | Depends: T004, T005
  - Verify: both suites pass
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: tenant isolation plus plan-closure semantics.

- [ ] T021 Write `tests/delivery/error-mapping.test.ts` — every trigger exception maps to a safe,
  specific message.
  - Req: FR-010, SC-007 | Depends: T003
  - Verify: `npm test -- delivery/error-mapping` passes; no raw exception text in client output
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused mapping test.

---

## Phase 7 — States, accessibility, RTL

- [ ] T022 State coverage across delivery screens (loading, empty, error, unauthorized, suspended,
  requested, reserved, dispatched, partially-delivered, delivered, failed, cancelled).
  - Req: FR-012 | Depends: Phases 2–4
  - Verify: each state renders for a seeded fixture
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.

- [ ] T023 Accessibility, RTL and mobile pass; quantities with units; codes monospaced.
  - Req: FR-013 | Depends: Phases 2–4
  - Verify: a11y check clean; grep for physical CSS properties returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.

---

## Phase 8 — Verification & closure

- [ ] T024 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T025 Confirm no application-side inventory reservation was introduced for deliveries
  (DB-BLOCK-07 respected).
  - Req: spec Open items, Constitution IX/X | Depends: T024
  - Verify: `grep -rn "reserved_quantity_kg" lib/delivery src/app/dashboard/deliveries` shows reads only, never writes
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the single most important restraint in this feature — an app-side reservation would create a competing inventory truth.

- [ ] T026 Confirm no service-role usage, no caching of delivery data, no public exposure of
  warehouse locations or addresses.
  - Req: SEC-004, SEC-005, FR-008, FR-014 | Depends: T024
  - Verify: `grep -rn "SERVICE_ROLE\|cacheTag\|unstable_cache" lib/delivery src/app/dashboard/deliveries` returns nothing; no public module imports `lib/delivery/*`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.

- [ ] T027 Update the roadmap for 009 and ensure **DB-BLOCK-07** is recorded in
  `docs/architecture/DATABASE-CAPABILITY-MAP.md` with its SRS citation (DEL-01, AC-04) and remains
  open.
  - Req: spec Open items | Depends: T024
  - Verify: the capability map lists DB-BLOCK-07; the roadmap marks AC-04 as not satisfiable until resolved
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — High
  - Why: this blocker affects a release-blocking acceptance criterion; recording it accurately is essential to an honest go/no-go.

---

## Dependencies & parallelisation

- Phase 1 blocks everything; T002/T003 are parallel.
- Phase 2 (buyer) and Phase 3 (warehouse) are independent once Phase 1 lands.
- Phase 4 depends on Phase 1's read layer; T014 is parallel.
- Phase 6's tests are mutually parallel except T021 (needs T003 only).
- Phase 8 depends on everything.

**Parallel-safe tasks**: T014, T017, T018, T019, T020 (5 of 27).

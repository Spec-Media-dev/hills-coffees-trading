# Tasks: Inventory, Custody & Storage (005)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §7 (LOT-01..LOT-04, DEL-01).

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001, 003, 004 implemented. This feature ships **zero mutations**.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Inventory domain read layer

- [ ] T001 Create `lib/inventory/types.ts` — DTO types for positions, allocations, ownership events
  and availability breakdown (owned / reserved / available, with cause labels).
  - Req: FR-001, FR-002 | Depends: —
  - Verify: no DTO field is derived arithmetic; each maps to a database column
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing against a known schema.

- [ ] T002 Implement `lib/inventory/positions.ts` — paginated, org-scoped reads of
  `inventory_positions` joined to lot/coffee/warehouse context, degrading honestly when lot detail is
  unreadable (DB-OPEN-05).
  - Req: FR-001, FR-002, FR-011, SEC-001 | Depends: T001
  - Verify: quantities are passed through unmodified; with lot detail unreadable the function still returns position rows
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: the pass-through-not-recompute discipline plus graceful degradation around a known policy defect needs careful judgment.

- [ ] T003 [P] Implement `lib/inventory/allocations.ts` — org-scoped `storage_allocations` reads with
  approved status labels and released-vs-allocated quantities.
  - Req: FR-001, FR-006 | Depends: T001
  - Verify: all three states render their exact approved labels; released quantity is distinct from allocated
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused read module over an explicit vocabulary.

- [ ] T004 [P] Implement `lib/inventory/ownership.ts` — chronological, read-only projection of
  `inventory_ownership_events` where the org is source or destination, with counterparty redaction
  where not permitted.
  - Req: FR-001, FR-005, SEC-005 | Depends: T001
  - Verify: events for both directions are returned; a counterparty the member may not see is redacted rather than omitted
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: redaction-vs-omission is a subtle privacy decision that affects what members can infer.

- [ ] T005 Implement `lib/inventory/availability.ts` — labels reserved quantity with its cause using
  only readable sources (`inventory_reservation_items` via `can_view_order`, `orders.hold_expires_at`);
  contains **no** arithmetic re-deriving availability.
  - Req: FR-002, FR-007, PS4 | Depends: T002
  - Verify: `grep -nE "[-+*/]\s*(available|reserved)_quantity" lib/inventory/availability.ts` returns nothing; reservation cause resolves without querying `inventory_reservations`
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is where a well-meaning agent would most likely reintroduce a client-side inventory calculation — exactly what LOT-02 forbids.

- [ ] T006 Expose the eligibility inputs 006 needs (owned, unreserved, Hills-custody quantity per
  position/lot) without encoding 006's listing rules.
  - Req: FR-010 | Depends: T002, T005
  - Verify: the exported shape contains quantities and custody facts only — no `isEligibleToList` decision
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: drawing the boundary between "facts" and "rules" correctly keeps 006 from being duplicated here.

---

## Phase 2 — Member inventory surfaces

- [ ] T007 [PS1] Implement `src/app/dashboard/inventory/page.tsx` — positions list with owned,
  reserved and available quantities, warehouse and lot context, paginated.
  - Req: FR-001, FR-003, FR-012, FR-013 | Depends: T002, T005
  - Verify: every quantity renders with unit; zero positions renders the honest empty state
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard list page over the DTO layer.

- [ ] T008 [PS1] Implement `src/app/dashboard/inventory/[positionId]/page.tsx` — position detail with
  the availability breakdown and reservation causes.
  - Req: FR-002, FR-007, PS4 | Depends: T005, T007
  - Verify: a position with an active reservation shows reserved excluded from available, with its cause
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the availability presentation is the member's mental model of the inventory invariant; must be unambiguous.

- [ ] T009 [P] [PS1] Build `components/inventory/availability-breakdown.tsx` (owned / reserved /
  available with cause labels and units).
  - Req: FR-003, PS4 | Depends: T001
  - Verify: renders all three figures with units and never shows a negative value
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused presentational component with clear rules.

- [ ] T010 [PS2] Implement `src/app/dashboard/storage/page.tsx` — custody allocations with approved
  state labels, linked to originating order items where permitted.
  - Req: FR-006, PS2 | Depends: T003
  - Verify: `STORED`/`RELEASED`/`DELIVERED` all render correctly; links resolve only where `can_view_order` permits
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: straightforward list over an explicit vocabulary.

- [ ] T011 [PS3] Implement `src/app/dashboard/inventory/history/page.tsx` — the append-only ownership
  ledger view with type, quantity, timestamp, reason and correlation ID.
  - Req: FR-005, PS3, SEC-005 | Depends: T004
  - Verify: the page exposes no edit/delete/reorder control; reason text is escaped
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: an immutable-evidence surface where accidentally offering a mutation affordance would contradict LOT-03.

- [ ] T012 [P] Build `components/inventory/ledger-timeline.tsx` rendering events with monospace
  correlation IDs and closed-vocabulary event types.
  - Req: FR-003, FR-005 | Depends: T001
  - Verify: all five event types render their approved labels; correlation IDs are monospaced
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: presentational component with an explicit vocabulary.

---

## Phase 3 — Custody trust & variance surfacing

- [ ] T013 [PS5] Confirm with 010's warehouse model how holds/variances/quarantine are represented in
  the approved schema; implement surfacing **only** for representations that actually exist.
  - Req: FR-009, PS5 | Depends: T002
  - Verify: no invented status field is introduced; if no representation exists, the finding is recorded in spec.md Open items rather than fabricated
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the honest answer may be "the schema does not represent this yet" — recognising that instead of inventing a field is the whole point.

- [ ] T014 [PS5] Where a hold/variance exists, block dependent member actions (listing, delivery
  request) with a clear server-side refusal and reason.
  - Req: FR-009, PS5 | Depends: T013
  - Verify: with an affected position seeded, the dependent action is refused server-side, not merely hidden
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: LOT-04 requires unsafe stock to stop trading; a UI-only block would violate it.

---

## Phase 4 — Module registration & overview contributions

- [ ] T015 Register `inventory` and `storage` nav entries and the "what did I buy" / "where is it"
  overview cards with 004's module contract.
  - Req: FR-012 | Depends: T007, T010
  - Verify: entries appear for member organizations; bounded summary queries only (no full scans)
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: contract-conformant registration with a performance constraint.

---

## Phase 5 — Automated tests

- [ ] T016 [P] Write `tests/inventory/isolation.test.ts`: org A cannot read org B's positions,
  allocations or ownership events.
  - Req: SEC-002, SC-002 | Depends: T002, T003, T004
  - Verify: `npm test -- inventory/isolation` passes; every cross-org read returns empty
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the release-blocking tenant-isolation guarantee for commercial data.

- [ ] T017 [P] Write `tests/inventory/quantity-fidelity.test.ts`: displayed quantities equal database
  columns exactly; no recomputation.
  - Req: FR-002, SC-001 | Depends: T002, T005
  - Verify: `npm test -- quantity-fidelity` passes; the test fails if arithmetic is introduced into the read layer
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: this test is the durable guard against re-deriving the inventory invariant.

- [ ] T018 [P] Write `tests/inventory/ledger-immutability.test.ts`: an attempted update/delete on
  `inventory_ownership_events` is refused by the database.
  - Req: FR-005, SC-003 | Depends: T004
  - Verify: `npm test -- ledger-immutability` passes with the database raising on mutation
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: proves the append-only guarantee at the real boundary rather than trusting the UI.

- [ ] T019 Write `tests/inventory/degradation.test.ts`: with lot detail unreadable (DB-OPEN-05
  condition), position pages still render with an explicit unavailability note.
  - Req: FR-011 | Depends: T002, T008
  - Verify: `npm test -- degradation` passes; no fabricated lot values appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused test of a documented degradation path.

---

## Phase 6 — Accessibility, responsive, RTL

- [ ] T020 Responsive pass: inventory/storage/ledger tables collapse to card lists at mobile using
  004's shared helper.
  - Req: FR-014 | Depends: Phase 2
  - Verify: at mobile width no horizontal table scroll is required; touch targets ≥ 44×44px
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: reuses an existing helper across several tables.

- [ ] T021 Accessibility + RTL pass: table semantics, status badges as dot + label, keyboard
  traversal, logical CSS properties, externalised copy.
  - Req: FR-003, FR-014 | Depends: Phase 2
  - Verify: automated a11y check clean; `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/dashboard/inventory src/app/dashboard/storage components/inventory` returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but mechanical.

---

## Phase 7 — Verification & closure

- [ ] T022 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T023 Confirm this feature ships zero mutations and no service-role usage.
  - Req: SEC-001, SEC-003 | Depends: T022
  - Verify: `grep -rn "\"use server\"\|SERVICE_ROLE" src/app/dashboard/inventory src/app/dashboard/storage lib/inventory` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical structural check of a deliberate read-only scope.

- [ ] T024 Confirm no inventory data is cached and none is reachable from a public route.
  - Req: FR-008, SEC-004, SC-005, SC-007 | Depends: T022
  - Verify: `grep -rn "cacheTag\|unstable_cache" lib/inventory src/app/dashboard/inventory src/app/dashboard/storage` returns nothing; no public page imports `lib/inventory/*`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical grep verification of two constitutional rules.

- [ ] T025 Update the roadmap and re-confirm DB-OPEN-05 status (still open unless formally resolved).
  - Req: spec.md Open items | Depends: T022
  - Verify: roadmap row accurate; capability-map entry unchanged unless a decision was recorded
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest continuity reporting on an unresolved database question.

---

## Dependencies & parallelisation

- Phase 1 blocks everything; T003/T004 are mutually parallel after T001; T005 needs T002.
- Phase 2 pages depend on their respective read modules; T009/T012 are parallel components.
- Phase 3 depends on a real answer from 010's model (T013 gates T014).
- Phase 5 tests are mutually parallel except T019 (needs T008).
- Phase 7 depends on everything.

**Parallel-safe tasks**: T003, T004, T009, T012, T016, T017, T018 (7 of 25).

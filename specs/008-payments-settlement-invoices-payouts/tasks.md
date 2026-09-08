# Tasks: Payments, Settlement, Invoices & Payouts (008)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §8 (MKT-04, MKT-05), §11 (TXN-01), §14 (OPS-01),
AC-03.

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001, 003, 004, 005, 006, 007 implemented.

> **Standing rule**: the application never transfers title, creates ownership events, adjusts
> inventory, creates custody, creates payouts, or sets settlement states. `admin_review_payment()`
> owns all of it. Anything that seems to require otherwise is a BLOCKER, not a workaround.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Finance domain layer

- [ ] T001 Create `lib/finance/validation.ts` and finance DTO types (amount due, payment status,
  proof, proforma, tax invoice, payout).
  - Req: FR-004, FR-016 | Depends: —
  - Verify: no DTO field is computed money; every amount maps to a stored column
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing.

- [ ] T002 Implement `lib/finance/errors.ts` — map finance function exceptions (`forbidden`,
  `payment_not_found`, `active_reservation_missing`, `reservation_expired`, already-confirmed) to
  safe, specific application errors.
  - Req: FR-012, SEC-004, SC-007 | Depends: —
  - Verify: every known raised string is mapped; unmapped errors fall back safely and log without payload
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: prevents internal settlement semantics leaking while keeping finance messages actionable.

- [ ] T003 Implement `lib/finance/read.ts` — scoped reads for payments, proofs, financial summary,
  proformas (+items), tax invoices and payouts.
  - Req: FR-008, FR-004 | Depends: T001
  - Verify: cross-organization ids return nothing; amounts pass through unmodified
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: multi-table scoping where one wrong join exposes another organization's finances.

- [ ] T004 [P] Implement `lib/finance/instructions.ts` — bank-transfer instructions from
  `payment_accounts`, with an explicit "no approved payment account configured" outcome.
  - Req: FR-005, PS1 | Depends: T001
  - Verify: with no active account, the module returns the explicit unavailable state — never blank or invented details
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: inventing bank details would be a serious commercial hazard; the guard is simple but essential.

- [ ] T029 Add the commission snapshot to the finance DTO and read layer, sourced **only** from
  `order_financials` (`commission_policy_id`, `commission_percentage_snapshot`, `commission_amount`,
  `seller_net_amount`, `total_quantity_kg`). No module in `lib/finance/` may query
  `commission_policies` or `commission_tiers`. Behavioural reference:
  `docs/database/commission-capability.md`.
  - Req: FR-004, FR-017, FR-018, SC-005 | Depends: T001, T003
  - Verify: `grep -rn "commission_policies\|commission_tiers" lib src` returns nothing; every commission field in the DTO maps 1:1 to an `order_financials` column; no arithmetic derives a commission percentage or amount
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the single structural guarantee behind historical commission immutability — one stray join to the live tier tables silently reintroduces retroactive recalculation.

---

## Phase 2 — Payment proof path

- [ ] T005 [PS2] Implement `lib/finance/proof.ts` — the **only** caller of `submit_payment_proof()`,
  with identity/order-ownership guards, hold-freshness check (via 007's `ensureHoldFresh`) and error
  mapping.
  - Req: FR-002, SEC-002, PS2 | Depends: T002, T003
  - Verify: `grep -rn "submit_payment_proof" src lib` matches only this file; submission against an expired hold is refused; another organization's order is refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the entry point to the settlement sequence; a weak guard here lets the wrong party push an order toward settlement.

- [ ] T006 [PS2] Implement the file seam for proof attachments: create `file_assets` metadata with
  private classification, inert until a Storage bucket is approved (DB-BLOCK-01).
  - Req: FR-009, SEC-003, SC-008 | Depends: T005
  - Verify: no code path writes bytes anywhere; the seam is one marked function citing DB-BLOCK-01; reference-text submission still works
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: respecting a blocker precisely — while keeping the rest of the flow usable — is a judgment call.

- [ ] T007 [PS1][PS2] Build `src/app/dashboard/payments/[orderId]/page.tsx` + `actions.ts` — amount
  due, instructions, hold deadline, proof submission form and status.
  - Req: FR-004, FR-005, FR-015, PS1, PS2 | Depends: T004, T005
  - Verify: displayed amount equals `order_financials.buyer_total_amount` exactly; deadline from `orders.hold_expires_at`
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the buyer's money screen — accuracy and clarity are commercially consequential.

- [ ] T008 [P] Build `src/app/dashboard/payments/page.tsx` — payment list across the buyer's orders
  with approved status labels.
  - Req: FR-007, FR-008 | Depends: T003
  - Verify: all seven payment statuses render exact labels; only own-organization payments appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: list page over a scoped read layer.

---

## Phase 3 — Settlement decision layer

- [ ] T009 [PS3] Implement `lib/finance/settlement.ts#decidePayment()` — the **only** caller of
  `admin_review_payment()`. Verify `is_finance_operator()` in the application, enforce
  idempotency by current payment state, call the function, map errors.
  - Req: FR-001, FR-003, FR-006, FR-013, SEC-001, SC-001 | Depends: T002, T003
  - Verify: `grep -rn "admin_review_payment" src lib` matches only this file; a non-finance fixture is refused in the app *and* by the function; deciding an already-`CONFIRMED` payment is a safe no-op
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the second release-blocking transactional boundary in the platform — this is where title moves, and where a mistake is irreversible.

- [ ] T010 [PS3] Ensure the decision layer performs **no** settlement side effects of its own (no
  ownership events, inventory writes, custody, payouts, status changes).
  - Req: FR-001, SC-001 | Depends: T009
  - Verify: `grep -rnE "inventory_ownership_events|inventory_positions|storage_allocations|payouts|proforma_invoices" lib/finance src/app/dashboard/payments` shows reads only, never writes
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: an explicit structural audit of the rule that protects AC-03.

- [ ] T011 [PS3] Expose the decision layer for 010's Finance console (typed API, guards and error
  mapping included) without exporting a path that bypasses them.
  - Req: FR-013 | Depends: T009
  - Verify: the exported surface offers no "raw" call; 010 cannot reach `admin_review_payment` except through `decidePayment`
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: designing the seam so a future console cannot accidentally route around the guards.

---

## Phase 4 — Settlement outcome presentation

- [ ] T012 [PS4] Present the buyer's settlement outcome: order `PAID`, custody/positions (link to
  005), ownership event correlation ID.
  - Req: PS4, FR-015 | Depends: T003, 005's read layer
  - Verify: after a settled order, the buyer sees the new custody and the correlation ID; figures reconcile with 005
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: composition across two features' read layers.

- [ ] T013 [PS4][PS6] Implement `src/app/dashboard/payouts/page.tsx` — seller payouts with approved
  statuses, amounts and references, visible only to `can_sell` organizations that own them.
  - Req: FR-007, FR-008, PS6 | Depends: T003
  - Verify: all four payout statuses render; another organization's payouts are never returned
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: seller money data with a strict ownership boundary.

- [ ] T030 [PS4][PS6] Present the commission snapshot on the seller-facing settlement/payout surface:
  the percentage that applied, the commission amount, the seller net amount and the quantity the
  tier decision was based on — each labelled as the value snapshotted **at checkout**, with copy
  making clear that later configuration changes do not alter it.
  - Req: FR-017, FR-018, FR-019, PS4, PS6 | Depends: T029, T013
  - Verify: figures equal `order_financials` exactly; the surface offers no recalculate/refresh action; a `HILLS`-sourced order shows no payout and no member-seller commission attribution
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: this is where a seller reads what Hills deducted — wrong or ambiguous framing here is a commercial dispute waiting to happen.

- [ ] T014 [PS5] Implement `src/app/dashboard/documents/page.tsx` — proformas and tax invoices for
  orders the member may view.
  - Req: FR-008, PS5 | Depends: T003
  - Verify: proforma renders with code/items/totals/status; a non-permitted order returns nothing; a missing tax invoice is presented as absent, not as an error
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: document surface with clear permission scoping.

---

## Phase 5 — Module registration

- [ ] T015 Register `payments` and `documents` (all members) and `payouts` (seller-capable only) nav
  entries plus the "what do I owe" overview card with 004's contract.
  - Req: FR-014 | Depends: T007, T013, T014
  - Verify: `payouts` is absent for `can_sell = false` organizations and refused at the route
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: capability-scoped registration.

---

## Phase 6 — Release-blocking finance tests

- [ ] T016 [PS3] Write `tests/finance/role-negatives.test.ts` (AC-03): member, warehouse, compliance
  and auditor fixtures each fail to settle a payment, including by direct `decidePayment` invocation.
  - Req: SEC-001, SC-002 | Depends: T009
  - Verify: `npm test -- finance/role-negatives` passes for all four roles
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the release-blocking authorization boundary for settlement.

- [ ] T017 [PS3] Write `tests/finance/settlement-effects.test.ts`: after one approval, assert exactly
  one ownership event per order item, buyer custody created, listing fill advanced, reservation
  `CONSUMED`, payment `CONFIRMED`, proforma `PAID`, order `PAID`.
  - Req: FR-001, PS3 | Depends: T009
  - Verify: `npm test -- finance/settlement-effects` passes with exact counts (not "at least one")
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: verifies the full settlement transaction happened once and completely — the heart of AC-03.

- [ ] T018 [PS3] Write `tests/finance/idempotency.test.ts`: two decisions on the same payment
  (sequential and concurrent) produce exactly one settlement, one ownership-event set, one payout.
  - Req: FR-006, SC-003 | Depends: T009
  - Verify: `npm test -- finance/idempotency` passes under both orderings
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: two finance operators clicking at once is a realistic scenario with irreversible consequences.

- [ ] T019 Write `tests/finance/no-premature-title.test.ts`: no ownership event exists while payment
  is `PENDING`/`PROOF_SUBMITTED`/`UNDER_REVIEW`; approval after reservation expiry is refused with no
  title movement.
  - Req: SC-004, AC-03 | Depends: T009
  - Verify: `npm test -- finance/no-premature-title` passes for all four states
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: directly encodes MKT-04 (settlement before title) as an executable guarantee.

- [ ] T020 [P] Write `tests/finance/isolation.test.ts`: payments, proofs, invoices and payouts are
  never readable across organizations.
  - Req: FR-008, SEC-002, SC-006 | Depends: T003
  - Verify: `npm test -- finance/isolation` passes
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: cross-tenant financial exposure is among the most severe possible defects.

- [ ] T021 [P] Write `tests/finance/amount-fidelity.test.ts` and `error-mapping.test.ts`: displayed
  amounts equal snapshots; every finance exception maps to a safe message.
  - Req: SC-005, SC-007 | Depends: T002, T003
  - Verify: both suites pass; no raw exception text appears in client output
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: two focused suites over explicit contracts.

- [ ] T031 Write `tests/finance/commission-tier-selection.test.ts` — prove the database's
  **total-quantity** tier semantics against seeded policies/tiers (planning-time definition only;
  implement in this feature's test phase, not before).
  Cases **A–C**:
  **(A) Boundary quantities** — with bands `0–100`, `100–250`, `250–NULL`: `0`, `99.999`, **`100`**,
  `249.999`, **`250`** each select the expected band, proving inclusive minimum / exclusive maximum.
  **(B) Open-ended maximum** — a very large quantity selects the `max_quantity_kg IS NULL` band.
  **(C) Effective dates** — a policy not yet in force (`effective_from > now()`), an expired policy
  (`effective_until <= now()`), and a non-`ACTIVE` policy are each ignored; where two ACTIVE
  policies overlap, the later `effective_from` wins.
  Also assert the selected percentage is applied to the **whole** base (not progressive/marginal
  banding), and that the commission base excludes shipping and VAT.
  - Req: FR-017, SC-009 | Depends: T029, 007's checkout layer
  - Verify: `npm test -- finance/commission-tier-selection` passes for every case; a deliberately progressive/marginal expectation fails the suite
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: boundary-condition correctness on money; an off-by-one at a band edge misprices every order at that quantity.

- [ ] T032 Write `tests/finance/commission-immutability.test.ts` — prove commission history cannot be
  retroactively changed. Cases **D–F**:
  **(D)** Check out an order, then change the commission policy/tier (new percentage, archive the
  policy, and edit the tier) — the order's `order_financials` row is unchanged in every commission
  field.
  **(E)** Settle that order and assert the payout was derived from
  `commission_percentage_snapshot`, not from the now-current tier.
  **(F)** Assert historical `order_financials` rows for previously settled orders remain unchanged
  after the same configuration edits.
  - Req: FR-018, FR-019, SC-010 | Depends: T029, T009
  - Verify: `npm test -- finance/commission-immutability` passes; a snapshot mutated by a later configuration edit fails the suite
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the property that makes historical commercial records defensible; it must be executable, not asserted in prose.

- [ ] T033 Extend the idempotency proof to payouts explicitly — case **G**: retried/concurrent
  settlement of the same payment produces exactly **one** payout row per
  `(order_id, seller_organization_id)` with the correct accumulated amount, never a doubled figure.
  - Req: FR-006, FR-019, SC-003 | Depends: T018, T029
  - Verify: `npm test -- finance/idempotency` includes payout-amount assertions under sequential and concurrent decisions; amounts are exact, not "at least"
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: `payouts` upserts by accumulating, so a duplicate settlement path would silently overpay a seller — the failure mode is money leaving the business.

---

## Phase 7 — States, accessibility, RTL

- [ ] T022 State coverage: loading, empty, error, unauthorized, suspended, expired, pending,
  rejected, settled across payment/document/payout screens.
  - Req: FR-015 | Depends: Phases 2–4
  - Verify: each state renders for a seeded fixture
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.

- [ ] T023 Accessibility, RTL and mobile pass; money always with currency; codes monospaced.
  - Req: FR-016 | Depends: Phases 2–4
  - Verify: a11y check clean; grep for physical CSS properties returns nothing; currency present on every amount
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.

---

## Phase 8 — Verification & closure

- [ ] T024 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T025 Confirm single-caller discipline: `admin_review_payment` and `submit_payment_proof` are
  each called from exactly one module.
  - Req: FR-001, FR-002, SC-001 | Depends: T024
  - Verify: `grep -rn "admin_review_payment\|submit_payment_proof" src lib` matches only `lib/finance/settlement.ts` and `lib/finance/proof.ts`
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: the structural guarantee behind this feature's integrity claims.

- [ ] T026 Confirm no gateway/webhook/provider integration, no service-role usage, no caching of
  finance data, and no member path to change bank details.
  - Req: FR-010, FR-011, SEC-003, SEC-006 | Depends: T024
  - Verify: `grep -rniE "webhook|stripe|paypal|gateway|SERVICE_ROLE|cacheTag" lib/finance src/app/dashboard/payments src/app/dashboard/payouts` returns nothing; `payment_accounts` has no member-facing write path
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: several constitutional/SRS boundaries checked in one sweep.

- [ ] T027 Re-run the settlement, idempotency and no-premature-title suites multiple times; record
  results in the handoff notes.
  - Req: SC-002, SC-003, SC-004 | Depends: T017, T018, T019
  - Verify: repeated runs pass consistently; any flake is investigated, not retried away
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: irreversible financial operations deserve more than one green run.

- [ ] T028 Update the roadmap for 008 and confirm DB-BLOCK-01, the refund model and the dual-control
  decision all remain open and unbypassed.
  - Req: spec Open items | Depends: T024
  - Verify: roadmap accurate; capability-map entries unchanged unless formally decided
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest continuity reporting on three unresolved business decisions.

---

## Dependencies & parallelisation

- Phase 1 blocks everything; T004 is parallel to T002/T003. T029 (commission snapshot in the DTO/read
  layer) belongs to Phase 1 and gates the commission presentation and commission tests.
- Phase 2 (proof) and Phase 3 (settlement) are independent of each other and can proceed in parallel
  once Phase 1 lands.
- Phase 4 depends on Phase 3's outcomes existing; T030 additionally depends on T029.
- Phase 6: T020/T021 parallel; T016–T019 should each be reviewed individually (distinct invariants).
  T031/T032/T033 are the commission verification set (cases A–G) and are deliberately **not**
  parallel — each seeds and mutates commission configuration, so concurrent runs would interfere.
- Phase 8 depends on everything.

**Parallel-safe tasks**: T004, T008, T020, T021 (4 of 33) — deliberately low; this feature converges
on two transactional call sites and, for commission, on one shared configuration fixture.

**Commission ownership note**: this feature *consumes and proves* the database's commission
capability (`docs/database/commission-capability.md`). It never calculates commission, never reads
`commission_policies`/`commission_tiers`, and never offers historical recalculation. Managing the
policies and tiers themselves is Feature 010's Phase 9 (System configuration, SUPER_ADMIN).
The `COMMISSION-OPEN-01` fallback decision is owned here, by Business/Finance.

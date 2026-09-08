# Tasks: Operations / Admin Console (010)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §14 (OPS-01, OPS-02), §3.1, §13.5.

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001 plus the domain layers from 003, 005, 006, 008, 009, 012.

> **Standing rules**: (1) every area authorizes independently server-side; (2) the console owns no
> transactional logic — settlement via 008's `decidePayment`, fulfilment via 009's warehouse layer;
> (3) no hard deletes of commercial/inventory/title/payment/audit records; (4) where a recorded
> blocker limits a capability, state it honestly rather than simulating it.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Access matrix & guards

- [ ] T001 [PS1] Create `lib/admin/areas.ts` — the single declarative access matrix mapping every
  console area to its required role check.
  - Req: FR-002, FR-003, SC-001 | Depends: —
  - Verify: every area appears exactly once with an explicit role; no "any staff" catch-all exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: this single file defines least privilege for the entire operations surface; an over-broad entry here silently grants cross-role power.

- [ ] T002 [PS1] Implement `lib/admin/guards.ts` — per-area server-side verification helpers reading
  the matrix and calling the approved role functions.
  - Req: FR-002, SEC-001 | Depends: T001
  - Verify: each guard calls the specific role function (not a generic staff check); a member with no operational role is refused everywhere
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the enforcement half of the least-privilege model; must not drift from the declaration.

- [ ] T003 [PS1] Extend `src/app/dashboard-admin/layout.tsx` into the console shell (dark sidebar,
  sticky topbar, role-shaped navigation) while preserving 001's guard exactly.
  - Req: FR-001, FR-015 | Depends: T002
  - Verify: 001's guard behaviour is unchanged; navigation shows only the areas the operator's roles permit
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: edits the file enforcing the console's security boundary; chrome must not weaken it.

- [ ] T004 Add per-area route-group layouts, each invoking its own guard.
  - Req: FR-002, SC-001 | Depends: T002, T003
  - Verify: a direct URL into a forbidden area is refused by that area's own layout, not merely absent from navigation
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: defence in depth per area; the most likely place for a missing check to hide.

- [ ] T005 Add non-indexable metadata for all `/dashboard-admin` routes and confirm exclusion from
  002's sitemap.
  - Req: FR-012 | Depends: T003
  - Verify: console routes are non-indexable; 002's sitemap contains none of them
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small, mechanical.

---

## Phase 2 — Console overview

- [ ] T006 Implement `src/app/dashboard-admin/page.tsx` — a role-shaped operations overview built from
  real queries only (no sample or estimated figures).
  - Req: FR-016, SC-008 | Depends: T004
  - Verify: every figure traces to a real query; an empty system renders empty states, not zeros presented as data
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the design system's explicit "no seeded or sample figures" rule requires judgment about what to show when there is nothing.

---

## Phase 3 — Compliance: KYB

- [ ] T007 [PS2] Implement the KYB queue (`(compliance)/kyb/page.tsx`) with status, organization,
  submission time and outstanding items.
  - Req: FR-002, PS2 | Depends: T004
  - Verify: only compliance-permitted roles reach it; queue reflects real application states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: queue list over an existing domain layer.

- [ ] T008 [PS2] Implement the application detail view: evidence list, document expiry, history, and
  honest statement where documents cannot be opened (DB-BLOCK-01).
  - Req: FR-006, FR-017, PS2 | Depends: T007
  - Verify: expired documents are flagged; unavailable document bytes are explained, not silently broken
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: reviewer-facing accuracy plus honest handling of a blocked capability.

- [ ] T009 [PS2] Implement KYB decision actions (`APPROVED`, `REJECTED`, `RESUBMISSION_REQUIRED`,
  `SUSPENDED`) recording `kyb_reviews` (reviewer, decision, reason) and the application status change.
  - Req: FR-006, SEC-003, SC-003 | Depends: T008
  - Verify: each decision records a review row and changes status once; a decision requiring a reason is refused without one; non-compliance roles refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the decision that unlocks trading for an organization — attribution and correctness are compliance-critical.

- [ ] T010 [PS2] Implement organization status/suspension actions with reason capture.
  - Req: FR-006, PS2 | Depends: T009
  - Verify: suspension is reflected for the member on their next request (003/004); reason recorded
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: immediate suspension (AUTH-02) must take effect platform-wide without destroying history.

---

## Phase 4 — Compliance: listings & disputes

- [ ] T011 [PS5] Implement the listing review queue and decision actions (`APPROVED`, `REJECTED`,
  `SUSPENDED`) recording `listing_reviews` and the status change.
  - Req: FR-006, PS5, SC-003 | Depends: T004, 006's layer
  - Verify: decisions record reviewer/decision/reason; suspension stops member actionability (006); non-compliance roles refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: controls what is tradable in the marketplace; must cooperate with the offer-transition trigger.

- [ ] T012 [P] Implement the dispute review surface (queue + status transitions) using 012's domain
  layer.
  - Req: FR-006 | Depends: T004, 012's layer
  - Verify: dispute status changes record reason and actor; only compliance-permitted roles may act
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: composition over 012's layer with an authorization constraint.

---

## Phase 5 — Finance

- [ ] T013 [PS3] Implement the payment review queue with order, amount, currency, proof reference and
  hold status.
  - Req: FR-002, PS3 | Depends: T004, 008's layer
  - Verify: only finance-permitted roles reach it; amounts match `order_financials` exactly
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: money-facing queue where display fidelity matters.

- [ ] T014 [PS3] Implement the settlement decision UI calling **008's `decidePayment`** — never
  `admin_review_payment` directly — with confirmation and reason capture.
  - Req: FR-004, SC-002, PS3 | Depends: T013
  - Verify: `grep -rn "admin_review_payment" src/app/dashboard-admin lib/admin` returns nothing; approval completes settlement exactly once; expired-reservation approval fails clearly
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the console's most consequential action; routing around 008's guards would defeat AC-03 protections.

- [ ] T015 [P] Implement payout management and tax invoice recording surfaces (finance-only).
  - Req: FR-002, FR-006 | Depends: T004, 008's layer
  - Verify: payout status changes and invoice records are finance-only; no member path exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: finance-only write surfaces with clear scoping.

---

## Phase 6 — Warehouse

- [ ] T016 [PS4] Implement shipment queues (requested / in-progress / dispatched) for warehouse roles.
  - Req: FR-002, PS4 | Depends: T004, 009's layer
  - Verify: only warehouse-permitted roles reach it; queues reflect real shipment states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: operational queue over an existing layer.

- [ ] T017 [PS4] Implement operational transition controls calling **009's warehouse layer** — never
  raw shipment updates — with the affordances driven by the documented transition map.
  - Req: FR-005, SC-002, PS4 | Depends: T016
  - Verify: `grep -rn "order_shipments" src/app/dashboard-admin lib/admin` shows reads only; each transition succeeds/refuses per the database's map
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: physical-goods authority; a raw update path would bypass the role split and state machine.

- [ ] T018 [PS4] Implement delivered-quantity recording through 009's layer (warehouse-only,
  monotonic).
  - Req: FR-005, PS4 | Depends: T017
  - Verify: recording works for warehouse; decrease attempts and non-warehouse attempts are refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: irreversible custody reduction.

- [ ] T019 [PS4] Implement custody/inventory oversight views (cross-organization, warehouse-only),
  stating honestly where DB-BLOCK-07 makes "reserved for delivery" unavailable.
  - Req: FR-017, PS4 | Depends: T004, 005's layer
  - Verify: positions render for warehouse roles only; no substitute reservation figure is computed
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the honest-capability judgment plus a cross-tenant read surface that only warehouse may have.

- [ ] T020 Confirm the variance/reconciliation model before building any reconciliation screen; if the
  approved schema has no representation, record it rather than inventing one.
  - Req: FR-017, spec Open items | Depends: T019
  - Verify: either screens are built on real fields, or the gap is recorded in the capability map and spec
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: AC-05 reconciliation is release-blocking; pretending to support it would be worse than recording the gap.

---

## Phase 7 — Catalogue management

- [ ] T021 [PS6] Implement coffee management (create/edit/publish/unpublish) with
  `is_platform_admin()` enforcement.
  - Req: FR-002, PS6 | Depends: T004
  - Verify: non-admin roles refused; status transitions respect `coffees_status_check`
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: CRUD over an admin-scoped table.

- [ ] T022 [P] [PS6] Implement origin, region, taxonomy and warehouse management surfaces.
  - Req: FR-002, PS6 | Depends: T004
  - Verify: each respects its status vocabulary; non-admin refused
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: repetitive CRUD across several small tables.

- [ ] T023 [PS6] Implement `lib/admin/catalogue.ts` — every catalogue mutation revalidates the
  corresponding 002 public cache tag.
  - Req: FR-007, SC-005 | Depends: T021, T022
  - Verify: publishing a coffee makes it publicly visible after revalidation; unpublishing 404s it
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the one place the console touches the public surface; a missed tag leaves the public site stale.

- [ ] T024 [P] Implement media management for published content (subject to DB-BLOCK-01 for uploads).
  - Req: FR-017 | Depends: T021
  - Verify: media records manageable; upload path remains inert with an honest explanation
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: bounded surface with a known blocked seam.

---

## Phase 8 — Audit area

- [ ] T025 [PS7] Implement read-only auditor views using dedicated read-only components (no disabled
  buttons — the affordance never exists).
  - Req: FR-009, SC-007, PS7 | Depends: T004
  - Verify: auditor fixture sees data with zero mutation controls; every mutation attempt is refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: "read-only by construction" is a stronger guarantee than "disabled in the UI" and must be built that way.

- [ ] T026 [PS7] Handle `audit_logs` access honestly per DB-OPEN-06 (auditors may be unable to read
  it) — explain rather than error.
  - Req: FR-017, spec Open items | Depends: T025
  - Verify: with an auditor fixture, the audit-log area explains the limitation and cites the open item
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: honest capability reporting on a policy gap the SRS expects to be closed.

---

## Phase 9 — System configuration (SUPER_ADMIN)

- [ ] T027 [PS8] Implement platform-admin role management (SUPER_ADMIN only).
  - Req: FR-002, PS8, SEC-003 | Depends: T004
  - Verify: ADMIN is refused; SUPER_ADMIN succeeds; changes are attributable
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this surface grants operational power to people — the highest-privilege action in the system.

- [ ] T028 [P] [PS8] Implement commission tier, tax rule and shipping rule configuration
  (SUPER_ADMIN only), with clear indication that changes affect future snapshots only.
  - Req: FR-002, PS8 | Depends: T004
  - Verify: ADMIN refused; existing order snapshots are unaffected by later configuration changes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: misunderstanding snapshot semantics here could retroactively distort commercial records.

- [ ] T029 [P] [PS8] Implement payment-account configuration (`is_platform_admin()`), flagged as a
  high-risk action pending the OPS-01 dual-control decision.
  - Req: FR-002, SEC-003, spec Open items | Depends: T004
  - Verify: member paths remain absent; changes are attributable; the dual-control gap is noted in-product
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: bank-detail changes are explicitly called out as high-risk in the SRS; the missing maker-checker must be visible.

---

## Phase 10 — Automated tests

- [ ] T030 Write `tests/admin/access-matrix.test.ts` — iterate `lib/admin/areas.ts` × all six role
  fixtures + a member-without-role, asserting allowed areas render and forbidden areas are refused by
  direct URL and direct action invocation.
  - Req: FR-002, SEC-001, SC-001, SC-004 | Depends: T001, T004
  - Verify: `npm test -- admin/access-matrix` passes for every combination; adding an area without a role entry fails the test
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the definitive proof of least privilege across the whole console, and the guard against future drift.

- [ ] T031 [P] Write `tests/admin/delegation.test.ts` — the console contains no direct
  `admin_review_payment` call and no raw shipment/inventory write.
  - Req: FR-004, FR-005, SC-002 | Depends: T014, T017
  - Verify: `npm test -- admin/delegation` passes; greps are part of the assertion
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: structural guarantee that the console never becomes a second transactional engine.

- [ ] T032 [P] Write `tests/admin/decisions.test.ts` — every KYB/listing/payment/dispute decision
  records reviewer, decision and reason and changes status exactly once, including under concurrent
  operators.
  - Req: FR-006, SC-003 | Depends: T009, T011, T014
  - Verify: `npm test -- admin/decisions` passes, including the concurrency cases
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: attribution and single-effect semantics for irreversible operational decisions.

- [ ] T033 [P] Write `tests/admin/no-hard-delete.test.ts` — no console path deletes commercial,
  inventory, title, payment or audit rows.
  - Req: FR-008, SC-006 | Depends: Phases 3–9
  - Verify: `npm test -- admin/no-hard-delete` passes; grep for `.delete(` across console code returns only non-commercial cases
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: OPS-02 compliance across a broad surface.

- [ ] T034 [P] Write `tests/admin/catalogue-revalidation.test.ts` — publish/unpublish reflects on the
  public site after revalidation.
  - Req: FR-007, SC-005 | Depends: T023
  - Verify: `npm test -- admin/catalogue-revalidation` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature cache correctness with a clear assertion.

- [ ] T035 Write `tests/admin/auditor-readonly.test.ts` — auditor surfaces expose zero mutation
  affordances and refuse all mutations.
  - Req: FR-009, SC-007 | Depends: T025
  - Verify: `npm test -- admin/auditor-readonly` passes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: read-only-by-construction must be proven, not assumed.

---

## Phase 11 — States, accessibility, RTL

- [ ] T036 State coverage across all console areas (loading, empty, error, unauthorized, forbidden,
  not-found, plus domain states).
  - Req: FR-014 | Depends: Phases 3–9
  - Verify: each state renders; empty queues show honest empty states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.

- [ ] T037 Accessibility, RTL and responsive pass for the console (dense tables, keyboard traversal,
  drawer behaviour, dot+label badges, monospace codes).
  - Req: FR-015 | Depends: Phases 3–9
  - Verify: a11y check clean; grep for physical CSS properties returns nothing; tables usable by keyboard
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: dense operational tables are the hardest accessibility surface in the product.

---

## Phase 12 — Verification & closure

- [ ] T038 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T039 Confirm `/dashboard-admin` authorizes independently of `/dashboard` and that neither
  implies the other.
  - Req: FR-001, SC-004 | Depends: T038
  - Verify: an approved trading member with no operational role is refused everywhere in the console; an operator with no organization is refused member trading routes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the Constitution-locked surface-separation guarantee, checked from both directions.

- [ ] T040 Confirm no service-role usage and no public/shared caching of operational data.
  - Req: SEC-002, SEC-005, FR-011 | Depends: T038
  - Verify: `grep -rn "SERVICE_ROLE" src/app/dashboard-admin lib/admin` returns nothing; operational reads are uncached
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.

- [ ] T041 Update the roadmap for 010 and confirm OPS-01 dual control, DB-OPEN-06, DB-BLOCK-01/07 and
  the variance-model question all remain open and honestly represented in-product.
  - Req: spec Open items | Depends: T038
  - Verify: roadmap accurate; every unresolved item is visible both in the capability map and to operators where relevant
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the console is where operators would otherwise assume capabilities exist; honest representation is a governance requirement.

---

## Dependencies & parallelisation

- Phase 1 blocks everything.
- Phases 3–9 are largely parallel by area once Phase 1 lands (different route groups, different
  domain layers) — the natural multi-agent split for this feature.
- Phase 10's tests: T031–T035 parallel; T030 must follow the areas it iterates.
- Phase 12 depends on everything.

**Parallel-safe tasks**: T012, T015, T022, T024, T028, T029, T031, T032, T033, T034 (10 of 41).

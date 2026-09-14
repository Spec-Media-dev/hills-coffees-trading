# Tasks: Delivery & Shipments (009)

**Status**: Reconciled planning (RUN 0 / Phase 0, 2026-09-14) — implementation has NOT started
**Real task count**: **39** (`T001`–`T039`)
**Primary decision**: DB-BLOCK-07 (both halves — inventory reservation AND settlement-eligibility
gating) must be resolved through an approved database capability (Phase 2) before Phase 3's buyer/
warehouse domain code is built, so the product never ships a delivery-request flow that silently
reserves nothing or physically progresses an unpaid order.
**Feature 007 prerequisite**: closed; 009 consumes its checkout/shipment-planning-precondition
outputs only.
**Feature 008 dependency**: NOT a structural blocker — see spec.md's "Feature 008 dependency"
section. 009 reads only `orders.status`, which the CURRENT `admin_review_payment()` manual-approval
path already produces. Only platform-wide production trading readiness depends on Feature 008's own
completion, not any Feature 009 implementation phase.

## Task format

Every task includes its requirements, dependencies, concrete verification, and an economical
recommended agent/model. A task is not complete until its stated verification passes.
Database-phase tasks are intentionally sequenced through a design → preflight → migrate → rollback →
static-test → manual-review → **explicit user approval** → live-apply → postflight → concurrency-test
chain — never collapsed into a single "just write the SQL" step, and never implemented as an
application-side workaround.

## Phase 1 — Delivery domain foundation (can start now)

- [ ] T001 Create `lib/delivery/types.ts` and `lib/delivery/validation.ts` — DTOs and Zod schemas for
  shipment/item/address/contact/method, and the 13-status enum mirrored VERBATIM from the live
  `order_shipments_status_allowed` CHECK constraint.
  - Req: FR-007, FR-013 | Depends: —
  - Verify: tests reject unknown status strings; no DTO exposes a computed delivered quantity;
    address/contact fields are documented private (SEC-005); the 13 values match
    `docs/database/database-schema-report.json`'s live constraint exactly.
  - Recommended: Codex — Medium | Why: mechanical typing/schema work, low ambiguity.

- [ ] T002 Implement `lib/delivery/errors.ts` — map `shipment_plan_is_closed`,
  `invalid_shipment_transition`, `warehouse_required_for_operational_shipment_status`,
  `only_warehouse_can_record_delivery`, `shipment_order_item_mismatch`,
  `delivered_quantity_cannot_decrease`, `delivered_quantity_exceeds_plan`,
  `shipment_plan_exceeds_order_item`, `shipment_or_order_item_missing`,
  `shipment_details_are_locked` to safe, specific `ActionFeedbackCode`s, mirroring
  `lib/orders/errors.ts`'/`lib/finance/errors.ts`'s exact established pattern. Leave the map ready
  (documented, not populated with invented strings) for the Phase 2 settlement-gate/reservation
  exception names once they exist.
  - Req: FR-010, SC-007 | Depends: T001
  - Verify: every currently-known trigger exception (read live, not guessed) is mapped; an unmapped
    error falls back to a generic safe code and logs only the SQLSTATE-shaped diagnostic, never raw
    text/payload.
  - Recommended: Codex — Medium | Why: bounded mapping work against an already-read exception
    vocabulary.

- [ ] T003 Implement `lib/delivery/read.ts` — RLS-scoped shipment/item reads via `can_view_order`
  (buyer) or `is_warehouse_operator()` (operations), explicit column allowlists, no `select("*")`.
  - Req: FR-006, SEC-003 | Depends: T001
  - Verify: explicit selected columns only; own-org buyer and warehouse-operator reads match live
    RLS; cross-org and anonymous return nothing; no shared cache directive anywhere in the file.
  - Recommended: Codex — High | Why: dual-audience (buyer vs. warehouse) private-data scoping is
    easy to get subtly wrong.

- [ ] T004 Create `lib/delivery/transitions.ts` — a documented, read-only UI-affordance copy of the
  database's permitted-transition map, sourced from the LIVE `validate_shipment_transition` body
  (not guessed), including an explicit, prominent comment that `FAILED`/`DISPUTED` have **no**
  DB-enforced forward-transition limit today and that this file's own narrower allowlist for those
  two states is an application-level product decision, never a claim about database behavior.
  - Req: FR-003 | Depends: —
  - Verify: the file exports no function that authorizes a write; every entry matches the live
    trigger's actual transition graph; the `FAILED`/`DISPUTED` caveat is documented inline.
  - Recommended: Codex — Medium | Why: a mirrored state map is exactly the artefact that later
    drifts into being treated as authority — the framing and the FAILED/DISPUTED caveat must be
    unambiguous.

## Phase 2 — Authoritative delivery-reservation + settlement-eligibility DB capability (DB-BLOCK-07; blocking gate before Phase 3)

- [ ] T005 Formalize and obtain approval for the DB-BLOCK-07 design (plan.md's draft): resolve the
  currently-recommended-but-unapproved reserve point, the eligibility checks, the exactly-once
  cancellation/release semantics, the partial-delivery/completion behavior, and the still-open
  `DISPUTED` policy decision (freeze vs. release the reservation).
  - Req: FR-015, FR-016, SEC-001, SEC-002 | Depends: T001–T004 (context only, not a code
    dependency); Database/security specialist approval
  - Verify: an approved design record exists; it names the exact reserve point, eligibility checks,
    and `DISPUTED` policy (or explicitly defers `DISPUTED` as a recorded open item, not a silent
    guess); it classifies whether `admin_review_payment()`/`checkout_order()` need any change (this
    run's own DB inspection found they do not — the new capability is additive and independent).
  - Recommended: Database/security specialist + Codex strongest | Why: engineering may not silently
    choose the reserve point or the dispute policy — both are business/architecture decisions.

- [ ] T006 Author read-only preflight SQL: inspect current data for anything the migration must
  account for — any existing shipment already in an operational status
  (`RESERVED`/`PICKING`/`BOOKED`/`DISPATCHED`/`PARTIALLY_DELIVERED`/`DELIVERED`) attached to an order
  NOT in the settled family (possible today per this run's own finding), and any existing negative
  `available_quantity_kg`.
  - Req: SEC-001 | Depends: T005
  - Verify: preflight query set is read-only (provably no write), covers both checks above, and its
    results are recorded for the manual review in T010.
  - Recommended: Database specialist + Codex strongest | Why: financial/inventory-adjacent
    irreversible-effect surface — preflight evidence must be real before any migration is trusted.

- [ ] T007 Author migration SQL implementing T005's approved design: the reserve/release capability
  operating on `inventory_positions.available_quantity_kg`/`reserved_quantity_kg`, its trigger
  integration with `order_shipments`/`shipment_items`, the settlement-eligibility check (FR-015), and
  — if bundled per plan.md's recommendation — the small `shipments_buyer_draft_update` `WITH CHECK`
  widening to permit buyer-initiated `CANCELLED`. No unrelated table/column is touched.
  - Req: FR-015, FR-016, SEC-001 through SEC-003 | Depends: T005, T006
  - Verify: migration is additive only (no existing column/constraint/policy removed); no
    `PROOF_SUBMITTED`/`UNDER_REVIEW`/`REJECTED`-style status is repurposed; no new state vocabulary
    is invented beyond what T005 approved; RLS on any new object mirrors the `inventory_positions`
    pattern (owner + warehouse + auditor read, warehouse-only write).
  - Recommended: Database specialist + Codex strongest | Why: irreversible financial/inventory
    authority — the exact same rigor Feature 007's own DB-OPEN-16/17 migrations required.

- [ ] T008 Author rollback SQL for T007's migration.
  - Req: SEC-001 | Depends: T007
  - Verify: rollback removes exactly what T007 added, restores the pre-migration RLS/grant/trigger
    state, and is proven safe against the T006 preflight data (no data loss on rollback).
  - Recommended: Database specialist + Codex strongest | Why: a migration without a proven rollback
    is not safe to apply to the project's one Supabase instance.

- [ ] T009 Write static migration tests: schema/RLS-shape assertions against the migration file's own
  text/structure (no live apply required) — mirrors `tests/finance/rls-policy.test.ts`'s established
  static-proof convention.
  - Req: SC-008, SC-009 | Depends: T007
  - Verify: asserts the migration touches only the tables/columns T005 approved; asserts no
    `service_role` grant is added; asserts the new RLS policies match the intended
    owner/warehouse/auditor shape.
  - Recommended: Codex — High | Why: a pre-apply, cheap-to-run proof that catches scope creep before
    the expensive live-apply step.

- [ ] T010 **Manual review checkpoint (not code)**: present T006's preflight results and T007/T008's
  migration/rollback SQL for human database/security review, and obtain **explicit user approval**
  before any live apply — per the run's own migration-safety requirement for a single-Supabase-
  instance project.
  - Req: — | Depends: T006, T007, T008, T009
  - Verify: a recorded approval exists (this task cannot be marked complete by an agent's own
    authority); until approval, no later task in this phase may proceed.
  - Recommended: Human reviewer (Database/security specialist) + user | Why: irreversible live-apply
    risk on the project's only Supabase instance requires a human gate, not an agent decision.

- [ ] T011 Apply T007's migration to the live (test/staging) database, following T010's approval.
  - Req: SEC-001 | Depends: T010
  - Verify: migration applies cleanly; no unrelated object changed; `docs/database/
    database-schema-report.json` is refreshed and diffed against the pre-migration baseline to
    confirm scope.
  - Recommended: Database specialist + Codex strongest | Why: the actual irreversible-risk step.

- [ ] T012 Live postflight verification: re-run T006's preflight queries against the post-migration
  database and confirm the expected new behavior (reservation on the approved trigger point,
  settlement gate refusing an unpaid shipment's progression).
  - Req: SC-008, SC-009 | Depends: T011
  - Verify: a live, authenticated attempt to progress an unpaid order's shipment past the approved
    reserve point is refused; a live reservation attempt for a paid order succeeds and moves the
    expected `inventory_positions` quantity.
  - Recommended: Database specialist + Codex strongest | Why: proves the migration does what T005
    approved, on the real database, not merely in the SQL text.

- [ ] T013 Live concurrency / exact-once reserve-release tests: two competing shipment requests for
  the same quantity cannot both win; cancellation restores exactly once; a repeated/duplicate cancel
  does not restore twice; a listing/resale attempt cannot consume delivery-reserved quantity.
  - Req: SC-008 | Depends: T011, T012
  - Verify: concurrent-request test proves no oversubscription and no negative
    `available_quantity_kg`; repeated-cancel test proves no double-restoration.
  - Recommended: Codex strongest | Why: concurrency/exact-once correctness on a financially-adjacent
    inventory invariant — the same bar Feature 007's DB-OPEN-16 final-quantity race test set.

## Phase 3 — Buyer request + Warehouse domain operations (depends on Phase 2 being live)

- [ ] T014 Implement `lib/delivery/buyer.ts` — create `DRAFT` shipment, add/edit `shipment_items`
  while `DRAFT`, submit to `REQUESTED`, and (now that Phase 2's RLS widening is live) cancel from
  `DRAFT`. No other transition is reachable from this module.
  - Req: FR-001, SEC-003 | Depends: T002, T003, T013
  - Verify: the module exposes no operational transition; a cross-order item is refused; editing
    after `REQUESTED` is refused; cancel-from-`DRAFT` succeeds via the now-widened RLS policy.
  - Recommended: Codex — High | Why: defines the buyer's entire write surface into fulfilment —
    over-exposure here breaks the role split.

- [ ] T015 Build `src/app/dashboard/deliveries/new/page.tsx` + `actions.ts` — plan editor (select
  order items, planned quantities, address/contact/method) and submission, with an honest statement
  that the requested quantity IS now reserved (Phase 2 delivered the real guarantee — this is no
  longer a disclosed gap; if Phase 2 has not landed when this task runs, revert to the prior
  honest-disclosure copy instead).
  - Req: FR-001, FR-013, PS1 | Depends: T014
  - Verify: submitting moves status to `REQUESTED`; the DB-confirmed reservation effect (T013) is
    reflected, never independently recomputed by the page.
  - Recommended: Codex — Medium | Why: a multi-entity form whose validity rules live in the database.

- [ ] T016 Implement `lib/delivery/warehouse.ts` — guarded operations
  (`confirmCapacity`, `markReady`, `reserve`, `startPicking`, `book`, `dispatch`, `fail`, `cancel`),
  each named and scoped against the LIVE transition graph (plan.md's own verified table — not the
  old task list's assumed names), each verifying `is_warehouse_operator()` before attempting the
  transition, and confirming the application never sets `ready_at`/`orders.shipping_ready_at`
  (trigger-owned).
  - Req: FR-002, FR-004, FR-009, FR-015, SEC-001 | Depends: T002, T004, T013
  - Verify: each operation is refused for non-warehouse fixtures both in the app and by the trigger;
    no raw update path is exported; `grep -rn "ready_at\|shipping_ready_at" lib/delivery
    src/app/dashboard/deliveries` shows reads only; `reserve` is refused for an unsettled order
    (FR-015, live-proven against Phase 2).
  - Recommended: Codex — High | Why: the operational authority boundary for physical goods movement.

- [ ] T017 Implement `recordDelivery` — warehouse-only, monotonic `delivered_quantity_kg` per item,
  never computed by the application; after the write, requests the correct
  `DISPATCHED → PARTIALLY_DELIVERED`/`→ DELIVERED` transition based on comparing already-stored
  planned vs. delivered sums (a comparison, not a computed quantity), and reduces the buyer's
  `reserved_quantity_kg` by the newly delivered amount via the Phase 2 capability — never a direct
  write.
  - Req: FR-005, FR-016, SC-003 | Depends: T016
  - Verify: non-warehouse write refused; a decrease attempt refused; an over-plan attempt refused by
    the database; a full delivery leaves zero stranded reservation (T013's completion proof reused).
  - Recommended: Codex — High | Why: the write that actually reduces custody — irreversible and
    audit-relevant.

- [ ] T018 Expose the warehouse layer to 010 as a typed, guarded interface with error mapping
  included and no path that bypasses them.
  - Req: FR-009 | Depends: T016, T017
  - Verify: repo-wide call-site audit finds the exported surface contains no generic
    `updateShipmentStatus(status)` or equivalent raw setter; 010 has no raw-function bypass.
  - Recommended: Codex — Medium | Why: seam design that prevents a future console from routing
    around the role split.

## Phase 4 — Buyer tracking + module integration

- [ ] T019 Implement `src/app/dashboard/deliveries/page.tsx` — buyer shipment list with approved
  status labels.
  - Req: FR-007, PS4 | Depends: T003
  - Verify: all 13 statuses render exact labels; only own-organization shipments appear.
  - Recommended: Codex — Medium | Why: list page with a large closed vocabulary to honor.

- [ ] T020 Implement `src/app/dashboard/deliveries/[shipmentId]/page.tsx` — status timeline,
  per-item planned vs. delivered quantities, address/contact, failure/cancellation/dispute reason
  with a route toward 012 for `DISPUTED`.
  - Req: FR-007, FR-012, PS3, PS4 | Depends: T003
  - Verify: partial delivery shows per-item figures; `FAILED`/`CANCELLED`/`DISPUTED` show reasons;
    `DISPUTED` links toward 012 without implementing dispute mechanics itself.
  - Recommended: Codex — High | Why: several data relationships must render coherently, including
    failure paths and the `DISPUTED` boundary with 012.

- [ ] T021 Build `components/delivery/status-timeline.tsx` and `item-quantities-table.tsx`.
  - Req: FR-007, FR-013 | Depends: T001
  - Verify: quantities render with units; status is never conveyed by color alone (icon/text pairing);
    the table collapses to a stacked/card layout at mobile width.
  - Recommended: Codex — Medium | Why: focused presentational components.

- [ ] T022 Link delivery outcomes to custody changes in 005 (read-only composition).
  - Req: PS5 | Depends: T020, 005's existing read layer
  - Verify: after recorded delivery, the linked custody view reflects the approved model's change;
    nothing about custody is recomputed here.
  - Recommended: Codex — Medium | Why: cross-feature read composition, no new custody logic.

- [ ] T023 Register the `deliveries` nav entry and the "where is it" overview contribution with 004's
  dashboard module contract.
  - Req: FR-011 | Depends: T019
  - Verify: entry appears for member organizations; the summary query is bounded; anonymous/
    unauthorized routes are denied server-side independent of nav visibility.
  - Recommended: Codex — Medium | Why: contract-conformant registration.

## Phase 5 — Release-blocking transactional and security tests

- [ ] T024 Write `tests/delivery/transition-matrix.test.ts` — every permitted transition succeeds for
  the correct role; every forbidden one is refused by the database, including the `FAILED`/
  `DISPUTED` application-level narrowing (T004's documented caveat).
  - Req: FR-002, FR-003, SC-002 | Depends: T014, T016
  - Verify: full map coverage passes live against the fixture database.
  - Recommended: Codex — High | Why: the state machine is large; systematic coverage is the only way
    to know the app cooperates with it correctly.

- [ ] T025 Write `tests/delivery/buyer-role-negatives.test.ts` — a buyer attempting each operational
  status directly (including via a raw table update, not only through the app's own functions) is
  refused.
  - Req: SEC-001, SC-001 | Depends: T014, T016
  - Verify: every operational status is refused for a buyer fixture, both through app functions and
    direct RLS-authorized attempts.
  - Recommended: Codex — High | Why: the role-split guarantee for physical goods movement.

- [ ] T026 Write `tests/delivery/delivered-quantity.test.ts` — non-warehouse write refused, decrease
  refused, over-plan refused, partial→complete progression works.
  - Req: FR-005, SC-003 | Depends: T017
  - Verify: all four cases pass.
  - Recommended: Codex — High | Why: monotonic, warehouse-only custody reduction is audit-critical.

- [ ] T027 Write DB-BLOCK-07 reservation-atomicity tests: a reservation reduces tradable quantity
  atomically at the approved point; a listing/resale cannot consume delivery-reserved quantity; a
  second shipment cannot reserve the same unavailable quantity; a cross-org request cannot reserve
  another organization's inventory.
  - Req: SC-008, SEC-002, SEC-003 | Depends: T013, T016
  - Verify: all four cases pass live.
  - Recommended: Codex strongest | Why: the core AC-04 proof — financial/inventory-adjacent
    correctness.

- [ ] T028 Write DB-BLOCK-07 concurrency tests: two competing shipment requests cannot both win
  beyond available quantity; cancellation restores exactly once; repeated/duplicate cancellation does
  not restore twice.
  - Req: SC-008 | Depends: T013, T016
  - Verify: concurrent-request race test and repeated-cancel test both pass, reusing T013's DB-layer
    proof at the application-call layer.
  - Recommended: Codex strongest | Why: concurrency correctness — the exact bar Feature 007's
    DB-OPEN-16 race test set for checkout.

- [ ] T029 Write DB-BLOCK-07 partial-delivery, completion, failure/dispute, and audit tests: partial
  delivery updates the reservation correctly; a completed delivery leaves no stranded reservation;
  failure/dispute behavior follows T005's approved (or explicitly still-open) policy; the application
  source contains no direct `inventory_positions` write; an unsettled order cannot be physically
  released; reservation effects remain audit-correlated (traceable to the shipment/order that caused
  them).
  - Req: FR-015, FR-016, SC-008, SC-009 | Depends: T013, T017
  - Verify: all cases pass; a static source-grep confirms zero direct `inventory_positions` write
    outside the approved DB function call path.
  - Recommended: Codex strongest | Why: completes the DB-BLOCK-07 proof matrix the run directive
    requires.

- [ ] T030 Write `tests/delivery/isolation.test.ts` and `plan-closure.test.ts` — cross-organization
  invisibility; item edits refused after `REQUESTED`; cross-order items refused.
  - Req: FR-001, FR-006, SC-005 | Depends: T003, T014
  - Verify: both suites pass.
  - Recommended: Codex — High | Why: tenant isolation plus plan-closure semantics.

- [ ] T031 Write `tests/delivery/error-mapping.test.ts` — every known trigger exception maps to a
  safe, specific code; an unmapped error falls back safely; no raw database text reaches a client.
  - Req: FR-010, SC-007 | Depends: T002
  - Verify: suite passes; source-grep confirms no raw error passthrough.
  - Recommended: Codex — Medium | Why: focused mapping test.

- [ ] T032 Audit source for no service-role usage, no shared cache of delivery data, no public
  exposure of warehouse locations/addresses/private contact details, and no unsafe logging.
  - Req: SEC-004, SEC-005, FR-008, FR-014 | Depends: T014–T023
  - Verify: repository search finds no `service_role`/`SERVICE_ROLE`, no
    `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife`/`updateTag`, and no public-route import of
    `lib/delivery/*`.
  - Recommended: Codex — High | Why: cross-cutting security proof, release-blocking per SEC-004/005.

## Phase 6 — States, accessibility, RTL, and browser proof

- [ ] T033 Cover loading, empty, error, unauthorized, suspended, requested, capacity-confirmed,
  ready, reserved, picking, booked, dispatched, partially-delivered, delivered, failed, cancelled,
  and disputed states honestly across delivery screens.
  - Req: FR-012, SC-004 | Depends: T019, T020, T021
  - Verify: each state renders for a seeded fixture; no state implies a guarantee (e.g., reservation)
    the current database phase has not actually proven.
  - Recommended: Codex — High | Why: broad but well-specified; truthfulness matters as much as
    coverage.

- [ ] T034 Run real authenticated browser and axe verification across implemented delivery surfaces
  at EN/LTR light/dark 1366px and AR/RTL light/dark 390px, with applicable desktop coverage.
  - Req: FR-013, SC-006 | Depends: T033
  - Verify: zero serious/critical axe issues; no overflow/viewport crossing; keyboard/focus/44px
    targets pass; quantities always carry units; codes/ids are monospaced; status is never conveyed
    by color alone; Sonner is single-provider.
  - Recommended: Codex — High | Why: real UI/accessibility evidence, not a static assertion.

## Phase 7 — Final verification, stability, and closure

- [ ] T035 Run Feature 009/product application lint scope, `npm run typecheck`, full `npm test`,
  `npm run build`, and `git diff --check`.
  - Req: SC-006 | Depends: all implemented in-scope tasks
  - Verify: product scope exits 0; typecheck/tests/build/diff-check pass.
  - Recommended: Codex — Medium | Why: mechanical, evidence-driven closure.

- [ ] T036 Run repository-wide `npm run lint` and report its REAL exit code/count, compared against
  the established historical `docs/claude-design/**` baseline (the same precedent Feature 007/008
  already set) — never claim a literal repo-wide exit-0 that does not exist.
  - Req: SC-006 | Depends: T035
  - Verify: repo-wide lint result is reported honestly; zero new non-baseline finding is confirmed by
    diffing the file list against the recorded baseline.
  - Recommended: Codex — Medium | Why: corrects the old task list's stale literal-exit-0 assumption.

- [ ] T037 Confirm no application-side inventory reservation was introduced for deliveries outside
  the approved Phase 2 database call path (DB-BLOCK-07 respected end to end).
  - Req: spec Open items, Constitution IX/X | Depends: T035
  - Verify: `grep -rn "reserved_quantity_kg\|available_quantity_kg" lib/delivery
    src/app/dashboard/deliveries` shows reads and approved-function calls only, never a direct write.
  - Recommended: Codex — High | Why: the single most important restraint in this feature.

- [ ] T038 Reconcile the roadmap and `docs/architecture/DATABASE-CAPABILITY-MAP.md`: mark
  **DB-BLOCK-07 RESOLVED** (both halves) with its migration evidence if Phase 2 genuinely landed and
  is live-proven; otherwise record its exact remaining state honestly — never mark it resolved
  without live evidence, and never leave it silently open while claiming feature closure. State
  plainly whether 009's own implementation is complete versus whether final production/end-to-end
  closure remains gated on Feature 008's own production readiness (the platform-level distinction
  spec.md's "Feature 008 dependency" section already frames).
  - Req: spec Open items, FR-015, FR-016 | Depends: T036, T037
  - Verify: every open item has an owner/classification; the capability map and this feature's status
    line agree; no cross-feature scope is claimed complete that was not actually implemented here.
  - Recommended: Codex — Medium | Why: multi-agent continuity — this is the honest go/no-go record.

- [ ] T039 Perform a final independent scope/constitution/security review before closing Feature 009.
  - Req: all FR/SEC/SC | Depends: T038
  - Verify: no application-side inventory/settlement workaround exists, all guards/tests are
    evidenced, DB-BLOCK-07's true resolution state is accurately recorded, and remaining
    production-trading gates (Feature 008's own completion) are explicitly listed, not implied.
  - Recommended: Codex strongest | Why: final architecture review before closure.

---

## Dependencies and parallelisation

- Phase 1 is the only phase that can start with zero preconditions; T001 blocks T002/T003/T004
  somewhat loosely (T002/T004 need only the exception/transition vocabulary, not T001's types), but
  all four are effectively parallel-safe once the live schema/trigger facts are read.
- Phase 2 is a hard sequential chain (T005 → T006/T007 → T008/T009 → **T010 human approval gate** →
  T011 → T012 → T013). Nothing in Phase 2 is parallel-safe across the approval gate.
- Phase 3 depends on Phase 2 being LIVE (T013 complete) — this is a deliberate reordering from the
  old task list, so buyer/warehouse domain code is built against the real reservation/settlement-gate
  capability from day one rather than retrofitted onto it later.
- Phase 4 depends on Phase 1's read layer (T003) and, for full honesty in T015's copy, on Phase 2/3.
- Phase 5's tests depend on the specific Phase 2/3 capability each proves; T027–T029 specifically
  require T013 (the live DB capability) and T016/T017 (the application call sites).
- Phase 6/7 apply only to what was actually implemented and must not manufacture DB-BLOCK-07 proof
  that Phase 2 did not actually deliver.

**Database migration safety note**: Phase 2 is flagged as needing its OWN preflight/manual-application
run, separate in spirit (though grouped under one RUN label below) from ordinary implementation work,
because it is the project's only Supabase instance and the change is financially-adjacent (inventory
truth feeding a release-blocking acceptance criterion) even though it is not itself a payments change.

## Recommended implementation RUN grouping (target ~4 runs after Run 0)

| RUN | Phases | Tasks | Recommended model | Live DB approval/manual apply expected? |
|---|---|---|---|---|
| **RUN A1** | Phase 1 + Phase 2 design/preflight/migration-authoring (no live effect) | T001–T009 | Codex — High/strongest for Phase 2 items | No — all SQL is authored, not applied |
| **RUN A2** | Phase 2 approval + apply (gated) | T010–T013 | Database/security specialist + Codex strongest | **YES — explicit user approval required before T011; this is the single highest-risk step in Feature 009** |
| **RUN B** | Phase 3 | T014–T018 | Codex — High | No |
| **RUN C** | Phase 4 + Phase 5 | T019–T032 | Codex — High/strongest for the DB-BLOCK-07 suite | No (reads/tests against the already-live Phase 2 capability) |
| **RUN D** | Phase 6 + Phase 7 | T033–T039 | Codex — High | No |

RUN A is explicitly split into A1 (safe, no live database effect) and A2 (the manual-apply gate) per
the run directive's own instruction to say so when a phase's migration risk warrants its own
preflight/manual-application step — collapsing A1/A2 into a single RUN would understate that T010's
approval is a genuine stop-the-line checkpoint, not a formality.

## Old T001–T027 → New task mapping

| Old task | New task(s) | Note |
|---|---|---|
| T001 | T001 | Split into `types.ts` + `validation.ts`, unchanged scope |
| T002 | T004 | Renumbered; FAILED/DISPUTED caveat added |
| T003 | T002 | Renumbered; exception list expanded with the live-read full set |
| T004 | T003 | Renumbered, unchanged scope |
| T005 | T014 | Now depends on Phase 2 (T013) rather than being buildable standalone |
| T006 | T015 | Now depends on T014; copy reframed once Phase 2 delivers the real guarantee |
| T007 | *Retired as a standalone task* | Its honest-disclosure intent is superseded by T015's "the guarantee is real" framing once Phase 2 lands; if Phase 2 is ever deferred past Phase 3, its reasoning is reintroduced inline in T015 |
| T008 | T016 | Renumbered; operation names corrected against the LIVE transition graph (see plan.md's table) — `markReady`/`book` added, none removed |
| T009 | T017 | Renumbered; now also specifies the delivered→reservation-release interaction (design item 5) |
| T010 | *Merged into T016's verification* | Mechanical grep check, not worth a standalone task |
| T011 | T018 | Renumbered, unchanged scope |
| T012 | T019 | Renumbered, unchanged scope |
| T013 | T020 | Renumbered, unchanged scope |
| T014 | T021 | Renumbered, unchanged scope |
| T015 | T022 | Renumbered, unchanged scope |
| T016 | T023 | Renumbered, unchanged scope |
| T017 | T024 | Renumbered; now also covers the FAILED/DISPUTED app-level narrowing |
| T018 | T025 | Renumbered, unchanged scope |
| T019 | T026 | Renumbered, unchanged scope |
| T020 | T030 | Renumbered, unchanged scope |
| T021 | T031 | Renumbered, unchanged scope |
| T022 | T033 | Renumbered, unchanged scope |
| T023 | T034 | Renumbered, unchanged scope |
| T024 | T035 + T036 | Split: product-scope closure (T035) vs. honest repo-wide lint baseline comparison (T036) — corrects the stale literal-exit-0 assumption |
| T025 | T037 | Renumbered, unchanged scope |
| T026 | T032 | **Moved earlier**, from final-closure-only into Phase 5 as a release-blocking security test |
| T027 | T038 | **Reframed**: DB-BLOCK-07 is expected **RESOLVED** by this point (Phase 2 having landed), not deliberately left open at closure — the central correction this reconciliation run was asked to make |
| *(none)* | T005–T013 | New — the entire Phase 2 DB-BLOCK-07 design/migration/apply/verify chain |
| *(none)* | T027–T029 | New — the DB-BLOCK-07 reservation/concurrency/completion/audit test suite (spec.md SC-008/SC-009) |
| *(none)* | T039 | New — final independent review, mirroring Feature 008's own closure precedent |

**Task count reconciliation**: the old 27 tasks map to 24 renumbered/merged/reframed tasks (T007 and
old-T010 retired as standalone items) plus 15 genuinely new tasks (T005–T013, T027–T029, T039) = **39
real, sequential IDs.** No task is marked complete by this documentation-only Run 0.

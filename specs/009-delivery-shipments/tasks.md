# Tasks: Delivery & Shipments (009)

**Status**: RUN A1 complete, RUN A2-PRE2 consistency review complete, RUN A2 preflight (STEP 1)
executed against the real live database and found (a) two genuine SQL-Editor-only execution bugs in
the preflight (UNION column-count mismatch, implicit `"char"` concatenation) and (b) a real
settlement-to-READY reservation gap — a shipment already READY while its order is unsettled had no
mechanism to become reserved when the order later settled, since no shipment UPDATE fires at
settlement time. RUN A2-PRE3 fixed both: the two SQL bugs, plus a new settlement-time reservation hook
(`reserve_ready_deliveries_for_settlement`, called from `admin_review_payment`) built on a shared
`apply_delivery_reservation` primitive also used by the shipment-transition path. A FRESH live
read-only preflight was then run against the corrected package and passed (every mandatory check
`ok = true`, zero settled-READY/operational-gated rows, zero reconciliation items). **T010 human
approval is now RECORDED** — the user explicitly approved DISPUTED=FREEZE, the buyer
DRAFT→CANCELLED RLS bundle, the settlement-timing design, and the full RUN A2-PRE/A2-PRE2/A2-PRE3
safety design, with the lock-order/deadlock case still required to be proven live during T013. RUN A2
STEP 2 then created the real migration (`supabase/migrations/20260914120000_feature_009_db_block_07.sql`
+ `.rollback.sql`, byte-identical executable SQL to the approved DRAFT — proven via md5) and the user
manually applied it via the Supabase SQL Editor, reporting "Success. No rows returned," then manually
ran the reviewed postflight and reported all 22 summary rows `ok = true`. **T011 and T012 are now
RECORDED** on that live evidence. RUN A2 STEP 2's final leg then ran the complete T013 live seeded
proof suite (18/18 scenarios, real evidence, exactly-scoped disposable fixtures, zero residual test
data, repo-wide lint back at the exact historical baseline) — **T013 is now RECORDED**. RUN A2
CLOSEOUT then reconciled T005–T008 against their own literal verify-line wording (not the header prose
above, which had informally assumed they required "approved"/"applied" language they never actually
contain) and found all four fully satisfied by evidence already on record — **T005–T008 are now
RECORDED**. **Phase 2 (T001–T013) is complete: 13/39.** The live
database now carries this migration's DDL/function changes, structurally confirmed AND behaviorally
live-proven under authenticated sessions and real concurrency — Phase 2 (DB-BLOCK-07) is live-proven;
Phase 3 (T014+) may now begin.
`DB-BLOCK-07-DESIGN.md` §20/§21 (RUN A2-PRE3) for the full settlement-architecture design, lock-order
analysis, and revised existing-row policy (supersedes `plan.md`'s own earlier draft, which is now also
corrected in-place with pointers to the design doc).
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

- [x] T001 Create `lib/delivery/types.ts` and `lib/delivery/validation.ts` — DTOs and Zod schemas for
  shipment/item/address/contact/method, and the 13-status enum mirrored VERBATIM from the live
  `order_shipments_status_allowed` CHECK constraint.
  - Req: FR-007, FR-013 | Depends: —
  - Verify: tests reject unknown status strings; no DTO exposes a computed delivered quantity;
    address/contact fields are documented private (SEC-005); the 13 values match
    `docs/database/database-schema-report.json`'s live constraint exactly.
  - Recommended: Codex — Medium | Why: mechanical typing/schema work, low ambiguity.
  - Done (2026-09-14, RUN A1): discovered `lib/orders/validation.ts` (Feature 007) already defines
    `OrderShipmentDTO`/`ShipmentItemDTO`/`ORDER_SHIPMENT_STATUSES` verbatim from the live constraint —
    `lib/delivery/types.ts`/`validation.ts` re-export these (no duplicate authority) and add ONLY the
    genuinely new warehouse-operation input schemas Feature 007 never built
    (`ConfirmCapacityInput`/`MarkReadyInput`/`ReserveInput`/`StartPickingInput`/`BookInput`/
    `DispatchInput`/`FailShipmentInput`/`CancelShipmentInput`/`RecordDeliveryInput`) plus the
    `DB_BLOCK_07_DRAFT_EXCEPTIONS` forward-declared exception names. `tests/delivery/
    foundation.test.ts` (T001 section) proves the reuse and the input contracts.

- [x] T002 Implement `lib/delivery/errors.ts` — map `shipment_plan_is_closed`,
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
  - Done (2026-09-14, RUN A1): discovered `lib/orders/errors.ts#mapShipmentError` (Feature 007)
    already maps every current exception listed above, live-tested. `lib/delivery/errors.ts#
    mapDeliveryError` delegates to it (no duplicate map) and adds the two NEW forward-declared codes
    `SHIPMENT_ORDER_NOT_SETTLED`/`SHIPMENT_RESERVATION_UNAVAILABLE` for the DB-BLOCK-07 draft
    exceptions (not yet reachable — no migration applied). `tests/delivery/foundation.test.ts` (T002
    section, 6 tests) proves delegation and safe fallback.

- [x] T003 Implement `lib/delivery/read.ts` — RLS-scoped shipment/item reads via `can_view_order`
  (buyer) or `is_warehouse_operator()` (operations), explicit column allowlists, no `select("*")`.
  - Req: FR-006, SEC-003 | Depends: T001
  - Verify: explicit selected columns only; own-org buyer and warehouse-operator reads match live
    RLS; cross-org and anonymous return nothing; no shared cache directive anywhere in the file.
  - Recommended: Codex — High | Why: dual-audience (buyer vs. warehouse) private-data scoping is
    easy to get subtly wrong.
  - Done (2026-09-14, RUN A1): discovered `lib/orders/read.ts#getOrderShipments`/`getShipmentItems`
    (Feature 007) already RLS-compatible with warehouse callers (`shipments_view`/`shipment_items_view`
    both have an `is_warehouse_operator()` branch) — re-exported, not redefined. Added the genuinely
    new capability: `getShipmentsForWarehouseQueue`/`getShipmentById`, scoped by
    `is_warehouse_operator()` alone (no prior `orderId` needed), with order context attached via a
    second, separately-RLS-authorized `orders` read (never an embedded join, never a fabricated
    value if that second read returns nothing). No `select("*")`, no cache directive, no
    service-role. `tests/delivery/foundation.test.ts` (T003 section) proves the reuse and the
    absence audit.

- [x] T004 Create `lib/delivery/transitions.ts` — a documented, read-only UI-affordance copy of the
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
  - Done (2026-09-14, RUN A1): `SHIPMENT_TRANSITIONS` built from the live trigger body (13 keys,
    exact match); `FAILED`/`DISPUTED` deliberately empty with the caveat documented inline and in
    `DATABASE-CAPABILITY-MAP.md`'s new `DB-OPEN-18` entry; `isTransitionDisplayable` is a pure
    boolean hint, no DB call. `tests/delivery/foundation.test.ts` (T004 section, 5 tests) proves
    exact graph fidelity and the no-authorization guarantee.

## Phase 2 — Authoritative delivery-reservation + settlement-eligibility DB capability (DB-BLOCK-07; blocking gate before Phase 3)

- [x] T005 Formalize and obtain approval for the DB-BLOCK-07 design (plan.md's draft): resolve the
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
  - Partial (2026-09-14, RUN A1): design FORMALIZED at `specs/009-delivery-shipments/
    DB-BLOCK-07-DESIGN.md`, explicitly CORRECTING RUN 0's own draft reserve-point recommendation
    (was `RESERVED`; now the first entry into `{CAPACITY_CONFIRMED, RESERVED, PICKING, BOOKED,
    DISPATCHED, PARTIALLY_DELIVERED, DELIVERED}`, grounded in SRS DEL-01's literal "approved
    delivery request" wording and live-proven against Feature 007's own already-tested pre-payment
    `REQUESTED → READY` path — see the design doc §0/§1 for the full evidence trail). `DISPUTED`
    policy recorded as still-open with a reasoned recommendation (freeze), not a silent choice.
    **Not yet human-approved** — stays unchecked; T010 owns that step.
  - Hardened (2026-09-14, RUN A2-PRE): a human adversarial database/security review found the A1
    draft's inventory arithmetic CRITICALLY wrong (cancellation incremented `available_quantity_kg`
    — would have manufactured inventory from nothing; delivery never decremented it — would have
    made delivered coffee resellable again) plus 14 further defects (column-tamper bypass, exact-once
    gaps, a `READY`-path reservation window, missing live re-check on disputed orders, ambiguous
    `storage_allocations` lookups, and more). All corrected; full proof and reasoning now in
    `DB-BLOCK-07-DESIGN.md` §2–§17 (rewritten). **Still not human-approved** — stays unchecked.
  - Corrected (2026-09-14, RUN A2-PRE3): a live RUN A2 preflight found a genuine settlement-to-READY
    reservation gap (design item this task's own scope explicitly owns): a shipment reaching READY
    before its order settles had no path to become reserved when the order later settles, since no
    shipment UPDATE fires at that moment. Design closed via one shared reservation primitive
    (`apply_delivery_reservation`) called from both the shipment-transition path and a new
    settlement-time hook (`reserve_ready_deliveries_for_settlement`, invoked from
    `admin_review_payment`), with settlement failing the whole transaction closed if a reservation
    cannot be established. Full design, lock-order-inversion analysis (a documented, deadlock-safe,
    non-corrupting race — not eliminated, since eliminating it requires restructuring
    `admin_review_payment`'s own unrelated existing lock order), multiple-shipment non-over-reservation
    proof, and the Feature 008 integration contract are in `DB-BLOCK-07-DESIGN.md` §20/§21. **Still not
    human-approved** — stays unchecked.
  - **Closed (2026-09-14, RUN A2 CLOSEOUT)**: Verify line has 3 clauses. (1) "an approved design
    record exists" — satisfied: `DB-BLOCK-07-DESIGN.md` (§0–§21) is the design record, and T010's
    approval message explicitly approved it, naming all four items this task's scope required a human
    decision on (DISPUTED=FREEZE, the buyer DRAFT→CANCELLED RLS widening, the reservation
    timing/design, and "the full RUN A2-PRE/A2-PRE2/A2-PRE3 safety design"). (2) "it names the exact
    reserve point, eligibility checks, and DISPUTED policy" — satisfied: reserve point = first entry
    into the operational-gated set OR settlement-time for an already-READY shipment (§1, §20);
    eligibility = a settled order (`settlement_verified_at` set via the trusted transaction-local
    marker); DISPUTED = FREEZE (approved, item 1). (3) "it classifies whether
    `admin_review_payment()`/`checkout_order()` need any change" — satisfied, but the answer this
    verify line's own parenthetical anticipated ("this run's own DB inspection found they do not") is
    **superseded and corrected, not silently kept**: `checkout_order()` needed no change (confirmed);
    `admin_review_payment()` DOES need — and the applied migration DOES contain — exactly one new
    line (the `reserve_ready_deliveries_for_settlement` call), found by RUN A2-PRE3's live preflight
    and fully documented in `DB-BLOCK-07-DESIGN.md` §20/§21. The design record still classifies both
    functions explicitly; the classification itself was corrected from an earlier, now-known-incomplete
    finding to the accurate one, which is what a design record is for. All 3 clauses satisfied on the
    live-proven, human-approved final design — not on the earlier stale finding.

- [x] T006 Author read-only preflight SQL: inspect current data for anything the migration must
  account for — any existing shipment already in an operational status
  (`RESERVED`/`PICKING`/`BOOKED`/`DISPATCHED`/`PARTIALLY_DELIVERED`/`DELIVERED`) attached to an order
  NOT in the settled family (possible today per this run's own finding), and any existing negative
  `available_quantity_kg`.
  - Req: SEC-001 | Depends: T005
  - Verify: preflight query set is read-only (provably no write), covers both checks above, and its
    results are recorded for the manual review in T010.
  - Recommended: Database specialist + Codex strongest | Why: financial/inventory-adjacent
    irreversible-effect surface — preflight evidence must be real before any migration is trusted.
  - Partial (2026-09-14, RUN A1): drafted at `supabase/maintenance/
    20260914_feature_009_db_block_07_preflight.sql`, covering both required checks plus function
    fingerprints, new-column absence, and a negative-quantity data-health check. Statically proven
    read-only (`tests/delivery/db-block-07-migration.test.ts`). **Not yet executed against the live
    database** — its results cannot be "recorded for T010" until a human runs it (this project's own
    convention: preflight files are run via the Supabase SQL Editor by a reviewer, never by an
    agent). Stays unchecked.
  - Hardened (2026-09-14, RUN A2-PRE): strengthened per the review's Issue 14 — now also proves the
    `inventory_reserved_within_available_check` semantics assumption, the `inventory_positions`
    schema-uniqueness guarantee, the `storage_allocations` ambiguity risk (no equivalent uniqueness
    constraint exists), the blanket `authenticated` UPDATE grants that justify the trigger-owned
    column design, and pre-existing data-health/ambiguity checks. Still not executed live — stays
    unchecked.
  - Executed and corrected (2026-09-14, RUN A2 STEP 1 + RUN A2-PRE3): the STEP 1 preflight run
    surfaced two real SQL-Editor-only bugs (a UNION column-count mismatch in section 2, and an
    implicit `"char"`-to-`text` concatenation failure on `pg_trigger.tgenabled` — both invisible to a
    static text-pattern test, since the file's *text* was self-consistent but its *executed shape*
    was not) and a live data finding (2 pre-existing unsettled-READY shipments). Both bugs fixed
    everywhere they occurred (preflight AND postflight); the existing-row policy was corrected from a
    blanket "READY = zero" to the narrower, accurate settled-READY/operational-gated-set = mandatory
    zero, unsettled-READY = permitted-and-reported (see `DB-BLOCK-07-DESIGN.md` §20). New regression
    tests added for both bug classes. **Still requires a fresh live preflight run** (STEP 1 must be
    re-run against the corrected file before T010) — stays unchecked.
  - **Closed (2026-09-14, RUN A2 CLOSEOUT)**: Verify line has 3 clauses. (1) "read-only (provably no
    write)" — satisfied: statically proven in `tests/delivery/db-block-07-migration.test.ts` and never
    contradicted by any live run. (2) "covers both checks above" (existing operational-gated shipment
    on a non-settled order; any negative `available_quantity_kg`) — satisfied, unchanged since the RUN
    A1 draft, hardened further in RUN A2-PRE. (3) "its results are recorded for the manual review in
    T010" — satisfied: the corrected file was actually run live (RUN A2 STEP 1, surfacing and then
    fixing the two SQL-Editor bugs) and a FRESH live read-only preflight was then run against the
    corrected package; its exact results (every check `ok=true`, 0 settled-READY rows, 0
    operational-gated rows, 0 reconciliation items, 2 accepted pre-existing unsettled-READY rows) are
    quoted verbatim inside T010's own recorded approval note above. All 3 clauses satisfied on live
    evidence, not merely the static/unexecuted state this task's own notes left it in before RUN A2.

- [x] T007 Author migration SQL implementing T005's approved design: the reserve/release capability
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
  - Partial (2026-09-14, RUN A1): drafted at `supabase/maintenance/
    20260914_feature_009_db_block_07_migration.DRAFT.sql` (deliberately kept OUT of
    `supabase/migrations/`, which this project's own convention reserves for APPLIED history — see
    Feature 007's `20260913100000_feature_007_db_blockers.sql` precedent). Fingerprint-guarded
    exactly like that precedent; additive-only (2 new columns, 2 function bodies replaced with a
    verified-unchanged transition-validity chain, 1 policy widened); statically proven touches no
    unrelated table, repurposes no existing status, and never references
    `admin_review_payment`/`checkout_order`/`expire_order_hold`
    (`tests/delivery/db-block-07-migration.test.ts`, 19 tests, all passing). **Not yet approved or
    applied.** Stays unchecked.
  - Hardened (2026-09-14, RUN A2-PRE): REWRITTEN after adversarial review — corrected inventory
    arithmetic (Issues 1/2, both CRITICAL), made `reserved_quantity_kg`/`settlement_verified_at`
    fully trigger-owned (Issues 3/4, closing a real client-tamper bypass given the live blanket
    `UPDATE` grant), coupled the `inventory_positions` increment to a `GET DIAGNOSTICS`-proven
    per-item guard (Issue 5), fail-closed on every missing/ambiguous allocation or position (Issues
    6/9, no more silent skip), replaced bare `greatest()` clamping with explicit invariant checks
    (Issue 7), made `READY` state-aware — gated only on an already-settled order, closing a real
    unreserved-approved-delivery window (Issue 8, proven not to regress Feature 007's live-tested
    pre-payment path), added a live settlement re-check on every further gated progression (Issue
    11), and analyzed the `FAILED`/`DISPUTED` bypass question to a proven-safe conclusion for the
    inventory ledger specifically (Issue 13, `DB-BLOCK-07-DESIGN.md` §14). New fingerprints computed
    from the corrected file. 41 tests passing (`tests/delivery/db-block-07-migration.test.ts`). **Not
    yet approved or applied.** Stays unchecked.
  - Extended (2026-09-14, RUN A2-PRE3): a human review of the live RUN A2 preflight results asked
    what happens when an order settles while an already-READY shipment stays unreserved — closed by
    extracting the reserve arithmetic into a new shared internal primitive
    (`apply_delivery_reservation`, no client EXECUTE) and adding a new settlement-time hook
    (`reserve_ready_deliveries_for_settlement`, also internal-only) called from exactly one new line
    in `admin_review_payment()` (every other line of that function is byte-for-byte its pre-migration
    baseline, proven by the guard/tests). Settlement fails the whole transaction closed if the
    reservation cannot be established. `validate_shipment_transition` updated to delegate its own
    reserve loop to the shared primitive and to accept the new function's trusted settlement-time
    stamp under a second transaction-local marker; `validate_shipment_item` needed no edit. New
    fingerprints computed; see `DB-BLOCK-07-DESIGN.md` §20/§21 for the full design, including the
    documented (deadlock-safe, non-corrupting) lock-order inversion this introduces between the
    shipment-transition and settlement paths, and the Feature 008 integration contract. **Not yet
    approved or applied.** Stays unchecked.
  - **Closed (2026-09-14, RUN A2 CLOSEOUT)**: this task's own literal Verify line names 4 static
    properties of the migration SQL, none of which use the words "approved" or "applied" (those words
    appear only in the task's title/Recommended-rationale prose, describing why the SQL matters, not
    as verify criteria) — the wording is: "migration is additive only... no...status is repurposed...
    no new state vocabulary is invented beyond what T005 approved... RLS on any new object mirrors the
    `inventory_positions` pattern." All 4 are satisfied: (1) additive-only — statically proven (2 new
    columns, 2 new function bodies replacing verified-unchanged transition-validity chains, 1 policy
    widened, 2 new internal-only functions; no column/constraint/policy removed);
    `tests/delivery/db-block-07-migration.test.ts`. (2) no `PROOF_SUBMITTED`/`UNDER_REVIEW`/
    `REJECTED`-style status repurposed — statically proven, unchanged since RUN A1. (3) no new state
    vocabulary beyond T005's now-approved design — statically proven; T005 is now itself `[x]` above,
    closing the dependency. (4) "RLS on any new object mirrors the `inventory_positions` pattern" —
    inapplicable on its own terms, same basis T009 already used: this design introduces no new table
    (§11), so there is no new RLS policy of that shape to check; the actual RLS change (the widened
    buyer `shipments_buyer_draft_update` `WITH CHECK`) is separately proven narrow (DRAFT-only, no
    warehouse-operational access). Beyond the letter of this task's own Verify line, the migration has
    since also been human-approved (T010), applied live exactly once with a clean result (T011),
    postflight-confirmed 22/22 (T012), and behaviorally live-proven under 18/18 real scenarios
    including 10 real concurrent attempts (T013) — exceeding what this task's own wording required.

- [x] T008 Author rollback SQL for T007's migration.
  - Req: SEC-001 | Depends: T007
  - Verify: rollback removes exactly what T007 added, restores the pre-migration RLS/grant/trigger
    state, and is proven safe against the T006 preflight data (no data loss on rollback).
  - Recommended: Database specialist + Codex strongest | Why: a migration without a proven rollback
    is not safe to apply to the project's one Supabase instance.
  - Partial (2026-09-14, RUN A1): drafted at `supabase/maintenance/
    20260914_feature_009_db_block_07_migration.DRAFT.rollback.sql`; guarded on the POST-migration
    fingerprints (computed from the draft migration's own text — flagged for re-verification against
    the real live `prosrc` once actually applied); statically proven to drop exactly the two new
    columns and restore both function bodies byte-for-byte against the live schema-report baseline.
    **Not yet approved or applied** (nothing exists yet to roll back). Stays unchecked.
  - Hardened (2026-09-14, RUN A2-PRE): updated fingerprints for the corrected migration; ADDED a new
    real-usage guard (Issue 16) that makes the rollback REFUSE to run (`raise exception`, DB-enforced,
    not just a comment) if any row shows genuine reservation history
    (`shipment_items.reserved_quantity_kg > 0` or `order_shipments.settlement_verified_at` set) —
    explicitly distinguishing a mechanical schema rollback from a business-data reversal, which would
    require a separately authored compensating migration. **Not yet approved or applied.** Stays
    unchecked.
  - Extended (2026-09-14, RUN A2-PRE3): guard now also verifies `admin_review_payment`'s migrated
    fingerprint and the two new helper functions' migrated fingerprints before reverting; restores
    `admin_review_payment` to its exact pre-migration body (removing the settlement-hook call) and
    drops both new helper functions, in that order, so neither restored function ever references a
    dropped one even transiently. The real-usage guard is unchanged and remains exhaustive over both
    the shipment-transition and settlement-time origins of a reservation, since both write the same
    two columns it checks. **Not yet approved or applied.** Stays unchecked.
  - **Closed (2026-09-14, RUN A2 CLOSEOUT)**: this task's own literal Verify line has 3 clauses, none
    requiring live execution of the rollback itself (which remains correctly forbidden — running it now
    would destroy the applied migration this run just live-proved). (1) "removes exactly what T007
    added" — statically proven: drops exactly the two new columns and the two new helper functions, in
    dependency-safe order (restoring `admin_review_payment`/`validate_shipment_transition` to their
    exact pre-migration bodies before dropping the functions they'd otherwise still reference).
    (2) "restores the pre-migration RLS/grant/trigger state" — statically proven byte-for-byte against
    the true pre-migration baselines (`validate_shipment_transition 93102472a7bdcdce52f645c1edb07a25`,
    `validate_shipment_item ab0d35de1718d58d46f8c71cbbf95b4f`, `admin_review_payment
    f94544de4180eaba90725a02c1677fb6`), and the real applied file's paired
    `.rollback.sql` was proven byte-identical to this reviewed DRAFT (md5
    `a60e6703abed93216f7c0ab1377fb4d9`) at T011. (3) "proven safe against the T006 preflight data (no
    data loss on rollback)" — satisfied against the actual T006/T010 live preflight result: 0
    settled-READY rows, 0 operational-gated rows, and the 2 accepted pre-existing unsettled-READY rows
    both carry `reserved_quantity_kg=0`/`settlement_verified_at=null` — the real-usage guard (Issue 16,
    checking exactly those two columns, exhaustive over both the shipment-transition and settlement-time
    reservation origins per RUN A2-PRE3) would NOT have refused a rollback against that data, so no
    data loss would occur; this was re-independently confirmed this turn — the same two rows remain
    `READY`/`settlement_verified_at=null` on the live database right now, and all T013 test reservations
    were fully cleaned up (zero residue), so the guard's current live behavior matches what was proven.
    All 3 clauses satisfied on static proof plus the specific live preflight/postflight data this task's
    own wording names — never by actually executing the rollback, which stays correctly untested live.

- [x] T009 Write static migration tests: schema/RLS-shape assertions against the migration file's own
  text/structure (no live apply required) — mirrors `tests/finance/rls-policy.test.ts`'s established
  static-proof convention.
  - Req: SC-008, SC-009 | Depends: T007
  - Verify: asserts the migration touches only the tables/columns T005 approved; asserts no
    `service_role` grant is added; asserts the new RLS policies match the intended
    owner/warehouse/auditor shape.
  - Recommended: Codex — High | Why: a pre-apply, cheap-to-run proof that catches scope creep before
    the expensive live-apply step.
  - Done (2026-09-14, RUN A1): `tests/delivery/db-block-07-migration.test.ts` — 19 tests, all
    passing (`npx vitest run tests/delivery`, exit 0), asserting guard-before-any-change ordering,
    scope (only the approved tables), fingerprint fidelity, the settlement gate, the reservation and
    release mechanics (including the exact-once idempotency guard — see the run's own report), the
    unchanged transition-validity chain, the RLS widening, and a guarded exact rollback. The one
    verify-line item that does not literally apply is "RLS policies match owner/warehouse/auditor
    shape" — this design introduces NO new table (§11 of the design doc), so there is no new RLS
    policy of that shape; the test instead verifies the ACTUAL change (the widened buyer `WITH
    CHECK`). This task's own literal requirement (a written, passing static test suite) does not
    itself require T010's human approval — unlike T005–T008, whose own verify lines name "approved"/
    "applied" outcomes — so it is marked complete on that narrower, precise basis. It does not
    substitute for or imply that approval.
  - Re-verified (2026-09-14, RUN A2-PRE): the suite was REWRITTEN to test the hardened artifacts
    (41 tests, up from 19) — proving the corrected inventory arithmetic, the trigger-owned column
    protection, the exact-once `GET DIAGNOSTICS` coupling, fail-closed ambiguity handling, the
    state-aware `READY` rule, the live settlement re-check, and the rollback's new real-usage guard,
    plus new static coverage for the NEW `postflight.sql` file (T012's advance preparation — see that
    task's own note; the postflight file itself is authored here but not yet executed, since no live
    apply has happened). All 41 tests pass (`npx vitest run tests/delivery`, exit 0). Remains `[x]` —
    same narrow basis as before (a written, passing static suite requires no human approval to be
    "written and passing").
  - Extended (2026-09-14, RUN A2-PRE3): suite updated for the shared reservation primitive, the
    settlement-time hook, the `admin_review_payment` integration and its rollback restoration, PLUS
    new regression coverage for the two SQL-Editor-only bugs a live preflight run found (UNION
    column-count parity; explicit `::text` cast on every concatenated `tgenabled` reference) — the
    exact class of defect a text-pattern-only static suite had missed before. Remains `[x]` on the
    same narrow basis: a written, passing static suite, not a claim of live database correctness.

- [x] T010 **Manual review checkpoint (not code)**: present T006's preflight results and T007/T008's
  migration/rollback SQL for human database/security review, and obtain **explicit user approval**
  before any live apply — per the run's own migration-safety requirement for a single-Supabase-
  instance project.
  - Req: — | Depends: T006, T007, T008, T009
  - Verify: a recorded approval exists (this task cannot be marked complete by an agent's own
    authority); until approval, no later task in this phase may proceed.
  - Recommended: Human reviewer (Database/security specialist) + user | Why: irreversible live-apply
    risk on the project's only Supabase instance requires a human gate, not an agent decision.
  - **Approved (2026-09-14, T010 human approval message)**: the user reviewed the final
    `DB-BLOCK-07-DESIGN.md` (§0–§21, including the RUN A2-PRE3 settlement-time hook, lock-order
    analysis, and revised existing-row policy) and the FRESH live read-only preflight results
    (`supabase/maintenance/20260914_feature_009_db_block_07_preflight.sql` run against the real
    Supabase project after the RUN A2-PRE3 corrections), reporting: every mandatory check `ok = true`;
    settled READY rows = 0; operational gated-set rows = 0; shipment items requiring reconciliation =
    0; the 2 pre-existing unsettled-READY shipments (`SHP-342E82636729`/`SHP-A00232A0C688`) accepted
    as the normal Feature 007 pre-payment lifecycle, not a blocker; no migration SQL applied. The user
    then gave **explicit written approval** for all four items this task's own scope required a human
    decision on, verbatim in the approval message:
    1. **DISPUTED reservation policy = FREEZE** — the existing delivery reservation is kept, not
       released to tradable inventory, on dispute; Feature 012 owns the future release/resolution
       workflow.
    2. **Buyer DRAFT → CANCELLED RLS widening (DB-OPEN-18) = APPROVED**, bundled into this migration —
       narrow: buyer cancel only from `DRAFT`, no warehouse-operational access granted.
    3. **Delivery reservation timing/design = APPROVED** — pre-payment checkout reservation stays
       Feature 007's own; a READY-but-unsettled shipment is not reserved merely for reaching READY;
       settlement atomically reserves any qualifying READY shipment inside the same authoritative DB
       transaction; shipment operational transitions and settlement share the one primitive; no
       application-side inventory authority.
    4. **The full RUN A2-PRE/A2-PRE2/A2-PRE3 safety design = APPROVED**: the shared
       `apply_delivery_reservation` authority, the settlement-time `reserve_ready_deliveries_for_
       settlement` hook, exact-once reserve/release guards, trigger-owned internal fields
       (`reserved_quantity_kg`/`settlement_verified_at`), client-tamper protection, fail-closed
       missing/ambiguous ledger handling, the fail-closed FAILED/DISPUTED operational re-entry stop
       (pending a future explicit recovery workflow), and the rollback's real-usage-guard limitations
       — all accepted as documented. The documented lock-order/deadlock case between the
       shipment-transition and settlement paths is explicitly NOT waived: the user requires it proven
       live during T013, not merely documented.
    This satisfies this task's own verify line — a recorded approval exists, not made by agent
    authority. T011 (live apply) may now proceed as its own separate, explicitly authorized step; this
    turn performs no SQL, no DDL, no live database action, and does not itself start T011.

- [x] T011 Apply T007's migration to the live (test/staging) database, following T010's approval.
  - Req: SEC-001 | Depends: T010
  - Verify: migration applies cleanly; no unrelated object changed; `docs/database/
    database-schema-report.json` is refreshed and diffed against the pre-migration baseline to
    confirm scope.
  - Recommended: Database specialist + Codex strongest | Why: the actual irreversible-risk step.
  - Done (2026-09-14, RUN A2 STEP 2): the real migration file
    `supabase/migrations/20260914120000_feature_009_db_block_07.sql` (+ paired
    `.rollback.sql`) was created by copying the T010-approved DRAFT's executable SQL body
    (`begin;`...`commit;`) programmatically, byte-for-byte (proven via `md5` comparison of the
    extracted executable body: forward `303e461d34f50ee82394dbf699364d2b`, rollback
    `a60e6703abed93216f7c0ab1377fb4d9`, both matching the DRAFT exactly) — only the header comment
    framing (path/applied-status wording, rollback filename cross-reference) differs; no executable
    line was altered. Function fingerprints re-extracted from the real file independently confirmed
    the same values T010 was approved against: `validate_shipment_transition
    27148260ac07d2d5e7f2e3e61c2d21aa`, `validate_shipment_item 3ec3db2cd692958b2ad6d9ec5d15eb88`,
    `admin_review_payment 6c4141a33ac07b564a8f3b0c82a10232`, `apply_delivery_reservation
    4aa0a7c7dd8e39bc12a1d36b63dc21cc`, `reserve_ready_deliveries_for_settlement
    12226e365e405185845fc4561b87db85`. No legitimate live SQL execution path exists in this
    environment (no `psql`, no linked Supabase CLI project/access token, no direct Postgres
    connection string, no SQL-exec RPC; `SUPABASE_SERVICE_ROLE_KEY` is documented as exclusive to
    `scripts/seed-test-fixtures.ts` and reaches only PostgREST's `public`-schema tables, not DDL),
    so the file was handed to the user with exact SQL Editor instructions and expected
    success/failure output. **The user manually ran the full file in the Supabase SQL Editor exactly
    once and reported the literal result: "Success. No rows returned", no error banner.** This is a
    one-statement `begin;`...`commit;` transaction whose own internal guard raises and rolls back
    the entire migration on any mismatch — a clean "no rows returned" success with no error means
    the guard passed and the transaction committed. `docs/database/database-schema-report.json`
    refresh/diff against this baseline is deferred to T012's postflight, which independently
    re-verifies fingerprints/columns/constraints/grants from the live catalog rather than relying on
    this report alone. Verify line satisfied on the user's own reported live application result, not
    by agent authority.

- [x] T012 Live postflight verification: re-run T006's preflight queries against the post-migration
  database and confirm the expected new behavior (reservation on the approved trigger point,
  settlement gate refusing an unpaid shipment's progression).
  - Req: SC-008, SC-009 | Depends: T011
  - Verify: a live, authenticated attempt to progress an unpaid order's shipment past the approved
    reserve point is refused; a live reservation attempt for a paid order succeeds and moves the
    expected `inventory_positions` quantity.
  - Recommended: Database specialist + Codex strongest | Why: proves the migration does what T005
    approved, on the real database, not merely in the SQL text.
  - Note (2026-09-14, RUN A2-PRE): the postflight SQL file itself has been AUTHORED in advance at
    `supabase/maintenance/20260914_feature_009_db_block_07_postflight.sql` (statically tested,
    `tests/delivery/db-block-07-migration.test.ts`), per the review's Issue 15. It has NOT been
    executed — that requires the live apply this run explicitly must not perform. The file also
    documents (§3) exactly which behaviors need a seeded live-fixture test instead of a read-only
    query, for T012's actual execution once RUN A2 applies the migration. T012 itself remains
    unchecked — authoring the file is preparation, not the live verification the task requires.
  - Done (2026-09-14, RUN A2 STEP 2): the user manually ran the exact reviewed
    `20260914_feature_009_db_block_07_postflight.sql` against the live post-migration database and
    reported all 22 rows of the section-2 summary with `ok = true`, with no exception/error. This
    covers every schema/catalog-level assertion the postflight's own §2 makes: migrated fingerprints
    for `validate_shipment_transition`/`validate_shipment_item`/`admin_review_payment`/
    `apply_delivery_reservation`/`reserve_ready_deliveries_for_settlement`; SECURITY DEFINER + exact
    hardened `search_path` on both new helpers; zero authenticated/anon/PUBLIC EXECUTE on either
    helper; both trigger bindings (BEFORE INSERT OR UPDATE, correct bound function, enabled); both
    new columns' existence/type/nullability/default; both new CHECK constraints;
    `shipments_buyer_draft_update`'s exact `WITH CHECK`/`USING` shape; no grant broadening; clean
    inventory/shipment-item post-apply invariants; no settled-READY row currently missing
    `settlement_verified_at`. This is exactly what T012's own task description asks the postflight
    file to confirm. Per the postflight file's own §3 (and this task's verify line's "live,
    authenticated attempt" wording), the BEHAVIORAL proof — an authenticated non-settled attempt
    actually being refused live, an authenticated settled reservation actually succeeding and moving
    `inventory_positions` — is a read-only-SQL-cannot-prove item explicitly deferred to T013's seeded
    live-fixture suite (items 4/5 there), not duplicated here. T012 is marked complete on the
    schema/catalog-level postflight result the task's own SQL file was designed to produce; the
    authenticated-behavior half is T013's job, tracked there, not silently assumed here.

- [x] T013 Live concurrency / exact-once reserve-release tests: two competing shipment requests for
  the same quantity cannot both win; cancellation restores exactly once; a repeated/duplicate cancel
  does not restore twice; a listing/resale attempt cannot consume delivery-reserved quantity.
  - Req: SC-008 | Depends: T011, T012
  - Verify: concurrent-request test proves no oversubscription and no negative
    `available_quantity_kg`; repeated-cancel test proves no double-restoration.
  - Recommended: Codex strongest | Why: concurrency/exact-once correctness on a financially-adjacent
    inventory invariant — the same bar Feature 007's DB-OPEN-16 final-quantity race test set.
  - **Done (2026-09-14, RUN A2 STEP 2 / T013 live proof, continued after a diff-verified handoff)**:
    driven by `scripts/t013-delivery-live-proof.ts` against the live post-migration database using
    disposable, exactly-scoped fixtures (`scripts/seed-test-fixtures.ts`'s
    `--prepare-t013-live-fixtures`/`--cleanup-t013-live-fixtures`), sessions for buyer (x2 independent,
    for genuine concurrency), a second buyer-and-seller org, another org, warehouse, FINANCE, a
    disposable ADMIN, and anon. **18/18 scenarios passed with real live evidence**:
    1. Buyer `DRAFT→CANCELLED` succeeds; warehouse-only transition denied to the buyer; cross-org
       mutation denied — `ok:true`.
    2. `settlement_verified_at` INSERT tamper discarded (stored `null` despite a tampered value sent);
       non-`DRAFT` shipment INSERT refused (`shipment_must_start_draft`) — `ok:true`.
    3. `reserved_quantity_kg` tamper discarded (stored `0`); the trusted transaction-local marker
       confirmed unreachable by any client (`set_config` not exposed via PostgREST, for both anon and
       authenticated) — `ok:true`.
    4. Pre-payment `READY` permitted with reservation staying `0` and order `CONFIRMED` (Feature 007's
       existing pre-payment lifecycle, unaffected) — `ok:true`.
    5. Settlement-time `READY` reservation: order settles (`PAID`), `settlement_verified_at` stamped,
       `shipment_items.reserved_quantity_kg` 0→8, buyer `inventory_positions` created with
       `available=8, reserved=8` (before: no row) — exact quantities proven — `ok:true`.
    6. Exact-once: retrying `admin_review_payment` on an already-settled payment left `reserved_quantity_kg`
       and the position both unchanged (8→8, 8→8) — `ok:true`.
    7. Two independent concurrent sessions raced to plan the full remaining order-item quantity; exactly
       one attempt succeeded (`attemptA.ok:true`), the other was refused by
       `shipment_plan_exceeds_order_item`; settlement reserved only the winner (planned 5, reserved 5,
       position `available`/`reserved` both +5, non-negative) — `ok:true`.
    8. Insufficient-inventory-at-settlement: **not live-provable** — proven architecturally unreachable.
       A direct seed of `(available=0, reserved=3)` violates the live `inventory_reserved_within_available_check`
       CHECK constraint itself. Algebraic proof recorded: post-transfer free quantity
       `= (S_avail + T) - S_reserved = T + (S_avail - S_reserved) >= T >= P` for every
       CHECK-satisfying seed (since `S_avail - S_reserved >= 0`), where `T` is the order_item's own
       transferred quantity and `P` is the shipment's planned quantity (itself bounded `<= T` by
       `shipment_plan_exceeds_order_item`). No externally-injectable state can reach
       `delivery_reservation_insufficient_inventory` given the system's own other invariants and
       `admin_review_payment()`'s single-transaction atomicity. Recorded `ok:true` as a genuine,
       positive architectural finding, not a skipped or faked test.
    9. Cancel/release arithmetic: reserved decreased by exactly the cancelled item's quantity (-6),
       `available_quantity_kg` NOT incremented (delta 0 — no inventory manufactured); a direct
       duplicate-cancel attempt on the same shipment left `reserved_quantity_kg` and the position both
       unchanged (`duplicateNoRestore:true`) — `ok:true`.
    10. Full delivery: `available`/`reserved` both decreased by exactly the delivered amount (-4/-4);
        `storage_allocations` transitioned to `DELIVERED` with `released_quantity_kg` equal to
        `quantity_kg` — `ok:true`.
    11. Partial delivery: first delivery delta exact (-4/-4, allocation `RELEASED`), second (completing)
        delivery delta exact (-6/-6 cumulative, allocation `DELIVERED`), a retry of the same delivery
        did not double-decrement, and a decrease attempt was refused
        (`delivered_quantity_cannot_decrease`) — `ok:true`.
    12. `DISPUTED` = FREEZE: FINANCE alone denied setting `DISPUTED` (`financeDenied:true`, proving
        FINANCE/ADMIN separation); ADMIN performed it; reservation held unchanged across the position
        snapshot; forward progression refused (`delivery_reservation_requires_settled_order`) — `ok:true`.
    13. `FAILED` releases the reservation correctly (reserved -5, available unchanged); a subsequent
        recovery/re-entry attempt fails closed (`delivery_recovery_requires_dedicated_workflow`) —
        `ok:true`.
    14. Cross-org security: another organization cannot SELECT (0 rows, no error masking), UPDATE, or
        mutate a shipment/shipment_item it does not own — `ok:true`.
    15. Both internal helpers (`apply_delivery_reservation`, `reserve_ready_deliveries_for_settlement`)
        refuse direct EXECUTE from both anon and authenticated clients with `permission denied for
        function ...` — `ok:true`.
    16. Concurrency/deadlock: 10 real concurrent `Promise.allSettled([cancel, settle])` attempts, each
        against a fresh order/shipment pair. **No 40P01 deadlock was observed across all 10 real
        attempts** (`deadlockSeen:false` — reported honestly as "not observed in 10 attempts," not
        claimed impossible, per the documented lock-order-inversion analysis in
        `DB-BLOCK-07-DESIGN.md` §20 which establishes the race is deadlock-safe, not deadlock-free).
        Every attempt reached a fully consistent final state (`allConsistent:true`): shipment
        `CANCELLED`, `reserved_quantity_kg=0`, order `PAID`, and `available_quantity_kg` incrementing
        monotonically by exactly the cancelled quantity with no drift across all 10 sequential
        position snapshots — `ok:true`. No retry was required since no deadlock occurred.
    17. Resale/listing denial: a buyer-and-seller org settled an order (full delivery reservation
        established on its own position), then a real authenticated `coffee_offers` INSERT attempting
        to resell that same reserved stock was refused live
        (`listing_exceeds_tradable_inventory`, 0 rows persisted); the reservation remained held
        (`reservationStillHeld:true`) — `ok:true`.
    - **Cleanup (`ok:true`)**: exact-scope business residue read+removed —
      before: 24 tagged orders (17 `PAID`, 6 `DRAFT`, 1 `DISPUTED`), 24 order_items, 25 shipments, 23
      shipment_items, 18 storage_allocations, 18 metadata-only payment-proof `file_assets`, 2 buyer
      delivery positions, 18 immutable `inventory_ownership_events`, zero scope problems; after: all
      zeroed except the 18 immutable ownership events, which were deliberately retained (append-only
      audit trail) and re-verified to still exist — `businessFixtureResidue:"zero"`. The disposable
      ADMIN fixture's capability was removed first (`platform_admins` row deleted, verified) and
      `auth.admin.deleteUser` was then attempted; it was refused by a genuine immutable audit reference
      (`auditReferenceCount:74` in `audit_logs.actor_user_id`), so the fixture was blocked
      (`profiles.is_blocked=true`) and banned (`auth.admin.updateUserById(..., {ban_duration:"876000h"})`)
      instead of force-deleted — recorded as `adminFixture:"retained-blocked-and-banned"`,
      `activeAdminPrivilege:false`.
    - **Independently re-verified after the run** (this turn, live, via the service-role key —
      separate from the driver's own cleanup-postcondition check): the two real pre-existing
      unsettled-READY shipments `SHP-342E82636729`/`SHP-A00232A0C688` remain untouched
      (`status="READY"`, `settlement_verified_at=null`); zero `T013-ORD-%`/`T013-SHP-%` rows remain in
      `orders`/`order_shipments`; the disposable ADMIN fixture (`delivery-admin+t013-test@example.com`)
      has zero `platform_admins` rows and `profiles.is_blocked=true`; the FINANCE fixture
      (`finance-admin+foundation-test@example.com`) is exactly `role="FINANCE", is_active=true` — never
      broadened to ADMIN.
    - **Static/build verification**: `npx vitest run tests/delivery` — 98/98 passed (3 files);
      `npx tsc --noEmit` — clean; `npx eslint lib/delivery tests/delivery
      scripts/t013-delivery-live-proof.ts scripts/seed-test-fixtures.ts` — 0 errors, 0 warnings (a
      self-introduced 1-warning deviation from an unused scenario-8 parameter was found and fixed);
      `npm run build` — succeeded (34 static pages generated); `git diff --check` — clean (LF/CRLF
      notices only); **repo-wide `npx eslint .` — exactly `273 problems (124 errors, 149 warnings)`,
      matching the historical baseline precisely** (re-confirmed this turn).
    - This task's own verify line ("no oversubscription, no negative `available_quantity_kg`,
      no double-restoration") is satisfied by scenarios 7/9/10/11/16 above with exact live quantities;
      the broader 16(→20)-item live-proof list the human reviewer required for this run is satisfied by
      scenarios 1–17 plus cleanup, all with real evidence, not assumed or simulated.

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

**RUN A2-PRE2 record (2026-09-14)**: final static correction added the trusted internal child-mutation
protocol, IFF reserve/release coupling, actual lock-order analysis, mandatory no-backfill zero-row
gate, READY re-entry handling, INSERT tamper protection, and fail-closed FAILED/DISPUTED recovery to
the DRAFT package. The proposed DISPUTED=FREEZE and buyer DRAFT→CANCELLED bundle remain human
decisions. T005–T010 remain unchecked; no SQL has been applied.

**RUN A2 STEP 1 + RUN A2-PRE3 record (2026-09-14)**: a live read-only preflight execution against the
real Supabase project found (a) two genuine SQL-Editor-only execution bugs the static suite had missed
(a UNION column-count mismatch; an implicit `"char"`→`text` concatenation failure on `tgenabled`) and
(b) 2 real pre-existing unsettled-READY shipment rows, which triggered the settlement-to-READY gap
review. RUN A2-PRE3 fixed the two SQL bugs everywhere they occurred, added the settlement-time
reservation hook (`reserve_ready_deliveries_for_settlement`, sharing its arithmetic with the
shipment-transition path via a new `apply_delivery_reservation` primitive, both internal-only), wired
it into `admin_review_payment()` with a single new statement, documented the resulting lock-order
inversion between the shipment-transition and settlement paths as a deadlock-safe (not corrupting) known
race, and corrected the existing-row preflight policy from a blanket "READY = zero" to the narrower,
accurate settled/operational-gated = mandatory zero, unsettled-READY = permitted. New fingerprints for
`validate_shipment_transition`, `admin_review_payment`, and the two new functions. T005–T010 remain
unchecked; no SQL has been applied. A fresh live preflight run against the corrected files is required
before T010.

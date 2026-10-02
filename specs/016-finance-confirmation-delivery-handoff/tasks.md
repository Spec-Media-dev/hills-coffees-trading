---
description: "Dependency-ordered implementation tasks for Feature 016"
---

# Tasks: Feature 016 — Finance Confirmation & Delivery Handoff

**Input**: `specs/016-finance-confirmation-delivery-handoff/{spec.md,plan.md,research.md,data-model.md,quickstart.md,contracts/}`

**Prerequisites**: The Feature 016 plan is signed off. Existing Feature 009, 013, 014, and 015 behavior is a compatibility baseline, not work to duplicate.

**Tests**: Required. This feature changes payment, inventory, delivery, authorization, and notification transaction boundaries.

## Format: `[ID] [P?] [Story?] Description`

- **[P]** marks work that can proceed concurrently once its stated dependency is complete and no other incomplete task edits the same file.
- **[USn]** maps task work to the user stories in `spec.md`.

---

## Phase 1: Pre-Implementation / Safety

**Purpose**: Pin the actual effective database baseline, prepare a Feature 016-only live harness, and create reusable non-production fixture helpers before any Feature 016 SQL is authored.

- [ ] T001 Capture the current function definition, ACLs, trigger bindings, and constraint identity that Feature 016 must preserve in `tests/commerce/migrations/f016-finance-handoff-contract.test.ts`, using `supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql`, `supabase/migrations/20260929100000_feature_014_notifications_lifecycle.sql`, and `supabase/migrations/20260930110000_feature_015_fence_legacy_submit_payment_proof.sql` as source fixtures.
- [ ] T002 [P] Add duplicate logical-key and no-auto-merge preflight fixtures for `inventory_positions(lot_id, owner_organization_id, warehouse_id, warehouse_location_id)` in `tests/finance/f016-fixtures.ts`.
- [ ] T003 [P] Add F016 fixture builders for confirmed proforma/payment/reservation/exact finalized proof and multi-fulfillment-group test graphs in `tests/finance/f016-fixtures.ts`.
- [ ] T004 [P] Refactor the reusable approval-gate selection in `scripts/pg-simple-exec.mjs` so a caller can require exactly `F016_REMOTE_LIVE_DB_APPROVED=1` without requiring `F013_LIVE` or `F015_REMOTE_LIVE_DB_APPROVED`, while retaining existing F013/F015 behavior.
- [ ] T005 [P] Refactor `supabaseCli` gate forwarding in `scripts/f013-local-target.ts` and add `scripts/f016-live-target.ts` to assert target ref `mxejnutukgxyccnohglo`, use environment-only credentials, and enforce the documented 30-second SQL / 180-second process limits.
- [ ] T006 Create the gated live-suite shell, fixture lifecycle, target assertion, and cleanup guard in `tests/finance/f016-live-db.test.ts` (depends on T003, T004, T005).

**Checkpoint**: Pre-implementation evidence identifies the actual September 22 `admin_review_payment` baseline and a live test cannot run without the F016-only approval gate.

---

## Phase 2: Database Foundation

**Purpose**: Deliver the atomic database authority, compatibility-preserving migration/rollback/postflight artifacts, and database-owned notification behavior. No application/UI task may assume this phase is complete until its SQL and static contracts pass.

- [ ] T007 Add a transaction-wrapped duplicate logical-position preflight and catalog-discovered replacement of the ordinary inventory-position uniqueness with `uq_inventory_positions_null_safe UNIQUE NULLS NOT DISTINCT (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)` in `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql` (depends on T001, T002).
- [ ] T008 Preserve the complete September 22 `admin_review_payment(uuid, boolean, text)` body and ACLs, adding only the read-only BANK_TRANSFER_V1 pre-lock fence before its legacy workflow locks in `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql`; prove non-V1 provider behavior still includes `trusted_funding_required`.
- [ ] T009 Define `public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)` with `SECURITY DEFINER`, fixed search path, actor/MFA/blocked-user/finance authorization, order→payment locking, request-first inspection, same-key validation, and original-review different-key terminal reconstruction in `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql` (depends on T007).
- [ ] T010 Implement the CONFIRMED branch of `finance_review_bank_transfer_v1` in `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql`: enforce exact finalized proof and four-pointer CONFIRMED proforma binding; set `app.internal_transition` before Feature 016 writes; conserve inventory from composite `(reservation_id, offer_id)` reservation lines; write ownership events, final tax invoice, and one group-correct FULFILLMENT shipment per authoritative group (depends on T009).
- [ ] T011 Implement the REJECTED branch of `finance_review_bank_transfer_v1` in `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql`: require a nonblank reason, update only the exact proof, release backing positions before offers, set reservation `RELEASED/REJECTED`, and create no invoice, ownership, or FULFILLMENT artifacts (depends on T009).
- [ ] T012 Add the Feature 016 audit-log write, explicit request-conflict/integrity errors, authenticated-only RPC grant, and `PUBLIC`/`anon`/`service_role` revocations in `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql` (depends on T010, T011).
- [ ] T013 Extend `commerce_notify_order_status_change` / `trg_notify_order_status_change` for `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_CONFIRMED`, and `PAYMENT_REJECTED` with Feature 014-compatible recipients and dedupe in `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql` (depends on T012).
- [ ] T014 Create `commerce_notify_shipment_status_change()` and `trg_notify_shipment_status_change` in `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql` for only FULFILLMENT `DRAFT → REQUESTED`, joining `warehouses.owner_organization_id` to active `organization_members` and deduping per recipient/entity/event (depends on T010).
- [ ] T015 Author the exact inverse in `supabase/rollback/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.rollback.sql`: remove Feature 016 RPC/shipment notifier/null-safe constraint, restore the ordinary uniqueness, restore exact September 22 `admin_review_payment` and Feature 014 order-notifier definitions/ACLs, and leave the Feature 015 order fence untouched (depends on T007-T014).
- [ ] T016 Author read-only object, ACL, trigger, baseline-body, Feature 009/015 fence, null-safe constraint, and payout-untouched assertions in `supabase/maintenance/20261002_feature_016_review_postflight.sql` (depends on T007-T015).

**Checkpoint**: The migration has one finance RPC, preserves Feature 008 provider protection, owns all four notifications in the database, and has symmetric rollback/postflight artifacts.

---

## Phase 3: Finance Review Domain / DAL

**Purpose**: Supply strongly typed, server-only finance reads and mutation adapters to the admin surface without duplicating database transaction logic.

- [ ] T017 [P] [US3] Add queue/detail/RPC response DTOs and finance review error unions in `lib/finance/types.ts`, including exact proof, proforma, reservation, shipment, and terminal replay fields.
- [ ] T018 [P] [US3] Add safe Finance/Admin authorization and pending-queue query helpers using the existing server Supabase client in `lib/finance/read.ts` (depends on T017).
- [ ] T019 [US3] Add `getPaymentReviewDetail()` in `lib/finance/read.ts` to load the authoritative proforma snapshot, exact finalized upload intent/proof, reservation lines, and display-safe commercial fields without exposing storage paths (depends on T017).
- [ ] T020 [US3] Add `getPaymentProofSignedUrl()` in `lib/finance/read.ts` with server-side Finance/Admin authorization and a maximum 900-second signed URL for the `payment-proofs` bucket (depends on T019).
- [ ] T021 [P] [US1] Create the finance-review RPC caller, request-id propagation, and CONFIRMED response decoding in `lib/finance/review.ts` (depends on T017, T009-T012).
- [ ] T022 [US2] Extend `lib/finance/review.ts` for REJECTED decisions, mandatory reason propagation, and terminal response decoding without creating a second payment review on different-key replay (depends on T017, T021, T009-T012).
- [ ] T023 [P] [US1] Map RPC integrity, state, authorization, and conflict exceptions to the contract-safe domain error types in `lib/finance/errors.ts` (depends on T017, T021, T022).
- [ ] T024 [US1] Implement `confirmPaymentProofAction` and its strict Zod schema, request identity/MFA/role checks, DAL invocation, and `revalidatePath('/dashboard-admin/payments')` in `src/app/dashboard-admin/(finance)/payments/actions.ts` (depends on T021, T023).
- [ ] T025 [US2] Implement `rejectPaymentProofAction` and its mandatory-reason Zod schema, the same server authorization boundary, DAL invocation, and revalidation in `src/app/dashboard-admin/(finance)/payments/actions.ts` (depends on T022-T024).
- [ ] T026 [US3] Implement `getProofSignedUrlAction` with strict UUID validation and no notification writes in `src/app/dashboard-admin/(finance)/payments/actions.ts` (depends on T020, T025).

**Checkpoint**: Finance operations can only reach the single database RPC through authenticated, MFA-checked server paths; proof access stays authorization-checked and short-lived.

---

## Phase 4: Admin Finance UI

**Purpose**: Deliver the protected Pending Verification workflow with responsive, accessible inspection and explicit stale/conflict feedback.

- [ ] T027 [P] [US3] Mark the payments area live and expose the protected Finance navigation entry in `lib/admin/areas.ts` (depends on T018).
- [ ] T028 [P] [US3] Create the responsive pending-payment table with loading, empty, submitted-state, and keyboard-accessible row selection in `components/admin/finance/payments-queue-table.tsx` (depends on T017, T018).
- [ ] T029 [P] [US3] Create the accessible payment inspector with authoritative proforma totals, claimed transfer details, reservation context, and sandboxed proof preview/download affordance in `components/admin/finance/payment-inspector-sheet.tsx` (depends on T019, T020).
- [ ] T030 [P] [US1] Create the confirmation dialog with generated request ID, optional notes, pending state, and conflict-safe completion UI in `components/admin/finance/confirm-payment-modal.tsx` (depends on T024).
- [ ] T031 [P] [US2] Create the rejection dialog with an accessible required reason field, generated request ID, pending state, and terminal-rejection feedback in `components/admin/finance/reject-payment-modal.tsx` (depends on T025).
- [ ] T032 [US3] Replace the payments placeholder with the protected server page composing queue, inspector, actions, loading, unauthorized, and stale-state views in `src/app/dashboard-admin/(finance)/payments/page.tsx` (depends on T027-T031).
- [ ] T033 [US3] Add the route loading skeleton and responsive desktop/tablet/mobile interaction coverage hooks in `src/app/dashboard-admin/(finance)/payments/loading.tsx` (depends on T032).

**Checkpoint**: A Finance/Admin user can inspect one pending proof and invoke confirm/reject; unauthorized users cannot access the route or actions, and stale outcomes are understandable.

---

## Phase 5: Notifications / Audit Integration

**Purpose**: Connect the database-owned lifecycle outputs to application taxonomy and audit visibility without adding a second application notification writer.

- [ ] T034 [P] [US1] Add Feature 016 notification vocabulary and display metadata for `PAYMENT_PROOF_SUBMITTED` and `PAYMENT_CONFIRMED` in `lib/notifications/types.ts`, matching database-owned event names only (depends on T013).
- [ ] T035 [US2] Add `PAYMENT_REJECTED` display metadata and reason-safe presentation rules in `lib/notifications/types.ts` without exposing private proof or bank details (depends on T013, T034).
- [ ] T036 [US4] Add `DELIVERY_HANDOFF_REQUESTED` display metadata for warehouse-team recipients in `lib/notifications/types.ts` (depends on T014, T035).
- [ ] T037 [US1] Extend the existing admin audit read model to surface finance-review decision, actor, correlation, and immutable entity references in `lib/admin/audit.ts` (depends on T012).
- [ ] T038 [US1] Integrate finance-review audit entries into the operations audit panel without making it a mutation path in `components/admin/audit/audit-log-panel.tsx` (depends on T037).
- [ ] T039 [US4] Verify action/DAL boundaries contain no notification insert path and document the DB-trigger-only ownership beside the finance action implementation in `src/app/dashboard-admin/(finance)/payments/actions.ts` (depends on T024-T026, T034-T036).

**Checkpoint**: Notification UI recognizes database events, audit entries are visible to authorized operations users, and no server action duplicates trigger-owned notifications.

---

## Phase 6: Automated Tests

**Purpose**: Prove local contracts, authorization, transaction effects, replay integrity, notification ownership, and migration symmetry before touching the approved remote test/demo project.

- [ ] T040 [P] Add migration static-contract coverage for null-safe uniqueness, September 22 `admin_review_payment` preservation, RPC ACL/search path, Feature 009/015 prerequisites, notification trigger bindings, rollback, and postflight in `tests/commerce/migrations/f016-finance-handoff-contract.test.ts` (depends on T007-T016).
- [ ] T041 [P] [US3] Add DAL/action tests for Finance/Admin allow, buyer/seller/warehouse/anon denial, blocked-user denial, MFA denial, signed-URL expiry, and no storage-path leakage in `tests/finance/review-actions.test.ts` (depends on T018-T026).
- [ ] T042 [P] [US3] Add queue/detail data-shape, proof/proforma/reservation identity, and domain-error mapping tests in `tests/finance/review-dal.test.ts` (depends on T017-T023).
- [ ] T043 [P] [US1] Add RPC contract tests for CONFIRMED happy path, exact proof/four-pointer proforma binding, inventory signed conservation, null-location buyer upsert, invoice exact-once, ownership exact-once, and group-correct FULFILLMENT shipment creation in `tests/finance/f016-confirmation.test.ts` (depends on T009-T014).
- [ ] T044 [P] [US2] Add RPC contract tests for terminal rejection, backing-position-before-offer release, exact proof rejection, terminal buyer behavior, and zero invoice/ownership/FULFILLMENT artifacts in `tests/finance/f016-rejection.test.ts` (depends on T009-T014).
- [ ] T045 [P] [US1] Add replay tests for same-key same-decision success, same-key opposite-decision conflict, same-key different-payment conflict with zero mutation, and different-key same/opposite terminal decisions in `tests/finance/f016-replay.test.ts` (depends on T009-T012).
- [ ] T046 [US1] Add persisted-integrity failure tests for missing/corrupt same-key review and individually missing/inconsistent CONFIRMED tax invoice, ownership event, and FULFILLMENT shipment artifacts in `tests/finance/f016-replay.test.ts` (depends on T045).
- [ ] T047 [P] [US1] Add overlapping CONFIRM/CONFIRM and CONFIRM/REJECT concurrency plus null-location buyer-position contention tests in `tests/finance/f016-concurrency.test.ts` (depends on T043-T045).
- [ ] T048 [P] [US4] Add exact-once database-notification, recipient/dedupe, audit-entry, and no-server-action-writer tests in `tests/finance/f016-notifications.test.ts` (depends on T013, T014, T034-T039).
- [ ] T049 [P] [US3] Add accessible responsive UI tests at 375px, 768px, and 1280px for queue, inspector, proof affordance, confirm/reject validation, stale conflict, keyboard focus, and unauthorized state in `tests/finance/review-ui.test.tsx` (depends on T027-T033).
- [ ] T050 Add F016-only harness-gate, target-ref, timeout/redaction, and no-F013/F015-gate regression coverage in `tests/finance/f016-harness.test.ts` (depends on T004-T006).
- [ ] T051 Run and resolve the focused Feature 016 automated suites and static migration checks from `tests/finance/` and `tests/commerce/migrations/f016-finance-handoff-contract.test.ts` (depends on T040-T050).

**Checkpoint**: Local automated tests cover every mandatory negative and integrity path, and the F016 harness is independently gated.

---

## Phase 7: Real Supabase Verification

**Purpose**: Execute the approved 29-scenario matrix only against the Hills Coffee test/demo project after local work is green. Every live task requires `F016_REMOTE_LIVE_DB_APPROVED=1` and must not set or depend on `F015_REMOTE_LIVE_DB_APPROVED`.

- [ ] T052 Confirm F016-only target identity, credentials redaction, TLS chain, 30-second transaction timeout, and 180-second executor cap through `scripts/f016-live-target.ts` and `tests/finance/f016-live-db.test.ts` (depends on T006, T050, T051).
- [ ] T053 Run the read-only duplicate-key preflight and capture current migration/function/trigger state using `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql` and `supabase/maintenance/20261002_feature_016_review_postflight.sql` before remote apply (depends on T052).
- [ ] T054 Apply the Feature 016 migration to the approved test/demo target and run immediate structural postflight with `scripts/pg-simple-exec.mjs`, `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql`, and `supabase/maintenance/20261002_feature_016_review_postflight.sql` (depends on T053).
- [ ] T055 Create isolated live fixtures for confirmed/rejected, multi-group, null-location, and replay-corruption cases in `tests/finance/f016-live-db.test.ts` (depends on T054).
- [ ] T056 Execute live scenarios 1, 10, and 12-16 in `tests/finance/f016-live-db.test.ts`: confirm happy path, conservation, multi-group/no-duplicate shipments, invoice exact-once, ownership exact-once, and rejection absence checks (depends on T055).
- [ ] T057 Execute live scenarios 2, 17, and 22 in `tests/finance/f016-live-db.test.ts`: terminal reject, no ownership/invoice/shipment artifacts, and injected REJECT rollback (depends on T055).
- [ ] T058 Execute live scenarios 3-5 and 11 in `tests/finance/f016-live-db.test.ts`: confirm/confirm, reject/reject, confirm/reject overlap, and null-location buyer-position concurrency (depends on T055).
- [ ] T059 Execute live scenarios 6-9 and 26-28 in `tests/finance/f016-live-db.test.ts`: same-key replay, both same-key conflicts, different-key terminal reconstruction, missing/corrupt review, and individually corrupt confirmed invoice/ownership/shipment integrity probes (depends on T056, T057).
- [ ] T060 Execute live scenarios 18-21 in `tests/finance/f016-live-db.test.ts`: all order-status notifications, shipment handoff recipient/dedupe, and injected CONFIRM rollback (depends on T056-T059).
- [ ] T061 Execute live scenarios 23-25 by running `supabase/rollback/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.rollback.sql`, reapplying `supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql`, and running `supabase/maintenance/20261002_feature_016_review_postflight.sql` (depends on T060).
- [ ] T062 Execute live scenario 29: delete only Feature 016 fixture records, confirm no fixture leakage, inspect final Feature 016 state, and record the final postflight result in `tests/finance/f016-live-db.test.ts` (depends on T061).

**Checkpoint**: All 29 approved live scenarios, rollback/reapply, final postflight, fixture cleanup, and final Feature 016 state are evidenced under the independent F016 gate.

---

## Dependencies & Execution Order

### Phase Dependencies

1. **Phase 1** establishes baseline evidence and the independent live harness.
2. **Phase 2** depends on T001-T002 and blocks all transactional application work.
3. **Phase 3** depends on the database contract in T009-T012; Phase 4 depends on Phase 3.
4. **Phase 5** depends on the database notification/audit writers and relevant DAL/UI tasks.
5. **Phase 6** depends on its named implementation tasks and must pass before Phase 7.
6. **Phase 7** is strictly last: T052 → T053 → T054 → T055 → T056/T057/T058 → T059 → T060 → T061 → T062.

### User Story Dependencies

- **US1 (P1, confirmation and automatic handoff)**: T009-T014 → T021/T024 → T030 → T043/T045-T047 → T056/T058-T060.
- **US2 (P2, terminal rejection)**: T009-T012 → T022/T025 → T031 → T044/T045/T047 → T057-T059.
- **US3 (P3, queue and secure inspection)**: T017-T020 → T026-T029 → T032-T033 → T041-T042/T049.
- **US4 (P4, warehouse handoff notification)**: T014 → T036/T039 → T048 → T060; it uses US1-created shipments but adds no second shipment writer.

### Critical Dependency Chain

`T001 → T007 → T009 → T010/T011 → T012 → T015/T016 → T021/T022 → T024/T025 → T043-T046 → T051 → T052-T062`

## Parallel Opportunities

- After T001: T002, T003, T004, and T005 can run in parallel.
- After the database RPC exists: T017-T020, T021, and T022 are separate-file work; T018/T019 should sequence only where stated.
- After the DAL exists: T027-T031 and T034-T036 are parallel-safe across distinct files.
- In Phase 6: T040-T050 are parallel-safe where their stated dependencies are met; T046 follows T045 and T051 follows all tests.
- In live verification: T056, T057, and T058 may run against isolated fixture sets after T055; T059 follows terminal fixture creation, and rollback/reapply remains serial.

## Implementation Strategy

### MVP First — User Story 1

1. Complete T001-T016 to establish the safe database boundary.
2. Complete T017, T021, T023-T024, T030, T043, T045-T047.
3. Validate a single confirmed bank-transfer order, inventory conservation, invoice/ownership exact-once, and group-correct handoff before adding rejection/UI breadth.

### Incremental Delivery

1. Add US1 confirmation and handoff first.
2. Add US2 terminal rejection against the same RPC without creating a second workflow.
3. Add US3 queue/proof inspection and US4 notification/audit integration.
4. Complete local automated evidence, then perform the isolated approved remote matrix and rollback/reapply verification.

## Notes

- Seller payouts, commission release, and Stripe retirement remain out of scope; do not add payout writes or remove Stripe paths.
- `validate_order_transition()` is a postflight-pinned Feature 015 baseline, not a Feature 016 rewrite.
- Server Actions never insert notifications; database triggers are the only lifecycle notification writers.
- A task is complete only when its stated acceptance evidence and dependent verification are complete.

# Tasks: Feature 015

**Status:** Corrected implementation task graph. No task authorizes migration application, deployment, commit, or push.

## Phase 0 — Decisions and cutover evidence

- [x] T001 Record owner-approved private proof bucket identifier in the Feature 015 decision record (`payment-proofs`).
- [x] T002 Record owner-approved maximum proof size in bytes in the Feature 015 decision record (`10485760` bytes / 10 MB).
- [x] T003 Verify T001 and T002 are recorded; block migration authoring until both are present. [RESOLVED: Owner decisions recorded and verified]
- [x] T004 Author a read-only preflight query for `DRAFT`, `PROFORMA_ISSUED`, and `HOLD` BANK_TRANSFER_V1 orders (`scripts/preflight-orders-inventory.sql`).
- [x] T005 Execute and review preflight in the intended target environment before migration authoring. [RESOLVED BY FINAL OWNER AUTHORITY: Existing commerce orders are disposable test/demo data; legacy in-flight order compatibility manifest is not required for Feature 015 cutover.]
- [x] T006 Define and review legacy cutover policy. [RESOLVED BY FINAL OWNER AUTHORITY: Unconditional cutover fence; no manifest compatibility required; issue_proforma and confirm_proforma unconditionally fenced.]
- [x] T007 Verify Add-to-Cart zero-reservation behavior in `tests/commerce/cart-zero-reservation.test.ts`.

## Phase 1 — Contract and schema foundation

- [x] T008 Define Feature 015 commerce error codes and DTOs in `lib/commerce/types.ts` and `lib/commerce/errors.ts`.
- [x] T009 Write trigger-compatible proforma lifecycle tests: inserted `ISSUED`, then confirmed with required fields, immutable snapshot preserved.
- [x] T010 Write payment derivation tests asserting `payments.amount = payments.expected_amount = proforma.buyer_total`.
- [x] T011 Write the shared-backing-position aggregate-demand test.
- [x] T012 Write checkout idempotency tests for same and different request IDs.
- [x] T013 Write Feature 014 notification regression tests for one in-app issuance notice, one hold notice, expiry and no proof notice.
- [x] T014 Write cutover tests for direct RPCs, `requestProforma`, `confirmReservation`, and unconditional fences.
- [x] T015 Write upload-intent identity tests covering forged path, forged organization, filename tampering, expired intent and finalized intent.
- [x] T016 Write direct Storage, `payment_proofs`, and proof-linked `file_assets` RLS tests for every access-matrix role.
- [x] T017 Write finalize idempotency and same/different request-ID replay tests.
- [x] T018 Write expiry structured-result tests that assert the actual release result and terminal rows.
- [x] T019 Write a live finalize-versus-sweeper race test covering both possible winners and counter integrity. (VERIFIED in the owner-approved remote Feature 015 suite: Test 18.)
- [x] T020 Write cleanup tests proving raw paths are rejected and finalized/cross-tenant objects cannot be deleted.
- [x] T021 Verify current Feature 013 snapshot triggers, current proof/table policies, release function, sweeper, and direct-RPC grants against the planned migration.

## Phase 2 — Forward migration authoring

**Depends on T001–T006 and T009–T021. Historical migrations remain untouched.**

- [x] T022 Author the forward migration with the owner-approved bucket configuration and MIME/size constraints.
- [x] T023 Add `payment_proof_upload_intents`, exact-object uniqueness, one-prepared-intent constraint, status/timestamp checks and no direct browser-write grant.
- [x] T024 Add protected prepare operation with persisted intent, stable request ID and exact canonical path.
- [x] T025 Add exact-intent Storage helper and private `storage.objects` policies; allow client SELECT/INSERT only as the contract permits.
- [x] T026 Add coordinated proof-specific `payment_proofs` and proof-linked `file_assets` read policies/grants using buying capability, Finance/Admin and no broader proof access.
- [x] T027 Amend order-transition and proforma-integrity-compatible logic for `DRAFT → HOLD` and `HOLD → PAYMENT_PROOF_SUBMITTED`.
- [x] T028 Implement `checkout_bank_transfer_v1`: authorization before idempotency replay, deterministic locks, aggregate position demand and database quote/VAT authority.
- [x] T029 Complete checkout's Feature 013 proforma sequence: full `ISSUED` snapshot, same-transaction confirmation, bank instructions, and server-derived payment monetary fields.
- [x] T030 Preserve Feature 014 notifications idempotently for direct checkout issuance and hold; assert no proof notification path is added.
- [x] T031 Implement unconditional fences for `issue_proforma` and `confirm_proforma`, with narrow authenticated execution grants.
- [x] T032 Implement `finalize_payment_proof` with mandatory request ID, locked intent lookup, exact-object verification, review-hold transition and idempotency.
- [x] T033 Implement safe expired-finalize branch: call release, capture actual boolean, verify terminal state, and return non-exception JSON.
- [x] T034 Add safe internal cleanup support bound to locked unfinalized intent only.
- [x] T035 Author migration postflight and safe rollback scripts before any application; neither script may be executed by this task.

## Phase 3 — Application integration

**Depends on Phase 2 migration implementation and local test database availability.**

- [x] T036 Implement DAL checkout caller with stable request-ID propagation.
- [x] T037 Replace checkout action with `completeCheckoutOrder`; remove `requestProforma` as a new-order route.
- [x] T038 Refactor shared proforma snapshot/bank-instruction helpers to serve the trigger-compatible checkout sequence.
- [x] T039 Fence `confirmReservation` and legacy UI unconditionally for Feature 015 cutover.
- [x] T040 Implement `preparePaymentProofUpload` using persisted intent; return exact path and policy constraints only.
- [x] T041 Implement direct browser upload using the returned intent identity; retain filename solely for display.
- [x] T042 Implement `finalizePaymentProof` with mandatory stable request ID and structured expiry mapping.
- [x] T043 Implement internal-only orphan cleanup invocation using intent ID.
- [x] T044 Implement proof DAL reads through protected views/policies without broad table access.

## Phase 4 — Buyer UI and accessibility

- [x] T045 Build checkout submission UI with single-submit behavior and safe inventory-error mapping.
- [x] T046 Update checkout page to use atomic checkout.
- [x] T047 Update proforma page for confirmed snapshot, immediate countdown and bank instructions; remove new-order confirm panel.
- [x] T048 Build proof-upload UI from returned intent constraints, with retry retaining intent and request IDs.
- [x] T049 Build Pending Verification UI shown only after committed finalization.
- [x] T050 Test mobile, RTL Arabic, dark/light themes, keyboard access, 44px targets and LTR rendering for banking codes.

## Phase 5 — Validation and readiness

- [x] T051 Run checkout, proforma lifecycle, payment amount, VAT, aggregate-stock and cart regression suites. (VERIFIED: owner-approved remote live Tests 1–8 and targeted unit/contract regressions.)
- [x] T052 Run upload-intent, cleanup, Storage/table RLS and direct-RPC cutover security suites. (VERIFIED: owner-approved remote live Tests 9–16, 21–22 and targeted unit/contract regressions.)
- [x] T053 Run idempotency, expiry, repeated-sweeper and live finalize-versus-sweeper race suites in isolated fixtures. (VERIFIED: owner-approved remote live Tests 17–20 and targeted unit/contract regressions.)
- [x] T054 Run Feature 014 notification regression suites.
- [x] T055 Run typecheck, lint, production build, diff check and quickstart scenarios. (VERIFIED: lint, typecheck, production build, canonical `git diff --check`, targeted unit/contract and owner-approved remote live scenarios.)
- [x] T056 Review the complete Feature 015 diff for scope, decision evidence, historical-migration preservation and Feature 016 boundary before requesting implementation sign-off. (COMPLETE: historical migrations preserved; Feature 015 stops at Pending Verification; final remote postflight and `FEATURE_015_STATE=APPLIED` verified.)

## Dependencies and safe parallel work

T001–T003 are resolved owner-decision gates. T004–T006 are required cutover preflight gates before migration authoring. T022–T035 cannot begin until they and the Phase 1 contract tests exist. T028 and T029 are one checkout transaction and must be implemented together. T025 and T026 must land before application upload work. T032–T034 must land before T040–T043. Migration postflight/rollback scripts are written before any application, and no task applies them.

Test files in T009–T020 may be authored in parallel when they do not share fixtures. Live concurrency tests, sweeper tests and RLS tests execute serially against isolated databases or schemas. UI components may be built in parallel only after their action contracts are stable.

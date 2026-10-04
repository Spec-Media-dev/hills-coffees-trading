# Tasks: Production Closure & Stripe Runtime Retirement

**Input**: Design documents from `/specs/017-stripe-runtime-retirement/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/database-acl-retirement.md`, `contracts/runtime-absence.md`, `quickstart.md`

**Tests**: Required. Feature 017 explicitly requires retirement/absence, denied-RPC, historical-preservation, compatibility, migration lifecycle, rollback/recovery, and remote TEST/DEMO evidence.

**Organization**: Tasks are grouped by user story after the shared retirement-safety and foundational work. Remote tasks are explicitly separated and must not run without their approved TEST/DEMO gate.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable after stated dependencies; tasks touch different files.
- **[Story]**: User story traceability label.
- Every task names its concrete target path(s).

## Phase 1: Retirement Safety Tests and Static Contracts (LOCAL/STATIC)

**Purpose**: Establish replacement tests before removing runtime/dependencies, with historical-source exclusions that prevent false failures.

- [x] T001 Create the Feature 017 source-scope helper and comment-stripping/exclusion rules in `tests/finance/f017-runtime-absence.test.ts` for `src/`, `lib/`, `components/`, `supabase/functions/`, `package.json`, and `package-lock.json`, excluding preserved historical SQL/spec artifacts.
- [x] T002 [P] Create static absence assertions in `tests/finance/f017-runtime-absence.test.ts` for Stripe SDK imports, provider funding seams, Payment Element controls, Stripe runtime env reads, and `stripe-*` Edge Function directories.
- [x] T003 [P] Create dependency-manifest assertions in `tests/finance/f017-runtime-absence.test.ts` for absence of `stripe` and `@stripe/stripe-js` from `package.json` and `package-lock.json` after retirement.
- [x] T004 [P] Create payment-detail bank-transfer/history UI contract tests in `tests/finance/f017-payment-detail.test.tsx` covering permitted history display and absence of provider/card/funding controls.
- [x] T005 [P] Create historical-preservation assertions in `tests/finance/f017-history-preservation.test.ts` scoped to `supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql`, its rollback/postflight artifacts, and provider schema names without requiring runtime capability.
- [x] T006 Replace obsolete provider-path expectations in `tests/finance/funding.test.ts`, `tests/finance/stripe-boundary-security.test.ts`, `tests/finance/stripe-webhook.test.ts`, and related `tests/finance/stripe-*.test.ts` with the Feature 017 absence/retirement contract; do not weaken active bank-transfer assertions.

**Checkpoint**: Replacement tests define the retirement boundary while historical evidence remains explicitly allowed.

---

## Phase 2: Foundational ACL, Compatibility, and Recovery Harness (LOCAL/STATIC)

**Purpose**: Build the test/ops contracts that block unsafe migration work and preserve final retirement state after rollback testing.

- [x] T007 Create local SQL-contract tests in `tests/commerce/migrations/f017-stripe-retirement-contract.test.ts` for required signatures, forward revoke targets, preserved definitions/owners/search paths, rollback baseline, and unchanged `checkout_order`/`submit_payment_proof` fences.
- [x] T008 [P] Create Feature 017 postflight/security contract tests in `tests/commerce/migrations/f017-stripe-retirement-contract.test.ts` for active V1 grants, Feature 015 proof seams, Feature 016 finance security seams, and no PUBLIC/anon execution of retired functions.
- [x] T009 Create the state-inspection, applied-state assertion, and ACL-aware Feature 016 scenario-selection API in `tests/finance/f017-live-retirement.test.ts`; select Feature 016 Scenarios 1–27 only and never alter `tests/finance/f016-live-scenarios.ts` historical semantics.
- [x] T010 Implement mandatory restoration/finally contract tests in `tests/finance/f017-live-retirement.test.ts` for rollback-baseline, compatibility, reapply, postflight, denial-proof, and final-state failures; require inspect → conditional reapply → Feature 017 postflight → retired-ACL proof before surfacing the original failure.
- [x] T011 Add fatal-recovery reporting contract tests in `tests/finance/f017-live-retirement.test.ts` requiring migration state, all four effective ACLs, failed restoration step, application-role exposure status, and the safe operator recovery command when restoration fails.
- [x] T012 Add the Feature 017-aware replacement for historical Feature 016 Scenario 29 in `tests/finance/f017-live-retirement.test.ts`: retained `admin_review_payment` definition plus denied application execution, callable `finance_review_bank_transfer_v1`, preserved Feature 015/016 seams, fixture cleanup, and Feature 017 postflight.

**Checkpoint**: No migration implementation begins until local contracts prove the final state, selected Feature 016 compatibility boundary, and restoration-first lifecycle.

---

## Phase 3: User Story 1 - Complete a Bank-Transfer Payment Journey (Priority: P1) (LOCAL/STATIC)

**Goal**: Remove buyer-facing/provider runtime while retaining the supported bank-transfer payment/history journey.

**Independent Test**: `tests/finance/f017-payment-detail.test.tsx` and active checkout/proof/finance suites show only bank-transfer/history behavior; no provider request/control is reachable.

- [x] T013 [US1] Modify `src/app/dashboard/payments/[orderId]/page.tsx` to remove `requestFunding`, Stripe config, Stripe collector, and funding-unavailable rendering while preserving authenticated/RLS-scoped payment, financial, proforma, invoice, payout, and seller-safe history reads.
- [x] T014 [P] [US1] Delete `lib/finance/funding.ts` after T013 removes its sole product caller and update imports/tests in `src/app/dashboard/payments/[orderId]/page.tsx` and `tests/finance/f017-runtime-absence.test.ts`.
- [x] T015 [P] [US1] Delete `components/finance/stripe-payment-collector.tsx` and `components/finance/funding-unavailable-notice.tsx`, then update `tests/finance/f017-runtime-absence.test.ts` and `tests/finance/f017-payment-detail.test.tsx`.
- [x] T016 [P] [US1] Delete `lib/finance/stripe/config.ts`, `lib/finance/stripe/adapter.ts`, and `lib/finance/stripe/webhook.ts` after confirming no remaining production caller through `tests/finance/f017-runtime-absence.test.ts`.
- [x] T017 [US1] Delete `lib/finance/settlement.ts` after confirming it is the sole product caller of retired `admin_review_payment`; update caller-audit expectations in `tests/finance/f017-runtime-absence.test.ts`.
- [x] T018 [US1] Modify `lib/finance/errors.ts`, `lib/finance/validation.ts`, and `lib/types/action-feedback.ts` to remove only unreachable provider/funding/legacy-settlement types and mappings while retaining active bank-transfer/proof/finance feedback.
- [x] T019 [US1] Run and repair the focused payment-detail, checkout/proforma, proof, and finance-review local suites listed in `specs/017-stripe-runtime-retirement/quickstart.md`.

**Checkpoint**: A buyer can use the existing bank-transfer journey and payment/history display without a Stripe/card/provider runtime path.

---

## Phase 4: User Story 2 - Prevent Retired Provider Execution (Priority: P1) (LOCAL/STATIC + SQL ARTIFACTS)

**Goal**: Retire provider and legacy-review execution while preserving definitions, owner ownership, active V1 grants, and safe recovery.

**Independent Test**: Local migration/rollback/postflight contracts prove the four retired operations are denied to PUBLIC, anon, authenticated, and service_role, while active V1 operations remain authorized.

- [x] T020 [US2] Create the read-only fail-closed preflight and forward retirement migration in `supabase/migrations/20261003100000_feature_017_stripe_runtime_retirement.sql` for exact signatures, security/search-path baseline, ACL baseline, provider/nonterminal/trusted-funding/event/transfer absence, no reviewable legacy/provider state, and active V1 compatibility assertions.
- [x] T021 [US2] Add exact application-role EXECUTE revocations for `admin_review_payment`, `record_stripe_payment_intent`, `record_payment_transfer`, and `ingest_stripe_event` to `supabase/migrations/20261003100000_feature_017_stripe_runtime_retirement.sql`; preserve definitions, bodies, owners, schema, rows, and `checkout_order`/`submit_payment_proof` grants.
- [x] T022 [US2] Create bounded ACL-only rollback in `supabase/rollback/20261003100000_feature_017_stripe_runtime_retirement.rollback.sql` that verifies forward state then restores only the captured pre-017 grants, without restoring runtime source, packages, env reads, secrets, or Edge deployment.
- [x] T023 [US2] Create read-only Feature 017 postflight in `supabase/maintenance/20261003_feature_017_stripe_runtime_retirement_postflight.sql` for retained definitions, owners, `SECURITY DEFINER`/search paths, denied retired grants, untouched legacy fences, active V1 grants, proof/finance seams, and historical provider schema presence.
  - Reopened during the final local repair on 2026-10-03; rechecked only after the executable in-memory PostgreSQL contracts passed. All 14 effective historical policies are captured independently from PostgreSQL catalogs, with pinned deparser visibility and complete policy tuples. `tests/commerce/migrations/f017-policy-baseline.test.ts` passes all 31 healthy/mutation/CRLF/task-truthfulness contracts; the focused policy/session/retirement run passes 119 tests with 2 remote-gated skips. No remote verification was executed.
- [x] T024 [US2] Extend `tests/commerce/migrations/f017-stripe-retirement-contract.test.ts` to validate the implemented forward migration, rollback, and postflight against `specs/017-stripe-runtime-retirement/contracts/database-acl-retirement.md`.
- [x] T025 [US2] Implement live denied-RPC/no-mutation tests for application roles in `tests/finance/f017-live-retirement.test.ts`, including retained-definition checks and active `finance_review_bank_transfer_v1` authorization proof.

**Checkpoint**: The database design is fail-closed, ACL-only, rollback-bounded, and cannot leave an intentional provider execution path.

---

## Phase 5: User Story 3 - Preserve Historical Financial Evidence (Priority: P2) (LOCAL/STATIC)

**Goal**: Preserve historical provider evidence and permitted history views without an operational provider path.

**Independent Test**: Historical-preservation tests confirm retained SQL/schema evidence while absence/denial tests prove no historical record can reactivate funding, settlement, or transfer execution.

- [x] T026 [US3] Update `tests/finance/f017-history-preservation.test.ts` to assert retained Feature 008 migration/rollback/postflight evidence, provider function definitions, provider-related schema names, and preservation exclusions from runtime-absence scans.
- [x] T027 [US3] Verify `lib/finance/read.ts`, `lib/finance/types.ts`, and `src/app/dashboard/payments/[orderId]/page.tsx` retain only legitimate, RLS-safe history reads; update `tests/finance/f017-payment-detail.test.tsx` for authorized historical display and cross-tenant/seller privacy.
- [x] T028 [US3] Run targeted historical preservation and payment-read/privacy tests in `tests/finance/f017-history-preservation.test.ts`, `tests/finance/read.test.ts`, and Feature 015 proof/privacy suites without deleting or rewriting financial/audit history.

**Checkpoint**: Historical evidence remains readable only through existing privacy boundaries and never enables provider execution.

---

## Phase 6: User Story 4 - Present Accurate Payment Information (Priority: P2) (LOCAL/STATIC)

**Goal**: Converge buyer/admin payment copy on the bank-transfer-only model while retaining legitimate history.

**Independent Test**: Payment surfaces have no stale Stripe/card/future-provider language and still render bank-transfer lifecycle/history states correctly.

- [x] T029 [US4] Modify `lib/app/copy/en.ts` to remove provider/card/funding/future-provider copy that is unreachable after runtime removal while preserving bank-transfer, proof, finance-decision, and historical payment language.
- [x] T030 [US4] Update payment-related UI tests in `tests/finance/f017-payment-detail.test.tsx` and `tests/finance/t022-payment-state.test.tsx` to assert bank-transfer-only copy and retain legitimate status/history coverage without Stripe-specific expectations.
- [x] T031 [US4] Run buyer/admin payment UI, accessibility, unauthorized, empty, and historical-state regressions for `src/app/dashboard/payments/[orderId]/page.tsx` and related payment views.

**Checkpoint**: Payment screens accurately describe the only supported method and do not misrepresent historical provider records as actionable.

---

## Phase 7: Edge Function Source and Package Retirement (LOCAL/STATIC)

**Purpose**: Remove redeployable provider source only after replacement tests protect the boundary.

- [x] T032 Delete `supabase/functions/stripe-create-payment-intent/index.ts`, `supabase/functions/stripe-webhook/index.ts`, and `supabase/functions/stripe-release-transfer/index.ts` and verify directory absence through `tests/finance/f017-runtime-absence.test.ts`.
- [x] T033 Remove obsolete Stripe-only tests and imports in `tests/finance/stripe-webhook.test.ts`, `tests/finance/stripe-boundary-security.test.ts`, `tests/finance/funding.test.ts`, and any other paths identified by `tests/finance/f017-runtime-absence.test.ts`; retain replacement retirement coverage.
- [x] T034 Update `package.json` and `package-lock.json` to remove `stripe` and `@stripe/stripe-js`, then prove package/lockfile absence through `tests/finance/f017-runtime-absence.test.ts`.
- [x] T035 Run `npm run typecheck`, `npm run lint`, focused Feature 017 tests, relevant Feature 009/013/014/015/016 local suites, `npm run build`, and `git diff --check` after source/package retirement.

**Checkpoint**: No product/runtime or redeployable Stripe source/package remains; active local compatibility remains green.

---

## Phase 8: Remote TEST/DEMO Verification and Final Closure (REMOTE/LIVE — EXPLICIT APPROVAL REQUIRED)

**Purpose**: Validate only against pinned TEST/DEMO project `mxejnutukgxyccnohglo`; do not execute any task in this phase without the approved remote gate, target assertions, verified TLS, and environment-only credentials.

- [x] T036 Run exact target identity, no-local/no-mixed-target, TLS, and approval-gate assertions using `scripts/f016-live-target.ts`, `scripts/pg-simple-exec.mjs`, and `tests/finance/f017-live-retirement.test.ts` before any remote SQL.
- [x] T037 Run Feature 017 read-only provider/legacy/ACL preflight from `supabase/migrations/20261003100000_feature_017_stripe_runtime_retirement.sql` against `mxejnutukgxyccnohglo`; stop on unexpected state and do not reconcile data.
- [x] T038 Apply `supabase/migrations/20261003100000_feature_017_stripe_runtime_retirement.sql` only after T036–T037 pass, then record Feature 017 APPLIED state through `tests/finance/f017-live-retirement.test.ts`.
- [x] T039 Run `supabase/maintenance/20261003_feature_017_stripe_runtime_retirement_postflight.sql` and live retired-RPC denial/no-mutation proof in `tests/finance/f017-live-retirement.test.ts`.
- [x] T040 Run the Feature 017 ACL-aware Feature 016 compatibility wrapper in `tests/finance/f017-live-retirement.test.ts`: Feature 016 Scenarios 1–27 only, no Scenario 28, no unchanged Scenario 29, and Feature 017 postflight as the replacement assertion.
- [x] T041 Start rollback/reapply verification from a confirmed applied/postflight-green state in `tests/finance/f017-live-retirement.test.ts`; execute `supabase/rollback/20261003100000_feature_017_stripe_runtime_retirement.rollback.sql` and assert only the captured pre-017 ACL baseline.
- [x] T042 Execute bounded rollback compatibility checks and mandatory finally recovery in `tests/finance/f017-live-retirement.test.ts`; on any later failure inspect state, conditionally reapply `supabase/migrations/20261003100000_feature_017_stripe_runtime_retirement.sql`, rerun Feature 017 postflight, and prove final revoked ACLs before reporting the original failure.
- [x] T043 Exercise and verify fatal recovery reporting in `tests/finance/f017-live-retirement.test.ts`; if restoration cannot complete, stop all further verification and report migration state, all four effective ACLs, failed step, exposure status, and `npx tsx scripts/f017-operator-recovery.ts` as the operator recovery route.
- [x] T044 Reapply/confirm Feature 017 forward state after rollback testing, run final Feature 017 postflight, prove all four retired application-role grants are denied, and prove active V1 bank-transfer paths remain healthy in `tests/finance/f017-live-retirement.test.ts`.
- [x] T045 Run final management inventory for `mxejnutukgxyccnohglo` with `supabase functions list` and `supabase secrets list`; record only `stripe-*` deployment absence and Stripe/provider secret-name absence, never secret values.
- [x] T046 Record final TEST/DEMO closure evidence in `specs/017-stripe-runtime-retirement/quickstart.md` verification notes or the Feature 017 implementation report, confirming APPLIED + postflight PASS + denied ACLs + active V1 health + no deployed Stripe functions/secrets.

**Checkpoint**: Final remote state is retirement-hardened, never rollback state.

---

## Phase 9: Cross-Cutting Final Verification (LOCAL/STATIC)

**Purpose**: Confirm repository hygiene, preserved infrastructure, and scoped completion evidence.

- [x] T047 Verify `tests/finance/f016-live-db.test.ts`, `tests/finance/f016-live-scenarios.ts`, `tests/finance/f016-live-fixtures.ts`, `tests/finance/f016-live-session.ts`, `scripts/f016-live-target.ts`, and `scripts/pg-simple-exec.mjs` remain retained as test/ops infrastructure and are not imported into product runtime.
- [x] T048 Re-run `npm run typecheck`, `npm run lint`, targeted Feature 017/Feature 009–016 suites, `npm run build`, and `git diff --check`; document exact commands/results in Feature 017 implementation evidence without committing.
- [x] T049 Review the final diff against `specs/017-stripe-runtime-retirement/spec.md`, `plan.md`, `contracts/database-acl-retirement.md`, and `contracts/runtime-absence.md` to confirm no historical financial data, historical migration, rollback/postflight artifact, or active bank-transfer capability was removed outside scope.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: Starts immediately; creates the safety net before deletion.
- **Phase 2**: Depends on Phase 1; blocks all source deletion and SQL work.
- **US1 / Phase 3**: Depends on Phases 1–2.
- **US2 / Phase 4**: Depends on Phase 2; SQL artifacts must exist before remote tasks.
- **US3 / Phase 5** and **US4 / Phase 6**: Depend on Phase 1 and can proceed after their shared source changes are coordinated with US1.
- **Phase 7**: Depends on completion of the replacement tests and all runtime removals in Phases 3 and 6.
- **Phase 8**: Depends on Phases 1–7 and successful local verification; explicitly approved remote work only.
- **Phase 9**: Depends on desired local/source work and final remote closure evidence.

### User Story Dependencies

- **US1 (P1)**: Independent after foundational contracts; requires no provider execution or new database model.
- **US2 (P1)**: Independent after foundational contracts; its forward migration must not be applied before US1 static absence/compatibility tests exist.
- **US3 (P2)**: Depends on preserved history contracts from Phase 1 and coordinates with US1 payment-detail retention.
- **US4 (P2)**: Depends on US1 removal of provider UI branches; it does not depend on remote migration execution.

### Parallel Opportunities

- T002–T005 can proceed in parallel after T001 establishes the shared test scope.
- T007–T008 can proceed in parallel; T009–T012 are sequential harness work.
- T014–T016 can proceed in parallel after T013 removes payment-page callers; T018 follows their resulting import graph.
- T020–T023 can proceed in parallel only after T007–T008 define contract expectations; T024 validates them together.
- T026–T027 can proceed in parallel; T029 can proceed in parallel with T026 after T013 confirms retained UI shape.
- T032–T034 are sequential because replacement tests must precede Edge/package deletion.

## Implementation Strategy

### MVP First

1. Complete Phases 1–2.
2. Complete US1 runtime removal and its local bank-transfer payment-detail regression proof.
3. Validate the payment experience has no provider path before proceeding to SQL retirement.

### Incremental Delivery

1. Establish absence/ACL/recovery contracts.
2. Remove provider runtime and converge bank-transfer UI/copy.
3. Retire redeployable Edge/package capability.
4. Add and verify ACL-only database retirement lifecycle.
5. Execute approved TEST/DEMO verification that always restores the final retired state.

### Parallel Team Strategy

After Phase 2, one worker can own US1/US4 runtime and copy removal, another can own US2 SQL contracts/migration lifecycle, and another can own US3 preservation tests. Phase 8 remains serialized and operator-gated.

## Notes

- Historical Feature 016 Scenario 28 and unchanged Scenario 29 are explicitly excluded after retirement.
- No task authorizes production deployment, historical data deletion, new payment providers, payout automation, reconciliation work, or redesign of Features 009/013/014/015/016.
- All remote tasks must preserve credentials in environment variables and never print secret values.

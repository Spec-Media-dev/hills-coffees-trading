# Implementation Plan: Production Closure & Stripe Runtime Retirement

**Branch**: `017-stripe-runtime-retirement` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Clarified Feature 017 specification.

## Summary

Retire every active or redeployable Stripe/provider payment capability while preserving historical database evidence and the current bank-transfer lifecycle. The implementation first establishes absence and compatibility tests, then removes provider UI/server/Edge source and packages, then applies a forward-only database ACL retirement migration with a fail-closed preflight, bounded rollback, and read-only postflight. It does not alter historical migrations, provider data, active bank-transfer RPCs, or Feature 013–016 test/ops tooling.

## Technical Context

**Language/Version**: TypeScript 5; Node.js 20+; SQL for Supabase/PostgreSQL migrations

**Primary Dependencies**: Next.js 16.3.4, React 19.2.8, Supabase SSR/client libraries, Zod 4, Vitest 3; remove `stripe` and `@stripe/stripe-js`

**Storage**: Supabase PostgreSQL, Auth, and private Storage; no new persistent model

**Testing**: Vitest static/unit/integration suites; existing Feature 013–016 local/live verification; guarded direct PostgreSQL runner for approved remote TEST/DEMO preflight, migration, rollback, and postflight verification

**Target Platform**: Hills Coffee web application and Supabase TEST/DEMO project `mxejnutukgxyccnohglo`; no production deployment in scope

**Project Type**: Next.js web application with Supabase database/Edge source and test/ops tooling

**Performance Goals**: No regression to existing supported checkout, proof, finance review, or payment-history responsiveness; removal must not add a network request or client bundle dependency to those flows

**Constraints**:
- Bank transfer is the sole supported payment method.
- Historical provider rows/schema/migrations remain intact.
- Historical migrations and rollback files are immutable.
- No runtime Stripe SDK/import/config/Edge source remains after closure.
- Retired provider and legacy-review definitions remain in the database but have no PUBLIC, anon, authenticated, or service-role EXECUTE grant.
- Existing active RPC grants, Security Definer configuration, MFA/finance authorization, RLS/privacy, idempotency, and inventory rules must remain unchanged.
- Credentials remain environment-only and must never be logged.

**Scale/Scope**: One payment detail route, finance provider/legacy seams, three undeployed Edge Function source directories, two package dependencies, targeted tests, and one new forward migration/rollback/postflight set.

## Constitution Check

| Gate | Status | Plan response |
|---|---|---|
| Source-of-truth and database authority | PASS | Use verified remote ACL/data evidence, the approved schema baseline, and a new guarded forward migration; no client-side settlement logic. |
| Server/database authorization and RLS | PASS | Revoke retired execution at the database boundary; preserve active RPC grants and authorization tests. |
| Inventory/transactional integrity | PASS | Do not change inventory, reservations, ownership, storage allocations, or current finance-review workflow; regression proof is mandatory. |
| Security and secrets | PASS | Remove Stripe runtime reads/dependencies; retain only active test/ops environment variables; preserve private proof controls. |
| Non-destructive financial/audit handling | PASS | Preserve provider rows, columns, events, transfers, invoices, audit history, and historical SQL artifacts. |
| Spec-driven continuity | PASS | Use explicit preflight, forward, rollback, postflight, contracts, and retained Feature 013–016 verification tooling. |
| No production activation | PASS | Remote work is TEST/DEMO verification only; no deployment, secret removal, or Edge Function undeploy command is planned. |

**Post-design re-check**: PASS. The design removes dormant capability without introducing a new payment flow, data model, infrastructure dependency, or authorization bypass.

## Project Structure

### Documentation (this feature)

```text
specs/017-stripe-runtime-retirement/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── database-acl-retirement.md
│   └── runtime-absence.md
└── tasks.md                  # Created later by /speckit-tasks
```

### Source and Operations Scope

```text
src/app/dashboard/payments/[orderId]/page.tsx             MODIFY: bank-transfer/history-only detail page
components/finance/funding-unavailable-notice.tsx         DELETE: obsolete provider funding state
components/finance/stripe-payment-collector.tsx           DELETE
lib/finance/funding.ts                                    DELETE
lib/finance/settlement.ts                                 DELETE: sole application legacy-review caller
lib/finance/stripe/{config,adapter,webhook}.ts            DELETE
lib/finance/{errors,validation}.ts                        MODIFY: remove provider-only mappings/types/validation
lib/types/action-feedback.ts                               MODIFY: remove provider-only feedback values
lib/app/copy/en.ts                                        MODIFY: remove provider/funding copy
package.json                                               MODIFY: remove Stripe SDK packages
package-lock.json                                          MODIFY: remove resolved Stripe SDK packages
supabase/functions/stripe-create-payment-intent/          DELETE
supabase/functions/stripe-webhook/                        DELETE
supabase/functions/stripe-release-transfer/               DELETE
supabase/migrations/20261003100000_feature_017_stripe_runtime_retirement.sql  CREATE
supabase/rollback/20261003100000_feature_017_stripe_runtime_retirement.rollback.sql CREATE
supabase/maintenance/20261003_feature_017_stripe_runtime_retirement_postflight.sql CREATE
tests/finance/stripe-*.test.ts, funding.test.ts            DELETE/REPLACE only after new absence coverage
tests/finance/f017-live-retirement.test.ts                 CREATE: ACL-aware compatibility and mandatory restoration path
tests/finance/f016-*.test.ts and scripts/f016-*.ts         PRESERVE
Feature 009/013/014/015/016 regression suites              PRESERVE; extend only where ACL contracts change
```

**Structure Decision**: Use the existing Next.js, Supabase SQL, and Vitest structure. No new product module or persistent table is required.

## Implementation Strategy

### 1. Establish retirement and compatibility contracts before removal

Create focused Feature 017 tests that use comment-stripped source inspection over production scopes only (`src/`, `lib/`, `components/`, `supabase/functions/`, and dependency manifests). Explicitly exclude `specs/`, `supabase/migrations/`, `supabase/rollback/`, `supabase/maintenance/`, historical fixtures, and test descriptions where Stripe evidence is intentionally retained. Test that:

- no runtime Stripe SDK/import/config/env read, provider funding seam, Payment Element, or `stripe-*` function source remains;
- bank-transfer payment detail remains readable and offers no provider control;
- retired database operations are denied to application roles without mutation;
- historical provider schema/data is not dropped or rewritten; and
- existing Feature 009/013/014/015/016 suites remain the source of truth for active behavior.

Replace rather than weaken provider-era test assertions. Do not remove Feature 016 live sessions, target guards, fixtures, recovery, or PostgreSQL tools.

Feature 016 compatibility is ACL-aware after retirement. Treat the completed Feature 016 29-scenario run and its historical postflight as pre-Feature-017 evidence; do not rerun Scenario 28 or Scenario 29 unchanged after Feature 017 because they respectively roll Feature 016 back/reapply and invoke a historical postflight that expects authenticated `admin_review_payment` execution. Add a Feature 017-specific selection/wrapper layer rather than changing Feature 016 historical semantics. It may rerun Feature 016 Scenarios 1–27 (confirm/reject, replay, concurrency, conservation, invoices, ownership/storage, fulfillment, notifications/audit, failpoints, proof privacy, target/TLS safety, and fixture cleanup) because they exercise `finance_review_bank_transfer_v1`; it must use Feature 017 postflight plus a new ACL-aware compatibility assertion in place of the historical Scenario 29 postflight call.

### 2. Remove the runtime/redeployable Stripe surface

| Path/group | Action | Dependency/caller rationale |
|---|---|---|
| `src/app/dashboard/payments/[orderId]/page.tsx` | MODIFY | It is the reachable funding caller. Remove `requestFunding`, Stripe config, collector, and unavailable-funding section; retain existing authenticated/RLS-scoped payment, financial, proforma, tax invoice, payout, and seller-safe history reads. |
| `lib/finance/funding.ts` | DELETE | Its only purpose is provider funding and its only product caller is the payment detail page. |
| `components/finance/stripe-payment-collector.tsx` | DELETE | Rendered only by the payment detail provider branch. |
| `components/finance/funding-unavailable-notice.tsx` | DELETE | Exists solely for the removed funding seam. |
| `lib/finance/stripe/config.ts`, `adapter.ts`, `webhook.ts` | DELETE | Provider config/API/signature boundaries have no supported caller after retirement. |
| `lib/finance/settlement.ts` | DELETE | It is the sole product caller of retired `admin_review_payment`; active V1 finance review uses its Feature 016 path. |
| `lib/finance/errors.ts`, `lib/finance/validation.ts`, `lib/types/action-feedback.ts`, `lib/app/copy/en.ts` | MODIFY | Remove only provider/funding/legacy-settlement values and copy that become unreachable; retain bank-transfer errors, proof terms, and active finance feedback. |
| `supabase/functions/stripe-*` | DELETE | All three are undeployed and no longer have a supported responsibility. |
| `package.json`, `package-lock.json` | MODIFY | Remove `stripe` and `@stripe/stripe-js` after tests no longer import them. |

### 3. Database execution retirement

Create only the new Feature 017 files named in Project Structure. The forward migration will:

1. Begin a transaction and perform read-only fail-closed preflight.
2. Assert the four retained definitions have exactly one expected signature, remain `SECURITY DEFINER`, retain their approved search-path configuration, and have the verified pre-Feature-017 effective grants.
3. Assert `checkout_order` and `submit_payment_proof` signatures, fences, and grants remain their verified compatibility baseline.
4. Assert no provider/non-bank payment rows, nonterminal provider rows, trusted-funding references, provider events/transfers, or legacy/provider operational rows that would require `admin_review_payment` exist. It must report state/count only and must not reconcile/delete data.
5. Revoke EXECUTE from PUBLIC, anon, authenticated, and service_role for `admin_review_payment`, `record_stripe_payment_intent`, `record_payment_transfer`, and `ingest_stripe_event`; retain definitions and owner ownership.
6. Assert the active V1 bank-transfer operation grants remain unchanged.

The migration must not drop functions, tables, columns, indexes, policies, historical rows, or historical artifacts.

### 4. Rollback, postflight, and restoration-safe lifecycle

The rollback is database ACL rollback only; application/source rollback is version-control work and does not redeploy Stripe. It must preflight the Feature 017 forward state and restore only the verified effective grants:

| Function | Verified pre-Feature-017 effective EXECUTE grantees |
|---|---|
| `admin_review_payment(uuid,boolean,text)` | `authenticated`, `service_role`, owner (`postgres`) |
| `record_stripe_payment_intent(uuid,text,text)` | `authenticated`, `service_role`, owner (`postgres`) |
| `record_payment_transfer(uuid,text,text,text)` | `authenticated`, `service_role`, owner (`postgres`) |
| `ingest_stripe_event(text,text,text,uuid,jsonb,boolean)` | `service_role`, owner (`postgres`) |
| `checkout_order(uuid)` | `authenticated`, `service_role`, owner (`postgres`) — assertion only |
| `submit_payment_proof(uuid,uuid,text)` | `authenticated`, `service_role`, owner (`postgres`) — assertion only |

The postflight is read-only and asserts definitions/signatures/security/search paths, denied grants for the four retired operations, owner validity, preserved compatibility grants/fences, active V1 operation grants, provider-history schema presence, and no unexpected PUBLIC/anon grants. It is also the required Feature-017-aware replacement for historical Feature 016 postflight usage after retirement.

Remote rollback/reapply verification is state-aware and restoration-safe:

1. Assert Feature 017 is APPLIED and Feature 017 postflight is green.
2. Execute Feature 017 rollback and assert the exact captured pre-017 ACL baseline.
3. Run only bounded compatibility checks that do not alter grants or replay historical Feature 016 migration/postflight behavior.
4. Reapply Feature 017, run Feature 017 postflight, and prove the final retired ACL state.
5. Once rollback succeeds, a mandatory `finally`/recovery path owns final state. On failure of any later baseline check, compatibility check, reapply, postflight, denial proof, or final assertion, it detects current migration/ACL state, reapplies Feature 017 if not fully applied, runs Feature 017 postflight, and verifies retired execution before surfacing the original failure.
6. If recovery fails, stop all verification. Report current migration state, effective ACLs of all four retired functions, the failed restoration step, and whether application-role execution remains exposed. Do not continue unrelated suites or report completion. The implementation supplies the only operator recovery route as `npx tsx scripts/f017-operator-recovery.ts` under the existing approved remote target/credential gates; it must inspect → conditionally reapply Feature 017 → run Feature 017 postflight → assert retired ACLs, and must fail closed if restoration cannot complete.

### 5. Validation order

1. Add absence, denied-RPC, history-preservation, and compatibility-contract tests.
2. Modify the payment detail page and remove provider runtime modules/components/copy/errors/validation.
3. Delete undeployed Edge Function source and provider-era tests; remove packages/lockfile entries.
4. Run static absence and bank-transfer/UI tests before SQL work.
5. Add the forward migration, rollback, and postflight scripts with local contract tests.
6. Run Feature 009/013/014/015/016 focused regression suites, typecheck, lint, build, and diff checks.
7. With explicit approved TEST/DEMO gates only, run read-only remote preflight, forward migration, Feature 017 postflight, denied-RPC proof, and the ACL-aware Feature 016 compatibility wrapper (Scenarios 1–27 only plus Feature 017-aware cleanup/postflight assertion).
8. Run the restoration-safe rollback/reapply lifecycle. Success requires the final target to be Feature 017 APPLIED, Feature 017 postflight green, all four retired operation grants denied to application roles, and active V1 bank-transfer behavior healthy; the target must never intentionally remain in rollback state.
9. Re-run Edge Function and secret-name inventory without printing secret values; confirm no `stripe-*` deployment and no Stripe/provider secret name.

## Complexity Tracking

No constitution violations or additional complexity justification required.

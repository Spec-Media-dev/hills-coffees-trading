# Feature 017 Validation Quickstart

This guide validates Feature 017 closure without creating a new payment flow or exposing credentials. See [data-model.md](./data-model.md), [runtime-absence.md](./contracts/runtime-absence.md), and [database-acl-retirement.md](./contracts/database-acl-retirement.md).

## 1. Local Preconditions

1. Use the active Feature 017 branch and inspect the working tree; do not overwrite unrelated changes.
2. Keep active TEST/OPS environment variables private. Do not print credentials or pass them on command lines.
3. Do not use a local/F013 substitute for remote verification.
4. Retain the Feature 016 TLS root configuration and target-pinning path for direct TEST/DEMO PostgreSQL verification.

## 2. Static and Local Regression Validation

Run the new Feature 017 retirement/absence tests first, then the targeted compatibility suites for payment UI, bank-transfer checkout/proforma, private proof, finance review, notifications, delivery, and Feature 016 replay/concurrency/live-harness contracts.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Use targeted Vitest commands during development; the final task plan will name exact new and existing suites. Expected result: no provider runtime/package/Edge source remains, while active bank-transfer and compatibility suites pass.

### Closure evidence — 2026-10-03

- `npx vitest run tests/finance/f017-*.test.ts tests/commerce/migrations/f017-*.test.ts --reporter=dot`: 145 passed, 2 remote-gated skipped.
- `npx vitest run tests/commerce/f015-*.test.ts tests/finance/rls-policy.test.ts --reporter=dot`: 143 passed, 27 remote-gated skipped.
- `npx vitest run tests/finance/f016-*.test.ts tests/commerce/migrations/f016-*.test.ts tests/auth/fixture-session-f016-target.test.ts --reporter=dot`: 122 passed, 29 remote-gated skipped.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: passed.
- `npx tsx scripts/f017-operator-recovery.ts --self-check`: passed; no network connection opened.

## 3. Database Lifecycle Validation (TEST/DEMO Only)

Use only project `mxejnutukgxyccnohglo` and the existing Feature 016 approved runner/target assertions. The lifecycle is:

1. Run Feature 017 read-only preflight and record provider-state/signature/ACL evidence.
2. Apply the new forward retirement migration only under the explicit reviewed TEST/DEMO approval gate.
3. Run the Feature 017 read-only postflight.
4. Prove retired RPC denial under relevant roles and prove active V1 bank-transfer operations remain available to authorized actors.
5. Run the focused Feature 009/013/014/015/016 regression and the Feature 017 ACL-aware Feature 016 compatibility wrapper. The wrapper may run Feature 016 Scenarios 1–27 only; it uses Feature 017 postflight and a Feature-017-aware compatibility assertion instead of historical Feature 016 postflight.
6. Do **not** run historical Feature 016 Scenario 28 (it rolls Feature 016 back/reapplies) or Scenario 29 unchanged (it invokes historical postflight that expects authenticated `admin_review_payment`). Completed Feature 016 results remain valid pre-retirement evidence.
7. Assert Feature 017 is APPLIED and its postflight is green, then execute Feature 017 rollback and verify the exact pre-017 ACL baseline.
8. Run bounded rollback compatibility checks only. Reapply Feature 017, run Feature 017 postflight, prove denied retired execution and healthy active V1 behavior, then perform final residue checks.

Expected result: retirement modifies only the four intended execution boundaries; no financial/history/inventory data changes and active bank-transfer behavior remains intact. Successful remote verification always ends in Feature 017's applied retirement state, never in rollback state.

## 4. Runtime and Operations Closure

1. Verify the package manifest and lockfile have no Stripe SDK packages.
2. Verify the three Stripe Edge Function source directories are absent.
3. Use Supabase management inventory against the pinned TEST/DEMO project to confirm no deployed `stripe-*` functions and no Stripe/provider secret name. Record names/presence only; never output values.
4. Verify the payment detail route displays bank-transfer/history information without provider/card controls.

## 5. Failure Handling and Mandatory Recovery

Stop before any mutation when a preflight baseline, provider-state, target, TLS, inventory, privacy, or compatibility assertion fails. Do not reconcile data, broaden grants, delete history, disable TLS verification, or use broad fixture cleanup to force a passing result.

After a successful Feature 017 rollback, the target temporarily has pre-retirement execution grants. From that point the rollback/reapply harness must use a mandatory recovery/finally path. If rollback-baseline verification, bounded compatibility checks, forward reapply, postflight, denial proof, or final-state verification fails, it must first detect migration/ACL state; if Feature 017 is not fully applied, reapply its forward migration; run Feature 017 postflight; and prove retired execution before reporting the original failure.

If restoration fails, stop all verification immediately. Report the current migration state, effective grants of `admin_review_payment`, `record_stripe_payment_intent`, `record_payment_transfer`, and `ingest_stripe_event`, the restoration step that failed, and whether application-role execution is exposed. Do not run unrelated suites or claim closure.

The implementation must provide `tests/finance/f017-live-retirement.test.ts` with a named mandatory-restoration path. The safe operator recovery runbook is: confirm the linked target and Feature 016 target guards, set only the approved remote gate (`F016_REMOTE_LIVE_DB_APPROVED=1`) in a credential-bearing operator session, then run `npx tsx scripts/f017-operator-recovery.ts`. That path must inspect state, reapply `20261003100000_feature_017_stripe_runtime_retirement.sql` only if needed, run `20261003_feature_017_stripe_runtime_retirement_postflight.sql`, and prove the retired ACL state before returning. If it cannot do so, it must report failure rather than retry unrelated checks.

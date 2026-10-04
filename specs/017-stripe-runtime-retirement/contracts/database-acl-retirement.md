# Database ACL Retirement Contract

## Scope

This contract governs the new Feature 017 forward migration, rollback, and read-only postflight. It does not replace or edit historical migrations.

## Forward Preconditions

The forward migration must abort before any grant change unless all conditions hold on the pinned TEST/DEMO target:

1. The four retired definitions exist with their exact signatures and approved `SECURITY DEFINER`/search-path configuration.
2. Effective pre-retirement grants equal the captured baseline below.
3. `checkout_order` and `submit_payment_proof` retain their exact signatures and existing compatibility grant/fence baseline.
4. Provider/non-bank payments, nonterminal provider payments, trusted-funding references, provider events/transfers, and legacy/provider rows requiring legacy review are all absent.
5. Required active V1 bank-transfer functions and proof/finance security seams exist with their established grants.

Any failure reports the violated assertion and ends without reconciling, deleting, or changing business data.

## Forward Result

| Retired signature | PUBLIC | anon | authenticated | service_role | owner |
|---|---:|---:|---:|---:|---:|
| `admin_review_payment(uuid,boolean,text)` | denied | denied | denied | denied | unchanged |
| `record_stripe_payment_intent(uuid,text,text)` | denied | denied | denied | denied | unchanged |
| `record_payment_transfer(uuid,text,text,text)` | denied | denied | denied | denied | unchanged |
| `ingest_stripe_event(text,text,text,uuid,jsonb,boolean)` | denied | denied | denied | denied | unchanged |

The four definitions remain present. No table, column, row, policy, owner, function body, or active bank-transfer grant is changed by this retirement action.

## Verified Pre-Feature-017 Rollback Baseline

| Signature | Effective EXECUTE grantees to restore |
|---|---|
| `admin_review_payment(uuid,boolean,text)` | `authenticated`, `service_role`, owner (`postgres`) |
| `record_stripe_payment_intent(uuid,text,text)` | `authenticated`, `service_role`, owner (`postgres`) |
| `record_payment_transfer(uuid,text,text,text)` | `authenticated`, `service_role`, owner (`postgres`) |
| `ingest_stripe_event(text,text,text,uuid,jsonb,boolean)` | `service_role`, owner (`postgres`) |
| `checkout_order(uuid)` | `authenticated`, `service_role`, owner (`postgres`); assertion only |
| `submit_payment_proof(uuid,uuid,text)` | `authenticated`, `service_role`, owner (`postgres`); assertion only |

Rollback is permitted only after it confirms the forward retirement state. It restores exactly these grants and does not restore application source, packages, configuration reads, secrets, or Edge Function deployments.

## Feature 016 Compatibility Modes

### Historical/pre-retirement evidence

The completed Feature 016 29-scenario remote run and `20261002_feature_016_review_postflight.sql` remain valid historical evidence. They are not rerun unchanged after Feature 017 because the historical postflight expects authenticated execution of `admin_review_payment`, and Feature 016 Scenario 28 rolls Feature 016 back/reapplies.

### Post-Feature-017 compatibility evidence

A Feature 017-specific selection/wrapper layer must leave Feature 016 historical files unchanged and run only semantically compatible checks: Feature 016 Scenarios 1–27, which exercise `finance_review_bank_transfer_v1` for confirm/reject, replay/idempotency, compatible concurrency, inventory conservation, invoice exact-once, ownership/storage allocation, Feature 009 fulfillment handoff, notifications/audit, proof privacy, target/TLS safety, failure rollback, and cleanup. It must replace the historical Scenario 29 postflight call with Feature 017 postflight plus an ACL-aware assertion that the retained `admin_review_payment` definition exists but application-role execution is denied, while `finance_review_bank_transfer_v1` and Feature 015/016 security seams remain healthy.

## Postflight

The Feature 017 postflight is read-only and fails when any retired function is missing, any retired application-role grant remains, ownership/security configuration drifts, compatibility endpoints drift, or required V1 bank-transfer/proof/finance boundaries are weakened.

## Restoration-Safe Rollback/Reapply Contract

1. Begin only from Feature 017 APPLIED with Feature 017 postflight passing.
2. Roll back Feature 017 and verify exactly the captured pre-Feature-017 grants.
3. Run bounded compatibility checks that do not run Feature 016 rollback/reapply or historical postflight behavior.
4. Reapply Feature 017, run Feature 017 postflight, and verify the Forward Result table before success is reported.
5. Once rollback succeeds, any subsequent failure must enter mandatory recovery: inspect migration and effective ACL state; reapply Feature 017 if not fully applied; run Feature 017 postflight; verify all four application-role execution boundaries are denied; then report the original failure.
6. If recovery fails, stop immediately. Report current migration state, effective ACLs for all four retired functions, failed restoration step, and whether any application role is exposed. No unrelated tests may continue.

The implementation must provide the exact operator recovery path `npx tsx scripts/f017-operator-recovery.ts`, run only after the existing approved remote target/credential gates are established. Its contract is inspect → conditionally reapply `20261003100000_feature_017_stripe_runtime_retirement.sql` → run `20261003_feature_017_stripe_runtime_retirement_postflight.sql` → assert the Forward Result table. It must not run any unrelated scenario or report success if restoration does not finish.

A successful remote lifecycle ends only with Feature 017 APPLIED, Feature 017 postflight passing, all four retired functions denied to application roles, active V1 bank-transfer compatibility passing, and operations inventory confirming no deployed `stripe-*` function or Stripe/provider secret name.

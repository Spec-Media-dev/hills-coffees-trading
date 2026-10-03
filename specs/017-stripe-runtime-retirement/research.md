# Research: Production Closure & Stripe Runtime Retirement

## Decision 1: Retire execution by ACL revocation, not function deletion

**Decision**: Preserve the definitions of `admin_review_payment`, `record_stripe_payment_intent`, `record_payment_transfer`, and `ingest_stripe_event`; revoke EXECUTE from PUBLIC, anon, authenticated, and service_role in a new forward migration.

**Rationale**: The owner requires runtime retirement without destructive historical/schema deletion. Pre-spec remote evidence found no provider or unresolved legacy operational state. Retaining definitions preserves auditability and bounded rollback while revocation blocks application execution.

**Alternatives considered**:
- Drop or replace functions: rejected because it unnecessarily destroys historical schema evidence and expands rollback risk.
- Keep service-role execution: rejected because an application-reachable service boundary could reactivate provider behavior.

## Decision 2: Use the observed live ACLs as the rollback baseline

**Decision**: The migration preflight and rollback use the verified effective grants captured from `mxejnutukgxyccnohglo`, including owner ownership.

**Rationale**: Repository SQL grants alone do not fully describe effective ownership/default grants. The observed baseline is the only safe source for bounded rollback.

**Alternatives considered**:
- Infer ACLs solely from historical migrations: rejected because live effective ACLs included service-role/owner access not expressed as a simple single grant line.
- Restore all historical grants broadly: rejected because it could reopen unintended execution.

## Decision 3: Delete undeployed Stripe source and packages

**Decision**: Delete the three `stripe-*` Edge Function source directories, all product Stripe runtime modules/components, and both Stripe SDK packages after replacement tests are established.

**Rationale**: The remote inventory proves no Stripe Edge Function is deployed and no Stripe/provider secret name exists. Leaving source/dependencies would preserve a redeployable runtime path contrary to bank-transfer-only closure.

**Alternatives considered**:
- Archive source in the repository: rejected because it remains deployable and creates accidental reintroduction risk.
- Keep SDKs for retired-path tests: rejected because absence/denial tests prove the desired state without shipping retired dependencies.

## Decision 4: Keep legacy checkout/proof endpoints fenced

**Decision**: Do not revoke `checkout_order` or `submit_payment_proof` in Feature 017.

**Rationale**: They are not provider operations. `submit_payment_proof` is already fenced for V1 by Feature 015, and both are compatibility/regression baselines. Their retirement is not necessary to close Stripe capability.

**Alternatives considered**:
- Revoke both: rejected because it broadens the change beyond provider retirement and risks regression coverage/legacy compatibility without a demonstrated benefit.

## Decision 5: Retain the payment detail page as bank-transfer/history-only

**Decision**: Remove the provider funding branch and supporting notice; retain RLS-scoped payment, financial, proforma, invoice, payout, and seller-safe history display.

**Rationale**: The route remains valuable for supported bank-transfer state. Removing the entire page would lose legitimate payment history and violate preservation requirements.

**Alternatives considered**:
- Delete the page: rejected because it removes supported history display.
- Keep an unavailable-provider notice: rejected because it advertises a retired capability and leaves obsolete terminology.

## Decision 6: Scope absence checks to deployable/runtime surfaces

**Decision**: Static absence checks inspect runtime source, Edge source, manifests, and relevant UI; they explicitly exclude historical migrations, rollback/postflight artifacts, specifications, and preserved history fixtures.

**Rationale**: A repository-wide text ban would falsely treat required historical evidence as a regression. The desired guarantee is absence of active/redeployable runtime capability.

**Alternatives considered**:
- Global grep with no exclusions: rejected because historical Stripe evidence must remain.
- No static absence test: rejected because deleted runtime can be reintroduced silently.

## Decision 7: Remote verification stays gated and read-only until migration execution

**Decision**: Reuse Feature 016 target pinning, direct PostgreSQL runner, TLS root configuration, and approved TEST/DEMO gates for the Feature 017 lifecycle. Preflight/postflight are read-only; only the explicitly approved forward/rollback lifecycle changes grants.

**Rationale**: This tooling already validates the exact project, avoids local/mixed targets, verifies TLS/SCRAM, and preserves credentials in environment variables.

**Alternatives considered**:
- New database client or unverified TLS: rejected for target/security drift.
- Broad live fixture cleanup: rejected; Feature 017 must use exact owned manifests if fixtures are required.

## Decision 8: Feature 016 regression is selected, not replayed wholesale

**Decision**: Preserve completed Feature 016 remote evidence as historical. After Feature 017, run a Feature 017-specific wrapper that selects Feature 016 Scenarios 1–27 and replaces historical Feature 016 postflight with an ACL-aware Feature 017 assertion.

**Rationale**: Scenarios 1–27 exercise the active `finance_review_bank_transfer_v1` behavior and remain semantically valid. Scenario 28 rolls Feature 016 back/reapplies and Scenario 29 invokes a historical postflight that expects authenticated `admin_review_payment`, both incompatible with Feature 017 retirement.

**Alternatives considered**:
- Reopen `admin_review_payment` to run historical checks: rejected because it defeats retirement.
- Modify Feature 016 historical scripts: rejected because historical evidence is immutable.

## Decision 9: Rollback/reapply verification is restoration-first

**Decision**: After Feature 017 rollback succeeds, every later verification step runs under a mandatory recovery/finally path that restores Feature 017's applied retired ACL state before reporting the original failure.

**Rationale**: Rollback temporarily restores provider/legacy-review execution. A failed reapply/postflight must not leave TEST/DEMO intentionally exposed.

**Alternatives considered**:
- Stop immediately on rollback-phase failure: rejected because it can strand the target in weaker ACL state.
- Continue unrelated verification after failed recovery: rejected because restoration safety takes priority over test completion.

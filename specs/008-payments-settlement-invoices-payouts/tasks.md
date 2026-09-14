# Tasks: Payments, Settlement, Invoices & Payouts (008)

**Status**: RUN A / Phase 1 complete (T001–T006, 6/39) — Phase 2 (provider decision/DB-contract gate)
not started; Feature 008 is NOT closed
**Real task count**: **39** (`T001`–`T039`)
**Primary decision**: escrow-oriented, provider-neutral; provider is TBD
**Feature 007 prerequisite**: closed; consume its checkout/reservation/payment/snapshot outputs only

## Task format

Every task includes its requirements, dependencies, concrete verification, and an economical
recommended agent/model. A task is not complete until its stated verification passes. Provider-gated
tasks are intentionally blocked rather than implemented with a fake adapter, manual-bank UI, or
application-side workaround.

## Phase 1 — Provider-neutral finance foundation (can start now)

- [x] T001 Create finance status/DTO allowlists in `lib/finance/types.ts` and
  `lib/finance/validation.ts`, mirroring current database vocabulary without inventing escrow states.
  - Req: FR-001, FR-002, FR-003, SEC-005 | Depends: Feature 007 closed
  - Verify: tests reject unknown status/method strings; `PENDING` is internal-payment-only and
    `CONFIRMED` remains post-settlement; no `FUNDED`/provider-fiction status is introduced.
  - Recommended: Codex — High | Why: exact financial vocabulary and future compatibility.
  - Done (2026-09-13/14, Claude Sonnet 5 RUN A): `lib/finance/validation.ts` (status/method const
    arrays + Zod schemas + parse helpers), `lib/finance/types.ts` (DTOs). Verified against live
    `payments_status_check`/`payments_payment_method_check`/`proforma_invoices_status_check`/
    `payouts_status_check`. `tests/finance/validation.test.ts` (38 tests) proves acceptance of every
    current value, rejection of an arbitrary unknown string and of every invented escrow status
    (`FUNDED`/`ESCROW_FUNDED`/`AUTHORIZED`/`CAPTURED`/`AWAITING_ESCROW`/`RELEASED`).

- [x] T002 Implement `lib/finance/errors.ts` and localized controlled result codes/copy for finance
  reads and unavailable funding; retain inline field validation and use existing Sonner only for
  global/action/server outcomes.
  - Req: FR-015, FR-019, SEC-004 | Depends: T001
  - Verify: every known database/provider-boundary error maps to controlled EN/AR copy; no raw
    Supabase/Postgres/provider string, payload, reference, or secret reaches client or toast.
  - Recommended: Codex — Medium | Why: bounded mapping work with security-sensitive output rules.
  - Done: `lib/finance/errors.ts` mirrors `lib/orders/errors.ts`'s exact pattern (`mapFinanceError`,
    SQLSTATE-only unmapped-error logging). `FINANCE_ERROR_MAP` is empty this run (Phase 1 issues no
    mutating RPC — forward-compatible for Phase 3/4). Added `ACTION_FEEDBACK.FINANCE_READ_FAILED` /
    `FINANCE_FUNDING_UNAVAILABLE` to `lib/types/action-feedback.ts`. EN/AR copy added under a new
    `finance` namespace in `lib/app/copy/{en,ar}.ts`. `tests/finance/errors.test.ts` (9 tests) proves
    safe fallback, no raw-message logging, and real (non-fallback) Arabic translation.

- [x] T003 Implement `lib/finance/read.ts` for RLS-scoped payments, `order_financials`, proformas,
  tax-invoice metadata, and seller payouts; do not expose raw `payment_events.payload` to members.
  - Req: FR-002, FR-013, FR-014, SEC-004 | Depends: T001
  - Verify: explicit column allowlists; owner/seller/finance/auditor reads match policy; cross-org,
    anonymous, public-route, and shared-cache paths return no finance data.
  - Recommended: Codex — High | Why: private-data and authorization boundary.
  - Done: `lib/finance/read.ts` — `getPayment`/`getOrderFinancials`/`getProforma`/`getTaxInvoice`/
    `getPayoutsForOrder`/`getPayoutsForOrganization`, all explicit-column-select, zero `payment_events`
    reference (no Phase 1 consumer needs it; live RLS already denies members entirely). Live proof in
    `tests/finance/read.test.ts` (own-org/cross-org/anonymous over a real checked-out order) + static
    RLS-policy proof in `tests/finance/rls-policy.test.ts`. **Finding**: `proforma_invoices`/
    `proforma_invoice_items`/`tax_invoices`/`payouts` have no independent finance/auditor SELECT policy
    today (only `tax_invoices`/`payouts` grant FINANCE `ALL`; AUDITOR has none of the four) — see
    Section D of the handoff for detail; not worked around.

- [x] T004 Add a narrow `lib/finance/funding.ts` provider-neutral seam that returns a controlled
  unavailable outcome until a selected adapter and approved DB gate exist; it must not call a provider.
  - Req: FR-003 through FR-007, FR-015 | Depends: T001, T002
  - Verify: no SDK/import/network call/secret/provider name is present; browser/mobile input is limited
    to identifiers; unavailable outcome is safe and localized.
  - Recommended: Codex — High | Why: prevents premature abstraction from becoming fake payment logic.
  - Done: `lib/finance/funding.ts#requestFunding` — validates `{ orderId }` only, always returns
    `{ ok: false, code: FINANCE_FUNDING_UNAVAILABLE }` for a valid identifier. `tests/finance/
    funding.test.ts` (8 tests) proves determinism and source-level absence of network/SDK/provider
    name/secret/DB call.

- [x] T005 Audit `payment_accounts` consumption and enforce it as admin-managed operational/manual-
  fallback data only; add no member bank-detail write or primary bank-instruction path.
  - Req: FR-011, SEC-004 | Depends: T003
  - Verify: no member mutation exists; no primary payment route reads/renders bank account fields;
    Feature 010 remains the only planned configuration owner.
  - Recommended: Codex — Medium | Why: narrow boundary/audit task.
  - Done: audited — zero application references to `payment_accounts` anywhere in `lib/`, `components/`,
    `src/`, `app/` before or after this run; no correction needed. `tests/finance/rls-policy.test.ts`
    (T005 section) statically enforces no `.from("payment_accounts")` call and no bank-field-name
    reference exists anywhere in application source.

- [x] T006 Add snapshot-only commission and payout DTO/read fields from `order_financials` and
  `payouts`, never `commission_policies` or `commission_tiers`.
  - Req: FR-002, FR-016, SC-004 | Depends: T003
  - Verify: static/read tests prove no live-tier query or money arithmetic; stored currency accompanies
    every money value.
  - Recommended: Codex — High | Why: financial-history integrity.
  - Done: `OrderFinancialsDTO`/`PayoutDTO` in `lib/finance/types.ts` are verbatim projections; `getOrder
    Financials`/`getPayoutsForOrder`/`getPayoutsForOrganization` in `read.ts` never reference
    `commission_policies`/`commission_tiers` (statically proven) and perform no multiplication/
    recomputation. Each DTO carries its own `currency` field alongside every amount.

## Phase 2 — Provider decision and database-contract gate (external approval; no provider code)

- [ ] T007 Record the formally selected escrow provider, legal/banking approval, supported countries/
  currencies, customer funding journey, and payout/release responsibility.
  - Req: FR-003, FR-017 | Depends: Business/Finance/Legal/Banking-provider decision
  - Verify: an approved decision record exists; it names no unapproved assumptions and resolves
    provider selection, payout/release model, and whether webhooks are required.
  - Recommended: Product/Finance/Legal owner + Codex — High | Why: engineering may not choose this.

- [ ] T008 Derive the selected provider's minimal event/funding contract: identifiers, signatures,
  retries, ordering, refund/chargeback responsibilities, and required provider evidence.
  - Req: FR-004 through FR-007, SEC-003 | Depends: T007
  - Verify: contract satisfies SRS API-02 and documents replay, signature, correlation, retry and DLQ
    needs without exposing credentials or provider secrets.
  - Recommended: Security/Payments architect + Codex — High | Why: externally defined trust boundary.

- [ ] T009 Produce and approve the required database change design for trusted funding,
  settlement-eligibility, provider correlation/event processing, and any missing state vocabulary.
  - Req: FR-007, FR-008, SEC-001 through SEC-005 | Depends: T007, T008
  - Verify: design classifies `admin_review_payment()` change/replacement path, resolves nullable
    provider/external event identifiers and trusted event processing, proves no unrelated status
    overloading, includes RLS/ACL/integrity/audit/rollback review, and is approved before a migration
    is authored.
  - Recommended: Database/security specialist + Codex strongest | Why: financial transaction authority.

- [ ] T010 Provision approved secret-management and non-production provider test credentials without
  committing a key or exposing it to Web/React Native clients.
  - Req: FR-005, SEC-003, SEC-004 | Depends: T007, T008
  - Verify: environment contract is documented without values; secret scans are clean; no
    `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` provider credential exists.
  - Recommended: DevOps/security + Codex — High | Why: secret-boundary work.

## Phase 3 — Provider funding and event boundary (blocked until Phase 2 is approved)

- [ ] T011 Implement the approved database migration(s) for the selected provider contract only after
  T009 approval; do not alter unrelated finance/inventory data.
  - Req: FR-006 through FR-008, SEC-001, SEC-003, SEC-005 | Depends: T009
  - Verify: migration, rollback, RLS/ACL, integrity, audit, and live preflight/postflight proofs pass;
    trusted funding is enforceable at DB level and no direct client write is added.
  - Recommended: Database specialist + Codex strongest | Why: irreversible financial authority.

- [ ] T012 Implement the selected-provider Supabase Edge Function funding boundary with server-only
  secrets, backend rereads, and correlation to the authoritative payment/order.
  - Req: FR-004 through FR-006, SEC-003 | Depends: T010, T011
  - Verify: function accepts minimal identifiers, re-reads DB truth, rejects wrong org/state/amount,
    and has no client secret or application-side settlement write.
  - Recommended: Codex — High | Why: external integration and auth boundary.

- [ ] T013 Implement selected-provider event ingestion: authenticity verification, duplicate-event
  persistence/rejection, safe ordering handling, normalized result, retry and required recovery/DLQ.
  - Req: FR-006, FR-007, SEC-002, SEC-003 | Depends: T008, T011, T012
  - Verify: forged signature, replay, duplicate ID, stale/out-of-order event, wrong payment/order,
    and transient processing failure all have safe tested outcomes; no raw payload/secrets are logged.
  - Recommended: Codex strongest | Why: replay and financial-integrity risk.

- [ ] T014 Build the web Server Action adapter and member funding surface for the selected provider;
  retain `lib/finance/funding.ts` as the shared backend seam and never make the Server Action the
  sole backend.
  - Req: FR-004, FR-012, FR-015, FR-019 | Depends: T011, T012
  - Verify: action validates/authenticates, returns controlled codes, uses one Sonner provider, and a
    future React Native client can use the same Edge/DB boundary without Next.js coupling.
  - Recommended: Codex — High | Why: web/mobile boundary and protected action flow.

- [ ] T015 Implement selected-provider status normalization/presentation only for states authorized by
  the approved contract; map unknown provider outcomes to a safe pending/support state.
  - Req: FR-003, FR-006, FR-015 | Depends: T008, T013, T014
  - Verify: no provider-specific state leaks into unrelated DB statuses; unknown/failed/cancelled
    states do not claim funding or settlement.
  - Recommended: Codex — High | Why: state-machine correctness.

- [ ] T016 Add provider-boundary negative tests for client amount/status tampering and for browser/
  React Native attempts to bypass the Edge/DB authority.
  - Req: FR-004, FR-005, SEC-002, SEC-003 | Depends: T012 through T015
  - Verify: altered client amount/currency/state/provider reference cannot change authoritative truth;
    no direct client provider call or secret is possible.
  - Recommended: Codex — High | Why: cross-client financial trust proof.

## Phase 4 — Authoritative settlement and title boundary (blocked until trusted funding exists)

- [ ] T017 Implement the approved post-funding settlement database contract and its rollback, using
  `admin_review_payment()` only if T009's approved design keeps it as the correct transaction core.
  - Req: FR-008, FR-012, SEC-001 through SEC-003, SC-001 | Depends: T009, T011, T013
  - Verify: database rejects missing/untrusted funding, expired reservation, invalid role/state, and
    replay; approved settlement remains atomic and audit-correlated.
  - Recommended: Database specialist + Codex strongest | Why: title/custody/payout atomicity.

- [ ] T018 Implement `lib/finance/settlement.ts` as the only application caller of the approved
  post-gate settlement procedure; Feature 010 receives a typed guarded interface, never raw RPC.
  - Req: FR-008, FR-012, SEC-001 | Depends: T017
  - Verify: repo-wide call-site audit finds exactly this module; it performs no direct settlement,
    ownership, inventory, reservation, payout, or order/payment mutation.
  - Recommended: Codex — High | Why: single-caller and authorization discipline.

- [ ] T019 Implement controlled settlement result/error mapping and safe finance-domain audit logging.
  - Req: FR-012, FR-015, SEC-002, SEC-004 | Depends: T002, T018
  - Verify: authorization, expiry, missing trusted-funding, duplicate, and invalid-transition errors
    map to controlled codes; logs omit payment/proof/bank/provider secrets and raw payloads.
  - Recommended: Codex — High | Why: financial error boundary.

- [ ] T020 Expose a typed, role-guarded settlement domain interface to Feature 010 without building
  Finance console screens or exporting a generic database client.
  - Req: FR-012, FR-018 | Depends: T018, T019
  - Verify: only allowed finance callers can reach it; 010 has no raw function bypass; no admin UI is
    added in this feature.
  - Recommended: Codex — Medium | Why: bounded cross-feature contract.

- [ ] T021 Prove exact post-settlement outcomes through approved database reads: one ownership event
  per item, custody, fill, consumed reservation, `CONFIRMED` payment, paid proforma, paid order, and
  one payout record per member seller.
  - Req: FR-008, FR-016 through FR-018, SC-001, SC-003 | Depends: T017, T018
  - Verify: repeated/concurrent decisions produce exactly one set of effects and no effect before
    trusted funding; HILLS seller lines produce no member payout.
  - Recommended: Codex strongest | Why: release-blocking transactional proof.

## Phase 5 — Private member integration, documents, and payout records

- [ ] T022 Build private payment state and settlement-outcome routes from the read/domain layers;
  before T014 provider integration, render only the honest funding-unavailable state.
  - Req: FR-002, FR-014, FR-015, FR-019 | Depends: T002 through T006; final funded outcomes depend on T021
  - Verify: no manual-bank instructions, fake provider action, or raw error; private route guards and
    non-indexability hold for buyer/seller/finance variants.
  - Recommended: Codex — High | Why: secure private UI state handling.

- [ ] T023 Build permitted proforma/tax-invoice metadata and seller payout-record presentation with
  stored currency, snapshot-only commission, and a clear separation from actual provider release.
  - Req: FR-002, FR-016, FR-017, FR-019 | Depends: T003, T006, T021
  - Verify: RLS-scoped DTOs only; no file-byte URL fabrication; payout status never claims money
    movement without provider evidence.
  - Recommended: Codex — High | Why: commercial-data fidelity.

- [ ] T024 Keep `submit_payment_proof()` out of primary routes. Implement a manual fallback only if
  separately approved, after a dedicated private Storage/RLS design resolves DB-BLOCK-01.
  - Req: FR-009, FR-010, SEC-004 | Depends: explicit Business/Finance fallback decision and Storage approval
  - Verify: absent approval, no proof upload/caller exists; the current non-null file-asset contract
    forbids a fake reference-only fallback; with approval, private byte upload/download is live-proven
    through the dedicated bucket/policies and never reuses KYB Storage.
  - Recommended: Database/security specialist + Codex strongest | Why: private document boundary.

- [ ] T025 Register only implemented private payment/document/payout modules in the existing dashboard
  registry with capability-aware navigation; do not add Feature 010 console screens.
  - Req: FR-012, FR-018, FR-019 | Depends: T022, T023
  - Verify: anonymous/non-capable/unauthorized routes are denied server-side; seller-only payout nav
    is additive; direct URL authorization remains independent of nav visibility.
  - Recommended: Codex — Medium | Why: existing shell integration.

- [ ] T026 Add all EN/AR member/admin copy and action feedback for implemented payment states,
  unavailable funding, settlement outcomes, documents, and payouts.
  - Req: FR-015, FR-019 | Depends: T022 through T025
  - Verify: EN/AR keys complete; field errors are inline, action/server feedback is Sonner, duplicate
    toasts are prevented, and no raw backend/provider message is rendered.
  - Recommended: Codex — Medium | Why: localized product completeness.

## Phase 6 — Release-blocking financial, authorization, and provider tests

- [ ] T027 Write payment/document/payout read isolation and role-negative tests for buyer, seller,
  finance, auditor, warehouse, compliance, cross-org, anonymous, and public paths.
  - Req: FR-012 through FR-015, SEC-002, SEC-004 | Depends: T003, T022 through T025
  - Verify: every unauthorized path is denied before data/action; no public SSR/RSC/metadata/cache
    leakage and no finance role escalation occurs.
  - Recommended: Codex — High | Why: tenant/role isolation.

- [ ] T028 Write snapshot fidelity and historical-immutability tests for order financials, commission,
  tax, payout amount/count, currency, and later configuration changes.
  - Req: FR-002, FR-016, FR-017, SC-004 | Depends: T006, T021, T023
  - Verify: no live tier is read; total-quantity tier semantics are preserved where the DB supports
    them; a historical payout/snapshot remains byte-for-byte unchanged after config mutation.
  - Recommended: Codex strongest | Why: financial history integrity.

- [ ] T029 Write no-premature-title and exact-settlement-effect tests, including expired reservation,
  rejected/failed funding, and missing trusted-funding refusal.
  - Req: FR-008, SEC-001, SEC-002, SC-001, SC-003 | Depends: T017 through T021
  - Verify: pending/failed/replayed states create zero title/custody/ownership/payout effects; a valid
    settlement creates the exact set once.
  - Recommended: Codex strongest | Why: irreversible commercial effects.

- [ ] T030 Write repeated/concurrent settlement and provider-event idempotency tests.
  - Req: FR-007, FR-008, SEC-003, SC-003 | Depends: T013, T017 through T021
  - Verify: duplicate event/decision produces one event outcome and exactly one settlement, ownership
    ledger effect, reservation consumption, and payout record; repeated runs are stable.
  - Recommended: Codex strongest | Why: concurrency and replay safety.

- [ ] T031 Write selected-provider event security tests: forged signature, replay, wrong correlation,
  ordering, retry/recovery and required DLQ semantics.
  - Req: FR-006, FR-007, SEC-002, SEC-003 | Depends: T013, T016
  - Verify: each attack/failure path is rejected or safely recoverable without settlement/title change.
  - Recommended: Security specialist + Codex strongest | Why: provider trust boundary.

- [ ] T032 Audit source for no service-role runtime, no client provider secret, no shared finance cache,
  no direct commercial writes, no raw errors, and the required single settlement caller.
  - Req: FR-005, FR-013 through FR-015, SEC-001 through SEC-005 | Depends: T018, T022 through T026
  - Verify: focused source/audit tests are green; repository search finds no prohibited runtime path.
  - Recommended: Codex — High | Why: cross-cutting security proof.

## Phase 7 — States, accessibility, RTL, and browser proof

- [ ] T033 Cover loading, empty, error, unauthorized, suspended, expired, unavailable, pending,
  funding-action, failed, settled, payout, and document-absent states honestly.
  - Req: FR-015, FR-019, SC-002 | Depends: T022 through T026
  - Verify: no state implies funding, settlement, document bytes, or payout release that the current
    authority has not proven.
  - Recommended: Codex — High | Why: financial state/copy truthfulness.

- [ ] T034 Run real authenticated browser and axe verification across implemented member surfaces at
  EN/LTR light/dark 1366px and AR/RTL light/dark 390px, with applicable desktop coverage.
  - Req: FR-019, SC-006 | Depends: T025, T026, T033
  - Verify: zero serious/critical axe issues, no overflow/viewport crossing, keyboard/focus/44px
    targets pass, no console/page/hydration errors, money/codes remain readable, Sonner is single.
  - Recommended: Codex — High | Why: real UI/accessibility evidence.

- [ ] T035 Verify private route protection, non-indexability, no public financial SSR/RSC/metadata/
  JSON-LD/cache leakage, and safe unavailable/provider failure handling in a real production build.
  - Req: FR-013 through FR-015, SEC-002 through SEC-005 | Depends: T027, T032 through T034
  - Verify: anonymous and cross-org requests are denied; canaries are absent from emitted private/
    public representations; no provider/private value is serialized merely because hidden in DOM.
  - Recommended: Codex — High | Why: production exposure boundary.

## Phase 8 — Final verification, stability, and closure

- [ ] T036 Run Feature 008/product lint scope, `npm run typecheck`, full tests, `npm run build`, and
  `git diff --check`; run repo-wide `npm run lint` and compare/report its established baseline honestly.
  - Req: SC-006 | Depends: all implemented in-scope tasks
  - Verify: product scope exits 0; typecheck/tests/build/diff check pass; repo-wide lint result is not
    masked and has no new non-baseline finding.
  - Recommended: Codex — Medium | Why: mechanical, evidence-driven closure.

- [ ] T037 Repeat the transactional/provider test set enough to establish stability; investigate every
  flake rather than retrying it away.
  - Req: SC-003, SC-006 | Depends: T029 through T031
  - Verify: repeated event/settlement/concurrency suites have recorded stable results and no hidden
    duplicate commercial effects.
  - Recommended: Codex — High | Why: financial concurrency reliability.

- [ ] T038 Reconcile the implementation handoff, roadmap status, open gates, DB migration evidence,
  provider selection evidence, and Feature 009/010/012 boundaries without claiming production readiness.
  - Req: FR-003, FR-006, FR-017, FR-018 | Depends: T036, T037
  - Verify: every open item has an owner/classification; all executed tests and provider limitations
    are honestly recorded; no cross-feature scope is claimed complete.
  - Recommended: Codex — Medium | Why: multi-agent continuity.

- [ ] T039 Perform final independent scope/constitution/security review before closing Feature 008.
  - Req: all FR/SEC/SC | Depends: T038
  - Verify: no provider-specific work occurred before approval, no unapproved DB workaround exists,
    all guards/tests are evidenced, and remaining production-trading gates are explicitly listed.
  - Recommended: Codex strongest | Why: final financial architecture review.

---

## Dependencies and parallelisation

- Phase 1 is the only implementation phase permitted now. T003 and T004 may proceed after T001/T002;
  T005 and T006 can run after T003.
- Phase 2 is an external decision/design gate, not a coding shortcut. T011–T021 remain blocked until
  its provider contract and approved DB design are complete.
- Phase 5 private reads may begin from Phase 1, but funded/settled state presentation remains dependent
  on Phase 4. T024 is conditional and does not block the primary escrow path.
- Phase 6 provider-event cases depend on the selected provider. T027/T028 can begin once their read
  surfaces exist; T029–T031 require the authoritative settlement/provider path.
- Phase 7 and Phase 8 apply only to actually implemented routes and must not manufacture provider proof.

## Legacy T001–T033 mapping

The old task set assumed manual bank transfer → proof upload → finance review. The mapping is kept for
continuity; “retired” means removed from the primary path, not deleted from the current database.

| Old task | New destination |
|---|---|
| T001 | T001 |
| T002 | T002 |
| T003 | T003 |
| T004 | T005 |
| T005 | Retired from primary path; conditional T024 only after manual-fallback approval |
| T006 | Retired from primary path; conditional T024 only after Storage/RLS approval |
| T007 | T022 (honest state surface) and T014 (selected-provider action) |
| T008 | T022 |
| T009 | T017–T019 |
| T010 | T018, T032 |
| T011 | T020 |
| T012 | T021–T023 |
| T013 | T023 |
| T014 | T023 |
| T015 | T025 |
| T016 | T027 |
| T017 | T021, T029 |
| T018 | T030 |
| T019 | T029 |
| T020 | T027 |
| T021 | T028 |
| T022 | T033 |
| T023 | T034 |
| T024 | T036 |
| T025 | T018, T032 |
| T026 | T032 |
| T027 | T037 |
| T028 | T038 |
| T029 | T006, T028 |
| T030 | T023, T028 |
| T031 | T028 |
| T032 | T028 |
| T033 | T030 |

**Task count reconciliation**: the old 33 real tasks are replaced by 39 real, sequential IDs.
No task is marked complete by this documentation-only Run 0.

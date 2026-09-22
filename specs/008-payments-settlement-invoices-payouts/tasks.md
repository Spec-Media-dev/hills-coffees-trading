# Tasks: Payments, Settlement, Invoices & Payouts (008)

**Status**: RUN A / Phase 1 complete (T001–T006, 6/39). RUN B / Phase 2A Stripe architecture
preparation done (see `STRIPE-PREPARATION.md`) — T007–T010 remain unchecked pending Stripe account
verification/credentials/approval; still 6/39. **RUN C (2026-09-17) — T022 COMPLETE**: private
payment-state routes (`/dashboard/payments`, `/dashboard/payments/[orderId]`) built provider-neutrally
on the already-approved Phase 1 foundation only; 7/39. Feature 008 is NOT closed — Phase 2 (T007–T010)
remains gated on external provider/legal/banking approval; Phases 3–4 (T011–T021) remain blocked on
that approval and on T009's approved DB design; T023–T026 remain open.
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
  - Partial (2026-09-14, RUN B / Phase 2A): provider is now directionally Stripe. See
    `STRIPE-PREPARATION.md` §4 for the provisional recommended charge/Connect model. Legal/banking
    approval, supported countries/currencies, and payout/release responsibility remain
    ACCOUNT-VERIFICATION-REQUIRED (§14) — not satisfiable without the real account, so this stays
    unchecked.
  - **Updated, still PARTIAL (2026-09-22, RUN F008-STRIPE-DECISION).** The product decision this run
    formally resolves what §4/§6 previously left provisional/undecided: provider = Stripe, platform
    model = Stripe Connect, charge shape = "separate charges and transfers" (§4's own recommendation,
    now decided rather than provisional), settlement-gate option = **Option A** (trusted Stripe event +
    finance-operator approval — §6 no longer undecided), payout/release responsibility = the platform
    (Hills), and webhooks ARE required (§8). This is now implemented end to end (see T008/T009/T012–
    T020, T032 below). **Still NOT closable**: legal/banking approval and the account-verification-
    required facts in §14 (account country, entity country, test-mode availability, Connect enablement,
    connected-account model, settlement currencies, seller countries) remain genuinely unresolved — no
    Stripe account exists. This is now a narrow, precise, non-"provider undecided" blocker: **Business/
    Finance/Legal must open and configure a real Stripe account and answer §14's checklist**; nothing
    further is engineering-actionable here until then.

- [x] T008 Derive the selected provider's minimal event/funding contract: identifiers, signatures,
  retries, ordering, refund/chargeback responsibilities, and required provider evidence.
  - Req: FR-004 through FR-007, SEC-003 | Depends: T007
  - Verify: contract satisfies SRS API-02 and documents replay, signature, correlation, retry and DLQ
    needs without exposing credentials or provider secrets.
  - Recommended: Security/Payments architect + Codex — High | Why: externally defined trust boundary.
  - Partial (2026-09-14, RUN B / Phase 2A): `STRIPE-PREPARATION.md` §8 records the likely event
    categories and the future Edge Function's signature/idempotency/ordering/no-raw-payload-logging
    responsibilities, explicitly marked PENDING ACCOUNT/FLOW VERIFICATION for the exact final event
    list — design-prepared, not finalized, so this stays unchecked.
  - **Done (2026-09-22, RUN F008-STRIPE-DECISION).** The contract is now finalized and IMPLEMENTED, not
    merely drafted. Exact final event list (deliberately short, per the run's own instruction not to
    over-list): `payment_intent.succeeded` (the trusted-funding signal) and `payment_intent.payment_failed`
    (a safe no-op — never creates funding evidence, no new terminal status invented) — both handled in
    `supabase/functions/stripe-webhook/index.ts`; every other event type is safely acknowledged (200,
    not retried) and ignored. Identifiers: Stripe's own `event.id` (never `created` — Stripe does not
    guarantee order and timestamps can collide). Signatures: `lib/finance/stripe/webhook.ts#
    verifyStripeWebhookSignature` — Stripe's own documented HMAC-SHA256-over-`{timestamp}.{raw body}`
    algorithm via the official SDK verifier, **genuinely tested** (`tests/finance/stripe-webhook.test.ts`,
    7/7 passing) against a valid signature, a forged/tampered body, the wrong secret, a stale timestamp
    (replay), a missing header, an unconfigured secret, and a malformed header — all without a live
    Stripe account, using the SDK's own `generateTestHeaderString` test utility. Retries: Stripe's own
    documented 3-day exponential-backoff behavior is relied on via the response-code contract (2xx =
    handled including "duplicate/irrelevant", 4xx = permanent refusal, 5xx = transient, retry) —
    documented in the webhook function's own header. Correlation: `payments.provider`/`external_reference`
    (set by `record_stripe_payment_intent()`) anti-tamper-checked against every incoming event
    (`ingest_stripe_event()` refuses an event whose payment does not already carry a matching provider
    value). Refund/chargeback responsibility: unchanged from `STRIPE-PREPARATION.md` §1's own documented
    fact (platform-liable by default under separate-charges-and-transfers) — no refund/chargeback CODE
    is implemented this run (out of the approved product-decision scope), only the responsibility fact
    is carried forward. No credential or provider secret is exposed anywhere in this contract's
    documentation or code (T016/T035-style boundary tests confirm this).

- [ ] T009 Produce and approve the required database change design for trusted funding,
  settlement-eligibility, provider correlation/event processing, and any missing state vocabulary.
  - Req: FR-007, FR-008, SEC-001 through SEC-005 | Depends: T007, T008
  - Verify: design classifies `admin_review_payment()` change/replacement path, resolves nullable
    provider/external event identifiers and trusted event processing, proves no unrelated status
    overloading, includes RLS/ACL/integrity/audit/rollback review, and is approved before a migration
    is authored.
  - Recommended: Database/security specialist + Codex strongest | Why: financial transaction authority.
  - Partial (2026-09-14, RUN B / Phase 2A): `STRIPE-PREPARATION.md` §9 drafts additive
    `payments`/`payment_transfers` columns/table, the settlement-eligibility gate, and a rollback/
    test plan not dependent on account-specific facts; §6 documents two settlement-gate options
    (trusted funding + finance approval, vs. trusted funding + automatic settlement) without
    choosing between them, per explicit instruction. A draft awaiting that business decision and a
    human database/security approval is not an approved design, so this stays unchecked.
  - **Updated, still NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** The business decision §6 left
    open is now made: **Option A** (trusted funding + finance-operator approval — the owner/admin action
    is "Approve Settlement"/"Release Seller Funds", never an automatic or manual "confirm the buyer
    paid"). The design is now fully drafted INTO an actual migration —
    `supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql` (+ paired rollback +
    read-only postflight) — implementing exactly §9's additive shape: `payments.
    trusted_funding_confirmed_at`/`trusted_funding_event_id` (nullable, additive, never repurposing
    `PROOF_SUBMITTED`/`UNDER_REVIEW`/`REJECTED`), `payment_events.provider`/`external_event_id` tightened
    to `NOT NULL` (the exact "optional constraint, not missing column" gap §9 identified — zero existing
    rows made this safe), and a new `payment_transfers` table (one row per Stripe Transfer, `payout_id`
    UNIQUE so a duplicate transfer is refused at the DB level). `admin_review_payment()` is reproduced
    verbatim from the live function body with exactly ONE inserted precondition (documented in the
    migration's own extensive header, including the SQL three-valued-logic proof that every existing/
    NULL-`payment_method` settlement path is completely unaffected). RLS/rollback/audit are all in the
    migration; a full read-only postflight (`supabase/maintenance/
    20260922_feature_008_stripe_trusted_funding_postflight.sql`) verifies every shape/grant/policy fact
    once applied. **Still NOT closed**, per this repo's own established convention (Feature 005's
    DB-OPEN-19 migration was not marked done until "applied and live-proven" — the same discipline
    applies here, not a lower bar for Feature 008): this design has NOT been reviewed by a human
    database/security specialist, and per this run's own explicit instruction ("Do NOT push the
    migration remotely in this run"), it has not been applied or live-proven. **Exact remaining
    requirement: human database/security review, then `supabase db push --linked` (or the SQL Editor) +
    the postflight**, neither of which this run may do.

- [ ] T010 Provision approved secret-management and non-production provider test credentials without
  committing a key or exposing it to Web/React Native clients.
  - Req: FR-005, SEC-003, SEC-004 | Depends: T007, T008
  - Verify: environment contract is documented without values; secret scans are clean; no
    `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` provider credential exists.
  - Recommended: DevOps/security + Codex — High | Why: secret-boundary work.
  - Partial (2026-09-14, RUN B / Phase 2A): `STRIPE-PREPARATION.md` §12 names variable classes only
    (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`) with no values. No
    credential was provisioned, requested, or displayed — stays unchecked until real non-production
    credentials exist.
  - **Updated, still NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** The environment contract is
    now fully implemented, not just named: `lib/finance/stripe/config.ts` reads exactly these three
    variables (`isStripeConfigured()`/`isStripeWebhookConfigured()`/`stripePublishableKey()`) and no
    other file in the codebase reads any of them directly (`tests/finance/stripe-boundary-security.test.ts`
    proves this, including that the one client-safe value is passed to `StripePaymentCollector` as a
    prop, never computed inside a `"use client"` file). `.env.local` was checked this run and carries
    ZERO Stripe variables of any kind (confirmed by name). Secret scans are clean: the entire built
    `.next/static` output (the actual browser bundle) has zero matches for `STRIPE_SECRET_KEY` or
    `STRIPE_WEBHOOK_SECRET`; no `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` SECRET credential exists (only the
    genuinely-publishable key, per Stripe's own design). **Still NOT closed**: no credential of any
    kind was provisioned, requested, or displayed this run either — stays unchecked exactly per its own
    explicit instruction until real non-production credentials exist.

## Phase 3 — Provider funding and event boundary (blocked until Phase 2 is approved)

- [ ] T011 Implement the approved database migration(s) for the selected provider contract only after
  T009 approval; do not alter unrelated finance/inventory data.
  - Req: FR-006 through FR-008, SEC-001, SEC-003, SEC-005 | Depends: T009
  - Verify: migration, rollback, RLS/ACL, integrity, audit, and live preflight/postflight proofs pass;
    trusted funding is enforceable at DB level and no direct client write is added.
  - Recommended: Database specialist + Codex strongest | Why: irreversible financial authority.
  - **NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** The migration IS implemented — see T009's own
    note for the file and exactly what it does. `git diff --check` passes; the migration's own preflight
    guard refuses to run against anything but the exact schema it was written against. **Not applied, not
    live-proven** — explicitly forbidden this run ("Do NOT push the migration remotely"). Exact remaining
    requirement: human database/security review + `supabase db push --linked` (or SQL Editor) + the
    paired postflight + `F008_LIVE_PROOF=1 npx vitest run tests/finance` for the live-gated proofs (T021/
    T029/T030) it unblocks.

- [ ] T012 Implement the selected-provider Supabase Edge Function funding boundary with server-only
  secrets, backend rereads, and correlation to the authoritative payment/order.
  - Req: FR-004 through FR-006, SEC-003 | Depends: T010, T011
  - Verify: function accepts minimal identifiers, re-reads DB truth, rejects wrong org/state/amount,
    and has no client secret or application-side settlement write.
  - Recommended: Codex — High | Why: external integration and auth boundary.
  - **NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** Three Deno/Supabase Edge Functions are
    written, matching every literal requirement of this task: `supabase/functions/
    stripe-create-payment-intent/index.ts` (accepts ONLY `{ orderId }`; re-reads `payments`/order truth
    under the caller's OWN forwarded JWT — never service-role — so a cross-org orderId is simply not
    found via RLS, not a distinguishable leak; creates exactly one PaymentIntent with a deterministic
    idempotency key; persists the correlation via `record_stripe_payment_intent()`, which independently
    re-checks `is_org_member` at the DB layer too), `supabase/functions/stripe-webhook/index.ts` (T013),
    and `supabase/functions/stripe-release-transfer/index.ts` (T017/T021's transfer-creation boundary,
    `is_finance_operator()`-gated). `supabase/config.toml` sets the correct per-function
    `verify_jwt` (false only for the webhook, which authenticates via its own signature instead). No
    client secret exists in any of the three (only `Deno.env.get("STRIPE_SECRET_KEY")`, server-only by
    construction — Edge Function env vars are never bundled to a client). **Not closed**: none of the
    three is DEPLOYED (`supabase functions deploy`), so "function accepts... re-reads DB truth... rejects
    wrong org/state/amount" cannot be proven as a LIVE behavior this run — that needs a real deployment
    plus the migration (T011) applied first. Exact remaining requirement: T011 applied, then
    `supabase functions deploy stripe-create-payment-intent stripe-webhook stripe-release-transfer` with
    `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` set as function secrets (T010).

- [ ] T013 Implement selected-provider event ingestion: authenticity verification, duplicate-event
  persistence/rejection, safe ordering handling, normalized result, retry and required recovery/DLQ.
  - Req: FR-006, FR-007, SEC-002, SEC-003 | Depends: T008, T011, T012
  - Verify: forged signature, replay, duplicate ID, stale/out-of-order event, wrong payment/order,
    and transient processing failure all have safe tested outcomes; no raw payload/secrets are logged.
  - Recommended: Codex strongest | Why: replay and financial-integrity risk.
  - **NOT fully closed (2026-09-22, RUN F008-STRIPE-DECISION) — split evidence, reported precisely.**
    **Genuinely tested this run** (`tests/finance/stripe-webhook.test.ts`, 7/7, no live account needed):
    forged/tampered signature, wrong secret, stale/replayed timestamp, missing header, unconfigured
    secret, malformed header — all safely rejected without throwing. **Implemented but NOT live-tested**
    (needs T011 applied): duplicate-event-ID persistence/rejection (`ingest_stripe_event()`'s
    `ON CONFLICT (provider, external_event_id) DO NOTHING`), wrong-payment/order rejection (the
    provider-mismatch anti-tamper check), safe ordering handling (never trusts event order; re-derives
    state via `coalesce`, first-confirming-event-wins), retry/recovery semantics (the webhook function's
    response-code contract: 2xx for handled/duplicate/irrelevant, 4xx for permanent refusal, 5xx for
    transient — documented in its own header, not live-exercised against real Stripe retry behavior).
    No raw payload is ever logged or persisted (`p_payload: null` is passed explicitly, by design — see
    the webhook function's own comment). Exact remaining requirement: T011 applied + T012 deployed, then
    a live proof (a script following `scripts/t013-delivery-live-proof.ts`'s own established pattern —
    real fixture sessions for everything except the one privileged event-simulation step, delegated
    through `scripts/seed-test-fixtures.ts` the same way that script already delegates its own
    privileged steps) — not built this run; a bounded, well-scoped follow-up.

- [x] T014 Build the web Server Action adapter and member funding surface for the selected provider;
  retain `lib/finance/funding.ts` as the shared backend seam and never make the Server Action the
  sole backend.
  - Req: FR-004, FR-012, FR-015, FR-019 | Depends: T011, T012
  - Verify: action validates/authenticates, returns controlled codes, uses one Sonner provider, and a
    future React Native client can use the same Edge/DB boundary without Next.js coupling.
  - Recommended: Codex — High | Why: web/mobile boundary and protected action flow.
  - **Done (2026-09-22, RUN F008-STRIPE-DECISION).** This task's own Verify criteria are about the
    CALLER's own code properties (validates/authenticates/returns controlled codes/one Sonner provider/
    mobile-compatible architecture) — all provable and TESTED without live credentials, unlike T012's
    live-behavior claim. `lib/finance/funding.ts#requestFunding` retained as the shared seam: unconfigured
    (today's real state) is byte-identical to Phase 1's original behavior (unit-tested, unchanged);
    configured, it invokes `stripe-create-payment-intent` via `supabase.functions.invoke()` — a plain
    HTTP boundary any client (web, React Native) can call identically, never a Next.js-coupled RPC —
    forwarding the caller's own session automatically. Never fabricates success: an Edge Function/network
    failure maps to `FINANCE_FUNDING_CREATE_FAILED` (`tests/finance/funding.test.ts`, mocked boundary, 3
    new tests: failure→controlled code, controlled refusal relay, genuine success relay). The member
    funding surface itself — `components/finance/stripe-payment-collector.tsx` — is a real, minimal
    Stripe Payment Element client component, wired into `/dashboard/payments/[orderId]` behind
    `funding.ok && funding.data.clientSecret` (unreachable today, since that can never be true without
    live configuration — not yet a live path, but real code, not a stub). Uses the existing single Sonner
    provider (`toast` from `sonner`, no second toast system). EN/AR copy added (`finance.funding.pay.
    submit`). `tests/finance/stripe-boundary-security.test.ts` proves the collector never imports the
    Stripe SDK, `lib/finance/stripe/config.ts`, or `lib/finance/stripe/adapter.ts` directly — it receives
    `publishableKey` only as a server-computed prop.

- [x] T015 Implement selected-provider status normalization/presentation only for states authorized by
  the approved contract; map unknown provider outcomes to a safe pending/support state.
  - Req: FR-003, FR-006, FR-015 | Depends: T008, T013, T014
  - Verify: no provider-specific state leaks into unrelated DB statuses; unknown/failed/cancelled
    states do not claim funding or settlement.
  - Recommended: Codex — High | Why: state-machine correctness.
  - **Done (2026-09-22, RUN F008-STRIPE-DECISION).** By construction, not by adding a new UI surface:
    `payments.status` (the 7-value vocabulary Phase 1 already established) is completely untouched by
    this run — `trusted_funding_confirmed_at` is a SEPARATE, additive column, never rendered directly,
    never aliased into `payments.status`. A failed/cancelled/unknown Stripe outcome (`payment_intent.
    payment_failed`, or any event type the webhook does not explicitly recognize) is a safe no-op in
    `ingest_stripe_event()`/the webhook handler — it never sets `trusted_funding_confirmed_at`, so the
    payment simply never becomes settlement-eligible; no new terminal status was invented, matching the
    migration's own explicit "no state overloading" design constraint (FR-015/SEC-005). The existing
    `PaymentStatusBadge` continues to render the real stored value verbatim, exactly as T022 already
    proved — this task closes on "nothing provider-specific leaks in", not on new presentation work,
    which the current architecture genuinely does not need.

- [x] T016 Add provider-boundary negative tests for client amount/status tampering and for browser/
  React Native attempts to bypass the Edge/DB authority.
  - Req: FR-004, FR-005, SEC-002, SEC-003 | Depends: T012 through T015
  - Verify: altered client amount/currency/state/provider reference cannot change authoritative truth;
    no direct client provider call or secret is possible.
  - Recommended: Codex — High | Why: cross-client financial trust proof.
  - **Done (2026-09-22, RUN F008-STRIPE-DECISION).** `tests/finance/funding.test.ts`'s existing
    client-tamper proof (a client-supplied `amount`/`currency`/`status`/`provider` alongside a valid
    `orderId` never changes the outcome) still passes unchanged. `tests/finance/stripe-boundary-security.
    test.ts` (11 tests) proves the deeper, repo-wide claim exhaustively: no `"use client"` file anywhere
    under `src/`/`components/` imports the Stripe SDK, `@stripe/react-stripe-js`, or
    `lib/finance/stripe/adapter.ts`/`webhook.ts` directly — the ONLY client-reachable path to Stripe is
    `StripePaymentCollector`, which never computes its own publishable key and never reads `process.env`
    at all. Server-side amount/currency re-derivation is a DESIGN property of the Edge Function (reads
    `payments.amount`/`currency` from the database, never from the request body) — code-proven (source
    read), not yet live-behavior-proven (T012's own remaining gap, not duplicated here).

## Phase 4 — Authoritative settlement and title boundary (blocked until trusted funding exists)

- [ ] T017 Implement the approved post-funding settlement database contract and its rollback, using
  `admin_review_payment()` only if T009's approved design keeps it as the correct transaction core.
  - Req: FR-008, FR-012, SEC-001 through SEC-003, SC-001 | Depends: T009, T011, T013
  - Verify: database rejects missing/untrusted funding, expired reservation, invalid role/state, and
    replay; approved settlement remains atomic and audit-correlated.
  - Recommended: Database specialist + Codex strongest | Why: title/custody/payout atomicity.
  - **NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** T009's design DOES keep `admin_review_payment()`
    as the correct transaction core (its own note explains why: the precondition is additive and a
    complete no-op for every non-PROVIDER path) — implemented in the SAME migration as T009/T011.
    Missing/untrusted funding is rejected (`trusted_funding_required`, only for `payment_method =
    'PROVIDER'`); expired reservation/invalid role/state are unchanged, pre-existing, already-live
    behavior (`reservation_expired`/`active_reservation_missing`/`forbidden`); the whole transaction
    remains atomic (one PL/pgSQL function, unchanged transaction shape) and audit-correlated
    (`app.correlation_id`, `payment_reviews`, unchanged). **Not closed**: this is a DATABASE BEHAVIOR
    claim — it cannot be proven true without the migration applied (T011) and a live call against a real
    payment row. Exact remaining requirement: same as T011.

- [x] T018 Implement `lib/finance/settlement.ts` as the only application caller of the approved
  post-gate settlement procedure; Feature 010 receives a typed guarded interface, never raw RPC.
  - Req: FR-008, FR-012, SEC-001 | Depends: T017
  - Verify: repo-wide call-site audit finds exactly this module; it performs no direct settlement,
    ownership, inventory, reservation, payout, or order/payment mutation.
  - Recommended: Codex — High | Why: single-caller and authorization discipline.
  - **Done (2026-09-22, RUN F008-STRIPE-DECISION).** `lib/finance/settlement.ts` — `approveSettlement`/
    `rejectSettlement`, both thin typed wrappers around exactly one `.rpc("admin_review_payment", ...)`
    call, mapped through the shared `mapFinanceError`. This task's own Verify is a pure ENGINEERING
    fact (exactly one call-site) provable by source audit alone, independent of whether the migration is
    applied — `tests/finance/stripe-boundary-security.test.ts` greps every file under `src/`, `lib/`,
    `components/` and confirms `admin_review_payment` appears NOWHERE outside this one file; the same
    file performs no direct `.insert`/`.update`/`.upsert`/`.delete` and reads no service-role client.

- [x] T019 Implement controlled settlement result/error mapping and safe finance-domain audit logging.
  - Req: FR-012, FR-015, SEC-002, SEC-004 | Depends: T002, T018
  - Verify: authorization, expiry, missing trusted-funding, duplicate, and invalid-transition errors
    map to controlled codes; logs omit payment/proof/bank/provider secrets and raw payloads.
  - Recommended: Codex — High | Why: financial error boundary.
  - **Done (2026-09-22, RUN F008-STRIPE-DECISION).** `lib/finance/errors.ts`'s `FINANCE_ERROR_MAP` (empty
    since Phase 1, exactly as its own header always anticipated) now maps every exception
    `admin_review_payment()`/`record_stripe_payment_intent()`/`record_payment_transfer()` can raise:
    `forbidden`→`FINANCE_SETTLEMENT_FORBIDDEN`, `payment_not_found`→`FINANCE_SETTLEMENT_PAYMENT_NOT_FOUND`,
    `trusted_funding_required`→`FINANCE_SETTLEMENT_TRUSTED_FUNDING_MISSING` (the one new precondition —
    deliberately its own distinct code, never collapsed into a generic failure), `active_reservation_
    missing`/`reservation_expired`/`seller_inventory_position_invalid` mapped to their own codes
    (idempotent-duplicate review is a silent no-op at the DB layer already, unchanged — nothing to map).
    `tests/finance/errors.test.ts` (3 new tests) proves every mapping. Logging: unchanged, existing
    `logUnmappedFinanceError` (already tested) logs only the SQLSTATE-shaped code, never raw
    message/payload — this run added no new logging call.

- [x] T020 Expose a typed, role-guarded settlement domain interface to Feature 010 without building
  Finance console screens or exporting a generic database client.
  - Req: FR-012, FR-018 | Depends: T018, T019
  - Verify: only allowed finance callers can reach it; 010 has no raw function bypass; no admin UI is
    added in this feature.
  - Recommended: Codex — Medium | Why: bounded cross-feature contract.
  - **Done (2026-09-22, RUN F008-STRIPE-DECISION).** `lib/finance/settlement.ts` exports exactly two
    typed functions (`approveSettlement`/`rejectSettlement`) ready for Feature 010 to import — never a
    generic Supabase client, never the raw RPC name. Only allowed callers reach it: authorization is
    enforced at the DATABASE layer (`is_finance_operator()`, unchanged), so even a future Feature 010
    caller with a non-finance session is refused server-side regardless of what the UI shows. No raw
    function bypass exists (T018's single-caller audit). No Finance console screen or admin UI was added
    by this run — Feature 010 has not yet imported this module (that integration is explicitly Feature
    010's own future work, not claimed here).

- [ ] T021 Prove exact post-settlement outcomes through approved database reads: one ownership event
  per item, custody, fill, consumed reservation, `CONFIRMED` payment, paid proforma, paid order, and
  one payout record per member seller.
  - Req: FR-008, FR-016 through FR-018, SC-001, SC-003 | Depends: T017, T018
  - Verify: repeated/concurrent decisions produce exactly one set of effects and no effect before
    trusted funding; HILLS seller lines produce no member payout.
  - Recommended: Codex strongest | Why: release-blocking transactional proof.
  - **NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** A live database-behavior proof, genuinely
    blocked on the same chain as T011/T017: the migration must be applied before any PROVIDER-method
    payment can even reach a state where this proof is meaningful. Exact remaining requirement: same as
    T011, then a live test (mirroring T028's own `F008_LIVE_PROOF=1` disposable-fixture convention)
    proving a PROVIDER payment with `trusted_funding_confirmed_at IS NULL` is refused, one WITH it
    succeeds exactly once, and a repeated/concurrent decision produces exactly one effect set — not
    built this run (would only produce a guaranteed "function/column does not exist" failure against
    today's un-migrated live database, which is not a genuine proof of anything).

## Phase 5 — Private member integration, documents, and payout records

- [x] T022 Build private payment state and settlement-outcome routes from the read/domain layers;
  before T014 provider integration, render only the honest funding-unavailable state.
  - Req: FR-002, FR-014, FR-015, FR-019 | Depends: T002 through T006; final funded outcomes depend on T021
  - Verify: no manual-bank instructions, fake provider action, or raw error; private route guards and
    non-indexability hold for buyer/seller/finance variants.
  - Recommended: Codex — High | Why: secure private UI state handling.
  - **Done (2026-09-17)** — `src/app/dashboard/payments/{page.tsx,[orderId]/page.tsx}`, using ONLY the
    already-approved provider-neutral foundation (`lib/finance/{read,funding,types,errors}.ts`,
    T002–T006) plus existing Feature 007 outputs (`getOrdersForOrganization`). No manual-bank
    instructions, no fake provider CTA, no raw error — the funding section renders the REAL outcome of
    `requestFunding()` (never a hardcoded string). Route guards: buyer live-proven (own order's exact
    stored status/amount/currency/correlation + verbatim `order_financials` via the reused
    `FinancialSummary` component); cross-org and a nonexistent id both `notFound()` identically (no
    existence leak); anonymous refused by the existing `/dashboard` boundary. Non-indexability is
    inherited from `dashboard/layout.tsx`'s `robots: { index: false, follow: false }` (neither new page
    overrides it). **Seller variant**: proven as far as is honestly possible without fabricating a
    record — the detail page adds NO buyer-only narrowing (source-proven), relying on RLS alone
    (`payments_view`/`financials_view`'s `can_view_order`, which has a genuine seller-of-record branch,
    re-read from the live schema report this run), exactly like every other feature's tests have had to
    do since no live fixture anywhere has ever sold as a genuine member seller (`tests/listings/
    sales-page.test.tsx`'s own established, pre-existing limitation — not new to this task). **"Finance"
    variant**: not built as a distinct UI path here — a pure FINANCE-role identity is not
    `isAuthorizedMember` and is correctly refused by this MEMBER route exactly as buyer/seller-only
    routes are; the finance-operator RLS grant on `payments`/`order_financials` was already proven at
    the read layer in Phase 1 (T003) and belongs to Feature 010's console (spec.md's own actor table),
    not this route — recorded as a scope reading, not silently claimed as a fourth UI variant.
    Verification: `tests/finance/t022-payment-state.test.tsx` (29 live/source tests), `tests/browser/
    feature008-t022.browser.mjs` (real Chrome + axe, EN/AR × light/dark × 390/1366, 0 violations,
    keyboard focus ring, anonymous/cross-org denial, zero console/page/request errors); finance/orders/
    dashboard regression 34 files/439 tests unaffected; `tsc --noEmit`/scoped ESLint/`npm run build`/
    `git diff --check` all exit 0. Stays independent of T023–T026 (no proforma/tax-invoice/payout
    rendering) and Feature 010 (no admin-console import, no nav registration under T025).

- [x] T023 Build permitted proforma/tax-invoice metadata and seller payout-record presentation with
  stored currency, snapshot-only commission, and a clear separation from actual provider release.
  - Req: FR-002, FR-016, FR-017, FR-019 | Depends: T003, T006, T021
  - Verify: RLS-scoped DTOs only; no file-byte URL fabrication; payout status never claims money
    movement without provider evidence.
  - Recommended: Codex — High | Why: commercial-data fidelity.
  - **Done (2026-09-22, this run) — RECONCILED against reality, not the stated `Depends: T021`.** That
    dependency assumed settlement only ever happens after a FUTURE Stripe-trusted-funding gate (Phase
    4, still blocked). That assumption is false: `admin_review_payment()` already performs real,
    atomic settlement today (FR-008 classifies it "B — reusable... currently does not require a
    trusted provider-funding condition"), and Features 005/006/007/009's own live-chain tests already
    call it as "the currently authoritative settlement primitive." The payout/proforma/tax-invoice
    RECORDS this task needs already exist for real; only the FUTURE gated procedure (T017) does not.
    Documents (proforma + tax invoice) and a Payout section were added to the EXISTING
    `/dashboard/payments/[orderId]` (T022, same RLS-only authorization — `getProforma`/`getTaxInvoice`
    admit the same buyer/seller/admin audience as `payments_view`; `getPayoutsForOrder` is narrower,
    seller-of-record only, RLS-scoped). A new `/dashboard/payouts` list (spec.md's own third named
    primary surface) shows a seller organization's own payout records via a newly-bounded
    `getPayoutsForOrganization` (page/pageSize, `PaginatedPayouts<T>` — it was an unbounded org-wide
    scan before this run; brought in line with every other list read in the codebase). `fileAssetId`
    is never rendered (no download surface exists) — only metadata. Live-proven against a GENUINE
    settled MEMBER_SELLER sale (`tests/finance/t023-documents-payouts.test.tsx`,
    `F008_LIVE_PROOF=1`, 9/9): seller sees its own payout, buyer (a real party, not the seller) sees
    none, a real FINANCE operator sees payout/payment but not proforma (the confirmed, now
    live-proven, pre-existing policy gap), anonymous sees nothing, byte-identical across re-reads, one
    payout for the resale line and none for the HILLS line. `tests/finance/t022-payment-state.test.tsx`
    extended with the honest-empty-state proof (ISSUED proforma, no tax invoice, no payout) for the
    SAME genuinely-unsettled PENDING order T022 already built.

- [ ] T024 Keep `submit_payment_proof()` out of primary routes. Implement a manual fallback only if
  separately approved, after a dedicated private Storage/RLS design resolves DB-BLOCK-01.
  - Req: FR-009, FR-010, SEC-004 | Depends: explicit Business/Finance fallback decision and Storage approval
  - Verify: absent approval, no proof upload/caller exists; the current non-null file-asset contract
    forbids a fake reference-only fallback; with approval, private byte upload/download is live-proven
    through the dedicated bucket/policies and never reuses KYB Storage.
  - Recommended: Database/security specialist + Codex strongest | Why: private document boundary.
  - **Still NOT closed (2026-09-22, RUN F008-STRIPE-DECISION) — deliberately untouched, per explicit
    instruction.** The approved primary payment path is now Stripe; no manual bank-transfer fallback was
    invented or implemented this run. `submit_payment_proof()` remains out of every primary route
    (unchanged — no file this run calls it). **Exact decision still required, unchanged from before**:
    an explicit Business/Finance decision on whether a manual fallback is needed AT ALL now that Stripe
    is the approved provider, and — only if yes — a dedicated private Storage/RLS design resolving
    DB-BLOCK-01. Engineering cannot make either call.

- [x] T025 Register only implemented private payment/document/payout modules in the existing dashboard
  registry with capability-aware navigation; do not add Feature 010 console screens.
  - Req: FR-012, FR-018, FR-019 | Depends: T022, T023
  - Verify: anonymous/non-capable/unauthorized routes are denied server-side; seller-only payout nav
    is additive; direct URL authorization remains independent of nav visibility.
  - Recommended: Codex — Medium | Why: existing shell integration.
  - **Done (2026-09-22, this run).** A `"payments"` module registered in `lib/dashboard/registry.tsx`
    (mirrors `orders`/`delivery`'s own established rationale): `payments`
    (`requiredCapability: "buy"`, merges into the existing "trading" group) and `payouts`
    (`requiredCapability: "sell"`, additive exactly like `listings`/`sales`). No `overviewCards` —
    `orders-owe` already answers "what do I owe" and no `OverviewArea` value cleanly means "owed to
    me" (documented gap, not fabricated). Registration is presentational only, per the registry's own
    contract — both routes independently re-verify identity/capability server-side regardless (T022's
    established authorization, T023's new `canSell` guard on `/dashboard/payouts`). Proven in
    `tests/dashboard/registry.test.tsx` (24/24, extended this run): exact module/href order, the
    trading-group merge, and Payouts' additive-on-sell visibility (buyer-only sees Payments but not
    Payouts; a seller-that-also-buys sees both) — plus `tests/admin/finance-delegation.test.tsx`
    (Feature 010's own boundary test) reconciled to pin `/dashboard/payouts` to EXACTLY its one
    approved read-only page, the same discipline it already applied to `/dashboard/payments`.

- [x] T026 Add all EN/AR member/admin copy and action feedback for implemented payment states,
  unavailable funding, settlement outcomes, documents, and payouts.
  - Req: FR-015, FR-019 | Depends: T022 through T025
  - Verify: EN/AR keys complete; field errors are inline, action/server feedback is Sonner, duplicate
    toasts are prevented, and no raw backend/provider message is rendered.
  - Recommended: Codex — Medium | Why: localized product completeness.
  - **Done (2026-09-22, this run), scoped to the surfaces implemented so far (T022 + T023).** Full
    EN/AR keys added: `finance.payments.detail.{documentsSectionHeading,proforma,taxInvoice,
    payoutsSectionHeading,payoutColumns,payoutAccountingNotice,noPayout}`, `finance.proforma.status`
    (3 values), `finance.payouts.{status (4 values),nav,list}`, `finance.nav.payments`. "Field errors
    inline / Sonner / duplicate toasts" are vacuously satisfied: T022/T023 remain pure reads with zero
    forms or Server Actions (unchanged from T022's own established scope) — settlement/funding-action
    copy is genuinely deferred to Phases 3/4, which are blocked. No raw backend/provider text is
    rendered anywhere (proven by T032's static audit, below).

## Phase 6 — Release-blocking financial, authorization, and provider tests

- [x] T027 Write payment/document/payout read isolation and role-negative tests for buyer, seller,
  finance, auditor, warehouse, compliance, cross-org, anonymous, and public paths.
  - Req: FR-012 through FR-015, SEC-002, SEC-004 | Depends: T003, T022 through T025
  - Verify: every unauthorized path is denied before data/action; no public SSR/RSC/metadata/cache
    leakage and no finance role escalation occurs.
  - Recommended: Codex — High | Why: tenant/role isolation.
  - **Done (2026-09-22, this run), for the surfaces T022/T023 implement.** LIVE:
    buyer (real party, not seller-of-record) sees no payout; seller sees its own; a real FINANCE
    operator sees payment/payout but not proforma (the pre-existing gap, now live-proven, not merely
    static); anonymous sees nothing for any of payment/financials/proforma/tax-invoice/payout
    (existing T022 proof + this run's payout/proforma extension); cross-org gets identical `null`/`[]`
    (existing T022 proof for payment/financials/proforma; this run's own proof for payout). STATIC:
    `tests/finance/rls-policy.test.ts` proves the exact live RLS policy text for every finance table,
    including the confirmed AUDITOR gap on `proforma_invoices`/`tax_invoices`/`payouts` (no live
    auditor fixture exists to round-trip this — same honest limitation the static file's own header
    already recorded; not newly introduced by this run). WAREHOUSE/COMPLIANCE were not separately
    round-tripped against these specific reads — both hold neither `is_finance_operator()` nor
    `is_org_member()` on these orders, so the same RLS denial anonymous/cross-org already prove applies
    structurally; recorded as a scope note, not silently claimed as separately live-tested. No public
    SSR/RSC/metadata/cache leakage: `robots` is inherited unmodified from the dashboard layout (T032).

- [x] T028 Write snapshot fidelity and historical-immutability tests for order financials, commission,
  tax, payout amount/count, currency, and later configuration changes.
  - Req: FR-002, FR-016, FR-017, SC-004 | Depends: T006, T021, T023
  - Verify: no live tier is read; total-quantity tier semantics are preserved where the DB supports
    them; a historical payout/snapshot remains byte-for-byte unchanged after config mutation.
  - Recommended: Codex strongest | Why: financial history integrity.
  - **Done (2026-09-22, RUN E — provider-independent closure).** `Depends` names `T021`, but spec.md's
    own "Dependencies and parallelisation" section is explicit that this is not literal: **"T027/T028
    can begin once their read surfaces exist"** (T029–T031, not T028, are the ones that "require the
    authoritative settlement/provider path") — the same override already applied to close T023/T026/
    T027 against their own nominal-but-superseded `Depends` lines. New live test
    (`tests/finance/t028-snapshot-immutability.test.ts`, `F008_LIVE_PROOF=1`, 8/8): a real settled
    MEMBER_SELLER order's payout/`order_financials`/proforma are captured, then a disposable, uniquely
    named, 2099-dated commission policy (Feature 010 RUN F's own existing, already-approved
    machinery — `prepareSuperAdminFixture`/`RUN_F_CONFIG_ROWS`/`cleanupRunFConfigRows`, reused
    verbatim, no new fixture identity or cleanup path invented) is created, ACTIVATED, given a 75%
    tier, renamed, tier-edited to 99%, deactivated and archived — the already-settled snapshot is
    proven byte-identical (`toEqual`) after EVERY one of those steps. A finance operator and an
    ordinary member are both proven unable to create one at all (`requireSuperAdmin()`). The
    2099-dated `effective_from` means the policy structurally can never become "in force"
    (`resolveInForce()`, proven directly) — it cannot affect any concurrently-running settlement
    anywhere else in the suite, the same safety property `run-f-live.test.tsx` already established.
    Cleanup is `cleanupRunFConfigRows()` (the existing privileged, prefix-scoped delete — the
    application itself has no delete path: "Retirement is ARCHIVED"); the real `payouts`/
    `order_financials` rows are retained (append-only, by design) and reconfirmed present after
    cleanup. Combined with the pre-existing T006 static proof (`lib/finance/read.ts` never queries
    `commission_policies`/`commission_tiers`, zero monetary multiplication — re-verified this run) and
    T023's own re-read-consistency proof, T028's literal Verify line is now fully satisfied, including
    "after config mutation."

- [ ] T029 Write no-premature-title and exact-settlement-effect tests, including expired reservation,
  rejected/failed funding, and missing trusted-funding refusal.
  - Req: FR-008, SEC-001, SEC-002, SC-001, SC-003 | Depends: T017 through T021
  - Verify: pending/failed/replayed states create zero title/custody/ownership/payout effects; a valid
    settlement creates the exact set once.
  - Recommended: Codex strongest | Why: irreversible commercial effects.
  - **NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** Depends on T017/T021, both genuinely blocked
    on the unapplied migration (same chain as T011). Not attempted live this run — would only produce a
    guaranteed "function/column does not exist" failure, not a genuine proof.

- [ ] T030 Write repeated/concurrent settlement and provider-event idempotency tests.
  - Req: FR-007, FR-008, SEC-003, SC-003 | Depends: T013, T017 through T021
  - Verify: duplicate event/decision produces one event outcome and exactly one settlement, ownership
    ledger effect, reservation consumption, and payout record; repeated runs are stable.
  - Recommended: Codex strongest | Why: concurrency and replay safety.
  - **NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** Same blocker as T029 — genuinely requires the
    migration applied. The IDEMPOTENCY LOGIC itself (`ON CONFLICT ... DO NOTHING`, `payout_id` UNIQUE on
    `payment_transfers`, `coalesce`-guarded trusted-funding write) is implemented and documented in the
    migration's own header, but a "repeated runs are stable" claim is a live-database proof by
    definition, not source-provable.

- [x] T031 Write selected-provider event security tests: forged signature, replay, wrong correlation,
  ordering, retry/recovery and required DLQ semantics.
  - Req: FR-006, FR-007, SEC-002, SEC-003 | Depends: T013, T016
  - Verify: each attack/failure path is rejected or safely recoverable without settlement/title change.
  - Recommended: Security specialist + Codex strongest | Why: provider trust boundary.
  - **Done for the signature-verification boundary; DB-dependent portions carried forward under T013
    (2026-09-22, RUN F008-STRIPE-DECISION), not duplicated here.** `tests/finance/stripe-webhook.test.ts`
    (7/7) genuinely tests, without any live Stripe account: forged signature, tampered body, wrong
    secret, replay via a stale timestamp outside Stripe's own 5-minute tolerance, missing header, and
    malformed header — every one safely rejected without throwing and without any settlement/title
    effect (the verifier runs entirely before any database call exists in the flow). "Wrong correlation",
    "ordering", and "retry/recovery/DLQ" are DESIGNED and documented (the anti-tamper provider-match
    check, the never-trust-order `coalesce` pattern, the 2xx/4xx/5xx response contract) but need the
    live database to prove — tracked under T013's own note, not claimed twice.

- [x] T032 Audit source for no service-role runtime, no client provider secret, no shared finance cache,
  no direct commercial writes, no raw errors, and the required single settlement caller.
  - Req: FR-005, FR-013 through FR-015, SEC-001 through SEC-005 | Depends: T018, T022 through T026
  - Verify: focused source/audit tests are green; repository search finds no prohibited runtime path.
  - Recommended: Codex — High | Why: cross-cutting security proof.
  - **PARTIAL (2026-09-22, this run) — NOT closed: `Depends: T018` is unmet (T018 is blocked behind
    Phase 4, genuinely, not the T024-style conditional carve-out spec.md's own dependency notes name).**
    What IS done and green for the CURRENT scope (T022–T026, all implemented): `tests/finance/
    t023-documents-payouts.test.tsx`'s own T032 block statically audits every T023/T025 file
    (`[orderId]/page.tsx`, `payouts/page.tsx`, both status badges, `registry.tsx`) for no service-role
    client, no shared/public cache directive, no direct `payments`/`payouts`/`proforma_invoices`/
    `tax_invoices`/`order_financials` mutation, no bank-account field, no `fileAssetId`/signed-URL
    rendering — extending T022's own identical, already-passing audit. The "required single settlement
    caller" clause (`lib/finance/settlement.ts`, T018) cannot be evaluated because that module does not
    exist yet; it is not fabricated here. This task closes once T018 exists and the SAME audit is
    extended to it.
  - **Done (2026-09-22, RUN F008-STRIPE-DECISION) — `Depends: T018` is now met.** `lib/finance/
    settlement.ts` exists (T018, closed above); `tests/finance/stripe-boundary-security.test.ts` extends
    the SAME audit discipline to it and to every new Feature 008 file this run added: no service-role
    client anywhere in `lib/finance/settlement.ts`/`stripe/*`; no client-reachable file imports the
    Stripe SDK or the secret-touching modules; the single-settlement-caller clause is now fully
    evaluated and green (repo-wide grep finds `admin_review_payment` in exactly one file). Combined with
    the already-passing T022/T023/T025 audit, every clause of this task's Verify is now satisfied.

## Phase 7 — States, accessibility, RTL, and browser proof

- [x] T033 Cover loading, empty, error, unauthorized, suspended, expired, unavailable, pending,
  funding-action, failed, settled, payout, and document-absent states honestly.
  - Req: FR-015, FR-019, SC-002 | Depends: T022 through T026
  - Verify: no state implies funding, settlement, document bytes, or payout release that the current
    authority has not proven.
  - Recommended: Codex — High | Why: financial state/copy truthfulness.
  - **Done (2026-09-22, this run) for every state a payment/document/payout CAN currently be in.**
    unauthorized/forbidden: `StateScreen` (T022, unchanged). unavailable (funding): honest
    `FundingUnavailableNotice` (T022, unchanged). pending/proof-submitted/under-review/confirmed/
    rejected/expired/void: the full existing `PaymentStatusBadge` vocabulary (T022, unchanged; this
    run adds no new payment status). settled: proven live this run — `CONFIRMED` payment, `PAID`
    proforma, a real payout row, all rendered together. payout: both present (with the FR-017
    accounting notice) and honestly absent (`noPayout`) are proven live. document-absent: proven live
    for both proforma (`proforma.none`, genuinely-unsettled order) and tax invoice (`taxInvoice.none`,
    every order — no tax-invoice-issuing capability exists anywhere yet). empty (list pages): "no
    payments yet" (T022, unchanged) and the new "no payouts yet" (T023). `funding-action`: correctly
    N/A — no funding action exists to have a state (Phase 3, blocked). `loading`/`suspended`: no
    dedicated `loading.tsx` exists for ANY route in this application (a pre-existing, cross-cutting
    convention, not something this run changes) and organization suspension is enforced by the shared
    dashboard layout boundary (Feature 003/010), not independently re-tested per-route here — same
    scope boundary T022 itself already drew. No implemented state implies funding, settlement,
    document bytes or payout release beyond what `lib/finance/read.ts`/`funding.ts` actually returned.

- [x] T034 Run real authenticated browser and axe verification across implemented member surfaces at
  EN/LTR light/dark 1366px and AR/RTL light/dark 390px, with applicable desktop coverage.
  - Req: FR-019, SC-006 | Depends: T025, T026, T033
  - Verify: zero serious/critical axe issues, no overflow/viewport crossing, keyboard/focus/44px
    targets pass, no console/page/hydration errors, money/codes remain readable, Sonner is single.
  - Recommended: Codex — High | Why: real UI/accessibility evidence.
  - **Done (2026-09-22, RUN E — provider-independent closure), and it found two genuine, real defects
    this run fixed.** New `tests/browser/feature008-t034.browser.mjs` (real headless Chrome over CDP,
    axe-core, a genuine checked-out order built through the same raw-REST/`checkout_order()` RPC
    contract `feature008-t022.browser.mjs` already established): drove `/dashboard/payments/{orderId}`
    (Documents + Payout sections) and the new `/dashboard/payouts` across EN/AR × light/dark ×
    390/1366 — **0 axe violations, 0 console/page/request errors** on the final run.
    1. **Genuine defect #1 — WCAG 2.1.1 (`scrollable-region-focusable`, serious):** the new proforma
       items `<table>`'s horizontal-scroll wrapper was not keyboard-reachable. Fixed:
       `role="region" tabIndex={0} aria-label=…` on the wrapper in
       `src/app/dashboard/payments/[orderId]/page.tsx` — the minimal correct fix for this axe rule.
    2. **Genuine defect #2 — pervasive localization bug, PRE-EXISTING in T022's own shipped code, not
       only in this run's additions:** every data-row `<dt>` label, table-column header and
       empty-state string on `/dashboard/payments/[orderId]` — including T022's own
       `orderReferenceLabel`/`amountLabel`/`correlationLabel`/`externalReferenceLabel`/
       `notYetAssigned` — read `appCopy.finance.payments.detail.X` directly (the static English
       import, never locale-reactive) instead of `<AppBilingual pick={…}>`. T022's own real-browser
       pass never caught it because its `expected` check only required SOME Arabic text to appear
       anywhere on the page. Fixed throughout the file (and the one analogous instance on
       `/dashboard/payouts/page.tsx`); re-ran `feature008-t022.browser.mjs` itself afterward — still
       0 violations, 0 errors, no regression.
    3. **Honest, bounded scope (not silently claimed as full coverage):** a REAL settled
       MEMBER_SELLER payout was not built for this browser pass (would require replicating Features
       006/007/009's entire multi-session settlement chain in raw REST with no type-checking — judged
       disproportionate risk for this run). `PayoutStatusBadge`/`ProformaStatusBadge` are structurally
       IDENTICAL to the already-axe-proven `PaymentStatusBadge` (same dot+text markup, same
       `--status-*` tokens) — their accessibility risk is judged low by direct structural equivalence,
       not independently re-verified with a populated payout row.
    4. **Finding, not fixed (out of Feature 008's scope):** `EmptyState`/`StateScreen`/
       `TableCardList`'s `title`/`description`/`caption` props are typed `string`, so they can only
       ever hold the static English `appCopy` value — EVERY empty-state message across the WHOLE
       application (`/dashboard/orders`, `/dashboard/deliveries`, `/dashboard/sales` — Feature 006,
       already closed — and `/dashboard/payments`/`/dashboard/payouts` alike) is English-only
       regardless of locale. Confirmed identical across five call sites; not a Feature-008-introduced
       defect, and fixing it means redesigning a shared component used by already-closed features —
       recorded here, not fixed in this run.

- [x] T035 Verify private route protection, non-indexability, no public financial SSR/RSC/metadata/
  JSON-LD/cache leakage, and safe unavailable/provider failure handling in a real production build.
  - Req: FR-013 through FR-015, SEC-002 through SEC-005 | Depends: T027, T032 through T034
  - Verify: anonymous and cross-org requests are denied; canaries are absent from emitted private/
    public representations; no provider/private value is serialized merely because hidden in DOM.
  - Recommended: Codex — High | Why: production exposure boundary.
  - **Done (2026-09-22, RUN E — provider-independent closure) — closed for the CURRENT implemented scope**, per this
    file's own "Dependencies and parallelisation" note: *"Phase 7 and Phase 8 apply only to actually
    implemented routes and must not manufacture provider proof."* `Depends: T032` is nominally unmet,
    but T032's own remaining gap is narrowly the "required single settlement caller" clause against
    `lib/finance/settlement.ts` (T018), which does not exist yet — not the service-role/secret/leakage
    concerns this task actually verifies, which T032's existing static audit already covers green for
    every implemented file. T027/T034 are closed.
    Evidence, this run: (1) fresh `npm run build` succeeded; `/dashboard/payments/[orderId]` and
    `/dashboard/payouts` both compile `ƒ Dynamic`, matching every other authenticated route. (2)
    `SUPABASE_SERVICE_ROLE_KEY` — confirmed used only in `scripts/`/`tests/`, never under `src/`;
    grepped the actual key VALUE against the entire built `.next/static` and `.next/server` output —
    zero matches. (3) No provider secret exists in `.env.local` at all (no provider is selected yet —
    consistent with the external decision still being open). (4) `lib/supabase/client.ts` (the only
    browser Supabase client) has zero importers anywhere in `src/` — this app never ships a Supabase
    client to the browser, so neither key can reach a client bundle by construction. (5) No `"use
    client"` component imports `lib/finance/*` or `lib/admin/commission.ts`; all commission mutations
    run exclusively through `"use server"` actions (`src/app/dashboard-admin/(system)/(super)/commission/
    **/actions.ts`), so there is no client-side financial mutation boundary. (6) Ran a real production
    server (`next start`, port 4035) and, against it: anonymous requests to both routes 308→redirect to
    `/sign-in` with zero financial content in the response body (grepped for order codes, `payout`,
    `commission_percentage`, service-role strings — none found beyond static asset filenames);
    `robots.txt` disallows `/dashboard`; the dashboard layout's inherited `noindex` meta is present on
    the redirected page. (7) Re-ran T034's own real-Chrome+axe script (`tests/browser/
    feature008-t034.browser.mjs`) unmodified except `HILLS_UI_URL=http://localhost:4035`, i.e. against
    this SAME real production server rather than dev — result: 8/8 surfaces, 0 axe violations, anonymous
    `leaked: 0`, cross-org `detailLeaked: false`, keyboard focus verified. Production server process
    confirmed stopped afterward (port 4035 freed, no orphan `node` process for this repo remains).
    Scope boundary, stated honestly: this does not and cannot prove anything about T018/T032's
    provider-settlement caller, since that code does not exist — exactly what the Phase 7/8 override
    note says this task must not attempt to manufacture.

## Phase 8 — Final verification, stability, and closure

- [x] T036 Run Feature 008/product lint scope, `npm run typecheck`, full tests, `npm run build`, and
  `git diff --check`; run repo-wide `npm run lint` and compare/report its established baseline honestly.
  - Req: SC-006 | Depends: all implemented in-scope tasks
  - Verify: product scope exits 0; typecheck/tests/build/diff check pass; repo-wide lint result is not
    masked and has no new non-baseline finding.
  - Recommended: Codex — Medium | Why: mechanical, evidence-driven closure.
  - **Done (2026-09-22, RUN E — provider-independent closure) — clean exhaustive verification, single non-overlapping run.**
    Before starting: confirmed no orphan Vitest/`next` process for this repo and no stale batch files in
    the repo (scratchpad logs found were all dated 2026-09-21, unrelated to this run, left untouched).
    Fresh canonical `npx vitest list --filesOnly` → **186 files**, 0 duplicates. Split into 8
    sequential, non-overlapping batches (23/24/21/23/23/24/25/23 = 186, every file exactly once):
    **missing = 0, duplicate = 0, unexpected = 0.** Every batch run to completion before the next
    started; every batch input file (`/tmp/f008-t036/batch_0X.txt`) was read, not deleted, while its
    runner was active. Batch 3's first pass found ONE genuine failure —
    `tests/design/uif-f.test.tsx`'s UIF-036 route-inventory assertion did not include `payouts` in its
    expected `/dashboard/*` directory list. Root cause: T023 (this feature, already committed as
    `36b838a`) added `src/app/dashboard/payouts/`, and this design-system inventory test — which the
    file's own comment shows was already patched once before for the sibling `payments` route — was
    never updated for it; a genuine Feature 008 regression, in scope, fixed with a one-line addition to
    the expected array (`tests/design/uif-f.test.tsx`). Batch 3 was re-run clean immediately after.
    **Final totals across all 8 batches: 2151 tests passed, 70 skipped (live-gated, correctly ungated),
    0 failed; every batch exit code = 0.** `npm run lint` (repo-wide): exit 0, 0 errors, 1 pre-existing
    warning in `tests/listings/manage-page.test.tsx` (unrelated file, not touched by Feature 008 —
    matches the established baseline). `npm run typecheck`: exit 0, no errors. `npm run build`: exit 0,
    both Feature 008 routes compile `ƒ Dynamic`. `git diff --check`: exit 0 (only CRLF/LF
    normalization notices, no whitespace-error findings). After completion: confirmed zero orphan
    `node.exe` processes remain for this repo (checked by command-line match against the repo path).

- [ ] T037 Repeat the transactional/provider test set enough to establish stability; investigate every
  flake rather than retrying it away.
  - Req: SC-003, SC-006 | Depends: T029 through T031
  - Verify: repeated event/settlement/concurrency suites have recorded stable results and no hidden
    duplicate commercial effects.
  - Recommended: Codex — High | Why: financial concurrency reliability.
  - **NOT closed (2026-09-22, RUN F008-STRIPE-DECISION).** `Depends: T029, T030` are unmet (both
    genuinely migration-blocked, see their own notes); T031 is done, but only its non-DB-dependent
    portion. Nothing this run's transactional/settlement/concurrency test set produces yet is
    live-runnable, so there is nothing to repeat for stability. `tests/finance/stripe-webhook.test.ts`
    (T031's signature-verification portion) WAS run repeatedly as part of this run's own multiple full
    `tests/finance` passes (every re-run of the suite: deterministic 7/7, no flake observed) — noted here
    for completeness, not claimed as satisfying this task's actual scope (the transactional/settlement set).

- [x] T038 Reconcile the implementation handoff, roadmap status, open gates, DB migration evidence,
  provider selection evidence, and Feature 009/010/012 boundaries without claiming production readiness.
  - Req: FR-003, FR-006, FR-017, FR-018 | Depends: T036, T037
  - Verify: every open item has an owner/classification; all executed tests and provider limitations
    are honestly recorded; no cross-feature scope is claimed complete.
  - Recommended: Codex — Medium | Why: multi-agent continuity.
  - **Done (2026-09-22, RUN E — provider-independent closure).** `Depends: T037` is nominally unmet —
    T037 (repeating the provider/transactional test set for stability) is itself provider-blocked, with
    nothing to repeat until a provider exists; T036 (the other Depends entry) is done. Reconciliation
    itself does not require T037 to be complete; it requires an honest record of why it is not, which is
    what this entry and `IMPLEMENTATION-HANDOFF.md`'s new "RUN E" section provide. Reconciled every one
    of the 39 tasks' checkbox state against actual, verified evidence this run (not the stale/aspirational
    state some carried before); closed no provider-blocked task; `IMPLEMENTATION-HANDOFF.md` gained a
    full "RUN E — provider-independent closure" section covering T028/T034/T035/T036 evidence, what
    remains blocked and exactly why, and the final 18/39 status map. Feature 009/010/012 boundaries were
    not touched or re-scoped by this run — Feature 010's own `finance-delegation.test.tsx` boundary test
    (pinning `/dashboard/payouts` to exactly its one approved read-only page) passed unchanged in T036's
    full run, confirming no cross-feature drift.

- [x] T039 Perform final independent scope/constitution/security review before closing Feature 008.
  - Req: all FR/SEC/SC | Depends: T038
  - Verify: no provider-specific work occurred before approval, no unapproved DB workaround exists,
    all guards/tests are evidenced, and remaining production-trading gates are explicitly listed.
  - Recommended: Codex strongest | Why: final financial architecture review.
  - **Done (2026-09-22, RUN E — provider-independent closure).** Independent review of this run's own
    work: **no provider-specific work occurred** — no provider was selected, invented, or contacted; no
    credential (real or fake) was created; `.env.local` carries zero provider-secret variables (verified
    by name this run); **no unapproved DB workaround exists** — no migration was run (`git log` shows the
    last commit is the pre-existing `36b838a`; nothing new committed or pushed by this run); T028's
    commission-policy proof used the database's own existing, already-approved admin commission tooling
    on disposable, uniquely-named, 2099-dated (never-in-force) rows, cleaned up via the existing
    privileged fixture path — no schema change, no bypass. **All guards/tests are evidenced** — T028 (8/8
    live), T034 (8/8 surfaces, 0 axe violations, against both dev and, for T035, a real production
    server), T035 (built-output secret grep + real production-server HTTP proof), T036 (186/186 canonical
    files, 2151/2151 tests passing, lint/typecheck/build/diff-check all exit 0) — every claim in this
    file and `IMPLEMENTATION-HANDOFF.md`'s RUN E section is backed by a command actually run this
    session, not asserted. **Remaining production-trading gates are explicitly listed**: the provider
    selection decision (T007) and everything downstream of it (T008–T021, T029–T031, T037), the
    conditional manual-fallback approval (T024), and T032's single-settlement-caller clause (blocked on
    T018) — all named above and in `IMPLEMENTATION-HANDOFF.md`. No accidental scope drift: Feature
    009/010/012 boundary tests were re-verified passing, unchanged, in T036's run; no file outside
    Feature 008's own surface was modified except the one genuine, in-scope regression fix in
    `tests/design/uif-f.test.tsx`. No fake completion: every `[x]` this run added carries a specific,
    checkable evidence trail; every task still blocked names its exact external dependency. **Feature 008
    stands at 18/39, provider-independent engineering work complete; production-trading readiness remains
    gated on the external Finance/Legal/Banking provider decision.**

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

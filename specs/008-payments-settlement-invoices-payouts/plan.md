# Implementation Plan: Payments, Settlement, Invoices & Payouts

**Feature**: `008-payments-settlement-invoices-payouts`
**Reconciled**: 2026-09-13
**Spec**: [spec.md](./spec.md)
**Status**: Planning reconciled — implementation NOT started

## Summary

Feature 008 moves from an obsolete manual-bank-proof plan to an **escrow-oriented,
provider-neutral** plan. It can start with private finance reads, controlled errors, immutable
snapshot presentation, and an honest funding-unavailable state. It cannot implement a real funding,
provider event, escrow release, or provider payout until a provider is selected and the required
database contract is approved.

Feature 007 is closed and already owns checkout, reservation, HOLD, proforma, payment creation,
commercial snapshots, and lazy expiry. Feature 008 consumes those facts. It never recalculates,
reserves, changes checkout totals, or directly mutates commercial settlement effects.

## Technical context and authority

**Current authorities**: SRS MKT-04, MKT-05, API-02, OPS-01, the current database schema report,
`DATABASE-CAPABILITY-MAP.md`, `commission-capability.md`, and the Feature 007 live-verification
handoff. Where older SQL/planning prose conflicts with those sources, current capability/live
evidence wins.

**Application shape**:

| Layer | Authority / responsibility |
|---|---|
| Postgres + approved database procedures | Commercial truth, RLS, order/payment/settlement/title invariants, snapshots, and atomic effects. |
| Supabase Edge Functions | Future provider-secret custody, provider calls, webhook/event ingestion, signature verification, replay handling, normalization, retry/recovery. No implementation before provider selection. |
| Next.js Server Actions | Web adapter only: validate/authenticate web requests and call the shared boundary. Never the sole payment backend. |
| Future React Native | Calls the same Supabase/Edge/DB boundary; never depends on a Next.js Server Action. |

Provider secrets never enter `NEXT_PUBLIC_*`, browser bundles, client components, `EXPO_PUBLIC_*`, or
React Native client code. A client submits minimal identifiers; backend code re-reads order,
organization, payment, amount, currency, state, and permissions.

**Private-data/caching rule**: payment, settlement, invoice, payout, proof, provider, and title
truth are authorization-scoped fresh reads. There is no shared cache, public route, public metadata,
or public API for them.

## Current database capability assessment

| Area | Reusable now | Manual-specific / legacy | Escrow-compatible | Missing or provider-dependent |
|---|---|---|---|---|
| Checkout-created payment | `checkout_order()` atomically creates/updates the payment, amount, currency, correlation ID, and `PENDING` state. | Default method is `BANK_TRANSFER`. | `payments.payment_method` already permits `PROVIDER`; `provider`, `external_reference`, `idempotency_key`, `correlation_id` columns exist. | Checkout/provider initiation must be designed after selection; no current trusted provider path. |
| Provider events | `payment_events(payment_id, provider, external_event_id, event_type, payload, correlation_id)` exists. Unique `(provider, external_event_id)` supports duplicate receipt detection when both values are present. | None. | Correlation and unique external event key are useful primitives. | `provider`/`external_event_id` are nullable, so the key alone is not a complete inbound-event guarantee; there is no Edge ingestion, signature evidence, normalized processing state, ordering/retry/DLQ mechanism, or DB trust-to-settlement gate. |
| Settlement/title | `admin_review_payment()` is atomic, FINANCE-authorized, locks payment/order/reservation, is confirmed-state idempotent, writes ownership/custody/fill/payout/proforma/order effects. | Existing rejection/proof cycle semantics. | Its atomic transaction and payout aggregation remain the correct settlement core. | It can approve without proving trusted provider funding; its `auth.uid()` FINANCE guard is not provider-event identity. |
| Payment proof | `submit_payment_proof()` records a proof and moves current manual states. | Entire flow is proof/manual-review specific. | None for the primary target. | `p_file_asset_id` and `payment_proofs.file_asset_id` are required, so reference-only submission is not currently possible; no dedicated payment-proof Storage bucket/policies exist. Fallback only if separately approved. |
| Financial snapshots | `order_financials` preserves amount, currency, tax and commission/payout inputs; `proforma_invoices` exists. | None. | Directly reusable. | None for private display; tax/proof document bytes still require proper Storage. |
| Payouts | `payouts` records amount, currency, status, `paid_by`, `paid_at`, and reference; unique order/seller identity. | Existing status may reflect manual operations. | Platform accounting/payout-record state is reusable. | Provider money movement/release evidence, reconciliation, and event mapping depend on provider/business model. |
| Payment accounts | Admin-only configuration table exists. | Bank-account fields and checkout default are manual-bank shaped. | May remain operational/manual-fallback data. | Do not expose member bank mutations or primary bank instructions; provider payout/bank requirements remain undecided. |

### Honest status mapping

| Existing vocabulary | Safe meaning in this plan |
|---|---|
| `payments.PENDING` | Internal payment exists after checkout; not proof that funding was initiated or received. |
| `PROOF_SUBMITTED`, `UNDER_REVIEW`, `REJECTED` | Existing manual-proof/review vocabulary only; not escrow aliases. |
| `CONFIRMED` | Existing post-settlement result; not a trusted-funding precursor. |
| `EXPIRED`, `VOID` | Existing terminal/payment outcome vocabulary; no provider-specific mapping assumed. |
| `payment_method.PROVIDER` | Available schema value only; not proof that provider initiation is implemented. |

No new lifecycle status is invented in application code. The selected provider and approved database
design determine whether a migration introduces an explicit funding/settlement-eligibility model or
uses another formally reviewed representation.

## Required architecture decisions

1. **Provider decision gate.** Phase 1 may begin now. A provider decision, legal/banking approval,
   credentials model, webhook/event contract, funding/release semantics, and payout model are required
   before provider-specific work or production trading.
2. **Provider-neutral seam.** The domain names only four operations conceptually: initiate
   funding/escrow, retrieve/verify provider state, normalize a provider event, and correlate it to an
   internal payment/order. It does not create fictional adapter signatures or a generic payment SDK.
3. **Webhook policy.** No webhook/Event Function is built before selection. If required, it must be an
   Edge Function that verifies signatures, persists/rejects duplicate IDs, handles ordering/retry/DLQ
   according to API-02, maps errors safely, and never trusts the client.
4. **Settlement classification — B.** `admin_review_payment()` is reusable only after an approved DB
   change makes trusted funding a database-enforced precondition (or supplies an equivalently secure
   provider-event settlement procedure). Application code cannot close this gap.
5. **Proof classification — C.** `submit_payment_proof()` is legacy for the primary escrow target.
   It has no primary route/caller. A manual fallback needs separate Business/Finance approval; only
   then is DB-BLOCK-01 relevant to its file bytes.
6. **Payment-account classification.** `payment_accounts` remains an admin-configured operational or
   manual-fallback capability. Feature 010 owns its configuration UI; Feature 008 adds no member
   bank-detail mutation or primary bank-instruction surface.
7. **Settlement/payout separation.** A database payout record is not actual money release. Provider
   release/reconciliation proof is provider-dependent and must not be claimed by a status label alone.
8. **Commission immutability.** This feature reads only `order_financials` snapshots and existing
   payout values. It never queries live tiers to derive historical value. `COMMISSION-OPEN-01` stays
   open with Business/Finance and blocks production trading only.
9. **Feature boundaries.** Feature 005 presents custody, 006 presents listings/fills, 009 presents
   delivery progression, 010 presents finance/admin operations, and 012 owns disputes/notifications/
   audit workflows. Feature 008 supplies only its guarded finance/domain seam and payment-state links.
10. **UX/error convention.** Field validation is inline. Global/action/server outcomes use the one
    existing Sonner provider with localized controlled codes. No raw provider/Postgres/Supabase errors
    or sensitive financial payloads are displayed or logged.

## Project structure after implementation

```text
lib/finance/
├── validation.ts       # exact current status/DTO allowlists; no invented escrow states
├── errors.ts           # controlled finance/provider result codes only
├── read.ts             # RLS-scoped payment/financial/invoice/payout reads
├── funding.ts          # provider-neutral boundary; unavailable until selected adapter exists
├── settlement.ts       # sole app caller of approved post-gate settlement procedure
└── types.ts            # shared web/mobile-safe DTOs, never secrets

supabase/functions/<provider-boundary>/  # provider-selected only; future Edge Function

src/app/dashboard/
├── payments/           # private payment state and later funding adapter UI
├── documents/          # permitted proforma/tax-invoice metadata/presentation
└── payouts/            # seller payout-record presentation

components/finance/     # existing primitives/tokens/Sonner; EN+AR from first render
tests/finance/          # domain, RLS, provider-boundary, settlement, UI and audit proofs
```

The Edge Function directory is planned only; it is not created until a provider is selected.

## Phase sequence and gates

| Phase | Goal | Can start now? | Blocking dependency |
|---|---|---:|---|
| 1 | Provider-neutral finance foundation and safe private reads | Yes | Feature 007 closed outputs only |
| 2 | Provider decision and DB-contract gate | No code until external decision | Provider + Finance/Legal/Banking approval |
| 3 | Provider funding/event boundary | No | Phase 2, approved migration, credentials |
| 4 | Authoritative settlement/title boundary | No | Phase 3 trusted funding gate |
| 5 | Payment/document/payout member integration | Partially; final funded states depend on Phase 4 | Read capability now; final states after Phase 4 |
| 6 | Release-blocking financial/security tests | Partially | Provider scenarios after Phase 3/4 |
| 7 | States/accessibility/RTL/browser proof | Partially | Implemented routes |
| 8 | Final verification and closure | No | All in-scope implementation and provider gates |

## Testing strategy

| Test family | Required proof |
|---|---|
| Read/visibility | RLS and route boundary: buyer/seller/finance/auditor allowed only as appropriate; cross-org/anonymous/public denied. |
| Snapshot fidelity | Amount, currency, tax, commission and payout displays equal stored fields; later tier changes do not alter historic values. |
| Provider-neutral unavailable | Before selection there is no fake payment success, bank instruction, provider API call, secret, or client-trusted state. |
| Provider events — blocked until selected | Signature/forgery rejection, duplicate/replay event, wrong payment/order correlation, ordering/retry/DLQ semantics. |
| Settlement | No premature title; exactly one database-owned settlement/title/custody/fill/payout effect; expired reservation, role negatives, and concurrency are refused safely. |
| Payout | Exact per-seller record count/amount from snapshot; release cannot be claimed without provider evidence. |
| Security audit | No service role in runtime, no shared cache/private leakage, no raw errors/log secrets, no direct commercial writes. |
| UI/browser | EN/AR, RTL/LTR, light/dark, 390/1366/desktop, focus/keyboard, touch targets, no overflow, loading/empty/error/unavailable/pending/settled states. |

## Final verification baseline

The feature-specific/product lint scope must exit 0, alongside typecheck, full tests, production
build, and `git diff --check`. Repository-wide `npm run lint` currently has an established historical
`docs/claude-design` baseline; it must be run, reported with its true exit/result, and compared against
that baseline. It must not be hidden through ESLint configuration changes. A literal repo-wide exit-0
requirement would be an explicit planning blocker, not a result to fabricate.

## Risks and open-item handling

| Risk / item | Classification | Handling |
|---|---|---|
| Provider choice, credentials, webhook/event contract | Blocks provider-specific implementation | Phase 2 gate; no provider guessing. |
| Trusted-funding DB gate and lifecycle state vocabulary | Blocks provider-specific implementation | Approved migration/design required; no app workaround. |
| DB-BLOCK-01 payment-proof bytes | Informational for primary path; blocks manual fallback attachments | Preserve isolation; no bucket reuse or fake upload. |
| Refunds/chargebacks | Blocks production trading only | Finance/Legal decision; no mechanics invented. |
| Dual control | Deferred to 010 | Current table supports a single reviewer; do not invent maker-checker. |
| Payout release evidence | Blocks production trading only | Distinguish record from money movement; provider decision required. |
| COMMISSION-OPEN-01 | Blocks production trading only | Preserve snapshot; Business/Finance decides 0% vs fail-closed. |
| Feature 009 delivery | Deferred to 009 | Surface settlement handoff only. |

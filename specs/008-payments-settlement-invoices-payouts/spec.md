# Feature Specification: Payments, Settlement, Invoices & Payouts

**Feature Directory**: `specs/008-payments-settlement-invoices-payouts`
**Reconciled**: 2026-09-13
**Status**: Planning reconciled — implementation NOT started
**Primary surfaces**: Member Portal (`/dashboard/payments`, `/dashboard/documents`,
`/dashboard/payouts`) plus a guarded finance domain layer consumed by Feature 010
**Depends on**: 001, 003, 004, 005, 006, and closed Feature 007

## Purpose

Provide the finance and settlement foundation after Feature 007 checkout creates a held order,
financial snapshot, proforma, reservation, and `PENDING` payment. The target architecture is
**escrow-oriented and provider-neutral**. No payment/escrow provider has been selected.

This feature may build read-only financial presentation and provider-neutral domain preparation
before selection. It must not pretend that funding, provider verification, escrow release, or a
provider payout can happen before an approved provider contract and the required database boundary
exist.

Title/custody ownership may move only through the approved database settlement transaction. Neither
checkout, a client claim, an uploaded proof, a browser/mobile callback, nor an untrusted provider
payload transfers title.

## Scope

### In scope

- Private, RLS-scoped reads of payments, immutable order-financial snapshots, proformas, tax-invoice
  metadata, and payout records.
- A small provider-neutral funding/escrow boundary: internal correlation, safe state presentation,
  controlled error mapping, and an explicit unavailable state until provider selection.
- The guarded finance domain interface that Feature 010 will consume; 010 owns finance console
  screens, worklists, and decision UI.
- The authoritative settlement/title boundary once the required provider-trust database gate has
  been formally approved and implemented.
- Payout **record/accounting-state** visibility; actual provider money release is provider-dependent.
- Snapshot-only commission and payout presentation.
- EN/AR, RTL, theme, responsive, accessibility, and Sonner feedback standards from the first member
  or admin-consumed surface.

### Out of scope

- Selecting Stripe, Tazapay, PayTabs, or any other provider; provider pricing; provider credentials;
  or provider-specific APIs before formal approval.
- A final manual-bank-transfer/payment-proof journey. `submit_payment_proof()` is not part of the
  primary escrow target flow.
- Any direct application-side title, ownership, inventory, reservation, payout, or settlement-state
  mutation.
- Finance console screens, queues, payment-account configuration, commission policy/tier management,
  and other operations UI — Feature 010.
- Delivery/warehouse progression — Feature 009.
- Refund, chargeback, dispute, notification-delivery, or audit-console workflows — Feature 012 and
  the Finance/Legal decision register.
- Database changes in this planning run. Future changes are documented as gates, never worked around.

## Authoritative starting point

Feature 007 is closed. Its `checkout_order()` function already creates the held commercial state:
reservation, `order_financials`, proforma, correlation ID, and a `payments` row in `PENDING`.
Feature 008 consumes those outputs and must not recreate reservations, checkout totals, commercial
calculations, or `HOLD` transitions.

The current database capability report/map and the Feature 007 live-verification handoff are the
authority for runtime behaviour. An older checked-in SQL snapshot is not authority where it disagrees
with those sources.

## Actors

| Actor | Interest |
|---|---|
| Buyer member | Privately see the exact stored amount, currency, reference, hold/payment state, invoices, and an honest funding state. |
| Seller member | Privately see the settled payout record and amount from the immutable checkout snapshot. |
| Finance operator | Use the guarded finance domain only after the database recognizes trusted funding; the Feature 010 console supplies operational UI. |
| Auditor | Read permitted finance evidence; never mutate it. |
| Provider/Edge boundary | A future trusted backend integration only; never a browser, Next.js-only backend, or React Native client authority. |

## Provider-neutral lifecycle

This is a conceptual lifecycle, not a claim that every stage already has a database status:

1. **Internal commercial record exists** — current `checkout_order()` output; `payments.status =
   PENDING` is honest here.
2. **Funding/escrow initiation** — unavailable until provider selection and the approved backend/DB
   contract exist.
3. **Awaiting customer or provider action** — unavailable until the selected provider defines it.
4. **Trusted funding confirmation** — must originate from a secure backend/provider-event boundary;
   there is no existing honest `payments.status` for this meaning.
5. **Settlement eligible** — requires a database-enforced trusted-funding condition.
6. **Authoritative platform settlement** — `admin_review_payment(..., true)` performs title,
   custody, reservation consumption, fill, proforma, payment, and payout effects only after the
   required database gate exists.
7. **Payout record/release boundary** — current payout records can be displayed; actual money release
   depends on the selected provider/payout model.
8. **Provider failure/cancel/expiry/replay** — requires selected-provider semantics and controlled
   mapping; never overload an unrelated existing status.

`PROOF_SUBMITTED`, `UNDER_REVIEW`, and `REJECTED` retain their current manual-proof meanings. They
MUST NOT be renamed in code or silently repurposed as escrow/funding states. `CONFIRMED` remains the
existing post-settlement payment result, not a substitute for pre-settlement trusted funding.

## Prioritized stories

### PS1 — Member sees stored commercial truth (P1, can begin now)

A permitted buyer sees the stored amount, currency, order/proforma reference, hold/payment state and
available finance documents. A permitted seller sees only their payout record. No total, tax,
commission, payment state, or provider state is derived from browser input.

**Independent test**: an owner reads exact `order_financials` and payment values; a cross-org member
gets no data; a public request contains no financial data.

### PS2 — Funding is honest while provider selection is pending (P1, can begin now)

When a provider-backed funding journey is not configured, the member sees a localized, safe,
non-actionable unavailable state rather than bank details, a fake provider control, or a false
success. Field validation remains inline; global/server outcomes use the existing Sonner provider.

**Independent test**: no provider client/API/secret appears in the route, and the unavailable state
does not expose a raw backend message.

### PS3 — Trusted funding may lead to settlement only through the database (P1, provider-gated)

After a selected provider's trusted backend event is accepted through the approved Edge/DB boundary,
a finance-authorized workflow may request settlement. The database must reject settlement that lacks
the trusted-funding condition, expired reservation, authorization, or valid business state.

**Independent test**: forged/replayed/wrongly-correlated provider input cannot settle; a valid trusted
event settles exactly once, creates exactly the database-owned effects once, and never moves title
before the gate.

### PS4 — Settlement, documents, and payout records are visible (P2)

After authoritative settlement, permitted parties see the stored outcome, immutable financial
snapshot, proforma/tax-invoice metadata, and seller payout record. A payout record is not evidence
that provider money movement has happened unless the selected provider/release model proves it.

**Independent test**: the buyer, seller, finance operator, auditor, and unrelated organization each
receive exactly their permitted data and nothing more.

### PS5 — Manual proof remains outside the primary path (P3, conditional)

`submit_payment_proof()` and its evidence model may only become a separately approved manual fallback.
Until then no member proof-upload UI is built. If that fallback is approved, private bytes require a
dedicated approved Storage bucket and policies; no KYB bucket reuse or improvised storage path is
allowed.

## Functional requirements

- **FR-001**: Feature 008 MUST consume Feature 007's held order, reservation, financial snapshot,
  proforma, payment, and correlation outputs. It MUST NOT recreate checkout calculations, reservation
  logic, or `HOLD` transitions.
- **FR-002**: Amount, currency, commission, tax, and seller payout presentation MUST come only from
  immutable `order_financials`, `payments`, and `payouts` values. The application MUST NOT recalculate
  historical totals, commission, tax, or payout amounts.
- **FR-003**: The primary flow MUST remain escrow-oriented and provider-neutral until a provider is
  formally selected. No provider API, credential, UI, pricing, state vocabulary, or webhook behaviour
  may be invented.
- **FR-004**: The browser and future React Native app MUST submit only minimal identifiers to a shared
  Supabase/Edge/DB backend boundary. They MUST NOT be trusted for amount, currency, payment state,
  provider status, authorization, or settlement eligibility.
- **FR-005**: Provider secrets MUST exist only in secure Edge/server environment configuration and
  MUST NOT reach `NEXT_PUBLIC_*`, browser bundles, client components, `EXPO_PUBLIC_*`, or React Native
  client code.
- **FR-006**: Funding initiation, provider-event verification, signature validation, replay handling,
  ordering, retry, and dead-letter/recovery implementation are blocked until provider selection.
  If webhooks are required by that provider, they MUST use a Supabase Edge Function boundary and meet
  SRS API-02.
- **FR-007**: The existing unique `(provider, external_event_id)` capability in `payment_events` MAY
  support duplicate-event detection, but a provider-backed implementation MUST NOT claim it is a
  complete webhook processor without an approved trusted ingestion/processing contract.
- **FR-008**: `admin_review_payment()` is **B — reusable only with a formally required database
  change** for the escrow target. It already owns atomic settlement/title/payout effects and confirmed
  idempotency, but currently does not require a trusted provider-funding condition and its FINANCE
  `auth.uid()` guard cannot itself serve as a provider-event identity. No application workaround is
  permitted.
- **FR-009**: `submit_payment_proof()` is **C — legacy for the final primary escrow flow**. It is not
  invoked by primary Feature 008 routes. Its current `p_file_asset_id` argument and the non-null
  `payment_proofs.file_asset_id` column mean that even a reference-only manual fallback is not
  currently viable without a real private file asset; a future explicit fallback may reassess it
  without changing the primary architecture.
- **FR-010**: DB-BLOCK-01 does not block the primary escrow path. It blocks only a separately approved
  manual-proof attachment path and any private document-byte surface lacking its own approved bucket
  and policies.
- **FR-011**: `payment_accounts` is an operational/admin-managed legacy or manual-fallback capability
  under the current data model. Feature 008 MUST NOT render member-facing bank instructions or provide
  member bank-detail mutation. Feature 010 owns configuration UI.
- **FR-012**: A finance/operator domain layer MUST validate identity, organization scope, role,
  business state, provider-trust gate, and input at the server boundary, then rely on database
  authorization as the final authority. Feature 010 receives typed guarded interfaces, never raw RPC
  bypasses.
- **FR-013**: No normal application runtime path may use a service-role key. RLS, direct-RPC negative
  tests, cross-organization isolation, and no-public-finance-data requirements remain mandatory.
- **FR-014**: No shared/public cache may contain payment, settlement, invoice, payout, proof, provider,
  or title truth. Relevant private reads are fresh and authorization-scoped.
- **FR-015**: Every error returned to a user MUST be a localized controlled result code. Field-specific
  validation stays inline; global/action/server outcomes use the existing Sonner provider. Raw
  Supabase, PostgreSQL, provider, secret, proof, bank, or payload text MUST NOT reach UI or logs.
- **FR-016**: Commission uses the checkout snapshot only. Tier configuration and the unresolved
  `COMMISSION-OPEN-01` decision remain Feature 010 and Business/Finance concerns; this feature does
  not decide them or mutate historical values.
- **FR-017**: A payout record/accounting state and actual provider money release are separate. Actual
  payout release is provider-dependent and cannot be represented as proven before its model is chosen.
- **FR-018**: Feature 008 may display payment/settlement state needed for the Feature 009 handoff but
  MUST NOT implement delivery or warehouse progression. Feature 005 owns inventory/custody
  presentation; Feature 006 owns marketplace/listing/fill presentation.
- **FR-019**: All member/admin-consumed surfaces must use existing project/shadcn primitives, design
  tokens, dashboard/module architecture, and one existing Sonner provider. They must support EN/AR,
  LTR/RTL, light/dark, 390px mobile, 1366px laptop, desktop, keyboard/focus, labels, logical
  direction, applicable 44px targets, no overflow, stored currency alongside money, and monospaced
  references/codes.

## Security requirements

- **SEC-001**: No title, ownership, custody, inventory, reservation, settlement, or payout write is
  performed by application code.
- **SEC-002**: A non-finance user, cross-org user, anonymous caller, stale/expired order, forged
  provider input, replayed event, or wrong payment/order correlation cannot settle.
- **SEC-003**: Provider event acceptance is backend-only and idempotent. A provider retry cannot
  duplicate title, ownership, reservation consumption, payout, invoice state, or settlement.
- **SEC-004**: Finance data remains private, non-indexable, and absent from public routes, metadata,
  JSON-LD, shared cache, client bundles, analytics, and unsafe logs.
- **SEC-005**: The database state vocabulary is used verbatim. New escrow semantics require an approved
  database design; they are never silently encoded into unrelated current states.

## Success criteria

- **SC-001**: 100% of settlement/title/custody/ownership/reservation-consumption/payout-record effects
  originate from the approved database settlement procedure; zero originate in application code.
- **SC-002**: Before provider selection, member payment surfaces are truthful and unavailable for
  provider funding rather than manual-bank or fake-provider flows.
- **SC-003**: After provider selection and the approved DB gate, valid trusted funding can cause one
  and only one settlement; replay, wrong correlation, forged signature, client amount tampering, and
  provider failure cannot settle or move title.
- **SC-004**: Amount, currency, commission, tax, and payout displays equal stored snapshots exactly;
  later configuration changes do not alter historical values.
- **SC-005**: No finance data crosses organization, public, cache, secret, raw-error, or logging
  boundaries.
- **SC-006**: All implemented surfaces pass focused lint, typecheck, full tests, build, diff check,
  the documented repo-wide lint-baseline comparison, and the required real-browser/a11y matrix.

## Open items and classifications

| Item | Classification | Current truth / owner |
|---|---|---|
| Provider selection | **BLOCKS PROVIDER-SPECIFIC IMPLEMENTATION** | Finance/Legal/Banking-provider decision; does not block Phase 1. |
| Provider credentials/secrets | **BLOCKS PROVIDER-SPECIFIC IMPLEMENTATION** | Secure Edge/server environment only after selection. |
| Webhook/event contract | **BLOCKS PROVIDER-SPECIFIC IMPLEMENTATION** | Must satisfy API-02; current schema has only partial event storage primitives, including nullable provider/event identifiers. |
| Provider payout/release model | **BLOCKS PRODUCTION TRADING ONLY** | Platform payout record exists; actual release evidence is provider/business dependent. |
| DB-BLOCK-01 proof-file storage | **INFORMATIONAL / CONTINUITY ONLY** for primary escrow; **BLOCKS** manual-proof attachment | No payment-proof bucket/policies; no KYB bucket reuse. |
| `admin_review_payment()` trusted-funding gate | **BLOCKS PROVIDER-SPECIFIC IMPLEMENTATION** | Required approved DB migration/design before provider-funded settlement. |
| Escrow lifecycle state vocabulary | **BLOCKS PROVIDER-SPECIFIC IMPLEMENTATION** | Current statuses cannot honestly represent all funding stages. |
| Refunds/chargebacks | **BLOCKS PRODUCTION TRADING ONLY** | Finance/Legal decision; disputes/audit workflow belongs to 012. |
| Dual control | **DEFERRED TO FEATURE 010** | SRS says configurable; current review row has one reviewer only. |
| `COMMISSION-OPEN-01` | **BLOCKS PRODUCTION TRADING ONLY** | Business/Finance decides 0% fallback vs fail-closed; no decision here. |
| Delivery progression | **DEFERRED TO FEATURE 009** | 008 only exposes settlement handoff state. |

## Dependencies and boundaries

| Feature | Boundary |
|---|---|
| 005 | Owns inventory/custody presentation; 008 links to authoritative settlement outcomes without duplicating inventory logic. |
| 006 | Owns marketplace/listing/resale presentation; settlement-dependent fill acceptance consumes the DB outcome from 008. |
| 007 | Closed producer of checkout, reservation, HOLD, proforma, payment, financial snapshot, and hold expiry. 008 consumes, never recreates. |
| 009 | Owns delivery/shipment progression; receives settled state only. |
| 010 | Owns finance console and admin configuration UI; consumes typed guarded 008 domain interfaces. |
| 012 | Owns disputes, notifications, and audit-facing workflows; no refund/chargeback mechanics are pulled into 008. |

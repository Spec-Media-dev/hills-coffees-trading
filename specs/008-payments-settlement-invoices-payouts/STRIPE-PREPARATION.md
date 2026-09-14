# Feature 008 — Stripe Architecture Preparation (RUN B / Phase 2A)

**Status**: PARTIAL — architecture prepared, account not yet available
**Date**: 2026-09-14
**Scope**: T007–T010 preparation only. No account access, no credentials, no code that calls
Stripe, no migration, no Edge Function, no webhook, no UI. Nothing in this document is
implemented; it is a decision/design draft to shorten the work once the Stripe account exists.

Every fact below is one of exactly three kinds, and every heading says which:

- **KNOWN** — read directly from current official Stripe documentation, cited by URL.
- **PROVISIONAL** — a recommendation this document makes from KNOWN facts, that still requires the
  real account to confirm it actually applies to Hills Coffee's country/entity/capabilities.
- **ACCOUNT-VERIFICATION-REQUIRED** — a fact only the real Stripe account/dashboard can supply.
  Never inferred, never guessed.

---

## 1. What is known

- Stripe Connect is Stripe's product for multi-party marketplace/platform payments, distinct from
  a plain single-account Stripe integration.
- Connect offers three charge-type shapes: **direct charges**, **destination charges**, and
  **separate charges and transfers** (the latter two share the "indirect charge" umbrella).
  [Understand how charges work in a Connect integration](https://docs.stripe.com/connect/charges)
- Stripe's own recommendation table names **separate charges and transfers** for exactly this
  shape: *"An e-commerce marketplace that allows a single shopping cart for goods sold by multiple
  businesses."* That is a literal description of a Hills order: one buyer, one checkout, order
  items whose lots can belong to different seller organizations (or to HILLS itself).
- A PaymentIntent (or Charge) is created on the **platform's own account**, carrying a
  `transfer_group` value chosen by the platform (e.g. an order id). One or more `Transfer` objects
  are created afterward — separately, at a time of the platform's choosing — each referencing the
  same `transfer_group` and (optionally) a `source_transaction` pointing back at the original
  charge. [Create separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- `source_transaction` links a Transfer to the Charge that funds it, so the Transfer cannot exceed
  or precede money the platform actually has from that charge — this is the mechanism that lets a
  transfer wait until the platform decides to release it, rather than firing immediately.
- Transfer and charge amounts do not have to match — a transfer can be less than the charge (this
  is how a platform commission works: the seller's transfer is the line total minus commission,
  and a HILLS-owned line simply gets no transfer at all).
- Refunds and disputes on separate-charges-and-transfers payments debit the **platform's** Stripe
  balance, not the connected account's; the platform can then reverse a transfer to recover funds
  from a connected account. This makes Hills — not the seller — the party Stripe holds liable by
  default. [Charges: refunds and disputes](https://docs.stripe.com/connect/charges#refunds)
- The API supports request-level **idempotency**: an `Idempotency-Key` header (client-generated,
  up to 255 chars, Stripe recommends a v4 UUID) on `POST` requests. Stripe stores the first
  response for 24 hours and replays it verbatim for any retry with the same key.
  [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- Stripe **does not guarantee webhook event delivery order**, and the same logical event can be
  delivered more than once. Stripe's own guidance: dedupe using the event's `id`, never `created`
  (two events can share a timestamp); if you need the current state of an object, re-fetch it by ID
  rather than trusting field values on an out-of-order event.
  [Webhooks — event ordering, duplicate events](https://docs.stripe.com/webhooks)
- Webhook payload authenticity is verified via the `Stripe-Signature` header: an HMAC-SHA256 over
  `{timestamp}.{raw body}` keyed by a per-endpoint `whsec_...` secret, with a default 5-minute
  timestamp tolerance to block replay. The **raw** request body must reach the verifier unmodified.
  [Verify signatures](https://docs.stripe.com/webhooks#verify-events)
- Stripe retries a failed live-mode webhook delivery for up to **3 days** with exponential backoff;
  a human can also manually resend an event for up to 15 days (Dashboard) or 30 days (CLI).
- A Stripe React Native SDK exists and is officially supported (Payment Sheet, Payment Element,
  CardField, Google Pay), so a future Hills mobile client is not blocked by SDK availability.
  [Stripe React Native SDK](https://docs.stripe.com/sdks/react-native)
- Connect has three legacy connected-account types (**Standard**, **Express**, **Custom**) and a
  newer **v2 accounts / controller-properties** model that replaces "account type" with discrete
  configurable capabilities. Stripe now steers new integrations toward v2 accounts.
  [Connected account types](https://docs.stripe.com/connect/accounts) ·
  [Migrate to controller properties](https://docs.stripe.com/connect/migrate-to-controller-properties)

## 2. What is provisional (this document's own recommendation — not yet account-verified)

> **PROVISIONAL — REQUIRES ACCOUNT VERIFICATION** applies to everything in this section.

- **Likely Connect model: separate charges and transfers**, addressed in full in Section 4.
- **Likely connected-account shape**: a v2/controller-properties connected account per seller
  organization (not Standard/Express/Custom), because it is Stripe's current recommended path and
  gives the platform (Hills) the most control over what the seller-facing surface looks like —
  matching the constitution's "one Member Portal, seller capability additive" model rather than
  handing sellers a separate Stripe-branded dashboard. **This still requires the real account to
  confirm the platform's country/entity supports v2 connected accounts for the seller countries
  Hills expects.**
- **Likely webhook necessity: yes.** See Section 8.
- **Likely `on_behalf_of` usage: omitted** (platform remains business-of-record) unless Hills has a
  specific settlement-currency/statement-descriptor reason to set the connected account as
  merchant of record. Omitting it is the simpler, lower-commitment default and does not preclude
  adding it later.

## 3. What requires account verification (do not infer any of these)

See the full checklist in Section 15 / "Account checklist for the user" below. Nothing in this
document assumes an answer to any of these.

---

## 4. Likely Connect model — charge-type comparison

**PROVISIONAL — REQUIRES ACCOUNT VERIFICATION.** Comparing the three charge types against Hills'
actual requirements, using only what Section 1 established:

| Requirement | Direct charges | Destination charges | Separate charges and transfers |
|---|---|---|---|
| Multi-seller single order | Not supported — one charge = one connected account | Not supported — one charge = one connected account | **Supported** — one charge, N transfers |
| Charge amount can differ from what a seller receives (commission) | Only via `application_fee_amount`, one fee per charge | Yes, one fee/transfer split | **Yes, per transfer, independently** |
| HILLS-owned order line (no seller payout) | N/A — charge is already on the seller's account | Would need a zero/partial transfer per line, awkward for one destination | **Trivial — simply create no transfer for that line** |
| Delay transfer until Hills' own settlement decision | N/A | Transfer happens in the same API call as the charge | **Transfer is a separate, later API call — matches `admin_review_payment()`'s existing "decide, then act" shape** |
| Platform (Hills) is liable for refunds/disputes by default | No — connected account is liable | Yes — platform | **Yes — platform** |
| Buyer's statement shows | Connected account | Platform (or account, with `on_behalf_of`) | **Platform (or account, with `on_behalf_of`)** |
| Fits "Stripe must not own internal title/inventory truth" | Requires per-seller card_payments capability before any charge exists | Workable but forces a per-line split decision at charge time | **Best fit — the charge only proves money moved; Hills' own DB decides who gets paid and when** |

**Recommended likely model: separate charges and transfers.** It is the only one of the three that
lets Hills (a) accept one payment for a multi-seller cart, (b) freeze commission per line from the
`order_financials` snapshot Feature 007 already writes, (c) skip a transfer entirely for HILLS-owned
lines, and (d) keep the transfer decision — and therefore the money-release decision — inside the
same "finance operator decides, then the database acts atomically" shape `admin_review_payment()`
already uses. This is a recommendation from documentation alone; it has not been checked against
Hills' actual Stripe account country, connected-account eligibility, or seller countries.

### 4a. Multi-seller order handling (mechanics)

1. Checkout (Feature 007, unchanged) writes `order_financials` with the frozen commission
   percentage/amount and `orders`/`order_items` with each line's seller organization and amount.
2. A single PaymentIntent is created for the buyer's `buyer_total_amount`, tagged with a
   `transfer_group` — **the order id is the natural, already-existing correlation value.**
3. Stripe confirms the PaymentIntent (buyer pays once, for the whole cart).
4. **Only after** Hills' own settlement decision (Section 6), one `Transfer` is created per
   **MEMBER_SELLER** order line, each referencing the same `transfer_group` and a
   `source_transaction` pointing at the original charge, for `seller_net_amount` (line total minus
   the frozen commission) — never the full line amount. HILLS-owned lines get no transfer, exactly
   as `admin_review_payment()` already skips a `payouts` row for them today.
5. The existing `payouts` table already models "one row per order/seller" — a `Transfer` record's
   id/status becomes the provider-evidence field that row is currently missing (Section 9).

### 4b. Payout/transfer model

- One Stripe `Transfer` per `(order, seller_organization)` pair — the same granularity the current
  `payouts` table already uses (`UNIQUE(order_id, seller_organization_id)`).
- A `Transfer` moves funds from the platform's Stripe balance to the connected account's Stripe
  balance. It is **not** the same event as Stripe *paying out* that balance to the seller's bank —
  that is a separate, connected-account-level `Payout`, which the connected account (or its
  payout schedule) controls. **This preserves FR-017's "payout record ≠ actual money release"
  distinction exactly** — a `Transfer` succeeding only proves money moved to the seller's Stripe
  balance, not that it reached their bank.
- Reconciliation: `Transfer.id` and `Transfer.transfer_group` are the fields Hills' DB would store
  for correlation (Section 9); no reconciliation mechanism beyond storing these ids is designed
  here, since reconciliation tooling is a Feature 010 concern.

---

## 5. Likely charge model (creation surface)

**PROVISIONAL.** The PaymentIntent for the buyer's charge would be created **server-side only**
(Edge Function, once one exists), never from the browser/React Native client with authoritative
amount data — consistent with FR-004/FR-005 and the existing `lib/finance/funding.ts` seam's own
"client submits only an identifier" contract, which this preparation does not change.

The client-facing collection UI (Stripe Elements/Payment Element for web, Payment Sheet for React
Native) only collects the payment method and confirms a `client_secret` the backend already
created — it never sees or sets the amount, currency, or `transfer_group`.

---

## 6. `admin_review_payment()` — settlement gate options (business decision required)

Read directly from the live function body (`docs/database/database-schema-report.json`,
`functions[]` entry for `admin_review_payment`), not assumed:

- It is `SECURITY DEFINER`, requires `is_finance_operator()` (platform_admins role
  `FINANCE`/`ADMIN`/`SUPER_ADMIN`, `is_active = true`).
- `p_approved boolean` is **entirely the calling finance operator's own input** — nothing in the
  function today reads `payments.status`, `payments.provider`, `payments.external_reference`, or
  any other field to check whether money actually moved before honoring `p_approved = true`.
- When approved, it atomically: locks the payment + order, requires an `ACTIVE`, unexpired
  reservation, computes commission from the `order_financials` snapshot, transfers inventory
  ownership per item, writes storage allocations, inserts/increments a `payouts` row per
  MEMBER_SELLER line only (HILLS lines produce none — confirmed in Phase 1's own tests), consumes
  the reservation, sets the payment `CONFIRMED`, the proforma `PAID`, and the order `PAID`.
- When rejected, it sets the payment `REJECTED` with `p_reason` and reverts the order to `HOLD`
  **only** from `PAYMENT_PROOF_SUBMITTED`/`PAYMENT_UNDER_REVIEW` — both manual-proof-flow states,
  confirming this function's rejection path is currently shaped around the manual-proof journey,
  not a provider-decline journey.
- It is idempotent only in the narrow sense that a payment already `CONFIRMED` with the order
  already in a paid-family status is a silent no-op.

**This confirms the Phase 1/spec.md "B — reusable only with formally required DB change"
classification precisely: there is no trusted-funding precondition today. `p_approved = true` is
sufficient by itself, with no reference to Stripe at all.**

### Option A — trusted funding + finance approval (human stays in the loop)

Add a DB-enforced precondition: `admin_review_payment()` (or its approved successor) refuses
`p_approved = true` unless the payment row already carries verified, trusted funding evidence (a
new column/state populated only by the Edge Function event boundary from a verified Stripe event —
never by the finance operator's own input). The finance operator's manual decision is preserved as
an additional authorization layer on top of the funding proof, not replaced by it.

- Preserves the current human-review shape and its audit trail (`payment_reviews`).
- Naturally satisfies SRS OPS-01 (dual control for high-risk actions): a trusted-Stripe-event
  precondition plus a human FINANCE decision is two independent checks, not one.
- Smallest DB change: one new precondition and one or two new columns; the existing atomic
  transaction body is otherwise unchanged.

### Option B — trusted funding + automatic settlement (no human step)

A new procedure (or a new, distinctly-named mode of the existing one) settles automatically the
moment a verified Stripe event proves funding, with no finance operator decision at all.

- Removes the human-review step entirely for the primary path — a materially larger governance
  change than Option A.
- Would need its own answer to OPS-01 dual control (a second independent check must exist
  somewhere else, since there is no longer a human decision to pair with the trusted-funding
  check) — not designed here, and not implied by anything in this document.
- Faster buyer-facing settlement, at the cost of removing the reviewer who currently catches a
  wrong reservation, wrong order, or fraud signal before title moves.

**This document does not choose between A and B.** That is an explicit Business/Finance/Operations
decision (who is accountable for a wrongly-settled trade, and whether OPS-01's dual-control intent
is satisfied by "trusted event + human" or needs a different second check for automatic
settlement). Whichever is chosen, T009's actual database design still needs formal approval before
any migration is authored — this section only frames the two shapes the approval will choose between.

---

## 7. Provider object correlation (draft)

Using the fields `payments`/`payment_events` already have, plus what Section 4a's flow needs:

| Concept | Current field | Sufficient today? |
|---|---|---|
| The order/payment this charge belongs to | `payments.correlation_id`, `payments.order_id` | Yes — reused, not duplicated |
| The Stripe PaymentIntent/Charge id | `payments.external_reference` | Usable as-is for a single top-level reference; see Section 9 for whether a dedicated `provider_object_id` is worth splitting out |
| Which provider | `payments.provider` | Yes — already schema-valid, currently always `null` |
| Outbound API idempotency (creating the PaymentIntent, creating each Transfer) | `payments.idempotency_key` | Only one key per payment row — **insufficient once a payment can produce N transfers** (Section 9) |
| Inbound event de-duplication | `payment_events(provider, external_event_id)` unique constraint | Structurally present, but both columns are nullable — see Section 9 |
| Per-seller transfer correlation | *(none yet)* | **Missing** — see Section 9 |

---

## 8. Event/webhook requirements

**Likely required: yes**, per Stripe's own async-payment guidance (Section 1) — a PaymentIntent's
final success/failure is not guaranteed to be known synchronously at the moment the client confirms
it, so a durable server-side signal is the only trustworthy source of "funding actually happened."

**PENDING ACCOUNT/FLOW VERIFICATION** for the exact final list, but the likely categories, kept
deliberately short rather than over-listed:

- A PaymentIntent success/failure signal (the trusted-funding evidence Option A/B's gate reads).
- A Transfer-related signal, if Hills needs to know a transfer failed after being created (for
  example, a connected account rejected/restricted after the transfer was issued).
- A connected-account status signal, if v2/controller-properties accounts are used (so Hills knows
  a seller's account stopped being payout-eligible) — **only relevant if Section 4's connected-
  account model is confirmed; not committed to here.**

Not decided here: exact event type names, snapshot vs thin events, or whether Connect "Your
account" scope alone is sufficient (likely, since separate charges and transfers are platform-
account resources per Section 1) or whether "Connected accounts" scope is also needed (likely only
if v2 connected-account lifecycle events are required) — the real account/dashboard determines this.

### Later Edge Function responsibility (documented now, not built now)

- Signature verification using the raw body + `Stripe-Signature` header + `whsec_...` secret.
- Deduplicate on `event.id`, never on `created` (timestamps can collide) — persisted, not
  in-memory, so a retried delivery after a cold start still dedupes correctly.
- Duplicate delivery and retries are both expected and must be safely absorbed, not treated as
  errors.
- No assumption of event ordering — re-fetch the referenced object from the Stripe API when the
  handler's logic depends on current state rather than trusting the event payload alone.
- Never trust a client-side redirect/return-URL as proof of anything; only a verified server-side
  event (or an authenticated re-fetch of the object by id) may write funding evidence.
- Never log the raw event payload (may carry buyer/seller PII and payment details) — mirrors the
  constitution's existing "never log sensitive financial data" rule and Phase 1's own
  `payment_events.payload`-never-exposed decision.

---

## 9. Database change draft (design only — no migration, no SQL applied)

**PROVISIONAL where it depends on Section 4/6's unresolved choices; otherwise a safety-contract-level
draft that does not itself require account-specific facts.**

### `payments` — likely additions

| Column (draft name) | Type | Purpose |
|---|---|---|
| `trusted_funding_confirmed_at` | `timestamptz`, nullable | Set only by the Edge Function boundary after verifying a Stripe event proves funding. Never set by client code, never set by the finance operator's own review input. This is the literal "trusted-funding evidence" Option A/B's gate reads. |
| `trusted_funding_event_id` | `uuid`, nullable, FK → `payment_events.id` | Which specific verified event established funding — an audit pointer, not a duplicate of the event data. |

`provider`, `external_reference`, `correlation_id` are reused as-is (Section 7). `idempotency_key`
is reused for the PaymentIntent-creation request only (Section 4a step 2); it cannot also serve
each Transfer, since one payment can now produce several transfers (Section 4a step 4) — see the
new `payment_transfers` table below rather than overloading this single column.

**No repurposing of `PROOF_SUBMITTED`/`UNDER_REVIEW`/`REJECTED`** — those keep their current
manual-proof meaning exactly as spec.md requires. `trusted_funding_confirmed_at` is additive and
orthogonal to `payments.status`; it does not replace or alias any existing status value.

### `payment_events` — likely additions

| Column (draft name) | Type | Purpose |
|---|---|---|
| *(none new — existing columns are structurally sufficient)* | — | `provider`, `external_event_id`, `event_type`, `payload`, `correlation_id` already exist. |

The real gap is **not a missing column, it's an optional constraint**: `provider`/`external_event_id`
are currently nullable, so the existing `UNIQUE(provider, external_event_id)` cannot reject a
duplicate delivery on its own if either value is ever left null. The design requirement is: **the
Edge Function boundary must always populate both fields for a real Stripe event** (an application-
level discipline, not a schema change) so the existing unique constraint actually does its job;
whether to additionally make the columns `NOT NULL` for provider-sourced rows is a decision for
whoever authors the real migration, informed by whether any other write path still needs a null
event id.

### New table (draft): `payment_transfers` (one row per Stripe Transfer, i.e. per seller per order)

| Column (draft name) | Type | Purpose |
|---|---|---|
| `id` | `uuid`, PK | — |
| `payment_id` | `uuid`, FK → `payments.id` | Which buyer charge funded this transfer |
| `payout_id` | `uuid`, FK → `payouts.id`, unique | One-to-one with the existing `payouts` row it provides provider-evidence for |
| `provider_transfer_id` | `text` | Stripe `Transfer.id` |
| `transfer_group` | `text` | Stripe `transfer_group` (order id) — redundant with `payments.correlation_id` but kept as the literal Stripe-side value for support/reconciliation lookups |
| `idempotency_key` | `text` | The outbound API idempotency key used when creating this specific Transfer (distinct per seller, unlike `payments.idempotency_key`) |
| `created_at` | `timestamptz` | — |

This is the "payout/transfer correlation" and "outbound API idempotency" gap Section 7 flagged.
It is deliberately a **new, additive table** — it does not touch `payouts`' existing columns or
its `UNIQUE(order_id, seller_organization_id)` constraint, and it does not change what `payouts`
means today (an accounting record, not proof of money movement — FR-017 is unaffected).

### Settlement-eligibility gate

Whichever of Option A/B (Section 6) is chosen, its gate reads `payments.trusted_funding_confirmed_at
IS NOT NULL` (plus, for Option A, the existing `is_finance_operator()` human check; Option B would
need its own second independent check per OPS-01, not designed here). No other new state
vocabulary is introduced.

### Failure/cancel state

A Stripe PaymentIntent that fails or is canceled produces **no** `trusted_funding_confirmed_at`
value — the payment simply never becomes settlement-eligible. This document does not invent a new
terminal `payments.status` value for a provider failure; whether the existing `EXPIRED`/`VOID`
vocabulary is reused, or a new value is formally proposed, is left to the real migration design,
consistent with "no state overloading" (FR-015/SEC-005) and the instruction not to repurpose the
proof-flow statuses.

### Rollback / testing plan (draft)

- Every addition above is strictly additive (new nullable columns, one new table) — a rollback is
  `DROP TABLE payment_transfers` and drop the two new `payments` columns; no existing row, column,
  or constraint is altered, so rollback carries no data-loss risk to `payments`/`payment_events`/
  `payouts`.
- Test plan (for whoever authors the real migration): RLS review for the new table (mirrors
  `payouts`' current policy shape — seller org read-only, finance/admin full), a negative test that
  `trusted_funding_confirmed_at` cannot be set by any RLS-reachable client write path (it must only
  ever be written by the Edge Function's own service-context write, never by an `authenticated`-role
  grant), and the existing Phase 1 snapshot-fidelity tests re-run unchanged to prove nothing about
  `order_financials`/commission history moved.

---

## 10. RLS gap design (from Phase 1's documented finding)

Phase 1 found: `proforma_invoices`, `proforma_invoice_items`, and `tax_invoices`/`payouts` (the
latter two already grant FINANCE `ALL`) have **no independent AUDITOR SELECT policy**, and
`proforma_invoices`/`proforma_invoice_items` have **no independent FINANCE SELECT policy either**
(only `can_view_order` — buyer/seller/platform-admin). No DB change is made here; this is the
design for whoever authors the real migration.

| Table | New policy (draft name) | `USING` expression | Mirrors |
|---|---|---|---|
| `proforma_invoices` | `proforma_finance_read` | `is_finance_operator() OR is_auditor()` | `payments_finance_read` / `financials_finance_read` |
| `proforma_invoice_items` | `proforma_items_finance_read` | `EXISTS (SELECT 1 FROM proforma_invoices pi WHERE pi.id = proforma_invoice_items.proforma_id AND (is_finance_operator() OR is_auditor()))` | The existing `proforma_items_view`'s own subquery shape |
| `tax_invoices` | `tax_invoice_auditor_read` | `is_auditor()` | (FINANCE already has `tax_invoice_finance`, `ALL`) |
| `payouts` | `payouts_auditor_read` | `is_auditor()` | (FINANCE already has `payouts_finance`, `ALL`) |

- **Intended FINANCE access**: read (SELECT) on all four — proformas are currently the only one
  FINANCE cannot read at all; the other three already grant FINANCE `ALL`.
- **Intended AUDITOR access**: read (SELECT) on all four — currently zero.
- **Seller/member access preservation**: every new policy is **additive** (`PERMISSIVE`, the
  project's existing convention) — the existing `can_view_order`/`is_org_member` buyer/seller
  policies are untouched, so a member's own access is identical before and after.
- **Negative cases preserved**: cross-organization members and anonymous callers are unaffected —
  none of the four new policies name `public`/`anon`, matching every existing finance-table policy.
- **Rollback**: `DROP POLICY` for each of the four — no data change, fully reversible.
- **Test plan**: extend `tests/finance/rls-policy.test.ts`'s existing static assertions (it already
  documents the CURRENT absence of these policies — those specific assertions would need to flip
  once the migration lands) plus a **live** proof once the FINANCE/AUDITOR fixtures in Section 11
  exist, following the exact own-org/cross-org/anonymous pattern `tests/finance/read.test.ts`
  already established for `payments`/`order_financials`/`proforma_invoices`.
- **Not invented**: no access path beyond SELECT is added for either role on any of the four
  tables, since neither spec.md nor the SRS authorizes a FINANCE/AUDITOR write path here — Feature
  010 owns any future finance write/decision UI.

---

## 11. Finance/Auditor fixture strategy (for Phase 3/6, not created now)

Current state (verified directly in `scripts/seed-test-fixtures.ts`): the fixture type is
`platformAdminRole: "WAREHOUSE" | null` — only one privileged non-buyer/seller fixture
(`FOUNDATION_FIXTURES.warehouseAdmin`) exists today. No `FINANCE` or `AUDITOR` row exists in the
shared seed script, confirming Phase 1's own documented gap.

**Design for a future run** (does not touch the seed script in this run):

1. Widen the fixture type to `platformAdminRole: "WAREHOUSE" | "FINANCE" | "AUDITOR" | null`.
2. Add two new fixture entries under `FOUNDATION_FIXTURES` — `financeOperator` and `auditor` —
   following the **exact same pattern** `warehouseAdmin` already establishes: a test-only Supabase
   Auth user (not a real person), a `platform_admins` upsert with the target `role` and
   `is_active: true`, created/torn down by the same `resetCheckoutFixtures`/teardown lifecycle
   every other fixture already uses.
3. Deliberately seed a **pure** FINANCE fixture (role `FINANCE`, not `ADMIN`/`SUPER_ADMIN`) and a
   **pure** AUDITOR fixture, because `is_finance_operator()`/`is_auditor()` both also accept
   `ADMIN`/`SUPER_ADMIN` (Section 6) — only a pure-role fixture actually proves the RLS gap in
   Section 10 is closed, rather than accidentally passing because an admin-role fixture would have
   passed anyway.
4. No permanent real user is created — this is the same disposable, test-database-only credential
   model every existing fixture already uses; nothing here introduces a new kind of account.
5. Out of this run's scope per "TEST FIXTURE DISCIPLINE" (a change to the shared, privileged seed
   script), and correctly so — it belongs with whichever run actually implements the Section 10
   RLS migration and needs to prove it live.

---

## 12. Secret/environment contract (names and classes only — no values)

No secret is requested, displayed, or assumed to exist anywhere in this document or in the
repository as a result of it.

| Variable (draft name) | Class | Where it may live | Never |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Server/Edge secret | Supabase Edge Function environment only | `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, any client bundle, any committed file |
| `STRIPE_WEBHOOK_SECRET` | Server/Edge secret (per endpoint, `whsec_...`) | Supabase Edge Function environment only | Anywhere a client can read it; anywhere logged |
| `STRIPE_PUBLISHABLE_KEY` | Client-safe value (**only if** the selected flow uses Stripe Elements/Payment Element/Payment Sheet client-side, which the likely model in Section 4/5 does) | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (web) / an Expo-safe equivalent (mobile) — genuinely publishable, by Stripe's own design, so this is the one value this table permits under a `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` name | Ever treated as if it were secret; never a substitute for the secret key server-side |

No value for any of the above is requested, stored, or displayed by this document. Non-production
(test-mode) credentials remain a Phase 2B/T010 provisioning step — **T010 stays unchecked until
that actually happens** (Section 16).

---

## 13. Production blockers (unchanged, restated for continuity)

Everything spec.md's "Open items and classifications" table already lists remains exactly as
before — this document resolves none of them, only prepares for them:

- Provider selection is now **directionally Stripe**, but legal/banking/account approval is not
  yet real (Section 15).
- The trusted-funding DB gate (Section 6/9) requires formal approval before any migration.
- `COMMISSION-OPEN-01` (0% fallback vs. fail-closed) is untouched.
- Refunds/chargebacks, dual control's final shape (Section 6), and payout-release evidence remain
  Business/Finance/Legal decisions.

---

## 14. Account checklist for the user

Non-secret information only. **Never share an API key, webhook signing secret, or the Supabase
service-role key with anyone, in this document, in chat, or in a screenshot.**

- [ ] Stripe account country (as shown on the account's own settings page)
- [ ] Business/legal entity country
- [ ] Is a Stripe **test mode** (sandbox) available for this account right now?
- [ ] Is **Connect** enabled on this account?
- [ ] Does the account's [platform profile](https://dashboard.stripe.com/settings/connect/platform-setup) show platform/marketplace settings (this page also carries Stripe's own charge-type recommendation for the account, worth screenshotting)?
- [ ] Which connected-account configuration options are visible — v2/controller-properties, or only
      the legacy Standard/Express/Custom picker?
- [ ] What settlement currency(ies) does the platform account support?
- [ ] What seller countries does Hills actually need to onboard (this determines connected-account
      eligibility and cross-border rules)?
- [ ] Has an account type/model already been selected in the Dashboard, or is it still unset?
- [ ] Screenshot of the Connect settings/capabilities page, and of the platform-profile
      recommendation page referenced above.

---

## 15. Exact account/screenshots/settings needed later

Same list as Section 14 — repeated here per the run's own requested document outline; see Section
14 for the checklist itself to avoid duplication drift.

---

## 16. T007–T010 status and evidence

| Task | Status | Evidence |
|---|---|---|
| **T007** | **PARTIAL** — not `[x]` | Provider is now directionally Stripe (user instruction), and Section 4 records a provisional recommended charge/Connect model. Legal/banking approval, supported countries/currencies, and payout/release responsibility remain **ACCOUNT-VERIFICATION-REQUIRED** (Section 14) — the literal task ("record the formally selected... legal/banking approval...") is not satisfiable without them. |
| **T008** | **DESIGN-PREPARED, not `[x]`** | Section 8 records the likely event categories and the later Edge Function's responsibilities, explicitly marked "PENDING ACCOUNT/FLOW VERIFICATION" for the exact final event list, per the run's own instruction not to over-list or finalize. |
| **T009** | **NOT `[x]`** | Section 9's draft is safety-contract-complete at the schema-shape level (additive columns/table, no state overloading, rollback plan) and does not itself require account facts — **but it is a draft, not an approved design.** Section 6 leaves an explicit unresolved Business/Ops decision (Option A vs B) that the approved design must resolve first, and the run's own instruction is "do NOT choose silently." A draft awaiting a business decision and a human database/security approval is not the same as an approved design, so this task stays unchecked rather than being marked complete on my own authority. |
| **T010** | **NOT `[x]`** | No credential of any kind was provisioned, requested, or displayed. Stays unchecked per explicit instruction until real non-production credentials exist. |

No task wording was changed to manufacture completion. `6/39` is unchanged by this run.

---

## Sources

- [Understand how charges work in a Connect integration](https://docs.stripe.com/connect/charges)
- [Create direct charges](https://docs.stripe.com/connect/direct-charges)
- [Create destination charges](https://docs.stripe.com/connect/destination-charges)
- [Create separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Recommended Connect integrations and charge types](https://docs.stripe.com/connect/integration-recommendations)
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Receive Stripe events in your webhook endpoint](https://docs.stripe.com/webhooks)
- [Connect webhooks](https://docs.stripe.com/connect/webhooks)
- [Connected account types](https://docs.stripe.com/connect/accounts)
- [Migrate to controller properties](https://docs.stripe.com/connect/migrate-to-controller-properties)
- [Stripe React Native SDK](https://docs.stripe.com/sdks/react-native)

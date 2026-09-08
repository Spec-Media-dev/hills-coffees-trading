# Feature Specification: Payments, Settlement, Invoices & Payouts

**Feature Directory**: `specs/008-payments-settlement-invoices-payouts`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surfaces**: Member Portal (`/dashboard/payments`, `/dashboard/documents`,
`/dashboard/payouts`) + the finance domain layer consumed by 010's Finance console
**Depends on**: 001, 003, 004, 005, 006, 007

## Purpose

Complete the commercial cycle for the approved MVP finance model: **manual bank transfer** →
**buyer submits payment proof** → **finance reviews** → on approval the database performs
**settlement and title transfer atomically** → seller payout is raised and invoices/proformas are
available.

Title transfer happens **only** inside `admin_review_payment(payment_id, true, reason)` — never at
checkout, never on proof upload, never because a payment "looks" received (SRS MKT-04, AC-03,
Appendix D #5). This feature calls that function correctly and presents its results; it implements
no settlement logic of its own.

## Scope

### In scope

- Bank-transfer payment instructions presented to the buyer for a held order.
- Payment proof submission via `submit_payment_proof()` (subject to DB-BLOCK-01 for the file itself).
- Payment status presentation across the approved vocabulary.
- The finance decision **domain layer** (`admin_review_payment` caller, guards, error mapping) that
  010's console screens consume.
- Settlement outcome presentation for buyer and seller: title transferred, custody created, listing
  filled, payout raised.
- Proforma and tax invoice presentation to permitted parties.
- Seller payout visibility (status, amount, reference).
- Commission presentation from the snapshot taken at checkout.
- Retry-safe / idempotent finance operations.

### Out of scope

- The Finance console **screens** (queue, worklist, decision UI) — 010, built on this feature's layer.
- Automated payment provider / gateway / escrow integration — explicitly excluded from MVP unless a
  later approved requirement changes the payment strategy.
- Order creation, checkout, reservation — 007.
- Delivery — 009.
- Refunds/chargebacks mechanics beyond what the approved schema represents (see Open items).

## Actors

| Actor | Interest |
|---|---|
| **Buyer member** | See what is owed, how to pay, submit proof, know when settlement completed. |
| **Seller member** | See payout raised after settlement of their listing's sale. |
| **Finance operator** | Review proof, confirm or reject payment — the only role that can settle. |
| **Auditor** | Read payments, reviews, financials and payout evidence. |

## Business journeys owned

Buyer flow: **Manual bank-transfer payment → Payment proof → Finance review → Settlement → Title
transfer** (then hands to 005 for custody display and 009 for delivery).
Seller flow: **payment → settlement → title transfer → seller payout → listing fill update**.

## Prioritized stories

### PS1 — Buyer sees what to pay and how (P1)

For an order on hold, the buyer sees the exact amount due, currency, reference and the approved bank
transfer instructions.

**Why P1**: without it the buyer cannot complete the MVP payment path.
**Independent test**: with a held order, confirm the amount matches `order_financials.buyer_total_amount`
exactly and the payment reference/instructions render from approved configuration.

**Acceptance scenarios**

1. Given a held order, when the buyer opens payment, then amount, currency and order/proforma
   reference render exactly as snapshotted — no recomputation.
2. Given the hold's remaining time, when displayed, then the buyer sees the deadline from
   `orders.hold_expires_at`.
3. Given no approved payment account configured, when the page renders, then it states that clearly
   rather than showing blank or invented bank details.

### PS2 — Buyer submits payment proof (P1)

The buyer submits proof of the transfer with a reference, moving the payment into the review path.

**Why P1**: it is the trigger for the entire settlement sequence.
**Independent test**: call `submit_payment_proof()` for a held order and confirm the payment/order
states advance and the proof record links to the payment.

> **Constrained by DB-BLOCK-01**: the proof *file* has nowhere to be stored (no Storage bucket).
> Reference-text submission can work; file attachment cannot until a bucket is approved.

**Acceptance scenarios**

1. Given a held order, when proof is submitted, then `submit_payment_proof()` is called and the
   payment/order enter the proof-submitted state.
2. Given an expired hold, when proof submission is attempted, then it is refused.
3. Given a duplicate submission, when it occurs, then no duplicate commercial effect results.
4. Given a user from another organization, when they attempt submission for the order, then it is
   refused server-side.

### PS3 — Finance confirms or rejects, and settlement happens atomically (P1)

A finance operator reviews the proof and decides. On approval the database transfers title, creates
buyer custody, updates the listing, raises the seller payout, consumes the reservation, confirms the
payment, marks the proforma paid and moves the order to `PAID` — all in one transaction.

**Why P1**: this is the platform's second release-blocking transactional operation (AC-03).
**Independent test**: call the decision layer as a finance fixture with approval and verify every
one of those effects occurred exactly once; call it as a non-finance fixture and verify refusal.

**Acceptance scenarios**

1. Given a non-finance user (member, warehouse, compliance, auditor), when they attempt a payment
   decision, then it is refused — the database function itself refuses.
2. Given approval on a payment whose reservation has expired, when attempted, then it fails and no
   title moves.
3. Given approval succeeds, when the database is inspected, then exactly one ownership event per
   order item exists, buyer custody exists, the listing's fill state advanced, the reservation is
   `CONSUMED`, the payment is `CONFIRMED`, the proforma is `PAID` and the order is `PAID`.
4. Given rejection, when it completes, then the payment is `REJECTED`, the order returns to `HOLD`,
   and no title moved.
5. Given the same decision submitted twice, when processed, then no duplicate settlement, ownership
   event or payout results.

### PS4 — Settlement outcome is visible to both sides (P2)

After settlement the buyer sees title/custody and the seller sees the payout and updated listing.

**Why P2**: the value of settlement is only realised when both parties can see it.
**Independent test**: after a settled order, confirm the buyer's inventory/custody (005) and the
seller's payout and listing fill (006) all reflect it.

**Acceptance scenarios**

1. Given settlement, when the buyer views inventory, then the new position/custody appears with the
   correct quantity and warehouse.
2. Given settlement of a member-seller listing, when the seller views payouts, then a payout exists
   with amount, currency and status.
3. Given settlement, when either party views the order, then status `PAID` and the ownership event
   correlation ID are visible.

### PS5 — Invoices and proformas are available (P2)

Permitted parties can see the proforma issued at checkout and any tax invoice uploaded by finance.

**Why P2**: needed for real commerce, but downstream of settlement.
**Independent test**: confirm the proforma renders for a permitted party and is unreachable for
others; confirm a tax invoice record renders when present.

**Acceptance scenarios**

1. Given a proforma, when a permitted party views it, then its code, items, totals and status render.
2. Given a party without `can_view_order`, when they request it, then nothing is returned.
3. Given a tax invoice record, when present, then it renders with its number and issue date.

### PS6 — Seller payouts are tracked (P3)

A seller sees payout status progression (`PENDING_PAYOUT` → `PROCESSING` → `PAID`, or `VOID`).

**Why P3**: important for sellers but not required for the first end-to-end pass.
**Independent test**: seed payouts in each state and confirm labels and amounts.

**Acceptance scenarios**

1. Given payouts in each approved status, when displayed, then exact labels and amounts render.
2. Given a payout, when displayed, then only the owning seller organization can see it.

## Functional Requirements

- **FR-001**: Settlement and title transfer MUST be performed **only** by calling
  `admin_review_payment(p_payment_id, p_approved, p_reason)`. The application MUST NOT create
  ownership events, adjust inventory positions, create storage allocations, create payouts, mark
  reservations consumed, or set order/payment/proforma states itself.
- **FR-002**: Payment proof submission MUST be performed **only** by calling
  `submit_payment_proof(p_order_id, p_file_asset_id, p_reference)`.
- **FR-003**: The payment decision layer MUST verify `is_finance_operator()` server-side before
  calling the function — and MUST rely on the function's own refusal as the authoritative guard.
- **FR-004**: Amounts due MUST be read from `order_financials` as snapshotted; the application MUST
  NOT recompute totals, commission or tax anywhere.
- **FR-005**: Bank-transfer instructions MUST come from approved configuration
  (`payment_accounts`); the application MUST NOT hardcode or invent bank details, and MUST state
  clearly when none is configured.
- **FR-006**: Finance decisions MUST be idempotent per payment: a repeated decision MUST NOT produce
  a second settlement, ownership event, payout or state change.
- **FR-007**: Every payment status MUST render the approved vocabulary (`PENDING`, `PROOF_SUBMITTED`,
  `UNDER_REVIEW`, `CONFIRMED`, `REJECTED`, `EXPIRED`, `VOID`); payouts likewise
  (`PENDING_PAYOUT`, `PROCESSING`, `PAID`, `VOID`).
- **FR-008**: Payment, proof, invoice and payout reads MUST be scoped by `can_view_order` /
  organization membership / finance-auditor policies; no cross-organization visibility.
- **FR-009**: Payment proof file handling MUST create `file_assets` records with private
  classification. **Because no Storage bucket exists (DB-BLOCK-01), file bytes MUST NOT be stored
  through any improvised path**; reference-text-only submission is the implementable boundary.
- **FR-010**: No payment, settlement, invoice or payout data MUST be placed in any shared cache.
- **FR-011**: The application MUST NOT introduce any automated payment provider, gateway, escrow or
  webhook handler in MVP; if one is later approved, SRS API-02 (signature verification, replay
  rejection, provider event IDs, dead-letter handling) applies.
- **FR-012**: Database exceptions from the finance functions MUST be mapped to safe application
  errors; no raw text (`forbidden`, `active_reservation_missing`, `reservation_expired`) reaches a
  client.
- **FR-013**: The finance domain layer MUST be reusable by 010's console without duplicating guards
  or error mapping.
- **FR-014**: All member payment routes MUST live under `/dashboard`, register with 004's contract,
  and be non-indexable.
- **FR-015**: Screens MUST provide loading, empty, error, unauthorized, suspended, expired, pending,
  rejected and settled states.
- **FR-016**: Copy externalised; layouts RTL-safe; money always with currency; codes monospaced.
- **FR-017**: **Commission is read from the checkout snapshot, never recalculated.** Every displayed
  or derived commission value MUST come from `order_financials`
  (`commission_policy_id`, `commission_percentage_snapshot`, `commission_amount`,
  `seller_net_amount`, `total_quantity_kg`). This feature MUST NOT read
  `commission_policies`/`commission_tiers` to compute, re-derive, or "verify" a historical order's
  commission, and MUST NOT expose any action that recalculates a historical order.
  Behavioural reference: `docs/database/commission-capability.md`.
- **FR-018**: **Historical commission immutability MUST hold across configuration changes.** A later
  commission policy/tier edit (by SUPER_ADMIN via 010) MUST affect only eligible future checkouts;
  it MUST NOT change previous `order_financials`, historical commission amounts, previous seller net
  amounts, or existing `payouts`. This feature's reads and tests MUST demonstrate that property
  rather than assume it.
- **FR-019**: Seller payout amounts MUST be understood and presented as derived by
  `admin_review_payment()` from `commission_percentage_snapshot` (line base − line commission,
  accumulated per `(order_id, seller_organization_id)`), with `HILLS`-sourced lines producing no
  payout. The application MUST NOT compute an alternative payout figure for display.

## Security Requirements

- **SEC-001**: Only `is_finance_operator()` may reach the decision path — verified by negative tests
  for member, warehouse, compliance and auditor roles.
- **SEC-002**: A buyer MUST NOT be able to submit proof for another organization's order.
- **SEC-003**: No service-role usage anywhere in this feature, including for file handling.
- **SEC-004**: No payment reference, bank detail, proof content or financial figure may appear in
  logs, analytics, error messages or client bundles beyond what the viewer is entitled to see.
- **SEC-005**: Payment/settlement data MUST never appear on any public surface.
- **SEC-006**: Bank-detail changes are a high-risk operation (SRS OPS-01, §13.5) — this feature MUST
  NOT provide any member-facing path to change payment account details.

## Edge Cases

- Proof submitted seconds before hold expiry, reviewed after → the function refuses settlement
  because the reservation expired; the outcome must be explained clearly to both parties.
- Finance approves twice (double-click, two operators) → exactly one settlement; the second is a
  no-op or a safe refusal.
- Finance rejects, buyer resubmits proof → order returns to `HOLD` and a new proof cycle is possible
  while the hold is still valid.
- Payment confirmed for an order whose listing was suspended meanwhile → the function's own
  validation governs; the application must not pre-empt or override it.
- Seller is a Hills-internal organization → no member payout is raised (seller type drives it).
- Multiple order items across different sellers → one payout per member seller, as the function
  produces them.
- Proforma exists but tax invoice does not → the UI shows what exists and does not imply a missing
  document is an error.
- Currency mismatch between order and payout → both display their own stored currency; no conversion
  is invented.

## Success Criteria

- **SC-001**: 100% of title transfers, custody creations, payouts and settlement state changes
  originate from `admin_review_payment()`; zero from application code.
- **SC-002**: A non-finance actor can never settle a payment, in 100% of attempts including direct
  invocation (AC-03).
- **SC-003**: A repeated finance decision produces exactly one settlement, one set of ownership
  events and one payout, verified by an automated idempotency test.
- **SC-004**: No title transfer ever occurs while a payment is pending or a reservation has expired,
  verified by automated tests (AC-03).
- **SC-005**: Displayed amounts always equal `order_financials` snapshots exactly.
- **SC-006**: No payment/settlement/payout data is readable across organizations.
- **SC-007**: No raw database exception text reaches a client.
- **SC-008**: No payment file bytes are stored anywhere until an approved Storage bucket exists.
- **SC-009**: Commission tier selection is proven correct at band boundaries (inclusive minimum,
  exclusive maximum) and for an open-ended top band, using the total order quantity — never
  progressive/marginal banding.
- **SC-010**: After a commission policy/tier change made *after* an order's checkout, that order's
  `order_financials` snapshot, commission amount, seller net amount and payout are byte-for-byte
  unchanged, verified by an automated test.

## Assumptions

- MVP settlement is **manual confirmation by a finance operator** (SRS §12, §16) — no gateway.
- `payment_accounts` is populated by administrators (010); this feature only reads it.
- Commission and tax were snapshotted at checkout by `checkout_order()`; this feature displays them.
  The commission capability is **implemented in the database** and fully described in
  `docs/database/commission-capability.md`: tier selection is by **total order quantity**
  (inclusive minimum, exclusive maximum, NULL maximum = open-ended), against an `ACTIVE` policy
  whose effective period contains the checkout time; the commission base is `base_subtotal`
  (shipping and VAT excluded); and `admin_review_payment()` derives member-seller payouts from the
  snapshotted percentage without re-reading current tiers.
- Payout execution (actually moving money) happens off-platform; the platform tracks status.

## Open items / blockers

- **DB-BLOCK-01 (blocks PS2 file attachment/FR-009)**: no Storage bucket for private payment proof
  documents. Reference-text submission is the implementable boundary until a bucket plus private
  access policies are approved and audited.
- **Refunds/chargebacks**: SRS §18 lists refund and chargeback rules as a Sprint 0 finance/legal
  decision. The approved schema has `VOID` states but no refund workflow. No refund mechanics may be
  invented — record the decision dependency.
- **Dual control (OPS-01)**: maker-checker for manual settlement is described as configurable in the
  SRS, but the approved schema records a single `reviewer_user_id` per payment review. Whether dual
  control is required for settlement needs a business decision before 010 builds the console.
- **Payout execution evidence**: `payouts.payment_reference` exists, but who sets it and with what
  evidence is an operational decision for finance.
- **COMMISSION-OPEN-01 (Business/Finance decision — owned here, blocks production trading, not
  implementation)**: `checkout_order()` initialises the commission rate to zero and coalesces to
  zero when no ACTIVE, in-force policy has a tier band covering the order's total quantity, so the
  current effective fallback may be **0%** — checkout succeeds and the member seller is paid the
  full base. The schema does not enforce gapless tier coverage, so a configuration gap produces this
  silently. For MEMBER_SELLER checkout the business must decide: **(A)** explicitly allow 0%
  commission when no tier matches, or **(B)** fail closed with a commission-configuration error.
  **This feature does not choose, and no database change is proposed.** Option (B) would require the
  Constitution's database-change process. Recorded in
  `docs/architecture/DATABASE-CAPABILITY-MAP.md` §9 and `docs/database/commission-capability.md` §8.

## Dependencies

| Depends on | Why |
|---|---|
| 007 | Produces the held order, reservation and pending payment this feature acts on |
| 005 | Displays the custody/positions settlement creates |
| 006 | Listing fill state advanced by settlement |
| 010 | Builds the Finance console on this feature's domain layer |
| 012 | Disputes can freeze settlement-affected quantities |

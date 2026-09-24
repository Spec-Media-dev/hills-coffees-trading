# Feature Specification: Bank Transfer Commerce Core

**Feature Branch**: `[013-bank-transfer-commerce-core]`

**Created**: 2026-09-24

**Status**: Draft

**Input**: Create the complete provider-independent Hills Coffees commerce lifecycle, superseding the unfinished Stripe direction in Feature 008 while preserving all applied historical migrations and evidence.

## Purpose and Scope

This feature completes the private member-commerce lifecycle for physical green coffee using ordinary bank transfer. It preserves the existing marketplace, order, reservation, inventory, shipment, finance, audit, catalogue, media, localization, and admin foundations and replaces only the unfinished Stripe runtime direction.

The in-scope lifecycle is:

**Marketplace → Cart → Delivery Destination → Checkout → Proforma → Buyer Confirmation → 20-minute Quantity Reservation → Bank Transfer Instructions → Private Payment Proof → Admin Finance Review → Payment Confirmation → Final Tax Invoice → Seller/Warehouse Fulfillment → Completion → Manual Seller Payout**

Out of scope are card payments, payment gateways, automated bank transfers, automated seller payouts, normal post-payment customer returns/refunds, public marketplace pricing, non-USD settlement in the first release, Firebase configuration, and destructive rewriting of historical Feature 008 artifacts.

## Clarifications

### Session 2026-09-24

- Q: How long may an issued proforma remain confirmable before the buyer starts the 20-minute reservation? → A: Admin-configured validity, initially 24 hours; the expiry is frozen when issued.
- Q: In a multi-seller order, which quantity selects a seller's commission tier? → A: Each member seller's own qualifying quantity within the order; whole-order quantity across unrelated sellers is never used.
- Q: May scheduled database jobs drive expiry sweeps, scheduled notifications, and campaigns? → A: Yes, through Supabase scheduled jobs, but correctness never depends solely on the scheduler: expired reservations are treated as expired from authoritative timestamps in every read, write, and transaction check.
- Q: Which promotion types exist in the first release, and who funds them? → A: Percentage and fixed-per-kg discounts. Platform/administrator promotions are Hills-funded and reduce Hills' economics, never a member seller's net; seller promotions are seller-funded and reduce that seller's economics. Funding source and applied discount are snapshotted; no promotion may create negative seller or Hills economics — invalid configurations are rejected and quote-time excess is capped.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buyer commits to a bank-transfer order (Priority: P1)

An approved buying member selects quantities from one or more eligible sellers, maintains a cart without reserving stock, selects a saved delivery destination, reviews a frozen commercial proforma, and explicitly confirms the order to start a 20-minute quantity reservation.

**Why this priority**: This is the commercial commitment boundary and the prerequisite for every payment, fulfillment, and payout outcome.

**Independent Test**: An approved buyer can build a mixed-seller cart, issue a proforma without changing reserved stock, confirm it, and observe exactly the purchased quantities reserved for 20 minutes.

**Acceptance Scenarios**:

1. **Given** an approved buyer and eligible visible listings, **when** quantities are added to a cart, **then** no listing or inventory reservation changes.
2. **Given** a cart without a valid saved destination, **when** checkout is requested, **then** checkout is blocked and the buyer is directed to provide a destination.
3. **Given** a valid cart and destination, **when** checkout issues a proforma, **then** all commercial terms are frozen and inventory remains unreserved.
4. **Given** an issued proforma with available stock, **when** the buyer explicitly confirms it, **then** the purchased quantities are reserved atomically for 20 minutes and remaining quantities stay sellable.
5. **Given** concurrent buyers requesting more stock than remains, **when** they confirm, **then** no combination of confirmations can reserve more than the available quantity.
6. **Given** a proforma whose frozen validity deadline has passed, **when** the buyer attempts confirmation, **then** no quantity is reserved and a replacement proforma using current terms is required.

---

### User Story 2 - Buyer submits bank-transfer proof (Priority: P1)

The buyer receives the correct bank instructions for the confirmed proforma, transfers funds outside the platform, and uploads private proof before the reservation expires.

**Why this priority**: Payment evidence is the only normal route from a reservation to finance review.

**Independent Test**: A buyer with an active reservation can view only the account assigned to that order, upload valid proof, and move the order to review without exposing the document to other members or releasing the stock.

**Acceptance Scenarios**:

1. **Given** a confirmed proforma, **when** bank instructions are shown, **then** they match the order currency and frozen proforma account snapshot.
2. **Given** an active reservation, **when** valid proof is submitted before expiry, **then** the reservation becomes a review hold and remains protected until finance decides.
3. **Given** an expired reservation, **when** a late transfer is reported, **then** no stock is re-reserved and the payment enters audited reconciliation rather than normal settlement.
4. **Given** another buyer, seller, anonymous visitor, or unrelated operator, **when** proof access is attempted, **then** no document or existence detail is disclosed.

---

### User Story 3 - Finance reviews and confirms payment (Priority: P1)

A finance operator searches the review queue, inspects the immutable order/proforma totals and private proof, and explicitly confirms or rejects the transfer.

**Why this priority**: Human finance confirmation is the sole normal settlement authority and title-transfer gate.

**Independent Test**: An authorized finance operator can confirm an exact on-time transfer once, while unauthorized roles, duplicate actions, and mismatched transfers cannot settle the order.

**Acceptance Scenarios**:

1. **Given** an exact, on-time transfer under review, **when** finance confirms it, **then** payment becomes confirmed, reservation is consumed, purchased title transfers exactly once, a final tax invoice is created, seller payout liabilities are recorded, and fulfillment groups are created.
2. **Given** partial, late, wrong-currency, or duplicate payment evidence, **when** finance reviews it, **then** normal confirmation is unavailable and the item is handled through audited reconciliation.
3. **Given** invalid proof, **when** finance rejects it, **then** the review hold releases exactly once and the order cannot be represented as paid.
4. **Given** a repeated or concurrent confirmation attempt, **when** it executes, **then** it cannot duplicate title transfer, invoice, payout, fulfillment, or notifications.

---

### User Story 4 - Warehouse fulfills a paid multi-seller order (Priority: P1)

Warehouse operators fulfill each seller-and-warehouse group created after payment confirmation while the buyer sees a coherent order-level delivery journey.

**Why this priority**: Paid physical inventory must move through the existing custody and shipment controls without mixing unrelated sellers or warehouses.

**Independent Test**: A paid mixed-seller order produces one fulfillment shipment for each seller/warehouse group and can reach completion only after all required quantities are delivered.

**Acceptance Scenarios**:

1. **Given** a paid order with lines from two seller/warehouse groups, **when** fulfillment starts, **then** two independently controlled shipments exist and contain only their own lines.
2. **Given** partially delivered groups, **when** order status is viewed, **then** the order reports partial fulfillment without overstating delivered quantity.
3. **Given** all required quantities delivered, **when** fulfillment closes, **then** the order becomes completed and eligible seller payouts are released for manual processing.

---

### User Story 5 - Finance manually pays sellers (Priority: P2)

Finance sees seller liabilities created by confirmed buyer payments and manually records external seller payments only after the related order is complete.

**Why this priority**: Seller accounting must be accurate and auditable without implying an automated transfer capability.

**Independent Test**: A member-seller payout cannot become eligible before completion, Hills-owned lines create no payout, and finance can record a manual payout reference exactly once.

**Acceptance Scenarios**:

1. **Given** a confirmed payment for a member-seller line, **when** settlement completes, **then** a non-payable liability exists until order completion.
2. **Given** an incomplete order, **when** finance attempts to mark a payout payable or paid, **then** the action is refused.
3. **Given** a completed order and eligible payout, **when** finance records an external bank payment, **then** the payout becomes paid with immutable operator, time, amount, and reference evidence.
4. **Given** Hills-owned merchandise, **when** payment is confirmed, **then** no seller commission liability or seller payout is created for those lines.

---

### User Story 6 - Administrators control commerce rules and communications (Priority: P2)

Authorized administrators manage bank accounts, UAE tax rules, shipping fees, platform promotions, seller commission policies, and scheduled notifications without altering historical order economics.

**Why this priority**: Operations must change future commercial rules safely without code changes or retroactive financial mutation.

**Independent Test**: An administrator can schedule or activate future rules and communications while completed and in-progress orders retain their original snapshots.

**Acceptance Scenarios**:

1. **Given** an issued proforma, **when** tax, shipping, promotion, commission, or bank-account settings later change, **then** the proforma and order remain unchanged.
2. **Given** a seller promotion, **when** it targets another seller's listing, **then** the action is refused.
3. **Given** a scheduled administrator campaign, **when** its scheduled time arrives, **then** eligible recipients receive one in-app notification and delivery work is recorded for enabled channels.
4. **Given** Firebase is absent, **when** notifications are created, **then** commerce and in-app delivery continue without error.

---

### User Story 7 - Members browse a complete private marketplace (Priority: P2)

Approved members filter listings using business-valid catalogue attributes, see the correct primary listing image and quantity pricing, and add eligible quantities directly to the cart.

**Why this priority**: Checkout cannot be a coherent member journey if discovery, price tiers, catalogue metadata, and cart entry remain disconnected.

**Independent Test**: An approved member can filter by supported catalogue/listing dimensions, select an eligible quantity tier, and add the listing to a cart, while a public visitor receives no private listing data.

**Acceptance Scenarios**:

1. **Given** approved listings, **when** a member filters by origin, process, location, coffee type, availability, certification, or sort order, **then** only authorized matching listings appear.
2. **Given** a listing with quantity price tiers, **when** a quantity qualifies for a tier, **then** the selected tier price is used and later frozen on the proforma.
3. **Given** an anonymous visitor, **when** marketplace endpoints or pages are requested, **then** no price, stock, seller, tier, or private listing media is disclosed.

---

### User Story 8 - Operators safely retire Stripe runtime (Priority: P3)

Project operators move the application to bank-transfer commerce and remove Stripe runtime dependencies without modifying historical applied migrations or erasing provider-era evidence.

**Why this priority**: The abandoned provider direction must not remain an active security, deployment, or maintenance dependency.

**Independent Test**: The bank-transfer lifecycle remains complete with no live Stripe runtime, function, secret, callback, or payment-intent dependency, while historical Feature 008 artifacts remain reproducible.

**Acceptance Scenarios**:

1. **Given** successful bank-transfer cutover, **when** runtime dependencies are audited, **then** no active Stripe SDK, provider function, webhook, payment intent, transfer action, or deployment secret is required.
2. **Given** historical Feature 008 migrations and evidence, **when** decommissioning completes, **then** those files remain unchanged and production history remains reproducible.
3. **Given** legacy provider records, **when** decommissioning evaluates them, **then** they are retained or quarantined according to approved retention rules rather than destructively discarded.

### Edge Cases

- A listing changes or becomes unavailable between cart entry, proforma issuance, and buyer confirmation.
- A multi-seller order contains multiple warehouses, different price tiers, promotions, or commission policies.
- Two buyers confirm against the same final available quantity simultaneously.
- The same buyer submits confirmation, proof, finance review, cancellation, or payout recording more than once.
- Proof upload begins before expiry but metadata submission arrives after expiry.
- A buyer attempts to confirm an expired proforma or one whose lines can no longer all be fulfilled.
- Finance review lasts beyond the original 20-minute reservation window.
- Proof claims the correct amount but the bank record is partial, duplicated, late, or in the wrong currency.
- A buyer cancels while confirmation or proof submission is concurrently executing.
- A seller, warehouse operator, auditor, or unrelated buyer attempts to access proof or another seller's economics.
- A tax, shipping, promotion, commission, bank-account, or catalogue rule changes after proforma issuance.
- One fulfillment group is cancelled, disputed, or delayed while the others progress.
- A completed payment later requires a manual financial reversal.
- A scheduled notification worker retries after a partial delivery failure.
- Arabic text, mixed-direction identifiers, money, dates, or references appear in narrow layouts.
- Existing nonterminal provider-era orders cannot be mapped safely during migration preflight.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST preserve one atomic multi-seller cart and order for a buyer rather than silently splitting it by seller.
- **FR-002**: Approved buyers MUST be able to add eligible listing quantities directly from the private marketplace.
- **FR-003**: Adding, editing, or removing cart lines MUST NOT reserve inventory or reduce sellable quantity.
- **FR-004**: Buyers MUST be able to change quantities and remove lines only while the order remains a draft cart.
- **FR-005**: Buyers MUST be able to create, update, select, and retire reusable delivery destinations belonging to their organization.
- **FR-006**: Checkout MUST require a valid selected delivery destination and MUST snapshot it onto the order.
- **FR-007**: Checkout MUST calculate and freeze line prices, subtotal, discounts, shipping, tax, buyer total, seller totals, Hills share, and currency.
- **FR-008**: The system MUST support listing quantity-price tiers and select the eligible tier deterministically from the confirmed quantity.
- **FR-009**: The system MUST support platform promotions and seller promotions, including scheduled activation and expiry.
- **FR-010**: Seller promotions MUST apply only to listings owned by that seller and MUST NOT stack with another promotion on the same line.
- **FR-011**: Checkout MUST calculate shipping before the final total using the active applicable shipping rule for each seller-and-warehouse fulfillment group.
- **FR-012**: Checkout MUST apply the active UAE tax rule to its configured taxable basis after discounts.
- **FR-013**: Checkout MUST apply the applicable seller commission policy or tier and separately determine seller net and Hills share.
- **FR-014**: Checkout MUST persist a stable, immutable, uniquely referenced proforma containing the frozen commercial and party snapshots plus an administrator-configured confirmation deadline; the initial configured validity MUST be 24 hours and the issued deadline MUST never change retroactively.
- **FR-015**: Issuing or viewing a proforma MUST NOT reserve inventory.
- **FR-016**: Reservation MUST begin only after the buyer explicitly confirms the issued proforma.
- **FR-017**: Proforma confirmation MUST atomically reserve only the purchased quantities for all order lines for 20 minutes; if any line cannot be fulfilled, confirmation MUST reserve nothing.
- **FR-018**: Remaining unreserved listing quantity MUST remain visible and purchasable when otherwise eligible.
- **FR-019**: A buyer with an active reservation MUST receive the bank-transfer instructions assigned to that order and currency.
- **FR-020**: Bank-account changes after proforma issuance MUST NOT alter the instructions frozen on that order.
- **FR-021**: Buyers MUST be able to upload payment proof with amount, currency, transfer date, bank reference, and file metadata.
- **FR-022**: Proof submitted before expiry MUST move the reservation to review hold and prevent timed release while finance reviews it.
- **FR-023**: Finance operators MUST have a searchable and filterable queue of pending reviews and reconciliation cases.
- **FR-024**: Finance operators MUST be able to inspect the full authorized order, proforma, financial breakdown, proof, review history, and reservation state.
- **FR-025**: Finance operators MUST explicitly confirm or reject payment with a recorded reason where required.
- **FR-026**: Normal payment confirmation MUST require an exact, on-time USD bank transfer for the frozen buyer total.
- **FR-027**: Late, partial, wrong-currency, and duplicate payments MUST enter manual audited reconciliation without automatically re-reserving inventory.
- **FR-028**: Buyers MUST be able to cancel an awaiting-transfer order before proof submission, releasing the reservation exactly once.
- **FR-029**: A proforma MUST NOT be treated as the final fiscal invoice.
- **FR-030**: A final tax invoice MUST be generated or recorded only after finance confirms payment.
- **FR-031**: Payment confirmation MUST create one fulfillment shipment per seller-and-warehouse group using the frozen destination.
- **FR-032**: Fulfillment progress MUST aggregate accurately to the order without mixing shipment ownership or quantities.
- **FR-033**: Payment confirmation MUST create a payout liability for each member seller and MUST create none for Hills-owned lines.
- **FR-034**: A seller payout MUST become eligible for manual payment only after the order is completed.
- **FR-035**: Finance operators MUST be able to record an externally executed seller payout with amount, currency, reference, operator, and time.
- **FR-036**: The system MUST create transactional notifications for material order, payment, proof, review, fulfillment, completion, and payout events.
- **FR-037**: Administrators MUST be able to draft, schedule, cancel, and review campaigns targeting approved buyers, approved sellers, administrators, or explicitly selected recipients.
- **FR-038**: Notification delivery MUST operate through a provider-independent boundary so a future Firebase adapter can be added without changing commerce decisions.
- **FR-039**: Approved members MUST be able to filter marketplace listings by origin, process, location, coffee type, availability, certification, and supported sort orders.
- **FR-040**: Catalogue administrators MUST be able to manage the existing coffee tags and certification information needed by marketplace filters and details.
- **FR-041**: Listings MUST have a stable user-facing reference and preserve the existing primary-card-image/detail-gallery media rules.
- **FR-042**: The first release MUST transact only in USD and MUST refuse checkout when no valid USD bank account or financial rule is available.
- **FR-043**: Post-payment customer refunds or returns MUST NOT be offered as a normal member workflow.
- **FR-044**: Post-payment reversals MUST be finance/admin-only manual exceptions recorded without initiating an automated bank action.

### Security Requirements

- **SEC-001**: Every commerce mutation MUST re-authenticate the actor and verify organization membership, organization status, account status, capability, role, and current business state.
- **SEC-002**: Critical pricing, reservation, proof, settlement, title-transfer, invoice, fulfillment, and payout decisions MUST use fresh authoritative data rather than browser-supplied totals or cached state.
- **SEC-003**: Client input MUST NOT be trusted for price, seller identity, tax, shipping, commission, discount, buyer total, reservation expiry, or payout amount.
- **SEC-004**: Critical mutations MUST be atomic, retry-safe, and idempotent, including concurrent duplicate submissions.
- **SEC-005**: Private proof files MUST be size/type validated, stored privately, and served only through short-lived authorization-checked access.
- **SEC-006**: Secret credentials, private document contents, full bank identifiers, and sensitive financial data MUST NOT appear in logs, audit payloads, public URLs, or client bundles.
- **SEC-007**: Finance confirmation MUST require an independently authorized finance role and the existing applicable step-up authentication rules.
- **SEC-008**: Scheduled workers MUST claim work safely so retries or concurrent workers cannot duplicate notifications or financial effects.
- **SEC-009**: No commerce flow MAY depend on a service credential being exposed to a browser or member-controlled client.
- **SEC-010**: Security validation MUST cover forged identifiers, cross-organization access, stale states, replay, duplicate references, file-path manipulation, and unauthorized direct action invocation.

### Financial Invariants

- **FIN-001**: All order economics MUST be frozen at proforma issuance and MUST remain unchanged by later rule edits.
- **FIN-002**: Discounts MUST be applied before tax and MUST never reduce a line below zero.
- **FIN-003**: At most one promotion MAY apply to a line; an eligible explicit code takes precedence, otherwise the greatest eligible discount MUST be selected deterministically, with stable tie-breaking and an auditable result.
- **FIN-004**: VAT MUST use the configured tax basis and rate, with each line/component rounded to the currency precision before totals are summed.
- **FIN-005**: Shipping MUST be calculated and frozen per fulfillment group and summed into the buyer total.
- **FIN-006**: Seller commission MUST be calculated on discounted merchandise only, excluding VAT and shipping; for this basis only seller-funded discounts reduce the merchandise value (Hills-funded discounts are absorbed by Hills' share, see FIN-011).
- **FIN-007**: Each member seller's gross, seller-funded discount, Hills-funded discount, commission basis, commission, seller net, and Hills share MUST reconcile exactly.
- **FIN-011**: Every applied promotion MUST record its funding source: platform/administrator promotions are Hills-funded and reduce only Hills' share; seller promotions are seller-funded and reduce only that seller's economics. Funding source and applied discount MUST be frozen on the proforma line.
- **FIN-012**: No promotion MAY produce negative seller net or negative Hills share; configurations that are invalid on their own MUST be rejected, and any quote-time discount exceeding the funder's available economics on a line MUST be capped deterministically with the cap recorded.
- **FIN-013**: A member seller's commission tier MUST be selected by that seller's own qualifying quantity within the order, never by quantity belonging to other sellers.
- **FIN-008**: Hills-owned lines MUST create neither seller commission liability nor seller payout.
- **FIN-009**: Buyer total MUST equal discounted merchandise plus shipping plus tax, subject only to the declared currency-rounding rule.
- **FIN-010**: Confirmed payments, final invoices, seller liabilities, payouts, and manual adjustments MUST remain non-destructive financial records.

### State-Transition Invariants

- **ST-001**: The normal order sequence MUST be Draft → Proforma Issued → Awaiting Bank Transfer → Payment Under Review → Paid → Fulfillment → Completed.
- **ST-002**: No order MAY enter Awaiting Bank Transfer without explicit buyer confirmation of its current, unexpired proforma; an expired proforma MUST be replaced using current commercial terms.
- **ST-003**: No payment-proof submission MAY mark an order paid or transfer title.
- **ST-004**: A normal active reservation MUST expire after 20 minutes if no valid proof was submitted.
- **ST-005**: A timely proof MUST convert the reservation to review hold before expiry processing can release it; timeliness is determined by the authoritative proof-submission transaction committing before the reservation deadline, and uploading file bytes alone does not qualify.
- **ST-006**: Review hold MUST terminate only through finance confirmation, rejection, approved void, or audited exceptional resolution.
- **ST-007**: Finance confirmation MUST consume the reservation and transfer purchased quantity exactly once.
- **ST-008**: Rejection, cancellation, or expiry MUST release reserved quantity exactly once and MUST NOT create ownership transfer.
- **ST-009**: A partially purchased listing MUST become sold out only when no sellable quantity remains.
- **ST-010**: Order completion MUST require completion of every required fulfillment group and MUST be the sole normal payout-eligibility trigger.

### RLS and Privacy Boundaries

- **RLS-001**: Anonymous users MAY read only approved public catalogue projections and public catalogue media, never member listing data.
- **RLS-002**: Listing prices, stock, seller identity, price tiers, private listing media, carts, orders, and reservations MUST remain restricted to authorized members and applicable operators.
- **RLS-003**: Buyers MAY view and mutate only their own organization's permitted cart, destination, order, payment, and proof records.
- **RLS-004**: Sellers MAY view only their own order lines, seller-specific economics, fulfillment records, and payouts; they MUST NOT view buyer proof, full bank instructions, or another seller's economics.
- **RLS-005**: Finance operators MAY review payments, proofs, reconciliations, invoices, and payouts but MUST NOT gain unrelated warehouse or compliance authority.
- **RLS-006**: Warehouse operators MAY view only the fulfillment data required for assigned shipments and MUST NOT receive payment proof or bank-account access.
- **RLS-007**: Auditors MAY read redacted event and history metadata but MUST NOT receive private document bytes or unredacted bank identifiers.
- **RLS-008**: The buyer MAY receive bank instructions only for the account frozen onto that buyer organization's confirmed order.

### Migration Constraints

- **MIG-001**: Existing applied migrations, rollbacks, postflight evidence, and historical Feature 008 documents MUST NOT be deleted, reordered, or rewritten.
- **MIG-002**: Every database change for this feature MUST be delivered as a forward migration with preflight, rollback strategy, authorization review, integrity review, and read-only postflight evidence.
- **MIG-003**: Preflight MUST classify all nonterminal orders, reservations, provider payments, provider events/transfers, proofs, invoices, and payouts before cutover.
- **MIG-004**: A row that cannot be mapped safely MUST stop the affected cutover rather than be guessed, deleted, or silently rewritten.
- **MIG-005**: Stripe-specific database objects MUST first be made unused and access-restricted; destructive contract cleanup requires a later retention-approved forward migration.
- **MIG-006**: Rollback after real financial records exist MUST preserve those records and use application disablement or corrective forward changes rather than destructive restoration.

### Audit Requirements

- **AUD-001**: Material status changes MUST record old state, new state, actor, time, reason, and correlation/idempotency context.
- **AUD-002**: Proforma issuance and buyer confirmation MUST be distinguishable audited events.
- **AUD-003**: Proof submission, review hold, finance decisions, reconciliation decisions, and manual adjustments MUST be audited.
- **AUD-004**: Title transfer, reservation consumption/release, shipment creation, completion, payout eligibility, and payout recording MUST be auditable and exactly-once.
- **AUD-005**: Tax, shipping, promotion, commission, bank-account, and notification-campaign administration MUST record attributable changes.
- **AUD-006**: Audit records MUST exclude proof bytes, secrets, full bank account values, and unnecessarily sensitive personal data.

### UI and UX Requirements

- **UX-001**: The member journey MUST clearly distinguish cart intent, issued proforma, reserved payment window, finance review, paid, fulfillment, and completion.
- **UX-002**: The cart MUST show seller/warehouse grouping, quantities, current estimated unit prices, and clear edit/remove controls without implying reservation or frozen pricing before proforma issuance.
- **UX-003**: Checkout MUST show destination, all line and group charges, discounts, VAT, commission-neutral buyer totals, and the proforma terms before confirmation.
- **UX-004**: The confirmed-payment screen MUST show the reservation deadline/countdown, exact bank instructions, exact payable amount, and proof requirements.
- **UX-005**: Expired, cancelled, rejected, under-review, disputed, partially fulfilled, and retrying states MUST have explicit non-deceptive guidance.
- **UX-006**: Finance review MUST present immutable order/proforma values beside proof and audit history and require deliberate confirmation or rejection.
- **UX-007**: Dense finance, payout, campaign, promotion, and fulfillment views MUST remain keyboard-operable and understandable without color alone.
- **UX-008**: Existing Hills visual language, member/admin shells, catalogue/listing media separation, and current component patterns MUST be reused rather than replaced by a parallel design system.

### EN/AR and RTL/LTR Requirements

- **LOC-001**: Every new normal user-facing label, instruction, validation message, state, empty state, action, and notification MUST be available in English and Arabic.
- **LOC-002**: Raw internal state values MUST be mapped to localized human-readable labels and MUST NOT be displayed directly in normal UI.
- **LOC-003**: Arabic layouts MUST use correct RTL structure while identifiers, money, bank references, order codes, and other direction-sensitive values remain readable.
- **LOC-004**: Admin-managed bilingual descriptive catalogue values MUST use the existing translation model; official certification names, codes, and identifiers MUST not receive invented translations.
- **LOC-005**: English and Arabic users MUST receive equivalent commerce information, actions, privacy, and error handling.

### Responsive and Theme Requirements

- **RT-001**: Every new or modified UI MUST be verified in English/LTR and Arabic/RTL, in light and dark themes.
- **RT-002**: Every new or modified UI MUST be usable at 375, 430, 768, 1024, 1280, and 1440+ pixel viewport widths.
- **RT-003**: Cart, checkout, proforma, payment proof, finance review, payout, notification, promotion, and marketplace views MUST have no horizontal overflow or clipped actions.
- **RT-004**: All interactive controls MUST support keyboard navigation, visible focus, accessible names, adequate contrast, and non-hover alternatives.
- **RT-005**: Loading, empty, error, unauthorized, stale, expired, conflict, and success states MUST preserve layout clarity across locale, direction, theme, and viewport.

### Key Entities

- **Cart / Draft Order**: A buyer organization's editable purchase intent containing authorized listing quantities; it has no reservation effect.
- **Delivery Destination**: A reusable organization-owned delivery address/contact selection that is snapshotted onto an order.
- **Order Item**: A purchased listing quantity with immutable product, lot, seller, warehouse, price-tier, promotion, and commercial snapshots.
- **Proforma Invoice**: The stable pre-payment commercial document containing frozen buyer, seller, destination, line, total, tax, shipping, commission, promotion, currency, bank-instruction information, and an immutable confirmation deadline derived from the administrator-configured validity active at issuance.
- **Inventory Reservation**: The purchased quantities held for 20 minutes after buyer confirmation or protected as review hold after timely proof.
- **Payment and Payment Proof**: The expected bank transfer and its private supporting evidence; neither is confirmation by itself.
- **Payment Review / Reconciliation Case**: Finance decisions for normal exact transfers and manual handling for late, partial, wrong-currency, duplicate, or exceptional payments.
- **Order Financial Snapshot**: Immutable buyer-level, line-level, fulfillment-group, and seller-level calculations used by all later documents and accounting.
- **Tax Rule / Shipping Rule / Commission Policy**: Future-effective commercial configuration whose applied values are copied into the order snapshot.
- **Promotion / Offer Price Tier**: Platform- or seller-authorized future-effective pricing adjustment whose selected outcome is frozen on the order line.
- **Final Tax Invoice**: The post-confirmation fiscal document, distinct from the proforma.
- **Fulfillment Shipment**: The post-payment seller-and-warehouse logistics group using the order's frozen destination.
- **Seller Payout**: A member-seller liability created after payment, eligible after completion, and paid manually outside the platform.
- **Manual Financial Adjustment**: An immutable finance-only record of a post-payment reversal or refund performed externally.
- **Notification / Campaign / Delivery Work**: In-app messages, scheduled administrator communication, and provider-independent external delivery attempts.

## Eight Implementation Phases

### Phase 1 — Specification and preflight reconciliation

- Reconcile Feature 008, Feature 010, Feature 012, migration status, tag-translation status, current test truth, and production-data preflight expectations.
- Record the supersession relationship without marking unfinished Stripe work complete.
- Produce the state, financial, security, migration, and acceptance matrices required before database work.

### Phase 2 — Database, state, and RLS foundation

- Add the provider-independent state vocabulary, delivery destinations, immutable financial/party snapshots, reconciliation records, promotion and tier concepts, and role-specific read boundaries.
- Preserve existing generic commerce entities and transaction authority.
- Supply forward migration, preflight, rollback strategy, and postflight evidence for every change.

### Phase 3 — Cart, destination, checkout, proforma, and reservation

- Connect private marketplace listings to the existing draft-order foundation.
- Complete destination selection, deterministic checkout calculation, immutable proforma issuance, explicit buyer confirmation, atomic partial-quantity reservation, expiry, and cancellation.

### Phase 4 — Bank transfer, proof, admin finance, payout, and fulfillment

- Deliver bank instructions, private proof, review hold, finance queue/detail/actions, exact-payment confirmation, reconciliation, final invoice, title transfer, payout liability, seller/warehouse shipments, completion, and manual payout recording.

### Phase 5 — Notifications and outbox

- Generate transactional in-app notifications, preferences, read state, scheduled administrator campaigns, audience resolution, retry-safe delivery work, and a future provider boundary that does not require Firebase.

### Phase 6 — Promotions, catalogue, and marketplace completeness

- Add platform/seller promotions, offer price tiers, offer references, existing tag/certification administration, authorized member filters, and marketplace/cart UX while preserving public/member separation and media rules.

### Phase 7 — Stripe runtime decommission

- Remove active SDK, component, payment-intent, webhook, provider-function, automated-transfer, deployment-secret, and provider-runtime dependencies only after bank-transfer cutover evidence passes.
- Preserve historical migrations, rollback/postflight evidence, specs, and retained provider-era data.

### Phase 8 — Localization, security, responsive, accessibility, and final closure

- Complete EN/AR and status-label audits, RLS negative tests, threat-model verification, visual and keyboard accessibility checks, theme/direction/viewport matrices, full regression, task reconciliation, and production readiness evidence.

## Acceptance Criteria

- **AC-001**: Cart and proforma issuance produce zero reservation change in all tested paths.
- **AC-002**: Explicit buyer confirmation of a current, unexpired proforma reserves every requested line quantity as one atomic order for 20 minutes without overselling under concurrency; any unavailable line produces zero reservations.
- **AC-003**: Timely proof protects the reservation throughout finance review even after the original deadline passes.
- **AC-004**: No order reaches paid state and no title transfers without an explicit authorized finance confirmation.
- **AC-005**: A confirmed partial purchase leaves the exact remainder sellable and marks a listing sold out only at zero sellable quantity.
- **AC-006**: Buyer totals and seller/Hills splits reconcile to the smallest supported USD unit with no unexplained remainder.
- **AC-007**: Changes to tax, shipping, promotions, commission, bank accounts, catalogue content, or listing state do not mutate an issued proforma or historical order.
- **AC-008**: Sellers can read only their own line economics and payout; buyers, other sellers, warehouse users, and anonymous users cannot access private proof.
- **AC-009**: Late, partial, wrong-currency, and duplicate transfers cannot use normal confirmation or restore an expired reservation automatically.
- **AC-010**: Final tax invoice creation, title transfer, payout liability, fulfillment-group creation, and notifications occur at most once under retries and concurrent requests.
- **AC-011**: Member-seller payouts remain ineligible before completion; Hills-owned lines create no seller payout.
- **AC-012**: One fulfillment shipment exists for every distinct seller/warehouse group and contains no line from another group.
- **AC-013**: Scheduled notifications produce at most one logical delivery per recipient/channel/event despite retries.
- **AC-014**: Anonymous/public access reveals zero member listing price, stock, seller, tier, private media, order, proof, bank, or payout data.
- **AC-015**: All new normal UI copy and state labels are complete and equivalent in English and Arabic.
- **AC-016**: All changed screens pass the required locale, direction, theme, viewport, keyboard, focus, and contrast matrix.
- **AC-017**: No active runtime dependency on Stripe remains after Phase 7, while all applied Feature 008 historical files remain unchanged.
- **AC-018**: Every migration passes documented preflight and postflight checks and has a non-destructive rollback strategy before production consideration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of approved buyer test journeys can proceed from an eligible listing to an issued proforma without any inventory reservation before explicit confirmation.
- **SC-002**: In concurrency tests, confirmed reservations and completed purchases never exceed the available quantity across at least 100 repeated contention runs.
- **SC-003**: 100% of timely proof submissions retain their reserved quantity until a recorded finance decision.
- **SC-004**: 100% of confirmed orders reconcile buyer total, tax, shipping, discount, seller net, Hills share, and payout liabilities with no unexplained currency-unit difference.
- **SC-005**: 100% of cross-organization, anonymous, wrong-role, and seller-to-proof access tests disclose neither protected content nor record existence.
- **SC-006**: Duplicate and concurrent confirmation, review, invoice, fulfillment, notification, and payout submissions create no duplicate financial, title, inventory, or delivery effect.
- **SC-007**: Finance operators can locate a pending payment and record a decision in under three minutes using the review console in representative usability testing.
- **SC-008**: Approved buyers can complete cart, destination, proforma review, confirmation, bank-instruction review, and proof submission in under five minutes, excluding time spent in an external banking application.
- **SC-009**: 100% of new or modified screens pass English/Arabic, LTR/RTL, light/dark, 375/430/768/1024/1280/1440+ viewport, keyboard, focus, and contrast verification.
- **SC-010**: Runtime and deployment audits find zero active Stripe SDK, payment-intent, webhook, provider callback, automated transfer, function, or secret dependency after decommission.
- **SC-011**: Historical Feature 008 migration, rollback, postflight, and evidence files have zero content modifications.
- **SC-012**: All feature-owned automated tests, type validation, linting, production build, migration checks, and diff validation complete successfully before closure.

## Assumptions

- Existing authentication, organization capability, operational-role, MFA, catalogue, listing, inventory, order, reservation, shipment, finance, media, audit, localization, and admin-shell foundations remain authoritative and are extended rather than replaced.
- Proforma validity is administrator-configured, initially 24 hours, and snapshotted as an immutable deadline when each proforma is issued.
- The active UAE tax configuration is 5%; finance/legal approval of the applicable taxable basis is a production gate, not a specification ambiguity.
- Real bank-account values are deployment-managed business data and are not embedded in this specification.
- USD has two decimal currency precision for this release; adding other currencies requires a separately reviewed configuration and migration.
- Kilograms remain the authoritative transacted quantity. Bag counts or bag weights are not inferred without a separately approved inventory invariant.
- Seller promotions and price tiers cannot apply to another seller's inventory and do not discount shipping in the first release.
- A late or mismatched transfer may require an external refund or other finance action, but the platform records only the audited manual resolution.
- Firebase, email, SMS, or WhatsApp providers may be connected later; in-app notification persistence and delivery work remain the source of truth.
- Production activation remains gated by finance/tax/legal approval, migration security review, warehouse reconciliation, backup/restore readiness, and end-to-end acceptance testing.

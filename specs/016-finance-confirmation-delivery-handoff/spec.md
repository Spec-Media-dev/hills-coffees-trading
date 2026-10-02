# Feature Specification: Feature 016 — Finance Confirmation & Delivery Handoff

**Feature Branch**: `016-finance-confirmation-delivery-handoff`  
**Created**: 2026-10-01  
**Status**: Revised (Post-Codex Final Correction Pass)  
**Input**: User description: "Finance Confirmation & Delivery Handoff (Sprint 4) with terminal payment rejection policy, automatic Feature 009 FULFILLMENT delivery handoff, final tax-invoice issuance on confirmation, full inventory conservation, null-safe buyer position identity, and strict exclusion of seller payouts."

---

## 1. Executive Summary & Context

Feature 016 completes the operational commerce cycle for manual bank transfers established in Sprint 3 (Features 013, 014, and 015). It provides the Hills Operations/Finance Console with the authority to review submitted private payment proofs, verify incoming funds against proforma commercial snapshots, and execute either an atomic confirmation or a terminal rejection.

Review decisions are executed through a single authoritative database RPC: `public.finance_review_bank_transfer_v1`, which accepts `p_decision` as either `'CONFIRMED'` or `'REJECTED'`.

Upon **Confirmation**:
1. Payment becomes `CONFIRMED`, order becomes `PAID`, and reservation becomes `CONSUMED`.
2. Total inventory ownership is strictly conserved: for each line in `inventory_reservation_items` with quantity $q$:
   * Signed deltas: $\Delta\text{seller\_available} = -q$, $\Delta\text{seller\_reserved} = -q$, $\Delta\text{buyer\_available} = +q$.
   * Conservation invariant: $\Delta\text{seller\_available} + \Delta\text{buyer\_available} = 0$ (seller decrease magnitude equals buyer increase magnitude equals consumed quantity $q$).
   * Buyer positions are created or incremented using null-safe identity: `UNIQUE NULLS NOT DISTINCT (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)`.
3. Green-coffee title transfer events are immutably recorded in `inventory_ownership_events` (`SALE` for Hills-owned lots, `RESALE` for member-seller lots) with reason `'SETTLEMENT_CONFIRMED'`.
4. A final `tax_invoices` record is issued with a sequential invoice code (`INV-...`) and frozen financial snapshot (strictly excluding bank instructions).
5. Fulfillment is automatically handed off into Feature 009: for EACH `proforma_fulfillment_groups` row (seller × warehouse group) of the settled `CONFIRMED` proforma, create exactly one `order_shipments` record in `status = 'DRAFT'` with `shipment_kind = 'FULFILLMENT'`, attach lines in `shipment_items` filtered strictly by `pii.fulfillment_group_id = v_group.id`, and transition shipment to `status = 'REQUESTED'` under `app.internal_transition = true`. The shipment destination details are mapped from the proforma `destination_snapshot` (mapping `address_lines` array into `address_line` text) and preserves the frozen `delivery_method` from the fulfillment group (never hardcoded).
6. Database-owned notifications are emitted exactly once: the order-status trigger follows Feature 014's buyer-recipient model, and the new shipment-status trigger writes `DELIVERY_HANDOFF_REQUESTED` to active `organization_members` of the fulfillment warehouse owner.

Upon **Rejection**:
1. Payment becomes `REJECTED`, order becomes `PAYMENT_REJECTED`, and reservation becomes `RELEASED` (`release_reason = 'REJECTED'`).
2. Release write order strictly decrements backing `inventory_positions.reserved_quantity_kg` before `coffee_offers.reserved_quantity_kg` using exact quantities from `inventory_reservation_items`.
3. The rejection is strictly terminal: no return to `HOLD`, no cure period, no timer restart, and no re-upload on the rejected order.
4. Notification is dispatched: `PAYMENT_REJECTED` to the buyer with the operator's reason.

Seller payouts and marketplace commission distributions are strictly out of scope for Sprint 4.

---

## 2. User Scenarios & Testing *(mandatory)*

### User Story 1 — Finance Payment Verification & Automatic Delivery Handoff (Priority: P1)

As a Hills Finance Operator,  
I want to review submitted bank transfer proofs against authoritative `CONFIRMED` proforma snapshots and approve valid payments via `finance_review_bank_transfer_v1` with decision `CONFIRMED`,  
So that customer orders are marked paid, coffee inventory ownership is transferred to the buyer with total inventory conserved, and fulfillment starts immediately across all seller/warehouse fulfillment groups.

**Why this priority**: Core happy-path business milestone required to convert bank-transfer orders into paid commercial transactions and initiate physical fulfillment.

**Independent Test**: Can be tested independently by logging in as a Finance Operator, selecting an order in `PAYMENT_PROOF_SUBMITTED` status, clicking "Confirm Payment", and verifying that:
1. `payments.status` transitions to `CONFIRMED` and `orders.status` transitions to `PAID`.
2. `inventory_reservations.status` transitions from `REVIEW_HOLD` to `CONSUMED`.
3. Total inventory is conserved: seller signed deltas are $\Delta\text{available} = -q$ and $\Delta\text{reserved} = -q$; buyer signed delta is $\Delta\text{available} = +q$. Total on-hand change is zero ($\Delta\text{seller} + \Delta\text{buyer} = 0$).
4. `inventory_ownership_events` records `SALE` (for Hills lots) or `RESALE` (for member-seller lots).
5. For each proforma fulfillment group, exactly one `order_shipments` record is created with `shipment_kind = 'FULFILLMENT'` and `status = 'REQUESTED'`, linking line items via `shipment_items` belonging strictly to that fulfillment group (`pii.fulfillment_group_id = v_group.id`).
6. Buyer receives `PAYMENT_CONFIRMED` notification and warehouse receives `DELIVERY_HANDOFF_REQUESTED`.

**Acceptance Scenarios**:

1. **Given** an order in `PAYMENT_PROOF_SUBMITTED` with payment in `PROOF_SUBMITTED`, reservation in `REVIEW_HOLD`, authoritative proforma in `CONFIRMED`, and finalized upload intent referencing an exact proof,  
   **When** a Finance Operator submits a confirmation with an idempotent request ID and optional approval notes,  
   **Then** `finance_review_bank_transfer_v1` transitions order to `PAID`, payment to `CONFIRMED`, reservation to `CONSUMED`, and the exact finalized proof to `ACCEPTED`.
2. **Given** confirmation of an order with multiple line items,  
   **When** the transaction commits,  
   **Then** for each line in `inventory_reservation_items`:
   * Seller position: `available_quantity_kg -= qty` and `reserved_quantity_kg -= qty`.
   * Buyer position: `available_quantity_kg += qty` (null-safe on `warehouse_location_id`).
   * Signed conservation verified: $\Delta\text{seller\_available} = -q, \Delta\text{buyer\_available} = +q$, sum $= 0$.
3. **Given** an order with 2 distinct fulfillment groups (e.g. 2 different warehouses),  
   **When** payment is confirmed,  
   **Then** exactly 2 `order_shipments` records are created with `shipment_kind = 'FULFILLMENT'` and `status = 'REQUESTED'`, each linking ONLY its own group's items via `shipment_items`, carrying the frozen delivery method and destination address mapped from `address_lines`.
4. **Given** a confirmed payment,  
   **When** the database transaction completes,  
   **Then** a `tax_invoices` record is created linking `order_id` and `proforma_id`, capturing sequential number `INV-...` and proforma totals snapshot (without bank info).
5. **Given** an already confirmed order,  
   **When** confirmation is re-submitted with the same request ID,  
   **Then** the request validates persisted terminal integrity in `payment_reviews` and returns the reconstructed persisted result idempotently without duplicate mutations.

---

### User Story 2 — Terminal Payment Rejection & Stock Restoration (Priority: P2)

As a Hills Finance Operator,  
I want to reject invalid, insufficient, or fraudulent payment proofs with a mandatory rejection reason via `finance_review_bank_transfer_v1` with decision `REJECTED`,  
So that invalid payments are closed cleanly, locked inventory is restored in the correct database write order, and buyers are instructed to create a fresh order.

**Why this priority**: Essential risk control preventing bad-faith or erroneous bank transfers from indefinitely locking physical coffee inventory in warehouse positions.

**Independent Test**: Can be tested independently by selecting an order in `PAYMENT_PROOF_SUBMITTED`, entering a rejection reason, clicking "Reject Payment", and verifying that:
1. `payments.status` transitions to `REJECTED` and `orders.status` transitions to `PAYMENT_REJECTED`.
2. `inventory_reservations.status` transitions from `REVIEW_HOLD` to `RELEASED`.
3. Backing `inventory_positions.reserved_quantity_kg` is decremented BEFORE `coffee_offers.reserved_quantity_kg` is decremented.
4. The exact finalized proof transitions to `REJECTED`.
5. Zero ownership events, zero shipments, and zero tax invoices are created.
6. Buyer receives `PAYMENT_REJECTED` notification with the operator's reason.

**Acceptance Scenarios**:

1. **Given** an order in `PAYMENT_PROOF_SUBMITTED` with an invalid proof document,  
   **When** a Finance Operator submits a rejection with mandatory rejection reason and notes,  
   **Then** order transitions to `PAYMENT_REJECTED`, payment transitions to `REJECTED`, reservation transitions to `RELEASED` with `release_reason = 'REJECTED'`, and the exact finalized proof transitions to `REJECTED`.
2. **Given** an order rejected by Finance,  
   **When** the transaction executes,  
   **Then** release quantities are sourced strictly from `inventory_reservation_items`:
   * Step 1: Decrement `inventory_positions.reserved_quantity_kg`.
   * Step 2: Decrement `coffee_offers.reserved_quantity_kg`.
3. **Given** a rejected order,  
   **When** a buyer attempts to re-upload proof or edit the order,  
   **Then** the action is rejected as terminal; the buyer must start a new cart and checkout.
4. **Given** an already rejected order,  
   **When** another rejection request is submitted with the same request ID,  
   **Then** the request validates persisted terminal integrity and returns the rejected state idempotently without double-releasing inventory.

---

### User Story 3 — Pending Verification Queue & Secure Proof Inspection (Priority: P3)

As a Hills Finance Operator,  
I want to view a dedicated queue of orders awaiting payment verification on desktop, tablet, or mobile and securely preview the buyer's private proof document,  
So that I can quickly verify transfer amounts and bank reference codes against actual bank account statements.

**Acceptance Scenarios**:

1. **Given** an authenticated user with `is_finance_operator()` or `is_platform_admin()`,  
   **When** navigating to `/dashboard-admin/payments`,  
   **Then** the system displays the "Pending Verification" queue showing order reference, buyer organization, proforma total, submitted reference, and submission timestamp.
2. **Given** an authenticated buyer, seller, or warehouse operator without Finance roles,  
   **When** attempting to access `/dashboard-admin/payments` or the review actions,  
   **Then** access is denied with a 403 Forbidden response.
3. **Given** a selected pending payment row,  
   **When** opening the proof inspector drawer/modal,  
   **Then** the UI requests a short-lived (15-minute) signed URL via the server DAL and securely embeds or previews the document inside an isolated sandbox.

---

### User Story 4 — Warehouse Fulfillment Handoff & Notification (Priority: P4)

As a Warehouse Operations Operator,  
I want to receive an immediate notification and newly created `REQUESTED` shipments grouped by warehouse as soon as an order payment is confirmed,  
So that warehouse staff can schedule capacity, confirm inventory positions, and begin picking without manual coordination.

**Acceptance Scenarios**:

1. **Given** an order confirmed by Finance,  
   **When** shipments transition from `DRAFT` to `REQUESTED`,  
   **Then** the DB shipment-status trigger dispatches one in-app `DELIVERY_HANDOFF_REQUESTED` per active member of the fulfillment warehouse owner's organization, with per-recipient dedupe.
2. **Given** the automatically created `order_shipments` records,  
   **When** viewed in the Warehouse Console,  
   **Then** each shipment contains the correct frozen shipping address, frozen delivery method, and only the line items and quantities belonging to that fulfillment group.

---

## 3. Requirements *(mandatory)*

### Functional Requirements

#### Review Queue & Inspection
* **FR-001**: System MUST provide a protected Admin Finance route at `/dashboard-admin/payments` replacing the existing placeholder.
* **FR-002**: Review queue MUST list all orders where `orders.status = 'PAYMENT_PROOF_SUBMITTED'` and `payments.status = 'PROOF_SUBMITTED'`.
* **FR-003**: System MUST display commercial order details including order code, buyer organization name, proforma invoice code, frozen total amount, currency (`USD`), customer claimed amount, customer bank reference, and submission timestamp.
* **FR-004**: System MUST generate temporary, time-bounded (max 15-minute) signed download URLs for private payment proof assets stored in `payment-proofs`.

#### Atomic Finance Review Contract & Entity Binding
* **FR-005**: System MUST provide ONE atomic, `SECURITY DEFINER` database function `public.finance_review_bank_transfer_v1(p_order_id, p_payment_id, p_decision, p_notes, p_request_id)`.
* **FR-006**: Function execution MUST be restricted to `authenticated` callers satisfying `mfa_satisfied()` and having `is_finance_operator()` or `is_platform_admin()`; privileges revoked from `PUBLIC`, `anon`, and `service_role`.
* **FR-007**: Function MUST acquire row-level locks in strict global ascending UUID order: `orders` → `payments` → `inventory_reservations` → `proforma_invoices` → `coffee_offers` → `inventory_positions`.
* **FR-008**: On the non-terminal initial mutation path (only after FR-009b replay/terminal inspection), function MUST validate and lock exact authoritative entities:
  * `orders` exists and `commerce_flow = 'BANK_TRANSFER_V1'`
  * `payments` exists and `payment.order_id = p_order_id`
  * One authoritative proforma exists in `CONFIRMED` status and the real pointers agree exactly: `payments.proforma_id = orders.current_proforma_id = inventory_reservations.proforma_id = proforma_invoices.id`
  * `inventory_reservations` belongs to `order_id`; only the initial mutation path requires `status = 'REVIEW_HOLD'`
  * Finalized upload intent exists in `public.payment_proof_upload_intents` (`order_id = p_order_id`, `status = 'FINALIZED'`, and `finalized_proof_id` is NOT NULL)
  * Exact proof exists in `public.payment_proofs` (`id = intent.finalized_proof_id`, `payment_id = payment.id`, and the initial path status is `SUBMITTED`)
  * Decision is NOT NULL and is `'CONFIRMED'` or `'REJECTED'`
  * If `p_decision = 'REJECTED'`, rejection reason is NOT NULL and non-empty
  Any violation MUST fail closed before business mutation.
* **FR-008b**: Function MUST update ONLY the exact finalized proof (`payment_proofs.id = v_intent.finalized_proof_id`), never arbitrary or multiple proofs.

#### Truthful Idempotency & Replay Contract
* **FR-009**: Before any `REVIEW_HOLD`, `PAYMENT_PROOF_SUBMITTED`, or `PROOF_SUBMITTED` initial-state rejection, function MUST lock/inspect the order-payment association, request identity, and terminal state, then integrate with `commerce_request_begin(p_request_id, 'finance_review_bank_transfer_v1', p_order_id)`.
* **FR-009b**: Same-key replay requires exactly one persisted `public.payment_reviews` row where `request_id = p_request_id`, `payment_id = p_payment_id`, decision, and actor/request binding match established idempotency semantics. Missing or inconsistent data MUST fail closed with `persisted_review_integrity_error`; it MUST NOT directly return cached success.
* **FR-009c**: Different-key terminal reconstruction MUST NOT require `payment_reviews.request_id =` the newly supplied request ID and MUST NOT insert a second review. It loads the original authoritative persisted review for the terminal payment/decision and validates payment ID, original decision, final order/payment/reservation/proof state, invoice/ownership/shipments for `CONFIRMED`, and their absence for `REJECTED`. Missing, duplicate, or contradictory terminal entities MUST raise `persisted_review_integrity_error`.
* **FR-010**: Terminal conflict rules:
  * Same request_id + same payment_id + same decision: perform the same-key replay in FR-009b.
  * Same request_id + different payment_id: throw `request_id_conflict` with zero mutation.
  * Same request_id + opposite decision: throw `request_id_conflict` with zero mutation.
  * Different request_id + same terminal payment/decision: reconstruct truthful persisted success from the original review with zero mutation.
  * Different request_id + opposite terminal decision: throw `decision_conflict` / `order_already_finalized` with zero mutation.
  * Replayed payloads MUST be reconstructed from persisted database rows, never fabricated.

#### Inventory Conservation on Confirmation
* **FR-011**: On confirmation, system MUST conserve total inventory quantity using exact source lines from `public.inventory_reservation_items` (`iri`):
  * Signed deltas for quantity $q$: $\Delta\text{seller\_available} = -q$, $\Delta\text{seller\_reserved} = -q$, $\Delta\text{buyer\_available} = +q$.
  * Total on-hand delta: $\Delta\text{seller\_available} + \Delta\text{buyer\_available} = 0$.
* **FR-012**: System MUST assert `seller_available - qty >= 0` and `seller_reserved - qty >= 0` before updating.
* **FR-013**: System MUST enforce null-safe buyer position identity: `UNIQUE NULLS NOT DISTINCT (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)`. Pre-existing duplicate positions MUST NOT be auto-merged in migrations; duplicate detection preflight MUST abort migration with a diagnostic error if duplicates exist.
* **FR-013b**: Concurrency locking protocol: before quantity writes, derive all source positions and buyer logical keys; acquire transaction-scoped advisory locks on buyer keys in deterministic sorted order; resolve existing buyer rows; acquire row locks on ALL source and buyer positions in ascending UUID order; perform debits and credits. Absent buyer positions use `INSERT ... ON CONFLICT (...) DO UPDATE`.
* **FR-014**: System MUST record an immutable `inventory_ownership_events` row for each reservation line (`SALE` for Hills lots, `RESALE` for member-seller lots, reason `'SETTLEMENT_CONFIRMED'`).
* **FR-015**: System MUST update `coffee_offers`: `filled_quantity_kg += qty`, `reserved_quantity_kg -= qty`, setting status to `SOLD_OUT` if remaining quantity is zero.

#### Rejection Write Ordering
* **FR-016**: On rejection, system MUST execute release writes in strict dependency order:
  1. Decrement backing `inventory_positions.reserved_quantity_kg` by exact reservation item quantities.
  2. Then decrement `coffee_offers.reserved_quantity_kg` by exact reservation item quantities.
* **FR-017**: On rejection, reservation MUST transition to `RELEASED` with `release_reason = 'REJECTED'`.
* **FR-018**: On rejection, order MUST transition to `PAYMENT_REJECTED` and payment to `REJECTED`. Rejection is terminal: no cure period, no retry on the same order.

#### Automatic Delivery Handoff (Feature 009 FULFILLMENT Model)
* **FR-019**: On confirmation, system MUST create exactly one `order_shipments` record per `proforma_fulfillment_groups` row (seller × warehouse group) of the settled proforma with `shipment_kind = 'FULFILLMENT'`.
* **FR-020**: Shipment creation MUST follow the Feature 009 lifecycle:
  1. Set `app.internal_transition = true` transaction-locally before the first guarded write.
  2. Insert in `status = 'DRAFT'`, then insert line items into `public.shipment_items` including ONLY lines belonging to that fulfillment group (`pii.fulfillment_group_id = v_group.id`).
  3. Update to `status = 'REQUESTED'` under that same transaction-local setting, which also covers the guarded tax-invoice insert and internal order/reservation writes.
* **FR-021**: Shipments MUST carry all required fields:
  * `order_id`
  * `shipment_kind = 'FULFILLMENT'`
  * `fulfillment_seller_organization_id = v_group.seller_organization_id`
  * `fulfillment_warehouse_id = v_group.warehouse_id`
  * `proforma_fulfillment_group_id = v_group.id`
  * `created_by = auth.uid()`
  * Destination country (`country_code`) from `destination_snapshot->>'country_code'`
  * Destination city/emirate (`city`) from `destination_snapshot->>'city'`
  * Destination address (`address_line`) mapped from `destination_snapshot->'address_lines'` array (e.g. joined by comma/newline)
  * Contact name and phone from `destination_snapshot`
  * Frozen delivery method from `v_group.delivery_method` (never hardcoded to `'Courier'`)
  * `shipping_fee` from `v_group.shipping_amount`
  * `currency = 'USD'`

#### Tax Invoice Issuance
* **FR-022**: On confirmation, system MUST insert into `public.tax_invoices` with sequential code `public.next_tax_invoice_code()`, linking `order_id` and `proforma_id`, capturing frozen totals snapshot without bank identifiers.

#### Legacy admin_review_payment Pre-Lock Fence
* **FR-023**: Migration MUST preserve the complete current `admin_review_payment` definition from `20260922120000_feature_008_stripe_trusted_funding.sql`, including the provider `trusted_funding_required` gate and all legacy/provider protections. Before its existing workflow lock sequence it performs only a read-only payment/order flow lookup; if `commerce_flow = 'BANK_TRANSFER_V1'`, it immediately raises `endpoint_deprecated_use_finance_review_bank_transfer_v1` with zero mutation. All non-V1 behavior and ACLs remain unchanged; rollback restores the exact September 22 definition and ACLs.

#### Single-Owner Notifications & Auditing
* **FR-024**: `PAYMENT_PROOF_SUBMITTED` is owned solely by the extended database order-status trigger `trg_notify_order_status_change` after a committed finalization transition; neither the finalization RPC nor a Server Action inserts it.
* **FR-025**: `PAYMENT_CONFIRMED` is owned solely by that order-status trigger on `PAID`, deduped by `order_id:PAID` and addressed using the existing Feature 014 `orders.created_by` / `orders.buyer_organization_id` recipient model.
* **FR-026**: `PAYMENT_REJECTED` is owned solely by that order-status trigger on `PAYMENT_REJECTED`, deduped by `order_id:PAYMENT_REJECTED` and addressed using the same existing recipient model.
* **FR-027**: No current shipment notifier exists. Feature 016 MUST add `commerce_notify_shipment_status_change()` and `trg_notify_shipment_status_change` to own `DELIVERY_HANDOFF_REQUESTED` only for a FULFILLMENT `DRAFT` → `REQUESTED` transition. It addresses active `organization_members` of `warehouses.owner_organization_id` for `fulfillment_warehouse_id`, with per-recipient dedupe on `(user_id, notification_type, entity_type = 'order_shipments', entity_id = shipment_id)` and event identity `shipment_id:REQUESTED`. The forward migration creates, rollback removes, and postflight pins both.
* **FR-028**: System MUST insert an audit entry into `public.audit_logs` for every review decision.

---

## 4. Success Criteria *(mandatory)*

* **SC-001**: 100% of confirmed orders conserve total inventory: signed sum $\Delta\text{seller\_available} + \Delta\text{buyer\_available} = 0$, seller decrease magnitude equals buyer increase magnitude equals consumed reservation quantity.
* **SC-002**: 100% of confirmed orders automatically produce Feature 009 `FULFILLMENT` shipments matching proforma fulfillment groups in `REQUESTED` status, with lines restricted strictly to each group (`pii.fulfillment_group_id = v_group.id`).
* **SC-003**: 100% of rejected orders release backing positions before offers, restore available stock, and close terminally without re-upload affordances.
* **SC-004**: 100% of duplicate calls or replays with matching request IDs validate persisted terminal integrity and return deterministic idempotent results.
* **SC-005**: Zero deadlocks observed between concurrent `finance_review_bank_transfer_v1` and legacy `admin_review_payment` calls.
* **SC-006**: Zero unauthorized or unauthenticated callers can execute the review RPC or access private payment proof download URLs.
* **SC-007**: 100% of live remote database verification runs execute under the dedicated `F016_REMOTE_LIVE_DB_APPROVED=1` gate.
* **SC-008**: Live verification includes same-key/different-payment conflict, missing-or-corrupt same-key review integrity failure, and individually corrupt CONFIRMED invoice, ownership, and fulfillment-shipment replay artifacts; none may yield cached or truthful-success output.

---

## 5. Out of Scope

1. **Seller Payouts & Settlement**: No creation of `payouts` rows, no distribution of funds to sellers, no commission release.
2. **Stripe Runtime Retirement**: Removal of Stripe npm packages or webhook endpoints (deferred to Feature 017).
3. **Broad Legacy RPC Deletion**: Dropping deprecated RPCs (`checkout_order`, `submit_payment_proof`) deferred to Feature 017.
4. **Separate Mobile App**: Console is responsive web only.

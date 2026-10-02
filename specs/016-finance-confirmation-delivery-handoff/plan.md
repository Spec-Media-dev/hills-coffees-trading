# Implementation Plan: Feature 016 — Finance Confirmation & Delivery Handoff (Final Planning Correction Pass)

**Branch**: `016-finance-confirmation-delivery-handoff` | **Date**: 2026-10-01 | **Spec**: [spec.md](file:///c:/Users/Dell/OneDrive/Documents/GitHub/hills-coffees-trading/specs/016-finance-confirmation-delivery-handoff/spec.md)  
**Input**: Feature specification from `specs/016-finance-confirmation-delivery-handoff/spec.md` (fully corrected post-Codex review)

---

## 1. Summary

Feature 016 implements the authoritative Finance Review and Delivery Handoff boundary for manual bank transfers on the Hills Coffee platform. It delivers:

1. **An atomic, idempotent database RPC `public.finance_review_bank_transfer_v1`** executing either:
   * **CONFIRM**: Payment becomes `CONFIRMED`, order becomes `PAID`, reservation becomes `CONSUMED`. Total inventory is strictly conserved: for each line in `inventory_reservation_items` with quantity $q$, signed deltas are $\Delta\text{seller\_available} = -q, \Delta\text{seller\_reserved} = -q, \Delta\text{buyer\_available} = +q$. Platform on-hand delta is $\Delta\text{seller} + \Delta\text{buyer} = 0$. Buyer positions are credited null-safely. Title transfer events are immutably recorded in `inventory_ownership_events` (`SALE`/`RESALE`). A final `tax_invoices` record is issued (`INV-...`). Feature 009 fulfillment is automatically initiated: exactly one `order_shipments` record per `proforma_fulfillment_groups` (`shipment_kind = 'FULFILLMENT'`) following `DRAFT` → insert `shipment_items` (strictly filtered by `pii.fulfillment_group_id = v_group.id`) → `REQUESTED` under `app.internal_transition = true`. Destination details map `address_lines` JSON array into `address_line` text, preserving the frozen `delivery_method` from the fulfillment group.
   * **REJECT (Terminal)**: Payment becomes `REJECTED`, order becomes `PAYMENT_REJECTED`, reservation becomes `RELEASED` (`release_reason = 'REJECTED'`). Release writes strictly decrement backing `inventory_positions.reserved_quantity_kg` before `coffee_offers.reserved_quantity_kg`. The exact finalized proof transitions to `REJECTED`. Rejection is strictly terminal.
2. **Authoritative Proforma & Exact Proof Binding**:
   * Sourced strictly against the authoritative `CONFIRMED` proforma produced by Feature 015 checkout. (Does NOT require `ISSUED`).
   * Sourced strictly against the exact proof identified by `payment_proof_upload_intents.finalized_proof_id`. Only that exact proof is mutated; `payment_proofs` has no `updated_at` column.
3. **Truthful Idempotency & Persisted Integrity**:
   * Uses 3-argument `commerce_request_begin(p_request_id, 'finance_review_bank_transfer_v1', p_order_id)`.
   * Same-key replay mandates a matching persisted `public.payment_reviews` row. If missing or corrupt, it fails closed with `persisted_review_integrity_error`; replay validates terminal reality and never fabricates payloads.
   * A different request ID on a terminal order validates and reconstructs from the original authoritative review without creating another; same decision succeeds without mutation and opposite decision throws conflict.
4. **Null-Safe Buyer Position Migration & Concurrency**:
   * `UNIQUE NULLS NOT DISTINCT (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)`.
   * Owner Decision: Zero auto-merging of pre-existing duplicates. Migration preflight detects duplicates and ABORTS migration if any exist.
   * Concurrency locking protocol: deterministic sorted advisory locks on buyer logical keys, then global lock in ascending UUID order across all source and buyer positions.
5. **Single-Owner Notification Architecture**:
   * `PAYMENT_PROOF_SUBMITTED` notification is owned SOLELY by database trigger `trg_notify_order_status_change` upon committed transition into `PAYMENT_PROOF_SUBMITTED`. Zero duplicate inserts from `finalize_payment_proof`.
6. **Pre-Lock Legacy Fence**:
   * `public.admin_review_payment` preserves the latest Feature 008 September 22 body and ACLs, including `trusted_funding_required`; it adds only a zero-mutation, read-only `commerce_flow` fence before its existing workflow locks, aborting `BANK_TRANSFER_V1` immediately.
7. **Exact Pre-016 Rollback Baselines**:
   * Documents and restores exact baseline migrations and definitions for `admin_review_payment`, `commerce_notify_order_status_change`, and `validate_order_transition`.
8. **Dedicated Feature 016 Live Test Harness**:
   * Gated strictly by `F016_REMOTE_LIVE_DB_APPROVED=1` against target project `mxejnutukgxyccnohglo` with 29 mandatory live scenarios.

---

## 2. Technical Context

* **Language/Version**: TypeScript 5.6+, Node.js v20+, PostgreSQL 15+ (Supabase)
* **Primary Dependencies**: Next.js 16.3.4 (App Router), React 19.2.8, Zod 4.5.4, `@supabase/supabase-js` v2, Lucide React, Vitest
* **Storage**:
  * PostgreSQL: `orders`, `payments`, `payment_proof_upload_intents`, `payment_proofs`, `payment_reviews`, `inventory_reservations`, `inventory_reservation_items`, `proforma_invoices`, `proforma_invoice_items`, `proforma_fulfillment_groups`, `inventory_ownership_events`, `inventory_positions`, `coffee_offers`, `order_shipments`, `shipment_items`, `tax_invoices`, `notifications`, `audit_logs`
  * Supabase Storage: Private bucket `payment-proofs`
* **Testing**: Vitest (Unit, Zod contracts, live database integration, concurrency, RLS/security)
* **Target Platform**: Responsive Web (Chrome, Edge, Safari, Firefox on Desktop, Tablet, and Mobile browsers)
* **Target Database**: `mxejnutukgxyccnohglo`
* **Performance Goals**:
  * Atomic review RPC commit: < 250ms p95
  * Admin payments queue load: < 150ms p95

---

## 3. Constitution Check

* **Principle I (Project Identity & Scope Boundary)**: PASS. Reinforces private B2B green-coffee trade settlement and physical custody without open exchange or speculative mechanics.
* **Principle II (Source-of-Truth Priority)**: PASS. Reuses authoritative database schema and SRS operational flows.
* **Principle III (Database Authority)**: PASS. Transactional truth enforced at the PostgreSQL layer via atomic `SECURITY DEFINER` RPC with strict row locks.
* **Principle V & VIII (Authorization & Roles)**: PASS. Enforces `is_finance_operator()` / `is_platform_admin()`, non-blocked status, and mandatory MFA attestation.
* **Principle XI (Next.js-Native Caching Only)**: PASS. All finance queue reads and review decisions run fresh against the database with zero external caching infrastructure.
* **Principle XIV (Security & Secrets Handling)**: PASS. Private storage paths remain unexposed; temporary signed URLs generated server-side with 15-minute expiry.
* **Principle XV (Spec-Driven Lifecycle)**: PASS. Complete alignment across `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.

---

## 4. Project Structure

### Documentation (`specs/016-finance-confirmation-delivery-handoff/`)
```text
specs/016-finance-confirmation-delivery-handoff/
├── spec.md                     # Feature specification (all Codex corrections applied)
├── plan.md                     # Implementation plan (this file)
├── research.md                 # Technical context & architecture decisions
├── data-model.md               # Entity state machines, schemas, RLS
├── quickstart.md               # 29-point live verification checklist
├── contracts/
│   ├── database-rpc.md         # finance_review_bank_transfer_v1 contract
│   └── server-actions.md       # confirm/reject/signed-url actions contract
└── checklists/
    └── requirements.md         # Requirements completeness checklist
```

### Source Code (`src/`, `lib/`, `supabase/`, `tests/`)
```text
supabase/
├── migrations/
│   └── 20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql
├── rollback/
│   └── 20261002100000_feature_016_finance_confirmation_and_delivery_handoff.rollback.sql
└── maintenance/
    └── 20261002_feature_016_review_postflight.sql

lib/
├── finance/
│   ├── review.ts               # DAL review execution service
│   ├── read.ts                 # Extended with queue and review inspector reads
│   └── types.ts                # DTOs and return shapes
├── admin/
│   └── areas.ts                # Update 'payments' availability to 'live'
└── notifications/
    └── types.ts                # Add PAYMENT_PROOF_SUBMITTED, PAYMENT_CONFIRMED, PAYMENT_REJECTED, DELIVERY_HANDOFF_REQUESTED

src/app/dashboard-admin/(finance)/payments/
├── page.tsx                    # Replaces AdminAreaPlaceholder with PaymentsReviewPage
├── actions.ts                  # Server Actions (confirm, reject, signed URL)
└── loading.tsx                 # Loading skeleton

components/admin/finance/
├── payments-queue-table.tsx    # Responsive queue list with status filters
├── payment-inspector-sheet.tsx # Commercial snapshot & private proof viewer
├── confirm-payment-modal.tsx   # Approval confirmation with operator notes
└── reject-payment-modal.tsx    # Rejection dialog with mandatory reason

tests/
├── finance/
│   ├── review-actions.test.ts  # Unit tests for Server Actions & Zod schemas
│   ├── review-dal.test.ts      # DAL unit tests & error mapping
│   ├── f016-concurrency.test.ts # Concurrency (Confirm vs Reject, double confirm)
│   └── f016-live-db.test.ts    # 29-scenario live DB integration suite
```

---

## 5. Implementation Phases

### Phase 1 — Database Migration & Postflight (Day 1)
1. **Migration Authoring**:
   * Preflight script: Detect duplicate logical inventory positions; abort migration if any exist (zero auto-merging).
   * Add null-safe buyer position constraint: `uq_inventory_positions_null_safe`.
   * Implement `public.finance_review_bank_transfer_v1` with signed inventory conservation, deterministic buyer/source locking, truthful replay validation, exact CONFIRMED proforma and finalized proof binding, and Feature 009 FULFILLMENT handoff (exact group line membership, `address_lines` mapping, preserved delivery method).
   * Starting from `20260922120000_feature_008_stripe_trusted_funding.sql`, add only the read-only pre-lock V1 fence to `public.admin_review_payment`; preserve its complete provider/legacy behavior, `trusted_funding_required`, and ACLs.
   * Extend `public.commerce_notify_order_status_change` on `trg_notify_order_status_change` for `PAYMENT_PROOF_SUBMITTED`, `PAID`, `PAYMENT_REJECTED`; add the absent shipment owner `commerce_notify_shipment_status_change()` / `trg_notify_shipment_status_change` for FULFILLMENT `DRAFT → REQUESTED` only.
   * Set `app.internal_transition` transaction-locally before the first Feature 016 inventory/ownership, tax-invoice, FULFILLMENT shipment, shipment-transition, or internal order/reservation write.
2. **Rollback & Postflight**:
   * Restore exact pre-016 bodies and ACLs: `admin_review_payment` from `20260922120000_feature_008_stripe_trusted_funding.sql` (including `trusted_funding_required`) and `commerce_notify_order_status_change` from `20260929100000_feature_014_notifications_lifecycle.sql`; drop the new finance RPC and shipment notifier/trigger. `validate_order_transition` is not modified because the Feature 015 body already permits the required internal V1 edges.
   * Postflight pins signatures, SECURITY DEFINER/search paths, ACLs, trigger bindings, the preserved September 22 trusted-funding gate, the untouched Feature 015 order fence, Feature 009 prerequisites, the null-safe unique constraint, and untouched payout objects.

### Phase 2 — DAL Services & Server Actions (Day 2)
1. **DAL Services**:
   * Implement `lib/finance/review.ts` wrapping RPC invocation and domain error mapping.
   * Add `getPendingPaymentsQueue()` and `getPaymentReviewDetail()` in `lib/finance/read.ts`.
   * Add `getPaymentProofSignedUrl()` generating 15-minute download URLs.
2. **Server Actions**:
   * Create `src/app/dashboard-admin/(finance)/payments/actions.ts`.
   * Implement `confirmPaymentProofAction`, `rejectPaymentProofAction`, `getProofSignedUrlAction` using Zod 4.5.4 schemas.
   * Unit test all input schemas and auth gates.

### Phase 3 — Admin Operations UI (Day 3)
1. **Area Registry**:
   * Update `lib/admin/areas.ts` setting `payments` area availability to `"live"` and removing blocker.
2. **Components**:
   * Build `PaymentsQueueTable` with search and status badges.
   * Build `PaymentInspectorSheet` supporting proforma breakdown and embedded proof viewer.
   * Build `ConfirmPaymentModal` and `RejectPaymentModal`.
3. **Page Assembly**:
   * Update `src/app/dashboard-admin/(finance)/payments/page.tsx` rendering the queue and detail sheet.
   * Test responsive rendering at 375px, 768px, and 1280px+ viewports.

### Phase 4 — Testing & Live Supabase Verification (Day 4)
1. **Unit & Contract Suite**: Verify all schemas, DAL functions, and error translators.
2. **Live Integration Tests (29 Scenarios)**:
   * Execute `tests/finance/f016-live-db.test.ts` under `F016_REMOTE_LIVE_DB_APPROVED=1` using the independently refactored direct PostgreSQL harness (no Feature 015 approval flag).
   * Verify all 29 mandatory scenarios from `quickstart.md`, including same-key/different-payment conflict, missing/corrupt same-key review integrity failure, and individually corrupt CONFIRMED invoice/ownership/shipment replay artifacts.
3. **Remote Deployment & Sign-Off**: Run postflight verification on remote Supabase instance.

---

## 6. Complexity & Risk Tracking

| Risk Finding | Severity | Resolution & Mitigation in Plan |
| :--- | :---: | :--- |
| **HIGH 1: Shipment Group Membership & Destination Mapping** | High | Sourced strictly per `proforma_fulfillment_groups`; `shipment_items` filtered strictly by `pii.fulfillment_group_id = v_group.id`; proforma `address_lines` array mapped to `address_line`; frozen `delivery_method` preserved (never hardcoded); all required fields populated. |
| **HIGH 2: Proforma & Proof Binding** | High | Requires `payments.proforma_id = orders.current_proforma_id = inventory_reservations.proforma_id = CONFIRMED proforma.id`; binds the exact proof via `payment_proof_upload_intents.finalized_proof_id`; fails closed before mutation. |
| **HIGH 3: Truthful Idempotency & Replay** | High | Same-key replay requires matching-key review, payment, decision, and actor; different-key terminal replay uses the original authoritative review without creating another. Both validate complete terminal state and fail closed on missing/corrupt reviews or CONFIRMED invoice/ownership/shipment artifacts. |
| **HIGH 4: Duplicate Positions & Concurrency** | High | Preflight detects duplicate logical positions and ABORTS migration (no auto-merging); deterministic concurrency uses sorted advisory locks on buyer keys followed by global ascending UUID locks on all source and buyer positions. |
| **MEDIUM 1: Single Notification Owner** | Med | Order-status trigger solely owns `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_CONFIRMED`, and `PAYMENT_REJECTED` using Feature 014's buyer-recipient model; the new shipment-status trigger solely owns FULFILLMENT `DELIVERY_HANDOFF_REQUESTED` for active `organization_members` of `warehouses.owner_organization_id`, with per-recipient dedupe. Server Actions do not write notifications. |
| **MEDIUM 2: Exact Rollback Baselines** | Med | Exact pre-016 baselines: restore Feature 008 `admin_review_payment` (`20260922120000`) and its ACLs/trusted-funding gate, plus Feature 014 order notifier (`20260929100000`); leave the unmodified Feature 015 order fence (`20260930110000`) byte-for-byte intact and assert it in postflight. Rollback drops Feature 016 RPC/shipment notifier. |
| **MEDIUM 3: Dedicated Live Test Harness** | Med | Refactor `scripts/pg-simple-exec.mjs` and `scripts/f013-local-target.ts#supabaseCli` to select exactly one feature gate; add the Feature 016 caller/helper. F016 accepts `F016_REMOTE_LIVE_DB_APPROVED=1`, exact target identity, environment-only credentials and bounded timeout without `F013_LIVE` or `F015_REMOTE_LIVE_DB_APPROVED`. |
| **LOW: Signed Conservation Equations** | Low | Signed equations: $\Delta\text{seller} = -q, \Delta\text{buyer} = +q$, sum $= 0$. Magnitude: seller decrease $= q$, buyer increase $= q$. Never equates signed deltas as both positive. |

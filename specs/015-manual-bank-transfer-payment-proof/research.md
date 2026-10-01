# Research and Technical Decisions: Feature 015

**Status:** Corrected pre-implementation decisions based on current repository migrations.

## Current implementation facts

* `add_cart_line` leaves a buyer order in `DRAFT`; it does not reserve inventory. This remains unchanged.
* Current checkout is split: `requestProforma → issue_proforma` creates a Feature 013 proforma as `ISSUED`; `confirmReservation → confirm_proforma` later creates the hold.
* The Feature 013 snapshot trigger accepts a new `BANK_TRANSFER_V1` proforma only as `ISSUED` while its order is `DRAFT`, and permits confirmation only as an `ISSUED → CONFIRMED` update with paired confirmation fields.
* Existing `confirm_proforma` locks offers by UUID, positions by UUID, and aggregates demand by backing position. Feature 015 must preserve that rule.
* `commerce_release_reservation` releases only expired `ACTIVE` holds. Existing `REVIEW_HOLD` is therefore excluded from the current sweeper/release path.
* Feature 014 creates an in-app `ORDER_PROFORMA_ISSUED` notice from the `PROFORMA_ISSUED` order transition. New direct `DRAFT → HOLD` checkout would otherwise lose that notice.

## Decisions

### 1. Atomic checkout and proforma lifecycle

**Decision:** One database transaction locks, quotes, reserves, issues the complete frozen proforma as `ISSUED`, transitions it to `CONFIRMED`, snapshots bank instructions, creates one `PENDING` payment and changes the order to `HOLD`.

**Rationale:** This satisfies the existing Feature 013 trigger and preserves immutable commercial semantics. Direct insertion as `CONFIRMED` is invalid.

### 2. Aggregate inventory check

**Decision:** Sum requested quantities by backing inventory position before availability checks and position reservation updates.

**Rationale:** Multiple offers can point at one position. Per-line checks allow their combined demand to exceed available stock.

### 3. Payment value derivation

**Decision:** Insert `payments.amount` and `payments.expected_amount` from the confirmed proforma `buyer_total`, and currency from the confirmed snapshot.

**Rationale:** The current `payments.amount` is non-null; neither value can be client input.

### 4. Persisted upload identity

**Decision:** Prepare persists a single-use upload intent before upload. The intent owns the exact bucket/path and is finalized or cleaned under lock. Finalize accepts only intent ID, never filename or raw path.

**Rationale:** A server-returned UUID without persistence does not prevent browser-controlled object identity.

### 5. Proof RLS is coordinated across all read surfaces

**Decision:** Storage, `payment_proofs`, proof-linked `file_assets`, and upload-intent access share a capability-based predicate. Generic buyer membership does not meet the requirement.

**Rationale:** Existing generic policies would allow buyer-org members without `can_buy` to read proof metadata or assets.

### 6. Deadline and release race

**Decision:** The serialized database deadline decision is `expires_at > clock_timestamp()` while finalize holds order, reservation, payment and intent locks. Expiry takes the release path and returns the actual release result without throwing; timely finalize atomically changes the reservation to `REVIEW_HOLD`.

**Rationale:** This defines winner semantics for an upload that started before expiry but arrives late, and prevents exception rollback from undoing stock restoration.

### 7. Notification preservation

**Decision:** Atomic checkout explicitly creates one idempotent Feature 014-compatible `ORDER_PROFORMA_ISSUED` in-app notification linked to the proforma while the existing `HOLD` transition creates `RESERVATION_CONFIRMED`. Feature 015 emits no payment-proof notification.

**Rationale:** The old status-trigger path disappears with direct checkout.

### 8. Legacy cutover (FINAL OWNER AUTHORITY)

**Decision:** All currently existing commerce/order/proforma data in all non-production environments is TEST / DEMO DATA ONLY. There are no real customer orders, no real paid orders, and no real in-flight legacy `BANK_TRANSFER_V1` orders requiring completion. Therefore, NO legacy in-flight manifest compatibility is required, and NO existing `PROFORMA_ISSUED` order needs to remain confirmable. `issue_proforma` and `confirm_proforma` are unconditionally fenced for the new Feature 015 flow, returning `endpoint_deprecated_use_checkout_v1`. `requestProforma` and `confirmReservation` are deprecated and disabled accordingly.

**Rationale:** Per Final Owner Authority, backward-compatible completion for demo data is waived. An unconditional fence is cleaner, safer, eliminates maintenance of an in-flight manifest table or list, and ensures immediate, unambiguous cutover to atomic checkout.

### 9. Owner decisions

**Decision:** Bucket identifier and maximum size are formally owner-approved:
1. Bucket identifier: `payment-proofs` (`public = false`, payment-proof use only, strict least privilege).
2. Maximum file size: `10485760` bytes (10 MB) (allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`).

**Rationale:** The owner has explicitly approved both parameters; they are now authoritative specifications for all migration, intent, storage, and UI implementations.

## Remaining non-Feature-015 policy decision

Late transfer reconciliation, refund, or reissuance stays open for Owner/Finance and is not implemented here. An expired proof never recreates a hold or marks payment as paid.

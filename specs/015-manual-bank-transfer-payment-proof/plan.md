# Implementation Plan: Feature 015 — Manual Bank Transfer and Payment Proof

**Status:** Corrected planning package. Owner decision gates are approved and recorded.

## Technical context

* **Runtime:** Next.js 16.3.4, React 19.2.8, TypeScript 5, Vitest 3.2.7, PostgreSQL/Supabase.
* **Authority:** PostgreSQL owns commercial state, inventory, expiry, permission revalidation and idempotency. Server Actions validate transport inputs and do not replace database authorization.
* **Scope end:** `PAYMENT_PROOF_SUBMITTED` / `PROOF_SUBMITTED` / Pending Verification. Feature 016 owns every review, paid, inventory-sale, delivery, settlement and payout transition.

## Approved owner decisions

The owner has formally approved both authoritative configuration parameters for Feature 015:
1. **Dedicated Private Storage Bucket**: `payment-proofs` (`public = false`, dedicated to payment proofs only, strict least-privilege Storage RLS, exact upload-intent identity, no public URLs, no seller/warehouse/cross-tenant/anonymous access).
2. **Maximum Upload Size**: `10485760` bytes (10 MB) (allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`).

These approved values are the authoritative source for all migration, intent, UI, and test configurations.

## Design

### Atomic checkout

Checkout is the only new-order reservation boundary. Add to Cart remains zero-reservation. The checkout RPC locks the order, revalidates buyer/destination/listings, locks offers then distinct backing positions by ascending UUID, aggregates quantity by position, computes the approved AE 5% VAT quote, and creates one hold. Any failure rolls back reservation, proforma, payment and inventory changes together.

The proforma transaction must use the established Feature 013 lifecycle: insert complete snapshot as `ISSUED` while `DRAFT`, then transition it to `CONFIRMED` with required confirmation fields in the same transaction. It then creates a payment where `amount` and `expected_amount` equal the confirmed `buyer_total` and updates the order to `HOLD`.

### Upload and finalization

Prepare persists one short-lived, single-use upload intent. The server constructs its exact bucket/path as `org/<org>/orders/<order>/<intent>/proof`; a filename is display-only metadata. Storage writes and reads resolve through the persisted intent, never raw path components or browser-provided filenames.

Finalize locks the intent, order, reservation and payment. The database deadline decision is evaluated with `clock_timestamp()` while those locks are held. A timely decision makes the reservation `REVIEW_HOLD` and records one proof. An expired decision calls the release function, captures its actual boolean result, verifies terminal state, and returns a structured non-exception response. A live test races finalize against the sweeper.

### Proof isolation

Feature-specific policies cover Storage, `payment_proofs`, proof-linked `file_assets`, and upload intents. Access requires active, MFA-satisfied buyer membership with `organization_can_buy`; Finance/Admin can read but never upload. Sellers, warehouse users, unrelated organizations, anonymous users, and non-buying buyer members are denied.

### Notifications

Direct `DRAFT → HOLD` retains the existing reservation-confirmed notification. The checkout transaction also emits exactly one idempotent in-app `ORDER_PROFORMA_ISSUED` notification associated with the created proforma. It emits no proof-submitted notification.

### Cutover (FINAL OWNER AUTHORITY)

**FINAL OWNER AUTHORITY:** All currently existing commerce/order/proforma data in all non-production environments is TEST / DEMO DATA ONLY. There are no real customer orders, no real paid orders, and no real in-flight legacy `BANK_TRANSFER_V1` orders requiring completion. Therefore, NO legacy in-flight manifest compatibility is required, and NO existing `PROFORMA_ISSUED` order needs to remain confirmable. `issue_proforma` and `confirm_proforma` are unconditionally fenced for the new Feature 015 flow (raising `endpoint_deprecated_use_checkout_v1`); `requestProforma` and `confirmReservation` are deprecated and disabled accordingly. Existing demo holds continue only through their current expiry/receipt path. Historical migrations remain untouched.

## Forward migration contents

After the gates, one forward migration will update current functions and policies, add upload intents, add exact Storage and proof-table access controls, amend the order graph, establish checkout/finalize RPCs, add notification compatibility, and apply the unconditional legacy fence. A preflight, postflight and rollback script are authored before migration application. This plan does not create any of those files.

## Validation strategy

Required tests cover zero-reservation cart behavior, atomic rollback and idempotency, shared-position aggregate races, VAT authority, trigger-compatible proforma creation, payments amount derivation, intent identity, direct Storage/table RLS probes, cleanup refusal for final proofs, deadline winner behavior, finalize-versus-sweeper concurrency, cutover fences, Feature 014 notifications, accessibility, typecheck, lint and build.

## Constitution check

The design keeps database authority, fixed search paths, narrow execution privileges, transaction-safe inventory handling and immutable snapshots. It introduces no external payment gateway, notification channel, review workflow, settlement, payout or delivery feature.

# Specification Quality Checklist: Feature 015

**Purpose:** Confirm that the corrected planning package is coherent before implementation.

## Corrected requirements

- [x] Checkout, not Add to Cart, is the reservation boundary.
- [x] Checkout uses aggregate demand per backing position under deterministic locks.
- [x] Proforma creation follows the current Feature 013 `ISSUED → CONFIRMED` trigger lifecycle.
- [x] Payment `amount` and `expected_amount` are server-derived from the confirmed proforma total.
- [x] Proof identity is a persisted exact-object, short-lived, single-use upload intent.
- [x] Filename is display metadata only.
- [x] Storage, `payment_proofs` and proof-linked `file_assets` share the required buying-capability access matrix.
- [x] Finalize has mandatory stable idempotency, a serialized deadline decision, truthful release reporting and a sweeper-race test.
- [x] Feature 014 issuance, hold and expiry notifications are preserved without adding a proof notification.
- [x] Legacy endpoints use an unconditional cutover fence for both direct RPC and Server Action callers per Final Owner Authority.
- [x] Feature 016 review, paid, inventory-sale, delivery, settlement and payout work is excluded.

## Approved owner decisions

- [x] Owner-approved dedicated private proof bucket identifier is recorded: `payment-proofs`.
- [x] Owner-approved maximum proof size in bytes is recorded: `10485760` bytes (10 MB).

Both owner decisions are recorded and approved. The planning package is complete and unblocked.

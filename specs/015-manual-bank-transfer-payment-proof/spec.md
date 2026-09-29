# Feature 015: Manual Bank Transfer and Private Payment Proof

**Status:** Corrected planning specification. Owner decision gates in §10 are recorded and approved.

## 1. Scope and boundary

Feature 015 changes the buyer commercial flow to:

```text
Marketplace → Add to Cart → Checkout → atomic ACTIVE hold (20 minutes)
→ proforma and bank instructions → external transfer → private proof upload
→ timely authoritative finalize → REVIEW_HOLD / PAYMENT_PROOF_SUBMITTED / PROOF_SUBMITTED
→ Pending Verification
```

Feature 015 ends at Pending Verification. It does not create an admin review queue, confirm or reject a payment, mark an order paid, finalize a sale, hand off delivery, or create settlement or payout obligations. Those are Feature 016.

## 2. Invariants

1. Add to Cart creates no reservation, changes no reserved quantity, starts no timer, and leaves inventory purchasable by other buyers.
2. Checkout is the sole new-order reservation boundary. It performs all commercial mutations atomically in PostgreSQL.
3. Inventory is rechecked under lock. Offers are locked by ascending UUID, then distinct backing positions by ascending UUID. Demand is aggregated per position before availability is checked or reserved.
4. A complete Feature 013 proforma snapshot is inserted `ISSUED` while the order is `DRAFT`, then changed to `CONFIRMED` with valid confirmation fields in the same checkout transaction. It is never inserted directly as `CONFIRMED`.
5. The checkout payment has server-derived `amount` and `expected_amount`, each equal to the confirmed proforma buyer total.
6. Browser data never authorizes a tenant, user, object path, filename path component, payable value, currency, bank account, status, or inventory quantity.
7. A proof is submitted only when database finalization commits. A successful byte upload alone does not stop the countdown or display Pending Verification.
8. The database deadline decision is made while finalize holds its required rows. Timely finalization moves the hold to `REVIEW_HOLD`; expiry releases inventory exactly once and returns a structured result without throwing after release.

## 3. Checkout

### User story

As an authorized buyer, I can complete checkout for an AE destination and receive a 20-minute stock hold, a confirmed immutable proforma and approved receiving instructions in one action.

### Requirements

* Buyer eligibility, MFA, organization ownership, active destination, listings, seller eligibility and availability are checked inside the checkout RPC.
* Only an approved, active AE VAT rule at 5% is usable. Non-AE checkout fails closed until a future approved tax policy exists.
* Two simultaneous scarce-stock checkouts yield only safe outcomes: one or more valid winners within aggregate availability, and safe losers with no partial commercial state or counter drift.
* Same request ID replays the original authorized result. A different request ID for an already-held order returns the existing hold without creating another reservation, proforma or payment.
* The result includes only the buyer's order/proforma/payment/reservation identifiers, expiry, frozen total and currency.

## 4. Proforma, bank instructions, and notifications

The checkout transaction creates full immutable commercial and bank snapshots before confirmation. Bank instructions become visible through the valid confirmed-proforma lifecycle, not through an RLS workaround.

Feature 014 buyer notifications remain truthful:

* exactly one in-app `ORDER_PROFORMA_ISSUED` notification for checkout's new proforma;
* exactly one `RESERVATION_CONFIRMED` notification for the `HOLD` transition;
* exactly one `RESERVATION_EXPIRED` notification when an active hold expires; and
* no `PAYMENT_PROOF_SUBMITTED` notification in Feature 015.

Every notification path is idempotent for request replay and does not include bank details, addresses, proof names, amounts beyond the approved existing notification shape, or other PII.

## 5. Private proof upload

### Persisted identity

Prepare creates a database-owned, short-lived, single-use upload intent after locking and authorizing the order's active hold. It returns the exact bucket and opaque canonical path:

```text
org/<buyer-organization-id>/orders/<order-id>/<upload-intent-id>/proof
```

The browser uploads only to that returned identity. A selected file name is display-only metadata held by the intent. It is never accepted by finalize and never affects object lookup, authorization, or cleanup.

### Authorization

Upload requires an authenticated, MFA-satisfied, unblocked buyer with `organization_can_buy` for the owning organization, while the matching intent is `PREPARED` and the reservation remains active and unexpired.

Read access to proof bytes and proof metadata is allowed only to the same class of authorized buyer, Finance, and platform Admin. It is denied to sellers, warehouse users, unrelated organizations, anonymous users, and buyer-organization members without buying capability. This rule applies consistently to Storage, `payment_proofs` and proof-linked `file_assets`.

### Finalize

Finalize accepts required `orderId`, `uploadIntentId`, and stable `requestId`, plus optional customer-claimed transfer metadata. It derives every authoritative identity from the locked intent and order. It checks actual Storage object metadata against the owner-approved MIME and size restrictions, creates one private file asset and one on-time payment proof, then transitions payment, reservation and order together.

An orphan cleanup helper operates only on a locked unfinalized intent. It accepts no raw path or filename and cannot delete a finalized proof or an object belonging to another order or organization.

## 6. Deadline and race rules

`clock_timestamp()` under locks on the order, reservation, payment and upload intent is the deadline authority.

* If finalize observes `expires_at > clock_timestamp()`, it owns the transition to `REVIEW_HOLD`. The existing sweeper can no longer release that reservation.
* If the sweeper or finalize release path wins first, the exact expired `ACTIVE` reservation is released once; finalize returns `{ ok: false, code: 'reservation_expired', released: <actual result> }` after verifying the terminal state.
* An upload that begins before the deadline but reaches the locked finalize decision after it fails safely.
* Replayed finalization, repeated expiry work and unknown client responses are idempotent.

## 7. Legacy flow cutover

A reviewed, read-only preflight must capture exact in-flight `PROFORMA_ISSUED` orders and their valid-until values plus existing `HOLD` orders before migration authoring or application.

After cutover, new `issue_proforma` requests are rejected at direct RPC and `requestProforma` boundaries. `confirm_proforma` and `confirmReservation` are permitted only for manifest-listed, unexpired legacy proformas. Existing holds retain their existing safe expiry or receipt behavior and cannot generate another hold or proforma. Historical migrations remain untouched.

## 8. Functional requirements

* **FR-001:** Add to Cart proves zero reservation, zero timer and zero reserved-quantity mutation.
* **FR-002:** Atomic checkout owns reservation, quote, proforma, bank snapshot and payment creation.
* **FR-003:** Checkout aggregates shared-position demand under deterministic locks and cannot oversell or drift counters.
* **FR-004:** Feature 013 proforma lifecycle and immutable snapshots are honored.
* **FR-005:** AE checkout uses an active approved 5% VAT rule; unsupported destinations fail closed.
* **FR-006:** `payments.amount` and `expected_amount` are derived from the confirmed proforma total.
* **FR-007:** Upload identity is a persisted exact-object intent; filename is display-only.
* **FR-008:** Proof authorization uses buying capability consistently for Storage and database metadata.
* **FR-009:** Finalize request IDs are required and stable across retry; no duplicate proof, asset, payment, proforma, reservation or counter mutation is possible.
* **FR-010:** Finalize and sweeper have defined database-time winner behavior and a truthful non-exception expiry result.
* **FR-011:** Existing Feature 014 issuance, reservation and expiry milestones remain idempotent and proof notifications remain absent.
* **FR-012:** Legacy endpoints have a deterministic manifest-based cutover fence.

## 9. Acceptance scenarios

1. A buyer adds inventory to cart; no reservation exists and another buyer may still checkout it.
2. An eligible AE buyer checks out; the proforma is validly issued then confirmed, one payment is created with both monetary fields equal to the frozen total, and one hold expires in 20 minutes.
3. Multiple offers sharing a position cannot reserve more than that position's available quantity.
4. A buyer prepares an upload, uploads the exact intent object, and finalizes before expiry; only then does Pending Verification appear.
5. A caller cannot upload or finalize a forged path, foreign intent, raw filename path, expired intent, or finalized intent.
6. A non-buying buyer member, seller, warehouse member, unrelated organization and anonymous user are denied object and metadata reads.
7. A finalize/sweeper race produces either one review hold or one truthful expired release, never both and never counter drift.
8. A direct legacy RPC or old action cannot create a new old-flow proforma after cutover; only manifest-listed valid in-flight proformas remain confirmable.

## 10. Owner decisions and activation gates

The following two owner decisions are formally approved and authoritative for Feature 015:

| Decision | Status | Approved Authoritative Value | Requirements / Constraints |
|---|---|---|---|
| Dedicated private proof bucket identifier | **APPROVED** | `payment-proofs` | `public = false`, payment-proof use only, strict least-privilege Storage RLS, exact upload-intent identity, no public URLs, no seller/warehouse/cross-tenant/anonymous access |
| Maximum proof upload size | **APPROVED** | `10485760` bytes (10 MB) | Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png` |

Late-transfer reconciliation/refund/reissue policy remains an Owner/Finance decision for Feature 016 or later. It does not change Feature 015 expiry behavior.

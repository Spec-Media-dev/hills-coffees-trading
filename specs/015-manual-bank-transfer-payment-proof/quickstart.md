# Validation Guide: Feature 015

**Status:** Validation design only. Do not apply a migration or use Production while following this guide.

## Prerequisites

1. Owner-approved bucket identifier and max upload size are recorded.
2. The read-only preflight has been reviewed and its exact cutover manifest is available.
3. A disposable local or test Supabase/PostgreSQL environment has the intended forward migration applied by an authorized implementation workflow.
4. Fixtures include authorized and non-buying buyer members, a seller, warehouse user, finance user, admin, unrelated organization, one shared inventory position backing multiple offers, and an expiring hold.

## Required scenarios

### 1. Cart and checkout

Add to cart and assert no reservation, no timer, and no reserved counters. Then checkout an authorized AE buyer and assert one `ACTIVE` hold with a database 20-minute deadline, a complete proforma inserted `ISSUED` then confirmed with valid lifecycle fields, bank snapshot, and one payment whose `amount` and `expected_amount` equal its confirmed proforma total.

Race buyers for one scarce position, including two offers backed by that position. Assert aggregate availability, no oversell, no negative counters, no drift and no partial records for losers. Replay checkout with the same and a different request ID and assert exactly one commercial record set.

### 2. Upload intent and proof finalization

Prepare an upload and assert a persisted `PREPARED` intent with an exact opaque object path and deadline no later than the hold. Upload bytes to that exact path. Attempt forged organization, arbitrary path, extra path component, filename variation, another intent and expired intent; all must fail.

Finalize using the same intent ID and request ID after an unknown response. Assert one file asset, one proof, `PROOF_SUBMITTED`, `REVIEW_HOLD`, `PAYMENT_PROOF_SUBMITTED`, and Pending Verification only after the committed success response. Confirm that filename is display metadata and is not an RPC object-lookup input.

### 3. Deadline and cleanup

Run finalize just before the locked database deadline and assert `REVIEW_HOLD`. Run finalize after expiry and assert a non-exception `reservation_expired` result whose `released` value matches the release function result and whose rows/counters are terminal and restored. Repeat finalize and sweeper runs without drift.

Run a live finalize-versus-sweeper race with isolated fixtures. Assert exactly one winner: review hold or expiry release. An upload begun before expiry but finalized after the locked decision point must expire.

Attempt cleanup against a raw path, foreign intent and finalized intent; all must fail. An unfinalized same-tenant intent may be cleaned exactly once.

### 4. Security and cutover

Probe Storage, `payment_proofs`, and proof-linked `file_assets` directly. Permit only an authorized buying buyer, Finance and Admin according to the contract; deny non-buying buyer members, seller, warehouse, unrelated organization and anonymous users. Verify privileged staff cannot upload.

After cutover, call `issue_proforma`, `requestProforma`, `confirm_proforma` and `confirmReservation` directly where possible. New legacy issuance must fail. Only manifest-listed, unexpired in-flight proformas may confirm. Existing manifest-listed holds may not create another hold or proforma.

### 5. Notifications and scope

Atomic checkout must create one in-app `ORDER_PROFORMA_ISSUED` and one `RESERVATION_CONFIRMED` notification, with no duplicate on replay. Active-hold expiry creates one expiry notice. Finalizing proof creates no new notification. Verify notifications exclude bank, address, proof-name and other PII.

Verify no Feature 015 code path produces review decisions, `PAID`, sold finalization, delivery, settlement or payout records.

## Commands after implementation

Run only the implementation-created Feature 015 suites plus existing commerce and notification regressions, then:

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
```

Run live race and RLS suites serially against isolated fixtures. Treat any unresolved owner gate, failing isolation probe, incorrect proforma lifecycle, counter drift or unexpected Feature 016 state mutation as a release blocker.

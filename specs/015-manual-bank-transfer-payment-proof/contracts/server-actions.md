# Server Action Contracts: Feature 015

**Status:** Corrected pre-implementation contract. Server Actions are transport and input-validation boundaries; PostgreSQL remains authoritative.

## Shared rules

Every action obtains request identity, requires an authenticated active buyer with buying capability and MFA satisfaction, and sends a mandatory UUID request ID. Browser values are never treated as tenant, price, payment, state, storage-path, or filename authority. A request ID is generated once before the first call and persisted in client state for retries.

## 1. `completeCheckoutOrder`

```ts
CompleteCheckoutInput = z.object({
  orderId: z.string().uuid(),
  destinationId: z.string().uuid(),
  requestId: z.string().uuid(),
});
```

The action calls only `checkout_bank_transfer_v1`. It validates identity for fast feedback, but the RPC repeats authorization, locks the order, derives every commercial value, and owns idempotency. Its successful result redirects to the proforma page. `requestProforma` is not an alternate checkout path after cutover.

## 2. `preparePaymentProofUpload`

```ts
PrepareUploadInput = z.object({
  orderId: z.string().uuid(),
  requestId: z.string().uuid(),
});
```

The input intentionally excludes filename, proof ID, organization ID, path, MIME type, and declared size. The action calls the protected prepare operation, which persists a single-use upload intent and returns:

```ts
{
  uploadIntentId: string;
  bucketName: string;
  objectPath: string;
  expiresAt: string;
  allowedMimeTypes: readonly ["application/pdf", "image/jpeg", "image/png"];
  maxSizeBytes: number;
}
```

The browser may show a selected filename locally. It uploads only to the exact returned bucket/path. If prepare is replayed before expiry, it returns the same valid intent rather than minting another one.

## 3. `finalizePaymentProof`

```ts
FinalizeProofInput = z.object({
  orderId: z.string().uuid(),
  uploadIntentId: z.string().uuid(),
  requestId: z.string().uuid(),
  customerClaimedAmount: z.coerce.number().positive().optional().nullable(),
  customerTransferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  customerBankReference: z.string().trim().min(1).max(80).optional().nullable(),
  customerReferenceText: z.string().trim().max(500).optional().nullable(),
});
```

`uploadIntentId` and `requestId` are retained unchanged for retry after an unknown response. Filename and object path are deliberately absent. The action invokes `finalize_payment_proof`, maps its structured expired result without throwing, and revalidates only after a committed success.

The customer-facing boundary is the database commit: until it returns success, the countdown continues and the UI does not display Pending Verification. The DAL validates all required fields (`order_id`, `proof_id`, `payment_id`, `submitted_at`, `order_status`, `payment_status`, `reservation_status`) authoritatively without synthesis. If any required field is missing or malformed, it fails safely with `commerce_error`. If the locked database deadline has elapsed, the action reports `reservation_expired`; it never reports a successful submission merely because byte upload completed.

## 4. Orphan cleanup

`compensateOrphanProofUpload` is an internal server-only helper, not an exported callable Server Action. It receives only an upload-intent ID from trusted action control flow. It loads and locks the intent, verifies the currently authenticated authorized buyer or an internal service invocation, and deletes only an intent-owned object whose intent is still `PREPARED` or `EXPIRED`. It must refuse `FINALIZED` intents, cross-order IDs, and cross-tenant paths; then marks the intent `CLEANED` atomically. Cleanup failure is observable and retryable, but cannot change commerce state or delete a committed proof.

## 5. Legacy action deprecation (FINAL OWNER AUTHORITY)

Per Final Owner Authority, all existing commerce data in all non-production environments is test/demo data only. `requestProforma` and `confirmReservation` are deprecated and disabled. Calling `confirmReservation` returns `{ ok: false, code: 'endpoint_deprecated_use_checkout_v1' }`. No legacy manifest compatibility path is maintained.

No action implements review, confirmation, rejection, `PAID`, seller settlement, payout, sold finalization, or delivery.

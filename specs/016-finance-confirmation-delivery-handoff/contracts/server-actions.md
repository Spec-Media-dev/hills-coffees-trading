# Feature 016 — Server Actions Contract (Final Planning Correction Pass)

**Feature**: Feature 016 — Finance Confirmation & Delivery Handoff  
**Date**: 2026-10-01  
**Status**: Revised (All Codex Findings Addressed)  
**Environment**: Next.js 16.3.4 (App Router), Zod 4.5.4, React 19.2.8  

---

## 1. Overview

This contract governs the Next.js Server Actions residing in:
[src/app/dashboard-admin/(finance)/payments/actions.ts](file:///c:/Users/Dell/OneDrive/Documents/GitHub/hills-coffees-trading/src/app/dashboard-admin/%28finance%29/payments/actions.ts)

Every action enforces:
* Server-only execution directive (`"use server"`).
* Request identity attestation via `lib/auth/dal.ts#getRequestIdentity()`.
* Strict operational role check (`identity.operationalRoles.includes('FINANCE') || identity.operationalRoles.includes('ADMIN')`).
* MFA step-up verification (`not identity.requiresMfaStepUp`).
* Zod boundary validation matching Zod 4.5.4 APIs.
* Revalidation of `/dashboard-admin/payments` via Next.js `revalidatePath`.
* Standardized return types via `ActionFeedbackResult<T>`.
* Single Notification Owner: Server Actions MUST NOT insert notification rows. `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_CONFIRMED`, and `PAYMENT_REJECTED` are owned by the PostgreSQL order-status trigger; `DELIVERY_HANDOFF_REQUESTED` is owned by the Feature 016 shipment-status trigger.

Both confirmation and rejection delegate internally to the unified database RPC `public.finance_review_bank_transfer_v1` via `lib/finance/review.ts`.

---

## 2. Server Action: `confirmPaymentProofAction`

### 2.1 Signature
```typescript
export async function confirmPaymentProofAction(
  input: ConfirmPaymentProofInput
): Promise<ActionFeedbackResult<ConfirmPaymentProofOutput>>
```

### 2.2 Zod Validation Schema (Zod 4.5.4)
```typescript
export const ConfirmPaymentProofSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  paymentId: z.string().uuid("Invalid payment ID"),
  notes: z.string().trim().max(1000).optional(),
  requestId: z.string().uuid("Invalid request ID"),
}).strict();

export type ConfirmPaymentProofInput = z.infer<typeof ConfirmPaymentProofSchema>;
```

### 2.3 Response Shapes
```typescript
export type ConfirmPaymentProofOutput = {
  orderId: string;
  orderCode: string;
  paymentId: string;
  decision: "CONFIRMED";
  orderStatus: "PAID";
  paymentStatus: "CONFIRMED";
  reservationStatus: "CONSUMED";
  taxInvoiceNumber: string;
  shipmentIds: string[];
  confirmedAt: string;
};
```

---

## 3. Server Action: `rejectPaymentProofAction`

### 3.1 Signature
```typescript
export async function rejectPaymentProofAction(
  input: RejectPaymentProofInput
): Promise<ActionFeedbackResult<RejectPaymentProofOutput>>
```

### 3.2 Zod Validation Schema (Zod 4.5.4)
```typescript
export const RejectPaymentProofSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  paymentId: z.string().uuid("Invalid payment ID"),
  reason: z.string().trim().min(3, "Rejection reason must be at least 3 characters").max(500),
  notes: z.string().trim().max(1000).optional(),
  requestId: z.string().uuid("Invalid request ID"),
}).strict();

export type RejectPaymentProofInput = z.infer<typeof RejectPaymentProofSchema>;
```

### 3.3 Response Shapes
```typescript
export type RejectPaymentProofOutput = {
  orderId: string;
  orderCode: string;
  paymentId: string;
  decision: "REJECTED";
  orderStatus: "PAYMENT_REJECTED";
  paymentStatus: "REJECTED";
  reservationStatus: "RELEASED";
  rejectedAt: string;
};
```

---

## 4. Server Action: `getProofSignedUrlAction`

### 4.1 Signature
```typescript
export async function getProofSignedUrlAction(
  input: GetProofSignedUrlInput
): Promise<ActionFeedbackResult<GetProofSignedUrlOutput>>
```

### 4.2 Zod Validation Schema (Zod 4.5.4)
```typescript
export const GetProofSignedUrlSchema = z.object({
  fileAssetId: z.string().uuid("Invalid file asset ID"),
}).strict();

export type GetProofSignedUrlInput = z.infer<typeof GetProofSignedUrlSchema>;
```

### 4.3 Response Shapes
```typescript
export type GetProofSignedUrlOutput = {
  signedUrl: string;
  expiresInSeconds: number; // 900 (15 minutes)
  mimeType: string;
  filename: string;
};
```

---

## 5. Domain Error Mapping Matrix

The DAL layer maps database exceptions to user-friendly action failure messages:

| Database Exception Code | User-Facing Action Message | HTTP Status Equivalent |
| :--- | :--- | :---: |
| `unauthenticated` | "Authentication required. Please sign in again." | 401 |
| `forbidden` | "You do not have permission to perform finance reviews." | 403 |
| `mfa_required` | "Multi-factor authentication step-up required for finance operations." | 403 |
| `order_not_found` | "The requested order could not be found." | 404 |
| `payment_not_found` | "The requested payment could not be found." | 404 |
| `proforma_not_found` | "Authoritative proforma invoice could not be found for this order." | 404 |
| `proforma_not_confirmed` | "Authoritative proforma invoice is not in CONFIRMED status." | 409 |
| `reservation_not_found` | "Stock reservation could not be found for this order." | 409 |
| `reservation_not_review_hold` | "The review is no longer eligible for an initial decision." | 409 |
| `authoritative_proforma_mismatch` | "Payment, order, and reservation do not identify the same confirmed proforma." | 409 |
| `finalized_upload_intent_not_found` | "Finalized payment proof upload intent could not be verified." | 409 |
| `finalized_proof_not_found` | "Finalized payment proof document record could not be found." | 404 |
| `proof_payment_mismatch` | "The finalized payment proof does not match the payment under review." | 400 |
| `rejection_notes_required` | "A mandatory rejection reason must be provided to reject payment." | 400 |
| `request_id_conflict` | "Request ID conflict: previous review was submitted with different parameters." | 409 |
| `order_already_finalized` | "Order has already been finalized with a different review decision." | 409 |
| `persisted_review_integrity_error` | "Database integrity error: the replayed review could not be verified against complete persisted terminal truth." | 500 |
| `seller_available_insufficient` | "Inventory conservation failure: seller available stock is insufficient." | 500 |
| `seller_reserved_insufficient` | "Inventory conservation failure: seller reserved stock is insufficient." | 500 |

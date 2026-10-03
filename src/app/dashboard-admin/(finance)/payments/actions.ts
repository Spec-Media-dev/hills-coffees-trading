"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestIdentity } from "@/lib/auth/dal";
import { getPaymentProofSignedUrl } from "@/lib/finance/read";
import { executeFinanceReview } from "@/lib/finance/review";
import { ACTION_FEEDBACK, type ActionFeedbackCode, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Feature 016 T024, T025, T026, T039: Finance Confirmation & Delivery Handoff Actions
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS (Constitution VIII, SEC-001, SEC-004):
 * 1. Single Notification Owner (T039):
 *    These Server Actions NEVER insert into `notifications`.
 *    All notification lifecycle events (`PAYMENT_PROOF_SUBMITTED`, `PAYMENT_CONFIRMED`,
 *    `PAYMENT_REJECTED`, and `DELIVERY_HANDOFF_REQUESTED`) are strictly owned and
 *    dispatched by PostgreSQL database triggers (`trg_notify_order_status_change` and
 *    `trg_notify_shipment_status_change`).
 *
 * 2. Operational Authorization Boundary:
 *    Restricted to attested FINANCE, ADMIN, or SUPER_ADMIN operational roles with
 *    MFA satisfied. Fails closed on any role deficit or unverified session.
 *
 * 3. Atomic Single-RPC Delegation:
 *    Review mutations delegate entirely to `public.finance_review_bank_transfer_v1`
 *    through `lib/finance/review.ts`. No application-level two-phase mutations.
 */

// ── Zod Validation Schemas (Zod 4.5.4) ──────────────────────────────────────

export const ConfirmPaymentProofSchema = z
  .object({
    orderId: z.string().uuid("Invalid order ID"),
    paymentId: z.string().uuid("Invalid payment ID"),
    notes: z.string().trim().max(1000).optional(),
    requestId: z.string().uuid("Invalid request ID"),
  })
  .strict();

export type ConfirmPaymentProofInput = z.infer<typeof ConfirmPaymentProofSchema>;

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

export const RejectPaymentProofSchema = z
  .object({
    orderId: z.string().uuid("Invalid order ID"),
    paymentId: z.string().uuid("Invalid payment ID"),
    reason: z.string().trim().min(3, "Rejection reason must be at least 3 characters").max(500),
    notes: z.string().trim().max(1000).optional(),
    requestId: z.string().uuid("Invalid request ID"),
  })
  .strict();

export type RejectPaymentProofInput = z.infer<typeof RejectPaymentProofSchema>;

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

export const GetProofSignedUrlSchema = z
  .object({
    fileAssetId: z.string().uuid("Invalid file asset ID"),
  })
  .strict();

export type GetProofSignedUrlInput = z.infer<typeof GetProofSignedUrlSchema>;

export type GetProofSignedUrlOutput = {
  signedUrl: string;
  expiresInSeconds: number; // 900 (15 minutes)
  mimeType: string;
  filename: string;
};

// ── Shared Authorization Guard ──────────────────────────────────────────────

async function assertFinanceAuthorization(): Promise<{ ok: false; code: ActionFeedbackCode; message: string } | null> {
  const identity = await getRequestIdentity();

  if (identity.kind !== "authenticated") {
    return {
      ok: false,
      code: ACTION_FEEDBACK.ADMIN_ACCESS_DENIED,
      message: "Authentication required. Please sign in again.",
    };
  }

  const isAuthorized =
    identity.operationalRoles.includes("FINANCE") ||
    identity.operationalRoles.includes("ADMIN") ||
    identity.operationalRoles.includes("SUPER_ADMIN");

  if (!isAuthorized) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.ADMIN_ACCESS_DENIED,
      message: "You do not have permission to perform finance reviews.",
    };
  }

  if (identity.requiresMfaStepUp) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED,
      message: "Multi-factor authentication step-up required for finance operations.",
    };
  }

  return null;
}

// ── T024: Confirm Payment Proof Action ──────────────────────────────────────

export async function confirmPaymentProofAction(
  input: ConfirmPaymentProofInput
): Promise<ActionFeedbackResult<ConfirmPaymentProofOutput>> {
  const authError = await assertFinanceAuthorization();
  if (authError) return authError;

  const parsed = ConfirmPaymentProofSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      message: parsed.error.issues[0]?.message ?? "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const reviewResult = await executeFinanceReview({
    orderId: parsed.data.orderId,
    paymentId: parsed.data.paymentId,
    decision: "CONFIRMED",
    notes: parsed.data.notes,
    requestId: parsed.data.requestId,
  });

  if (!reviewResult.ok) {
    return {
      ok: false,
      code: reviewResult.code,
      message: reviewResult.message,
    };
  }

  revalidatePath("/dashboard-admin/payments");
  revalidatePath(`/dashboard-admin/payments?selectedOrder=${parsed.data.orderId}`);

  return {
    ok: true,
    data: {
      orderId: reviewResult.data.orderId,
      orderCode: reviewResult.data.orderCode,
      paymentId: reviewResult.data.paymentId,
      decision: "CONFIRMED",
      orderStatus: "PAID",
      paymentStatus: "CONFIRMED",
      reservationStatus: "CONSUMED",
      taxInvoiceNumber: reviewResult.data.taxInvoiceNumber ?? "",
      shipmentIds: reviewResult.data.shipmentIds ?? [],
      confirmedAt: reviewResult.data.confirmedAt ?? new Date().toISOString(),
    },
    code: ACTION_FEEDBACK.FINANCE_REVIEW_CONFIRMED,
  };
}

// ── T025: Reject Payment Proof Action ───────────────────────────────────────

export async function rejectPaymentProofAction(
  input: RejectPaymentProofInput
): Promise<ActionFeedbackResult<RejectPaymentProofOutput>> {
  const authError = await assertFinanceAuthorization();
  if (authError) return authError;

  const parsed = RejectPaymentProofSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      message: parsed.error.issues[0]?.message ?? "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const reviewResult = await executeFinanceReview({
    orderId: parsed.data.orderId,
    paymentId: parsed.data.paymentId,
    decision: "REJECTED",
    reason: parsed.data.reason,
    notes: parsed.data.notes,
    requestId: parsed.data.requestId,
  });

  if (!reviewResult.ok) {
    return {
      ok: false,
      code: reviewResult.code,
      message: reviewResult.message,
    };
  }

  revalidatePath("/dashboard-admin/payments");
  revalidatePath(`/dashboard-admin/payments?selectedOrder=${parsed.data.orderId}`);

  return {
    ok: true,
    data: {
      orderId: reviewResult.data.orderId,
      orderCode: reviewResult.data.orderCode,
      paymentId: reviewResult.data.paymentId,
      decision: "REJECTED",
      orderStatus: "PAYMENT_REJECTED",
      paymentStatus: "REJECTED",
      reservationStatus: "RELEASED",
      rejectedAt: reviewResult.data.rejectedAt ?? new Date().toISOString(),
    },
    code: ACTION_FEEDBACK.FINANCE_REVIEW_REJECTED,
  };
}

// ── T026: Get Proof Signed URL Action ───────────────────────────────────────

export async function getProofSignedUrlAction(
  input: GetProofSignedUrlInput
): Promise<ActionFeedbackResult<GetProofSignedUrlOutput>> {
  const authError = await assertFinanceAuthorization();
  if (authError) return authError;

  const parsed = GetProofSignedUrlSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      message: parsed.error.issues[0]?.message ?? "Validation failed.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const signed = await getPaymentProofSignedUrl(parsed.data.fileAssetId);
  if (!signed) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.CATALOGUE_NOT_FOUND,
      message: "Finalized payment proof document record could not be found.",
    };
  }

  return {
    ok: true,
    data: signed,
  };
}

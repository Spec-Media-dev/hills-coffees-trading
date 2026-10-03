import { createClient } from "@/lib/supabase/server";
import { mapFinanceReviewError } from "@/lib/finance/errors";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import type { FinanceReviewRpcResult, PaymentReviewDecision } from "@/lib/finance/types";

/**
 * Feature 016 T021/T022: Finance Review Domain Service
 * Single application caller of public.finance_review_bank_transfer_v1.
 * Handles CONFIRMED (T021) and REJECTED (T022) decisions, request-id propagation,
 * response decoding, and contract-safe domain error mapping.
 */

export type ExecuteFinanceReviewInput = {
  orderId: string;
  paymentId: string;
  decision: PaymentReviewDecision;
  notes?: string;
  reason?: string;
  requestId: string;
};

export async function executeFinanceReview(
  input: ExecuteFinanceReviewInput
): Promise<ActionFeedbackResult<FinanceReviewRpcResult>> {
  if (!input.orderId || !input.paymentId || !input.requestId) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      message: "Order ID, Payment ID, and Request ID are required.",
    };
  }

  if (input.decision !== "CONFIRMED" && input.decision !== "REJECTED") {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      message: "Invalid review decision specified.",
    };
  }

  if (input.decision === "REJECTED" && (!input.reason || input.reason.trim().length === 0)) {
    return {
      ok: false,
      code: ACTION_FEEDBACK.VALIDATION_ERROR,
      message: "A mandatory rejection reason must be provided to reject payment.",
    };
  }

  const supabase = await createClient();
  const notesOrReason = input.decision === "REJECTED" ? input.reason!.trim() : (input.notes?.trim() || null);

  const { data, error } = await supabase.rpc("finance_review_bank_transfer_v1", {
    p_order_id: input.orderId,
    p_payment_id: input.paymentId,
    p_decision: input.decision,
    p_notes: notesOrReason,
    p_request_id: input.requestId,
  });

  if (error) {
    const domainError = mapFinanceReviewError(error);
    return {
      ok: false,
      code: ACTION_FEEDBACK.FINANCE_REVIEW_FAILED,
      message: domainError.message,
    };
  }

  if (!data || typeof data !== "object") {
    return {
      ok: false,
      code: ACTION_FEEDBACK.FINANCE_REVIEW_FAILED,
      message: "Database integrity error: finance review returned invalid data.",
    };
  }

  const raw = data as Record<string, unknown>;

  const result: FinanceReviewRpcResult = {
    orderId: String(raw.orderId ?? raw.order_id ?? input.orderId),
    orderCode: String(raw.orderCode ?? raw.order_code ?? ""),
    paymentId: String(raw.paymentId ?? raw.payment_id ?? input.paymentId),
    decision: (raw.decision as PaymentReviewDecision) ?? input.decision,
    orderStatus: (raw.orderStatus ?? raw.order_status) as "PAID" | "PAYMENT_REJECTED",
    paymentStatus: (raw.paymentStatus ?? raw.payment_status) as "CONFIRMED" | "REJECTED",
    reservationStatus: (raw.reservationStatus ?? raw.reservation_status) as "CONSUMED" | "RELEASED",
    taxInvoiceNumber: (raw.taxInvoiceNumber ?? raw.tax_invoice_number) as string | undefined,
    shipmentIds: (raw.shipmentIds ?? raw.shipment_ids) as string[] | undefined,
    confirmedAt: (raw.confirmedAt ?? raw.confirmed_at) as string | undefined,
    rejectedAt: (raw.rejectedAt ?? raw.rejected_at) as string | undefined,
    requestId: String(raw.requestId ?? raw.request_id ?? input.requestId),
  };

  const feedbackCode =
    result.decision === "CONFIRMED"
      ? ACTION_FEEDBACK.FINANCE_REVIEW_CONFIRMED
      : ACTION_FEEDBACK.FINANCE_REVIEW_REJECTED;

  return {
    ok: true,
    data: result,
    code: feedbackCode,
  };
}

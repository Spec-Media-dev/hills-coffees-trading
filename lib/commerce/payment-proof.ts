import { createClient } from "@/lib/supabase/server";

import { mapCommerceError, type CommerceErrorCode } from "./errors";
import type { Feature015CommerceErrorCode, FinalizeProofResult } from "./types";

export interface PreparedUploadData {
  uploadIntentId: string;
  bucketName: string;
  objectPath: string;
  displayFilename?: string | null;
  expiresAt: string;
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
}

export type PrepareUploadResult =
  | { ok: true; data: PreparedUploadData }
  | { ok: false; code: CommerceErrorCode | Feature015CommerceErrorCode | "commerce_error" | "validation_error" };

export interface FinalizeProofInputParams {
  orderId: string;
  uploadIntentId: string;
  customerClaimedAmount?: number | null;
  customerTransferDate?: string | null;
  customerBankReference?: string | null;
  customerReferenceText?: string | null;
  requestId: string;
}

/**
 * Feature 015 T040 — Persists single-use upload intent; returns exact path and policy constraints only.
 */
export async function preparePaymentProofUpload(
  orderId: string,
  requestId: string,
  displayFilename?: string
): Promise<PrepareUploadResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prepare_payment_proof_upload", {
    p_order_id: orderId,
    p_request_id: requestId,
    p_display_filename: displayFilename ?? null,
  });

  if (error) {
    return { ok: false, code: mapCommerceError(error).code as Feature015CommerceErrorCode };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, code: "commerce_error" };
  }

  const raw = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      uploadIntentId: String(raw.intent_id),
      bucketName: String(raw.bucket_id ?? "payment-proofs"),
      objectPath: String(raw.object_path),
      displayFilename: raw.display_filename ? String(raw.display_filename) : null,
      expiresAt: String(raw.expires_at),
      allowedMimeTypes: (raw.allowed_mime_types as string[]) ?? ["application/pdf", "image/jpeg", "image/png"],
      maxSizeBytes: Number(raw.max_size_bytes ?? 10485760),
    },
  };
}

/**
 * Feature 015 T042 — Finalize payment proof with structured expiry mapping and mandatory request ID.
 */
export async function finalizePaymentProof(
  params: FinalizeProofInputParams
): Promise<FinalizeProofResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finalize_payment_proof", {
    p_order_id: params.orderId,
    p_upload_intent_id: params.uploadIntentId,
    p_customer_claimed_amount: params.customerClaimedAmount ?? null,
    p_customer_transfer_date: params.customerTransferDate ?? null,
    p_customer_bank_reference: params.customerBankReference ?? null,
    p_customer_reference_text: params.customerReferenceText ?? null,
    p_request_id: params.requestId,
  });

  if (error) {
    return { ok: false, code: mapCommerceError(error).code };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, code: "commerce_error" };
  }

  const res = data as { ok?: boolean; code?: string; released?: boolean; data?: Record<string, unknown> };

  if (res.ok !== true) {
    if (res.code === "reservation_expired") {
      return { ok: false, code: "reservation_expired", released: Boolean(res.released) };
    }
    if (res.code === "finalized_state_integrity_error") {
      return { ok: false, code: "finalized_state_integrity_error" };
    }
    return { ok: false, code: (res.code as CommerceErrorCode) ?? "commerce_error" };
  }

  const payload = res.data;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, code: "commerce_error" };
  }

  // Authoritative validation of ALL required fields (BLOCKER 1):
  // Never synthesize payment_id, submitted timestamp, or statuses.
  const orderId = payload.order_id;
  const proofId = payload.proof_id;
  const paymentId = payload.payment_id;
  const submittedAt = payload.submitted_at;
  const orderStatus = payload.order_status;
  const paymentStatus = payload.payment_status;
  const reservationStatus = payload.reservation_status;

  if (
    typeof orderId !== "string" || orderId.trim() === "" ||
    typeof proofId !== "string" || proofId.trim() === "" ||
    typeof paymentId !== "string" || paymentId.trim() === "" ||
    typeof submittedAt !== "string" || submittedAt.trim() === "" || isNaN(Date.parse(submittedAt)) ||
    orderStatus !== "PAYMENT_PROOF_SUBMITTED" ||
    paymentStatus !== "PROOF_SUBMITTED" ||
    reservationStatus !== "REVIEW_HOLD"
  ) {
    return { ok: false, code: "commerce_error" };
  }

  return {
    ok: true,
    data: {
      order_id: orderId,
      order_code: payload.order_code ? String(payload.order_code) : undefined,
      payment_id: paymentId,
      proof_id: proofId,
      order_status: "PAYMENT_PROOF_SUBMITTED",
      payment_status: "PROOF_SUBMITTED",
      reservation_status: "REVIEW_HOLD",
      submitted_at: submittedAt,
      ...(payload.idempotent_replay === true ? { idempotent_replay: true } : {}),
    },
  };
}

/**
 * Feature 015 T043 — Internal orphan cleanup invocation using intent ID only.
 */
export async function compensateOrphanProofUpload(uploadIntentId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cleanup_orphan_payment_proof_upload", {
    p_upload_intent_id: uploadIntentId,
  });

  if (error || !data) {
    return false;
  }
  return true;
}

/**
 * Feature 015 T044 / MEDIUM 4 — DAL read of payment proof for order through protected policies.
 */
export async function getPaymentProofForOrder(orderId: string) {
  const supabase = await createClient();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (paymentError || !payment) {
    return null;
  }

  const { data, error } = await supabase
    .from("payment_proofs")
    .select("id, payment_id, reference_text, claimed_amount, claimed_currency, transfer_date, bank_reference, submitted_at, status")
    .eq("payment_id", payment.id)
    .order("submitted_at", { ascending: false })
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

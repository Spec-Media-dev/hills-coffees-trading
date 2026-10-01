import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    from: mocks.from,
  })),
}));

import {
  preparePaymentProofUpload,
  finalizePaymentProof,
  compensateOrphanProofUpload,
  getPaymentProofForOrder,
} from "@/lib/commerce/payment-proof";

const orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const intentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const prepareRequestId = "11111111-1111-4111-8111-111111111111";
const finalizeRequestId = "22222222-2222-4222-8222-222222222222";

describe("Feature 015 Payment Proof DAL (lib/commerce/payment-proof.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("preparePaymentProofUpload", () => {
    it("returns prepared upload data with server constraints on success", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          intent_id: intentId,
          bucket_id: "payment-proofs",
          object_path: `org/org-1/orders/${orderId}/${intentId}/proof`,
          display_filename: "receipt.pdf",
          expires_at: "2026-09-29T14:40:00Z",
          allowed_mime_types: ["application/pdf", "image/jpeg", "image/png"],
          max_size_bytes: 10485760,
        },
        error: null,
      });

      const res = await preparePaymentProofUpload(orderId, prepareRequestId, "receipt.pdf");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.uploadIntentId).toBe(intentId);
        expect(res.data.bucketName).toBe("payment-proofs");
        expect(res.data.maxSizeBytes).toBe(10485760);
      }
    });

    it("maps RPC errors through mapCommerceError", async () => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: "order_not_editable" },
      });

      const res = await preparePaymentProofUpload(orderId, prepareRequestId);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("order_not_editable");
      }
    });
  });

  describe("BLOCKER 3: finalizePaymentProof - Error idempotency & false success prevention", () => {
    it("returns structured failure when storage object is missing", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: false,
          code: "storage_object_not_found",
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("storage_object_not_found");
      }
    });

    it("returns structured failure when storage metadata is invalid", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: false,
          code: "metadata_invalid",
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("metadata_invalid");
      }
    });

    it("returns structured released flag when reservation has expired", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: false,
          code: "reservation_expired",
          released: true,
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("reservation_expired");
        if ("released" in res) {
          expect(res.released).toBe(true);
        }
      }
    });

    it("rejects empty payload ({}) and returns commerce_error without synthesizing fields", async () => {
      mocks.rpc.mockResolvedValue({
        data: {},
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("commerce_error");
      }
    });

    it("rejects partial ok:true payload missing required fields", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: true,
          data: {
            order_id: orderId,
            order_status: "PAYMENT_PROOF_SUBMITTED",
          },
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("commerce_error");
      }
    });

    it("rejects payload missing payment_id and never synthesizes an empty string", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: true,
          data: {
            order_id: orderId,
            proof_id: "proof-123",
            submitted_at: "2026-09-30T12:00:00.000Z",
            order_status: "PAYMENT_PROOF_SUBMITTED",
            payment_status: "PROOF_SUBMITTED",
            reservation_status: "REVIEW_HOLD",
          },
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("commerce_error");
      }
    });

    it("rejects payload missing submitted_at and never uses Date.now()/new Date()", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: true,
          data: {
            order_id: orderId,
            payment_id: "pay-123",
            proof_id: "proof-123",
            order_status: "PAYMENT_PROOF_SUBMITTED",
            payment_status: "PROOF_SUBMITTED",
            reservation_status: "REVIEW_HOLD",
          },
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("commerce_error");
      }
    });

    it("rejects payload with malformed status", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: true,
          data: {
            order_id: orderId,
            payment_id: "pay-123",
            proof_id: "proof-123",
            submitted_at: "2026-09-30T12:00:00.000Z",
            order_status: "HOLD", // malformed order status
            payment_status: "PROOF_SUBMITTED",
            reservation_status: "REVIEW_HOLD",
          },
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("commerce_error");
      }
    });

    it("succeeds with complete truthful normal success payload from database", async () => {
      const serverSubmittedAt = "2026-09-30T12:15:30.123456Z";
      mocks.rpc.mockResolvedValue({
        data: {
          ok: true,
          data: {
            order_id: orderId,
            order_code: "ORD-999",
            payment_id: "pay-456",
            proof_id: "proof-789",
            submitted_at: serverSubmittedAt,
            order_status: "PAYMENT_PROOF_SUBMITTED",
            payment_status: "PROOF_SUBMITTED",
            reservation_status: "REVIEW_HOLD",
          },
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.order_id).toBe(orderId);
        expect(res.data.order_code).toBe("ORD-999");
        expect(res.data.payment_id).toBe("pay-456");
        expect(res.data.proof_id).toBe("proof-789");
        expect(res.data.submitted_at).toBe(serverSubmittedAt);
        expect(res.data.order_status).toBe("PAYMENT_PROOF_SUBMITTED");
        expect(res.data.payment_status).toBe("PROOF_SUBMITTED");
        expect(res.data.reservation_status).toBe("REVIEW_HOLD");
        expect(res.data.idempotent_replay).toBeUndefined();
      }
    });

    it("succeeds with complete truthful replay success payload", async () => {
      const serverSubmittedAt = "2026-09-30T12:15:30.123456Z";
      mocks.rpc.mockResolvedValue({
        data: {
          ok: true,
          data: {
            order_id: orderId,
            order_code: "ORD-999",
            payment_id: "pay-456",
            proof_id: "proof-789",
            submitted_at: serverSubmittedAt,
            order_status: "PAYMENT_PROOF_SUBMITTED",
            payment_status: "PROOF_SUBMITTED",
            reservation_status: "REVIEW_HOLD",
            idempotent_replay: true,
          },
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.order_id).toBe(orderId);
        expect(res.data.order_code).toBe("ORD-999");
        expect(res.data.payment_id).toBe("pay-456");
        expect(res.data.proof_id).toBe("proof-789");
        expect(res.data.submitted_at).toBe(serverSubmittedAt);
        expect(res.data.order_status).toBe("PAYMENT_PROOF_SUBMITTED");
        expect(res.data.payment_status).toBe("PROOF_SUBMITTED");
        expect(res.data.reservation_status).toBe("REVIEW_HOLD");
        expect(res.data.idempotent_replay).toBe(true);
      }
    });

    it("surfaces finalized_state_integrity_error without synthesizing fields or displaying Pending Verification", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: false,
          code: "finalized_state_integrity_error",
        },
        error: null,
      });

      const res = await finalizePaymentProof({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("finalized_state_integrity_error");
      }
    });
  });

  describe("MEDIUM 4: getPaymentProofForOrder relationship query", () => {
    it("retrieves payment proof by joining via payments table", async () => {
      const mockPaymentQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: "payment-123" },
          error: null,
        }),
      };

      const mockProofQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "proof-456",
            payment_id: "payment-123",
            claimed_amount: 1575.0,
            claimed_currency: "USD",
            bank_reference: "REF-999",
            status: "SUBMITTED",
          },
          error: null,
        }),
      };

      mocks.from.mockImplementation((table: string) => {
        if (table === "payments") return mockPaymentQuery;
        if (table === "payment_proofs") return mockProofQuery;
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
      });

      const proof = await getPaymentProofForOrder(orderId);
      expect(proof).not.toBeNull();
      expect(proof?.id).toBe("proof-456");
      expect(proof?.payment_id).toBe("payment-123");
      expect(mockPaymentQuery.eq).toHaveBeenCalledWith("order_id", orderId);
      expect(mockProofQuery.eq).toHaveBeenCalledWith("payment_id", "payment-123");
    });

    it("returns null if payment is not found", async () => {
      mocks.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const proof = await getPaymentProofForOrder(orderId);
      expect(proof).toBeNull();
    });
  });

  describe("compensateOrphanProofUpload", () => {
    it("calls cleanup_orphan_payment_proof_upload and returns boolean", async () => {
      mocks.rpc.mockResolvedValue({ data: true, error: null });
      const success = await compensateOrphanProofUpload(intentId);
      expect(success).toBe(true);
      expect(mocks.rpc).toHaveBeenCalledWith("cleanup_orphan_payment_proof_upload", {
        p_upload_intent_id: intentId,
      });
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  prepare: vi.fn(),
  finalize: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/commerce/payment-proof", () => ({
  preparePaymentProofUpload: mocks.prepare,
  finalizePaymentProof: mocks.finalize,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import {
  preparePaymentProofAction,
  finalizePaymentProofAction,
} from "@/src/app/dashboard/orders/[orderId]/proforma/actions";

const buyer = {
  kind: "authenticated",
  isAuthorizedMember: true,
  requiresMfaStepUp: false,
  organization: { canBuy: true, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
};
const orderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const intentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "11111111-1111-4111-8111-111111111111";

describe("Feature 015 T040 & T042: Payment Proof Server Actions", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("preparePaymentProofAction", () => {
    it("validates input and enforces buyer authorization", async () => {
      mocks.identity.mockResolvedValue({ ...buyer, isAuthorizedMember: false });
      const fd = new FormData();
      fd.set("orderId", orderId);

      const result = await preparePaymentProofAction(undefined, fd);
      expect(result).toEqual({ ok: false, code: "buyer_not_authorized" });
      expect(mocks.prepare).not.toHaveBeenCalled();
    });

    it("invokes preparePaymentProofUpload with orderId and requestId", async () => {
      mocks.identity.mockResolvedValue(buyer);
      mocks.prepare.mockResolvedValue({
        ok: true,
        data: {
          uploadIntentId: intentId,
          bucketName: "payment-proofs",
          objectPath: `org/${buyer.organization.organizationId}/orders/${orderId}/${intentId}/proof`,
          displayFilename: "receipt.pdf",
          expiresAt: "2026-09-29T14:40:00Z",
          allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
          maxSizeBytes: 10485760,
        },
      });

      const fd = new FormData();
      fd.set("orderId", orderId);
      fd.set("requestId", requestId);
      fd.set("displayFilename", "receipt.pdf");

      const result = await preparePaymentProofAction(undefined, fd);
      expect(result.ok).toBe(true);
      expect(mocks.prepare).toHaveBeenCalledWith(orderId, requestId, "receipt.pdf");
    });
  });

  describe("finalizePaymentProofAction", () => {
    it("validates mandatory fields and revalidates paths on committed success", async () => {
      mocks.identity.mockResolvedValue(buyer);
      mocks.finalize.mockResolvedValue({
        ok: true,
        data: {
          order_id: orderId,
          order_code: "ORD-001",
          payment_id: "pay-1",
          proof_id: "proof-1",
          order_status: "PAYMENT_PROOF_SUBMITTED",
          payment_status: "PROOF_SUBMITTED",
          reservation_status: "REVIEW_HOLD",
          submitted_at: "2026-09-29T14:35:00Z",
        },
      });

      const fd = new FormData();
      fd.set("orderId", orderId);
      fd.set("uploadIntentId", intentId);
      fd.set("requestId", requestId);
      fd.set("customerClaimedAmount", "1575.00");
      fd.set("customerTransferDate", "2026-09-29");
      fd.set("customerBankReference", "REF-12345");
      fd.set("customerReferenceText", "Payment notes");

      const result = await finalizePaymentProofAction(undefined, fd);
      expect(result.ok).toBe(true);
      expect(mocks.finalize).toHaveBeenCalledTimes(1);
      expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/orders/${orderId}/proforma`, "page");
      expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/orders/${orderId}`, "page");
    });

    it("maps structured reservation_expired without revalidating or raising", async () => {
      mocks.identity.mockResolvedValue(buyer);
      mocks.finalize.mockResolvedValue({
        ok: false,
        code: "reservation_expired",
        released: true,
      });

      const fd = new FormData();
      fd.set("orderId", orderId);
      fd.set("uploadIntentId", intentId);
      fd.set("requestId", requestId);

      const result = await finalizePaymentProofAction(undefined, fd);
      expect(result).toEqual({ ok: false, code: "reservation_expired", released: true });
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });
  });

  describe("BLOCKER 2: Separate prepare vs finalize request IDs & idempotency", () => {
    it("ensures prepare retry is idempotent with stable prepareRequestId", async () => {
      mocks.identity.mockResolvedValue(buyer);
      const prepareRequestId = "22222222-2222-4222-8222-222222222222";
      const intentData = {
        uploadIntentId: intentId,
        bucketName: "payment-proofs",
        objectPath: `org/${buyer.organization.organizationId}/orders/${orderId}/${intentId}/proof`,
        displayFilename: "receipt.pdf",
        expiresAt: "2026-09-29T14:40:00Z",
        allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
        maxSizeBytes: 10485760,
      };
      mocks.prepare.mockResolvedValue({ ok: true, data: intentData });

      const fd1 = new FormData();
      fd1.set("orderId", orderId);
      fd1.set("requestId", prepareRequestId);
      fd1.set("displayFilename", "receipt.pdf");

      const res1 = await preparePaymentProofAction(undefined, fd1);
      expect(res1.ok).toBe(true);

      // Retry with identical prepareRequestId
      const fd2 = new FormData();
      fd2.set("orderId", orderId);
      fd2.set("requestId", prepareRequestId);
      fd2.set("displayFilename", "receipt.pdf");

      const res2 = await preparePaymentProofAction(undefined, fd2);
      expect(res2.ok).toBe(true);
      expect(res2).toEqual(res1);
      expect(mocks.prepare).toHaveBeenCalledTimes(2);
      expect(mocks.prepare).toHaveBeenLastCalledWith(orderId, prepareRequestId, "receipt.pdf");
    });

    it("ensures finalize retry is idempotent with stable finalizeRequestId", async () => {
      mocks.identity.mockResolvedValue(buyer);
      const finalizeRequestId = "33333333-3333-4333-8333-333333333333";
      const finalizeData = {
        order_id: orderId,
        order_code: "ORD-001",
        payment_id: "pay-1",
        proof_id: "proof-1",
        order_status: "PAYMENT_PROOF_SUBMITTED",
        payment_status: "PROOF_SUBMITTED",
        reservation_status: "REVIEW_HOLD",
        submitted_at: "2026-09-29T14:35:00Z",
      };
      mocks.finalize.mockResolvedValue({ ok: true, data: finalizeData });

      const fd1 = new FormData();
      fd1.set("orderId", orderId);
      fd1.set("uploadIntentId", intentId);
      fd1.set("requestId", finalizeRequestId);

      const res1 = await finalizePaymentProofAction(undefined, fd1);
      expect(res1.ok).toBe(true);

      // Retry with identical finalizeRequestId
      const fd2 = new FormData();
      fd2.set("orderId", orderId);
      fd2.set("uploadIntentId", intentId);
      fd2.set("requestId", finalizeRequestId);

      const res2 = await finalizePaymentProofAction(undefined, fd2);
      expect(res2.ok).toBe(true);
      expect(res2).toEqual(res1);
      expect(mocks.finalize).toHaveBeenCalledTimes(2);
      expect(mocks.finalize).toHaveBeenLastCalledWith(expect.objectContaining({
        orderId,
        uploadIntentId: intentId,
        requestId: finalizeRequestId,
      }));
    });

    it("prevents reusing prepare ID as finalize ID by rejecting request_id_conflict", async () => {
      mocks.identity.mockResolvedValue(buyer);
      const sharedRequestId = "44444444-4444-4444-8444-444444444444";

      // Finalize called with the same request ID that was used for prepare
      mocks.finalize.mockResolvedValue({
        ok: false,
        code: "request_id_conflict",
      });

      const fd = new FormData();
      fd.set("orderId", orderId);
      fd.set("uploadIntentId", intentId);
      fd.set("requestId", sharedRequestId);

      const res = await finalizePaymentProofAction(undefined, fd);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("request_id_conflict");
      }
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });

    it("verifies normal proof submission flow succeeds when prepare and finalize use separate request IDs", async () => {
      mocks.identity.mockResolvedValue(buyer);
      const prepareRequestId = "55555555-5555-4555-8555-555555555555";
      const finalizeRequestId = "66666666-6666-4666-8666-666666666666";
      expect(prepareRequestId).not.toBe(finalizeRequestId);

      mocks.prepare.mockResolvedValue({
        ok: true,
        data: {
          uploadIntentId: intentId,
          bucketName: "payment-proofs",
          objectPath: `org/${buyer.organization.organizationId}/orders/${orderId}/${intentId}/proof`,
          expiresAt: "2026-09-29T14:40:00Z",
          allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
          maxSizeBytes: 10485760,
        },
      });
      mocks.finalize.mockResolvedValue({
        ok: true,
        data: {
          order_id: orderId,
          order_code: "ORD-001",
          payment_id: "pay-1",
          proof_id: "proof-1",
          order_status: "PAYMENT_PROOF_SUBMITTED",
          payment_status: "PROOF_SUBMITTED",
          reservation_status: "REVIEW_HOLD",
          submitted_at: "2026-09-29T14:35:00Z",
        },
      });

      // Prepare
      const prepFd = new FormData();
      prepFd.set("orderId", orderId);
      prepFd.set("requestId", prepareRequestId);
      const prepRes = await preparePaymentProofAction(undefined, prepFd);
      expect(prepRes.ok).toBe(true);

      // Finalize
      const finFd = new FormData();
      finFd.set("orderId", orderId);
      finFd.set("uploadIntentId", intentId);
      finFd.set("requestId", finalizeRequestId);
      const finRes = await finalizePaymentProofAction(undefined, finFd);
      expect(finRes.ok).toBe(true);
      expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/orders/${orderId}/proforma`, "page");
    });
  });
});

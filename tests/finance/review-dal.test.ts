import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import {
  getPendingPaymentsQueue,
  getPaymentReviewDetail,
  getPaymentProofSignedUrl,
} from "@/lib/finance/read";
import {
  mapFinanceReviewError,
  FINANCE_REVIEW_ERROR_MESSAGES,
} from "@/lib/finance/errors";
import type { FinanceReviewErrorCode } from "@/lib/finance/types";

describe("Feature 016 T042: Finance Review DAL & Domain Error Mapping Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Domain Error Mapping Matrix (server-actions.md §5)", () => {
    const errorCodes: FinanceReviewErrorCode[] = [
      "unauthenticated",
      "forbidden",
      "mfa_required",
      "order_not_found",
      "payment_not_found",
      "proforma_not_found",
      "proforma_not_confirmed",
      "reservation_not_found",
      "reservation_not_review_hold",
      "authoritative_proforma_mismatch",
      "finalized_upload_intent_not_found",
      "finalized_proof_not_found",
      "proof_payment_mismatch",
      "rejection_notes_required",
      "request_id_conflict",
      "order_already_finalized",
      "persisted_review_integrity_error",
      "seller_available_insufficient",
      "seller_reserved_insufficient",
    ];

    it.each(errorCodes)("correctly maps database exception '%s'", (code) => {
      const errObj = { message: `Error raised: ${code}` };
      const mapped = mapFinanceReviewError(errObj);
      expect(mapped.code).toBe(code);
      expect(mapped.message).toBe(FINANCE_REVIEW_ERROR_MESSAGES[code]);
    });

    it("falls back to persisted_review_integrity_error for unexpected exceptions", () => {
      const mapped = mapFinanceReviewError({ message: "unexpected_network_timeout" });
      expect(mapped.code).toBe("persisted_review_integrity_error");
      expect(mapped.message).toContain("unexpected_network_timeout");
    });
  });

  describe("getPendingPaymentsQueue data shape and projection", () => {
    it("returns empty array if no orders are pending", async () => {
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({ data: [] }),
            };
          }
          return {};
        }),
      };
      mocks.createClient.mockResolvedValue(supabase);

      const queue = await getPendingPaymentsQueue();
      expect(queue).toEqual([]);
    });

    it("fails deterministically when the proof projection RPC errors", async () => {
      const supabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }),
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "orders") return {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [{ id: "order-1", buyer_organization_id: "org-1", status: "PAYMENT_PROOF_SUBMITTED", created_at: "x" }] }),
          };
          if (table === "payments") return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) };
          if (table === "inventory_reservations") return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) };
          return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) };
        }),
      };
      mocks.createClient.mockResolvedValue(supabase);
      await expect(getPendingPaymentsQueue()).rejects.toThrow("finance_payment_proof_projection_failed:42501");
    });

    it("projects orders and joined payments into valid PaymentQueueItemDTOs", async () => {
      const orderId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
      const paymentId = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
      const proofId = "cccccccc-3333-4333-8333-cccccccccccc";
      const buyerOrgId = "dddddddd-4444-4444-8444-dddddddddddd";

      const supabase = {
        rpc: vi.fn().mockResolvedValue({ data: [{
          finalized_proof_id: proofId, payment_id: paymentId, file_asset_id: "asset-1", proof_status: "SUBMITTED",
          claimed_amount: 5400, claimed_currency: "USD", bank_reference: "WIRE-REF-998877", submitted_at: "2026-10-02T10:30:00Z",
        }] }),
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: orderId,
                    order_code: "HC-ORD-016",
                    buyer_organization_id: buyerOrgId,
                    status: "PAYMENT_PROOF_SUBMITTED",
                    current_proforma_id: "proforma-1",
                    created_at: "2026-10-02T10:00:00Z",
                  },
                ],
              }),
            };
          }
          if (table === "payments") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: paymentId,
                    order_id: orderId,
                    proforma_id: "proforma-1",
                    amount: 5400,
                    currency: "USD",
                    status: "PROOF_SUBMITTED",
                  },
                ],
              }),
            };
          }
          if (table === "payment_proof_upload_intents") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "intent-1",
                    order_id: orderId,
                    status: "FINALIZED",
                    finalized_proof_id: proofId,
                  },
                ],
              }),
            };
          }
          if (table === "payment_proofs") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: proofId,
                    payment_id: paymentId,
                    file_asset_id: "asset-1",
                    status: "SUBMITTED",
                    claimed_amount: 5400,
                    claimed_currency: "USD",
                    bank_reference: "WIRE-REF-998877",
                    submitted_at: "2026-10-02T10:30:00Z",
                  },
                ],
              }),
            };
          }
          if (table === "inventory_reservations") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "res-1",
                    order_id: orderId,
                    proforma_id: "proforma-1",
                    status: "REVIEW_HOLD",
                    expires_at: "2026-10-04T10:00:00Z",
                  },
                ],
              }),
            };
          }
          if (table === "organizations") {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: buyerOrgId,
                    display_name: "Arabica Roasters LLC",
                    legal_name: "Arabica Roasters LLC",
                  },
                ],
              }),
            };
          }
          return {};
        }),
      };
      mocks.createClient.mockResolvedValue(supabase);

      const queue = await getPendingPaymentsQueue();
      expect(queue.length).toBe(1);
      const item = queue[0]!;
      expect(item.orderId).toBe(orderId);
      expect(item.orderCode).toBe("HC-ORD-016");
      expect(item.paymentId).toBe(paymentId);
      expect(item.buyerOrganizationName).toBe("Arabica Roasters LLC");
      expect(item.amount).toBe(5400);
      expect(item.currency).toBe("USD");
      expect(item.claimedAmount).toBe(5400);
      expect(item.bankReference).toBe("WIRE-REF-998877");
      expect(item.reservationStatus).toBe("REVIEW_HOLD");
    });
  });

  describe("getPaymentReviewDetail four-pointer binding & storage redaction", () => {
    it("returns null if order current_proforma_id is not confirmed", async () => {
      const orderId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
      const supabase = {
        rpc: vi.fn().mockResolvedValue({ data: [] }),
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: orderId,
                  order_code: "HC-ORD-016",
                  buyer_organization_id: "buyer-1",
                  current_proforma_id: "proforma-1",
                },
              }),
            };
          }
          if (table === "organizations") {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { display_name: "Buyer" } }) };
          }
          if (table === "payments") {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "pay-1", status: "PROOF_SUBMITTED", amount: 1000, currency: "USD" } }) };
          }
          if (table === "proforma_invoices") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "proforma-1", status: "ISSUED" }, // Not CONFIRMED!
              }),
            };
          }
          if (table === "payment_proof_upload_intents") {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { finalized_proof_id: "proof-1" } }) };
          }
          if (table === "inventory_reservations") {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "res-1", status: "REVIEW_HOLD" } }) };
          }
          return {};
        }),
      };
      mocks.createClient.mockResolvedValue(supabase);

      const detail = await getPaymentReviewDetail(orderId);
      expect(detail).toBeNull();
    });

    it("throws deterministically when the proof asset projection RPC fails", async () => {
      mocks.createClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }) });
      await expect(getPaymentProofSignedUrl("asset-1")).rejects.toThrow("finance_payment_proof_asset_projection_failed:42501");
    });

    it("verifies no storage object paths leak through getPaymentProofSignedUrl", async () => {
      const supabase = {
        rpc: vi.fn().mockResolvedValue({ data: [{
          file_asset_id: "asset-1", bucket_name: "payment-proofs", object_path: "org/123/orders/456/proof.pdf",
          mime_type: "application/pdf", original_name: "bank-wire.pdf",
        }] }),
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "file_assets") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "asset-1",
                  bucket_name: "payment-proofs",
                  object_path: "org/123/orders/456/proof.pdf",
                  mime_type: "application/pdf",
                  original_name: "bank-wire.pdf",
                },
              }),
            };
          }
          return {};
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            createSignedUrl: vi.fn().mockResolvedValue({
              data: { signedUrl: "https://storage.supabase.com/signed/test?token=xyz" },
              error: null,
            }),
          }),
        },
      };
      mocks.createClient.mockResolvedValue(supabase);

      const signed = await getPaymentProofSignedUrl("asset-1");
      expect(signed).not.toBeNull();
      if (signed) {
        expect(signed.expiresInSeconds).toBe(900);
        expect(signed.signedUrl).toContain("https://");
        expect((signed as unknown as Record<string, unknown>).object_path).toBeUndefined();
      }
    });

    it("throws when Storage cannot create a signed URL after a valid projection", async () => {
      mocks.createClient.mockResolvedValue({
        rpc: vi.fn().mockResolvedValue({ data: [{ file_asset_id: "asset-1", bucket_name: "payment-proofs", object_path: "org/a/proof", mime_type: null, original_name: null }], error: null }),
        storage: { from: vi.fn().mockReturnValue({ createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: "storage_denied" } }) }) },
      });
      await expect(getPaymentProofSignedUrl("asset-1")).rejects.toThrow("finance_payment_proof_signed_url_failed:storage_denied");
    });
  });
});

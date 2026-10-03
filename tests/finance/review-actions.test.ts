import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  executeFinanceReview: vi.fn(),
  getPaymentProofSignedUrl: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/finance/review", () => ({
  executeFinanceReview: mocks.executeFinanceReview,
}));
vi.mock("@/lib/finance/read", () => ({
  getPaymentProofSignedUrl: mocks.getPaymentProofSignedUrl,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  confirmPaymentProofAction,
  rejectPaymentProofAction,
  getProofSignedUrlAction,
} from "@/src/app/dashboard-admin/(finance)/payments/actions";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

const validOrderId = "11111111-1111-4111-8111-111111111111";
const validPaymentId = "22222222-2222-4222-8222-222222222222";
const validRequestId = "33333333-3333-4333-8333-333333333333";
const validFileAssetId = "44444444-4444-4444-8444-444444444444";

const financeOperator = {
  kind: "authenticated",
  userId: "user-finance-1",
  operationalRoles: ["FINANCE"],
  requiresMfaStepUp: false,
};

const platformAdmin = {
  kind: "authenticated",
  userId: "user-admin-1",
  operationalRoles: ["ADMIN"],
  requiresMfaStepUp: false,
};

const superAdmin = {
  kind: "authenticated",
  userId: "user-super-admin-1",
  operationalRoles: ["SUPER_ADMIN"],
  requiresMfaStepUp: false,
};

describe("Feature 016 T041: Finance Review Server Actions Authorization & Contract Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authorization Boundary Checks", () => {
    it("allows FINANCE operator to confirm payment", async () => {
      mocks.identity.mockResolvedValue(financeOperator);
      mocks.executeFinanceReview.mockResolvedValue({
        ok: true,
        data: {
          orderId: validOrderId,
          orderCode: "HC-ORD-001",
          paymentId: validPaymentId,
          decision: "CONFIRMED",
          orderStatus: "PAID",
          paymentStatus: "CONFIRMED",
          reservationStatus: "CONSUMED",
          taxInvoiceNumber: "TX-2026-0001",
          shipmentIds: ["ship-1"],
          confirmedAt: "2026-10-02T10:00:00Z",
          requestId: validRequestId,
        },
      });

      const result = await confirmPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        requestId: validRequestId,
      });

      expect(result.ok).toBe(true);
      expect(mocks.executeFinanceReview).toHaveBeenCalledWith({
        orderId: validOrderId,
        paymentId: validPaymentId,
        decision: "CONFIRMED",
        notes: undefined,
        requestId: validRequestId,
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard-admin/payments");
    });

    it("allows SUPER_ADMIN operator to confirm payment", async () => {
      mocks.identity.mockResolvedValue(superAdmin);
      mocks.executeFinanceReview.mockResolvedValue({
        ok: true,
        data: {
          orderId: validOrderId,
          orderCode: "HC-ORD-001",
          paymentId: validPaymentId,
          decision: "CONFIRMED",
          orderStatus: "PAID",
          paymentStatus: "CONFIRMED",
          reservationStatus: "CONSUMED",
          taxInvoiceNumber: "INV-2026-001",
          shipmentIds: ["16020000-0000-0000-0000-000000000001"],
          confirmedAt: "2026-10-02T10:00:00Z",
          requestId: validRequestId,
        },
      });

      const result = await confirmPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        requestId: validRequestId,
      });

      expect(result.ok).toBe(true);
    });

    it("allows ADMIN operator to reject payment", async () => {
      mocks.identity.mockResolvedValue(platformAdmin);
      mocks.executeFinanceReview.mockResolvedValue({
        ok: true,
        data: {
          orderId: validOrderId,
          orderCode: "HC-ORD-001",
          paymentId: validPaymentId,
          decision: "REJECTED",
          orderStatus: "PAYMENT_REJECTED",
          paymentStatus: "REJECTED",
          reservationStatus: "RELEASED",
          rejectedAt: "2026-10-02T10:00:00Z",
          requestId: validRequestId,
        },
      });

      const result = await rejectPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        reason: "Amount does not match proforma total",
        requestId: validRequestId,
      });

      expect(result.ok).toBe(true);
      expect(mocks.executeFinanceReview).toHaveBeenCalledWith({
        orderId: validOrderId,
        paymentId: validPaymentId,
        decision: "REJECTED",
        reason: "Amount does not match proforma total",
        notes: undefined,
        requestId: validRequestId,
      });
    });

    it("denies anonymous callers with authentication required", async () => {
      mocks.identity.mockResolvedValue({ kind: "anonymous" });

      const result = await confirmPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.ADMIN_ACCESS_DENIED);
      expect(mocks.executeFinanceReview).not.toHaveBeenCalled();
    });

    it("denies buyer / member with no operational roles", async () => {
      mocks.identity.mockResolvedValue({
        kind: "authenticated",
        operationalRoles: [],
        requiresMfaStepUp: false,
      });

      const result = await confirmPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.ADMIN_ACCESS_DENIED);
      expect(mocks.executeFinanceReview).not.toHaveBeenCalled();
    });

    it("denies WAREHOUSE operator from performing finance review", async () => {
      mocks.identity.mockResolvedValue({
        kind: "authenticated",
        operationalRoles: ["WAREHOUSE"],
        requiresMfaStepUp: false,
      });

      const result = await rejectPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        reason: "Not eligible",
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.ADMIN_ACCESS_DENIED);
      expect(mocks.executeFinanceReview).not.toHaveBeenCalled();
    });

    it("denies COMPLIANCE operator from performing finance review", async () => {
      mocks.identity.mockResolvedValue({
        kind: "authenticated",
        operationalRoles: ["COMPLIANCE"],
        requiresMfaStepUp: false,
      });

      const result = await confirmPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.ADMIN_ACCESS_DENIED);
    });

    it("denies AUDITOR from performing finance mutations", async () => {
      mocks.identity.mockResolvedValue({
        kind: "authenticated",
        operationalRoles: ["AUDITOR"],
        requiresMfaStepUp: false,
      });

      const result = await confirmPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.ADMIN_ACCESS_DENIED);
    });

    it("denies operator when MFA step-up is required", async () => {
      mocks.identity.mockResolvedValue({
        ...financeOperator,
        requiresMfaStepUp: true,
      });

      const result = await confirmPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED);
      expect(mocks.executeFinanceReview).not.toHaveBeenCalled();
    });
  });

  describe("Input Validation & Rejection Reason Constraint", () => {
    it("fails with validation error if orderId is not a valid UUID", async () => {
      mocks.identity.mockResolvedValue(financeOperator);

      const result = await confirmPaymentProofAction({
        orderId: "invalid-uuid",
        paymentId: validPaymentId,
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    });

    it("fails with validation error if rejection reason is less than 3 characters", async () => {
      mocks.identity.mockResolvedValue(financeOperator);

      const result = await rejectPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        reason: "no",
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
      expect(mocks.executeFinanceReview).not.toHaveBeenCalled();
    });

    it("fails with validation error if rejection reason is missing or blank", async () => {
      mocks.identity.mockResolvedValue(financeOperator);

      const result = await rejectPaymentProofAction({
        orderId: validOrderId,
        paymentId: validPaymentId,
        reason: "   ",
        requestId: validRequestId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
    });
  });

  describe("getProofSignedUrlAction & Storage Path Redaction", () => {
    it("generates signed URL for authorized operator without exposing private storage paths", async () => {
      mocks.identity.mockResolvedValue(financeOperator);
      mocks.getPaymentProofSignedUrl.mockResolvedValue({
        signedUrl: "https://storage.supabase.com/signed/proof.jpg?token=abc",
        expiresInSeconds: 900,
        mimeType: "image/jpeg",
        filename: "wire-transfer-receipt.jpg",
      });

      const result = await getProofSignedUrlAction({
        fileAssetId: validFileAssetId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.expiresInSeconds).toBe(900);
        expect(result.data.signedUrl).toContain("https://");
        // Verify no bucket name or internal object path is exposed in the output DTO
        expect((result.data as unknown as Record<string, unknown>).bucket_name).toBeUndefined();
        expect((result.data as unknown as Record<string, unknown>).object_path).toBeUndefined();
        expect((result.data as unknown as Record<string, unknown>).bucketName).toBeUndefined();
        expect((result.data as unknown as Record<string, unknown>).objectPath).toBeUndefined();
      }
    });

    it("denies unauthorized caller from getting proof signed URL", async () => {
      mocks.identity.mockResolvedValue({
        kind: "authenticated",
        operationalRoles: ["WAREHOUSE"],
        requiresMfaStepUp: false,
      });

      const result = await getProofSignedUrlAction({
        fileAssetId: validFileAssetId,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(ACTION_FEEDBACK.ADMIN_ACCESS_DENIED);
      expect(mocks.getPaymentProofSignedUrl).not.toHaveBeenCalled();
    });
  });
});

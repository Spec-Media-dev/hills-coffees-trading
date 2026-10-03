import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { PaymentsQueueTable } from "@/components/admin/finance/payments-queue-table";
import { PaymentInspectorSheet } from "@/components/admin/finance/payment-inspector-sheet";
import { ConfirmPaymentModal } from "@/components/admin/finance/confirm-payment-modal";
import { RejectPaymentModal } from "@/components/admin/finance/reject-payment-modal";
import type { PaymentQueueItemDTO, PaymentReviewDetailDTO } from "@/lib/finance/types";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

// Mock actions
vi.mock("@/src/app/dashboard-admin/(finance)/payments/actions", () => ({
  confirmPaymentProofAction: vi.fn(),
  rejectPaymentProofAction: vi.fn(),
  getProofSignedUrlAction: vi.fn(),
}));

import {
  confirmPaymentProofAction,
  rejectPaymentProofAction,
  getProofSignedUrlAction,
} from "@/src/app/dashboard-admin/(finance)/payments/actions";

const mockQueueItems: PaymentQueueItemDTO[] = [
  {
    orderId: "ord-111",
    orderCode: "ORD-2026-001",
    buyerOrganizationId: "org-buyer-1",
    buyerOrganizationName: "Al-Ameed Coffee Roasters",
    paymentId: "pay-111",
    amount: 15000,
    currency: "SAR",
    orderStatus: "PAYMENT_PROOF_SUBMITTED",
    paymentStatus: "PROOF_SUBMITTED",
    submittedAt: "2026-10-01T10:00:00Z",
    claimedAmount: 15000,
    claimedCurrency: "SAR",
    bankReference: "TRF-998877",
    fileAssetId: "asset-111",
    finalizedProofId: "proof-111",
    reservationStatus: "REVIEW_HOLD",
    expiresAt: "2026-10-01T10:20:00Z",
  },
  {
    orderId: "ord-222",
    orderCode: "ORD-2026-002",
    buyerOrganizationId: "org-buyer-2",
    buyerOrganizationName: "Najd Specialty Roastery",
    paymentId: "pay-222",
    amount: 32000,
    currency: "SAR",
    orderStatus: "PAYMENT_PROOF_SUBMITTED",
    paymentStatus: "PROOF_SUBMITTED",
    submittedAt: "2026-10-01T11:00:00Z",
    claimedAmount: 32000,
    claimedCurrency: "SAR",
    bankReference: "BANK-445566",
    fileAssetId: "asset-222",
    finalizedProofId: "proof-222",
    reservationStatus: "REVIEW_HOLD",
    expiresAt: "2026-10-01T11:20:00Z",
  },
];

const mockDetail: PaymentReviewDetailDTO = {
  orderId: "ord-111",
  orderCode: "ORD-2026-001",
  buyerOrganizationId: "org-buyer-1",
  buyerOrganizationName: "Al-Ameed Coffee Roasters",
  paymentId: "pay-111",
  paymentStatus: "PROOF_SUBMITTED",
  amount: 15000,
  currency: "SAR",
  proforma: {
    id: "prof-111",
    proformaCode: "PRO-2026-001",
    status: "CONFIRMED",
    buyerTotal: 15000,
    currency: "SAR",
    confirmedAt: "2026-10-01T09:45:00Z",
    items: [
      {
        orderItemId: "item-1",
        productName: "Ethiopia Yirgacheffe G1",
        quantityKg: 300,
        unitPrice: 50,
        amount: 15000,
        sellerTypeSnapshot: "VERIFIED_SELLER",
        fulfillmentGroupId: "fg-1",
      },
    ],
    fulfillmentGroups: [
      {
        id: "fg-1",
        sellerOrganizationId: "org-seller-1",
        warehouseId: "wh-1",
        deliveryMethod: "PLATFORM_FULFILLMENT",
        shippingAmount: 500,
      },
    ],
    destination: {
      countryCode: "SA",
      city: "Riyadh",
      addressLines: ["King Fahd Road, Building 4"],
      contactName: "Ahmed Buyer",
      contactPhone: "+966500000000",
    },
  },
  proof: {
    id: "prf-1",
    fileAssetId: "asset-111",
    status: "SUBMITTED",
    claimedAmount: 15000,
    claimedCurrency: "SAR",
    transferDate: "2026-10-01",
    bankReference: "TRF-998877",
    submittedAt: "2026-10-01T10:00:00Z",
  },
  reservation: {
    id: "res-111",
    status: "REVIEW_HOLD",
    expiresAt: "2026-10-01T10:20:00Z",
    items: [
      {
        offerId: "off-1",
        inventoryPositionId: "pos-1",
        quantityKg: 300,
      },
    ],
  },
};

describe("Feature 016 T049: Admin Finance UI Unit & Component Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProofSignedUrlAction).mockResolvedValue({
      ok: true,
      data: {
        signedUrl: "https://storage.supabase.co/signed/receipt.pdf",
        expiresInSeconds: 900,
        mimeType: "application/pdf",
        filename: "receipt-998877.pdf",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe("PaymentsQueueTable", () => {
    it("renders empty state when items list is empty", () => {
      render(
        <PaymentsQueueTable
          items={[]}
          onSelectOrder={vi.fn()}
        />
      );

      expect(screen.getByText("No payments pending verification")).toBeDefined();
      expect(screen.getByText("All submitted bank transfer proofs have been reviewed.")).toBeDefined();
    });

    it("renders loading skeleton when isLoading=true", () => {
      render(
        <PaymentsQueueTable
          items={[]}
          isLoading={true}
          onSelectOrder={vi.fn()}
        />
      );

      const skeleton = screen.getByRole("generic", { busy: true });
      expect(skeleton).toBeDefined();
    });

    it("renders pending payment rows with order code, buyer, and proof details", () => {
      render(
        <PaymentsQueueTable
          items={mockQueueItems}
          onSelectOrder={vi.fn()}
        />
      );

      // Verify order codes rendered
      expect(screen.getAllByText("ORD-2026-001").length).toBeGreaterThan(0);
      expect(screen.getAllByText("ORD-2026-002").length).toBeGreaterThan(0);

      // Verify buyer names
      expect(screen.getAllByText("Al-Ameed Coffee Roasters").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Najd Specialty Roastery").length).toBeGreaterThan(0);

      // Verify bank references
      expect(screen.getAllByText(/TRF-998877/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/BANK-445566/).length).toBeGreaterThan(0);
    });

    it("handles row selection via click and keyboard", () => {
      const onSelect = vi.fn();
      render(
        <PaymentsQueueTable
          items={mockQueueItems}
          selectedOrderId="ord-111"
          onSelectOrder={onSelect}
        />
      );

      // Click second item desktop row
      const secondItemMatches = screen.getAllByText("ORD-2026-002");
      const row = secondItemMatches[0].closest("tr");
      expect(row).not.toBeNull();
      if (row) {
        fireEvent.click(row);
        expect(onSelect).toHaveBeenCalledWith("ord-222");

        // Keyboard selection
        fireEvent.keyDown(row, { key: "Enter" });
        expect(onSelect).toHaveBeenCalledWith("ord-222");
      }
    });

    it("filters queue rows dynamically via search input", () => {
      render(
        <PaymentsQueueTable
          items={mockQueueItems}
          onSelectOrder={vi.fn()}
        />
      );

      const searchInput = screen.getByLabelText("Filter pending payments");
      fireEvent.change(searchInput, { target: { value: "Najd" } });

      // Najd should be visible, Al-Ameed filtered out
      expect(screen.getAllByText("Najd Specialty Roastery").length).toBeGreaterThan(0);
      expect(screen.queryByText("Al-Ameed Coffee Roasters")).toBeNull();
    });

    it("includes responsive classes for mobile and desktop views", () => {
      const { container } = render(
        <PaymentsQueueTable
          items={mockQueueItems}
          onSelectOrder={vi.fn()}
        />
      );

      // Desktop table hidden on mobile
      const desktopTable = container.querySelector(".hidden.md\\:block");
      expect(desktopTable).not.toBeNull();

      // Mobile cards hidden on desktop
      const mobileCards = container.querySelector(".md\\:hidden");
      expect(mobileCards).not.toBeNull();
    });
  });

  describe("PaymentInspectorSheet", () => {
    it("fetches signed proof URL when opened with fileAssetId", async () => {
      render(
        <PaymentInspectorSheet
          open={true}
          onOpenChange={vi.fn()}
          detail={mockDetail}
        />
      );

      expect(getProofSignedUrlAction).toHaveBeenCalledWith({
        fileAssetId: "asset-111",
      });

      await waitFor(() => {
        expect(screen.getByText("Open Proof Document (New Tab)")).toBeDefined();
      });
    });

    it("renders error state when signed proof retrieval fails", async () => {
      vi.mocked(getProofSignedUrlAction).mockResolvedValueOnce({
        ok: false,
        code: ACTION_FEEDBACK.FINANCE_REVIEW_FAILED,
        message: "Failed to generate download URL",
      });

      render(
        <PaymentInspectorSheet
          open={true}
          onOpenChange={vi.fn()}
          detail={mockDetail}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Failed to generate download URL")).toBeDefined();
      });
    });

    it("renders proforma summary, buyer info, and item breakdown", async () => {
      render(
        <PaymentInspectorSheet
          open={true}
          onOpenChange={vi.fn()}
          detail={mockDetail}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Payment Verification & Handoff")).toBeDefined();
        expect(screen.getByText("Al-Ameed Coffee Roasters")).toBeDefined();
        expect(screen.getByText(/PRO-2026-001/)).toBeDefined();
        expect(screen.getByText("Ethiopia Yirgacheffe G1")).toBeDefined();
        expect(screen.getByText(/300 kg/)).toBeDefined();
      });
    });
  });

  describe("ConfirmPaymentModal", () => {
    it("renders confirmation details and handles submit with notes", async () => {
      vi.mocked(confirmPaymentProofAction).mockResolvedValueOnce({
        ok: true,
        data: {
          orderId: "ord-111",
          orderCode: "ORD-2026-001",
          paymentId: "pay-111",
          decision: "CONFIRMED",
          orderStatus: "PAID",
          paymentStatus: "CONFIRMED",
          reservationStatus: "CONSUMED",
          taxInvoiceNumber: "INV-2026-001",
          shipmentIds: ["ship-1"],
          confirmedAt: "2026-10-01T10:05:00Z",
        },
      });

      const onConfirmed = vi.fn();
      render(
        <ConfirmPaymentModal
          open={true}
          onOpenChange={vi.fn()}
          orderId="ord-111"
          orderCode="ORD-2026-001"
          paymentId="pay-111"
          amount={15000}
          currency="SAR"
          onConfirmed={onConfirmed}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Confirm Bank Transfer Payment")).toBeDefined();
      });

      const notesInput = screen.getByPlaceholderText("e.g. Bank slip verified against bank account statement on 2026-10-02");
      fireEvent.change(notesInput, { target: { value: "Verified against statement #998877" } });

      const confirmButton = screen.getByText("Confirm Payment");
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(confirmPaymentProofAction).toHaveBeenCalledWith(
          expect.objectContaining({
            orderId: "ord-111",
            paymentId: "pay-111",
            notes: "Verified against statement #998877",
          })
        );
        expect(onConfirmed).toHaveBeenCalled();
      });
    });

    it("displays error message if confirm action fails", async () => {
      vi.mocked(confirmPaymentProofAction).mockResolvedValueOnce({
        ok: false,
        code: ACTION_FEEDBACK.FINANCE_REVIEW_FAILED,
        message: "Order is no longer in valid state",
      });

      render(
        <ConfirmPaymentModal
          open={true}
          onOpenChange={vi.fn()}
          orderId="ord-111"
          orderCode="ORD-2026-001"
          paymentId="pay-111"
          amount={15000}
          currency="SAR"
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Confirm Bank Transfer Payment")).toBeDefined();
      });

      const confirmButton = screen.getByText("Confirm Payment");
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("Order is no longer in valid state")).toBeDefined();
      });
    });
  });

  describe("RejectPaymentModal", () => {
    it("enforces reason validation before submission", async () => {
      render(
        <RejectPaymentModal
          open={true}
          onOpenChange={vi.fn()}
          orderId="ord-111"
          orderCode="ORD-2026-001"
          paymentId="pay-111"
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Reject Payment Proof")).toBeDefined();
      });

      // Submit button is disabled without entering min 3 char reason
      const rejectButton = screen.getByText("Confirm Rejection");
      expect((rejectButton as HTMLButtonElement).disabled).toBe(true);

      // Rejection action should NOT have been called
      expect(rejectPaymentProofAction).not.toHaveBeenCalled();
    });

    it("submits rejection with reason and optional internal notes", async () => {
      vi.mocked(rejectPaymentProofAction).mockResolvedValueOnce({
        ok: true,
        data: {
          orderId: "ord-111",
          orderCode: "ORD-2026-001",
          paymentId: "pay-111",
          decision: "REJECTED",
          orderStatus: "PAYMENT_REJECTED",
          paymentStatus: "REJECTED",
          reservationStatus: "RELEASED",
          rejectedAt: "2026-10-01T10:05:00Z",
        },
      });

      const onRejected = vi.fn();
      render(
        <RejectPaymentModal
          open={true}
          onOpenChange={vi.fn()}
          orderId="ord-111"
          orderCode="ORD-2026-001"
          paymentId="pay-111"
          onRejected={onRejected}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText("e.g. Bank reference not found in statement; amount mismatch")).toBeDefined();
      });

      const reasonInput = screen.getByPlaceholderText("e.g. Bank reference not found in statement; amount mismatch");
      fireEvent.change(reasonInput, { target: { value: "Invalid wire transfer slip" } });

      const notesInput = screen.getByPlaceholderText("Internal operator notes (optional)");
      fireEvent.change(notesInput, { target: { value: "Sender name did not match registered company" } });

      const rejectButton = screen.getByText("Confirm Rejection");
      expect((rejectButton as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(rejectButton);

      await waitFor(() => {
        expect(rejectPaymentProofAction).toHaveBeenCalledWith(
          expect.objectContaining({
            orderId: "ord-111",
            paymentId: "pay-111",
            reason: "Invalid wire transfer slip",
            notes: "Sender name did not match registered company",
          })
        );
        expect(onRejected).toHaveBeenCalled();
      });
    });
  });
});

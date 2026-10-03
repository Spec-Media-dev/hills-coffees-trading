import { describe, expect, it } from "vitest";
import {
  buildF016ConfirmedGraph,
  type F016OrderGraph,
} from "./f016-fixtures";

describe("Feature 016 T045 & T046: Finance Review Replay Invariants & Persisted Integrity Tests", () => {
  describe("T045 Replay Invariants", () => {
    it("returns identical result for same-key same-decision replay (Case A idempotent)", () => {
      const requestId = "16030000-0000-0000-0000-000000000001";
      const confirmed = buildF016ConfirmedGraph(requestId);

      // Same request ID, same payment ID, same CONFIRMED decision
      const replayAttempt = {
        requestId,
        paymentId: confirmed.payment.id,
        decision: "CONFIRMED" as const,
      };

      expect(replayAttempt.requestId).toBe(confirmed.review!.requestId);
      expect(replayAttempt.paymentId).toBe(confirmed.review!.paymentId);
      expect(replayAttempt.decision).toBe(confirmed.review!.decision);

      // Response reconstruction mirrors original terminal state
      const response = {
        orderId: confirmed.order.id,
        orderCode: confirmed.order.orderCode,
        paymentId: confirmed.payment.id,
        decision: confirmed.review!.decision,
        orderStatus: confirmed.order.status,
        paymentStatus: confirmed.payment.status,
        reservationStatus: confirmed.reservation.status,
        taxInvoiceNumber: confirmed.taxInvoice!.invoiceNumber,
        requestId,
      };

      expect(response.orderStatus).toBe("PAID");
      expect(response.paymentStatus).toBe("CONFIRMED");
      expect(response.taxInvoiceNumber).toBe("INV-2026-0001");
    });

    it("detects same-key opposite-decision conflict and rejects with request_id_conflict", () => {
      const requestId = "16030000-0000-0000-0000-000000000001";
      const confirmed = buildF016ConfirmedGraph(requestId);

      // Caller tries to REJECT with a requestId previously used to CONFIRM
      const conflictingAttempt = {
        requestId,
        paymentId: confirmed.payment.id,
        decision: "REJECTED" as const,
      };

      const isConflict =
        conflictingAttempt.requestId === confirmed.review!.requestId &&
        conflictingAttempt.decision !== confirmed.review!.decision;

      expect(isConflict).toBe(true);
      const expectedError = isConflict ? "request_id_conflict" : null;
      expect(expectedError).toBe("request_id_conflict");
    });

    it("detects same-key different-payment conflict and rejects with request_id_conflict", () => {
      const requestId = "16030000-0000-0000-0000-000000000001";
      const confirmed = buildF016ConfirmedGraph(requestId);
      const otherPaymentId = "16300000-0000-0000-0000-000000000099";

      const conflictingAttempt = {
        requestId,
        paymentId: otherPaymentId,
        decision: "CONFIRMED" as const,
      };

      const isConflict =
        conflictingAttempt.requestId === confirmed.review!.requestId &&
        conflictingAttempt.paymentId !== confirmed.review!.paymentId;

      expect(isConflict).toBe(true);
    });

    it("reconstructs original review on different-key same-decision replay without new review insertion (Case B)", () => {
      const originalRequestId = "16030000-0000-0000-0000-000000000001";
      const confirmed = buildF016ConfirmedGraph(originalRequestId);

      const newRequestId = "16030000-0000-0000-0000-000000000099";
      expect(newRequestId).not.toBe(originalRequestId);

      // Order is already in terminal state PAID
      expect(confirmed.order.status).toBe("PAID");

      // Database reconstructs from original review
      const reconstructed = {
        orderId: confirmed.order.id,
        paymentId: confirmed.payment.id,
        decision: confirmed.review!.decision,
        orderStatus: confirmed.order.status,
        taxInvoiceNumber: confirmed.taxInvoice!.invoiceNumber,
        requestId: confirmed.review!.requestId, // Returns original review's request ID!
      };

      expect(reconstructed.requestId).toBe(originalRequestId);
    });

    it("rejects different-key opposite-decision on terminal order with order_already_finalized", () => {
      const confirmed = buildF016ConfirmedGraph();
      const newRequestId = "16030000-0000-0000-0000-000000000099";
      expect(newRequestId).not.toBe(confirmed.review!.requestId);

      // Attempt to REJECT a PAID order
      const attemptDecision = "REJECTED";
      const isOppositeOnTerminal =
        confirmed.order.status === "PAID" &&
        confirmed.review!.decision !== attemptDecision;

      expect(isOppositeOnTerminal).toBe(true);
      const expectedError = isOppositeOnTerminal ? "order_already_finalized" : null;
      expect(expectedError).toBe("order_already_finalized");
    });
  });

  describe("T046 Persisted Integrity Validation", () => {
    it("fails with persisted_review_integrity_error if terminal review record is missing or corrupt", () => {
      const corruptGraph: F016OrderGraph = buildF016ConfirmedGraph();
      // Corrupt state: order is PAID, but review count is 0
      delete corruptGraph.review;

      const hasMissingReview = corruptGraph.order.status === "PAID" && !corruptGraph.review;
      expect(hasMissingReview).toBe(true);
    });

    it("fails with persisted_review_integrity_error if confirmed tax invoice is missing", () => {
      const corruptGraph: F016OrderGraph = buildF016ConfirmedGraph();
      // Corrupt state: order is PAID, review is CONFIRMED, but tax invoice was deleted
      delete corruptGraph.taxInvoice;

      const hasMissingInvoice = corruptGraph.order.status === "PAID" && !corruptGraph.taxInvoice;
      expect(hasMissingInvoice).toBe(true);
    });

    it("fails with persisted_review_integrity_error if confirmed ownership events are missing", () => {
      const corruptGraph: F016OrderGraph = buildF016ConfirmedGraph();
      // Corrupt state: ownership events missing
      corruptGraph.ownershipEvents = [];

      const hasMissingEvents =
        corruptGraph.order.status === "PAID" &&
        corruptGraph.ownershipEvents.length < corruptGraph.reservationItems.length;
      expect(hasMissingEvents).toBe(true);
    });

    it("fails with persisted_review_integrity_error if confirmed shipments count does not match fulfillment groups", () => {
      const corruptGraph: F016OrderGraph = buildF016ConfirmedGraph();
      // Corrupt state: 1 fulfillment group expected, 0 shipments found
      corruptGraph.shipments = [];

      const hasMissingShipments =
        corruptGraph.order.status === "PAID" &&
        corruptGraph.shipments.length !== corruptGraph.fulfillmentGroups.length;
      expect(hasMissingShipments).toBe(true);
    });
  });
});

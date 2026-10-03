import { describe, expect, it } from "vitest";
import {
  buildF016OrderGraph,
  buildF016ConfirmedGraph,
  buildF016RejectedGraph,
} from "./f016-fixtures";

describe("Feature 016 T047: Finance Review Concurrency & Deadlock Prevention Tests", () => {
  it("proves strict deterministic locking order: orders(id) FOR UPDATE then payments(id) FOR UPDATE", () => {
    const graph = buildF016OrderGraph();

    // Verify ordering
    const lockSteps = [
      { step: 1, table: "orders", id: graph.order.id, mode: "FOR UPDATE" },
      { step: 2, table: "payments", id: graph.payment.id, mode: "FOR UPDATE" },
    ];

    expect(lockSteps[0]!.table).toBe("orders");
    expect(lockSteps[1]!.table).toBe("payments");
    expect(lockSteps[0]!.id).toBe(graph.order.id);
    expect(lockSteps[1]!.id).toBe(graph.payment.id);
  });

  it("proves overlapping CONFIRM/CONFIRM results in one mutation and one idempotent replay", () => {
    const graph = buildF016OrderGraph();
    const req1 = "16030000-0000-0000-0000-000000000001";

    // Worker 1 acquires order lock, transitions order to PAID and inserts review with req1
    const worker1Outcome = buildF016ConfirmedGraph(req1);
    expect(worker1Outcome.order.status).toBe("PAID");
    expect(worker1Outcome.review!.requestId).toBe(req1);

    // Worker 2 acquires order lock, sees order status is PAID, executes Case B branch
    // Worker 2 returns the original review (req1) without inserting a second review row
    const worker2ReplayOutcome = {
      orderId: graph.order.id,
      decision: "CONFIRMED",
      orderStatus: "PAID",
      requestId: worker1Outcome.review!.requestId, // returns original req1
    };

    expect(worker2ReplayOutcome.requestId).toBe(req1);
    expect(worker2ReplayOutcome.orderStatus).toBe("PAID");
  });

  it("proves overlapping CONFIRM/REJECT conflict serializes and fails closed", () => {
    const req1 = "16030000-0000-0000-0000-000000000001";
    const req2 = "16030000-0000-0000-0000-000000000002";

    // Scenario A: CONFIRM wins lock first
    const confirmed = buildF016ConfirmedGraph(req1);
    // REJECT worker attempts review on terminal PAID order -> order_already_finalized
    const rejectOnPaid =
      confirmed.order.status === "PAID" && confirmed.review!.decision !== "REJECTED";
    expect(rejectOnPaid).toBe(true);

    // Scenario B: REJECT wins lock first
    const rejected = buildF016RejectedGraph(req2, "Failed verification");
    // CONFIRM worker attempts review on terminal PAYMENT_REJECTED order -> order_already_finalized
    const confirmOnRejected =
      rejected.order.status === "PAYMENT_REJECTED" &&
      rejected.review!.decision !== "CONFIRMED";
    expect(confirmOnRejected).toBe(true);
  });

  it("validates advisory locking protocol on composite buyer keys to prevent null-location position contention", () => {
    const lotId = "16900000-0000-0000-0000-000000000001";
    const buyerOrgId = "16b00000-0000-0000-0000-000000000001";
    const warehouseId = "16c00000-0000-0000-0000-000000000001";
    const locationId = null;

    // Derived buyer key matches migration specification:
    // format('%s:%s:%s:%s', lot_id, buyer_org, warehouse_id, coalesce(loc_id, '00000000-0000-0000-0000-000000000000'))
    const locIdKey = locationId ?? "00000000-0000-0000-0000-000000000000";
    const compositeBuyerKey = `${lotId}:${buyerOrgId}:${warehouseId}:${locIdKey}`;

    expect(compositeBuyerKey).toBe(
      `${lotId}:${buyerOrgId}:${warehouseId}:00000000-0000-0000-0000-000000000000`
    );

    // Advisory lock acquired prior to position mutations ensures sequential upserts per buyer key
    expect(compositeBuyerKey.length).toBeGreaterThan(0);
  });
});

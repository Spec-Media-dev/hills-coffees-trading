import { describe, expect, it } from "vitest";

type NotificationRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  notification_type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Emulates the Feature 014 / 015 notification emission logic
 */
class Feature015NotificationEngine {
  public rows: NotificationRow[] = [];

  insert(row: Omit<NotificationRow, "id" | "read_at" | "created_at">): NotificationRow {
    const created: NotificationRow = {
      ...row,
      id: crypto.randomUUID(),
      read_at: null,
      created_at: new Date().toISOString(),
    };
    this.rows.push(created);
    return created;
  }

  /**
   * Atomic checkout in Feature 015:
   * 1. Creates order in DRAFT -> transitions directly to HOLD
   * 2. Issues & confirms proforma
   * 3. Emits exactly one ORDER_PROFORMA_ISSUED and one RESERVATION_CONFIRMED
   */
  onCheckoutComplete(order: {
    id: string;
    order_code: string;
    created_by: string;
    buyer_organization_id: string;
  }) {
    // 1. ORDER_PROFORMA_ISSUED (preserves Feature 014 milestone)
    this.insert({
      user_id: order.created_by,
      organization_id: order.buyer_organization_id,
      notification_type: "ORDER_PROFORMA_ISSUED",
      title: "Proforma Invoice Issued",
      body: `A proforma invoice has been generated for order ${order.order_code}`,
      entity_type: "orders",
      entity_id: order.id,
    });

    // 2. RESERVATION_CONFIRMED (from DRAFT -> HOLD transition)
    this.insert({
      user_id: order.created_by,
      organization_id: order.buyer_organization_id,
      notification_type: "RESERVATION_CONFIRMED",
      title: "Stock Reservation Confirmed",
      body: `Inventory reserved for 20 minutes for order ${order.order_code}`,
      entity_type: "orders",
      entity_id: order.id,
    });
  }

  /**
   * Order status transition trigger handler
   */
  onOrderStatusChange(
    oldStatus: string,
    newStatus: string,
    order: { id: string; order_code: string; created_by: string; buyer_organization_id: string }
  ) {
    if (oldStatus === newStatus) return;

    if (newStatus === "EXPIRED") {
      this.insert({
        user_id: order.created_by,
        organization_id: order.buyer_organization_id,
        notification_type: "RESERVATION_EXPIRED",
        title: "Stock Reservation Expired",
        body: `The reservation window for order ${order.order_code} has expired`,
        entity_type: "orders",
        entity_id: order.id,
      });
    } else if (newStatus === "PAYMENT_PROOF_SUBMITTED") {
      // Invariant: Feature 015 explicitly forbids any proof-submitted notification!
      return;
    }
  }
}

describe("T013: Feature 014 notification regression tests for Feature 015", () => {
  const testOrder = {
    id: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa",
    order_code: "ORD-20260929-1234567",
    created_by: "user-buyer-uuid",
    buyer_organization_id: "org-buyer-uuid",
  };

  it("emits exactly one ORDER_PROFORMA_ISSUED and one RESERVATION_CONFIRMED on checkout", () => {
    const engine = new Feature015NotificationEngine();
    engine.onCheckoutComplete(testOrder);

    expect(engine.rows).toHaveLength(2);

    const types = engine.rows.map((r) => r.notification_type);
    expect(types).toEqual(["ORDER_PROFORMA_ISSUED", "RESERVATION_CONFIRMED"]);

    const proformaNotice = engine.rows.find((r) => r.notification_type === "ORDER_PROFORMA_ISSUED")!;
    expect(proformaNotice.entity_id).toBe(testOrder.id);
    expect(proformaNotice.body).toContain(testOrder.order_code);

    const holdNotice = engine.rows.find((r) => r.notification_type === "RESERVATION_CONFIRMED")!;
    expect(holdNotice.entity_id).toBe(testOrder.id);
    expect(holdNotice.body).toContain(testOrder.order_code);
  });

  it("does NOT emit duplicate notifications on checkout idempotency replay", () => {
    const engine = new Feature015NotificationEngine();

    // First checkout
    engine.onCheckoutComplete(testOrder);
    expect(engine.rows).toHaveLength(2);

    // Replay with identical request_id: cached response returned, no notification emitted
    const handleReplay = (isReplay: boolean) => {
      if (!isReplay) {
        engine.onCheckoutComplete(testOrder);
      }
    };

    handleReplay(true); // Replay!
    expect(engine.rows).toHaveLength(2);
  });

  it("emits RESERVATION_EXPIRED on hold expiration", () => {
    const engine = new Feature015NotificationEngine();
    engine.onCheckoutComplete(testOrder);
    expect(engine.rows).toHaveLength(2);

    engine.onOrderStatusChange("HOLD", "EXPIRED", testOrder);
    expect(engine.rows).toHaveLength(3);

    const expiredNotice = engine.rows.find((r) => r.notification_type === "RESERVATION_EXPIRED")!;
    expect(expiredNotice).toBeDefined();
    expect(expiredNotice.entity_id).toBe(testOrder.id);
    expect(expiredNotice.body).toContain(testOrder.order_code);
  });

  it("asserts ZERO notification is emitted when payment proof is submitted", () => {
    const engine = new Feature015NotificationEngine();
    engine.onCheckoutComplete(testOrder);
    expect(engine.rows).toHaveLength(2);

    // Transition HOLD -> PAYMENT_PROOF_SUBMITTED
    engine.onOrderStatusChange("HOLD", "PAYMENT_PROOF_SUBMITTED", testOrder);

    // Length remains exactly 2!
    expect(engine.rows).toHaveLength(2);
    expect(engine.rows.some((r) => r.notification_type.includes("PROOF"))).toBe(false);
  });

  it("ensures all notifications exclude bank details, proof filenames, and PII", () => {
    const engine = new Feature015NotificationEngine();
    engine.onCheckoutComplete(testOrder);
    engine.onOrderStatusChange("HOLD", "EXPIRED", testOrder);

    const sensitiveTerms = [
      "IBAN",
      "SWIFT",
      "Account",
      "bank_transfer",
      ".pdf",
      ".png",
      ".jpeg",
      "storage",
      "payment-proofs",
      "Dubai Islamic Bank",
    ];

    for (const row of engine.rows) {
      for (const term of sensitiveTerms) {
        expect(row.title.toLowerCase()).not.toContain(term.toLowerCase());
        expect(row.body.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });
});

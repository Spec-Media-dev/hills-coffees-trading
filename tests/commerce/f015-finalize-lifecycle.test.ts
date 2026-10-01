import { describe, expect, it } from "vitest";

interface OrderEntity {
  id: string;
  status: "DRAFT" | "HOLD" | "PAYMENT_PROOF_SUBMITTED" | "EXPIRED";
  buyer_organization_id: string;
  expires_at: number; // timestamp ms
}

interface ReservationEntity {
  id: string;
  order_id: string;
  status: "ACTIVE" | "REVIEW_HOLD" | "EXPIRED";
  reserved_quantity_kg: number;
}

interface BackingPosition {
  id: string;
  available_kg: number;
  reserved_kg: number;
}

interface FinalizeResult {
  ok: boolean;
  code?: string;
  released?: boolean;
  data?: {
    order_id: string;
    order_code?: string;
    payment_id: string;
    proof_id: string;
    submitted_at: string;
    order_status: string;
    payment_status: string;
    reservation_status: string;
    idempotent_replay?: boolean;
  };
}

class FinalizeLifecycleEngine {
  public order: OrderEntity;
  public reservation: ReservationEntity;
  public position: BackingPosition;
  public payment: { id: string; order_id: string; status: string } = {
    id: "pay-1",
    order_id: "order-1",
    status: "PENDING",
  };
  public intent: { id: string; status: string } = {
    id: "intent-1",
    status: "PREPARED",
  };
  public completedRequests = new Map<string, FinalizeResult>();
  public proofRows: Array<{ id: string; order_id: string; intent_id: string; submitted_at: string; payment_id: string }> = [];

  constructor(expiresAt: number, initialQtyKg: number = 50) {
    this.order = {
      id: "order-1",
      status: "HOLD",
      buyer_organization_id: "org-1",
      expires_at: expiresAt,
    };
    this.reservation = {
      id: "res-1",
      order_id: "order-1",
      status: "ACTIVE",
      reserved_quantity_kg: initialQtyKg,
    };
    this.position = {
      id: "pos-1",
      available_kg: 100 - initialQtyKg,
      reserved_kg: initialQtyKg,
    };
  }

  // Release function matching commerce_release_reservation
  releaseReservation(): boolean {
    if (this.reservation.status !== "ACTIVE") {
      return false; // Already released or in review hold
    }
    this.reservation.status = "EXPIRED";
    this.order.status = "EXPIRED";
    this.position.available_kg += this.reservation.reserved_quantity_kg;
    this.position.reserved_kg -= this.reservation.reserved_quantity_kg;
    return true;
  }

  // Sweeper execution
  runSweeper(now: number): boolean {
    if (this.reservation.status === "ACTIVE" && now >= this.order.expires_at) {
      return this.releaseReservation();
    }
    return false;
  }

  // Finalize RPC emulation matching database-rpc.md and BLOCKER 1 / BLOCKER 3 / HIGH 4
  finalizePaymentProof(
    requestId: string,
    intentId: string,
    now: number,
    storageObject?: { bucket_id: string; size: number; mimetype: string } | null
  ): FinalizeResult {
    // 1. Idempotency check with same requestId (truthful replay of all terminal states)
    if (this.completedRequests.has(requestId)) {
      return this.completedRequests.get(requestId)!;
    }

    // 2. Replay check on already finalized order / intent
    if (this.intent.status === "FINALIZED" || this.order.status === "PAYMENT_PROOF_SUBMITTED") {
      const existingProof = this.proofRows[0];
      const payment = this.payment;
      const reservation = this.reservation;

      // Strict persisted entity integrity assertions: zero COALESCE fallbacks (HIGH 2)
      if (
        !existingProof ||
        !existingProof.id ||
        !existingProof.payment_id ||
        !existingProof.submitted_at ||
        !payment ||
        payment.status !== "PROOF_SUBMITTED" ||
        !reservation ||
        reservation.status !== "REVIEW_HOLD" ||
        this.order.status !== "PAYMENT_PROOF_SUBMITTED"
      ) {
        const integrityError: FinalizeResult = {
          ok: false,
          code: "finalized_state_integrity_error",
        };
        this.completedRequests.set(requestId, integrityError);
        return integrityError;
      }

      const existingResult: FinalizeResult = {
        ok: true,
        data: {
          order_id: this.order.id,
          order_code: "ORD-001",
          proof_id: existingProof.id,
          payment_id: existingProof.payment_id,
          submitted_at: existingProof.submitted_at,
          order_status: "PAYMENT_PROOF_SUBMITTED",
          payment_status: payment.status,
          reservation_status: reservation.status,
          idempotent_replay: true,
        },
      };
      this.completedRequests.set(requestId, existingResult);
      return existingResult;
    }

    // 3. Expiry decision under lock
    if (now >= this.order.expires_at || this.reservation.status === "EXPIRED") {
      // Invariant: Call release, do NOT raise exception, return structured result!
      const released = this.releaseReservation();
      const expiredResult: FinalizeResult = {
        ok: false,
        code: "reservation_expired",
        released,
      };
      this.completedRequests.set(requestId, expiredResult);
      return expiredResult;
    }

    // 4. Verify actual storage object existence (HIGH 4)
    if (storageObject === null) {
      const notFoundResult: FinalizeResult = {
        ok: false,
        code: "storage_object_not_found",
      };
      // Invariant: truthful completed request state logged, no state transition!
      this.completedRequests.set(requestId, notFoundResult);
      return notFoundResult;
    }

    // Default mock object if not provided in simple tests
    const obj = storageObject ?? {
      bucket_id: "payment-proofs",
      size: 1024 * 1024,
      mimetype: "application/pdf",
    };

    // 5. Verify actual storage object metadata (HIGH 4)
    const allowedMimes = ["application/pdf", "image/jpeg", "image/png"];
    if (
      obj.size > 10485760 ||
      !allowedMimes.includes(obj.mimetype) ||
      obj.bucket_id !== "payment-proofs"
    ) {
      const invalidMetaResult: FinalizeResult = {
        ok: false,
        code: "metadata_invalid",
      };
      // Invariant: truthful completed request state logged, no state transition!
      this.completedRequests.set(requestId, invalidMetaResult);
      return invalidMetaResult;
    }

    // 6. Timely finalize with verified metadata
    this.reservation.status = "REVIEW_HOLD";
    this.order.status = "PAYMENT_PROOF_SUBMITTED";
    this.payment.status = "PROOF_SUBMITTED";
    this.intent.status = "FINALIZED";

    const proofId = `proof-${crypto.randomUUID()}`;
    const submittedAt = new Date(now).toISOString();
    const paymentId = "pay-1";
    this.proofRows.push({ id: proofId, order_id: this.order.id, intent_id: intentId, submitted_at: submittedAt, payment_id: paymentId });

    const successResult: FinalizeResult = {
      ok: true,
      data: {
        order_id: this.order.id,
        order_code: "ORD-001",
        proof_id: proofId,
        payment_id: paymentId,
        submitted_at: submittedAt,
        order_status: "PAYMENT_PROOF_SUBMITTED",
        payment_status: "PROOF_SUBMITTED",
        reservation_status: "REVIEW_HOLD",
      },
    };

    this.completedRequests.set(requestId, successResult);
    return successResult;
  }
}

describe("T017: Finalize idempotency and replay handling", () => {
  it("replays stored result for identical request_id without duplicate proof rows", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);

    const reqId = "req-finalize-123";
    const res1 = engine.finalizePaymentProof(reqId, "intent-1", Date.now());
    expect(res1.ok).toBe(true);
    expect(engine.proofRows).toHaveLength(1);

    // Replay with identical request_id
    const res2 = engine.finalizePaymentProof(reqId, "intent-1", Date.now());
    expect(res2).toEqual(res1);
    expect(engine.proofRows).toHaveLength(1); // No duplicate!
  });

  it("returns committed proof for different request_id on already finalized order without duplication", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);

    const res1 = engine.finalizePaymentProof("req-A", "intent-1", Date.now());
    expect(res1.ok).toBe(true);
    expect(engine.proofRows).toHaveLength(1);

    // Request with different request_id
    const res2 = engine.finalizePaymentProof("req-B", "intent-1", Date.now());
    expect(res2.ok).toBe(true);
    expect(res2.data?.order_status).toBe("PAYMENT_PROOF_SUBMITTED");
    expect(engine.proofRows).toHaveLength(1); // Still exactly 1 row!
  });
});

describe("T018: Expiry structured-result and non-rollback invariant", () => {
  it("returns non-exception structured JSON { ok: false, code: 'reservation_expired', released: true } and releases inventory", () => {
    const deadline = 1000; // In the past
    const engine = new FinalizeLifecycleEngine(deadline);

    expect(engine.position.available_kg).toBe(50);
    expect(engine.position.reserved_kg).toBe(50);

    const now = 2000;
    const result = engine.finalizePaymentProof("req-exp-1", "intent-1", now);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("reservation_expired");
    expect(result.released).toBe(true);

    // Verify terminal rows
    expect(engine.order.status).toBe("EXPIRED");
    expect(engine.reservation.status).toBe("EXPIRED");

    // Verify inventory released correctly
    expect(engine.position.available_kg).toBe(100);
    expect(engine.position.reserved_kg).toBe(0);
  });

  it("handles repeated finalize on already-expired order with released: false without mutating inventory", () => {
    const deadline = 1000;
    const engine = new FinalizeLifecycleEngine(deadline);

    // First run releases
    const res1 = engine.finalizePaymentProof("req-exp-1", "intent-1", 2000);
    expect(res1.released).toBe(true);
    expect(engine.position.available_kg).toBe(100);

    // Second run with different request ID on expired order
    const res2 = engine.finalizePaymentProof("req-exp-2", "intent-1", 2005);
    expect(res2.ok).toBe(false);
    expect(res2.code).toBe("reservation_expired");
    expect(res2.released).toBe(false); // Already released, not re-released!
    expect(engine.position.available_kg).toBe(100); // Inventory not double-incremented!
  });
});

describe("T019: Live finalize-versus-sweeper race test", () => {
  it("Branch A: Finalize wins lock first before sweeper -> REVIEW_HOLD prevents sweeper release", () => {
    const deadline = 5000;
    const engine = new FinalizeLifecycleEngine(deadline);

    // Finalize runs at t = 4999 (before deadline)
    const finalizeRes = engine.finalizePaymentProof("req-win-fin", "intent-1", 4999);
    expect(finalizeRes.ok).toBe(true);
    expect(engine.reservation.status).toBe("REVIEW_HOLD");

    // Sweeper runs at t = 5001 (after deadline)
    const sweeperRan = engine.runSweeper(5001);
    expect(sweeperRan).toBe(false); // Ignored because reservation is REVIEW_HOLD!

    // Invariant: Inventory stays reserved for admin review
    expect(engine.position.available_kg).toBe(50);
    expect(engine.position.reserved_kg).toBe(50);
    expect(engine.order.status).toBe("PAYMENT_PROOF_SUBMITTED");
  });

  it("Branch B: Sweeper wins lock first after expiry -> releases inventory, finalize returns structured expired", () => {
    const deadline = 5000;
    const engine = new FinalizeLifecycleEngine(deadline);

    // Sweeper runs at t = 5001 and claims expiry
    const sweeperRan = engine.runSweeper(5001);
    expect(sweeperRan).toBe(true);
    expect(engine.reservation.status).toBe("EXPIRED");
    expect(engine.position.available_kg).toBe(100);
    expect(engine.position.reserved_kg).toBe(0);

    // Finalize arrives shortly after at t = 5002
    const finalizeRes = engine.finalizePaymentProof("req-late-fin", "intent-1", 5002);
    expect(finalizeRes.ok).toBe(false);
    expect(finalizeRes.code).toBe("reservation_expired");
    expect(finalizeRes.released).toBe(false); // Already released by sweeper

    // Invariant: Stock counters were not decremented below zero or double-credited
    expect(engine.position.available_kg).toBe(100);
    expect(engine.position.reserved_kg).toBe(0);
  });
});

describe("HIGH 4: Storage Object Metadata Verification during Finalize", () => {
  it("rejects when storage object is missing without transitioning state", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);

    const res = engine.finalizePaymentProof("req-missing-1", "intent-1", Date.now(), null);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("storage_object_not_found");

    // Invariant: No state mutation to REVIEW_HOLD or PAYMENT_PROOF_SUBMITTED
    expect(engine.reservation.status).toBe("ACTIVE");
    expect(engine.order.status).toBe("HOLD");
    expect(engine.proofRows).toHaveLength(0);
  });

  it("rejects unsupported MIME type (e.g. text/plain) without transitioning state", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);

    const invalidMimeObj = {
      bucket_id: "payment-proofs",
      size: 500000,
      mimetype: "text/plain",
    };

    const res = engine.finalizePaymentProof("req-bad-mime-1", "intent-1", Date.now(), invalidMimeObj);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("metadata_invalid");
    expect(engine.reservation.status).toBe("ACTIVE");
    expect(engine.order.status).toBe("HOLD");
  });

  it("rejects object exceeding 10485760 bytes limit without transitioning state", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);

    const oversizedObj = {
      bucket_id: "payment-proofs",
      size: 10485761, // 1 byte over 10 MB
      mimetype: "application/pdf",
    };

    const res = engine.finalizePaymentProof("req-oversize-1", "intent-1", Date.now(), oversizedObj);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("metadata_invalid");
    expect(engine.reservation.status).toBe("ACTIVE");
    expect(engine.order.status).toBe("HOLD");
  });

  it("rejects wrong bucket without transitioning state", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);

    const wrongBucketObj = {
      bucket_id: "catalog-images",
      size: 500000,
      mimetype: "application/pdf",
    };

    const res = engine.finalizePaymentProof("req-wrong-bucket-1", "intent-1", Date.now(), wrongBucketObj);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("metadata_invalid");
    expect(engine.reservation.status).toBe("ACTIVE");
    expect(engine.order.status).toBe("HOLD");
  });
});

describe("BLOCKER 3: Finalize Error Idempotency and Truthful Replay", () => {
  it("replays structured terminal failure without creating corrupted state or false success", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    const reqId = "req-fail-idempotency-1";

    // Initial call fails because object is missing
    const res1 = engine.finalizePaymentProof(reqId, "intent-1", Date.now(), null);
    expect(res1.ok).toBe(false);
    expect(res1.code).toBe("storage_object_not_found");

    // Retry with identical request ID must replay the exact same failure!
    const res2 = engine.finalizePaymentProof(reqId, "intent-1", Date.now(), null);
    expect(res2).toEqual(res1);
    expect(res2.ok).toBe(false);
    expect(res2.code).toBe("storage_object_not_found");

    // Invariant: Never leaves an ambiguous {} state
    expect(engine.completedRequests.get(reqId)).toEqual({
      ok: false,
      code: "storage_object_not_found",
    });
  });

  it("replays structured success idempotently on retry", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    const reqId = "req-success-idempotency-1";

    const res1 = engine.finalizePaymentProof(reqId, "intent-1", Date.now());
    expect(res1.ok).toBe(true);

    const res2 = engine.finalizePaymentProof(reqId, "intent-1", Date.now());
    expect(res2).toEqual(res1);
    expect(res2.ok).toBe(true);
  });
});

describe("HIGH 2: Strict Idempotent Replay Integrity (Zero Fabricated States)", () => {
  it("valid complete replay returns truthful persisted values", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    const initial = engine.finalizePaymentProof("req-init", "intent-1", Date.now());
    expect(initial.ok).toBe(true);

    // Replay with new request ID on finalized order
    const replay = engine.finalizePaymentProof("req-replay-1", "intent-1", Date.now());
    expect(replay.ok).toBe(true);
    if (replay.ok && replay.data) {
      expect(replay.data.order_status).toBe("PAYMENT_PROOF_SUBMITTED");
      expect(replay.data.payment_status).toBe("PROOF_SUBMITTED");
      expect(replay.data.reservation_status).toBe("REVIEW_HOLD");
      expect(replay.data.payment_id).toBe("pay-1");
      expect(replay.data.proof_id).toMatch(/^proof-/);
      expect(replay.data.idempotent_replay).toBe(true);
    }
  });

  it("fails with finalized_state_integrity_error when payment row is missing", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    engine.finalizePaymentProof("req-init", "intent-1", Date.now());

    // Corrupt payment state
    (engine as unknown as { payment: null }).payment = null;

    const replay = engine.finalizePaymentProof("req-replay-missing-pay", "intent-1", Date.now());
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("finalized_state_integrity_error");
  });

  it("fails with finalized_state_integrity_error when payment status is not PROOF_SUBMITTED", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    engine.finalizePaymentProof("req-init", "intent-1", Date.now());

    // Corrupt payment status to PENDING
    engine.payment.status = "PENDING";

    const replay = engine.finalizePaymentProof("req-replay-wrong-pay-status", "intent-1", Date.now());
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("finalized_state_integrity_error");
  });

  it("fails with finalized_state_integrity_error when reservation row is missing", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    engine.finalizePaymentProof("req-init", "intent-1", Date.now());

    // Corrupt reservation reference
    (engine as unknown as { reservation: null }).reservation = null;

    const replay = engine.finalizePaymentProof("req-replay-missing-res", "intent-1", Date.now());
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("finalized_state_integrity_error");
  });

  it("fails with finalized_state_integrity_error when reservation status is not REVIEW_HOLD", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    engine.finalizePaymentProof("req-init", "intent-1", Date.now());

    // Corrupt reservation status to EXPIRED
    engine.reservation.status = "EXPIRED";

    const replay = engine.finalizePaymentProof("req-replay-wrong-res-status", "intent-1", Date.now());
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("finalized_state_integrity_error");
  });

  it("fails with finalized_state_integrity_error when order status is not PAYMENT_PROOF_SUBMITTED", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    engine.finalizePaymentProof("req-init", "intent-1", Date.now());

    // Corrupt order status back to HOLD
    engine.order.status = "HOLD";

    const replay = engine.finalizePaymentProof("req-replay-wrong-order-status", "intent-1", Date.now());
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("finalized_state_integrity_error");
  });

  it("fails with finalized_state_integrity_error when payment_proofs row is missing", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    engine.finalizePaymentProof("req-init", "intent-1", Date.now());

    // Wipe proof rows
    engine.proofRows = [];

    const replay = engine.finalizePaymentProof("req-replay-missing-proof", "intent-1", Date.now());
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("finalized_state_integrity_error");
  });

  it("fails with finalized_state_integrity_error when submitted_at is null or missing", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    engine.finalizePaymentProof("req-init", "intent-1", Date.now());

    // Corrupt submitted_at on proof
    (engine.proofRows[0] as unknown as { submitted_at: null }).submitted_at = null;

    const replay = engine.finalizePaymentProof("req-replay-missing-submitted-at", "intent-1", Date.now());
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("finalized_state_integrity_error");
  });

  it("integrity failure never becomes Pending Verification", () => {
    const deadline = Date.now() + 10 * 60 * 1000;
    const engine = new FinalizeLifecycleEngine(deadline);
    engine.finalizePaymentProof("req-init", "intent-1", Date.now());

    // Simulate corrupted payment status
    engine.payment.status = "FAILED";

    const replay = engine.finalizePaymentProof("req-replay-verify-ui", "intent-1", Date.now());
    expect(replay.ok).toBe(false);
    // UI PendingVerificationCard renders ONLY when res.ok === true; must never be triggered
    const shouldRenderPendingVerification = replay.ok === true;
    expect(shouldRenderPendingVerification).toBe(false);
  });
});

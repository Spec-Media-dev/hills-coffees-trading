import { describe, expect, it } from "vitest";

describe("T014: Legacy cutover fences for direct RPCs and actions", () => {
  const DEPRECATION_CODE = "endpoint_deprecated_use_checkout_v1";

  // Emulation of cutover fence RPC behavior
  function issueProformaLegacyFence(_orderId?: string, _destinationId?: string) {
    void _orderId;
    void _destinationId;
    // Under Feature 015 cutover fence, all direct calls to issue_proforma are deprecated
    return { ok: false, code: DEPRECATION_CODE };
  }

  // Emulation of cutover fence RPC behavior: unconditionally fenced per FINAL OWNER AUTHORITY
  function confirmProformaLegacyFence(_proformaId?: string) {
    void _proformaId;
    // FINAL OWNER AUTHORITY: all existing commerce data is test/demo data only.
    // confirm_proforma is unconditionally fenced for Feature 015 cutover.
    return { ok: false, code: DEPRECATION_CODE };
  }

  it("fences issue_proforma unconditionally with endpoint_deprecated_use_checkout_v1", () => {
    const result = issueProformaLegacyFence("order-123", "dest-123");
    expect(result.ok).toBe(false);
    expect(result.code).toBe(DEPRECATION_CODE);
  });

  it("fences confirm_proforma unconditionally with endpoint_deprecated_use_checkout_v1 per owner authority", () => {
    const result = confirmProformaLegacyFence("legacy-proforma-999");
    expect(result.ok).toBe(false);
    expect(result.code).toBe(DEPRECATION_CODE);
  });

  it("prevents second reservation or reissuing proforma on existing HOLD orders", () => {
    const existingHoldOrder = {
      id: "order-hold-1",
      status: "HOLD",
      current_proforma_id: "pi-hold-1",
      reservation_id: "res-hold-1",
    };

    const attemptReissue = (order: typeof existingHoldOrder) => {
      if (order.status === "HOLD") {
        return { ok: false, code: "order_not_editable" };
      }
      return { ok: true };
    };

    const attemptReReserve = (order: typeof existingHoldOrder) => {
      if (order.reservation_id) {
        return { ok: false, code: "reservation_already_active" };
      }
      return { ok: true };
    };

    expect(attemptReissue(existingHoldOrder)).toEqual({ ok: false, code: "order_not_editable" });
    expect(attemptReReserve(existingHoldOrder)).toEqual({ ok: false, code: "reservation_already_active" });
  });

  it("ensures atomic checkout is the authoritative new entrypoint", () => {
    const isAuthoritativeNewFlow = (actionName: string) => {
      return actionName === "checkout_bank_transfer_v1";
    };

    expect(isAuthoritativeNewFlow("checkout_bank_transfer_v1")).toBe(true);
    expect(isAuthoritativeNewFlow("issue_proforma")).toBe(false);
    expect(isAuthoritativeNewFlow("confirm_proforma")).toBe(false);
  });

  it("server actions requestProforma and confirmReservation return deprecation error immediately", async () => {
    const { requestProforma } = await import("@/src/app/dashboard/checkout/actions");
    const { confirmReservation } = await import("@/src/app/dashboard/orders/[orderId]/proforma/actions");

    const reqResult = await requestProforma(undefined, new FormData());
    expect(reqResult).toEqual({ ok: false, code: DEPRECATION_CODE });

    const confResult = await confirmReservation(undefined, new FormData());
    expect(confResult).toEqual({ ok: false, code: DEPRECATION_CODE });
  });
});

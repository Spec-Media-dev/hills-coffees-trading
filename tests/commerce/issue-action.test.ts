import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), issue: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/commerce/proforma", () => ({ issueProforma: mocks.issue }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requestProforma } from "@/src/app/dashboard/checkout/actions";

const orderId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const destinationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function fd(order: unknown, destination: unknown) {
  const data = new FormData();
  if (order !== undefined) data.set("orderId", String(order));
  if (destination !== undefined) data.set("destinationId", String(destination));
  return data;
}

describe("T085 issue-proforma action — direct deprecation under Feature 015 cutover", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns endpoint_deprecated_use_checkout_v1 immediately without validating old payload or calling DAL", async () => {
    const result = await requestProforma(undefined, fd(orderId, destinationId));
    expect(result).toEqual({ ok: false, code: "endpoint_deprecated_use_checkout_v1" });
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns endpoint_deprecated_use_checkout_v1 even with invalid payload", async () => {
    const result = await requestProforma(undefined, fd("not-a-uuid", "also-not-a-uuid"));
    expect(result).toEqual({ ok: false, code: "endpoint_deprecated_use_checkout_v1" });
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});

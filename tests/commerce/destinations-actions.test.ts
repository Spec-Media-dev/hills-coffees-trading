import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DestinationInput } from "@/lib/commerce/destination-validation";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), save: vi.fn(), retire: vi.fn(), read: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: mocks.identity }));
vi.mock("@/lib/commerce/destinations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/commerce/destinations")>();
  return { ...actual, saveDestination: mocks.save, retireDestination: mocks.retire, readDestinations: mocks.read };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { upsertDestination } from "@/src/app/dashboard/destinations/actions";

const buyer = { kind: "authenticated", isAuthorizedMember: true, requiresMfaStepUp: false, organization: { canBuy: true, organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
const fields = { label: "Dubai", countryCode: "AE", city: "Dubai", addressLine1: "Street 1", addressLine2: "", contactName: "Buyer", contactPhone: "+971501234567", deliveryMethod: "Courier" as const, isDefault: true };

beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue(buyer); });

describe("T075 destinations", () => {
  it("validates ISO-2 country and E.164 phone", () => {
    expect(DestinationInput.safeParse(fields).success).toBe(true);
    expect(DestinationInput.safeParse({ ...fields, countryCode: "United Arab Emirates" }).success).toBe(false);
    expect(DestinationInput.safeParse({ ...fields, contactPhone: "050 123 4567" }).success).toBe(false);
  });

  it("validates before identity and writes", async () => {
    const data = new FormData(); data.set("label", "Dubai"); data.set("countryCode", "AEE");
    expect(await upsertDestination(undefined, data)).toEqual({ ok: false, code: "validation_error" });
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("sends one server request id and only validated fields for the acting organization", async () => {
    mocks.save.mockResolvedValue({ ok: true, data: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) if (typeof value === "string") data.set(key, value);
    data.set("isDefault", "on");
    expect((await upsertDestination(undefined, data)).ok).toBe(true);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    const [org, input, requestId] = mocks.save.mock.calls[0];
    expect(org).toBe(buyer.organization.organizationId);
    expect(input).toEqual(fields);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses RLS reads and M4a RPCs only; no direct member writes", () => {
    const source = readFileSync("lib/commerce/destinations.ts", "utf8");
    expect(source).toContain('rpc("upsert_delivery_destination"');
    expect(source).toContain('rpc("retire_delivery_destination"');
    expect(source).not.toMatch(/\.from\("delivery_destinations"\)\.insert|\.from\("delivery_destinations"\)\.update|\.from\("delivery_destinations"\)\.delete/);
  });
});

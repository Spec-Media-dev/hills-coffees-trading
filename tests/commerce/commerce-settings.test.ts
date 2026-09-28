import { describe, expect, it, vi } from "vitest";
import { en } from "@/lib/app/copy/en";
import { ar } from "@/lib/app/copy/ar";

const mocks = vi.hoisted(() => ({ access: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin/guards", () => ({ checkAreaAccess: mocks.access }));
vi.mock("@/lib/admin/commerce-settings", () => ({ updateCommerceSettings: mocks.update }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { saveCommerceSettings } from "@/src/app/dashboard-admin/(system)/commerce-settings/actions";
import { ADMIN_AREAS } from "@/lib/admin/areas";

const current = { proformaValidityHours: 24, bankTransferCheckoutEnabled: true, proofSubmissionEnabled: false, pilotOrganizationIds: [], updatedAt: null };

function fd(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

describe("T101 commerce settings admin", () => {
  it("declares the area as is_platform_admin, live, under the system group", () => {
    const area = ADMIN_AREAS.find((a) => a.key === "commerceSettings");
    expect(area).toBeDefined();
    expect(area?.roleFunction).toBe("is_platform_admin");
    expect(area?.group).toBe("system");
    expect(area?.availability).toBe("live");
    expect(area?.href).toBe("/dashboard-admin/commerce-settings");
  });

  it("checks area access before touching any input", async () => {
    mocks.access.mockResolvedValue({ ok: false, denial: "forbidden" });
    const result = await saveCommerceSettings(undefined, fd({ validityHours: "24", pilotOrganizationIds: "" }));
    expect(result).toEqual({ ok: false, code: "admin_forbidden" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID pilot organization id with a field error, never calling update", async () => {
    mocks.access.mockResolvedValue({ ok: true });
    const result = await saveCommerceSettings(undefined, fd({ validityHours: "24", checkoutEnabled: "on", pilotOrganizationIds: "not-a-uuid" }));
    expect(result.ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not send a proofSubmissionEnabled value on writes (the RPC preserves it atomically)", async () => {
    mocks.access.mockResolvedValue({ ok: true });
    mocks.update.mockResolvedValue({ ok: true, data: { ...current, proofSubmissionEnabled: true } });
    await saveCommerceSettings(undefined, fd({ validityHours: "48", pilotOrganizationIds: "" }));
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ validityHours: 48, checkoutEnabled: false, pilotOrganizationIds: [] });
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("currentProofSubmissionEnabled");
  });

  it("maps mfa_step_up_required and forbidden RPC refusals to the shared ACTION_FEEDBACK vocabulary", async () => {
    mocks.access.mockResolvedValue({ ok: true });
    for (const [code, expected] of [["mfa_step_up_required", "mfa_step_up_required"], ["forbidden", "admin_forbidden"]] as const) {
      mocks.update.mockResolvedValue({ ok: false, code });
      const result = await saveCommerceSettings(undefined, fd({ validityHours: "24", pilotOrganizationIds: "" }));
      expect(result).toEqual({ ok: false, code: expected });
    }
  });

  it("revalidates the settings page and reports success only when the RPC succeeds", async () => {
    mocks.access.mockResolvedValue({ ok: true });
    mocks.update.mockResolvedValue({ ok: true, data: current });
    const result = await saveCommerceSettings(undefined, fd({ validityHours: "24", checkoutEnabled: "on", pilotOrganizationIds: "" }));
    expect(result).toEqual({ ok: true, data: undefined, code: "system_saved" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard-admin/commerce-settings");
  });

  it("keeps every commerce-settings admin UI string in parity-safe EN/AR copy", () => {
    expect(Object.keys(ar.admin!.system!.commerceSettings!)).toEqual(Object.keys(en.admin.system.commerceSettings));
    for (const value of Object.values(ar.admin!.system!.commerceSettings!)) expect(value!.trim()).not.toBe("");
    expect(ar.admin!.areas!.commerceSettings!.trim()).not.toBe("");
  });
});

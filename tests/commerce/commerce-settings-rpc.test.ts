import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

import { updateCommerceSettings } from "@/lib/admin/commerce-settings";

describe("T101 update_commerce_settings RPC adapter", () => {
  it("can clear the pilot allowlist while preserving the cancelled proof switch atomically", async () => {
    mocks.rpc.mockResolvedValue({
      data: { proforma_validity_hours: 24, bank_transfer_checkout_enabled: false, proof_submission_enabled: true, pilot_organization_ids: [] },
      error: null,
    });
    const result = await updateCommerceSettings({ validityHours: 24, checkoutEnabled: false, pilotOrganizationIds: [], requestId: "11111111-1111-4111-8111-111111111111" });
    expect(mocks.rpc).toHaveBeenCalledWith("update_commerce_settings", {
      p_validity_hours: 24,
      p_checkout_enabled: false,
      p_proof_enabled: null,
      p_pilot_organization_ids: [],
      p_request_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toMatchObject({ ok: true, data: { pilotOrganizationIds: [], proofSubmissionEnabled: true } });
  });
});

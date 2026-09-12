import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 006 RUN B (T014) — LIVE refusal paths through the real Server Action, via a real fixture
 * session (nothing mocked except the request-scoped Supabase client itself, same established pattern
 * as `eligibility.test.ts`). Every case here is genuine DIRECT INVOCATION of the exported function —
 * there is no UI/form layer in this test at all, exactly proving the run directive's "direct
 * invocation cannot bypass the UI" requirement (there is no UI to bypass; the function itself is the
 * boundary). The `eligible: true` happy path and the coffee-context-unavailable path are proven
 * separately, with module mocks, in `create-action-eligible.test.ts` (see that file's header for why
 * — the same reason `eligibility.test.ts` documents: no settled order exists in the live database).
 */

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

const formDataFrom = (fields: Record<string, string>): FormData => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
};

const validFormFields = { quantityKg: "10", pricePerKg: "5", currency: "USD" };

describe("T014 — live refusal paths through the real Server Action (no UI layer, direct invocation)", () => {
  it("VALIDATION_ERROR — missing quantity/price is refused before any database call at all", async () => {
    const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
    const result = await createListingDraft(undefined, formDataFrom({ positionId: INVENTORY_FIXTURES.orgA.positionId }));
    expect(result).toMatchObject({ ok: false, code: "validation_error" });
  });

  it("SELLER_NOT_CAPABLE — a real buyer-only (canSell=false) session is refused, regardless of positionId", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
      return createListingDraft(undefined, formDataFrom({ positionId: INVENTORY_FIXTURES.orgA.positionId, ...validFormFields }));
    });
    expect(result).toEqual({ ok: false, code: "seller_not_capable" });
  });

  it("POSITION_NOT_OWNED — Org B (real canSell=true) submitting Org A's real positionId, cross-org", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
      return createListingDraft(undefined, formDataFrom({ positionId: INVENTORY_FIXTURES.orgA.positionId, ...validFormFields }));
    });
    expect(result).toEqual({ ok: false, code: "listing_ineligible", fieldErrors: { positionId: ["POSITION_NOT_OWNED"] } });
  });

  it("CUSTODY_NOT_ELIGIBLE — Org B's own position, inactive warehouse", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
      return createListingDraft(undefined, formDataFrom({ positionId: LISTING_FIXTURES.positionOrgBInactiveWarehouse, ...validFormFields }));
    });
    expect(result).toEqual({ ok: false, code: "listing_ineligible", fieldErrors: { positionId: ["CUSTODY_NOT_ELIGIBLE"] } });
  });

  it("NOT_HILLS_SOURCED — Org B's own position, active warehouse, no settled purchase of that lot", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
      return createListingDraft(undefined, formDataFrom({ positionId: LISTING_FIXTURES.positionOrgBOnLotA, ...validFormFields }));
    });
    expect(result).toEqual({ ok: false, code: "listing_ineligible", fieldErrors: { positionId: ["NOT_HILLS_SOURCED"] } });
  });

  it("forged extra fields (organization id, created_by, status) change NOTHING — the identical refusal is returned", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
      return createListingDraft(
        undefined,
        formDataFrom({
          positionId: INVENTORY_FIXTURES.orgA.positionId, // real cross-org id
          ...validFormFields,
          sellerOrganizationId: "11111111-1111-4111-8111-111111111111",
          createdBy: "22222222-2222-4222-8222-222222222222",
          status: "PUBLISHED",
        })
      );
    });
    expect(result).toEqual({ ok: false, code: "listing_ineligible", fieldErrors: { positionId: ["POSITION_NOT_OWNED"] } });
  });
});

describe("T014 — safe insert allowlist and no forged status (source-level proof)", () => {
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("the insert supplies only explicit fields — no spread of client input, no status/is_visible/reserved/filled fields set", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("src/app/dashboard/listings/new/actions.ts", "utf8"));
    expect(source).toMatch(/\.insert\(\{/);
    expect(source).not.toMatch(/\.insert\(\s*(formData|parsed\.data|Object\.fromEntries)/);
    expect(source).not.toMatch(/\.insert\(\{[\s\S]*?\.\.\./);
    expect(source).not.toMatch(/status:\s*parsed\.data/);
    expect(source).not.toMatch(/is_visible:/);
    expect(source).not.toMatch(/reserved_quantity_kg:/);
    expect(source).not.toMatch(/filled_quantity_kg:/);
  });

  it("ListingCreateFormInput has no seller-organization/created-by/status field for the client to forge in the first place", async () => {
    const { ListingCreateFormInput } = await import("@/lib/listings/validation");
    const parsed = ListingCreateFormInput.safeParse({
      positionId: "11111111-1111-4111-8111-111111111111",
      quantityKg: 10,
      pricePerKg: 5,
      currency: "USD",
      sellerOrganizationId: "leak",
      createdBy: "leak",
      status: "PUBLISHED",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("sellerOrganizationId");
      expect(parsed.data).not.toHaveProperty("createdBy");
      expect(parsed.data).not.toHaveProperty("status");
    }
  });

  it("never references a service-role credential", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/listings/new/actions.ts", "utf8");
    expect(source).not.toMatch(/SERVICE_ROLE|service_role/i);
  });
});

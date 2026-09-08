import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAnonymousFixtureClient,
  FOUNDATION_FIXTURES,
  setBuyerAndSellerCanSell,
  signInAsFixture,
} from "./fixture-session";

const serverClientState = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) {
      throw new Error("Test request has no Supabase client");
    }
    return serverClientState.client;
  }),
}));

async function resolveIdentity(client: SupabaseClient) {
  serverClientState.client = client;
  vi.resetModules();
  const { getRequestIdentity } = await import("@/lib/auth/dal");
  return getRequestIdentity();
}

afterEach(() => {
  serverClientState.client = null;
  vi.clearAllMocks();
});

describe.sequential("getRequestIdentity against Phase 8 fixtures", () => {
  it("returns the exact anonymous identity when there is no session", async () => {
    const identity = await resolveIdentity(createAnonymousFixtureClient());

    expect(identity).toEqual({ kind: "anonymous" });
  });

  it("resolves buyer-only with no seller capability", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const identity = await resolveIdentity(client);

    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.organization?.organizationId).toBe(
      FOUNDATION_FIXTURES.buyerOnly.organizationId
    );
    expect(identity.organization?.canSell).toBe(false);
  });

  it("resolves buyer-and-seller with seller capability", async () => {
    const client = await signInAsFixture(
      FOUNDATION_FIXTURES.buyerAndSeller.email
    );
    const identity = await resolveIdentity(client);

    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.organization?.organizationId).toBe(
      FOUNDATION_FIXTURES.buyerAndSeller.organizationId
    );
    expect(identity.organization?.canSell).toBe(true);
  });

  it("isolates the warehouse role from finance", async () => {
    const client = await signInAsFixture(
      FOUNDATION_FIXTURES.warehouseAdmin.email
    );
    const identity = await resolveIdentity(client);

    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.operationalRoles).toContain("WAREHOUSE");
    expect(identity.operationalRoles).not.toContain("FINANCE");
  });

  it(
    "reads a changed can_sell value on the next identity resolution",
    async () => {
      const client = await signInAsFixture(
        FOUNDATION_FIXTURES.buyerAndSeller.email
      );

      // Recover the canonical state first if an earlier process was interrupted before its finally.
      setBuyerAndSellerCanSell(true);
      const before = await resolveIdentity(client);
      expect(before.kind).toBe("authenticated");
      if (before.kind !== "authenticated") return;
      expect(before.organization?.canSell).toBe(true);

      try {
        setBuyerAndSellerCanSell(false);
        const after = await resolveIdentity(client);
        expect(after.kind).toBe("authenticated");
        if (after.kind !== "authenticated") return;
        expect(after.userId).toBe(before.userId);
        expect(after.organization?.organizationId).toBe(
          before.organization?.organizationId
        );
        expect(after.organization?.canSell).toBe(false);
      } finally {
        setBuyerAndSellerCanSell(true);
      }

      const restored = await resolveIdentity(client);
      expect(restored.kind).toBe("authenticated");
      if (restored.kind !== "authenticated") return;
      expect(restored.organization?.canSell).toBe(true);
    },
    15_000
  );
});

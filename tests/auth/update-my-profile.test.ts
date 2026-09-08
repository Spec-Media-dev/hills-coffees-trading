import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAnonymousFixtureClient,
  FOUNDATION_FIXTURES,
  signInAsFixture,
} from "./fixture-session";

const serverClientState = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
  createClientCalls: 0,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    serverClientState.createClientCalls += 1;
    if (!serverClientState.client) {
      throw new Error("Test request has no Supabase client");
    }
    return serverClientState.client;
  }),
}));

async function loadAction(client: SupabaseClient) {
  serverClientState.client = client;
  vi.resetModules();
  return import("@/src/app/dashboard/settings/actions");
}

function validProfileForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    fullName: "Foundation Test — Phase 9 Updated",
    phone: "+971500000009",
    companyName: "Foundation Test — Phase 9 Company",
    avatarPath: "foundation-test/profile.png",
    ...overrides,
  };

  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}

afterEach(() => {
  serverClientState.client = null;
  serverClientState.createClientCalls = 0;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe.sequential("updateMyProfile against Phase 8 fixtures", () => {
  it("rejects an unauthenticated request without invoking an RPC", async () => {
    const client = createAnonymousFixtureClient();
    const rpc = vi.spyOn(client, "rpc");
    const { updateMyProfile } = await loadAction(client);

    const result = await updateMyProfile(undefined, validProfileForm());

    expect(result).toEqual({
      ok: false,
      error: "You need to sign in to do that.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input before auth or RPC access", async () => {
    const client = createAnonymousFixtureClient();
    const rpc = vi.spyOn(client, "rpc");
    const { updateMyProfile } = await loadAction(client);

    const result = await updateMyProfile(
      undefined,
      validProfileForm({ fullName: "x".repeat(201) })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.fullName?.length).toBeGreaterThan(0);
    expect(serverClientState.createClientCalls).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("updates the authenticated fixture profile and restores its canonical row", async () => {
    const fixture = FOUNDATION_FIXTURES.buyerOnly;
    const client = await signInAsFixture(fixture.email);
    const { updateMyProfile } = await loadAction(client);

    try {
      const result = await updateMyProfile(undefined, validProfileForm());
      expect(result).toEqual({
        ok: true,
        data: {
          fullName: "Foundation Test — Phase 9 Updated",
          companyName: "Foundation Test — Phase 9 Company",
        },
      });

      const { data, error } = await client
        .from("profiles")
        .select("full_name, phone, company_name, avatar_path")
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({
        full_name: "Foundation Test — Phase 9 Updated",
        phone: "+971500000009",
        company_name: "Foundation Test — Phase 9 Company",
        avatar_path: "foundation-test/profile.png",
      });
    } finally {
      const canonical = fixture.canonicalProfile;
      const { error } = await client.rpc("update_my_profile", {
        p_full_name: canonical.fullName,
        p_phone: canonical.phone,
        p_company_name: canonical.companyName,
        p_avatar_path: canonical.avatarPath,
      });
      expect(error).toBeNull();
    }

    const { data: restored, error: restoreReadError } = await client
      .from("profiles")
      .select("full_name, phone, company_name, avatar_path")
      .single();
    expect(restoreReadError).toBeNull();
    expect(restored).toEqual({
      full_name: fixture.canonicalProfile.fullName,
      phone: fixture.canonicalProfile.phone,
      company_name: fixture.canonicalProfile.companyName,
      avatar_path: fixture.canonicalProfile.avatarPath,
    });
  });

  it("maps a database failure to a safe result without exposing raw details", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const originalRpc = client.rpc.bind(client);
    const rawErrorSentinel = "raw-postgres-sentinel relation public.profiles";

    vi.spyOn(client, "rpc").mockImplementation(
      ((fn: string, args?: Record<string, unknown>) => {
        if (fn === "update_my_profile") {
          return Promise.resolve({
            data: null,
            error: {
              code: "XX000",
              details: "internal database detail",
              hint: "private implementation hint",
              message: rawErrorSentinel,
            },
          });
        }
        return originalRpc(fn, args);
      }) as typeof client.rpc
    );

    const { updateMyProfile } = await loadAction(client);
    const result = await updateMyProfile(undefined, validProfileForm());
    const serializedResult = JSON.stringify(result);

    expect(result).toEqual({
      ok: false,
      error: "That didn't save — please try again.",
    });
    expect(serializedResult).not.toContain(rawErrorSentinel);
    expect(serializedResult.toLowerCase()).not.toContain("stack");
    expect(serializedResult.toLowerCase()).not.toContain("service_role");
  });
});

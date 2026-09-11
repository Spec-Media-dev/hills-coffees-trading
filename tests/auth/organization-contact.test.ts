import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAnonymousFixtureClient,
  FOUNDATION_FIXTURES,
  signInAsFixture,
} from "./fixture-session";

/**
 * Feature 003 T026 — `updateOrganizationContact` (`src/app/dashboard/settings/actions.ts`).
 *
 * Unlike `agreement_acceptances`, `update_organization_contact` IS the approved write path itself
 * (a SECURITY DEFINER RPC, re-verifying `is_org_member`/`NOT is_blocked_user` internally) — so this
 * test captures the fixture organization's CURRENT contact row before mutating it and restores that
 * exact captured state afterward via the same RPC, rather than hard-coding a canonical value the
 * live row might have drifted from (same pattern as `tests/auth/update-my-profile.test.ts`, adapted
 * because no fixed "canonical organization contact" constant exists in `fixture-session.ts`).
 */

const serverClientState = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
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

function contactForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    displayName: "Foundation Test — Phase 6/7 Trading Name",
    email: "phase67-contact@example.com",
    phone: "+971500000067",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }
  return formData;
}

afterEach(() => {
  serverClientState.client = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("updateOrganizationContact — source boundary", () => {
  const source = readFileSync("src/app/dashboard/settings/actions.ts", "utf8");

  it("calls only the approved update_organization_contact RPC — no direct organizations table UPDATE anywhere in this file", () => {
    expect(source).toMatch(/rpc\(\s*["']update_organization_contact["']/);
    expect(source).not.toMatch(/\.from\(\s*["']organizations["']\)\s*\.update\(/);
  });

  it("passes only the RPC's three approved parameters — never a protected/admin-controlled field", () => {
    const rpcCallMatch = source.match(/rpc\(\s*["']update_organization_contact["'][\s\S]*?\}\s*\)/);
    expect(rpcCallMatch).not.toBeNull();
    const rpcCall = rpcCallMatch?.[0] ?? "";
    expect(rpcCall).toMatch(/p_organization_id/);
    expect(rpcCall).toMatch(/p_display_name/);
    expect(rpcCall).toMatch(/p_email/);
    expect(rpcCall).toMatch(/p_phone/);
    for (const protectedField of ["status", "account_type", "can_buy", "can_sell", "is_hills_internal", "created_by"]) {
      expect(rpcCall).not.toContain(protectedField);
    }
  });

  it("derives p_organization_id from the fresh acting organization, never from form input", () => {
    expect(source).toMatch(/p_organization_id:\s*identity\.organization\.organizationId/);
    expect(source).not.toMatch(/formData\.get\(\s*["']organizationId["']/);
  });
});

describe.sequential("updateOrganizationContact against Phase 8 fixtures", () => {
  it("rejects an unauthenticated request without invoking the RPC", async () => {
    const client = createAnonymousFixtureClient();
    const rpc = vi.spyOn(client, "rpc");
    const { updateOrganizationContact } = await loadAction(client);

    const result = await updateOrganizationContact(undefined, contactForm());

    expect(result).toEqual({ ok: false, code: "profile_auth_required" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a field validation error for an invalid email before any RPC access", async () => {
    const client = createAnonymousFixtureClient();
    const rpc = vi.spyOn(client, "rpc");
    const { updateOrganizationContact } = await loadAction(client);

    const result = await updateOrganizationContact(undefined, contactForm({ email: "not-an-email" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.email?.length).toBeGreaterThan(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("updates the acting organization's contact fields through the RPC, then restores the captured original row", async () => {
    const fixture = FOUNDATION_FIXTURES.buyerOnly;
    const client = await signInAsFixture(fixture.email);
    const { updateOrganizationContact } = await loadAction(client);

    const { data: original, error: readError } = await client
      .from("organizations")
      .select("display_name, email, phone")
      .eq("id", fixture.organizationId)
      .single();
    expect(readError).toBeNull();

    try {
      const result = await updateOrganizationContact(undefined, contactForm());
      expect(result).toEqual({ ok: true, data: undefined, code: "organization_contact_saved" });

      const { data: updated, error: updatedError } = await client
        .from("organizations")
        .select("display_name, email, phone")
        .eq("id", fixture.organizationId)
        .single();
      expect(updatedError).toBeNull();
      expect(updated).toEqual({
        display_name: "Foundation Test — Phase 6/7 Trading Name",
        email: "phase67-contact@example.com",
        phone: "+971500000067",
      });
    } finally {
      const { error: restoreError } = await client.rpc("update_organization_contact", {
        p_organization_id: fixture.organizationId,
        p_display_name: original?.display_name ?? null,
        p_email: original?.email ?? null,
        p_phone: original?.phone ?? null,
      });
      expect(restoreError).toBeNull();
    }
  });

  it("maps an RPC failure to a safe result without exposing raw database detail", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const originalRpc = client.rpc.bind(client);
    const rawErrorSentinel = "raw-postgres-sentinel relation public.organizations";

    vi.spyOn(client, "rpc").mockImplementation(
      ((fn: string, args?: Record<string, unknown>) => {
        if (fn === "update_organization_contact") {
          return Promise.resolve({
            data: null,
            error: { code: "XX000", message: rawErrorSentinel, details: "internal detail", hint: "hint" },
          });
        }
        return originalRpc(fn, args);
      }) as typeof client.rpc
    );

    const { updateOrganizationContact } = await loadAction(client);
    const result = await updateOrganizationContact(undefined, contactForm());
    const serialized = JSON.stringify(result);

    expect(result).toEqual({ ok: false, code: "organization_contact_save_failed" });
    expect(serialized).not.toContain(rawErrorSentinel);
    expect(serialized.toLowerCase()).not.toContain("service_role");
  });
});

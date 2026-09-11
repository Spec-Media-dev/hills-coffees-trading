import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Feature 003 T002 verification — acting-organization resolution
 * (`lib/auth/dal.ts#resolveOrganizations`/`#resolveActingOrganization`, exercised through
 * `getRequestIdentity()`).
 *
 * Uses a minimal hand-built fake Supabase client rather than the real seeded test project: no
 * multi-organization fixture user exists yet (seeding one is Phase 8's `T029`, explicitly out of
 * this run's scope) — this proves the SELECTION ALGORITHM itself, independent of real DB round
 * trips, exactly the isolation a unit test should have.
 */

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
  }),
}));

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));

type OrgRow = { organization_id: string; member_role: string; display_name: string; canBuy: boolean; canSell: boolean };

/** A minimal fake mirroring only the exact chains `lib/auth/dal.ts` calls. */
function fakeClient(userId: string, orgRows: OrgRow[]): SupabaseClient {
  function chainable(result: { data: unknown; error: unknown }) {
    const node: Record<string, unknown> = {
      eq: () => node,
      order: () => node,
      maybeSingle: async () => result,
      then: (resolve: (value: unknown) => void) => resolve(result),
    };
    return node;
  }

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      mfa: {
        // No enrolled factor for any T002 fixture in this narrow unit test — currentLevel/nextLevel
        // both "aal1" is Supabase's own honest representation of "no step-up owed" (T033).
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [] },
          error: null,
        }),
      },
    },
    from(table: string) {
      return {
        select: () => {
          if (table === "profiles") {
            return chainable({ data: { full_name: "Test User", company_name: null }, error: null });
          }
          if (table === "organization_members") {
            return chainable({
              data: orgRows.map((r) => ({ organization_id: r.organization_id, member_role: r.member_role })),
              error: null,
            });
          }
          if (table === "organizations") {
            // Called once per org id; select() returns the SAME chainable for whichever row matches
            // the most recently-requested id captured via eq() closures below.
            let requestedId: string | undefined;
            const node: Record<string, unknown> = {
              eq: (_col: string, value: string) => {
                requestedId = value;
                return node;
              },
              maybeSingle: async () => {
                const row = orgRows.find((r) => r.organization_id === requestedId);
                return row
                  ? { data: { id: row.organization_id, display_name: row.display_name }, error: null }
                  : { data: null, error: null };
              },
            };
            return node;
          }
          return chainable({ data: null, error: null });
        },
      };
    },
    rpc: async (fn: string, args?: Record<string, string>) => {
      if (fn === "is_org_member") {
        const found = orgRows.some((r) => r.organization_id === args?.p_organization_id);
        return { data: found, error: null };
      }
      if (fn === "organization_can_buy") {
        const row = orgRows.find((r) => r.organization_id === args?.p_organization_id);
        return { data: row?.canBuy ?? false, error: null };
      }
      if (fn === "organization_can_sell") {
        const row = orgRows.find((r) => r.organization_id === args?.p_organization_id);
        return { data: row?.canSell ?? false, error: null };
      }
      // is_authorized_member and every role function default to false for this narrow test.
      return { data: false, error: null };
    },
  };

  return client as unknown as SupabaseClient;
}

async function resolveIdentity() {
  vi.resetModules();
  const { getRequestIdentity } = await import("@/lib/auth/dal");
  return getRequestIdentity();
}

afterEach(() => {
  serverClientState.client = null;
  cookieState.value = undefined;
  vi.clearAllMocks();
});

describe("T002 — acting-organization resolution", () => {
  it("resolves implicitly when exactly one active membership exists", async () => {
    serverClientState.client = fakeClient("user-1", [
      { organization_id: "org-a", member_role: "OWNER", display_name: "Org A", canBuy: true, canSell: false },
    ]);

    const identity = await resolveIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.organizations).toHaveLength(1);
    expect(identity.organization?.organizationId).toBe("org-a");
    expect(identity.requiresOrganizationSelection).toBe(false);
  });

  it("does NOT silently pick a first organization when multiple exist and no selection is stored", async () => {
    serverClientState.client = fakeClient("user-2", [
      { organization_id: "org-a", member_role: "OWNER", display_name: "Org A", canBuy: true, canSell: false },
      { organization_id: "org-b", member_role: "MEMBER", display_name: "Org B", canBuy: true, canSell: true },
    ]);

    const identity = await resolveIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.organizations).toHaveLength(2);
    expect(identity.organization).toBeNull();
    expect(identity.requiresOrganizationSelection).toBe(true);
  });

  it("honours an explicit, membership-verified selection cookie among multiple memberships", async () => {
    serverClientState.client = fakeClient("user-3", [
      { organization_id: "org-a", member_role: "OWNER", display_name: "Org A", canBuy: true, canSell: false },
      { organization_id: "org-b", member_role: "MEMBER", display_name: "Org B", canBuy: true, canSell: true },
    ]);
    cookieState.value = "org-b";

    const identity = await resolveIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.organization?.organizationId).toBe("org-b");
    expect(identity.organization?.canSell).toBe(true);
    expect(identity.requiresOrganizationSelection).toBe(false);
  });

  it("never trusts a selection cookie naming an organization the caller does not actually belong to", async () => {
    serverClientState.client = fakeClient("user-4", [
      { organization_id: "org-a", member_role: "OWNER", display_name: "Org A", canBuy: true, canSell: false },
      { organization_id: "org-b", member_role: "MEMBER", display_name: "Org B", canBuy: true, canSell: true },
    ]);
    cookieState.value = "org-not-a-real-membership";

    const identity = await resolveIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.organization).toBeNull();
    expect(identity.requiresOrganizationSelection).toBe(true);
  });

  it("resolves organization: null with no selection requirement for a genuinely unattached user", async () => {
    serverClientState.client = fakeClient("user-5", []);

    const identity = await resolveIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind !== "authenticated") return;
    expect(identity.organizations).toHaveLength(0);
    expect(identity.organization).toBeNull();
    expect(identity.requiresOrganizationSelection).toBe(false);
  });
});

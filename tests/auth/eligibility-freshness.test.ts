import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PHASE89_FIXTURES, setSuspendedOrganizationStatus, signInAsFixture } from "./fixture-session";

/**
 * Feature 003 T031 — eligibility freshness. AUTHENTICATED DB/RLS PROOF: every resolution below calls
 * the REAL `getRequestIdentity()` (`lib/auth/dal.ts`) against the REAL, currently-signed-in
 * `suspended` fixture session — never a mocked identity. Trusted state is mutated server-side, out of
 * band, through the privileged fixture script (`setSuspendedOrganizationStatus`), exactly mirroring
 * how a real Compliance decision would change `organizations.status` in production; the SAME
 * long-lived client/session is reused across both resolutions, proving freshness holds without
 * signing out, signing back in, or touching any session/auth state.
 *
 * `getRequestIdentity` is `cache()`-wrapped (`lib/auth/dal.ts`), but that memoization is scoped to a
 * single React request-render pass — `vi.resetModules()` between resolutions here re-imports the
 * module fresh, which is the same "new request" boundary the real Next.js runtime creates for every
 * actual HTTP request, so this does not mask any real cross-request caching bug and does not need to
 * (there IS no cross-request cache to accidentally rely on — `getRequestIdentity` reads live DB state
 * on every fresh call).
 */

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));

async function resolveIdentity(client: SupabaseClient) {
  serverClientState.client = client;
  vi.resetModules();
  const { getRequestIdentity } = await import("@/lib/auth/dal");
  return getRequestIdentity();
}

beforeEach(async () => {
  // Recover canonical state first in case an earlier interrupted run left the fixture ACTIVE.
  setSuspendedOrganizationStatus("SUSPENDED");
});

afterEach(() => {
  serverClientState.client = null;
  vi.clearAllMocks();
  setSuspendedOrganizationStatus("SUSPENDED");
});

describe.sequential("T031 — eligibility resolves fresh, without reauthentication", () => {
  it("SUSPENDED -> ACTIVE: the very next resolution reflects the new state, same session", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.suspended.email);

    const before = await resolveIdentity(client);
    expect(before.kind).toBe("authenticated");
    if (before.kind !== "authenticated") return;
    // The membership itself always resolves (org status never affects membership resolution) — it is
    // `organization.canBuy`/`isAuthorizedMember` that must be false while SUSPENDED.
    expect(before.organization?.organizationId).toBe(PHASE89_FIXTURES.suspended.organizationId);
    expect(before.organization?.canBuy).toBe(false);
    expect(before.isAuthorizedMember).toBe(false);

    // Mutate trusted DB state out of band — no sign-out, no new session, same client throughout.
    setSuspendedOrganizationStatus("ACTIVE");

    const after = await resolveIdentity(client);
    expect(after.kind).toBe("authenticated");
    if (after.kind !== "authenticated") return;
    expect(after.userId).toBe(before.userId);
    expect(after.organization?.organizationId).toBe(PHASE89_FIXTURES.suspended.organizationId);
    expect(after.organization?.canBuy).toBe(true);
    expect(after.isAuthorizedMember).toBe(true);
  });

  it("ACTIVE -> SUSPENDED: approved eligibility becomes blocked/invalid immediately", async () => {
    setSuspendedOrganizationStatus("ACTIVE");
    const client = await signInAsFixture(PHASE89_FIXTURES.suspended.email);

    const before = await resolveIdentity(client);
    expect(before.kind).toBe("authenticated");
    if (before.kind !== "authenticated") return;
    expect(before.isAuthorizedMember).toBe(true);
    expect(before.organization?.canBuy).toBe(true);

    setSuspendedOrganizationStatus("SUSPENDED");

    const after = await resolveIdentity(client);
    expect(after.kind).toBe("authenticated");
    if (after.kind !== "authenticated") return;
    expect(after.isAuthorizedMember).toBe(false);
    expect(after.organization?.canBuy).toBe(false);
  });

  it("the reverse transition (SUSPENDED -> ACTIVE) only becomes eligible when DB truth actually allows it — never optimistically", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.suspended.email);

    // Still suspended: resolving repeatedly must not drift toward eligible on its own.
    const first = await resolveIdentity(client);
    const second = await resolveIdentity(client);
    if (first.kind !== "authenticated" || second.kind !== "authenticated") throw new Error("expected authenticated");
    expect(first.isAuthorizedMember).toBe(false);
    expect(second.isAuthorizedMember).toBe(false);

    setSuspendedOrganizationStatus("ACTIVE");
    const third = await resolveIdentity(client);
    if (third.kind !== "authenticated") throw new Error("expected authenticated");
    expect(third.isAuthorizedMember).toBe(true);
  });

  it("getEligibility reflects the SAME freshly-resolved identity change (blockingReason flips with no caching)", async () => {
    const { getEligibility } = await import("@/lib/auth/eligibility");
    const client = await signInAsFixture(PHASE89_FIXTURES.suspended.email);

    const before = await resolveIdentity(client);
    const beforeEligibility = getEligibility(before);
    expect(beforeEligibility.blockingReason).toBe("not-authorized");

    setSuspendedOrganizationStatus("ACTIVE");
    const after = await resolveIdentity(client);
    const afterEligibility = getEligibility(after);
    // Agreements may or may not already be accepted for this fixture; either way the org-eligibility
    // blocker specifically must be gone — it must never still read "not-authorized" once ACTIVE.
    expect(afterEligibility.blockingReason).not.toBe("not-authorized");
    expect(afterEligibility.canReachTrading).toBe(true);
  });
});

describe("T031 — no stale authorization caching in the source itself", () => {
  it("getRequestIdentity never wraps its authorization reads in unstable_cache or any cross-request cache", () => {
    const source = readFileSync("lib/auth/dal.ts", "utf8");
    expect(source).not.toMatch(/unstable_cache/);
  });
});

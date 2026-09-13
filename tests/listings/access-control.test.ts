import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  INVENTORY_FIXTURES,
  LISTING_FIXTURES,
  PHASE89_FIXTURES,
  createAnonymousFixtureClient,
  setSuspendedOrganizationStatus,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 006 RUN C (T021) — AC-01, the release-blocking access-control acceptance criterion. All
 * five written cases, tested against the REAL `lib/listings/browse.ts` read layer (never hidden-UI
 * assertions, never service-role as the test's own assertion path) — the SAME request-scoped,
 * RLS-respecting client every production Server Component uses, mocked in only at the
 * `@/lib/supabase/server` boundary.
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no client installed");
    return serverClientState.client;
  }),
}));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

async function readPrivateListingData() {
  const { getBrowseListingById, getBrowseListings } = await import("@/lib/listings/browse");
  const [detail, list] = await Promise.all([getBrowseListingById(LISTING_FIXTURES.offerPublished), getBrowseListings({ pageSize: 100 })]);
  return { detail, list };
}

describe("T021 — access control (AC-01): five cases against the real read layer", () => {
  it("1. anonymous — zero private listing data", async () => {
    const client = createAnonymousFixtureClient();
    const { detail, list } = await withLiveClient(client, readPrivateListingData);
    expect(detail).toBeNull();
    expect(list.rows.some((row) => row.id === LISTING_FIXTURES.offerPublished)).toBe(false);
  });

  it("2. authenticated, non-member / unattached (no organization at all) — zero private listing data", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.noOrganization.email);
    const { detail, list } = await withLiveClient(client, readPrivateListingData);
    expect(detail).toBeNull();
    expect(list.rows.some((row) => row.id === LISTING_FIXTURES.offerPublished)).toBe(false);
  });

  it("3. pending KYB (organization exists, application under review) — zero private listing data", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgC.email);
    const { detail, list } = await withLiveClient(client, readPrivateListingData);
    expect(detail).toBeNull();
    expect(list.rows.some((row) => row.id === LISTING_FIXTURES.offerPublished)).toBe(false);
  });

  it("4. suspended organization — zero private listing data", async () => {
    setSuspendedOrganizationStatus("SUSPENDED");
    try {
      const client = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
      const { detail, list } = await withLiveClient(client, readPrivateListingData);
      expect(detail).toBeNull();
      expect(list.rows.some((row) => row.id === LISTING_FIXTURES.offerPublished)).toBe(false);
    } finally {
      setSuspendedOrganizationStatus("ACTIVE");
    }
  });

  it("5. approved active member — proceeds through the normal authorized path", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { detail, list } = await withLiveClient(client, readPrivateListingData);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(LISTING_FIXTURES.offerPublished);
    expect(list.rows.some((row) => row.id === LISTING_FIXTURES.offerPublished)).toBe(true);
  });
});

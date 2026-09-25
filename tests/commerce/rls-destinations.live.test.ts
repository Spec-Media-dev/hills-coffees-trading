import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  F013_FIXTURES,
  F013_LIVE,
  FOUNDATION_FIXTURES,
  cleanupF013M1LiveOrders,
  cleanupF013T031,
  createAnonymousFixtureClient,
  setupF013M1LiveOrders,
  setupF013T031,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 013 T031 (MP-6) — live proof of M2a `20260925103000_feature_013_delivery_destinations.sql` against the linked
 * project. Gated by F013_LIVE=1.
 *
 * Fixtures (privileged work runs only in the fixture script):
 *   - two synthetic, PII-free destinations with exact ids …0000000002a1 (owning buyer = Foundation buyer-only org) and
 *     …0000000002b1 (another organization = Foundation buyer-and-seller org, seller-capable), removed by the named
 *     T031 exact-id exception;
 *   - the exact F013 platform-admin operator (admin+f013-test@example.com), created and removed by the existing
 *     disposable-operator helpers;
 *   - the M1 proof orders (for the LEGACY checks), removed by the approved M1 exact-id exception.
 *
 * Limit (recorded in tasks.md T031): no existing order links the owning buyer to a member seller with a test login,
 * and creating one needs order_items, which no approved cleanup may delete. The seller view is therefore proven with a
 * seller-capable member of another organization; the RLS policy has no order-derived path (postflight #7 verified
 * `is_org_member(organization_id) OR is_platform_admin()` live), and the order-linked seller proof is T056's.
 */
const OWN = "13000000-0000-4000-8000-0000000002a1";
const OTHER = "13000000-0000-4000-8000-0000000002b1";
const OWNER_ORG = FOUNDATION_FIXTURES.buyerOnly.organizationId;
const OTHER_ORG = FOUNDATION_FIXTURES.buyerAndSeller.organizationId;
const MEMBER_ORDER = "13000000-0000-4000-8000-000000000104";
const SNAPSHOT = { label: "x", country_code: "AE", city: "Dubai", address_lines: ["x"], contact_name: "x", contact_phone: "+971500000013", delivery_method: "Courier" };

describe.skipIf(!F013_LIVE)("T031 — M2a delivery destinations live proof", () => {
  let owner: SupabaseClient;
  let otherMember: SupabaseClient;
  let platformAdmin: SupabaseClient;
  let anonymous: SupabaseClient;
  let setup: Record<string, unknown>;

  beforeAll(async () => {
    setupF013M1LiveOrders();
    setup = setupF013T031();
    owner = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    otherMember = await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email);
    platformAdmin = await signInAsFixture(F013_FIXTURES.operators.admin.email);
    anonymous = createAnonymousFixtureClient();
  }, 180_000);

  afterAll(() => {
    const t031 = cleanupF013T031() as { deleted: number; adminFixture: { activeAdminPrivilege: boolean }; remaining: Record<string, number> };
    expect(t031.deleted).toBe(2);
    expect(t031.adminFixture.activeAdminPrivilege).toBe(false);
    expect(t031.remaining).toEqual({
      proofDestinations: 0, allDestinations: 0, ordersWithDestinationId: 0, ordersWithDestinationSnapshot: 0,
      destinationAuditRows: 0, proofIdAuditRows: 0, f013AdminPlatformPrivilege: 0,
    });
    const m1 = cleanupF013M1LiveOrders() as { remaining: Record<string, number> };
    for (const [table, count] of Object.entries(m1.remaining)) expect(count, table).toBe(0);
  }, 180_000);

  it("setup created exactly the two proof destinations", () => {
    expect(setup).toEqual({ destinations: 2, owningOrgDestination: OWN, otherOrgDestination: OTHER });
  });

  describe("read boundary", () => {
    it("the owning organization reads only its own destination rows", async () => {
      const { data, error } = await owner.from("delivery_destinations").select("id, organization_id");
      expect(error).toBeNull();
      expect(data!.map((row) => row.id)).toContain(OWN);
      expect(data!.every((row) => row.organization_id === OWNER_ORG)).toBe(true);
    });

    it("a member of another organization reads 0 of the owner's rows (and only its own)", async () => {
      const { data, error } = await otherMember.from("delivery_destinations").select("id, organization_id");
      expect(error).toBeNull();
      expect(data!.filter((row) => row.organization_id === OWNER_ORG)).toEqual([]);
      expect(data!.every((row) => row.organization_id === OTHER_ORG)).toBe(true);
      expect(data!.map((row) => row.id)).toContain(OTHER);
      const direct = await otherMember.from("delivery_destinations").select("id").eq("id", OWN);
      expect(direct.data).toEqual([]);
    });

    it("a seller (seller-capable member of another organization) reads 0 of the buyer's destination rows", async () => {
      const { data } = await otherMember.from("delivery_destinations").select("id").eq("organization_id", OWNER_ORG);
      expect(data).toEqual([]);
    });

    it("anonymous reads 0 rows (no table privilege)", async () => {
      const { data, error } = await anonymous.from("delivery_destinations").select("id");
      expect(error).not.toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it("a platform admin reads both organizations' rows (as designed)", async () => {
      const { data, error } = await platformAdmin.from("delivery_destinations").select("id").in("id", [OWN, OTHER]);
      expect(error).toBeNull();
      expect(data!.map((row) => row.id).sort()).toEqual([OWN, OTHER].sort());
    });
  });

  describe("no client write path", () => {
    it("direct INSERT by an authenticated member of the owning organization is refused", async () => {
      const { error } = await owner.from("delivery_destinations").insert({
        organization_id: OWNER_ORG, label: "client insert", country_code: "AE", city: "Dubai", address_line_1: "x",
        contact_name: "x", contact_phone: "+971500000013", delivery_method: "Courier",
      });
      expect(error).not.toBeNull();
    });

    it("direct UPDATE (own row and another organization's row) and DELETE are refused; the rows are unchanged", async () => {
      expect((await owner.from("delivery_destinations").update({ label: "tampered" }).eq("id", OWN)).error).not.toBeNull();
      expect((await otherMember.from("delivery_destinations").update({ label: "tampered" }).eq("id", OWN)).error).not.toBeNull();
      expect((await owner.from("delivery_destinations").delete().eq("id", OWN)).error).not.toBeNull();
      const { data } = await platformAdmin.from("delivery_destinations").select("id, label").in("id", [OWN, OTHER]);
      expect(data!.every((row) => row.label === "F013 T031 PROOF FIXTURE")).toBe(true);
      expect(data).toHaveLength(2);
    });
  });

  describe("orders destination fields and LEGACY behaviour", () => {
    it("a buyer cannot attach a destination (its own or another organization's) to its own DRAFT order", async () => {
      const own = await owner.from("orders").update({ delivery_destination_id: OWN, destination_snapshot: SNAPSHOT }).eq("id", MEMBER_ORDER);
      expect(own.error?.message).toContain("order_field_not_client_writable");
      const foreign = await owner.from("orders").update({ delivery_destination_id: OTHER, destination_snapshot: SNAPSHOT }).eq("id", MEMBER_ORDER);
      expect(foreign.error?.message).toContain("order_field_not_client_writable");
    });

    it("the buyer's legacy DRAFT → CONFIRMED path is unchanged and the order carries no destination", async () => {
      const { data, error } = await owner.from("orders").update({ status: "CONFIRMED" }).eq("id", MEMBER_ORDER)
        .select("status, commerce_flow, delivery_destination_id, destination_snapshot");
      expect(error).toBeNull();
      expect(data).toEqual([{ status: "CONFIRMED", commerce_flow: "LEGACY", delivery_destination_id: null, destination_snapshot: null }]);
    });

    it("the buyer still reads its orders; none carries a destination", async () => {
      const { data, error } = await owner.from("orders").select("id, delivery_destination_id, destination_snapshot").eq("buyer_organization_id", OWNER_ORG);
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((row) => row.delivery_destination_id === null && row.destination_snapshot === null)).toBe(true);
    });
  });
});

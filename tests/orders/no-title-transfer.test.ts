import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, ageCheckoutHold, inspectCheckoutOrder, resetCheckoutFixtures, signInAsFixture, type CheckoutInspection } from "@/tests/auth/fixture-session";

import { loadFunctionDefinitions } from "./db-baseline";
import { buildReadyOrder } from "./live-helpers";

/**
 * Feature 007 RUN D — T023 (SC-008 / MKT-04 / AC-03): settlement before title. Feature 007's checkout
 * reserves; it never transfers ownership or custody. Every lifecycle step below is compared against
 * the `inventory_ownership_events` ledger (globally AND scoped to the dedicated checkout lot) and the
 * seller's inventory position (owner + available quantity), read through the approved test-only
 * privileged fixture read. ANY new event is a release-blocking failure and is asserted as such — never
 * normalized away. Title transfer belongs to Feature 008's settlement.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

async function runCheckout(client: SupabaseClient, orderId: string) {
  return withLiveClient(client, async () => {
    const { executeCheckout } = await import("@/lib/orders/checkout");
    return executeCheckout(orderId);
  });
}

const UUID_PATTERN = /^[0-9a-f-]{36}$/;

function expectNoTitleMovement(label: string, baseline: CheckoutInspection, current: CheckoutInspection): void {
  expect(current.ownershipEventCount, `${label}: global ownership events`).toBe(baseline.ownershipEventCount);
  expect(current.lotOwnershipEventCount, `${label}: ownership events on the checkout lot`).toBe(baseline.lotOwnershipEventCount);
  expect(current.position.owner_organization_id, `${label}: seller position owner`).toBe(baseline.position.owner_organization_id);
  expect(Number(current.position.available_quantity_kg), `${label}: seller position quantity`).toBe(Number(baseline.position.available_quantity_kg));
  expect(Number(current.offer.filled_quantity_kg), `${label}: nothing filled/settled`).toBe(0);
}

beforeEach(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("T023 — checkout, retry, refusal and expiry produce ZERO ownership/title events (live, release-blocking)", () => {
  it(
    "ledger and seller position are unchanged across a successful checkout, its idempotent retry, a refused checkout and a hold expiry — and the buyer can see no ownership event on the lot",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const winner = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 30);
      const loser = await buildReadyOrder(withLiveClient, orgA, INVENTORY_FIXTURES.orgA.organizationId, 30);

      const before = inspectCheckoutOrder(winner);
      expect(before.position.owner_organization_id).toMatch(UUID_PATTERN);
      expect(before.position.owner_organization_id).not.toBe(INVENTORY_FIXTURES.orgB.organizationId);
      expect(before.position.owner_organization_id).not.toBe(INVENTORY_FIXTURES.orgA.organizationId);

      // 1. Genuine successful checkout.
      const checkout = await runCheckout(orgB, winner);
      if (!checkout.ok) throw new Error(`checkout failed: ${checkout.code}`);
      const afterCheckout = inspectCheckoutOrder(winner);
      expect(afterCheckout.order?.status).toBe("HOLD");
      expectNoTitleMovement("after checkout", before, afterCheckout);

      // 2. Idempotent retry.
      const retry = await runCheckout(orgB, winner);
      if (!retry.ok) throw new Error(`retry failed: ${retry.code}`);
      expect(retry.data.idempotentRetry).toBe(true);
      expectNoTitleMovement("after idempotent retry", before, inspectCheckoutOrder(winner));

      // 3. A checkout the database refuses (only 20 kg left).
      const refused = await runCheckout(orgA, loser);
      expect(refused.ok).toBe(false);
      expectNoTitleMovement("after refused checkout", before, inspectCheckoutOrder(loser));

      // 4. Hold expiry through the sole application expiry path.
      ageCheckoutHold(winner);
      const expired = await withLiveClient(orgB, async () => {
        const { ensureHoldFresh } = await import("@/lib/orders/expiry");
        return ensureHoldFresh(winner, { now: new Date(Date.now() + 30 * 60_000) }); // test-only seam (DB-OPEN-15)
      });
      if (!expired.ok) throw new Error(`expiry failed: ${expired.code}`);
      expect(expired.data.order.status).toBe("EXPIRED");
      const afterExpiry = inspectCheckoutOrder(winner);
      expectNoTitleMovement("after expiry", before, afterExpiry);

      // 5. The buyer's own member view (RLS: events where the buyer is from/to) shows nothing on this lot.
      const { data: buyerVisibleEvents, error } = await orgB.from("inventory_ownership_events").select("id").eq("lot_id", CHECKOUT_FIXTURES.lotD);
      expect(error).toBeNull();
      expect(buyerVisibleEvents).toEqual([]);
    },
    240_000
  );
});

describe("T023 — no code path in Feature 007 (application or its two database functions) can write title", () => {
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("no file under lib/orders, src/app/dashboard/orders or components/orders references the ownership ledger, an owner change, or a transfer function (untracked files included)", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "lib/orders", "src/app/dashboard/orders", "components/orders"], { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/inventory_ownership_events|owner_organization_id|transfer_ownership|record_ownership|settle_order|release_funds/i);
    }
  });

  it("the current (baseline + Feature 007 migration) bodies of checkout_order(), expire_order_hold() and the draft item RPCs never touch the ownership ledger or a position's owner", async () => {
    const definitions = loadFunctionDefinitions();
    for (const name of ["checkout_order", "expire_order_hold", "assert_order_checkout_ready", "update_order_item_quantity", "remove_order_item"]) {
      const body = definitions.get(name)!;
      expect(body, name).not.toMatch(/inventory_ownership_events/);
      expect(body, name).not.toMatch(/set\s+owner_organization_id/i);
    }
  });
});

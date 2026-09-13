import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, ageCheckoutHold, inspectCheckoutOrder, resetCheckoutFixtures, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { buildHoldOrder, buildRequestedOrder } from "./live-helpers";

/**
 * Feature 007 RUN C (T012/T013) — LIVE proofs of `lib/orders/expiry.ts` against the real database
 * and the real `expire_order_hold()` function.
 *
 * FORCED EXPIRY, HONESTLY: a 20-minute hold cannot be waited out in a test. `ageCheckoutHold()`
 * (test-only, service-role setup — the approved fixture convention) backdates ONLY the ACTIVE
 * reservation's `expires_at`, the one column `expire_order_hold()` consults; `orders.hold_expires_at`
 * cannot be backdated at all (DB-OPEN-15), so `ensureHoldFresh`'s reference instant is passed
 * explicitly here (its documented test-only seam; production callers use the server clock). The
 * release itself still happens ONLY inside the database function.
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

function countExpiryRpcCalls(client: SupabaseClient) {
  const spy = vi.spyOn(client, "rpc");
  return () => spy.mock.calls.filter(([fn]) => fn === "expire_order_hold").length;
}

async function readOrder(client: SupabaseClient, orderId: string) {
  return withLiveClient(client, async () => {
    const { getOrderById } = await import("@/lib/orders/read");
    return getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId });
  });
}

beforeAll(() => {
  resetCheckoutFixtures();
}, 60_000);

describe("T012 — ensureHoldFresh mutates nothing when there is nothing stale (live)", () => {
  it("a DRAFT (non-HOLD) order: no RPC call, truthful state returned", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const { orderId } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 1);
    const rpcCalls = countExpiryRpcCalls(client);

    const result = await withLiveClient(client, async () => {
      const { ensureHoldFresh } = await import("@/lib/orders/expiry");
      return ensureHoldFresh(orderId);
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.order.status).toBe("DRAFT");
      expect(result.data.fresh).toBe(false);
      expect(result.data.expiredNow).toBe(false);
    }
    expect(rpcCalls()).toBe(0);
  });

  it("an UNEXPIRED HOLD: no RPC call, fresh=true, status stays HOLD, reservation untouched", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await buildHoldOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 3);
    const before = inspectCheckoutOrder(orderId);
    const rpcCalls = countExpiryRpcCalls(client);

    const result = await withLiveClient(client, async () => {
      const { ensureHoldFresh } = await import("@/lib/orders/expiry");
      return ensureHoldFresh(orderId);
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.order.status).toBe("HOLD");
      expect(result.data.fresh).toBe(true);
      expect(result.data.expiredNow).toBe(false);
    }
    expect(rpcCalls()).toBe(0);

    const after = inspectCheckoutOrder(orderId);
    expect(after.reservations[0]!.status).toBe("ACTIVE");
    expect(Number(after.offer.reserved_quantity_kg)).toBe(Number(before.offer.reserved_quantity_kg));
  });

  it("a cross-org caller cannot trigger another organization's expiry: ORDER_NOT_FOUND before the RPC", async () => {
    const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await buildHoldOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 2);
    ageCheckoutHold(orderId);

    const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const rpcCalls = countExpiryRpcCalls(orgA);
    const result = await withLiveClient(orgA, async () => {
      const { ensureHoldFresh } = await import("@/lib/orders/expiry");
      return ensureHoldFresh(orderId, { now: new Date(Date.now() + 30 * 60_000) });
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.ORDER_NOT_FOUND);
    expect(rpcCalls()).toBe(0);

    const snapshot = inspectCheckoutOrder(orderId);
    expect(snapshot.reservations[0]!.status).toBe("ACTIVE"); // still held — nobody else could release it
  });
});

describe("T012/T013 — a genuinely stale HOLD is expired exactly once through the authoritative function (live)", () => {
  let client: SupabaseClient;
  let orderId: string;
  let reservedBefore: number;
  let positionReservedBefore: number;
  let ownershipEventsBefore: number;

  beforeAll(async () => {
    client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    orderId = await buildHoldOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 4);
    const snapshot = inspectCheckoutOrder(orderId);
    reservedBefore = Number(snapshot.offer.reserved_quantity_kg);
    positionReservedBefore = Number(snapshot.position.reserved_quantity_kg);
    ownershipEventsBefore = snapshot.ownershipEventCount;
    ageCheckoutHold(orderId);
  }, 90_000);

  it("first ensureHoldFresh on the stale hold: ONE expire_order_hold call, order -> EXPIRED, reserved quantity decreases by exactly the held 4 kg on BOTH mirrors, payment EXPIRED, no ownership event", async () => {
    const rpcCalls = countExpiryRpcCalls(client);
    const result = await withLiveClient(client, async () => {
      const { ensureHoldFresh } = await import("@/lib/orders/expiry");
      return ensureHoldFresh(orderId, { now: new Date(Date.now() + 30 * 60_000) });
    });
    expect(rpcCalls()).toBe(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.order.status).toBe("EXPIRED");
      expect(result.data.expiredNow).toBe(true);
      expect(result.data.fresh).toBe(false);
    }

    const snapshot = inspectCheckoutOrder(orderId);
    expect(snapshot.reservations).toHaveLength(1);
    expect(snapshot.reservations[0]!.status).toBe("EXPIRED");
    expect(Number(snapshot.offer.reserved_quantity_kg)).toBe(reservedBefore - 4);
    expect(Number(snapshot.position.reserved_quantity_kg)).toBe(positionReservedBefore - 4);
    expect(Number(snapshot.offer.reserved_quantity_kg)).toBeGreaterThanOrEqual(0);
    expect(snapshot.payments).toHaveLength(1);
    expect(snapshot.payments[0]!.status).toBe("EXPIRED");
    expect(snapshot.proformas).toHaveLength(1);
    expect(snapshot.ownershipEventCount).toBe(ownershipEventsBefore);

    const history = await withLiveClient(client, async () => {
      const { getOrderStatusHistory } = await import("@/lib/orders/read");
      return getOrderStatusHistory({ orderId });
    });
    expect(history.map((entry) => `${entry.oldStatus}->${entry.newStatus}`)).toEqual(["DRAFT->CONFIRMED", "CONFIRMED->HOLD", "HOLD->EXPIRED"]);
  });

  it("second ensureHoldFresh: the order is EXPIRED (not hold-bearing) — no RPC, no second release, mirrors unchanged, still one payment/proforma", async () => {
    const before = inspectCheckoutOrder(orderId);
    const rpcCalls = countExpiryRpcCalls(client);
    const result = await withLiveClient(client, async () => {
      const { ensureHoldFresh } = await import("@/lib/orders/expiry");
      return ensureHoldFresh(orderId, { now: new Date(Date.now() + 30 * 60_000) });
    });
    expect(rpcCalls()).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.order.status).toBe("EXPIRED");

    const after = inspectCheckoutOrder(orderId);
    expect(Number(after.offer.reserved_quantity_kg)).toBe(Number(before.offer.reserved_quantity_kg));
    expect(Number(after.position.reserved_quantity_kg)).toBe(Number(before.position.reserved_quantity_kg));
    expect(after.payments).toHaveLength(1);
    expect(after.proformas).toHaveLength(1);
  });

  it("the database function itself is idempotent: a direct second expire_order_hold call (test-only, via the same authenticated session) releases nothing further", async () => {
    const before = inspectCheckoutOrder(orderId);
    const { error } = await client.rpc("expire_order_hold", { p_order_id: orderId });
    expect(error).toBeNull();
    const after = inspectCheckoutOrder(orderId);
    expect(Number(after.offer.reserved_quantity_kg)).toBe(Number(before.offer.reserved_quantity_kg));
    expect(Number(after.position.reserved_quantity_kg)).toBe(Number(before.position.reserved_quantity_kg));
    expect(after.reservations[0]!.status).toBe("EXPIRED");
  });

  it("T013 — the pre-payment boundary refuses the expired order with ORDER_HOLD_EXPIRED", async () => {
    const result = await withLiveClient(client, async () => {
      const { requireFreshHold } = await import("@/lib/orders/expiry");
      return requireFreshHold(orderId);
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.ORDER_HOLD_EXPIRED);
  });

  it("T013 — the pre-payment boundary ACCEPTS a genuinely fresh HOLD (and refuses a DRAFT)", async () => {
    const freshHold = await buildHoldOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 1);
    const accepted = await withLiveClient(client, async () => {
      const { requireFreshHold } = await import("@/lib/orders/expiry");
      return requireFreshHold(freshHold);
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.data.status).toBe("HOLD");

    const { orderId: draft } = await buildRequestedOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 1);
    const refused = await withLiveClient(client, async () => {
      const { requireFreshHold } = await import("@/lib/orders/expiry");
      return requireFreshHold(draft);
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe(ACTION_FEEDBACK.ORDER_HOLD_EXPIRED);
  });

  it("the released quantity is genuinely available again: a new order for it checks out successfully", async () => {
    // Listing is 50 kg; held so far: 3 (unexpired) + 2 (cross-org test, still held) + 1 (fresh hold) = 6, and 4 released.
    const orderId = await buildHoldOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, 4);
    expect((await readOrder(client, orderId))?.status).toBe("HOLD");
    const snapshot = inspectCheckoutOrder(orderId);
    expect(Number(snapshot.offer.reserved_quantity_kg)).toBe(10);
    expect(snapshot.reservationItems).toEqual([{ quantity_kg: 4, offer_id: CHECKOUT_FIXTURES.offerCheckout }]);
  });
});

describe("T012/T014 — sole-caller, no-reservation-read and no-scheduler source audits", () => {
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("expire_order_hold appears in CODE in exactly one application file: lib/orders/expiry.ts (repo-wide, untracked included)", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    const output = execFileSync("git", ["grep", "-l", "--untracked", "expire_order_hold", "--", "lib", "src", "components"], { encoding: "utf8" });
    const codeReferences = output
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => /expire_order_hold/.test(stripComments(readFileSync(file, "utf8"))));
    expect(codeReferences).toEqual(["lib/orders/expiry.ts"]);
  });

  it("expiry.ts issues exactly one rpc call site, never reads reservation tables, never writes a reserved quantity/status/history, never calls checkout_order", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/expiry.ts", "utf8"));
    expect(source.match(/\.rpc\(/g)?.length).toBe(1);
    expect(source).toMatch(/\.rpc\(\s*"expire_order_hold"/);
    expect(source).not.toMatch(/checkout_order|inventory_reservations|inventory_reservation_items|reserved_quantity_kg|order_status_history|inventory_ownership_events|\.update\(|\.insert\(|\.delete\(/);
    expect(source).not.toMatch(/SERVICE_ROLE|unstable_cache|"use cache"|cacheTag|cacheLife|updateTag/);
  });

  it("T014 — no scheduler/cron/queue/worker exists anywhere in the application or its config, and the lazy-expiry limitation is documented in code, handoff and spec", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    let hits = "";
    try {
      hits = execFileSync("git", ["grep", "-l", "--untracked", "-i", "-E", "pg_cron|cron\\.schedule|node-cron|setInterval\\(.*expire|bullmq|upstash|@vercel/cron", "--", "lib", "src", "components", "supabase", "package.json", "vercel.json", "next.config.ts"], { encoding: "utf8" });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 1) throw error;
    }
    // Comments may NAME a scheduler to say it is NOT approved (this feature's own expiry.ts header,
    // the SQL baseline's own "could use pg_cron" note) — only a reference surviving comment
    // stripping would be a real scheduler.
    const codeHits = hits
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => {
        const raw = readFileSync(file, "utf8");
        const withoutComments = file.endsWith(".sql") ? raw.replace(/--.*$/gm, "") : stripComments(raw);
        return /pg_cron|cron\.schedule|node-cron|bullmq|upstash|@vercel\/cron/i.test(withoutComments);
      });
    expect(codeHits).toEqual([]);

    expect(readFileSync("lib/orders/expiry.ts", "utf8")).toMatch(/LAZY EXPIRY/);
    expect(readFileSync("specs/007-orders-checkout-reservations/IMPLEMENTATION-HANDOFF.md", "utf8")).toMatch(/lazy expiry/i);
    expect(readFileSync("specs/007-orders-checkout-reservations/spec.md", "utf8")).toMatch(/lazy expiry/i);
  });

  it("no production file passes a reference instant into ensureHoldFresh/requireFreshHold (the `now` seam is test-only)", async () => {
    const { execFileSync } = await import("node:child_process");
    const output = execFileSync("git", ["grep", "-n", "--untracked", "-E", "(ensureHoldFresh|requireFreshHold)\\(", "--", "lib", "src", "components"], { encoding: "utf8" });
    const callSites = output.split(/\r?\n/).filter((line) => line && !/lib\/orders\/expiry\.ts/.test(line) && !/^\S+:\s*\*/.test(line));
    expect(callSites.length).toBeGreaterThan(0);
    for (const line of callSites) expect(line).not.toMatch(/now\s*:/);
  });
});

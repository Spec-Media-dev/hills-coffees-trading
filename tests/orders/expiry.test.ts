import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, ageCheckoutHold, inspectCheckoutOrder, resetCheckoutFixtures, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

import { buildHoldOrder, buildRequestedOrder, installRpcBarrier, liveClientScope } from "./live-helpers";

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
    // RUN D (T021): a flow running inside `liveClientScope().run(client, …)` uses its own session.
    const scoped = (globalThis as { __ordersLiveClientScope?: { getStore(): SupabaseClient | undefined } }).__ordersLiveClientScope?.getStore();
    const client = scoped ?? serverClientState.client;
    if (!client) throw new Error("test has no live client installed");
    return client;
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

/**
 * Feature 007 RUN D — T021 (FR-009 / SC-004 / PS4): expiry releases EXACTLY ONCE even when TWO
 * expiry attempts hit the SAME genuinely expired hold at the same time.
 *
 * FORCED EXPIRY (unchanged, DB-OPEN-15 honest): the approved test-only `ageCheckoutHold()` backdates
 * only the reservation's `expires_at`; `orders.hold_expires_at` stays untouched, so the application
 * path passes `ensureHoldFresh`'s documented test-only `now` seam (production callers never do —
 * audited above). The release itself happens ONLY inside `expire_order_hold()`.
 *
 * GENUINE CONCURRENCY: both attempts start in the same synchronous turn and an explicit RPC BARRIER
 * holds each `expire_order_hold` call until BOTH have arrived, then releases them together; the test
 * asserts both requests were in flight before either response arrived. The database serializes them
 * on the reservation row (`SELECT … WHERE status = 'ACTIVE' AND expires_at <= now() FOR UPDATE`): the
 * second transaction re-evaluates after the first commits, finds no ACTIVE row, and returns.
 *
 * WHY A COMPANION HOLD: `expire_order_hold()` clamps releases with `greatest(reserved - qty, 0)`. If the
 * expired hold were the only reservation on the listing, a double release would be silently clamped
 * to 0 and look correct. Each test therefore keeps an UNEXPIRED companion hold on the same listing,
 * so a second release would visibly drop the mirrors below the companion's quantity.
 *
 * Assertions are RELATIVE to the snapshot taken just before the race, so this block is independent of
 * the RUN C tests above; its `afterAll` expires its own companion through the same database function
 * so the listing is left as the RUN C tests found it.
 */
describe("T021 — two CONCURRENT expiry attempts against the same expired hold release exactly once (live, release-blocking)", () => {
  const COMPANION_KG = 12;
  let client: SupabaseClient;
  let companionOrderId: string;

  beforeAll(async () => {
    client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    companionOrderId = await buildHoldOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, COMPANION_KG);
  }, 120_000);

  afterAll(async () => {
    ageCheckoutHold(companionOrderId);
    await client.rpc("expire_order_hold", { p_order_id: companionOrderId });
  }, 60_000);

  function expectExactlyOnceRelease(target: string, before: ReturnType<typeof inspectCheckoutOrder>, heldKg: number) {
    const after = inspectCheckoutOrder(target);
    // Released exactly once on BOTH mirrors — a double release would subtract 2 × heldKg.
    expect(Number(after.offer.reserved_quantity_kg)).toBe(Number(before.offer.reserved_quantity_kg) - heldKg);
    expect(Number(after.position.reserved_quantity_kg)).toBe(Number(before.position.reserved_quantity_kg) - heldKg);
    expect(Number(after.offer.reserved_quantity_kg)).toBe(Number(after.position.reserved_quantity_kg));
    // The unexpired companion is still fully reserved — the clamp cannot be hiding a second release.
    expect(Number(after.offer.reserved_quantity_kg)).toBeGreaterThanOrEqual(COMPANION_KG);
    expect(Number(after.offer.reserved_quantity_kg)).toBeGreaterThanOrEqual(0);
    // The order reaches exactly the state the database defines, once.
    expect(after.order?.status).toBe("EXPIRED");
    expect(after.reservations).toHaveLength(1);
    expect(after.reservations[0]!.status).toBe("EXPIRED");
    expect(after.statusHistory.map((row) => `${row.old_status}->${row.new_status}`)).toEqual(["DRAFT->CONFIRMED", "CONFIRMED->HOLD", "HOLD->EXPIRED"]);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]!.status).toBe("EXPIRED");
    expect(after.proformas).toHaveLength(1);
    expect(after.financials).toHaveLength(1);
    expect(after.ownershipEventCount).toBe(before.ownershipEventCount);
    expect(after.lotOwnershipEventCount).toBe(before.lotOwnershipEventCount);

    const companion = inspectCheckoutOrder(companionOrderId);
    expect(companion.reservations[0]!.status).toBe("ACTIVE");
    expect(companion.order?.status).toBe("HOLD");
    return after;
  }

  it(
    "APPLICATION PATH — two concurrent ensureHoldFresh calls both reach expire_order_hold() together; the held 6 kg is released once, both callers see EXPIRED",
    async () => {
      const heldKg = 6;
      const target = await buildHoldOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, heldKg);
      ageCheckoutHold(target);
      const before = inspectCheckoutOrder(target);
      expect(before.reservations[0]!.status).toBe("ACTIVE");
      expect(before.reservationItems).toEqual([{ quantity_kg: heldKg, offer_id: CHECKOUT_FIXTURES.offerCheckout }]);
      expect(Number(before.offer.reserved_quantity_kg)).toBeGreaterThanOrEqual(COMPANION_KG + heldKg);

      serverClientState.client = null;
      vi.resetModules();
      const { ensureHoldFresh } = await import("@/lib/orders/expiry");
      const scope = liveClientScope();
      const secondSession = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const barrier = installRpcBarrier([client, secondSession], "expire_order_hold", 2);
      const referenceInstant = new Date(Date.now() + 30 * 60_000); // test-only seam (DB-OPEN-15)
      let settled;
      try {
        settled = await Promise.allSettled([scope.run(client, () => ensureHoldFresh(target, { now: referenceInstant })), scope.run(secondSession, () => ensureHoldFresh(target, { now: referenceInstant }))]);
      } finally {
        barrier.restore();
      }

      expect(barrier.parties).toHaveLength(2);
      expect(barrier.allInFlightTogether()).toBe(true);
      for (const outcome of settled) {
        expect(outcome.status).toBe("fulfilled");
        if (outcome.status !== "fulfilled") continue;
        expect(outcome.value.ok).toBe(true);
        if (outcome.value.ok) {
          expect(outcome.value.data.order.status).toBe("EXPIRED");
          expect(outcome.value.data.fresh).toBe(false);
        }
      }

      expectExactlyOnceRelease(target, before, heldKg);
    },
    150_000
  );

  it(
    "DATABASE LAYER — two concurrent direct expire_order_hold() calls from two independent sessions (test-only) release the held 5 kg exactly once",
    async () => {
      const heldKg = 5;
      const target = await buildHoldOrder(withLiveClient, client, INVENTORY_FIXTURES.orgB.organizationId, heldKg);
      ageCheckoutHold(target);
      const before = inspectCheckoutOrder(target);
      expect(before.reservations[0]!.status).toBe("ACTIVE");

      const sessionOne = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const sessionTwo = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const barrier = installRpcBarrier([sessionOne, sessionTwo], "expire_order_hold", 2);
      let responses;
      try {
        responses = await Promise.all([sessionOne.rpc("expire_order_hold", { p_order_id: target }), sessionTwo.rpc("expire_order_hold", { p_order_id: target })]);
      } finally {
        barrier.restore();
      }

      expect(barrier.parties).toHaveLength(2);
      expect(barrier.allInFlightTogether()).toBe(true);
      for (const response of responses) expect(response.error).toBeNull();

      expectExactlyOnceRelease(target, before, heldKg);
    },
    150_000
  );
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
    // stripping would be a real scheduler. SQL string literals are masked too: a read-only
    // catalog probe such as `where extname in ('pg_cron', …)` (Feature 013 preflight) names the
    // extension as data; it schedules nothing.
    const codeHits = hits
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => {
        const raw = readFileSync(file, "utf8");
        const withoutComments = file.endsWith(".sql") ? raw.replace(/--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''") : stripComments(raw);
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

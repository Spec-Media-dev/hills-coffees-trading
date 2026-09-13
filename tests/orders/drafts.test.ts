import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, PHASE89_FIXTURES, setSuspendedOrganizationStatus, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN A (T004/T006) — live proofs against `src/app/dashboard/orders/actions.ts` and
 * `lib/orders/drafts.ts`. Mirrors Feature 006's own `create-action.test.ts` pattern exactly:
 * `@/lib/supabase/server` is mocked to return a REAL, signed-in fixture session (never a fake
 * client) so every exported Server Action runs its genuine authorization/write path against the
 * real test database, with no HTTP layer involved.
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

async function createTestOrder(client: SupabaseClient, organizationId: string): Promise<string> {
  return withLiveClient(client, async () => {
    const { createDraftOrder } = await import("@/lib/orders/drafts");
    const userId = (await client.auth.getUser()).data.user!.id;
    const result = await createDraftOrder({ organizationId, userId });
    if (!result.ok) throw new Error(`test setup failed: ${result.code}`);
    return result.data.id;
  });
}

describe("T004 — createOrder Server Action (live)", () => {
  it("a buy-capable fixture creates a genuine DRAFT order (createDraftOrder, direct)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await createTestOrder(client, INVENTORY_FIXTURES.orgB.organizationId);
    expect(orderId).toBeTruthy();

    const readBack = await withLiveClient(client, async () => {
      const { getOrderById } = await import("@/lib/orders/read");
      return getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId });
    });
    expect(readBack?.status).toBe("DRAFT");
    expect(readBack?.createdBy).toBe((await client.auth.getUser()).data.user!.id);
  });

  it("an organization that cannot buy (SUSPENDED) is refused BUYER_NOT_CAPABLE by the Server Action, before any DB write is attempted", async () => {
    setSuspendedOrganizationStatus("SUSPENDED");
    try {
      const client = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
      const result = await withLiveClient(client, async () => {
        const { createOrder } = await import("@/src/app/dashboard/orders/actions");
        return createOrder();
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.BUYER_NOT_CAPABLE);
    } finally {
      setSuspendedOrganizationStatus("ACTIVE");
    }
  });
});

describe("T004/PS1 — addItemToOrder Server Action (live)", () => {
  it("a valid PUBLISHED listing (owned by a different org) is accepted, with no reservation or title-transfer side effect", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await createTestOrder(client, INVENTORY_FIXTURES.orgB.organizationId);

    const before = await withLiveClient(client, async () => {
      const { data } = await client.from("coffee_offers").select("reserved_quantity_kg").eq("id", LISTING_FIXTURES.offerPublished).single();
      return data!;
    });
    const eventsBefore = await withLiveClient(client, async () => {
      const { count } = await client.from("inventory_ownership_events").select("id", { count: "exact", head: true });
      return count ?? 0;
    });

    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("offerId", LISTING_FIXTURES.offerPublished);
    formData.set("quantityKg", "1");

    const result = await withLiveClient(client, async () => {
      const { addItemToOrder } = await import("@/src/app/dashboard/orders/actions");
      return addItemToOrder(undefined, formData);
    });
    expect(result.ok).toBe(true);

    const items = await withLiveClient(client, async () => {
      const { getOrderItems } = await import("@/lib/orders/read");
      return getOrderItems({ orderId });
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.offerId).toBe(LISTING_FIXTURES.offerPublished);
    expect(items[0]!.quantityKg).toBe(1);
    // Derived server/trigger-side (SECURITY DEFINER bypasses DB-OPEN-05 for this internal join) —
    // never client-supplied, confirmed non-null despite the member-read policy being broken.
    expect(items[0]!.productNameSnapshot).toBeTruthy();
    expect(items[0]!.lotCodeSnapshot).toBeTruthy();
    expect(items[0]!.unitPricePerKg).toBeGreaterThan(0);

    const after = await withLiveClient(client, async () => {
      const { data } = await client.from("coffee_offers").select("reserved_quantity_kg").eq("id", LISTING_FIXTURES.offerPublished).single();
      return data!;
    });
    expect(Number(after.reserved_quantity_kg)).toBe(Number(before.reserved_quantity_kg));

    const eventsAfter = await withLiveClient(client, async () => {
      const { count } = await client.from("inventory_ownership_events").select("id", { count: "exact", head: true });
      return count ?? 0;
    });
    expect(eventsAfter).toBe(eventsBefore);
  });

  it("a non-available listing (SOLD_OUT) is refused with ORDER_ITEM_NOT_AVAILABLE — the trigger's own refusal, mapped safely", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await createTestOrder(client, INVENTORY_FIXTURES.orgB.organizationId);

    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("offerId", LISTING_FIXTURES.offerSoldOut);
    formData.set("quantityKg", "1");

    const result = await withLiveClient(client, async () => {
      const { addItemToOrder } = await import("@/src/app/dashboard/orders/actions");
      return addItemToOrder(undefined, formData);
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE);
  });

  it("a nonexistent/cross-org order id refuses identically with ORDER_NOT_FOUND (no existence leak)", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const realOrderId = await createTestOrder(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);

    const orgAClient = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);

    const crossOrgForm = new FormData();
    crossOrgForm.set("orderId", realOrderId);
    crossOrgForm.set("offerId", LISTING_FIXTURES.offerPublished);
    crossOrgForm.set("quantityKg", "1");
    const crossOrgResult = await withLiveClient(orgAClient, async () => {
      const { addItemToOrder } = await import("@/src/app/dashboard/orders/actions");
      return addItemToOrder(undefined, crossOrgForm);
    });

    const nonexistentForm = new FormData();
    nonexistentForm.set("orderId", "00000000-0000-4000-8000-000000000000");
    nonexistentForm.set("offerId", LISTING_FIXTURES.offerPublished);
    nonexistentForm.set("quantityKg", "1");
    const nonexistentResult = await withLiveClient(orgAClient, async () => {
      const { addItemToOrder } = await import("@/src/app/dashboard/orders/actions");
      return addItemToOrder(undefined, nonexistentForm);
    });

    expect(crossOrgResult.ok).toBe(false);
    expect(nonexistentResult.ok).toBe(false);
    if (!crossOrgResult.ok && !nonexistentResult.ok) {
      expect(crossOrgResult.code).toBe(ACTION_FEEDBACK.ORDER_NOT_FOUND);
      expect(nonexistentResult.code).toBe(crossOrgResult.code);
    }
  });

  it("forged extra fields (sellerOrganizationId/unitPricePerKg/status) never change the outcome — they are simply never read", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await createTestOrder(client, INVENTORY_FIXTURES.orgB.organizationId);

    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("offerId", LISTING_FIXTURES.offerPublished);
    formData.set("quantityKg", "1");
    formData.set("sellerOrganizationId", "forged-org-id");
    formData.set("unitPricePerKg", "0.01");
    formData.set("status", "PUBLISHED");

    const result = await withLiveClient(client, async () => {
      const { addItemToOrder } = await import("@/src/app/dashboard/orders/actions");
      return addItemToOrder(undefined, formData);
    });
    expect(result.ok).toBe(true);

    const items = await withLiveClient(client, async () => {
      const { getOrderItems } = await import("@/lib/orders/read");
      return getOrderItems({ orderId });
    });
    // Same seller/price as the genuine offer, never the forged values.
    expect(items[0]!.sellerOrganizationId).not.toBe("forged-org-id");
    expect(items[0]!.unitPricePerKg).not.toBe(0.01);
  });
});

describe("T006 — edit-only-while-DRAFT (live)", () => {
  it("adding an item to a CONFIRMED order is refused with ORDER_NOT_EDITABLE — exercises the identical `status <> 'DRAFT'` trigger predicate HOLD would (checkout_order()/Phase 4 is out of RUN A scope, so HOLD itself cannot be constructed this run; DRAFT -> CONFIRMED is an ordinary, RLS-permitted buyer transition used here as TEST SETUP only, never a Feature 007 RUN A application action)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const orderId = await createTestOrder(client, INVENTORY_FIXTURES.orgB.organizationId);

    const { error: confirmError } = await client.from("orders").update({ status: "CONFIRMED" }).eq("id", orderId);
    expect(confirmError).toBeNull();

    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("offerId", LISTING_FIXTURES.offerPublished);
    formData.set("quantityKg", "1");

    const result = await withLiveClient(client, async () => {
      const { addItemToOrder } = await import("@/src/app/dashboard/orders/actions");
      return addItemToOrder(undefined, formData);
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.ORDER_NOT_EDITABLE);

    const items = await withLiveClient(client, async () => {
      const { getOrderItems } = await import("@/lib/orders/read");
      return getOrderItems({ orderId });
    });
    expect(items).toHaveLength(0);
  });
});

/** A doc comment legitimately NAMING a forbidden pattern to explain its deliberate absence must
 * never trip a "must not contain X" check — same precedent as `tests/inventory/run-b-ui.test.tsx`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("DB-OPEN-13 (resolved by migration 20260913100000) — item edit/removal go ONLY through the database RPCs (source-level proof)", () => {
  it("drafts.ts exposes updateOrderItemQuantity/removeOrderItem that call update_order_item_quantity/remove_order_item with only the id (and quantity) — never a raw order_items UPDATE/DELETE", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/drafts.ts", "utf8"));
    expect(source).toMatch(/export async function createDraftOrder/);
    expect(source).toMatch(/export async function addOrderItem/);
    expect(source).toMatch(/export async function updateOrderItemQuantity/);
    expect(source).toMatch(/export async function removeOrderItem/);
    expect(source).toMatch(/\.rpc\("update_order_item_quantity", \{ p_order_item_id: orderItemId, p_quantity_kg: quantityKg \}\)/);
    expect(source).toMatch(/\.rpc\("remove_order_item", \{ p_order_item_id: orderItemId \}\)/);
    expect(source.match(/\.rpc\(/g)?.length).toBe(2);
    expect(source).not.toMatch(/from\(\s*["']order_items["']\s*\)\s*\.delete\(/);
    expect(source).not.toMatch(/from\(\s*["']order_items["']\s*\)\s*\.update\(/);
  });
});

describe("T004 — no reservation write / title transfer anywhere in the draft write path (source-level proof)", () => {
  it("drafts.ts never writes reserved_quantity_kg or inventory_reservations, and never inserts inventory_ownership_events", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/drafts.ts", "utf8"));
    expect(source).not.toMatch(/reserved_quantity_kg/);
    expect(source).not.toMatch(/inventory_reservations/);
    expect(source).not.toMatch(/inventory_ownership_events/);
  });

  it("drafts.ts never inserts a spread of client input (no formData/parsed.data spread near an insert)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/drafts.ts", "utf8"));
    expect(source).not.toMatch(/\.insert\(\s*(formData|parsed\.data)\s*\)/);
  });
});

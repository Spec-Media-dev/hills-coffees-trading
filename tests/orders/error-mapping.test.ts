import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_FIXTURES, INVENTORY_FIXTURES, LISTING_FIXTURES, PHASE89_FIXTURES, resetCheckoutFixtures, setSuspendedOrganizationStatus, signInAsFixture } from "@/tests/auth/fixture-session";
import { ACTION_FEEDBACK, type ActionFeedbackCode } from "@/lib/types/action-feedback";

import { buildReadyOrder, buildRequestedOrder, markShipmentReadyAsWarehouse } from "./live-helpers";

/**
 * Feature 007 RUN D — T025 (SEC-004 / SC-007): every database exception Feature 007's write paths can
 * receive maps to a stable, specific `ACTION_FEEDBACK` code, an unknown one falls back to a generic
 * safe code, and no raw database text reaches the client or the logs.
 *
 * Three layers of proof:
 *   1. COMPLETENESS against the database baseline: the RAISE EXCEPTION strings of every order-domain
 *      function/trigger (`validate_order_item_offer`, `validate_order_transition`, `checkout_order`,
 *      `assert_order_checkout_ready`, `expire_order_hold`, `validate_shipment_transition`,
 *      `validate_shipment_item`) are exactly the keys of `lib/orders/errors.ts`'s maps, plus the listing
 *      re-validation strings the checkout reserved-mirror update was proven (RUN D) to surface.
 *   2. LIVE errors: each exception a MEMBER session can actually provoke is provoked against the real
 *      database (test-only raw writes/RPCs under ordinary RLS — never service-role), and the REAL
 *      PostgREST error object is passed through the mapper. The remaining strings require platform,
 *      internal-transition or warehouse authority (or fixture states a member cannot produce) and are
 *      covered by the exact string-level mapping in `tests/orders/errors.test.ts` + layer 1.
 *   3. LEAKAGE + LOGGING audits: action results carry only a code; codes and EN/AR copy contain no raw
 *      database text; production code never forwards `error.message`; the only log line carries only
 *      the SQLSTATE.
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

type PostgrestLikeError = { message: string; code?: string; details?: string | null; hint?: string | null } | null;

const LIVE_TIMEOUT_MS = 150_000;
const NONEXISTENT_ID = "00000000-0000-4000-8000-00000000e025";

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function loadBaselineRaises(): { orderDomain: Set<string>; shipmentDomain: Set<string>; listingRevalidation: Set<string> } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const report = JSON.parse(JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"))[0].database_schema_report) as { functions: Array<{ function_name: string; definition: string }> };
  const raisesOf = (names: string[]) =>
    new Set(
      names.flatMap((name) => {
        const fn = report.functions.find((candidate) => candidate.function_name === name);
        if (!fn) throw new Error(`baseline is missing ${name}`);
        return [...fn.definition.matchAll(/raise\s+exception\s+'([^']+)'/gi)].map((match) => match[1]!);
      })
    );
  return {
    orderDomain: raisesOf(["validate_order_item_offer", "validate_order_transition", "checkout_order", "assert_order_checkout_ready", "expire_order_hold"]),
    shipmentDomain: raisesOf(["validate_shipment_transition", "validate_shipment_item"]),
    listingRevalidation: raisesOf(["validate_offer_transition"]),
  };
}

function mapKeys(mapName: "ORDER_ERROR_MAP" | "SHIPMENT_ERROR_MAP"): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const source = stripComments(readFileSync("lib/orders/errors.ts", "utf8"));
  const body = source.match(new RegExp(`const ${mapName}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`))![1]!;
  return [...body.matchAll(/^\s*([a-z_]+):\s*ACTION_FEEDBACK\.[A-Z_]+,/gm)].map((match) => match[1]!);
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
});

async function mappers() {
  vi.resetModules();
  return import("@/lib/orders/errors");
}

/** The real database error carries EXACTLY the raised string, and the mapper turns it into the expected code WITHOUT falling back (no unmapped log). */
async function expectLiveMapping(error: PostgrestLikeError, domain: "order" | "shipment", raised: string, expected: ActionFeedbackCode): Promise<void> {
  expect(error, `expected the database to raise ${raised}`).not.toBeNull();
  expect(error!.message).toBe(raised);
  const { mapOrderError, mapShipmentError } = await mappers();
  consoleErrorSpy.mockClear();
  const code = domain === "order" ? mapOrderError(error) : mapShipmentError(error);
  expect(code).toBe(expected);
  expect(consoleErrorSpy).not.toHaveBeenCalled();
  expect(code).not.toBe(raised === "order_not_found" ? "__never__" : raised);
}

/** A DRAFT order with one item and a DRAFT shipment, built through the production actions. */
async function draftWithShipment(client: SupabaseClient, organizationId: string, quantityKg: number) {
  return withLiveClient(client, async () => {
    const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
    const { createShipment } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
    const userId = (await client.auth.getUser()).data.user!.id;
    const order = await createDraftOrder({ organizationId, userId });
    if (!order.ok) throw new Error(`setup: ${order.code}`);
    const item = await addOrderItem({ organizationId, orderId: order.data.id, offerId: CHECKOUT_FIXTURES.offerCheckout, quantityKg });
    if (!item.ok) throw new Error(`setup: ${item.code}`);
    const form = new FormData();
    form.set("orderId", order.data.id);
    form.set("deliveryMethod", "Courier");
    form.set("countryCode", "AE");
    form.set("addressLine", "25 Error Mapping Street");
    form.set("contactName", "Mapping Tester");
    form.set("contactPhone", "+971500000025");
    const shipment = await createShipment(undefined, form);
    if (!shipment.ok) throw new Error(`setup: ${shipment.code}`);
    return { orderId: order.data.id, orderItemId: item.data.id, shipmentId: shipment.data.id };
  });
}

async function confirmAsBuyer(client: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await client.from("orders").update({ status: "CONFIRMED" }).eq("id", orderId);
  if (error) throw new Error(`setup confirm refused: ${error.message}`);
}

describe("T025 — completeness: the mapper covers exactly the database baseline's raised exceptions", () => {
  it("every order-domain RAISE string is an ORDER_ERROR_MAP key, and every key is a baseline RAISE string (order functions + the listing re-validation reachable from checkout)", () => {
    const { orderDomain, listingRevalidation } = loadBaselineRaises();
    const keys = mapKeys("ORDER_ERROR_MAP");
    for (const raised of orderDomain) expect(keys, `unmapped order-domain exception ${raised}`).toContain(raised);
    for (const key of keys) expect(orderDomain.has(key) || listingRevalidation.has(key), `map key ${key} is not raised by the baseline`).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(orderDomain.size).toBe(18);
  });

  it("every shipment-domain RAISE string is a SHIPMENT_ERROR_MAP key and vice versa", () => {
    const { shipmentDomain } = loadBaselineRaises();
    const keys = mapKeys("SHIPMENT_ERROR_MAP");
    expect([...keys].sort()).toEqual([...shipmentDomain].sort());
    expect(shipmentDomain.size).toBe(11);
  });

  it("every mapped string (all 34) resolves through the mapper to a stable ACTION_FEEDBACK code without the unmapped fallback log", async () => {
    const { mapOrderError, mapShipmentError } = await mappers();
    const codes = new Set<string>(Object.values(ACTION_FEEDBACK));
    const all = [...mapKeys("ORDER_ERROR_MAP").map((key) => ["order", key] as const), ...mapKeys("SHIPMENT_ERROR_MAP").map((key) => ["shipment", key] as const)];
    expect(all).toHaveLength(34); // 18 order-domain + 5 listing re-validation + 11 shipment-domain
    for (const [domain, raised] of all) {
      consoleErrorSpy.mockClear();
      const code = domain === "order" ? mapOrderError({ message: raised, code: "P0001" }) : mapShipmentError({ message: raised, code: "P0001" });
      expect(codes.has(code), raised).toBe(true);
      expect(consoleErrorSpy, raised).not.toHaveBeenCalled();
    }
  });
});

describe("T025 — LIVE order-domain database exceptions map to their specific safe codes", () => {
  beforeEach(() => {
    resetCheckoutFixtures();
  }, 60_000);

  it(
    "checkout_order / assert_order_checkout_ready: order_not_found, forbidden, order_must_be_confirmed_before_checkout, order_has_no_items, shipment_must_be_ready_before_checkout, shipment_quantities_do_not_match_order",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);

      const missing = await orgB.rpc("checkout_order", { p_order_id: NONEXISTENT_ID });
      await expectLiveMapping(missing.error, "order", "order_not_found", ACTION_FEEDBACK.ORDER_NOT_FOUND);

      const ready = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 2);
      const foreign = await orgA.rpc("checkout_order", { p_order_id: ready });
      await expectLiveMapping(foreign.error, "order", "forbidden", ACTION_FEEDBACK.ORDER_NOT_ACCESSIBLE);

      const notConfirmed = await orgB.rpc("checkout_order", { p_order_id: ready });
      await expectLiveMapping(notConfirmed.error, "order", "order_must_be_confirmed_before_checkout", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED);

      const empty = await withLiveClient(orgB, async () => {
        const { createDraftOrder } = await import("@/lib/orders/drafts");
        return createDraftOrder({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, userId: (await orgB.auth.getUser()).data.user!.id });
      });
      if (!empty.ok) throw new Error("setup");
      await confirmAsBuyer(orgB, empty.data.id);
      const noItems = await orgB.rpc("checkout_order", { p_order_id: empty.data.id });
      await expectLiveMapping(noItems.error, "order", "order_has_no_items", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED);

      const { orderId: requested } = await buildRequestedOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 2);
      await confirmAsBuyer(orgB, requested);
      const notReady = await orgB.rpc("checkout_order", { p_order_id: requested });
      await expectLiveMapping(notReady.error, "order", "shipment_must_be_ready_before_checkout", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED);

      const mismatch = await buildRequestedOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 2, 1);
      await markShipmentReadyAsWarehouse(mismatch.shipmentId);
      await confirmAsBuyer(orgB, mismatch.orderId);
      const quantities = await orgB.rpc("checkout_order", { p_order_id: mismatch.orderId });
      await expectLiveMapping(quantities.error, "order", "shipment_quantities_do_not_match_order", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED);
    },
    240_000
  );

  it(
    "availability at checkout: listing_inventory_changed (another checkout took the quantity) and cannot_publish_empty_listing (reserving the final kilograms, DB-OPEN-16)",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const taken = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 30);
      const tooLate = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 30);
      const finalKilograms = await buildReadyOrder(withLiveClient, orgB, INVENTORY_FIXTURES.orgB.organizationId, 20);

      const first = await withLiveClient(orgB, async () => {
        const { executeCheckout } = await import("@/lib/orders/checkout");
        return executeCheckout(taken);
      });
      if (!first.ok) throw new Error(`setup checkout failed: ${first.code}`);

      await confirmAsBuyer(orgB, tooLate);
      const changed = await orgB.rpc("checkout_order", { p_order_id: tooLate });
      await expectLiveMapping(changed.error, "order", "listing_inventory_changed", ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE);

      await confirmAsBuyer(orgB, finalKilograms);
      const empty = await orgB.rpc("checkout_order", { p_order_id: finalKilograms });
      await expectLiveMapping(empty.error, "order", "cannot_publish_empty_listing", ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE);
    },
    240_000
  );

  it(
    "validate_order_item_offer + validate_order_transition: requested_quantity_not_available, listing_is_not_available, order_items_can_only_change_in_draft, order_status_can_only_change_through_workflow — and the production action returns only the code",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const draft = await draftWithShipment(orgB, INVENTORY_FIXTURES.orgB.organizationId, 1);

      const tooMuch = await orgB.from("order_items").insert({ order_id: draft.orderId, offer_id: CHECKOUT_FIXTURES.offerCheckout, quantity_kg: 999 });
      await expectLiveMapping(tooMuch.error, "order", "requested_quantity_not_available", ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE);

      const soldOut = await orgB.from("order_items").insert({ order_id: draft.orderId, offer_id: LISTING_FIXTURES.offerSoldOut, quantity_kg: 1 });
      await expectLiveMapping(soldOut.error, "order", "listing_is_not_available", ACTION_FEEDBACK.ORDER_ITEM_NOT_AVAILABLE);

      const viaAction = await withLiveClient(orgB, async () => {
        const { addItemToOrder } = await import("@/src/app/dashboard/orders/actions");
        const form = new FormData();
        form.set("orderId", draft.orderId);
        form.set("offerId", CHECKOUT_FIXTURES.offerCheckout);
        form.set("quantityKg", "999");
        return addItemToOrder(undefined, form);
      });
      expect(viaAction).toEqual({ ok: false, code: ACTION_FEEDBACK.ORDER_ITEM_QUANTITY_UNAVAILABLE });

      const workflow = await orgB.from("orders").update({ status: "HOLD" }).eq("id", draft.orderId);
      await expectLiveMapping(workflow.error, "order", "order_status_can_only_change_through_workflow", ACTION_FEEDBACK.ORDER_TRANSITION_REFUSED);

      await confirmAsBuyer(orgB, draft.orderId);
      const notDraft = await orgB.from("order_items").insert({ order_id: draft.orderId, offer_id: CHECKOUT_FIXTURES.offerCheckout, quantity_kg: 1 });
      await expectLiveMapping(notDraft.error, "order", "order_items_can_only_change_in_draft", ACTION_FEEDBACK.ORDER_NOT_EDITABLE);
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "validate_order_item_offer: buyer_not_authorized for a SUSPENDED organization adding to its own draft",
    async () => {
      setSuspendedOrganizationStatus("ACTIVE");
      try {
        const member = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
        const draft = await draftWithShipment(member, PHASE89_FIXTURES.suspended.organizationId, 1);
        setSuspendedOrganizationStatus("SUSPENDED");
        const refused = await member.from("order_items").insert({ order_id: draft.orderId, offer_id: CHECKOUT_FIXTURES.offerCheckout, quantity_kg: 1 });
        await expectLiveMapping(refused.error, "order", "buyer_not_authorized", ACTION_FEEDBACK.BUYER_NOT_CAPABLE);
      } finally {
        setSuspendedOrganizationStatus("ACTIVE");
      }
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T025 — LIVE shipment-domain database exceptions map to their specific safe codes", () => {
  beforeEach(() => {
    resetCheckoutFixtures();
  }, 60_000);

  it(
    "validate_shipment_transition + validate_shipment_item: warehouse_required_for_operational_shipment_status, only_warehouse_can_record_delivery, shipment_or_order_item_missing, shipment_order_item_mismatch, shipment_plan_exceeds_order_item, shipment_plan_is_closed — and the production action returns only the code",
    async () => {
      const orgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const first = await draftWithShipment(orgB, INVENTORY_FIXTURES.orgB.organizationId, 2);
      const second = await draftWithShipment(orgB, INVENTORY_FIXTURES.orgB.organizationId, 1);

      const operational = await orgB.from("order_shipments").update({ status: "READY" }).eq("id", first.shipmentId);
      await expectLiveMapping(operational.error, "shipment", "warehouse_required_for_operational_shipment_status", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE);

      const delivered = await orgB.from("shipment_items").insert({ shipment_id: first.shipmentId, order_item_id: first.orderItemId, planned_quantity_kg: 1, delivered_quantity_kg: 1 });
      await expectLiveMapping(delivered.error, "shipment", "only_warehouse_can_record_delivery", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE);

      const missing = await orgB.from("shipment_items").insert({ shipment_id: first.shipmentId, order_item_id: NONEXISTENT_ID, planned_quantity_kg: 1 });
      await expectLiveMapping(missing.error, "shipment", "shipment_or_order_item_missing", ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED);

      const mismatch = await orgB.from("shipment_items").insert({ shipment_id: first.shipmentId, order_item_id: second.orderItemId, planned_quantity_kg: 1 });
      await expectLiveMapping(mismatch.error, "shipment", "shipment_order_item_mismatch", ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED);

      const exceeds = await orgB.from("shipment_items").insert({ shipment_id: first.shipmentId, order_item_id: first.orderItemId, planned_quantity_kg: 99 });
      await expectLiveMapping(exceeds.error, "shipment", "shipment_plan_exceeds_order_item", ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID);

      const viaAction = await withLiveClient(orgB, async () => {
        const { addShipmentItem } = await import("@/src/app/dashboard/orders/[orderId]/shipment/actions");
        const form = new FormData();
        form.set("orderId", first.orderId);
        form.set("shipmentId", first.shipmentId);
        form.set("orderItemId", first.orderItemId);
        form.set("plannedQuantityKg", "99");
        return addShipmentItem(undefined, form);
      });
      expect(viaAction).toEqual({ ok: false, code: ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID });

      // Close the plan legitimately (plan the full item, DRAFT -> REQUESTED), then try to add to it.
      const { error: planError } = await orgB.from("shipment_items").insert({ shipment_id: first.shipmentId, order_item_id: first.orderItemId, planned_quantity_kg: 2 });
      expect(planError).toBeNull();
      const { error: requestError } = await orgB.from("order_shipments").update({ status: "REQUESTED" }).eq("id", first.shipmentId);
      expect(requestError).toBeNull();
      const closed = await orgB.from("shipment_items").insert({ shipment_id: first.shipmentId, order_item_id: first.orderItemId, planned_quantity_kg: 1 });
      await expectLiveMapping(closed.error, "shipment", "shipment_plan_is_closed", ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE);
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T025 — unknown database errors fall back safely and are logged with the SQLSTATE only (live)", () => {
  it(
    "a real RLS violation (a foreign organization's order insert) is not in the map: generic ORDER_SAVE_FAILED, and the single log line carries only { sqlstate }",
    async () => {
      const orgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const userId = (await orgA.auth.getUser()).data.user!.id;
      const { error } = await orgA.from("orders").insert({ buyer_organization_id: INVENTORY_FIXTURES.orgB.organizationId, created_by: userId });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/row-level security/i); // the raw text exists at the database layer…

      const { mapOrderError, mapShipmentError } = await mappers();
      consoleErrorSpy.mockClear();
      expect(mapOrderError(error)).toBe(ACTION_FEEDBACK.ORDER_SAVE_FAILED);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [label, context] = consoleErrorSpy.mock.calls[0]!;
      expect(label).toBe("[orders] unmapped order database error");
      expect(context).toEqual({ sqlstate: error!.code });
      // …but never reaches the log: the fixed label is the only text, the context carries only the SQLSTATE.
      expect(JSON.stringify(context)).not.toMatch(/row-level security|orders|policy|buyer_organization_id|f0000000/i);
      expect(String(label)).not.toMatch(/row-level security|policy|buyer_organization_id/i);

      consoleErrorSpy.mockClear();
      expect(mapShipmentError({ message: "duplicate key value violates unique constraint \"shipment_items_pkey\"", code: "23505", details: "Key (id)=(…) already exists." } as never)).toBe(ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED);
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toMatch(/duplicate|constraint|pkey|Key \(id\)/);
      expect(consoleErrorSpy.mock.calls[0]![1]).toEqual({ sqlstate: "23505" });
    },
    LIVE_TIMEOUT_MS
  );
});

describe("T025 — no raw database text can reach a client or a log (source + copy audits)", () => {
  const SENSITIVE_TOKENS = ["forbidden", "reservation_expired", "listing_inventory_changed", "seller_inventory_changed", "cannot_publish_empty_listing", "P0001", "SQLSTATE", "row-level security"];

  it("client-visible codes: no ACTION_FEEDBACK value is a sensitive token, and the only value that coincides with a raised string is the stable 'order_not_found' code itself", () => {
    const { orderDomain, shipmentDomain, listingRevalidation } = loadBaselineRaises();
    const raised = new Set([...orderDomain, ...shipmentDomain, ...listingRevalidation]);
    const values = Object.values(ACTION_FEEDBACK) as string[];
    for (const token of SENSITIVE_TOKENS) expect(values).not.toContain(token);
    expect(values.filter((value) => raised.has(value))).toEqual(["order_not_found"]);
  });

  it("EN and AR copy contain none of the database's raised strings and no SQLSTATE/policy/table vocabulary", async () => {
    const { readFileSync } = await import("node:fs");
    const { orderDomain, shipmentDomain, listingRevalidation } = loadBaselineRaises();
    for (const path of ["lib/app/copy/en.ts", "lib/app/copy/ar.ts"]) {
      const copy = stripComments(readFileSync(path, "utf8"));
      for (const raised of [...orderDomain, ...shipmentDomain, ...listingRevalidation]) expect(copy, `${path} contains ${raised}`).not.toContain(raised);
      for (const token of ["reservation_expired", "P0001", "SQLSTATE", "row-level security", "inventory_reservations", "checkout_order", "expire_order_hold"]) expect(copy, `${path} contains ${token}`).not.toContain(token);
    }
  });

  it("production order code never forwards error.message/details/hint, never renders a raw code string, and logs only in errors.ts with the SQLSTATE", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "lib/orders", "src/app/dashboard/orders", "components/orders"], { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .filter((file) => /\.(ts|tsx)$/.test(file));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (file !== "lib/orders/errors.ts") {
        expect(source, file).not.toMatch(/\berror\??\.(message|details|hint)\b/);
        expect(source, file).not.toMatch(/console\.(log|error|warn|info|debug)/);
      }
      expect(source, file).not.toMatch(/\{\s*(state|result|feedback)\??\.code\s*\}|\$\{\s*(state|result|feedback)\??\.code\s*\}|toast\.[a-z]+\([^)]*\.code/);
      expect(source, file).not.toMatch(/\.stack\b/);
    }

    const errors = stripComments(readFileSync("lib/orders/errors.ts", "utf8"));
    const logCalls = errors.match(/console\.\w+\([^;]*\);/g) ?? [];
    expect(logCalls).toEqual(["console.error(`[orders] unmapped ${domain} database error`, { sqlstate: code });"]);
  });
});

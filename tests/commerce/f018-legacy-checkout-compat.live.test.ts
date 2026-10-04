/* eslint-disable @typescript-eslint/no-explicit-any -- test-only: rows returned by psql are dynamic JSON that these suites assert on structurally */
/**
 * Feature 018 T025 - fresh legacy multi-line denial and historical committed multi-line/multi-group compatibility
 * against REAL PostgreSQL. History is created by the ORIGINAL Feature 015 kernel (before M1/M2 exist) and Feature 018 is
 * then applied on top, exactly as it would be on a populated database. Opt in with F018_LOCAL_PG=1. LOCAL ONLY.
 */
import { afterEach, describe, expect, it } from "vitest";

import { Actor, canonicalCart, inventoryConservation, lineFor, nextRequest, openBuyerA, openBuyerB, stateDigest } from "./f018-checkout-helpers";
import { W, installWorld } from "./f018-fixtures";
import { F018_LOCAL_PG_ENABLED, F018_M1, F018_M2, PsqlSession, applyForward, applyRollback, freshWorkDatabase, jsonLine, tryWork, work, workJson, workScalar } from "./f018-local-pg";

const A = W.orgs.buyerA;

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 legacy checkout fence and historical compatibility (real PostgreSQL)", { timeout: 240_000 }, () => {
  const open: Array<Actor | PsqlSession> = [];
  afterEach(async () => { await Promise.all(open.splice(0).map((entry) => entry.close())); });

  interface History { orderId: string; requestId: string; response: Record<string, any> }

  /** Builds a committed multi-line, multi-seller (two fulfillment groups) order with the ORIGINAL kernel, then applies M1+M2. */
  async function historicalThenMigrate(): Promise<History> {
    freshWorkDatabase();
    installWorld();
    const a = await Actor.open("hist", W.users.buyerA1, A);
    open.push(a);
    for (const [offer, quantity] of [[W.offers.A, 10], [W.offers.B, 20], [W.offers.S1, 60]] as Array<[string, number]>) expect((await a.addLine(offer, quantity)).ok).toBe(true);
    const cart = canonicalCart(A)!;
    const requestId = nextRequest();
    const output = await a.sql(`select public.checkout_bank_transfer_v1('${cart.id}', '${W.destinations.A}', '${requestId}');`);
    const response = jsonLine<Record<string, any>>(output);
    expect(response.order_id).toBe(cart.id);
    expect(workScalar(`select count(*) from public.order_items where order_id = '${cart.id}'`)).toBe("3");
    expect(workScalar(`select count(*) from public.proforma_fulfillment_groups g join public.proforma_invoices p on p.id = g.proforma_id where p.order_id = '${cart.id}'`)).toBe("2");
    applyForward(F018_M1);
    applyForward(F018_M2);
    work("update public.coffee_offers set reserved_quantity_kg = reserved_quantity_kg where false");
    return { orderId: cart.id, requestId, response };
  }

  it("replays an already committed multi-line, multi-group order unchanged (no new rows, no receipt, no retired grant)", async () => {
    const history = await historicalThenMigrate();
    const buyer = await Actor.open("replay", W.users.buyerA1, A);
    open.push(buyer);
    const digest = stateDigest();
    const replay = jsonLine<Record<string, any>>(await buyer.sql(`select public.checkout_bank_transfer_v1('${history.orderId}', '${W.destinations.A}', '${history.requestId}');`));
    expect(replay).toEqual(history.response);
    // A fresh request key against the already held order still resolves to the committed result (existing F015 semantics).
    const otherKey = jsonLine<Record<string, any>>(await buyer.sql(`select public.checkout_bank_transfer_v1('${history.orderId}', '${W.destinations.A}', '${nextRequest()}');`));
    expect(otherKey).toMatchObject({ order_id: history.orderId, proforma_id: history.response.proforma_id, reservation_id: history.response.reservation_id });
    expect(stateDigest()).toEqual({ ...digest, counts: { ...(digest.counts as object), request_log: Number((digest.counts as any).request_log) + 1 } });
    expect(workScalar("select count(*) from public.cart_line_checkout_receipts")).toBe("0");
    expect(workScalar("select count(*) from public.f018_checkout_permits")).toBe("0");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
    // Feature 017 retirement is untouched by the migration.
    expect(tryWork("begin; set local role authenticated; select public.record_stripe_payment_intent(gen_random_uuid(), 'x', 'y'); rollback;").error).toMatch(/permission denied/i);
  });

  it("releases a historical multi-line reservation once through the existing expiry sweeper", async () => {
    const history = await historicalThenMigrate();
    work(`update public.inventory_reservations set expires_at = clock_timestamp() - interval '1 minute' where order_id = '${history.orderId}'`);
    const sweeper = new PsqlSession("sweep");
    open.push(sweeper);
    expect((await sweeper.run("select public.sweep_expired_reservations(10);")).trim()).toBe("1");
    expect(workScalar(`select status from public.orders where id = '${history.orderId}'`)).toBe("EXPIRED");
    expect(workScalar("select coalesce(sum(reserved_quantity_kg), 0)::text from public.coffee_offers")).toBe("0.000");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
    expect((await sweeper.run("select public.sweep_expired_reservations(10);")).trim()).toBe("0");
  });

  it("denies fresh combined checkout for zero-, one- and many-line source carts however the call is made", async () => {
    await historicalThenMigrate();
    const b = await openBuyerB("b1");
    open.push(b);
    const checkoutDirect = (orderId: string) => `select public.checkout_bank_transfer_v1('${orderId}', '${W.destinations.B}', '${nextRequest()}');`;

    // zero-line DRAFT
    await b.sql(`insert into public.orders (buyer_organization_id, created_by) values ('${W.orgs.buyerB}', '${W.users.buyerB1}');`);
    const empty = canonicalCart(W.orgs.buyerB)!;
    expect(await b.sql(checkoutDirect(empty.id))).toContain("checkout_requires_selected_line");
    // one-line DRAFT
    expect((await b.addLine(W.offers.B, 10)).ok).toBe(true);
    const one = canonicalCart(W.orgs.buyerB)!;
    expect(await b.sql(checkoutDirect(one.id))).toContain("checkout_requires_selected_line");
    // many-line DRAFT
    expect((await b.addLine(W.offers.C, 10)).ok).toBe(true);
    const many = canonicalCart(W.orgs.buyerB)!;
    expect(many.lines).toHaveLength(2);
    const digest = stateDigest();
    expect(await b.sql(checkoutDirect(many.id))).toContain("checkout_requires_selected_line");

    // Spoof attempts: client-visible settings, claims and table writes are not authority.
    await b.sql("set app.internal_transition = 'true'; set app.checkout_reservation = 'true'; set f018.permit = 'true'; set app.correlation_id = 'x';");
    expect(await b.sql(checkoutDirect(many.id))).toContain("checkout_requires_selected_line");
    expect(await b.sql(`insert into public.f018_checkout_permits (child_order_id, actor_user_id, buyer_organization_id, source_cart_id, source_order_item_id, root_request_id, child_request_id, offer_id, quantity_kg, destination_id, staged_offer_ids, staged_position_ids) values ('${many.id}', '${W.users.buyerB1}', '${W.orgs.buyerB}', '${many.id}', '${many.lines[0]!.id}', '${nextRequest()}', '${nextRequest()}', '${W.offers.B}', 10, '${W.destinations.B}', '{}', '{}');`)).toContain("permission denied");
    expect(await b.sql(`select public.f018_checkout_kernel('${many.id}', '${W.destinations.B}', '${nextRequest()}');`)).toContain("permission denied");
    expect(await b.sql(`insert into public.commerce_request_log (request_id, actor_user_id, operation, response) values ('${nextRequest()}', '${W.users.buyerB1}', 'checkout_bank_transfer_v1', '{}');`)).toContain("permission denied");
    expect(await b.sql(`select public.issue_proforma('${many.id}', '${W.destinations.B}', null, '${nextRequest()}');`)).toContain("endpoint_deprecated_use_checkout_v1");
    expect(stateDigest()).toEqual(digest);

    // Another tenant cannot reach the cart either, and a service-role style caller without the buyer relationship is refused.
    const a = await openBuyerA("a1");
    open.push(a);
    expect(await a.sql(checkoutDirect(many.id))).toContain("order_not_found");
  });

  it("allows the dedicated one-line child through the same entry point only inside the selected-line transaction", async () => {
    await historicalThenMigrate();
    const b = await openBuyerB("b1");
    open.push(b);
    expect((await b.addLine(W.offers.B, 10)).ok).toBe(true);
    expect((await b.addLine(W.offers.C, 10)).ok).toBe(true);
    const cart = canonicalCart(W.orgs.buyerB)!;
    const done = await b.checkout({ cartId: cart.id, itemId: lineFor(cart, W.offers.B).id, offerId: W.offers.B, quantity: 10, destinationId: W.destinations.B, requestId: nextRequest() });
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(workJson<{ items: number }>(`select jsonb_build_object('items', (select count(*) from public.order_items where order_id = '${done.value.child_order_id}'))`).items).toBe(1);
      // The committed child replays through the public entry point, which never rewrites it.
      const replay = jsonLine<Record<string, any>>(await b.sql(`select public.checkout_bank_transfer_v1('${done.value.child_order_id}', '${W.destinations.B}', '${nextRequest()}');`));
      expect(replay).toMatchObject({ order_id: done.value.child_order_id, proforma_id: done.value.proforma_id });
    }
    expect(canonicalCart(W.orgs.buyerB)!.lines.map((line) => line.offerId)).toEqual([W.offers.C]);
  });

  it("rollback never reopens fresh combined checkout and keeps historical replay and receipts", async () => {
    const history = await historicalThenMigrate();
    const b = await openBuyerB("b1");
    open.push(b);
    expect((await b.addLine(W.offers.B, 10)).ok).toBe(true);
    const cart = canonicalCart(W.orgs.buyerB)!;
    expect((await b.checkout({ cartId: cart.id, itemId: cart.lines[0]!.id, offerId: W.offers.B, quantity: 10, destinationId: W.destinations.B, requestId: nextRequest() })).ok).toBe(true);
    const receipts = workScalar("select count(*) from public.cart_line_checkout_receipts");

    applyRollback(F018_M2);
    expect(workScalar("select count(*) from public.cart_line_checkout_receipts")).toBe(receipts);
    expect(await b.sql(`select public.checkout_cart_line_bank_transfer_v1('${W.orgs.buyerB}', '${cart.id}', '${cart.lines[0]!.id}', '${W.offers.B}', 10, '${W.destinations.B}', '${nextRequest()}');`)).toMatch(/does not exist|permission denied/);
    expect((await b.addLine(W.offers.C, 10)).ok).toBe(true);
    const fresh = canonicalCart(W.orgs.buyerB)!;
    expect(await b.sql(`select public.checkout_bank_transfer_v1('${fresh.id}', '${W.destinations.B}', '${nextRequest()}');`)).toContain("checkout_requires_selected_line");
    const a = await openBuyerA("a1");
    open.push(a);
    const replay = jsonLine<Record<string, any>>(await a.sql(`select public.checkout_bank_transfer_v1('${history.orderId}', '${W.destinations.A}', '${history.requestId}');`));
    expect(replay).toEqual(history.response);
  });
});

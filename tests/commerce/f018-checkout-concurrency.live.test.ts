/* eslint-disable @typescript-eslint/no-explicit-any -- test-only: rows returned by psql are dynamic JSON that these suites assert on structurally */
/**
 * Feature 018 T023 - independent-session concurrency against REAL PostgreSQL (local Supabase container).
 * Sessions genuinely overlap: one holds a transaction open while another is observed waiting on a lock in
 * pg_stat_activity. Opt in with F018_LOCAL_PG=1. LOCAL ONLY.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Actor, canonicalCart, inventoryConservation, lineFor, nextRequest, openBuyerA, openBuyerA2, openBuyerB, openBuyerC, stateDigest } from "./f018-checkout-helpers";
import { W, buildWorldTemplate } from "./f018-fixtures";
import { F018_LOCAL_PG_ENABLED, PsqlSession, errorLine, jsonLine, resetFromWorldTemplate, waitForLockWait, work, workScalar } from "./f018-local-pg";

const A = W.orgs.buyerA;

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 selected-line checkout concurrency (real PostgreSQL)", { timeout: 300_000 }, () => {
  const actors: Actor[] = [];
  const sessions: PsqlSession[] = [];
  const track = async (actor: Promise<Actor>) => { const resolved = await actor; actors.push(resolved); return resolved; };

  beforeAll(() => { buildWorldTemplate(); }, 240_000);
  beforeEach(() => { resetFromWorldTemplate(); });
  afterEach(async () => {
    await Promise.all([...actors.splice(0).map((actor) => actor.close()), ...sessions.splice(0).map((session) => session.close())]);
  });

  const argsFor = (cartId: string, itemId: string, offerId: string, quantity: number, destinationId = W.destinations.A, requestId = nextRequest()) =>
    ({ cartId, itemId, offerId, quantity, destinationId, requestId });

  async function cartWith(actor: Actor, lines: Array<[string, number]>) {
    for (const [offer, quantity] of lines) expect((await actor.addLine(offer, quantity)).ok).toBe(true);
    return canonicalCart(actor.orgId)!;
  }

  /** Starts a transaction that has executed `statement` but not committed, so its locks stay held. */
  async function hold(actor: Actor, statement: string): Promise<string> {
    return actor.sql(`begin; ${statement}`);
  }

  it("same line, same request key from two tabs of one user: the waiting session replays the committed result exactly once", async () => {
    const a1 = await track(openBuyerA("a1"));
    const a2 = await track(Actor.open("a2", W.users.buyerA1, A));
    const cart = await cartWith(a1, [[W.offers.A, 10], [W.offers.B, 20]]);
    const args = argsFor(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 10);

    const first = await hold(a1, a1.checkoutSql(args));
    expect(errorLine(first)).toBeUndefined();
    const racing = a2.session.run(a2.checkoutSql(args));
    expect(await waitForLockWait("a2")).toBe(true);
    await a1.sql("commit;");
    const second = jsonLine<Record<string, unknown>>(await racing);

    const committed = jsonLine<Record<string, unknown>>(first);
    expect(second).toMatchObject({ receipt_id: committed.receipt_id, child_order_id: committed.child_order_id, replayed: true });
    expect(workScalar("select count(*) from public.cart_line_checkout_receipts")).toBe("1");
    expect(workScalar(`select count(*) from public.orders where buyer_organization_id = '${A}' and status = 'HOLD'`)).toBe("1");
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe("10.000");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
  });

  it("same line, different request keys: exactly one valid consumption, the other is a safe conflict", async () => {
    const a1 = await track(openBuyerA("a1"));
    const a2 = await track(openBuyerA2("a2"));
    const cart = await cartWith(a1, [[W.offers.A, 10], [W.offers.B, 20]]);
    const itemA = lineFor(cart, W.offers.A).id;

    await hold(a1, a1.checkoutSql(argsFor(cart.id, itemA, W.offers.A, 10)));
    const racing = a2.session.run(a2.checkoutSql(argsFor(cart.id, itemA, W.offers.A, 10)));
    expect(await waitForLockWait("a2")).toBe(true);
    await a1.sql("commit;");
    expect(errorLine(await racing)).toContain("cart_line_already_consumed");
    expect(workScalar("select count(*) from public.cart_line_checkout_receipts")).toBe("1");
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe("10.000");
  });

  it("when the first transaction rolls back, the waiting competitor proceeds and is the single consumer", async () => {
    const a1 = await track(openBuyerA("a1"));
    const a2 = await track(openBuyerA2("a2"));
    const cart = await cartWith(a1, [[W.offers.A, 10], [W.offers.B, 20]]);
    const itemA = lineFor(cart, W.offers.A).id;

    await hold(a1, a1.checkoutSql(argsFor(cart.id, itemA, W.offers.A, 10)));
    const racing = a2.session.run(a2.checkoutSql(argsFor(cart.id, itemA, W.offers.A, 10)));
    expect(await waitForLockWait("a2")).toBe(true);
    await a1.sql("rollback;");
    const outcome = jsonLine<Record<string, unknown>>(await racing);
    expect(outcome.replayed).toBe(false);
    expect(workScalar("select count(*) from public.cart_line_checkout_receipts")).toBe("1");
    expect(canonicalCart(A)!.lines.map((line) => line.offerId)).toEqual([W.offers.B]);
  });

  it("different lines of one organization serialize into two dedicated one-item transactions and never lose line C", async () => {
    const a1 = await track(openBuyerA("a1"));
    const a2 = await track(openBuyerA2("a2"));
    const cart = await cartWith(a1, [[W.offers.A, 10], [W.offers.B, 20], [W.offers.C, 30]]);

    await hold(a1, a1.checkoutSql(argsFor(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 10)));
    const racing = a2.session.run(a2.checkoutSql(argsFor(cart.id, lineFor(cart, W.offers.B).id, W.offers.B, 20)));
    expect(await waitForLockWait("a2")).toBe(true);
    await a1.sql("commit;");
    expect(errorLine(await racing)).toBeUndefined();

    expect(canonicalCart(A)).toMatchObject({ id: cart.id, lines: [{ offerId: W.offers.C, quantity: 30 }] });
    expect(workScalar("select count(*) from public.cart_line_checkout_receipts")).toBe("2");
    expect(workScalar(`select count(*) from public.orders where buyer_organization_id = '${A}' and status = 'HOLD'`)).toBe("2");
    expect(workScalar(`select count(*) from public.order_items oi join public.orders o on o.id = oi.order_id where o.buyer_organization_id = '${A}' and o.status = 'HOLD'`)).toBe("2");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
  });

  it("Add racing the final-line checkout reuses the same source cart afterwards", async () => {
    const a1 = await track(openBuyerA("a1"));
    const a2 = await track(openBuyerA2("a2"));
    const cart = await cartWith(a1, [[W.offers.A, 10]]);

    await hold(a1, a1.checkoutSql(argsFor(cart.id, cart.lines[0]!.id, W.offers.A, 10)));
    const racing = a2.session.run(`select public.add_cart_line('${A}', '${W.offers.B}', 7, '${nextRequest()}');`);
    expect(await waitForLockWait("a2")).toBe(true);
    await a1.sql("commit;");
    const added = jsonLine<{ order_id: string; quantity_kg: number }>(await racing);
    expect(added.order_id).toBe(cart.id);
    expect(canonicalCart(A)).toMatchObject({ id: cart.id, lines: [{ offerId: W.offers.B, quantity: 7 }] });
    expect(workScalar(`select count(*) from public.orders where buyer_organization_id = '${A}' and status = 'DRAFT'`)).toBe("1");
  });

  it("update and remove racing a checkout see a serialized outcome and never touch a consumed line", async () => {
    const a1 = await track(openBuyerA("a1"));
    const a2 = await track(openBuyerA2("a2"));
    const cart = await cartWith(a1, [[W.offers.A, 10], [W.offers.B, 20]]);
    const itemA = lineFor(cart, W.offers.A).id;
    const itemB = lineFor(cart, W.offers.B).id;

    await hold(a1, a1.checkoutSql(argsFor(cart.id, itemA, W.offers.A, 10)));
    const updateConsumed = a2.session.run(`select public.update_order_item_quantity('${itemA}', 12);`);
    expect(await waitForLockWait("a2")).toBe(true);
    await a1.sql("commit;");
    expect(errorLine(await updateConsumed)).toContain("order_item_not_found");
    expect(errorLine(await a2.sql(`select public.remove_order_item('${itemA}');`))).toContain("order_item_not_found");
    // The other line is still editable after the dedicated transaction committed.
    expect((await a2.update(itemB, 25)).ok).toBe(true);
    expect(canonicalCart(A)!.lines).toEqual([{ id: itemB, offerId: W.offers.B, quantity: 25 }]);
  });

  it("a quantity update committed first makes the old exact checkout quantity conflict instead of buying a different amount", async () => {
    const a1 = await track(openBuyerA("a1"));
    const a2 = await track(openBuyerA2("a2"));
    const cart = await cartWith(a1, [[W.offers.A, 10], [W.offers.B, 20]]);
    const itemA = lineFor(cart, W.offers.A).id;

    await hold(a1, `select public.update_order_item_quantity('${itemA}', 14);`);
    const racing = a2.session.run(a2.checkoutSql(argsFor(cart.id, itemA, W.offers.A, 10)));
    expect(await waitForLockWait("a2")).toBe(true);
    await a1.sql("commit;");
    expect(errorLine(await racing)).toContain("cart_line_changed");
    expect(workScalar("select count(*) from public.cart_line_checkout_receipts")).toBe("0");
    expect(canonicalCart(A)!.lines.find((line) => line.id === itemA)!.quantity).toBe(14);
  });

  it("two first Adds race with no cart: one canonical pending order with merged or distinct lines", async () => {
    const a1 = await track(openBuyerA("a1"));
    const a2 = await track(openBuyerA2("a2"));
    expect(canonicalCart(A)).toBeNull();

    await hold(a1, `select public.add_cart_line('${A}', '${W.offers.A}', 5, '${nextRequest()}');`);
    const racing = a2.session.run(`select public.add_cart_line('${A}', '${W.offers.A}', 7, '${nextRequest()}');`);
    expect(await waitForLockWait("a2")).toBe(true);
    await a1.sql("commit;");
    const second = jsonLine<{ order_id: string; quantity_kg: number }>(await racing);

    expect(workScalar(`select count(*) from public.orders where buyer_organization_id = '${A}' and status = 'DRAFT'`)).toBe("1");
    expect(canonicalCart(A)).toMatchObject({ id: second.order_id, lines: [{ offerId: W.offers.A, quantity: 12 }] });
  });

  it("different organizations racing for the same offer and NULL-location position never oversell", async () => {
    const b = await track(openBuyerB("b1"));
    const c = await track(openBuyerC("c1"));
    const cartB = await cartWith(b, [[W.offers.B, 300]]);
    const cartC = await cartWith(c, [[W.offers.B, 300]]);

    await hold(b, b.checkoutSql(argsFor(cartB.id, cartB.lines[0]!.id, W.offers.B, 300, W.destinations.B)));
    const racing = c.session.run(c.checkoutSql(argsFor(cartC.id, cartC.lines[0]!.id, W.offers.B, 300, W.destinations.C)));
    expect(await waitForLockWait("c1")).toBe(true);
    await b.sql("commit;");
    expect(errorLine(await racing)).toMatch(/requested_quantity_not_available|inventory_quantity_not_available|listing_inventory_changed|seller_inventory_changed/);

    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.B}'`)).toBe("300.000");
    expect(workScalar(`select reserved_quantity_kg::text from public.inventory_positions where lot_id = '${W.lots.l2}'`)).toBe("300.000");
    expect(canonicalCart(W.orgs.buyerC)!.lines).toHaveLength(1);
    // The loser's transaction left nothing behind and the remaining stock is still purchasable.
    expect(await c.sql("rollback;")).not.toMatch(/FATAL/);
    const retry = await c.checkout(argsFor(cartC.id, cartC.lines[0]!.id, W.offers.B, 300, W.destinations.C));
    expect(retry.ok).toBe(false);
    expect((await c.update(cartC.lines[0]!.id, 200)).ok).toBe(true);
    const smaller = canonicalCart(W.orgs.buyerC)!;
    expect((await c.checkout(argsFor(smaller.id, smaller.lines[0]!.id, W.offers.B, 200, W.destinations.C))).ok).toBe(true);
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.B}'`)).toBe("500.000");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
  });

  async function expiredHoldOn(offerId: string, quantity: number) {
    const b = await track(openBuyerB("b2"));
    const cartB = await cartWith(b, [[offerId, quantity]]);
    const done = await b.checkout(argsFor(cartB.id, cartB.lines[0]!.id, offerId, quantity, W.destinations.B));
    expect(done.ok).toBe(true);
    const orderId = (done as { ok: true; value: Record<string, any> }).value.child_order_id as string;
    work(`update public.inventory_reservations set expires_at = clock_timestamp() - interval '1 minute' where order_id = '${orderId}'`);
    return orderId;
  }

  it("expired-reservation reclamation: a sweeper holding the order makes checkout wait, then proceed on the released stock", async () => {
    const a = await track(openBuyerA("a1"));
    const cartA = await cartWith(a, [[W.offers.A, 300]]); // added while all 500 kg are still available
    const expiredOrder = await expiredHoldOn(W.offers.A, 400);
    const sweeper = new PsqlSession("sweep");
    sessions.push(sweeper);
    await sweeper.run("set application_name = 'f018-sweep';");

    await sweeper.run(`begin; select public.commerce_release_reservation('${expiredOrder}');`);
    const racing = a.session.run(a.checkoutSql(argsFor(cartA.id, cartA.lines[0]!.id, W.offers.A, 300)));
    expect(await waitForLockWait("a1")).toBe(true);
    await sweeper.run("commit;");
    expect(errorLine(await racing)).toBeUndefined();

    expect(workScalar(`select status from public.orders where id = '${expiredOrder}'`)).toBe("EXPIRED");
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe("300.000");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
  });

  it("expired-reservation reclamation: the staged checkout releases it once and a concurrent sweeper skips it safely", async () => {
    const a = await track(openBuyerA("a1"));
    const cartA = await cartWith(a, [[W.offers.A, 300]]); // added while all 500 kg are still available
    const expiredOrder = await expiredHoldOn(W.offers.A, 400);
    const sweeper = new PsqlSession("sweep");
    sessions.push(sweeper);

    // 400 reserved + 300 requested exceeds 500: success proves the checkout itself reclaimed the expired reservation.
    await hold(a, a.checkoutSql(argsFor(cartA.id, cartA.lines[0]!.id, W.offers.A, 300)));
    expect(await sweeper.run(`select public.commerce_release_reservation('${expiredOrder}');`)).toMatch(/^f\s*$/m);
    await a.sql("commit;");
    expect(workScalar(`select status from public.orders where id = '${expiredOrder}'`)).toBe("EXPIRED");
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe("300.000");
    expect(workScalar(`select count(*) from public.inventory_reservations where order_id = '${expiredOrder}' and status = 'EXPIRED'`)).toBe("1");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
  });

  it("without expired stock the same checkout is refused (it does not reclaim a live reservation)", async () => {
    const b = await track(openBuyerB("b1"));
    const cartB = await cartWith(b, [[W.offers.A, 400]]);
    expect((await b.checkout(argsFor(cartB.id, cartB.lines[0]!.id, W.offers.A, 400, W.destinations.B))).ok).toBe(true);
    const a = await track(openBuyerA("a1"));
    const cartA = await cartWith(a, [[W.offers.A, 50]]);
    expect((await a.update(cartA.lines[0]!.id, 150)).ok).toBe(false);
    const refused = await a.checkout(argsFor(cartA.id, cartA.lines[0]!.id, W.offers.A, 50));
    expect(refused.ok).toBe(true);
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe("450.000");
  });

  it("stress: many sessions checking out, adding, updating and sweeping at once produce no deadlock and conserve inventory", async () => {
    const cartHolders = [await track(openBuyerA("a1")), await track(openBuyerA2("a2")), await track(openBuyerB("b1")), await track(openBuyerC("c1"))];
    const sweeper = new PsqlSession("sweep");
    sessions.push(sweeper);
    const offers = [W.offers.A, W.offers.B, W.offers.C];
    const destinationFor = (actor: Actor) => (actor.orgId === A ? W.destinations.A : actor.orgId === W.orgs.buyerB ? W.destinations.B : W.destinations.C);

    const worker = async (actor: Actor, round: number) => {
      for (let step = 0; step < 4; step += 1) {
        const offer = offers[(round + step) % offers.length]!;
        await actor.addLine(offer, 1 + step);
        const cart = canonicalCart(actor.orgId);
        const line = cart?.lines.find((entry) => entry.offerId === offer);
        if (cart && line) await actor.checkout(argsFor(cart.id, line.id, offer, line.quantity, destinationFor(actor)));
        if (step % 2 === 0) await sweeper.run("select public.sweep_expired_reservations(10);");
      }
    };
    await Promise.all(cartHolders.map((actor, index) => worker(actor, index)));

    const output = await sweeper.run("select 1;");
    expect(output).not.toMatch(/deadlock detected/);
    for (const actor of actors) {
      const probe = await actor.sql("select 1;");
      expect(probe).not.toMatch(/deadlock detected/);
    }
    expect(workScalar("select count(*) from public.f018_checkout_permits")).toBe("0");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
    const receipts = Number(workScalar("select count(*) from public.cart_line_checkout_receipts"));
    expect(receipts).toBeGreaterThan(0);
    expect(Number(workScalar("select count(*) from public.orders where status = 'HOLD'"))).toBe(receipts);
    expect(workScalar("select count(*) from public.orders o where o.status = 'HOLD' and (select count(*) from public.order_items oi where oi.order_id = o.id) <> 1")).toBe("0");
    void stateDigest;
  });
});

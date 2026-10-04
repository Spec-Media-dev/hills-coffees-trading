/**
 * Feature 018 T022 - selected-line checkout against REAL PostgreSQL (local Supabase container).
 * Opt in with F018_LOCAL_PG=1. LOCAL ONLY: no remote host, no fixture session, no production data.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Actor, canonicalCart, inventoryConservation, lineFor, nextRequest, openBuyerA, openBuyerB, openBuyerC, sourceStillClean, stateDigest } from "./f018-checkout-helpers";
import { W, buildWorldTemplate } from "./f018-fixtures";
import { F018_LOCAL_PG_ENABLED, resetFromWorldTemplate, tryWork, work, workJson, workScalar } from "./f018-local-pg";

const A = W.orgs.buyerA;
const dest = W.destinations.A;

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 selected-line checkout (real PostgreSQL)", { timeout: 240_000 }, () => {
  const open: Actor[] = [];
  const track = async (actor: Promise<Actor>) => { const resolved = await actor; open.push(resolved); return resolved; };

  beforeAll(() => { buildWorldTemplate(); }, 240_000);
  beforeEach(() => { resetFromWorldTemplate(); });
  afterEach(async () => { await Promise.all(open.splice(0).map((actor) => actor.close())); });

  async function threeLineCart(actor: Actor) {
    expect((await actor.addLine(W.offers.A, 10)).ok).toBe(true);
    expect((await actor.addLine(W.offers.B, 20)).ok).toBe(true);
    expect((await actor.addLine(W.offers.C, 30)).ok).toBe(true);
    const cart = canonicalCart(A)!;
    expect(cart.lines).toHaveLength(3);
    return cart;
  }

  const argsFor = (cartId: string, itemId: string, offerId: string, quantity: number, requestId = nextRequest()) => ({ cartId, itemId, offerId, quantity, destinationId: dest, requestId });

  it("cart A/B/C -> checkout A only: one dedicated child, B and C untouched, source DRAFT reused", async () => {
    const a = await track(openBuyerA());
    const cart = await threeLineCart(a);
    const before = Object.fromEntries(cart.lines.map((line) => [line.offerId, line]));
    const args = argsFor(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 10);

    const result = await a.checkout(args);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.value;
    expect(value.child_order_id).not.toBe(cart.id);
    expect(value.source_cart_id).toBe(cart.id);
    expect(value.replayed).toBe(false);

    const after = canonicalCart(A)!;
    expect(after.id).toBe(cart.id);
    expect(after.status).toBe("DRAFT");
    expect(after.lines.map((line) => line.offerId).sort()).toEqual([W.offers.B, W.offers.C].sort());
    for (const offerId of [W.offers.B, W.offers.C]) expect(lineFor(after, offerId)).toEqual(before[offerId]);

    const child = workJson<{ status: string; flow: string; items: Array<{ offer: string; qty: number }>; reservation: string; proforma: string; payment: string }>(`
      select jsonb_build_object('status', o.status, 'flow', o.commerce_flow,
        'items', (select jsonb_agg(jsonb_build_object('offer', oi.offer_id, 'qty', oi.quantity_kg)) from public.order_items oi where oi.order_id = o.id),
        'reservation', (select status from public.inventory_reservations where order_id = o.id), 'proforma', (select status from public.proforma_invoices where order_id = o.id),
        'payment', (select status from public.payments where order_id = o.id))
      from public.orders o where o.id = '${value.child_order_id}'`);
    expect(child).toEqual({ status: "HOLD", flow: "BANK_TRANSFER_V1", items: [{ offer: W.offers.A, qty: 10 }], reservation: "ACTIVE", proforma: "CONFIRMED", payment: "PENDING" });
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe("10.000");
    for (const offerId of [W.offers.B, W.offers.C]) expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${offerId}'`)).toBe("0.000");
    expect(sourceStillClean(cart.id)).toBe(true);
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
    expect(workScalar(`select count(*) from public.cart_line_checkout_receipts where source_order_item_id = '${args.itemId}' and request_id = '${args.requestId}'`)).toBe("1");
    expect(workScalar("select count(*) from public.f018_checkout_permits")).toBe("0");
  });

  it("final-line checkout keeps the exact source cart ID as an empty V1 DRAFT and the next Add reuses it", async () => {
    const a = await track(openBuyerA());
    const first = await a.addLine(W.offers.A, 10);
    expect(first.ok).toBe(true);
    const cart = canonicalCart(A)!;
    const args = argsFor(cart.id, cart.lines[0]!.id, W.offers.A, 10);
    const done = await a.checkout(args);
    expect(done.ok).toBe(true);

    const empty = canonicalCart(A)!;
    expect(empty).toMatchObject({ id: cart.id, status: "DRAFT", lines: [] });
    expect(sourceStillClean(cart.id)).toBe(true);
    if (done.ok) expect(done.value.child_order_id).not.toBe(cart.id);
    expect(workScalar(`select count(*) from public.orders where buyer_organization_id = '${A}' and status = 'DRAFT'`)).toBe("1");

    const next = await a.addLine(W.offers.B, 5);
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.value.order_id).toBe(cart.id);
    expect(workScalar(`select count(*) from public.orders where buyer_organization_id = '${A}' and status = 'DRAFT'`)).toBe("1");
  });

  it("twenty final-checkout / new-Add cycles keep one source cart, unique receipts and no replacement carts", async () => {
    const a = await track(openBuyerA());
    let sourceId: string | undefined;
    const receiptItems = new Set<string>();
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const added = await a.addLine(W.offers.A, 1);
      expect(added.ok, `cycle ${cycle} add`).toBe(true);
      const cart = canonicalCart(A)!;
      sourceId ??= cart.id;
      expect(cart.id).toBe(sourceId);
      expect(cart.lines).toHaveLength(1);
      receiptItems.add(cart.lines[0]!.id);
      const done = await a.checkout(argsFor(cart.id, cart.lines[0]!.id, W.offers.A, 1));
      expect(done.ok, `cycle ${cycle} checkout: ${done.ok ? "" : done.error}`).toBe(true);
      expect(canonicalCart(A)).toMatchObject({ id: sourceId, lines: [] });
    }
    expect(receiptItems.size).toBe(20);
    expect(workScalar(`select count(*) from public.orders where buyer_organization_id = '${A}' and status = 'DRAFT'`)).toBe("1");
    expect(workScalar("select count(*) from public.cart_line_checkout_receipts")).toBe("20");
    expect(workScalar(`select count(distinct transaction_order_id) from public.cart_line_checkout_receipts`)).toBe("20");
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe("20.000");
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
  });

  it.each(["child_order", "item_validation", "proforma", "snapshot", "reservation", "payment", "notification", "receipt", "source_delete", "deferred_check"])(
    "an injected failure at %s rolls back every effect and leaves the cart and inventory intact",
    async (point) => {
      const a = await track(openBuyerA());
      const cart = await threeLineCart(a);
      const itemA = lineFor(cart, W.offers.A);
      const args = argsFor(cart.id, itemA.id, W.offers.A, 10);
      const before = stateDigest();

      await a.sql(`set f018.fail_at = '${point}';`);
      const failed = await a.checkout(args);
      await a.sql("set f018.fail_at = '';");
      expect(failed.ok, `${point} must fail`).toBe(false);
      if (!failed.ok) expect(failed.error).toContain(`f018_injected_${point}`);

      expect(stateDigest()).toEqual(before);
      expect(canonicalCart(A)).toEqual(cart);
      expect(sourceStillClean(cart.id)).toBe(true);
      expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });

      // The failed intent is retryable with the SAME request key: nothing was claimed.
      const retried = await a.checkout(args);
      expect(retried.ok, `retry after ${point}: ${retried.ok ? "" : retried.error}`).toBe(true);
      expect(canonicalCart(A)!.lines).toHaveLength(2);
    },
  );

  it("replays the same request and payload to the same committed result without a second purchase", async () => {
    const a = await track(openBuyerA());
    const cart = await threeLineCart(a);
    const args = argsFor(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 10);
    const first = await a.checkout(args);
    const digest = stateDigest();
    const second = await a.checkout(args);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value).toMatchObject({ receipt_id: first.value.receipt_id, child_order_id: first.value.child_order_id, proforma_id: first.value.proforma_id, replayed: true });
    expect(stateDigest()).toEqual(digest);
  });

  it("conflicts when the same request key is reused with any changed bound field", async () => {
    const a = await track(openBuyerA());
    const cart = await threeLineCart(a);
    const args = argsFor(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 10);
    expect((await a.checkout(args)).ok).toBe(true);
    const digest = stateDigest();
    const variants: Array<[string, Partial<typeof args>]> = [
      ["item", { itemId: lineFor(cart, W.offers.B).id }],
      ["offer", { offerId: W.offers.B }],
      ["quantity", { quantity: 11 }],
      ["destination", { destinationId: W.destinations.A2 }],
      ["cart", { cartId: W.sourceOrders.s1 }],
    ];
    for (const [label, change] of variants) {
      const outcome = await a.checkout({ ...args, ...change });
      expect(outcome.ok, `${label} change`).toBe(false);
      if (!outcome.ok) expect(outcome.error, label).toMatch(/request_payload_conflict|request_id_conflict|cart_not_canonical|cart_line_already_consumed/);
    }
    // A different request key for the already consumed line must not create a replacement purchase.
    const other = await a.checkout({ ...args, requestId: nextRequest() });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toContain("cart_line_already_consumed");
    expect(stateDigest()).toEqual(digest);
  });

  it("rejects a request key already used by another operation", async () => {
    const a = await track(openBuyerA());
    const requestId = nextRequest();
    expect((await a.addLine(W.offers.A, 10, requestId)).ok).toBe(true);
    const cart = canonicalCart(A)!;
    const outcome = await a.checkout(argsFor(cart.id, cart.lines[0]!.id, W.offers.A, 10, requestId));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/request_id_conflict/);
    expect(canonicalCart(A)!.lines).toHaveLength(1);
  });

  it("add replays by payload: same request and payload returns the stored line; a changed quantity conflicts", async () => {
    const a = await track(openBuyerA());
    const requestId = nextRequest();
    const first = await a.addLine(W.offers.A, 10, requestId);
    const replay = await a.addLine(W.offers.A, 10, requestId);
    expect(first.ok && replay.ok).toBe(true);
    if (first.ok && replay.ok) expect(replay.value).toEqual(first.value);
    expect(canonicalCart(A)!.lines[0]!.quantity).toBe(10);
    const changed = await a.addLine(W.offers.A, 11, requestId);
    expect(changed.ok).toBe(false);
    if (!changed.ok) expect(changed.error).toContain("request_payload_conflict");
    expect(canonicalCart(A)!.lines[0]!.quantity).toBe(10);
  });

  it("recovers a lost response from the immutable receipt without creating another purchase", async () => {
    const a = await track(openBuyerA());
    const cart = await threeLineCart(a);
    const args = argsFor(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 10);

    const notYet = await a.recover(args);
    expect(notYet.ok && notYet.value.status).toBe("NOT_COMMITTED");
    if (notYet.ok) expect(notYet.value.source_line_present).toBe(true);

    const committed = await a.checkout(args); // the browser never sees this response
    expect(committed.ok).toBe(true);
    const digest = stateDigest();
    const recovered = await a.recover(args);
    expect(recovered.ok).toBe(true);
    if (recovered.ok && committed.ok) {
      expect(recovered.value).toMatchObject({ status: "COMMITTED", receipt_id: committed.value.receipt_id, child_order_id: committed.value.child_order_id, replayed: true });
    }
    expect(stateDigest()).toEqual(digest);

    const changed = await a.recover({ ...args, quantity: 12 });
    expect(changed.ok).toBe(false);
    if (!changed.ok) expect(changed.error).toContain("request_payload_conflict");
    const consumed = await a.recover({ ...args, requestId: nextRequest() });
    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.error).toContain("cart_line_already_consumed");
  });

  it("recovery and replay require fresh server-side authority (another tenant, lost membership or capability fails closed)", async () => {
    const a = await track(openBuyerA());
    const b = await track(openBuyerB());
    const cart = await threeLineCart(a);
    const args = argsFor(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 10);
    expect((await a.checkout(args)).ok).toBe(true);

    for (const outcome of [await b.recover(args, A), await b.checkout(args, A), await b.recover(args, W.orgs.buyerB)]) {
      expect(outcome.ok).toBe(false);
    }
    const crossTenant = await b.recover(args, W.orgs.buyerB);
    if (!crossTenant.ok) expect(crossTenant.error).not.toContain(args.itemId);

    work(`update public.organization_members set is_active = false where organization_id = '${A}' and user_id = '${W.users.buyerA1}'`);
    const lost = await a.recover(args);
    expect(lost.ok).toBe(false);
    if (!lost.ok) expect(lost.error).toContain("buyer_not_authorized");
    work(`update public.organization_members set is_active = true where organization_id = '${A}' and user_id = '${W.users.buyerA1}'; update public.organizations set status = 'SUSPENDED' where id = '${A}'`);
    const suspended = await a.checkout(args);
    expect(suspended.ok).toBe(false);
    if (!suspended.ok) expect(suspended.error).toContain("buyer_not_authorized");
  });

  it("enforces MFA step-up and blocked users before any replay or mutation", async () => {
    work(`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), '${W.users.buyerA1}', 'f018', 'totp', 'verified', now(), now())`);
    const aal1 = await track(Actor.open("mfa1", W.users.buyerA1, A, "aal1"));
    const blockedAdd = await aal1.addLine(W.offers.A, 5);
    expect(blockedAdd.ok).toBe(false);
    if (!blockedAdd.ok) expect(blockedAdd.error).toContain("mfa_step_up_required");
    const aal2 = await track(Actor.open("mfa2", W.users.buyerA1, A, "aal2"));
    expect((await aal2.addLine(W.offers.A, 5)).ok).toBe(true);
    const cart = canonicalCart(A)!;
    const args = argsFor(cart.id, cart.lines[0]!.id, W.offers.A, 5);
    const stepUp = await aal1.checkout(args);
    expect(stepUp.ok).toBe(false);
    if (!stepUp.ok) expect(stepUp.error).toContain("mfa_step_up_required");
    expect((await aal2.checkout(args)).ok).toBe(true);

    work(`update public.profiles set is_blocked = true where id = '${W.users.buyerA1}'`);
    const replay = await aal2.checkout(args);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.error).toContain("buyer_not_authorized");
  });

  it("refuses stale or noncanonical sources and never consumes a different line", async () => {
    const a = await track(openBuyerA());
    const cart = await threeLineCart(a);
    const itemA = lineFor(cart, W.offers.A);
    // Quantity changed after the buyer reviewed it: the old exact quantity conflicts instead of buying a different amount.
    expect((await a.update(itemA.id, 15)).ok).toBe(true);
    const stale = await a.checkout(argsFor(cart.id, itemA.id, W.offers.A, 10));
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toContain("cart_line_changed");
    // Removed line: safe stale failure.
    expect((await a.remove(itemA.id)).ok).toBe(true);
    const gone = await a.checkout(argsFor(cart.id, itemA.id, W.offers.A, 15));
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error).toContain("cart_line_not_found");
    // A historical older DRAFT is not canonical for fresh mutation and is never consolidated or deleted.
    await a.sql(`insert into public.orders (buyer_organization_id, created_by) values ('${A}', '${W.users.buyerA1}');`);
    const newest = canonicalCart(A)!;
    expect(newest.id).not.toBe(cart.id);
    const olderLine = cart.lines.find((line) => line.offerId === W.offers.B)!;
    const refused = await a.checkout(argsFor(cart.id, olderLine.id, W.offers.B, 20));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("cart_not_canonical");
    const update = await a.update(olderLine.id, 25);
    expect(update.error).toContain("cart_not_canonical");
    const remove = await a.remove(olderLine.id);
    expect(remove.error).toContain("cart_not_canonical");
    const direct = await a.sql(`insert into public.order_items (order_id, offer_id, quantity_kg) values ('${cart.id}', '${W.offers.C}', 1);`);
    expect(direct).toContain("cart_not_canonical");
    expect(workScalar(`select count(*) from public.order_items where order_id = '${cart.id}'`)).toBe("2");
  });

  it("estimate is read-only, selected-line only and never creates a cart, reservation or order", async () => {
    const a = await track(openBuyerA());
    const c = await track(openBuyerC());
    const cart = await threeLineCart(a);
    const digest = stateDigest();
    const estimate = await a.estimate({ cartId: cart.id, itemId: lineFor(cart, W.offers.A).id, offerId: W.offers.A, quantity: 10, destinationId: dest });
    expect(estimate.ok).toBe(true);
    if (estimate.ok) {
      expect(estimate.value).toMatchObject({ is_estimate: true, merchandise_gross: 100, shipping_total: 50, vat_total: 5, buyer_total: 155 });
      expect(estimate.value.lines).toHaveLength(1);
    }
    // A caller with no cart reads/recovers/checks out without creating one (reads never create a cart).
    const ghost = { cartId: W.sourceOrders.s1, itemId: W.sourceItems.s1, offerId: W.offers.A, quantity: 1, destinationId: W.destinations.C, requestId: nextRequest() };
    expect((await c.estimate(ghost)).ok).toBe(false);
    expect((await c.checkout(ghost)).ok).toBe(false);
    expect((await c.recover(ghost)).ok && true).toBe(true);
    expect(workScalar(`select count(*) from public.orders where buyer_organization_id = '${W.orgs.buyerC}'`)).toBe("0");
    expect(stateDigest()).toEqual(digest);
  });

  it("receipts are append-only, invisible to every application role and cannot be written directly", async () => {
    const a = await track(openBuyerA());
    const cart = await threeLineCart(a);
    const args = argsFor(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 10);
    expect((await a.checkout(args)).ok).toBe(true);
    expect(tryWork("update public.cart_line_checkout_receipts set quantity_kg = 1").error).toContain("cart_line_receipt_immutable");
    expect(tryWork("delete from public.cart_line_checkout_receipts").error).toContain("cart_line_receipt_immutable");
    expect(await a.sql("select count(*) from public.cart_line_checkout_receipts;")).toMatch(/permission denied/);
    expect(await a.sql("select count(*) from public.f018_checkout_permits;")).toMatch(/permission denied/);
    expect(await a.sql(`insert into public.cart_line_checkout_receipts (request_id) values ('${nextRequest()}');`)).toMatch(/permission denied/);
    expect(await a.sql(`select public.f018_checkout_kernel('${cart.id}', '${dest}', '${nextRequest()}');`)).toMatch(/permission denied/);
    expect(await a.sql(`select public.f018_stage_checkout_locks('${W.offers.A}');`)).toMatch(/permission denied/);
    expect(tryWork("delete from public.orders where status = 'HOLD'").ok).toBe(false);
    expect(workScalar("select count(*) from public.orders where status = 'HOLD'")).toBe("1");
  });
});

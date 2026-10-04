/**
 * Feature 018 T024 - selected-line quote, shipping, commission and inventory conservation against REAL PostgreSQL.
 * Opt in with F018_LOCAL_PG=1. LOCAL ONLY.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Actor, canonicalCart, inventoryConservation, lineFor, nextRequest, openBuyerA } from "./f018-checkout-helpers";
import { W, buildWorldTemplate } from "./f018-fixtures";
import { F018_LOCAL_PG_ENABLED, resetFromWorldTemplate, tryWork, work, workJson, workScalar } from "./f018-local-pg";

const A = W.orgs.buyerA;
const dest = W.destinations.A;

interface Proforma {
  buyer_total: number; shipping: number; vat: number; merchandise: number; groups: number;
  items: Array<{ offer: string; qty: number; rate: number | null; qualifying: number | null; commission: number; seller_net: number }>;
  settlements: number;
}

const proformaOf = (childOrderId: string): Proforma => workJson<Proforma>(`
  select jsonb_build_object('buyer_total', pi.buyer_total, 'shipping', pi.shipping_total, 'vat', pi.vat_total, 'merchandise', pi.merchandise_gross,
    'groups', (select count(*) from public.proforma_fulfillment_groups g where g.proforma_id = pi.id),
    'settlements', (select count(*) from public.proforma_seller_settlements s where s.proforma_id = pi.id),
    'items', (select jsonb_agg(jsonb_build_object('offer', pii.offer_id, 'qty', pii.quantity_kg, 'rate', ple.commission_rate_snapshot,
      'qualifying', ple.seller_qualifying_quantity_kg, 'commission', ple.commission_amount, 'seller_net', ple.seller_net_amount))
      from public.proforma_invoice_items pii join public.proforma_line_economics ple on ple.proforma_item_id = pii.id where pii.proforma_id = pi.id))
  from public.proforma_invoices pi where pi.order_id = '${childOrderId}'`);

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 selected-line quote isolation (real PostgreSQL)", { timeout: 240_000 }, () => {
  const open: Actor[] = [];
  const track = async (actor: Promise<Actor>) => { const resolved = await actor; open.push(resolved); return resolved; };

  beforeAll(() => { buildWorldTemplate(); }, 240_000);
  beforeEach(() => { resetFromWorldTemplate(); });
  afterEach(async () => { await Promise.all(open.splice(0).map((actor) => actor.close())); });

  const args = (cartId: string, itemId: string, offerId: string, quantity: number) => ({ cartId, itemId, offerId, quantity, destinationId: dest, requestId: nextRequest() });

  async function mixedCart(actor: Actor, s1: number, s2: number, hills: number) {
    expect((await actor.addLine(W.offers.S1, s1)).ok).toBe(true);
    expect((await actor.addLine(W.offers.S2, s2)).ok).toBe(true);
    expect((await actor.addLine(W.offers.A, hills)).ok).toBe(true);
    return canonicalCart(A)!;
  }

  it("excludes unrelated same-seller quantity from the commission tier and unrelated shipping groups from the quote", async () => {
    const a = await track(openBuyerA());
    const cart = await mixedCart(a, 60, 60, 10); // S1+S2 combined 120 kg would reach the 4% tier; S1 alone (60 kg) is 10%
    const s1 = lineFor(cart, W.offers.S1);

    const estimate = await a.estimate({ cartId: cart.id, itemId: s1.id, offerId: W.offers.S1, quantity: 60, destinationId: dest });
    expect(estimate.ok).toBe(true);
    if (!estimate.ok) return;
    // Selected line only: 60 kg x 20 = 1200, VAT 5% = 60, ONE shipping group (seller S) = 50.
    expect(estimate.value).toMatchObject({ merchandise_gross: 1200, vat_total: 60, shipping_total: 50, buyer_total: 1310 });
    expect(estimate.value.groups).toHaveLength(1);
    expect(estimate.value.lines).toHaveLength(1);

    // The whole-cart estimate (legacy calculator) differs: more groups and the combined-quantity tier. The selected quote must not inherit them.
    const whole = await a.sql(`select public.estimate_cart('${cart.id}', '${dest}', null);`);
    expect(whole).toContain('"shipping_total": 100.00');

    const done = await a.checkout(args(cart.id, s1.id, W.offers.S1, 60));
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const issued = proformaOf(done.value.child_order_id);
    expect(issued).toMatchObject({ buyer_total: 1310, shipping: 50, vat: 60, merchandise: 1200, groups: 1, settlements: 1 });
    expect(issued.items).toEqual([{ offer: W.offers.S1, qty: 60, rate: 10, qualifying: 60, commission: 120, seller_net: 1080 }]);
    expect(estimate.value.buyer_total).toBe(issued.buyer_total);

    // The unrelated lines are still in the cart and are priced on their own when selected later.
    const remaining = canonicalCart(A)!;
    expect(remaining.lines.map((line) => line.offerId).sort()).toEqual([W.offers.A, W.offers.S2].sort());
    const s2 = await a.checkout(args(remaining.id, lineFor(remaining, W.offers.S2).id, W.offers.S2, 60));
    expect(s2.ok).toBe(true);
    if (s2.ok) {
      const second = proformaOf(s2.value.child_order_id);
      expect(second).toMatchObject({ merchandise: 1080, shipping: 50, vat: 54, buyer_total: 1184 });
      expect(second.items[0]).toMatchObject({ rate: 10, qualifying: 60 }); // not accumulated with the earlier S1 purchase
    }
    expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
  });

  it("an unrelated Hills line adds no shipping group, quantity or total to the selected member-seller checkout", async () => {
    const a = await track(openBuyerA());
    const cart = await mixedCart(a, 30, 30, 100);
    const done = await a.checkout(args(cart.id, lineFor(cart, W.offers.A).id, W.offers.A, 100));
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(proformaOf(done.value.child_order_id)).toMatchObject({ merchandise: 1000, shipping: 50, vat: 50, buyer_total: 1100, groups: 1 });
    expect(workScalar(`select total_quantity_kg::text from public.order_financials where order_id = '${done.value.child_order_id}'`)).toBe("100.000");
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.S1}'`)).toBe("0.000");
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe("100.000");
  });

  it("a tier is decided by the selected line alone even when the unrelated line would cross the boundary", async () => {
    const a = await track(openBuyerA());
    const cart = await mixedCart(a, 150, 40, 10);
    const alone = await a.checkout(args(cart.id, lineFor(cart, W.offers.S1).id, W.offers.S1, 150));
    expect(alone.ok).toBe(true);
    if (alone.ok) expect(proformaOf(alone.value.child_order_id).items[0]).toMatchObject({ rate: 4, qualifying: 150, commission: 120 });
    const rest = canonicalCart(A)!;
    const small = await a.checkout(args(rest.id, lineFor(rest, W.offers.S2).id, W.offers.S2, 40));
    expect(small.ok).toBe(true);
    if (small.ok) expect(proformaOf(small.value.child_order_id).items[0]).toMatchObject({ rate: 10, qualifying: 40, commission: 72 });
  });

  it("estimate and committed buyer totals agree and inventory is conserved across several selected checkouts", async () => {
    const a = await track(openBuyerA());
    const cart = await mixedCart(a, 25, 35, 45);
    let totalReservedA = 0;
    for (const [offerId, quantity] of [[W.offers.A, 45], [W.offers.S2, 35], [W.offers.S1, 25]] as Array<[string, number]>) {
      const current = canonicalCart(A)!;
      const item = lineFor(current, offerId);
      const estimate = await a.estimate({ cartId: current.id, itemId: item.id, offerId, quantity, destinationId: dest });
      const done = await a.checkout(args(current.id, item.id, offerId, quantity));
      expect(estimate.ok && done.ok).toBe(true);
      if (estimate.ok && done.ok) expect(proformaOf(done.value.child_order_id).buyer_total).toBe(estimate.value.buyer_total);
      if (offerId === W.offers.A) totalReservedA += quantity;
      expect(inventoryConservation()).toEqual({ offerMismatches: 0, positionMismatches: 0 });
    }
    expect(canonicalCart(A)).toMatchObject({ id: cart.id, lines: [] });
    expect(workScalar(`select reserved_quantity_kg::text from public.coffee_offers where id = '${W.offers.A}'`)).toBe(`${totalReservedA}.000`);
    expect(workScalar(`select sum(reserved_quantity_kg)::text from public.inventory_positions`)).toBe("105.000");
  });

  it("the historical three-argument quote stays numerically identical to the original Feature 013 calculator", async () => {
    const a = await track(openBuyerA());
    const cart = await mixedCart(a, 60, 60, 10);
    const capture = JSON.parse(readFileSync(resolve(process.cwd(), "specs/018-marketplace-catalogue-checkout-completion/evidence/schema-capture.json"), "utf8")) as {
      sections: { functions: { rows: Array<{ regprocedure: string; definition: string }> } };
    };
    const original = capture.sections.functions.rows.find((row) => row.regprocedure === "compute_order_quote(uuid,uuid,text)")!.definition;
    work(original.replace("public.compute_order_quote(", "public.zz_orig_compute_order_quote("));
    const renamed = workJson<{ same: boolean }>(`select jsonb_build_object('same', public.compute_order_quote('${cart.id}', '${dest}', null) = public.zz_orig_compute_order_quote('${cart.id}', '${dest}', null))`);
    expect(renamed.same).toBe(true);
    const noDestination = workJson<{ same: boolean }>(`select jsonb_build_object('same', public.compute_order_quote('${cart.id}', null, null) = public.zz_orig_compute_order_quote('${cart.id}', null, null))`);
    expect(noDestination.same).toBe(true);
    // The subset core with no subset is the same calculation; an unknown item in a subset fails closed.
    expect(workJson<{ same: boolean }>(`select jsonb_build_object('same', public.f018_compute_quote_core('${cart.id}', '${dest}', null, null) = public.zz_orig_compute_order_quote('${cart.id}', '${dest}', null))`).same).toBe(true);
    expect(tryWork(`select public.f018_compute_quote_core('${cart.id}', '${dest}', null, array['${W.sourceItems.s1}']::uuid[]);`).error).toContain("order_item_not_found");
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- test-only: rows returned by psql are dynamic JSON that these suites assert on structurally */
/** Shared helpers for the Feature 018 real-PostgreSQL checkout suites (LOCAL ONLY). */
import { W } from "./f018-fixtures";
import { PsqlSession, errorLine, jsonLine, workJson } from "./f018-local-pg";

export type Outcome<T = Record<string, unknown>> = { ok: true; value: T } | { ok: false; error: string };

const parse = <T,>(output: string): Outcome<T> => {
  const error = errorLine(output);
  if (error) return { ok: false, error: error.replace(/^ERROR:\s+/, "").trim() };
  return { ok: true, value: jsonLine<T>(output) };
};

export const uuidOf = (n: number): string => `f018000b-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
let requestCounter = 1000;
export const nextRequest = (): string => uuidOf(++requestCounter);

export interface CartLine { id: string; offerId: string; quantity: number }
export interface CartView { id: string; status: string; lines: CartLine[] }

/** The organization's canonical (latest V1 DRAFT) cart as the database sees it. */
export function canonicalCart(orgId: string): CartView | null {
  return workJson<CartView | null>(`
    select coalesce((select jsonb_build_object('id', o.id, 'status', o.status, 'lines',
      (select coalesce(jsonb_agg(jsonb_build_object('id', oi.id, 'offerId', oi.offer_id, 'quantity', oi.quantity_kg) order by oi.created_at, oi.id), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id))
     from public.orders o where o.buyer_organization_id = '${orgId}' and o.commerce_flow = 'BANK_TRANSFER_V1' and o.status = 'DRAFT'
     order by o.created_at desc, o.id desc limit 1), 'null'::jsonb)`);
}

export const lineFor = (cart: CartView, offerId: string): CartLine => {
  const line = cart.lines.find((entry) => entry.offerId === offerId);
  if (!line) throw new Error(`cart has no line for offer ${offerId}`);
  return line;
};

export interface CheckoutArgs { cartId: string; itemId: string; offerId: string; quantity: number; destinationId: string; requestId: string }

export class Actor {
  private constructor(readonly session: PsqlSession, readonly userId: string, readonly orgId: string) {}

  static async open(name: string, userId: string, orgId: string, aal: "aal1" | "aal2" = "aal1"): Promise<Actor> {
    const session = new PsqlSession(name);
    await session.asUser(userId, aal);
    return new Actor(session, userId, orgId);
  }

  sql(statement: string): Promise<string> { return this.session.run(statement); }

  async addLine(offerId: string, quantity: number, requestId = nextRequest()): Promise<Outcome<{ order_id: string; line_id: string; quantity_kg: number }>> {
    return parse(await this.session.run(`select public.add_cart_line('${this.orgId}', '${offerId}', ${quantity}, '${requestId}');`));
  }

  async update(itemId: string, quantity: number): Promise<{ ok: boolean; error?: string }> {
    const error = errorLine(await this.session.run(`select public.update_order_item_quantity('${itemId}', ${quantity});`));
    return error ? { ok: false, error: error.replace(/^ERROR:\s+/, "") } : { ok: true };
  }

  async remove(itemId: string): Promise<{ ok: boolean; error?: string }> {
    const error = errorLine(await this.session.run(`select public.remove_order_item('${itemId}');`));
    return error ? { ok: false, error: error.replace(/^ERROR:\s+/, "") } : { ok: true };
  }

  checkoutSql(a: CheckoutArgs, orgId = this.orgId): string {
    return `select public.checkout_cart_line_bank_transfer_v1('${orgId}', '${a.cartId}', '${a.itemId}', '${a.offerId}', ${a.quantity}, '${a.destinationId}', '${a.requestId}');`;
  }

  async checkout(a: CheckoutArgs, orgId = this.orgId): Promise<Outcome<Record<string, any>>> {
    return parse(await this.session.run(this.checkoutSql(a, orgId)));
  }

  async estimate(a: Omit<CheckoutArgs, "requestId">, orgId = this.orgId): Promise<Outcome<Record<string, any>>> {
    return parse(await this.session.run(`select public.estimate_cart_line_bank_transfer_v1('${orgId}', '${a.cartId}', '${a.itemId}', '${a.offerId}', ${a.quantity}, '${a.destinationId}');`));
  }

  async recover(a: CheckoutArgs, orgId = this.orgId): Promise<Outcome<Record<string, any>>> {
    return parse(await this.session.run(`select public.recover_cart_line_checkout('${orgId}', '${a.requestId}', '${a.cartId}', '${a.itemId}', '${a.offerId}', ${a.quantity}, '${a.destinationId}');`));
  }

  close(): Promise<void> { return this.session.close(); }
}

export const openBuyerA = (name = "a1") => Actor.open(name, W.users.buyerA1, W.orgs.buyerA);
export const openBuyerA2 = (name = "a2") => Actor.open(name, W.users.buyerA2, W.orgs.buyerA);
export const openBuyerB = (name = "b1") => Actor.open(name, W.users.buyerB1, W.orgs.buyerB);
export const openBuyerC = (name = "c1") => Actor.open(name, W.users.buyerC1, W.orgs.buyerC);

/** Whole-database digest used to prove a failed transaction left nothing behind. */
export function stateDigest(): Record<string, unknown> {
  return workJson(`
    select jsonb_build_object(
      'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'items',
        (select coalesce(jsonb_agg(jsonb_build_object('id', oi.id, 'offer', oi.offer_id, 'qty', oi.quantity_kg) order by oi.id), '[]'::jsonb) from public.order_items oi where oi.order_id = o.id)) order by o.id), '[]'::jsonb) from public.orders o),
      'offers', (select jsonb_agg(jsonb_build_object('id', co.id, 'reserved', co.reserved_quantity_kg, 'filled', co.filled_quantity_kg) order by co.id) from public.coffee_offers co),
      'positions', (select jsonb_agg(jsonb_build_object('id', ip.id, 'available', ip.available_quantity_kg, 'reserved', ip.reserved_quantity_kg) order by ip.id) from public.inventory_positions ip),
      'counts', jsonb_build_object(
        'receipts', (select count(*) from public.cart_line_checkout_receipts), 'permits', (select count(*) from public.f018_checkout_permits),
        'proformas', (select count(*) from public.proforma_invoices), 'payments', (select count(*) from public.payments),
        'reservations', (select count(*) from public.inventory_reservations), 'request_log', (select count(*) from public.commerce_request_log),
        'notifications', (select count(*) from public.notifications), 'orders', (select count(*) from public.orders)))`);
}

/** Reservation arithmetic must equal the sum of open reservation items for every offer and backing position. */
export function inventoryConservation(): { offerMismatches: number; positionMismatches: number } {
  return workJson(`
    select jsonb_build_object(
      'offerMismatches', (select count(*) from public.coffee_offers co where co.reserved_quantity_kg <> coalesce((
         select sum(ri.quantity_kg) from public.inventory_reservation_items ri join public.inventory_reservations r on r.id = ri.reservation_id
         where ri.offer_id = co.id and r.status in ('ACTIVE', 'REVIEW_HOLD')), 0)),
      'positionMismatches', (select count(*) from public.inventory_positions ip where ip.reserved_quantity_kg <> coalesce((
         select sum(ri.quantity_kg) from public.inventory_reservation_items ri join public.inventory_reservations r on r.id = ri.reservation_id
         where ri.inventory_position_id = ip.id and r.status in ('ACTIVE', 'REVIEW_HOLD')), 0)))`);
}

export const sourceStillClean = (cartId: string): boolean => workJson<boolean>(`
  select to_jsonb(o.status = 'DRAFT' and o.commerce_flow = 'BANK_TRANSFER_V1' and o.current_proforma_id is null and o.delivery_destination_id is null
    and o.destination_snapshot is null and not exists (select 1 from public.inventory_reservations r where r.order_id = o.id)
    and not exists (select 1 from public.payments p where p.order_id = o.id) and not exists (select 1 from public.proforma_invoices pi where pi.order_id = o.id))
  from public.orders o where o.id = '${cartId}'`);

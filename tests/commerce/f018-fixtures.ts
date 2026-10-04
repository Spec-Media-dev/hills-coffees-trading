/**
 * Feature 018 fixture world for REAL local PostgreSQL tests (LOCAL ONLY, never a remote project).
 *
 * Deterministic UUIDs, rows inserted as the table owner with triggers ON (except the few provenance rows that need a
 * historical PAID order, built under session_replication_role = replica). All behavior under test is then driven
 * through the real RPCs as `authenticated` with genuine JWT claims, so RLS, grants, locks and triggers all apply.
 */
import { F018_M1, F018_M2, F018_M3, applyForward, freshWorkDatabase, saveWorldTemplate, work } from "./f018-local-pg";

const id = (kind: number, n: number) => `f018${kind.toString(16).padStart(4, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const W = {
  users: { admin: id(1, 1), buyerA1: id(1, 2), buyerA2: id(1, 3), buyerB1: id(1, 4), buyerC1: id(1, 5), sellerS1: id(1, 6), admin2: id(1, 7), compliance: id(1, 8), warehouse: id(1, 9), finance: id(1, 10), auditor: id(1, 11) },
  orgs: { hills: id(2, 1), buyerA: id(2, 2), buyerB: id(2, 3), buyerC: id(2, 4), sellerS: id(2, 5) },
  warehouse: id(3, 1),
  location: id(3, 2),
  origin: id(4, 1),
  coffees: { c1: id(5, 1), c2: id(5, 2), c3: id(5, 3), c4: id(5, 4), c5: id(5, 5) },
  lots: { l1: id(6, 1), l2: id(6, 2), l3: id(6, 3), l4: id(6, 4), l5: id(6, 5) },
  /** Hills offers A-C (B and C use NULL-location positions) and member-seller offers S1, S2 (same seller). One active offer per (lot, owner) is a database rule. */
  offers: { A: id(7, 1), B: id(7, 2), C: id(7, 3), S1: id(7, 5), S2: id(7, 6) },
  destinations: { A: id(8, 1), B: id(8, 2), C: id(8, 3), A2: id(8, 4) },
  sourceOrders: { s1: id(9, 1), s2: id(9, 2) },
  sourceItems: { s1: id(9, 11), s2: id(9, 12) },
  paymentAccount: id(10, 1),
} as const;

export type OfferKey = keyof typeof W.offers;
export const priceOf: Record<OfferKey, number> = { A: 10, B: 12.5, C: 8, S1: 20, S2: 18 };

const u = W.users;
const o = W.orgs;

export function worldSql(): string {
  const users = Object.values(u).map((userId) => `insert into auth.users (id, email) values ('${userId}', '${userId}@f018.test');`).join("\n");
  return `
${users}
insert into public.platform_admins (user_id, role) values ('${u.admin}', 'ADMIN'), ('${u.admin2}', 'ADMIN'), ('${u.compliance}', 'COMPLIANCE'), ('${u.warehouse}', 'WAREHOUSE'), ('${u.finance}', 'FINANCE'), ('${u.auditor}', 'AUDITOR');

insert into public.organizations (id, legal_name, display_name, account_type, country_code, status, is_hills_internal, can_buy, can_sell, created_by) values
  ('${o.hills}', 'F018 Hills', 'F018 Hills', 'HILLS_INTERNAL', 'AE', 'ACTIVE', true, true, true, '${u.admin}'),
  ('${o.buyerA}', 'F018 Buyer A', 'F018 Buyer A', 'BUYER', 'AE', 'ACTIVE', false, true, false, '${u.buyerA1}'),
  ('${o.buyerB}', 'F018 Buyer B', 'F018 Buyer B', 'BUYER', 'AE', 'ACTIVE', false, true, false, '${u.buyerB1}'),
  ('${o.buyerC}', 'F018 Buyer C', 'F018 Buyer C', 'BUYER', 'AE', 'ACTIVE', false, true, false, '${u.buyerC1}'),
  ('${o.sellerS}', 'F018 Seller S', 'F018 Seller S', 'SELLER', 'AE', 'ACTIVE', false, true, true, '${u.sellerS1}');
insert into public.organization_members (organization_id, user_id, member_role) values
  ('${o.hills}', '${u.admin}', 'OWNER'), ('${o.buyerA}', '${u.buyerA1}', 'OWNER'), ('${o.buyerA}', '${u.buyerA2}', 'MEMBER'),
  ('${o.buyerB}', '${u.buyerB1}', 'OWNER'), ('${o.buyerC}', '${u.buyerC1}', 'OWNER'), ('${o.sellerS}', '${u.sellerS1}', 'OWNER');
begin;
set local session_replication_role = replica;
insert into public.kyb_applications (organization_id, submitted_by, status) values
  ('${o.buyerA}', '${u.buyerA1}', 'APPROVED'), ('${o.buyerB}', '${u.buyerB1}', 'APPROVED'),
  ('${o.buyerC}', '${u.buyerC1}', 'APPROVED'), ('${o.sellerS}', '${u.sellerS1}', 'APPROVED');
commit;

insert into public.warehouses (id, owner_organization_id, code, name, country_code, city, created_by) values ('${W.warehouse}', '${o.hills}', 'F018-WH', 'F018 Warehouse', 'AE', 'Dubai', '${u.admin}');
insert into public.warehouse_locations (id, warehouse_id, code, name) values ('${W.location}', '${W.warehouse}', 'F018-L1', 'Bay 1');

insert into public.origins (id, name, slug, country_code) values ('${W.origin}', 'Ethiopia', 'f018-ethiopia', 'ET');
insert into public.origin_translations (origin_id, locale, name) values ('${W.origin}', 'en', 'Ethiopia'), ('${W.origin}', 'ar', 'إثيوبيا');
insert into public.coffees (id, name, slug, status, origin_id, created_by) values
  ('${W.coffees.c1}', 'Alpha', 'f018-alpha', 'PUBLISHED', '${W.origin}', '${u.admin}'),
  ('${W.coffees.c2}', 'Bravo', 'f018-bravo', 'PUBLISHED', '${W.origin}', '${u.admin}'),
  ('${W.coffees.c3}', 'Charlie', 'f018-charlie', 'PUBLISHED', null, '${u.admin}'),
  ('${W.coffees.c4}', 'Delta', 'f018-delta', 'PUBLISHED', '${W.origin}', '${u.admin}'),
  ('${W.coffees.c5}', 'Echo', 'f018-echo', 'PUBLISHED', '${W.origin}', '${u.admin}');
insert into public.coffee_translations (coffee_id, locale, name) values
  ('${W.coffees.c1}', 'en', 'Alpha'), ('${W.coffees.c1}', 'ar', 'ألفا'), ('${W.coffees.c2}', 'en', 'Bravo');

insert into public.coffee_lots (id, coffee_id, lot_code, total_quantity_kg, status, source_organization_id, created_by) values
  ('${W.lots.l1}', '${W.coffees.c1}', 'F018-LOT-1', 5000, 'AVAILABLE', '${o.hills}', '${u.admin}'),
  ('${W.lots.l2}', '${W.coffees.c2}', 'F018-LOT-2', 5000, 'AVAILABLE', '${o.hills}', '${u.admin}'),
  ('${W.lots.l3}', '${W.coffees.c3}', 'F018-LOT-3', 5000, 'AVAILABLE', '${o.hills}', '${u.admin}'),
  ('${W.lots.l4}', '${W.coffees.c4}', 'F018-LOT-4', 5000, 'AVAILABLE', '${o.hills}', '${u.admin}'),
  ('${W.lots.l5}', '${W.coffees.c5}', 'F018-LOT-5', 5000, 'AVAILABLE', '${o.hills}', '${u.admin}');
-- lot 1 has a location; lots 2/3 share a NULL-location tuple space (null-safe identity); seller S owns lots 4 and 5.
insert into public.inventory_positions (lot_id, owner_organization_id, warehouse_id, warehouse_location_id, available_quantity_kg, reserved_quantity_kg) values
  ('${W.lots.l1}', '${o.hills}', '${W.warehouse}', '${W.location}', 1000, 0),
  ('${W.lots.l2}', '${o.hills}', '${W.warehouse}', null, 1000, 0),
  ('${W.lots.l3}', '${o.hills}', '${W.warehouse}', null, 1000, 0),
  ('${W.lots.l4}', '${o.sellerS}', '${W.warehouse}', null, 3000, 0),
  ('${W.lots.l5}', '${o.sellerS}', '${W.warehouse}', null, 3000, 0);

begin;
set local session_replication_role = replica;
insert into public.orders (id, buyer_organization_id, status, commerce_flow, created_by) values
  ('${W.sourceOrders.s1}', '${o.sellerS}', 'PAID', 'BANK_TRANSFER_V1', '${u.sellerS1}'),
  ('${W.sourceOrders.s2}', '${o.sellerS}', 'PAID', 'BANK_TRANSFER_V1', '${u.sellerS1}');
insert into public.order_items (id, order_id, offer_id, lot_id, seller_organization_id, quantity_kg, unit_price_per_kg, product_name_snapshot, lot_code_snapshot, seller_type_snapshot) values
  ('${W.sourceItems.s1}', '${W.sourceOrders.s1}', '${W.offers.A}', '${W.lots.l4}', '${o.hills}', 3000, 5, 'Delta', 'F018-LOT-4', 'HILLS'),
  ('${W.sourceItems.s2}', '${W.sourceOrders.s2}', '${W.offers.A}', '${W.lots.l5}', '${o.hills}', 3000, 5, 'Echo', 'F018-LOT-5', 'HILLS');
commit;

insert into public.coffee_offers (id, coffee_id, lot_id, seller_organization_id, seller_type, warehouse_id, warehouse_location_id, quantity_kg, price_per_kg, currency, status, created_by, offer_code, source_purchase_order_item_id) values
  ('${W.offers.A}', '${W.coffees.c1}', '${W.lots.l1}', '${o.hills}', 'HILLS', '${W.warehouse}', '${W.location}', 500, ${priceOf.A}, 'USD', 'PUBLISHED', '${u.admin}', 'LST-0000001', null),
  ('${W.offers.B}', '${W.coffees.c2}', '${W.lots.l2}', '${o.hills}', 'HILLS', '${W.warehouse}', null, 500, ${priceOf.B}, 'USD', 'PUBLISHED', '${u.admin}', 'LST-0000002', null),
  ('${W.offers.C}', '${W.coffees.c3}', '${W.lots.l3}', '${o.hills}', 'HILLS', '${W.warehouse}', null, 500, ${priceOf.C}, 'USD', 'PUBLISHED', '${u.admin}', 'LST-0000003', null),
  ('${W.offers.S1}', '${W.coffees.c4}', '${W.lots.l4}', '${o.sellerS}', 'MEMBER_SELLER', '${W.warehouse}', null, 2000, ${priceOf.S1}, 'USD', 'PUBLISHED', '${u.sellerS1}', 'LST-0000005', '${W.sourceItems.s1}'),
  ('${W.offers.S2}', '${W.coffees.c5}', '${W.lots.l5}', '${o.sellerS}', 'MEMBER_SELLER', '${W.warehouse}', null, 2000, ${priceOf.S2}, 'USD', 'PUBLISHED', '${u.sellerS1}', 'LST-0000006', '${W.sourceItems.s2}');

select setval('public.offer_code_seq', 1000);
update public.commerce_settings set bank_transfer_checkout_enabled = true, proforma_validity_hours = 24 where id;
insert into public.payment_accounts (id, account_name, bank_name, account_number, iban, swift_code, currency, is_active, is_default_for_currency, created_by) values
  ('${W.paymentAccount}', 'Hills Trading LLC', 'F018 Bank', '1234567890123456', 'AE070331234567890123456', 'F018AEAD', 'USD', true, true, '${u.admin}');
insert into public.tax_rules (country_code, tax_name, rate_percentage, taxable_base, is_active, effective_from, created_by) values ('AE', 'VAT', 5, 'MERCHANDISE_ONLY', true, now() - interval '30 days', '${u.admin}');
insert into public.shipping_rules (country_code, delivery_method, flat_fee, currency, is_active, effective_from, created_by) values ('AE', 'Courier', 50, 'USD', true, now() - interval '30 days', '${u.admin}');
with p as (insert into public.commission_policies (name, status, effective_from, created_by) values ('F018 policy', 'ACTIVE', now() - interval '30 days', '${u.admin}') returning id)
insert into public.commission_tiers (policy_id, min_quantity_kg, max_quantity_kg, percentage) select p.id, t.min_q, t.max_q, t.pct from p, (values (0::numeric, 100::numeric, 10::numeric), (100::numeric, null::numeric, 4::numeric)) as t(min_q, max_q, pct);

insert into public.delivery_destinations (id, organization_id, label, country_code, city, address_line_1, contact_name, contact_phone, delivery_method, is_default, created_by) values
  ('${W.destinations.A}', '${o.buyerA}', 'A HQ', 'AE', 'Dubai', '1 Test Street', 'A Contact', '+971500000001', 'Courier', true, '${u.buyerA1}'),
  ('${W.destinations.A2}', '${o.buyerA}', 'A Branch', 'AE', 'Abu Dhabi', '2 Test Street', 'A Contact', '+971500000002', 'Courier', false, '${u.buyerA1}'),
  ('${W.destinations.B}', '${o.buyerB}', 'B HQ', 'AE', 'Dubai', '3 Test Street', 'B Contact', '+971500000003', 'Courier', true, '${u.buyerB1}'),
  ('${W.destinations.C}', '${o.buyerC}', 'C HQ', 'AE', 'Dubai', '4 Test Street', 'C Contact', '+971500000004', 'Courier', true, '${u.buyerC1}');
`;
}

export function installWorld(): void {
  work(worldSql());
}

/** Test-only fault injection: a session sets `f018.fail_at` and the named trigger raises, proving atomic rollback. */
export const FAULT_INJECTION_SQL = `
create or replace function public.zz_f018_fail() returns trigger language plpgsql as $$
begin
  if current_setting('f018.fail_at', true) = tg_argv[0] then raise exception 'f018_injected_%', tg_argv[0]; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger zz_f018_fail_child_order before insert on public.orders for each row execute function public.zz_f018_fail('child_order');
create trigger zz_f018_fail_item_validation before insert on public.order_items for each row execute function public.zz_f018_fail('item_validation');
create trigger zz_f018_fail_proforma before insert on public.proforma_invoices for each row execute function public.zz_f018_fail('proforma');
create trigger zz_f018_fail_snapshot before insert on public.proforma_invoice_items for each row execute function public.zz_f018_fail('snapshot');
create trigger zz_f018_fail_reservation before insert on public.inventory_reservation_items for each row execute function public.zz_f018_fail('reservation');
create trigger zz_f018_fail_payment before insert on public.payments for each row execute function public.zz_f018_fail('payment');
create trigger zz_f018_fail_notification before insert on public.notifications for each row execute function public.zz_f018_fail('notification');
create trigger zz_f018_fail_receipt before insert on public.cart_line_checkout_receipts for each row execute function public.zz_f018_fail('receipt');
create trigger zz_f018_fail_source_delete before delete on public.order_items for each row execute function public.zz_f018_fail('source_delete');
create trigger zz_f018_fail_offer_publish before update on public.coffee_offers for each row when (new.status = 'PUBLISHED') execute function public.zz_f018_fail('offer_publish');
create trigger zz_f018_fail_review before insert on public.listing_reviews for each row execute function public.zz_f018_fail('review');
create trigger zz_f018_fail_media before insert on public.coffee_media for each row execute function public.zz_f018_fail('media');
create constraint trigger zz_f018_fail_deferred after insert on public.cart_line_checkout_receipts deferrable initially deferred for each row execute function public.zz_f018_fail('deferred_check');
`;

/** Builds the M1 + M2 + M3 + fixtures + fault-injection template once; tests then clone it per test (fast, isolated). */
export function buildWorldTemplate(): void {
  freshWorkDatabase();
  applyForward(F018_M1);
  applyForward(F018_M2);
  applyForward(F018_M3);
  installWorld();
  work(FAULT_INJECTION_SQL);
  saveWorldTemplate();
}

/** SQL that makes the current psql session act as the given authenticated user (genuine JWT claims, RLS applies). */
export function asUser(userId: string, aal: "aal1" | "aal2" = "aal1"): string {
  const claims = JSON.stringify({ sub: userId, role: "authenticated", aal });
  return `select set_config('request.jwt.claims', '${claims}', false); set role authenticated;`;
}

export const asAdmin = (): string => asUser(u.admin, "aal2");
export const resetRole = (): string => "reset role; select set_config('request.jwt.claims', '', false);";

/** A deterministic request UUID per label. */
export const requestId = (n: number): string => id(11, n);

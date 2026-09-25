/**
 * Feature 013 T037 (MP-6) — the M2b live proof as ONE PostgreSQL `DO` block, executed against the linked project by
 * `tests/commerce/snapshot-immutability.live.test.ts` (F013_LIVE=1) through `supabase db query --linked`.
 *
 * Why one transaction that always rolls back (T035 F4, owner-approved "one-transaction setup"):
 *   - Feature 013 snapshot rows are immutable and never deletable (that is what is being proved), so a committed live
 *     fixture could never be cleaned up;
 *   - the deferred FIN-007/header checks need every snapshot row in one transaction; `SET CONSTRAINTS ALL IMMEDIATE`
 *     runs exactly the triggers COMMIT would run;
 *   - the block ends with `raise exception 'T037_RESULT:<base64 json>'`, so every fixture row, audit row and the legacy checkout
 *     are rolled back atomically — cleanup cannot be forgotten or partial. Only sequence values (order/proforma codes,
 *     audit identity) are consumed, as with any rolled-back transaction.
 *
 * Every case runs in its own sub-block (savepoint): a refused write is caught and recorded, an accepted probe is undone
 * with `T037_UNDO`. Fixture ids are the reserved `13000000-0000-4000-8000-0000000003xx` range. Existing Foundation /
 * Feature 005 fixture rows are only referenced (buyer org + user, the Hills fixture org, published Hills listings,
 * warehouse); member-seller economics are attributed in the snapshot to the Foundation buyer-and-seller org (the snapshot
 * tables carry their own seller attribution; no member-seller listing exists in production).
 */

export const T037 = {
  marker: "13000000-0000-4000-8000-0000000003ff",
  orderV1: "13000000-0000-4000-8000-000000000301",
  orderLegacy: "13000000-0000-4000-8000-000000000302",
  orderRecheck: "13000000-0000-4000-8000-000000000303",
  proforma: "13000000-0000-4000-8000-000000000311",
  proformaRecheck: "13000000-0000-4000-8000-000000000312",
  proformaV2: "13000000-0000-4000-8000-000000000314",
  groupS: "13000000-0000-4000-8000-000000000321",
  groupH: "13000000-0000-4000-8000-000000000322",
  line1: "13000000-0000-4000-8000-000000000331",
  line2: "13000000-0000-4000-8000-000000000332",
  line3: "13000000-0000-4000-8000-000000000333",
  orderItem1: "13000000-0000-4000-8000-000000000341",
  orderItem2: "13000000-0000-4000-8000-000000000342",
  orderItem3: "13000000-0000-4000-8000-000000000343",
  orderItemLegacy: "13000000-0000-4000-8000-000000000344",
  orderItemRecheck: "13000000-0000-4000-8000-000000000345",
  shipmentLegacy: "13000000-0000-4000-8000-000000000351",
  shipmentRecheck: "13000000-0000-4000-8000-000000000352",
  policy: "13000000-0000-4000-8000-000000000362",
  tier: "13000000-0000-4000-8000-000000000363",
  shippingRule: "13000000-0000-4000-8000-000000000364",
  account: "13000000-0000-4000-8000-000000000365",
  promoSeller: "13000000-0000-4000-8000-000000000366",
  promoHills: "13000000-0000-4000-8000-000000000367",
} as const;

/** Existing fixture rows the proof only references (never modified outside the rolled-back transaction). */
export const T037_EXISTING = {
  buyerOrg: "f0000000-0000-4000-8000-000000000001", // Foundation Test — Buyer Only
  buyerUser: "7c0edf8e-6e90-404a-9711-f6ba7dc64c37", // buyer-only+foundation-test@example.com
  memberSellerOrg: "f0000000-0000-4000-8000-000000000002", // Foundation Test — Buyer And Seller
  hillsOrg: "05000000-0000-4000-8000-000000000001", // Feature 005 Fixture — Hills Internal FZE
  warehouse: "05000000-0000-4000-8000-000000000002",
  offerLine1: "05000000-0000-4000-8000-000000000006", // LST-0000003, 5.00/kg
  offerLine2: "09000000-0000-4000-8000-000000000003", // LST-0000005, 10.00/kg
  offerLine3: "05000000-0000-4000-8000-000000000005", // LST-0000002, 5.00/kg (also the legacy checkout listing)
  legacyPosition: "05000000-0000-4000-8000-000000000007",
  /** The active AE VAT rule (5 %, MERCHANDISE_ONLY): order_financials.tax_rule_id keeps its pre-existing FK to tax_rules. */
  taxRule: "891aba86-2382-4a34-8f4d-0950e10c0cef",
} as const;

/** Raw values that must never reach audit_logs. */
export const T037_SECRETS = ["T037-ACC-1234567890", "AE07T037000000001234567890", "T037 Harbour Road 17", "+971500000037", "T037-TRN-100200300", "T037 Buyer Legal LLC", "T037PROMO"];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const E = T037_EXISTING;
const I = T037;

/** The balanced snapshot (same economics as the PGlite proof): see the numbers in each statement. */
function snapshot(over: Partial<Record<SnapshotPart, string | ((s: string) => string)>> = {}): string {
  const s: Record<SnapshotPart, string> = {
    // Header: gross 900.00, discount 56.00, net 844.00, shipping 25.00, VAT 42.20, buyer total 911.20.
    header: `insert into public.proforma_invoices (id, order_id, version, status, issued_at, valid_until, validity_hours_snapshot, currency,
        merchandise_gross, discount_total, merchandise_net, shipping_total, vat_total, buyer_total, tax_rule_id, tax_rate_snapshot, tax_base_snapshot,
        promotion_code_snapshot, buyer_snapshot, destination_snapshot, bank_account_masked, issued_by)
      values ('${I.proforma}', '${I.orderV1}', 1, 'ISSUED', '2026-09-25 10:00:00+00', '2026-09-26 10:00:00+00', 24, 'USD',
        900.00, 56.00, 844.00, 25.00, 42.20, 911.20, '${E.taxRule}', 5.0000, 'MERCHANDISE_ONLY', 'T037PROMO',
        ${q(JSON.stringify({ legal_name: "T037 Buyer Legal LLC", display_name: "T037 Buyer", tax_number: "T037-TRN-100200300", country_code: "AE" }))}::jsonb,
        ${q(JSON.stringify({ label: "T037", country_code: "AE", city: "Dubai", address_lines: ["T037 Harbour Road 17"], contact_name: "T037 Receiver", contact_phone: "+971500000037", delivery_method: "Courier" }))}::jsonb,
        ${q(JSON.stringify({ bank_name: "T037 Bank", account_name: "Hills Coffee T037", swift_code: "T037AEAD", account_number_last4: "****7890", iban_last4: "****7890" }))}::jsonb,
        '${E.buyerUser}');`,
    // Groups: member seller S (warehouse W) shipping 10.00, merchandise 644.00; Hills H shipping 15.00, merchandise 200.00.
    groups: `insert into public.proforma_fulfillment_groups (id, proforma_id, seller_organization_id, warehouse_id, group_key, shipping_rule_id, delivery_method, shipping_amount, shipping_vat_amount, merchandise_net_amount) values
        ('${I.groupS}', '${I.proforma}', '${E.memberSellerOrg}', '${E.warehouse}', '${E.memberSellerOrg}:${E.warehouse}', '${I.shippingRule}', 'Courier', 10.00, 0, 644.00),
        ('${I.groupH}', '${I.proforma}', '${E.hillsOrg}', '${E.warehouse}', '${E.hillsOrg}:${E.warehouse}', '${I.shippingRule}', 'Courier', 15.00, 0, 200.00);`,
    // L1 member: 100 × 5 = 500.00, seller 10 % → 50.00 (SELLER), net 450.00, VAT 22.50.
    // L2 member: 20 × 10 = 200.00, platform 1.00/kg raw 20.00 capped at commission_on_gross 6.00 (HILLS), net 194.00, VAT 9.70.
    // L3 Hills:  40 × 5 = 200.00, no promotion, net 200.00, VAT 10.00.
    lines: `insert into public.proforma_invoice_items (id, proforma_id, order_item_id, description, quantity_kg, unit_price, amount, offer_id, offer_code_snapshot,
        seller_organization_id, seller_type_snapshot, warehouse_id, fulfillment_group_id, list_unit_price, gross_amount, promotion_id, promotion_scope_snapshot,
        promotion_funding_source, promotion_code_applied, promotion_rule_snapshot, promotion_raw_amount, discount_amount, discount_capped, discount_cap_reason,
        net_amount, vat_amount, line_total, product_name_snapshot, origin_name_snapshot, lot_code_snapshot) values
      ('${I.line1}', '${I.proforma}', '${I.orderItem1}', 'T037 line 1', 100, 5, 450.00, '${E.offerLine1}', 'LST-0000003', '${E.memberSellerOrg}', 'MEMBER_SELLER', '${E.warehouse}', '${I.groupS}', 5, 500.00,
        '${I.promoSeller}', 'SELLER', 'SELLER', true, '{"type":"PERCENT","value":10}', 50.00, 50.00, false, null, 450.00, 22.50, 472.50, 'T037 coffee', null, 'T037-L1'),
      ('${I.line2}', '${I.proforma}', '${I.orderItem2}', 'T037 line 2', 20, 10, 194.00, '${E.offerLine2}', 'LST-0000005', '${E.memberSellerOrg}', 'MEMBER_SELLER', '${E.warehouse}', '${I.groupS}', 10, 200.00,
        '${I.promoHills}', 'PLATFORM', 'HILLS', false, '{"type":"AMOUNT_PER_KG","value":1}', 20.00, 6.00, true, 'HILLS_COMMISSION', 194.00, 9.70, 203.70, 'T037 coffee', null, 'T037-L2'),
      ('${I.line3}', '${I.proforma}', '${I.orderItem3}', 'T037 line 3', 40, 5, 200.00, '${E.offerLine3}', 'LST-0000002', '${E.hillsOrg}', 'HILLS', '${E.warehouse}', '${I.groupH}', 5, 200.00,
        null, null, null, null, null, null, 0, false, null, 200.00, 10.00, 210.00, 'T037 coffee', null, 'T037-L3');`,
    // Q_S = 120 kg (the member seller's own lines) → tier 3 %.
    economics: `insert into public.proforma_line_economics (proforma_item_id, proforma_id, seller_organization_id, seller_type_snapshot, commission_policy_id, commission_tier_id,
        commission_rate_snapshot, seller_qualifying_quantity_kg, gross_amount, seller_funded_discount, hills_funded_discount, commission_on_gross, commission_basis,
        commission_amount, seller_net_amount, hills_share_amount, buyer_net_amount) values
      ('${I.line1}', '${I.proforma}', '${E.memberSellerOrg}', 'MEMBER_SELLER', '${I.policy}', '${I.tier}', 3, 120, 500.00, 50.00, 0, 15.00, 450.00, 13.50, 436.50, 13.50, 450.00),
      ('${I.line2}', '${I.proforma}', '${E.memberSellerOrg}', 'MEMBER_SELLER', '${I.policy}', '${I.tier}', 3, 120, 200.00, 0, 6.00, 6.00, 200.00, 6.00, 194.00, 0, 194.00),
      ('${I.line3}', '${I.proforma}', '${E.hillsOrg}', 'HILLS', null, null, null, null, 200.00, 0, 0, 0, 0, 0, 0, 200.00, 200.00);`,
    settlements: `insert into public.proforma_seller_settlements (proforma_id, seller_organization_id, seller_type_snapshot, seller_qualifying_quantity_kg, commission_policy_id,
        commission_tier_id, commission_rate_snapshot, gross_amount, seller_funded_discount, hills_funded_discount, commission_basis, commission_amount, seller_net_amount,
        hills_share_amount, buyer_net_amount) values
      ('${I.proforma}', '${E.memberSellerOrg}', 'MEMBER_SELLER', 120, '${I.policy}', '${I.tier}', 3, 700.00, 50.00, 6.00, 650.00, 19.50, 630.50, 13.50, 644.00),
      ('${I.proforma}', '${E.hillsOrg}', 'HILLS', null, null, null, null, 200.00, 0, 0, 0, 0, 0, 200.00, 200.00);`,
    bank: `insert into public.proforma_bank_instructions (proforma_id, payment_account_id, account_name, bank_name, account_number, iban, swift_code, currency, payment_reference)
      values ('${I.proforma}', '${I.account}', 'Hills Coffee T037', 'T037 Bank', 'T037-ACC-1234567890', 'AE07T037000000001234567890', 'T037AEAD', 'USD',
        (select order_code from public.orders where id = '${I.orderV1}') || ' / ' || (select proforma_code from public.proforma_invoices where id = '${I.proforma}'));`,
    financials: `insert into public.order_financials (order_id, base_subtotal, shipping_amount, vat_amount, commission_amount, seller_net_amount, buyer_total_amount, total_quantity_kg,
        tax_rule_id, tax_percentage_snapshot, tax_base_snapshot, proforma_id, discount_amount, seller_funded_discount, hills_funded_discount, hills_share_amount)
      values ('${I.orderV1}', 900.00, 25.00, 42.20, 19.50, 630.50, 911.20, 160, '${E.taxRule}', 5.0000, 'MERCHANDISE_ONLY', '${I.proforma}', 56.00, 50.00, 6.00, 213.50);`,
  };
  for (const [k, v] of Object.entries(over) as [SnapshotPart, string | ((s: string) => string)][]) s[k] = typeof v === "function" ? v(s[k]) : v;
  return Object.values(s).join("\n");
}
type SnapshotPart = "header" | "groups" | "lines" | "economics" | "settlements" | "bank" | "financials";

const internal = (on: boolean) => `perform set_config('app.internal_transition', '${on}', true);`;

/** A case whose statements must be REFUSED with an error containing `expect` (message, detail or constraint). */
function refused(name: string, body: string, expect: string, opts: { internal?: boolean; immediate?: boolean; regex?: boolean } = {}): string {
  return `
  begin
    set constraints all deferred;
    ${internal(opts.internal ?? false)}
    ${body}
    ${opts.immediate === false ? "" : "set constraints all immediate;"}
    raise exception 'T037_NO_ERROR';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail, v_constraint = constraint_name;
    v_got := sqlerrm || coalesce(' | ' || nullif(v_detail, ''), '') || coalesce(' | constraint ' || nullif(v_constraint, ''), '');
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'ok', sqlerrm <> 'T037_NO_ERROR' and ${opts.regex ? `v_got ~ ${q(expect)}` : `position(${q(expect)} in v_got) > 0`}, 'got', v_got));
  end;
  ${internal(false)}`;
}

/** A case whose statements must SUCCEED (then undone). */
function accepted(name: string, body: string, opts: { internal?: boolean } = {}): string {
  return `
  begin
    set constraints all deferred;
    ${internal(opts.internal ?? false)}
    ${body}
    set constraints all immediate;
    raise exception 'T037_UNDO';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'ok', sqlerrm = 'T037_UNDO', 'got', sqlerrm || coalesce(' | ' || nullif(v_detail, ''), '')));
  end;
  ${internal(false)}`;
}

/** A boolean assertion evaluated in the outer transaction. */
const check = (name: string, condition: string, got = "null") =>
  `r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'ok', coalesce((${condition}), false), 'got', (${got})::text));`;

export function buildT037ProofSql(): string {
  const orderInsert = (id: string, flow: string) =>
    `insert into public.orders (id, buyer_organization_id, created_by, status, commerce_flow, correlation_id) values ('${id}', '${E.buyerOrg}', '${E.buyerUser}', 'DRAFT', '${flow}', '${I.marker}');`;
  const itemInsert = (id: string, order: string, offer: string, qty: number) =>
    `insert into public.order_items (id, order_id, offer_id, lot_id, seller_organization_id, quantity_kg, unit_price_per_kg, product_name_snapshot, lot_code_snapshot, seller_type_snapshot)
       select '${id}', '${order}', o.id, o.lot_id, o.seller_organization_id, ${qty}, o.price_per_kg, 'T037', 'T037', o.seller_type from public.coffee_offers o where o.id = '${offer}';`;
  const readyShipment = (id: string, order: string, item: string, qty: number) => `
    insert into public.order_shipments (id, order_id, delivery_method, country_code, address_line, contact_name, contact_phone, created_by, shipping_fee)
      values ('${id}', '${order}', 'Courier', 'AE', 'Fixture address', 'Fixture contact', '+971500000000', '${E.buyerUser}', 12.50);
    insert into public.shipment_items (shipment_id, order_item_id, planned_quantity_kg) values ('${id}', '${item}', ${qty});
    ${internal(true)}
    update public.order_shipments set status = 'READY' where id = '${id}';
    ${internal(false)}
    update public.orders set status = 'CONFIRMED' where id = '${order}';`;
  const asBuyer = `perform set_config('request.jwt.claims', ${q(JSON.stringify({ sub: E.buyerUser, role: "authenticated" }))}, true);`;
  const noUser = `perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);`;

  return `do $t037$
declare
  r jsonb := '[]'::jsonb;
  v_detail text;
  v_constraint text;
  v_got text;
  v_audit_start bigint := coalesce((select max(id) from public.audit_logs), 0);
  v_res jsonb;
  v_res2 jsonb;
  v_offer_reserved numeric;
  v_position_reserved numeric;
  v_count bigint;
begin
  -- 0. Safety: production must be exactly the post-M2b state this proof expects.
  if exists (select 1 from public.orders where id in ('${I.orderV1}', '${I.orderLegacy}', '${I.orderRecheck}'))
     or exists (select 1 from public.proforma_invoices where validity_hours_snapshot is not null)
     or exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
     or to_regclass('public.proforma_line_economics') is null then
    raise exception 'T037_PRECONDITION_FAILED';
  end if;
  select reserved_quantity_kg into v_offer_reserved from public.coffee_offers where id = '${E.offerLine3}';
  select reserved_quantity_kg into v_position_reserved from public.inventory_positions where id = '${E.legacyPosition}';

  -- 1. Fixtures (all rolled back at the end).
  ${orderInsert(I.orderV1, "BANK_TRANSFER_V1")}
  ${itemInsert(I.orderItem1, I.orderV1, E.offerLine1, 100)}
  ${itemInsert(I.orderItem2, I.orderV1, E.offerLine2, 20)}
  ${itemInsert(I.orderItem3, I.orderV1, E.offerLine3, 40)}
  ${orderInsert(I.orderLegacy, "LEGACY")}
  ${itemInsert(I.orderItemLegacy, I.orderLegacy, E.offerLine3, 2)}
  ${readyShipment(I.shipmentLegacy, I.orderLegacy, I.orderItemLegacy, 2)}
  ${orderInsert(I.orderRecheck, "LEGACY")}
  ${itemInsert(I.orderItemRecheck, I.orderRecheck, E.offerLine3, 1)}
  ${readyShipment(I.shipmentRecheck, I.orderRecheck, I.orderItemRecheck, 1)}
  -- the re-checkout order already holds a VOID legacy proforma (the legacy upsert's UPDATE path)
  insert into public.proforma_invoices (id, order_id, status, valid_until) values ('${I.proformaRecheck}', '${I.orderRecheck}', 'VOID', now() - interval '3 days');

  -- 2. LEGACY checkout behaves exactly as before (the real checkout_order, as the buyer member).
  ${asBuyer}
  v_res := public.checkout_order('${I.orderLegacy}');
  v_res2 := public.checkout_order('${I.orderLegacy}');
  ${internal(false)}
  ${check("LEGACY checkout: order → HOLD with a 20-minute hold", `(select status = 'HOLD' and hold_expires_at = hold_started_at + interval '20 minutes' from public.orders where id = '${I.orderLegacy}')`, `(select status from public.orders where id = '${I.orderLegacy}')`)}
  ${check("LEGACY checkout: exactly one ISSUED legacy proforma (placeholder header, valid_until = hold expiry)", `(select count(*) = 1 and bool_and(p.status = 'ISSUED' and p.validity_hours_snapshot is null and p.version = 1 and p.buyer_total = 0 and p.valid_until = o.hold_expires_at) from public.proforma_invoices p join public.orders o on o.id = p.order_id where p.order_id = '${I.orderLegacy}')`)}
  ${check("LEGACY checkout: one legacy proforma line (2 kg × 5.00 = 10.00, no Feature 013 fields)", `(select count(*) = 1 and bool_and(i.quantity_kg = 2 and i.unit_price = 5 and i.amount = 10.00 and i.seller_type_snapshot is null) from public.proforma_invoice_items i join public.proforma_invoices p on p.id = i.proforma_id where p.order_id = '${I.orderLegacy}')`)}
  ${check("LEGACY checkout: order_financials legacy summary (base 10.00 + shipping 12.50 + VAT 0.50 = 23.00, no proforma pointer)", `(select base_subtotal = 10.00 and shipping_amount = 12.50 and vat_amount = 0.50 and buyer_total_amount = 23.00 and seller_net_amount = base_subtotal - commission_amount and proforma_id is null and discount_amount = 0 and hills_share_amount = 0 from public.order_financials where order_id = '${I.orderLegacy}')`)}
  ${check("LEGACY checkout: ACTIVE reservation of 2 kg, PENDING payment of 23.00", `(select count(*) = 1 from public.inventory_reservations r join public.inventory_reservation_items ri on ri.reservation_id = r.id where r.order_id = '${I.orderLegacy}' and r.status = 'ACTIVE' and ri.quantity_kg = 2) and (select count(*) = 1 and bool_and(status = 'PENDING' and amount = 23.00) from public.payments where order_id = '${I.orderLegacy}')`)}
  ${check("LEGACY checkout: listing and inventory position reserved +2 kg", `(select reserved_quantity_kg = v_offer_reserved + 2 from public.coffee_offers where id = '${E.offerLine3}') and (select reserved_quantity_kg = v_position_reserved + 2 from public.inventory_positions where id = '${E.legacyPosition}')`)}
  ${check("LEGACY checkout: a second call is the idempotent retry (same proforma)", `(v_res2 ->> 'idempotent_retry')::boolean and v_res2 ->> 'proforma_id' = v_res ->> 'proforma_id' and not (v_res ->> 'idempotent_retry')::boolean`, "v_res2")}
  ${asBuyer}
  v_res := public.checkout_order('${I.orderRecheck}');
  ${internal(false)}
  ${noUser}
  ${check("LEGACY re-checkout over an existing VOID proforma reuses the same row (VOID → ISSUED), no second row", `(select count(*) = 1 and bool_and(id = '${I.proformaRecheck}' and status = 'ISSUED') from public.proforma_invoices where order_id = '${I.orderRecheck}') and v_res ->> 'proforma_id' = '${I.proformaRecheck}'`, "v_res")}
  ${accepted("LEGACY: the admin_review_payment write (status → PAID) is still accepted", `update public.proforma_invoices set status = 'PAID' where order_id = '${I.orderLegacy}';`)}
  ${refused("LEGACY: a legacy proforma cannot acquire Feature 013 values", `update public.proforma_invoices set buyer_total = 5, merchandise_gross = 5, merchandise_net = 5 where order_id = '${I.orderLegacy}';`, "proforma_snapshot_immutable")}
  ${refused("LEGACY: a legacy line cannot acquire a Feature 013 marker", `update public.proforma_invoice_items set seller_type_snapshot = 'HILLS' where proforma_id = (select id from public.proforma_invoices where order_id = '${I.orderLegacy}');`, "snapshot_immutable")}

  -- 3. Deferred checks are really deferred: a zero-placeholder header alone is accepted at INSERT, refused at commit time.
  begin
    set constraints all deferred;
    insert into public.proforma_invoices (id, order_id, version, status, issued_at, valid_until, validity_hours_snapshot, tax_rule_id, tax_rate_snapshot, tax_base_snapshot,
      buyer_snapshot, destination_snapshot, bank_account_masked, issued_by)
      values ('${I.proforma}', '${I.orderV1}', 1, 'ISSUED', '2026-09-25 10:00:00+00', '2026-09-26 10:00:00+00', 24, '${E.taxRule}', 5, 'MERCHANDISE_ONLY',
        '{"legal_name":"x","display_name":"x","tax_number":null,"country_code":"AE"}', '{"label":"x","country_code":"AE","city":"x","address_lines":[],"contact_name":"x","contact_phone":"x","delivery_method":"Courier"}',
        '{"bank_name":"x","account_name":"x","swift_code":null,"account_number_last4":null,"iban_last4":"****1234"}', '${E.buyerUser}');
    r := r || jsonb_build_array(jsonb_build_object('case', 'deferred: a zero-placeholder Feature 013 header is accepted at INSERT time (the check is deferred)', 'ok', true, 'got', 'inserted'));
    set constraints all immediate;
    raise exception 'T037_NO_ERROR';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    r := r || jsonb_build_array(jsonb_build_object('case', 'deferred: … and refused when the deferred checks run (zero totals, no lines)', 'ok', sqlerrm = 'proforma_snapshot_unbalanced' and v_detail like '%no lines%', 'got', sqlerrm || ' | ' || coalesce(v_detail, '')));
  end;

  -- 4. Unbalanced / invalid snapshots are refused (each attempt rolled back to its savepoint).
  ${refused("zero-placeholder header over real lines is refused (never valid merely because the defaults are 0)", snapshot({ header: (h) => h.replace("900.00, 56.00, 844.00, 25.00, 42.20, 911.20", "0, 0, 0, 0, 0, 0") }), "header totals differ from the frozen lines and groups", { internal: true })}
  ${refused("a header total one cent off is refused", snapshot({ header: (h) => h.replace("42.20, 911.20", "42.21, 911.21") }), "header totals differ", { internal: true })}
  ${refused("FIN-007: a seller settlement that does not equal its lines is refused", snapshot({ settlements: (x) => x.replace("700.00, 50.00, 6.00, 650.00, 19.50, 630.50, 13.50, 644.00", "701.00, 50.00, 6.00, 651.00, 19.50, 631.50, 13.50, 645.00"), financials: (f) => f.replace("19.50, 630.50", "19.50, 631.50") }), "settlement amounts differ from the sum of the line economics", { internal: true })}
  ${refused("FIN-012: negative seller_net is refused", snapshot({ economics: (x) => x.replace("200.00, 0, 6.00, 6.00, 200.00, 6.00, 194.00, 0, 194.00", "200.00, 0, 6.00, 6.00, 200.00, 206.00, -6.00, 200.00, 194.00") }), "proforma_line_economics_amounts_nonnegative_check", { internal: true })}
  ${refused("FIN-012: negative hills_share is refused", snapshot({ economics: (x) => x.replace("200.00, 0, 6.00, 6.00, 200.00, 6.00, 194.00, 0, 194.00", "200.00, 0, 7.00, 6.00, 200.00, 6.00, 194.00, -1.00, 193.00") }), "proforma_line_economics_amounts_nonnegative_check", { internal: true })}
  ${refused("FIN-012: hills_funded_discount > commission_on_gross (7.00 > 6.00) is refused", snapshot({ economics: (x) => x.replace("200.00, 0, 6.00, 6.00, 200.00, 6.00, 194.00, 0, 194.00", "200.00, 0, 7.00, 6.00, 200.00, 6.00, 193.00, -1.00, 193.00") }), "proforma_line_economics_amounts_nonnegative_check", { internal: true })}
  ${refused("R-18/FIN-011: seller funding on a Hills line is refused", snapshot({ lines: (x) => x.replace("null, null, null, null, null, null, 0, false, null, 200.00, 10.00, 210.00", `'${I.promoSeller}', 'SELLER', 'SELLER', false, '{}', 10.00, 10.00, false, null, 190.00, 9.50, 199.50`) }), "proforma_invoice_items_hills_line_funding_check", { internal: true })}
  ${refused("FIN-011: a Hills-funded discount booked as seller-funded is refused (deferred cross-check)", snapshot({ economics: (x) => x.replace("200.00, 0, 6.00, 6.00, 200.00, 6.00, 194.00, 0, 194.00", "200.00, 6.00, 0, 6.00, 194.00, 5.82, 188.18, 5.82, 194.00"), settlements: (x) => x.replace("700.00, 50.00, 6.00, 650.00, 19.50, 630.50, 13.50, 644.00", "700.00, 56.00, 0, 644.00, 19.32, 624.68, 19.32, 644.00"), financials: (f) => f.replace("19.50, 630.50, 911.20", "19.32, 624.68, 911.20").replace("56.00, 50.00, 6.00, 213.50", "56.00, 56.00, 0, 219.32") }), "split a discount against its funding source", { internal: true })}
  ${refused("FIN-013: Q_s taken from the whole order (160 kg) instead of the seller's own 120 kg is refused", snapshot({ economics: (x) => x.split("3, 120,").join("3, 160,"), settlements: (x) => x.replace("'MEMBER_SELLER', 120,", "'MEMBER_SELLER', 160,") }), "not the seller's own member-line quantity", { internal: true })}
  ${refused("missing bank instructions are refused", snapshot({ bank: "" }), "no bank instructions", { internal: true })}
  ${refused("a full account number in bank_account_masked is refused (last-4 only)", snapshot({ header: (h) => h.replace('"account_number_last4":"****7890"', '"account_number_last4":"T037-ACC-1234567890"') }), "proforma_invoices_bank_account_masked_check", { internal: true })}
  ${refused("order_financials that differ from the frozen proforma are refused", snapshot({ financials: (f) => f.replace("19.50, 630.50", "0, 0") }), "order_financials differs from the frozen proforma", { internal: true })}
  ${refused("missing order_financials (zero defaults) are refused", snapshot({ financials: "" }), "order_financials does not summarize this proforma", { internal: true })}
  ${refused("a Feature 013 proforma on a LEGACY order is refused", snapshot({ header: (h) => h.replace(`'${I.proforma}', '${I.orderV1}'`, `'${I.proforma}', '${I.orderLegacy}'`) }), "a LEGACY order cannot hold a Feature 013 proforma", { internal: true })}
  ${refused("BANK_TRANSFER_V1 order_financials outside the workflow are refused", snapshot(), "BANK_TRANSFER_V1 financials are written only by issue_proforma", { internal: false })}

  -- 5. The frozen snapshot: header, lines, groups, economics, settlements, bank instructions and order_financials.
  ${internal(true)}
  set constraints all deferred;
  ${snapshot()}
  set constraints all immediate;
  ${internal(false)}
  ${check("FROZEN: header totals 900.00 / 56.00 / 844.00 / 25.00 / 42.20 / 911.20 with the full snapshot marker", `(select merchandise_gross = 900 and discount_total = 56 and merchandise_net = 844 and shipping_total = 25 and vat_total = 42.20 and buyer_total = 911.20 and validity_hours_snapshot = 24 and valid_until = issued_at + interval '24 hours' from public.proforma_invoices where id = '${I.proforma}')`)}
  ${check("FROZEN: 3 lines, 3 line economics, 2 fulfillment groups, 2 seller settlements, 1 bank instruction, order_financials → proforma", `(select count(*) from public.proforma_invoice_items where proforma_id = '${I.proforma}') = 3 and (select count(*) from public.proforma_line_economics where proforma_id = '${I.proforma}') = 3 and (select count(*) from public.proforma_fulfillment_groups where proforma_id = '${I.proforma}') = 2 and (select count(*) from public.proforma_seller_settlements where proforma_id = '${I.proforma}') = 2 and (select count(*) from public.proforma_bank_instructions where proforma_id = '${I.proforma}') = 1 and (select proforma_id = '${I.proforma}' and base_subtotal = 900 and buyer_total_amount = 911.20 and hills_share_amount = 213.50 from public.order_financials where order_id = '${I.orderV1}')`)}
  ${check("FROZEN: the member seller's settlement carries the assignment (policy, tier 3 %, Q_s 120) and seller net 630.50", `(select commission_policy_id = '${I.policy}' and commission_tier_id = '${I.tier}' and commission_rate_snapshot = 3 and seller_qualifying_quantity_kg = 120 and seller_net_amount = 630.50 and hills_share_amount = 13.50 from public.proforma_seller_settlements where proforma_id = '${I.proforma}' and seller_organization_id = '${E.memberSellerOrg}')`)}

  -- 6. Immutability and the §7.2 lifecycle on the frozen snapshot.
  ${refused("UPDATE of a frozen header total is refused", `update public.proforma_invoices set buyer_total = 1 where id = '${I.proforma}';`, "proforma_snapshot_immutable", { internal: true, immediate: false })}
  ${refused("UPDATE of the frozen destination snapshot is refused", `update public.proforma_invoices set destination_snapshot = '{}' where id = '${I.proforma}';`, "proforma_snapshot_immutable", { internal: true, immediate: false })}
  ${[
    ["proforma_invoice_items", `id = '${I.line1}'`, "vat_amount = 0"],
    ["proforma_line_economics", `proforma_item_id = '${I.line1}'`, "gross_amount = 0"],
    ["proforma_fulfillment_groups", `id = '${I.groupS}'`, "shipping_amount = 0"],
    ["proforma_seller_settlements", `proforma_id = '${I.proforma}'`, "gross_amount = 0"],
    ["proforma_bank_instructions", `proforma_id = '${I.proforma}'`, "iban = 'X'"],
  ].map(([t, where, set]) => `${refused(`UPDATE ${t} is refused (append-only)`, `update public.${t} set ${set} where ${where};`, "snapshot_immutable", { internal: true, immediate: false })}
  ${refused(`DELETE ${t} is refused (append-only)`, `delete from public.${t} where ${where};`, "snapshot_immutable", { internal: true, immediate: false })}`).join("\n")}
  ${refused("DELETE of the Feature 013 proforma is refused", `delete from public.proforma_invoices where id = '${I.proforma}';`, "proforma_snapshot_immutable", { internal: true, immediate: false })}
  ${refused("deleting the BANK_TRANSFER_V1 order (cascade) is refused", `delete from public.orders where id = '${I.orderV1}';`, "never deleted|violates foreign key constraint|snapshot_immutable|order_financials_frozen", { internal: true, immediate: false, regex: true })}
  ${refused("adding a fulfillment group to the issued proforma later is refused", `insert into public.proforma_fulfillment_groups (proforma_id, seller_organization_id, warehouse_id, group_key, shipping_rule_id, delivery_method, shipping_amount, shipping_vat_amount, merchandise_net_amount) values ('${I.proforma}', '${E.buyerOrg}', '${E.warehouse}', '${E.buyerOrg}:${E.warehouse}', '${I.shippingRule}', 'Courier', 0, 0, 0);`, "proforma_snapshot_unbalanced")}
  ${refused("ISSUED → CONFIRMED outside the workflow is refused", `update public.proforma_invoices set status = 'CONFIRMED', confirmed_at = now(), confirmed_by = '${E.buyerUser}' where id = '${I.proforma}';`, "proforma status changes only through the commerce workflow", { immediate: false })}
  ${accepted("ISSUED → CONFIRMED → PAID by the workflow is accepted", `update public.proforma_invoices set status = 'CONFIRMED', confirmed_at = now(), confirmed_by = '${E.buyerUser}' where id = '${I.proforma}'; update public.proforma_invoices set status = 'PAID' where id = '${I.proforma}';`, { internal: true })}
  ${refused("ISSUED → PAID is not a §7.2 transition", `update public.proforma_invoices set status = 'PAID', confirmed_at = now(), confirmed_by = '${E.buyerUser}' where id = '${I.proforma}';`, "proforma_transition_invalid", { internal: true, immediate: false })}
  ${refused("a replacement while v1 is still ISSUED is refused", `insert into public.proforma_invoices (id, order_id, version, supersedes_proforma_id, status, issued_at, valid_until, validity_hours_snapshot, tax_rule_id, tax_rate_snapshot, tax_base_snapshot, buyer_snapshot, destination_snapshot, bank_account_masked, issued_by) select '${I.proformaV2}', order_id, 2, id, 'ISSUED', issued_at, valid_until, validity_hours_snapshot, tax_rule_id, tax_rate_snapshot, tax_base_snapshot, buyer_snapshot, destination_snapshot, bank_account_masked, issued_by from public.proforma_invoices where id = '${I.proforma}';`, "a replacement supersedes the closed previous version", { internal: true, immediate: false })}
  ${refused("order_financials are frozen once the order leaves PROFORMA_ISSUED", `update public.orders set status = 'PROFORMA_ISSUED' where id = '${I.orderV1}'; update public.orders set status = 'HOLD', hold_expires_at = now() + interval '20 minutes' where id = '${I.orderV1}'; update public.order_financials set vat_amount = vat_amount where order_id = '${I.orderV1}';`, "order_financials_frozen", { internal: true, immediate: false })}
  ${refused("BANK_TRANSFER_V1 order_financials are never deleted", `delete from public.order_financials where order_id = '${I.orderV1}';`, "order_financials_frozen", { internal: true, immediate: false })}
  ${refused("the order proforma pointer cannot be set outside the workflow", `update public.orders set current_proforma_id = '${I.proforma}' where id = '${I.orderV1}';`, "order_field_not_client_writable", { immediate: false })}
  ${refused("service_role cannot write a snapshot table (read-only grant)", `set local role service_role; insert into public.proforma_line_economics default values;`, "permission denied", { immediate: false })}
  ${refused("authenticated cannot read a snapshot table (no grant/policy until M3)", `set local role authenticated; perform 1 from public.proforma_bank_instructions;`, "permission denied", { immediate: false })}
  ${refused("anon cannot read a snapshot table", `set local role anon; perform 1 from public.proforma_seller_settlements;`, "permission denied", { immediate: false })}
  reset role;

  -- 7. AUD-006 / T029 R2: nothing M2b wrote to audit_logs contains a raw bank value, the buyer address/phone or buyer tax/legal data.
  select count(*) into v_count from public.audit_logs where id > v_audit_start;
  ${check("AUDIT: the redacted proforma header and bank-instruction audit rows were written (last-4 only)", `exists (select 1 from public.audit_logs where id > v_audit_start and entity_type = 'proforma_invoices' and entity_id = '${I.proforma}') and exists (select 1 from public.audit_logs where id > v_audit_start and entity_type = 'proforma_bank_instructions' and entity_id = '${I.proforma}' and new_data ->> 'account_number_last4' = '****7890' and new_data ->> 'iban_last4' = '****7890')`, "v_count")}
  ${check("AUDIT: no audit row written in this proof contains a raw account number, IBAN, address, phone, buyer tax number/legal name or promotion code", `not exists (select 1 from public.audit_logs a where a.id > v_audit_start and (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '') || a.metadata::text) ~ ${q(T037_SECRETS.map((s) => s.replace(/[.+*?()[\]{}^$|\\]/g, "\\$&")).join("|"))})`, `(select string_agg(distinct entity_type, ',') from public.audit_logs where id > v_audit_start)`)}
  ${check("AUDIT: no generic write_audit_log trigger exists on any proforma table or order_financials", `not exists (select 1 from pg_trigger where tgfoid = 'public.write_audit_log()'::regprocedure and tgrelid::regclass::text in ('proforma_invoices', 'proforma_invoice_items', 'proforma_line_economics', 'proforma_fulfillment_groups', 'proforma_seller_settlements', 'proforma_bank_instructions', 'order_financials'))`)}

  -- 8. Always roll back: the result travels in the exception message.
  raise exception 'T037_RESULT:%', replace(encode(convert_to(r::text, 'UTF8'), 'base64'), chr(10), '');
end
$t037$;`;
}

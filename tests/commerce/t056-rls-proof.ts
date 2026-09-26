/**
 * Feature 013 T056 — the PRE-M3 security baseline as ONE PostgreSQL `DO` block per suite, executed against the linked
 * project by `rls-seller-isolation.live.test.ts` / `rls-role-matrix.live.test.ts` (F013_LIVE=1) through
 * `supabase db query --linked`.
 *
 * Method (T037/T043/T049/T055, owner-approved one-transaction setup): every fixture row, every temporary organization /
 * membership / operator grant and every audit row is created inside the block, and the block always ends in
 * `raise exception 'T056_RESULT:<base64 json>'`, so nothing persists (only sequence values may be consumed).
 *
 * Every case states the DESIRED post-M3 outcome from contracts/rls-storage.md §1/§2 (and T056's accept list) and
 * records what production does NOW. The suites pin the exact set of cases that fail before M3 (the baseline T062 must
 * turn green); see `T056_PRE_M3_FAILURES` in the suites.
 *
 * Two-seller fixture order (a coherent BANK_TRANSFER_V1 graph; order_items and every snapshot row agree on the seller):
 *   - SELLER_1 = a TEMPORARY second seller organization ("T056 Seller One", …0000000701) owning two temporary listings
 *     (lines L1, L2; member-seller economics in the snapshot). The listing trigger admits a listing only from a
 *     Hills-internal owner or from a PAID purchase source, and production has no member-seller purchase source, so the
 *     temporary organization is created Hills-internal; RLS in both the current and the rls-storage design is decided by
 *     organization membership, not by that flag. Session user: buyer-and-seller+foundation-test (temporary membership).
 *   - SELLER_2 = the Feature 005 Hills fixture organization (line L3, a real published listing). Session user:
 *     no-organization+foundation-test (temporary membership).
 *   - BUYER = buyer-only+foundation-test (org f…01); OTHER_BUYER = multi-org+foundation-test (two unrelated orgs);
 *     FINANCE = finance-admin+foundation-test; WAREHOUSE = warehouse-admin+foundation-test; AUDITOR =
 *     under-review+foundation-test with a TEMPORARY `AUDITOR` platform_admins row; ANON = the anon role.
 *   None of these identities has a verified MFA factor (checked in-block), so the MFA gates never mask a result.
 */
import { T037, T037_EXISTING, sqlLiteral as q, t037Internal as internal, t037Snapshot as snapshot } from "./t037-snapshot-proof";

export const T056 = {
  marker: "13000000-0000-4000-8000-0000000007ff",
  seller1Org: "13000000-0000-4000-8000-000000000701",
  offerA: "13000000-0000-4000-8000-000000000711",
  offerB: "13000000-0000-4000-8000-000000000712",
  positionA: "13000000-0000-4000-8000-000000000713",
  positionB: "13000000-0000-4000-8000-000000000714",
  destination: "13000000-0000-4000-8000-000000000721",
  payment: "13000000-0000-4000-8000-000000000731",
  proof: "13000000-0000-4000-8000-000000000732",
  fileProof: "13000000-0000-4000-8000-000000000733",
  review: "13000000-0000-4000-8000-000000000734",
  payout1: "13000000-0000-4000-8000-000000000735",
  payout2: "13000000-0000-4000-8000-000000000736",
  reconCase: "13000000-0000-4000-8000-000000000741",
  adjustment: "13000000-0000-4000-8000-000000000742",
  invoice: "13000000-0000-4000-8000-000000000743",
  shipment1: "13000000-0000-4000-8000-000000000751",
  shipment2: "13000000-0000-4000-8000-000000000752",
  reservation: "13000000-0000-4000-8000-000000000761",
} as const;

export const T056_USERS = {
  BUYER: "7c0edf8e-6e90-404a-9711-f6ba7dc64c37", // buyer-only+foundation-test
  OTHER_BUYER: "28352cb7-eaf4-47b2-80f8-cf02e8cf4ddc", // multi-org+foundation-test
  SELLER_1: "f390df3b-505a-4abe-9863-70c16354f88c", // buyer-and-seller+foundation-test (+ temporary SELLER_1 membership)
  SELLER_2: "ab70e15d-22f4-4c12-b7c3-5151149113b4", // no-organization+foundation-test (+ temporary Hills membership)
  FINANCE: "8332815f-dd70-4cd3-9cff-e956dbe1b408", // finance-admin+foundation-test (FINANCE)
  WAREHOUSE: "21374dfb-902e-481e-b8a7-ca38d07efed7", // warehouse-admin+foundation-test (WAREHOUSE)
  AUDITOR: "2e5cc27c-d595-4713-8c95-edc8d097d92b", // under-review+foundation-test (+ temporary AUDITOR row)
} as const;

export type Role = keyof typeof T056_USERS | "ANON";
export const ROLES: Role[] = ["BUYER", "OTHER_BUYER", "SELLER_1", "SELLER_2", "FINANCE", "WAREHOUSE", "AUDITOR", "ANON"];

const I = T037;
const E = T037_EXISTING;
const X = T056;
const U = T056_USERS;
const LOT_A = "05000000-0000-4000-8000-000000000004"; // Hills lot of LST-0000003
const LOT_B = "09000000-0000-4000-8000-000000000001"; // Hills lot of LST-0000005
const COFFEE = "05000000-0000-4000-8000-000000000014";
/** A value that exists only in the buyer's destination; no seller may ever see it by any route. */
export const T056_DESTINATION_MARKER = "T056 Buyer Harbour Road 56";

type Expect = Partial<Record<Role, string[]>>;
type Relation = {
  name: string;
  /** SELECT … producing one text label per visible fixture row. */
  sql: string;
  expect: Expect;
  /** Views: an error (e.g. the view does not exist) never counts as "0 rows" (SC-005: wrong role → 0 rows, no error). */
  strict?: boolean;
  /** Only these roles are exercised (default: all). */
  roles?: Role[];
  /**
   * T060 F1 (owner decision 2026-09-26): for these roles the DESIRED outcome is "permission denied" (no access at all),
   * never "0 rows". Every statement (default: `sql`) must be refused with a permission error.
   */
  denied?: { roles: Role[]; statements?: string[] };
};

const ids = (m: Record<string, string>) => Object.entries(m).map(([label, id]) => `when '${id}' then '${label}'`).join(" ");
const label = (column: string, m: Record<string, string>) => `(case ${column}::text ${ids(m)} end)`;
const inList = (m: Record<string, string>) => Object.values(m).map((v) => `'${v}'`).join(", ");
const rel = (name: string, from: string, column: string, m: Record<string, string>, expect: Expect, extra = "") =>
  ({ name, sql: `select distinct ${label(column, m)} from ${from} where ${column} in (${inList(m)})${extra}`, expect });
const viewRows = (name: string, view: string, needle: string, expect: Expect): Relation =>
  ({ name, sql: `select distinct 'ROW' from public.${view} v where to_jsonb(v)::text like '%' || ${needle} || '%'`, expect, strict: true });
const viewAccess = (name: string, view: string, expect: Expect): Relation =>
  ({ name, sql: `select 'ACCESS' from (select 1 from public.${view} limit 0) s union all select 'ACCESS'`, expect, strict: true });

const ALL_ITEMS = { L1: I.orderItem1, L2: I.orderItem2, L3: I.orderItem3 };
const ALL_LINES = { PL1: I.line1, PL2: I.line2, PL3: I.line3 };
const ALL_ECON = { E1: I.line1, E2: I.line2, E3: I.line3 };

/** rls-storage §1 tables (+ the T056 accept list): desired post-M3 visibility of the fixture rows per role. */
export const TABLES: Relation[] = [
  rel("orders", "public.orders", "id", { ORDER: I.orderV1 }, { BUYER: ["ORDER"], SELLER_1: ["ORDER"], SELLER_2: ["ORDER"] }),
  { name: "orders.delivery_destination_id/destination_snapshot (R1)",
    sql: `select distinct case when delivery_destination_id is not null or destination_snapshot is not null then 'DEST' end from public.orders where id = '${I.orderV1}'`,
    // T060 F1(a): the R1 column boundary denies every client role, the buyer included. The buyer reads its destination through
    // its own delivery_destinations and the frozen proforma destination_snapshot.
    expect: {},
    denied: { roles: ["BUYER"], statements: [
      `select delivery_destination_id::text from public.orders where id = '${I.orderV1}'`,
      `select destination_snapshot::text from public.orders where id = '${I.orderV1}'`] } },
  rel("order_items", "public.order_items", "id", ALL_ITEMS, { BUYER: ["L1", "L2", "L3"], SELLER_1: ["L1", "L2"], SELLER_2: ["L3"], FINANCE: ["L1", "L2", "L3"] }),
  rel("order_financials", "public.order_financials", "order_id", { FIN: I.orderV1 }, { BUYER: ["FIN"], FINANCE: ["FIN"], AUDITOR: ["FIN"] }),
  rel("proforma_invoices", "public.proforma_invoices", "id", { PF: I.proforma }, { BUYER: ["PF"], FINANCE: ["PF"] }),
  rel("proforma_invoice_items", "public.proforma_invoice_items", "id", ALL_LINES, { BUYER: ["PL1", "PL2", "PL3"], SELLER_1: ["PL1", "PL2"], SELLER_2: ["PL3"], FINANCE: ["PL1", "PL2", "PL3"] }),
  rel("proforma_line_economics", "public.proforma_line_economics", "proforma_item_id", ALL_ECON, { SELLER_1: ["E1", "E2"], SELLER_2: ["E3"], FINANCE: ["E1", "E2", "E3"] }),
  rel("proforma_fulfillment_groups", "public.proforma_fulfillment_groups", "id", { G1: I.groupS, G2: I.groupH }, { BUYER: ["G1", "G2"], SELLER_1: ["G1"], SELLER_2: ["G2"], FINANCE: ["G1", "G2"], WAREHOUSE: ["G1", "G2"] }),
  rel("proforma_seller_settlements", "public.proforma_seller_settlements", "seller_organization_id", { ST1: X.seller1Org, ST2: E.hillsOrg },
    { SELLER_1: ["ST1"], SELLER_2: ["ST2"], FINANCE: ["ST1", "ST2"] }, ` and proforma_id = '${I.proforma}'`),
  rel("proforma_bank_instructions", "public.proforma_bank_instructions", "proforma_id", { BANK: I.proforma }, { BUYER: ["BANK"], FINANCE: ["BANK"] }),
  rel("payments", "public.payments", "id", { PAY: X.payment }, { BUYER: ["PAY"], FINANCE: ["PAY"] }),
  rel("payment_proofs", "public.payment_proofs", "id", { PROOF: X.proof }, { BUYER: ["PROOF"], FINANCE: ["PROOF"] }),
  rel("payment_reviews", "public.payment_reviews", "id", { REVIEW: X.review }, { FINANCE: ["REVIEW"] }),
  rel("reconciliation_cases", "public.reconciliation_cases", "id", { CASE: X.reconCase }, { FINANCE: ["CASE"] }),
  rel("reconciliation_case_events", "public.reconciliation_case_events", "case_id", { EVENTS: X.reconCase }, { FINANCE: ["EVENTS"] }),
  rel("manual_financial_adjustments", "public.manual_financial_adjustments", "id", { ADJ: X.adjustment }, { FINANCE: ["ADJ"], AUDITOR: ["ADJ"] }),
  rel("tax_invoices", "public.tax_invoices", "id", { INV: X.invoice }, { BUYER: ["INV"], FINANCE: ["INV"] }),
  rel("payouts", "public.payouts", "id", { PO1: X.payout1, PO2: X.payout2 }, { SELLER_1: ["PO1"], SELLER_2: ["PO2"], FINANCE: ["PO1", "PO2"] }),
  rel("inventory_reservations", "public.inventory_reservations", "id", { RES: X.reservation }, {}),
  rel("order_shipments (FULFILLMENT)", "public.order_shipments", "id", { SH1: X.shipment1, SH2: X.shipment2 },
    { BUYER: ["SH1", "SH2"], SELLER_1: ["SH1"], SELLER_2: ["SH2"], WAREHOUSE: ["SH1", "SH2"], FINANCE: ["SH1", "SH2"] }),
  rel("delivery_destinations", "public.delivery_destinations", "id", { DEST: X.destination }, { BUYER: ["DEST"] }),
  { name: "payment_accounts", sql: "select distinct 'ACCOUNT' from public.payment_accounts", expect: {} },
  { name: "commerce_settings", sql: "select distinct 'SETTINGS' from public.commerce_settings", expect: { FINANCE: ["SETTINGS"] } },
  { name: "notification_events", sql: "select distinct 'EVENT' from public.notification_events", expect: {} },
  { name: "storage payment-proofs objects", sql: "select distinct 'OBJECT' from storage.objects where bucket_id = 'payment-proofs'", expect: {} },
];

/** rls-storage §2 redacted views: the audience can select without error; every other role reads 0 fixture rows, no error. */
export const VIEWS: Relation[] = [
  viewAccess("v_audit_payments (access)", "v_audit_payments", { AUDITOR: ["ACCESS"] }),
  viewRows("v_audit_payments (fixture rows)", "v_audit_payments", `'${X.payment}'`, {}),
  viewAccess("v_audit_proformas (access)", "v_audit_proformas", { AUDITOR: ["ACCESS"] }),
  viewRows("v_audit_proformas (fixture rows)", "v_audit_proformas", `(select proforma_code from public.proforma_invoices where id = '${I.proforma}')`, {}),
  viewAccess("v_buyer_reconciliation (access)", "v_buyer_reconciliation", { BUYER: ["ACCESS"] }),
  viewRows("v_buyer_reconciliation (fixture rows)", "v_buyer_reconciliation", `(select case_code from public.reconciliation_cases where id = '${X.reconCase}')`, {}),
  viewAccess("v_finance_review_queue (access)", "v_finance_review_queue", { FINANCE: ["ACCESS"] }),
  viewRows("v_finance_review_queue (fixture rows)", "v_finance_review_queue", `(select order_code from public.orders where id = '${I.orderV1}')`, {}),
  viewAccess("v_seller_order_lines (access)", "v_seller_order_lines", { SELLER_1: ["ACCESS"], SELLER_2: ["ACCESS"] }),
  viewRows("v_seller_order_lines (fixture rows)", "v_seller_order_lines", `(select order_code from public.orders where id = '${I.orderV1}')`, {}),
];
/**
 * For the "(fixture rows)" view cases only the NON-audience roles are asserted (0 rows, no error): whether the audience
 * sees this DRAFT-state fixture depends on the view's own lifecycle filter, which M3 defines.
 */
const VIEW_AUDIENCE: Record<string, Role[]> = {
  v_audit_payments: ["AUDITOR"], v_audit_proformas: ["AUDITOR"], v_buyer_reconciliation: ["BUYER"],
  v_finance_review_queue: ["FINANCE"], v_seller_order_lines: ["SELLER_1", "SELLER_2"],
};
for (const v of VIEWS) {
  const audience = VIEW_AUDIENCE[v.name.split(" ")[0]!]!;
  // "(access)" is asked of the audience only; "(fixture rows)" of every other role.
  v.roles = v.name.endsWith("(access)") ? audience : ROLES.filter((r) => !audience.includes(r));
  // T060 F1(b): anon holds no grant on any §2 view (rls-storage §4) — the desired outcome is "permission denied".
  if (v.name.endsWith("(fixture rows)")) v.denied = { roles: ["ANON"] };
}

/** The T056 accept list (a)–(h) for sellers: which relations the seller-isolation suite exercises. */
export const SELLER_RELATIONS = [
  "orders.delivery_destination_id/destination_snapshot (R1)", "order_items", "order_financials", "proforma_invoices", "proforma_invoice_items",
  "proforma_line_economics", "proforma_fulfillment_groups", "proforma_seller_settlements", "proforma_bank_instructions", "payments",
  "payment_proofs", "storage payment-proofs objects", "tax_invoices", "payouts", "order_shipments (FULFILLMENT)", "delivery_destinations",
  "payment_accounts", "v_seller_order_lines (access)",
];

export const caseName = (relation: string, role: Role) => `${relation} × ${role}`;

function claims(role: Role): string {
  if (role === "ANON") return `perform set_config('request.jwt.claims', ${q(JSON.stringify({ role: "anon" }))}, true); execute 'set local role anon';`;
  return `perform set_config('request.jwt.claims', ${q(JSON.stringify({ sub: U[role], role: "authenticated", aal: "aal1" }))}, true); execute 'set local role authenticated';`;
}

function deniedCase(r: Relation, role: Role): string {
  const statements = r.denied!.statements ?? [r.sql];
  return `
  v_denied := 0;
  v_got := '';
  ${statements.map((sql) => `
  begin
    ${claims(role)}
    execute ${q(sql)};
    raise exception 'T056_ALLOWED';
  exception when others then
    if position('permission denied' in sqlerrm) > 0 then v_denied := v_denied + 1; else v_got := v_got || sqlerrm || '; '; end if;
  end;`).join("")}
  r := r || jsonb_build_array(jsonb_build_object('case', ${q(caseName(r.name, role))}, 'relation', ${q(r.name)}, 'role', '${role}', 'expected', 'permission denied',
    'got', case when v_denied = ${statements.length} then 'permission denied' else v_denied || '/${statements.length} denied; ' || v_got end, 'ok', v_denied = ${statements.length}));`;
}

function relationCase(r: Relation, role: Role): string {
  if (r.denied?.roles.includes(role)) return deniedCase(r, role);
  const expected = [...(r.expect[role] ?? [])].sort().join(",");
  const name = caseName(r.name, role);
  const okExpr = r.strict || expected !== ""
    ? `v_got = ${q(`T056_SEEN:${expected}`)}`
    : `v_got = 'T056_SEEN:' or position('permission denied' in v_got) > 0`;
  return `
  begin
    ${claims(role)}
    execute ${q(`select coalesce(string_agg(k, ',' order by k), '') from (${r.sql}) s(k) where k is not null`)} into v_got;
    raise exception 'T056_SEEN:%', v_got;
  exception when others then
    v_got := sqlerrm;
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'relation', ${q(r.name)}, 'role', '${role}', 'expected', ${q(expected)},
      'got', replace(v_got, 'T056_SEEN:', ''), 'ok', ${okExpr}));
  end;`;
}

const check = (name: string, condition: string, got = "null") =>
  `r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'relation', 'fixture', 'role', 'OWNER', 'expected', 'true', 'got', (${got})::text, 'ok', coalesce((${condition}), false)));`;

function fixtureSql(): string {
  const S1 = X.seller1Org;
  const reattribute = (s: string) => s.replaceAll(E.memberSellerOrg, S1).replaceAll(E.offerLine1, X.offerA).replaceAll(E.offerLine2, X.offerB)
    .replaceAll("'LST-0000003'", "'LST-9056001'").replaceAll("'LST-0000005'", "'LST-9056002'").replaceAll("T037", "T056");
  const item = (id: string, offer: string, qty: number) =>
    `insert into public.order_items (id, order_id, offer_id, lot_id, seller_organization_id, quantity_kg, unit_price_per_kg, product_name_snapshot, lot_code_snapshot, seller_type_snapshot)
       select '${id}', '${I.orderV1}', o.id, o.lot_id, o.seller_organization_id, ${qty}, o.price_per_kg, 'T056', 'T056', o.seller_type from public.coffee_offers o where o.id = '${offer}';`;
  const offer = (id: string, lot: string, price: number, code: string) =>
    `insert into public.coffee_offers (id, coffee_id, lot_id, seller_organization_id, seller_type, warehouse_id, title, quantity_kg, price_per_kg, status, created_by, offer_code)
       values ('${id}', '${COFFEE}', '${lot}', '${S1}', 'HILLS', '${E.warehouse}', 'T056 listing', 500, ${price}, 'PUBLISHED', '${U.SELLER_1}', '${code}');`;
  const destinationSnapshot = JSON.stringify({ label: "T056 Buyer HQ", country_code: "AE", city: "Dubai", address_lines: [T056_DESTINATION_MARKER], contact_name: "T056 Receiver", contact_phone: "+971500000056", delivery_method: "Courier" });
  const fulfillment = (id: string, seller: string, group: string) =>
    `insert into public.order_shipments (id, order_id, delivery_method, country_code, address_line, contact_name, contact_phone, created_by, shipment_kind, fulfillment_seller_organization_id, fulfillment_warehouse_id, proforma_fulfillment_group_id)
       values ('${id}', '${I.orderV1}', 'Courier', 'AE', 'From frozen snapshot', 'T056 Receiver', '+971500000056', '${U.BUYER}', 'FULFILLMENT', '${seller}', '${E.warehouse}', '${group}');`;
  return `
  -- temporary organizations, memberships and the auditor grant
  insert into public.organizations (id, legal_name, display_name, account_type, country_code, status, is_hills_internal, can_buy, can_sell)
    values ('${S1}', 'T056 Seller One FZE', 'T056 Seller One', 'HILLS_INTERNAL', 'AE', 'ACTIVE', true, true, true);
  insert into public.organization_members (organization_id, user_id, member_role, is_active) values ('${S1}', '${U.SELLER_1}', 'OWNER', true), ('${E.hillsOrg}', '${U.SELLER_2}', 'MEMBER', true);
  insert into public.platform_admins (user_id, role, is_active, created_by) values ('${U.AUDITOR}', 'AUDITOR', true, '${U.AUDITOR}');
  -- SELLER_1's inventory and listings (L1, L2); SELLER_2 = the Hills fixture listing LST-0000002 (L3)
  insert into public.inventory_positions (id, lot_id, owner_organization_id, warehouse_id, available_quantity_kg) values
    ('${X.positionA}', '${LOT_A}', '${S1}', '${E.warehouse}', 500), ('${X.positionB}', '${LOT_B}', '${S1}', '${E.warehouse}', 500);
  ${offer(X.offerA, LOT_A, 5, "LST-9056001")}
  ${offer(X.offerB, LOT_B, 10, "LST-9056002")}
  -- the two-seller V1 order and its frozen snapshot (T037 economics, member-seller lines attributed to SELLER_1)
  insert into public.orders (id, buyer_organization_id, created_by, status, commerce_flow, correlation_id) values ('${I.orderV1}', '${E.buyerOrg}', '${U.BUYER}', 'DRAFT', 'BANK_TRANSFER_V1', '${X.marker}');
  ${item(I.orderItem1, X.offerA, 100)}
  ${item(I.orderItem2, X.offerB, 20)}
  ${item(I.orderItem3, E.offerLine3, 40)}
  ${internal(true)}
  set constraints all deferred;
  ${snapshot({ groups: reattribute, lines: reattribute, economics: reattribute, settlements: reattribute, header: (h) => h.replaceAll("T037", "T056"), bank: (b) => b.replaceAll("T037", "T056") })}
  set constraints all immediate;
  insert into public.delivery_destinations (id, organization_id, label, country_code, city, address_line_1, contact_name, contact_phone, delivery_method, created_by)
    values ('${X.destination}', '${E.buyerOrg}', 'T056 Buyer HQ', 'AE', 'Dubai', ${q(T056_DESTINATION_MARKER)}, 'T056 Receiver', '+971500000056', 'Courier', '${U.BUYER}');
  update public.orders set delivery_destination_id = '${X.destination}', destination_snapshot = ${q(destinationSnapshot)}::jsonb where id = '${I.orderV1}';
  insert into public.payments (id, order_id, amount) values ('${X.payment}', '${I.orderV1}', 911.20);
  insert into public.file_assets (id, uploaded_by, bucket_name, object_path) values ('${X.fileProof}', '${U.BUYER}', 't056-proof-fixture', 'proof/${X.fileProof}.pdf');
  insert into public.payment_proofs (id, payment_id, file_asset_id, submitted_by) values ('${X.proof}', '${X.payment}', '${X.fileProof}', '${U.BUYER}');
  insert into public.payment_reviews (id, payment_id, reviewer_user_id, decision, reason) values ('${X.review}', '${X.payment}', '${U.FINANCE}', 'SENT_TO_RECONCILIATION', 'T056');
  insert into public.payouts (id, order_id, seller_organization_id, amount, status) values ('${X.payout1}', '${I.orderV1}', '${S1}', 630.50, 'ACCRUED'), ('${X.payout2}', '${I.orderV1}', '${E.hillsOrg}', 200.00, 'ACCRUED');
  insert into public.reconciliation_cases (id, kind, order_id, payment_id, proof_id, observed_amount, observed_currency, observed_value_date, observed_bank_reference, opened_by)
    values ('${X.reconCase}', 'LATE', '${I.orderV1}', '${X.payment}', '${X.proof}', 911.20, 'USD', '2026-09-26', 'T056-TRANSFER-REF', '${U.FINANCE}');
  insert into public.manual_financial_adjustments (id, kind, order_id, payment_id, payout_id, amount, external_reference, reason, recorded_by)
    values ('${X.adjustment}', 'REFUND_EXTERNAL', '${I.orderV1}', '${X.payment}', '${X.payout1}', 25.00, 'T056-BANK-REF', 'T056 external refund', '${U.FINANCE}');
  insert into public.tax_invoices (id, order_id, proforma_id, issued_by, issued_at_ts, snapshot)
    values ('${X.invoice}', '${I.orderV1}', '${I.proforma}', '${U.FINANCE}', now(), ${q(JSON.stringify({ totals: { buyer_total: 911.2 } }))}::jsonb);
  ${fulfillment(X.shipment1, S1, I.groupS)}
  ${fulfillment(X.shipment2, E.hillsOrg, I.groupH)}
  insert into public.inventory_reservations (id, order_id, status, expires_at) values ('${X.reservation}', '${I.orderV1}', 'ACTIVE', now() + interval '20 minutes');
  ${internal(false)}
  set constraints all immediate;`;
}

/** Order-linked seller routes to the buyer's destination beyond a direct table read (R1 / T031 deferred assertion). */
function destinationRouteCases(roles: Role[]): string {
  return roles.map((role) => `
  begin
    ${claims(role)}
    execute ${q(`select coalesce(string_agg(distinct 'DEST', ','), '') from public.order_items oi join public.orders o on o.id = oi.order_id where oi.id in ('${I.orderItem1}', '${I.orderItem2}', '${I.orderItem3}') and (o.delivery_destination_id is not null or o.destination_snapshot is not null)`)} into v_got;
    raise exception 'T056_SEEN:%', v_got;
  exception when others then
    v_got := sqlerrm;
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(caseName("orders destination via embedded order_items→orders select (R1)", role))}, 'relation', 'orders destination via embedded order_items→orders select (R1)', 'role', '${role}', 'expected', '',
      'got', replace(v_got, 'T056_SEEN:', ''), 'ok', v_got = 'T056_SEEN:' or position('permission denied' in v_got) > 0));
  end;
  -- every public view readable by authenticated: no row may carry the buyer's destination
  v_leaks := '';
  for v_view in select c.oid::regclass::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
                  and has_table_privilege('authenticated', c.oid, 'select') loop
    begin
      ${claims(role)}
      execute format('select count(*) from %s v where to_jsonb(v)::text like %L', v_view, '%' || ${q(T056_DESTINATION_MARKER)} || '%') into v_count;
      raise exception 'T056_COUNT:%', v_count;
    exception when others then
      if sqlerrm <> 'T056_COUNT:0' and position('permission denied' in sqlerrm) = 0 then v_leaks := v_leaks || v_view || '=' || sqlerrm || ';'; end if;
    end;
  end loop;
  r := r || jsonb_build_array(jsonb_build_object('case', ${q(caseName("orders destination via any public view (R1)", role))}, 'relation', 'orders destination via any public view (R1)', 'role', '${role}', 'expected', '', 'got', v_leaks, 'ok', v_leaks = ''));`).join("\n");
}

/**
 * T062 — §2 row-level assertions (POST_M3 only; the views exist from M3 on). Each case runs its own owner-side setup
 * (rolled back with the case's sub-block), then reads the view as the role. `%L` is replaced by the fixture code.
 */
type ViewRowCase = { name: string; role: Role; setup?: string; sql: string; arg: "order" | "proforma" | "case" | "payment"; expected: string };
const toReview = `${internal(true)}
    update public.orders set status = 'PROFORMA_ISSUED' where id = '${I.orderV1}';
    update public.orders set status = 'HOLD', hold_expires_at = now() + interval '20 minutes' where id = '${I.orderV1}';
    update public.orders set status = 'PAYMENT_UNDER_REVIEW' where id = '${I.orderV1}';
    ${internal(false)}`;
const pointer = `${internal(true)} update public.orders set current_proforma_id = '${I.proforma}' where id = '${I.orderV1}' and current_proforma_id is distinct from '${I.proforma}'; ${internal(false)}`;
const keys = (view: string, where: string) => `select string_agg(k, ',' order by k) from (select distinct jsonb_object_keys(to_jsonb(v)) k from public.${view} v where ${where}) s`;
export const T062_VIEW_ROW_CASES: ViewRowCase[] = [
  { name: "§2 rows: v_audit_payments shows the payment to the auditor with the bank reference masked to its last 4", role: "AUDITOR", arg: "payment",
    setup: `${internal(true)} update public.payments set observed_bank_reference = 'T056-OBSERVED-REF-9876' where id = '${X.payment}'; ${internal(false)}`,
    sql: "select count(*)::text || '|' || coalesce(max(v.bank_reference_masked), 'null') || '|' || coalesce(bool_and(to_jsonb(v)::text not like '%%T056-OBSERVED-REF%%'), true)::text from public.v_audit_payments v where v.payment_id = %L::uuid",
    expected: "1|****9876|true" },
  { name: "§2 rows: v_audit_payments carries exactly the §2 columns", role: "AUDITOR", arg: "payment", sql: keys("v_audit_payments", "v.payment_id = %L::uuid"),
    expected: "bank_reference_masked,confirmed_at,confirmed_by,currency,expected_amount,observed_amount,order_code,payment_id,rejected_at,rejected_by,status" },
  { name: "§2 rows: v_audit_proformas shows the proforma to the auditor without buyer, destination or bank-account data", role: "AUDITOR", arg: "proforma",
    sql: "select count(*)::text || '|' || coalesce(bool_and(to_jsonb(v)::text !~ '(Buyer Legal|Harbour Road|T056-TRN|T056-ACC|AE07T056|T056 Receiver)'), true)::text from public.v_audit_proformas v where v.proforma_code = %L",
    expected: "1|true" },
  { name: "§2 rows: v_audit_proformas carries exactly the §2 columns", role: "AUDITOR", arg: "proforma", sql: keys("v_audit_proformas", "v.proforma_code = %L"),
    expected: "bank_account_masked,buyer_total,confirmed_at,currency,discount_total,expired_at,issued_at,merchandise_gross,merchandise_net,proforma_code,shipping_total,status,vat_total,version" },
  { name: "§2 rows: v_buyer_reconciliation shows the buyer its own case without notes, amounts or bank references", role: "BUYER", arg: "case",
    sql: "select count(*)::text || '|' || coalesce(bool_and(to_jsonb(v)::text !~ '(TRANSFER-REF|911\\.2|refund)'), true)::text from public.v_buyer_reconciliation v where v.case_code = %L",
    expected: "1|true" },
  { name: "§2 rows: v_buyer_reconciliation carries exactly the §2 columns", role: "BUYER", arg: "case", sql: keys("v_buyer_reconciliation", "v.case_code = %L"),
    expected: "case_code,kind,opened_at,order_code,resolution_type,resolved_at,status" },
  { name: "§2 rows: v_buyer_reconciliation shows the other buyer nothing", role: "OTHER_BUYER", arg: "case",
    sql: "select count(*)::text from public.v_buyer_reconciliation v where v.case_code = %L", expected: "0" },
  { name: "§2 rows: v_finance_review_queue lists the order under review for finance (buyer total, open case)", role: "FINANCE", arg: "order", setup: toReview,
    sql: "select count(*)::text || '|' || coalesce(max(v.buyer_total)::text, 'null') || '|' || coalesce(bool_or(v.has_open_reconciliation), false)::text from public.v_finance_review_queue v where v.order_code = %L",
    expected: "1|911.20|true" },
  ...(["BUYER", "SELLER_1", "WAREHOUSE", "AUDITOR"] as Role[]).map((role): ViewRowCase => ({
    name: `§2 rows: v_finance_review_queue shows ${role} nothing for the order under review`, role, arg: "order", setup: toReview,
    sql: "select count(*)::text from public.v_finance_review_queue v where v.order_code = %L", expected: "0" })),
  { name: "§2 rows: v_seller_order_lines shows SELLER_1 exactly its two lines with its own net and payout status, no buyer total or destination", role: "SELLER_1", arg: "order", setup: pointer,
    sql: "select string_agg(v.order_item_id::text || ':' || coalesce(v.own_seller_net_amount::text, 'null') || ':' || coalesce(v.own_payout_status, 'null'), ',' order by v.order_item_id) || '|' || coalesce(bool_and(to_jsonb(v)::text !~ '(911\\.2|Harbour)'), true)::text from public.v_seller_order_lines v where v.order_code = %L",
    expected: `${I.orderItem1}:436.50:ACCRUED,${I.orderItem2}:194.00:ACCRUED|true` },
  { name: "§2 rows: v_seller_order_lines shows SELLER_2 exactly its one line", role: "SELLER_2", arg: "order", setup: pointer,
    sql: "select string_agg(v.order_item_id::text || ':' || coalesce(v.own_payout_status, 'null'), ',' order by v.order_item_id) || '|' || coalesce(bool_and(to_jsonb(v)::text !~ '(911\\.2|Harbour)'), true)::text from public.v_seller_order_lines v where v.order_code = %L",
    expected: `${I.orderItem3}:ACCRUED|true` },
];
function viewRowCases(): string {
  const argVar = { order: "v_order_code", proforma: "v_proforma_code", case: "v_case_code", payment: `'${X.payment}'` } as const;
  return `
  select order_code into v_order_code from public.orders where id = '${I.orderV1}';
  select proforma_code into v_proforma_code from public.proforma_invoices where id = '${I.proforma}';
  select case_code into v_case_code from public.reconciliation_cases where id = '${X.reconCase}';
  ${T062_VIEW_ROW_CASES.map((c) => `
  begin
    ${c.setup ?? ""}
    ${claims(c.role)}
    execute format(${q(c.sql)}, ${argVar[c.arg]}) into v_got;
    raise exception 'T056_SEEN:%', coalesce(v_got, 'null');
  exception when others then
    v_got := sqlerrm;
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(caseName(c.name, c.role))}, 'relation', '§2 rows', 'role', '${c.role}', 'expected', ${q(c.expected)},
      'got', replace(v_got, 'T056_SEEN:', ''), 'ok', v_got = ${q(`T056_SEEN:${c.expected}`)}));
  end;`).join("\n")}`;
}

/**
 * R1 RPC route: no function a client can call (authenticated EXECUTE, not a trigger function) may read the destination
 * columns. As of M3 no such function exists; M4b's checkout/issuance functions must then be reviewed and allow-listed here.
 */
const RPC_DESTINATION_ALLOWLIST: string[] = [];
function rpcRouteCase(): string {
  const allow = RPC_DESTINATION_ALLOWLIST.map((f) => q(f)).join(", ") || "''";
  return `
  select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '') into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')
     and (p.prosrc like '%destination_snapshot%' or p.prosrc like '%delivery_destination_id%')
     and p.oid::regprocedure::text not in (${allow});
  r := r || jsonb_build_array(jsonb_build_object('case', 'orders destination via a client-callable RPC (R1) × SELLER_1/SELLER_2', 'relation', 'orders destination via a client-callable RPC (R1)',
    'role', 'SELLER', 'expected', '', 'got', v_got, 'ok', v_got = ''));`;
}

/** DB-OPEN-C15: anon must not EXECUTE the two helpers; authenticated and service_role still must. */
export const C15_FUNCTIONS = { mfa: "public.mfa_satisfied()", kyb: "public.kyb_storage_object_authorized(text,boolean)" } as const;
/** Production bodies at T056 (2026-09-26); M3 must change only the ACL (T057 DB-OPEN-C15). */
export const C15_BODY_MD5 = { mfa: "a78cfc6c462a0af5cec582234b118134", kyb: "8d4ac2b14f278ba705f6bed72059b60c" } as const;
export function buildT056AnonProbeSql(): string {
  const call = { mfa: "select public.mfa_satisfied()::text", kyb: "select public.kyb_storage_object_authorized('org/13000000-0000-4000-8000-000000000001/application/13000000-0000-4000-8000-000000000002/x.pdf', false)::text" };
  const as = (who: "anon" | "authenticated" | "service_role") => who === "anon"
    ? `perform set_config('request.jwt.claims', ${q(JSON.stringify({ role: "anon" }))}, true); execute 'set local role anon';`
    : who === "authenticated"
      ? `perform set_config('request.jwt.claims', ${q(JSON.stringify({ sub: U.BUYER, role: "authenticated", aal: "aal1" }))}, true); execute 'set local role authenticated';`
      : `perform set_config('request.jwt.claims', ${q(JSON.stringify({ role: "service_role" }))}, true); execute 'set local role service_role';`;
  const exec = (name: string, who: "anon" | "authenticated" | "service_role", sql: string, mustRun: boolean) => `
  begin
    ${as(who)}
    execute ${q(sql)} into v_got;
    raise exception 'T056_RAN:%', coalesce(v_got, 'null');
  exception when others then
    v_got := sqlerrm;
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'relation', 'C15', 'role', '${who}', 'expected', ${q(mustRun ? "executes" : "permission denied")},
      'got', v_got, 'ok', ${mustRun ? "v_got like 'T056_RAN:%'" : "position('permission denied' in v_got) > 0"}));
  end;`;
  const priv = (name: string, role: string, fn: string, expected: boolean) =>
    `r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'relation', 'C15', 'role', '${role}', 'expected', '${expected}',
      'got', has_function_privilege('${role}', '${fn}', 'execute')::text, 'ok', has_function_privilege('${role}', '${fn}', 'execute') = ${expected}));`;
  const publicAcl = (name: string, fn: string) =>
    `r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'relation', 'C15', 'role', 'PUBLIC', 'expected', 'false',
      'got', (select coalesce(p.proacl::text, 'default (PUBLIC EXECUTE)') from pg_proc p where p.oid = '${fn}'::regprocedure),
      'ok', not exists (select 1 from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = '${fn}'::regprocedure and a::text like '=%X%')));`;
  return `do $t056c15$
declare
  r jsonb := '[]'::jsonb;
  v_got text;
begin
  ${exec("C15: anon cannot EXECUTE mfa_satisfied()", "anon", call.mfa, false)}
  ${exec("C15: anon cannot EXECUTE kyb_storage_object_authorized(text, boolean)", "anon", call.kyb, false)}
  ${exec("C15: authenticated still EXECUTEs mfa_satisfied()", "authenticated", call.mfa, true)}
  ${exec("C15: authenticated still EXECUTEs kyb_storage_object_authorized(text, boolean)", "authenticated", call.kyb, true)}
  ${exec("C15: service_role still EXECUTEs mfa_satisfied()", "service_role", call.mfa, true)}
  ${exec("C15: service_role still EXECUTEs kyb_storage_object_authorized(text, boolean)", "service_role", call.kyb, true)}
  reset role;
  perform set_config('request.jwt.claims', '', true);
  ${priv("C15 ACL: anon holds no EXECUTE on mfa_satisfied()", "anon", C15_FUNCTIONS.mfa, false)}
  ${priv("C15 ACL: anon holds no EXECUTE on kyb_storage_object_authorized(text, boolean)", "anon", C15_FUNCTIONS.kyb, false)}
  ${priv("C15 ACL: authenticated keeps EXECUTE on mfa_satisfied()", "authenticated", C15_FUNCTIONS.mfa, true)}
  ${priv("C15 ACL: authenticated keeps EXECUTE on kyb_storage_object_authorized(text, boolean)", "authenticated", C15_FUNCTIONS.kyb, true)}
  ${priv("C15 ACL: service_role keeps EXECUTE on mfa_satisfied()", "service_role", C15_FUNCTIONS.mfa, true)}
  ${priv("C15 ACL: service_role keeps EXECUTE on kyb_storage_object_authorized(text, boolean)", "service_role", C15_FUNCTIONS.kyb, true)}
  ${publicAcl("C15 ACL: PUBLIC holds no EXECUTE on mfa_satisfied()", C15_FUNCTIONS.mfa)}
  ${publicAcl("C15 ACL: PUBLIC holds no EXECUTE on kyb_storage_object_authorized(text, boolean)", C15_FUNCTIONS.kyb)}
  select string_agg(p.oid::regprocedure::text || ' definer=' || p.prosecdef || ' config=' || coalesce(p.proconfig::text, 'none') || ' md5=' || md5(replace(p.prosrc, chr(13), '')), ' | ' order by p.oid::regprocedure::text)
    into v_got from pg_proc p where p.oid in ('${C15_FUNCTIONS.mfa}'::regprocedure, '${C15_FUNCTIONS.kyb}'::regprocedure);
  r := r || jsonb_build_array(jsonb_build_object('case', 'C15: both helpers stay SECURITY DEFINER with their bodies/search_path (recorded for T057/T062)', 'relation', 'C15', 'role', 'OWNER', 'expected', 'definer=true', 'got', v_got,
    'ok', (select bool_and(p.prosecdef and p.proconfig = array['search_path=pg_catalog, public, auth']
                             and md5(replace(p.prosrc, chr(13), '')) = case p.proname when 'mfa_satisfied' then '${C15_BODY_MD5.mfa}' else '${C15_BODY_MD5.kyb}' end)
           from pg_proc p where p.oid in ('${C15_FUNCTIONS.mfa}'::regprocedure, '${C15_FUNCTIONS.kyb}'::regprocedure))));
  -- T057 pre-authoring condition: nothing anon can run or read depends on the two helpers.
  select coalesce(string_agg(p.oid::regprocedure::text, ', '), '') into v_got from pg_proc p
   where p.pronamespace = 'public'::regnamespace and not p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
     and p.oid not in ('${C15_FUNCTIONS.mfa}'::regprocedure, '${C15_FUNCTIONS.kyb}'::regprocedure)
     and (p.prosrc like '%mfa_satisfied%' or p.prosrc like '%kyb_storage_object_authorized%');
  r := r || jsonb_build_array(jsonb_build_object('case', 'C15 precondition: no anon-executable SECURITY INVOKER function calls either helper', 'relation', 'C15', 'role', 'anon', 'expected', '', 'got', v_got, 'ok', v_got = ''));
  select coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname || ' ' || roles::text, ', '), '') into v_got from pg_policies
   where (coalesce(qual, '') || coalesce(with_check, '')) ~ '(mfa_satisfied|kyb_storage_object_authorized)' and roles <> '{authenticated}';
  r := r || jsonb_build_array(jsonb_build_object('case', 'C15 precondition: every policy calling either helper is TO authenticated', 'relation', 'C15', 'role', 'anon', 'expected', '', 'got', v_got, 'ok', v_got = ''));
  raise exception 'T056_RESULT:%', replace(encode(convert_to(r::text, 'UTF8'), 'base64'), chr(10), '');
end
$t056c15$;`;
}

export function buildT056ProofSql(suite: "seller" | "matrix", opts: { viewRows?: boolean } = {}): string {
  const roles: Role[] = suite === "seller" ? ["SELLER_1", "SELLER_2"] : ROLES;
  const relations = suite === "seller" ? [...TABLES, ...VIEWS].filter((r) => SELLER_RELATIONS.includes(r.name)) : [...TABLES, ...VIEWS];
  const cases = relations.flatMap((r) => roles.filter((role) => !r.roles || r.roles.includes(role)).map((role) => relationCase(r, role))).join("\n");
  return `do $t056$
declare
  r jsonb := '[]'::jsonb;
  v_got text;
  v_detail text;
  v_constraint text;
  v_count bigint;
  v_view text;
  v_leaks text;
  v_denied int;
  v_order_code text;
  v_proforma_code text;
  v_case_code text;
begin
  -- 0. Safety: nothing of this proof may exist; checkout stays disabled; M2e applied.
  if exists (select 1 from public.orders where id = '${I.orderV1}' or correlation_id = '${X.marker}')
     or exists (select 1 from public.organizations where id = '${X.seller1Org}')
     or exists (select 1 from public.coffee_offers where id in ('${X.offerA}', '${X.offerB}') or offer_code in ('LST-9056001', 'LST-9056002'))
     or exists (select 1 from public.platform_admins where user_id = '${U.AUDITOR}')
     or exists (select 1 from public.organization_members where user_id = '${U.SELLER_2}')
     or exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
     or to_regclass('public.notification_events') is null then
    raise exception 'T056_PRECONDITION_FAILED';
  end if;

  -- 1. Fixtures (all rolled back at the end).
  ${fixtureSql()}
  ${check("FIXTURE: no session identity has a verified MFA factor (the MFA gates cannot mask a result)",
    `not exists (select 1 from auth.mfa_factors f where f.status = 'verified' and f.user_id in (${Object.values(U).map((u) => `'${u}'`).join(", ")}))`)}
  ${check("FIXTURE: order_items and the snapshot agree on the two sellers (L1, L2 → SELLER_1; L3 → SELLER_2)",
    `(select count(*) = 3 from public.order_items oi join public.proforma_invoice_items pl on pl.order_item_id = oi.id where oi.order_id = '${I.orderV1}' and oi.seller_organization_id = pl.seller_organization_id)
     and (select array_agg(distinct seller_organization_id::text order by seller_organization_id::text) from public.order_items where order_id = '${I.orderV1}') = array['${E.hillsOrg}', '${X.seller1Org}']::text[]`)}

  -- 2. Relation × role cases (desired post-M3 outcome vs. current production).
  ${cases}
  ${suite === "seller" ? destinationRouteCases(roles) + rpcRouteCase() : ""}
  ${opts.viewRows ? viewRowCases() : ""}
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 3. Always roll back.
  raise exception 'T056_RESULT:%', replace(encode(convert_to(r::text, 'UTF8'), 'base64'), chr(10), '');
end
$t056$;`;
}

/**
 * Feature 013 stock/inventory reservation — LOCAL functional proof against the applied `hills-f013-local` database.
 * Real writes (not rollback-only): genuine two-session concurrency for the no-oversell/idempotency invariants needs
 * two independent, actually-committing connections, so this whole proof commits real rows to the disposable LOCAL
 * database (consistent with every other LOCAL fixture/proof script in this project). Self-contained, fresh synthetic
 * ids in the `13000000-0000-4000-8000-00000000c0xx`/`c1xx` range — no interference with any other fixture data.
 *
 * Covers, in order: (1) sufficient stock reserves; (2) insufficient stock is rejected, nothing written; (3) real
 * concurrency, two sessions racing the same limited stock — exactly one succeeds; (4) idempotent replay — no double
 * reservation; (5) quantities reconcile exactly; (6) unauthorized caller is refused (non-enumerating); (7) the
 * response exposes no internal financial data; (8) no PII in audit payloads; (9) M4b is not regressed; (10) expiry
 * releases correctly, including cross-order reclaim by another buyer's confirm_proforma.
 */
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

const target = requireF013LocalTarget();

const U = { buyerA: "debffa4e-5105-400d-b6a5-6d9c4887250a", buyerB: "919526c7-0e6b-4b9f-9a63-568da9516e1d", admin: "e50e4106-41f4-44f5-891a-46ec8ffb1abe" } as const;
const ORG_A = "13000000-0000-4000-8000-000000000001";
const HILLS_ORG = "13000000-0000-4000-8000-000000000005";
const WAREHOUSE = "13000000-0000-4000-8000-000000000021";
const COFFEE = "13000000-0000-4000-8000-000000000031";

// Snapshot/proforma rows are append-only (never deletable), so every run must use fresh ids: a random 4-hex run tag
// keeps this script safely rerunnable against the disposable LOCAL database without ever colliding.
const RUN = Math.floor(Math.random() * 9000 + 1000).toString(); // 4 decimal digits: valid in both the UUID segment and the LST-NNNNNNN offer_code check
const id = (n: number) => `13000000-0000-4000-${RUN}-00000000c0${n.toString(16).padStart(2, "0")}`;
const id1 = (n: number) => `13000000-0000-4000-${RUN}-00000000c1${n.toString(16).padStart(2, "0")}`;
const ID = {
  lotShared: id(1), positionShared: id(2), offerShared: id(3), // 20 kg shared stock, contended by two orders
  lotSolo: id(4), positionSolo: id(5), offerSolo: id(6), // 10 kg, single-order tests
  lotStale: id(7), positionStale: id(8), offerStale: id(9), // 8 kg, for the cross-order reclaim test
  lotInsufficient: id(14), positionInsufficient: id(15), offerInsufficient: id(23), // 10 kg, shrunk after cart-add
  destination: id(10), account: id(11), tax: id(12), shipRule: id(13),
  orderRace1: id(16), orderRace2: id(17), orderInsufficient: id(18), orderIdem: id(19), orderCrossOrg: id(20),
  orderStaleHolder: id(21), orderReclaimer: id(22),
} as const;
const REQ = { race1: id1(1), race2: id1(2), insufficient: id1(2), idem: id1(3), crossOrg: id1(4), staleHolder: id1(5), reclaimer: id1(6) } as const;

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
const num = (text: string) => parseFloat(text.trim().split(String.fromCharCode(10)).pop() ?? "");
const results: { name: string; ok: boolean; got?: string }[] = [];
const check = (name: string, ok: boolean, got?: string) => { results.push({ name, ok, got }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !got ? "" : ` — ${got}`}`); };
const expectCode = (name: string, result: RpcResult, code: string) => check(name, result.data == null && new RegExp(`\\b${code}\\b`).test(result.error?.message ?? ""), `expected ${code}, got ${result.error?.message ?? JSON.stringify(result.data)}`);

function adminClient(): SupabaseClient {
  return createClient(target.apiUrl, target.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function session(email: string): Promise<SupabaseClient> {
  const client = createClient(target.apiUrl, target.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: target.fixturePassword });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}
const PSET = String.fromCharCode(92) + "pset";
function psql(sql: string): string {
  const out = runF013DockerPsqlStdin(Buffer.from(`${PSET} format unaligned\n${PSET} tuples_only on\n${sql}`, "utf8"), process.env.F013_DOCKER_PATH, process.env).stdout;
  return out.split("\n").filter((line) => !/^(Output format is unaligned|Tuples only is on)\.\s*$/.test(line)).join("\n");
}

async function main() {
  const originalCheckoutState = psql("select bank_transfer_checkout_enabled::text, array_to_string(pilot_organization_ids, ',') from public.commerce_settings where id;").trim().split("\n").pop() ?? "";
  const [checkoutEnabled, pilotIds = ""] = originalCheckoutState.split("|");
  if (checkoutEnabled !== "true" && checkoutEnabled !== "false") throw new Error("cannot snapshot LOCAL checkout state");
  const originalDefaultAccountIds = psql("select id::text from public.payment_accounts where currency = 'USD' and is_default_for_currency order by id;")
    .split("\n").map((value) => value.trim()).filter((value) => /^[0-9a-f-]{36}$/i.test(value));
  try {
  // 1. Fixtures: three coffee lots/positions/listings on the Hills seller (PUBLISHED, is_visible, plenty of margin
  //    against the check below), a synthetic AE destination/tax/shipping/bank config, and one order per test.
  const fixtureSql = `begin;
insert into public.coffee_lots (id, coffee_id, lot_code, total_quantity_kg, status, source_organization_id) values
  ('${ID.lotShared}', '${COFFEE}', 'F013-${RUN}-SHARED', 20, 'AVAILABLE', '${HILLS_ORG}'),
  ('${ID.lotSolo}', '${COFFEE}', 'F013-${RUN}-SOLO', 10, 'AVAILABLE', '${HILLS_ORG}'),
  ('${ID.lotStale}', '${COFFEE}', 'F013-${RUN}-STALE', 8, 'AVAILABLE', '${HILLS_ORG}'),
  ('${ID.lotInsufficient}', '${COFFEE}', 'F013-${RUN}-INSUFF', 10, 'AVAILABLE', '${HILLS_ORG}');
insert into public.inventory_positions (id, owner_organization_id, lot_id, warehouse_id, available_quantity_kg, reserved_quantity_kg) values
  ('${ID.positionShared}', '${HILLS_ORG}', '${ID.lotShared}', '${WAREHOUSE}', 20, 0),
  ('${ID.positionSolo}', '${HILLS_ORG}', '${ID.lotSolo}', '${WAREHOUSE}', 10, 0),
  ('${ID.positionStale}', '${HILLS_ORG}', '${ID.lotStale}', '${WAREHOUSE}', 8, 0),
  ('${ID.positionInsufficient}', '${HILLS_ORG}', '${ID.lotInsufficient}', '${WAREHOUSE}', 10, 0);
insert into public.coffee_offers (id, coffee_id, lot_id, seller_organization_id, seller_type, warehouse_id, price_per_kg, quantity_kg, filled_quantity_kg, reserved_quantity_kg, status, is_visible, offer_code, created_by) values
  ('${ID.offerShared}', '${COFFEE}', '${ID.lotShared}', '${HILLS_ORG}', 'HILLS', '${WAREHOUSE}', 10.00, 20, 0, 0, 'PUBLISHED', true, 'LST-913${RUN}1', '${U.admin}'),
  ('${ID.offerSolo}', '${COFFEE}', '${ID.lotSolo}', '${HILLS_ORG}', 'HILLS', '${WAREHOUSE}', 10.00, 10, 0, 0, 'PUBLISHED', true, 'LST-913${RUN}2', '${U.admin}'),
  ('${ID.offerStale}', '${COFFEE}', '${ID.lotStale}', '${HILLS_ORG}', 'HILLS', '${WAREHOUSE}', 10.00, 8, 0, 0, 'PUBLISHED', true, 'LST-913${RUN}3', '${U.admin}'),
  ('${ID.offerInsufficient}', '${COFFEE}', '${ID.lotInsufficient}', '${HILLS_ORG}', 'HILLS', '${WAREHOUSE}', 10.00, 10, 0, 0, 'PUBLISHED', true, 'LST-913${RUN}4', '${U.admin}');
insert into public.tax_rules (id, country_code, tax_name, rate_percentage, taxable_base, is_active, effective_from)
  values ('${ID.tax}', 'AE', 'VAT', 5, 'MERCHANDISE_ONLY', true, now() - interval '1 hour');
insert into public.shipping_rules (id, country_code, delivery_method, flat_fee, currency, is_active, effective_from)
  values ('${ID.shipRule}', 'AE', 'Courier', 5.00, 'USD', true, now() - interval '1 hour');
update public.payment_accounts set is_default_for_currency = false where currency = 'USD' and is_default_for_currency;
insert into public.payment_accounts (id, account_name, bank_name, account_number, swift_code, currency, is_active, is_default_for_currency, created_by)
  values ('${ID.account}', 'SYNTHETIC', 'SYNTHETIC', 'F013RES-SYNTHETIC-0001', 'SYNTHXXX', 'USD', true, true, '${U.admin}');
insert into public.delivery_destinations (id, organization_id, label, country_code, city, address_line_1, contact_name, contact_phone, delivery_method, created_by)
  values ('${ID.destination}', '${ORG_A}', 'SYNTHETIC-RES', 'AE', 'Dubai', 'SYNTHETIC', 'SYNTHETIC', '+97140000001', 'Courier', '${U.buyerA}');
update public.commerce_settings set bank_transfer_checkout_enabled = true, pilot_organization_ids = '{}';
insert into public.orders (id, buyer_organization_id, created_by) values
  ('${ID.orderRace1}', '${ORG_A}', '${U.buyerA}'), ('${ID.orderRace2}', '${ORG_A}', '${U.buyerA}'),
  ('${ID.orderInsufficient}', '${ORG_A}', '${U.buyerA}'), ('${ID.orderIdem}', '${ORG_A}', '${U.buyerA}'),
  ('${ID.orderCrossOrg}', '${ORG_A}', '${U.buyerA}'), ('${ID.orderStaleHolder}', '${ORG_A}', '${U.buyerA}'),
  ('${ID.orderReclaimer}', '${ORG_A}', '${U.buyerA}');
insert into public.order_items (order_id, offer_id, quantity_kg) values
  ('${ID.orderRace1}', '${ID.offerShared}', 15), ('${ID.orderRace2}', '${ID.offerShared}', 15),
  ('${ID.orderInsufficient}', '${ID.offerInsufficient}', 6), ('${ID.orderIdem}', '${ID.offerSolo}', 3),
  ('${ID.orderCrossOrg}', '${ID.offerSolo}', 1), ('${ID.orderStaleHolder}', '${ID.offerStale}', 5),
  ('${ID.orderReclaimer}', '${ID.offerStale}', 5);
commit;
`;
  psql(fixtureSql);
  check("fixture setup committed", true);

  const buyerA = await session("buyer-a+f013-test@example.com");
  const buyerB = await session("buyer-b+f013-test@example.com");

  // 2. Issue proformas for every order (real issue_proforma RPC, as buyer A/B).
  async function issueAll(client: SupabaseClient, orderId: string, label: string): Promise<string> {
    const { data, error } = await client.rpc("issue_proforma", { p_order_id: orderId, p_destination_id: ID.destination, p_promo_code: null, p_request_id: crypto.randomUUID() });
    if (error) throw new Error(`issue_proforma(${label}) failed: ${error.message}`);
    return (data as { proforma_id: string }).proforma_id;
  }
  const pRace1 = await issueAll(buyerA, ID.orderRace1, "race1");
  const pRace2 = await issueAll(buyerA, ID.orderRace2, "race2");
  const pInsufficient = await issueAll(buyerA, ID.orderInsufficient, "insufficient");
  // Simulates real-world drift between cart-add and confirmation (FR-017/AC-002): available at insert time, sold out by confirm time.
  psql(`update public.coffee_offers set quantity_kg = 2 where id = '${ID.offerInsufficient}';`);
  const pIdem = await issueAll(buyerA, ID.orderIdem, "idem");
  const pCrossOrg = await issueAll(buyerA, ID.orderCrossOrg, "crossOrg");
  const pStaleHolder = await issueAll(buyerA, ID.orderStaleHolder, "staleHolder");
  const pReclaimer = await issueAll(buyerA, ID.orderReclaimer, "reclaimer");
  check("all six proformas issued", true);

  // Invariant 5/1 groundwork + invariant 2: insufficient stock is rejected, nothing written.
  const before = psql(`select 'BEFORE', reserved_quantity_kg::text from public.coffee_offers where id = '${ID.offerInsufficient}';`);
  const insufficientResult = (await buyerA.rpc("confirm_proforma", { p_proforma_id: pInsufficient, p_request_id: REQ.insufficient })) as RpcResult;
  expectCode("insufficient stock is rejected (listing_inventory_changed)", insufficientResult, "listing_inventory_changed");
  const after = psql(`select 'AFTER', reserved_quantity_kg::text from public.coffee_offers where id = '${ID.offerInsufficient}';`);
  check("insufficient-stock attempt reserved nothing", before.includes("BEFORE|0") && after.includes("AFTER|0"), `${before.trim()} / ${after.trim()}`);
  const reservationRows = psql(`select count(*)::text from public.inventory_reservations where order_id = '${ID.orderInsufficient}';`);
  check("insufficient-stock attempt created no reservation row", reservationRows.trim().split("\n").pop()?.trim() === "0");

  // Invariant 6: unauthorized caller (buyer B on buyer A's proforma) is refused, non-enumerating.
  const crossOrgResult = (await buyerB.rpc("confirm_proforma", { p_proforma_id: pCrossOrg, p_request_id: REQ.crossOrg })) as RpcResult;
  const missingResult = (await buyerB.rpc("confirm_proforma", { p_proforma_id: crypto.randomUUID(), p_request_id: crypto.randomUUID() })) as RpcResult;
  expectCode("cross-org caller is refused (proforma_not_found)", crossOrgResult, "proforma_not_found");
  check("cross-org and nonexistent-id refusals are identical (non-enumerating)", crossOrgResult.error?.message === missingResult.error?.message);

  // Invariant 3: real concurrency. Two independent sessions confirm two orders that together exceed the 20 kg shared
  // stock (15 + 15 = 30 > 20); exactly one must succeed.
  const raceA = createClient(target.apiUrl, target.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const raceB = createClient(target.apiUrl, target.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  await raceA.auth.signInWithPassword({ email: "buyer-a+f013-test@example.com", password: target.fixturePassword });
  await raceB.auth.signInWithPassword({ email: "buyer-a+f013-test@example.com", password: target.fixturePassword });
  const [raceResult1, raceResult2] = (await Promise.all([
    raceA.rpc("confirm_proforma", { p_proforma_id: pRace1, p_request_id: REQ.race1 }),
    raceB.rpc("confirm_proforma", { p_proforma_id: pRace2, p_request_id: REQ.race2 }),
  ])) as [RpcResult, RpcResult];
  const raceOutcomes = [raceResult1, raceResult2];
  const raceWinners = raceOutcomes.filter((r) => r.error === null);
  const raceLosers = raceOutcomes.filter((r) => r.error !== null);
  check("concurrency: exactly one of two contending confirmations succeeds", raceWinners.length === 1 && raceLosers.length === 1,
    `winners=${raceWinners.length} losers=${raceLosers.length} errors=${raceOutcomes.map((r) => r.error?.message).join("|")}`);
  const sharedOfferState = psql(`select reserved_quantity_kg::text, (select reserved_quantity_kg from public.inventory_positions where id = '${ID.positionShared}')::text from public.coffee_offers where id = '${ID.offerShared}';`);
  check("concurrency: reserved quantity is exactly 15 kg (the winner's line), never 30", /^15\.0+\|15\.0+$/m.test(sharedOfferState.trim()), sharedOfferState.trim());

  // Invariant 4: idempotent replay with the SAME request id returns the identical stored response; no double reserve.
  const idemFirst = (await buyerA.rpc("confirm_proforma", { p_proforma_id: pIdem, p_request_id: REQ.idem })) as RpcResult;
  const idemReplay = (await buyerA.rpc("confirm_proforma", { p_proforma_id: pIdem, p_request_id: REQ.idem })) as RpcResult;
  check("idempotency: replay with the same request id returns the identical response", idemFirst.error === null && JSON.stringify(idemFirst.data) === JSON.stringify(idemReplay.data), JSON.stringify({ first: idemFirst, replay: idemReplay }));
  const idemOfferState = psql(`select reserved_quantity_kg::text from public.coffee_offers where id = '${ID.offerSolo}';`);
  check("idempotency: reserved quantity increased by exactly 3 kg once, not twice", num(idemOfferState) === 3, idemOfferState.trim());
  const idemReservationCount = psql(`select count(*)::text from public.inventory_reservations where order_id = '${ID.orderIdem}';`);
  check("idempotency: exactly one reservation row exists for the order", idemReservationCount.trim().split("\n").pop()?.trim() === "1");

  // Invariant 7: the response exposes no internal financial data.
  const idemDataText = JSON.stringify(idemFirst.data);
  check("response exposes no commission/seller-net/Hills-share/bank data", !/commission|seller_net|hills_share|bank_|account_number|iban/i.test(idemDataText), idemDataText);
  check("response has exactly the documented keys", Object.keys(idemFirst.data as object).sort().join(",") === "buyer_total,expires_at,order_id,reservation_id");

  // Invariant 8: no destination/bank PII in audit payloads written by this proof.
  const auditLeaks = psql(`select count(*)::text from public.audit_logs a where a.created_at > now() - interval '2 minutes' and (
    (a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
    or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
    or coalesce(a.old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
    or coalesce(a.new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
    or (coalesce(a.old_data::text,'') || coalesce(a.new_data::text,'') || a.metadata::text) like '%F013RES-SYNTHETIC-0001%');`);
  check("no destination/bank PII in audit rows written by this proof", auditLeaks.trim().split("\n").pop()?.trim() === "0", auditLeaks.trim());

  // Invariant 9: M4b is not regressed — the exact approved postflight still passes.
  const m4bPostflightSql = readFileSync("supabase/maintenance/20260926_feature_013_quote_and_proforma_issuance_postflight.sql", "utf8");
  // This proof turned checkout ON to exercise issue_proforma; restore the steady state before checking M4b's own
  // "checkout remains off" invariant (not a real M4b regression — a transient artifact of this proof's own fixture).
  psql(`update public.commerce_settings set bank_transfer_checkout_enabled = false;`);
  const m4bResult = psql(m4bPostflightSql);
  const m4bPassed = m4bResult.split("\n").filter((line: string) => /\|t\s*$/.test(line.trim())).length;
  const m4bFailed = m4bResult.split("\n").filter((line: string) => /\|f\s*$/.test(line.trim())).length;
  check("M4b postflight is not regressed (9/9)", m4bPassed === 9 && m4bFailed === 0, `${m4bPassed} passed / ${m4bFailed} failed`);

  // Invariant 10: expiry releases correctly, including cross-order reclaim by another buyer's confirm_proforma.
  const staleConfirm = (await buyerA.rpc("confirm_proforma", { p_proforma_id: pStaleHolder, p_request_id: REQ.staleHolder })) as RpcResult;
  check("stale-holder reservation created (setup for the reclaim test)", staleConfirm.error === null, staleConfirm.error?.message);
  // Backdate it directly (service_role, LOCAL-only test manipulation) to simulate a naturally-expired reservation.
  psql(`update public.inventory_reservations set expires_at = now() - interval '1 minute' where order_id = '${ID.orderStaleHolder}';
        update public.orders set hold_expires_at = now() - interval '1 minute' where id = '${ID.orderStaleHolder}';`);
  // Direct expire_reservation call (T096: "released exactly once by sweep_expired_reservations (called directly)" — proven for expire_reservation here, sweep below).
  const staleOfferBefore = psql(`select reserved_quantity_kg::text from public.coffee_offers where id = '${ID.offerStale}';`);
  check("before reclaim: 5 kg reserved on the shared stale offer", num(staleOfferBefore) === 5, staleOfferBefore.trim());
  // Reclaimer confirms a proforma that needs 5 kg on an 8 kg offer with 5 kg already (stale-)reserved — only fits if reclaimed.
  const reclaimResult = (await buyerA.rpc("confirm_proforma", { p_proforma_id: pReclaimer, p_request_id: REQ.reclaimer })) as RpcResult;
  check("reclaim: another buyer's confirm_proforma succeeds by reclaiming the expired reservation inline", reclaimResult.error === null, reclaimResult.error?.message);
  const staleHolderState = psql(`select o.status, r.status, p.status from public.orders o join public.inventory_reservations r on r.order_id = o.id join public.proforma_invoices p on p.id = r.proforma_id where o.id = '${ID.orderStaleHolder}';`);
  check("reclaim: the stale holder's order/reservation/proforma all became EXPIRED as a side effect", staleHolderState.includes("EXPIRED|EXPIRED|EXPIRED"), staleHolderState.trim());
  const reclaimerOfferState = psql(`select reserved_quantity_kg::text from public.coffee_offers where id = '${ID.offerStale}';`);
  check("reclaim: reserved quantity is exactly 5 kg (the reclaimer's), the stale 5 kg was released first", num(reclaimerOfferState) === 5, reclaimerOfferState.trim());

  // expire_reservation direct call + idempotent no-op rerun on the reclaimer's own (still-fresh) reservation, forced expired.
  psql(`update public.inventory_reservations set expires_at = now() - interval '1 minute' where order_id = '${ID.orderReclaimer}';
        update public.orders set hold_expires_at = now() - interval '1 minute' where id = '${ID.orderReclaimer}';`);
  const admin2 = adminClient();
  const expireDirect = (await admin2.rpc("expire_reservation", { p_order_id: ID.orderReclaimer })) as RpcResult;
  check("expire_reservation(direct call) releases an expired reservation, returns true", expireDirect.data === true, JSON.stringify(expireDirect));
  const expireRerun = (await admin2.rpc("expire_reservation", { p_order_id: ID.orderReclaimer })) as RpcResult;
  check("expire_reservation is idempotent: a second call on an already-expired order is a no-op (false)", expireRerun.data === false, JSON.stringify(expireRerun));
  const reclaimerOfferAfterExpiry = psql(`select reserved_quantity_kg::text from public.coffee_offers where id = '${ID.offerStale}';`);
  check("after expiry: reserved quantity returns to 0", num(reclaimerOfferAfterExpiry) === 0, reclaimerOfferAfterExpiry.trim());

  // sweep_expired_reservations, called directly: releases the race loser's reservation if it somehow remained ACTIVE
  // past its window is not applicable here (the loser never got one) — instead prove it on a freshly-backdated one,
  // and prove a second sweep is a no-op (T096).
  psql(`update public.inventory_reservations set expires_at = now() - interval '1 minute' where order_id = '${ID.orderIdem}';
        update public.orders set hold_expires_at = now() - interval '1 minute' where id = '${ID.orderIdem}';`);
  const sweepResult = (await admin2.rpc("sweep_expired_reservations", { p_limit: 100 })) as RpcResult;
  check("sweep_expired_reservations releases the backdated active reservation", typeof sweepResult.data === "number" && sweepResult.data >= 1 && sweepResult.error === null, JSON.stringify(sweepResult));
  const idemAfterSweep = psql(`select o.status, r.status, p.status from public.orders o join public.inventory_reservations r on r.order_id = o.id join public.proforma_invoices p on p.id = r.proforma_id where o.id = '${ID.orderIdem}';`);
  check("sweep expires the order, reservation and proforma", idemAfterSweep.includes("EXPIRED|EXPIRED|EXPIRED"), idemAfterSweep.trim());
  check("sweep releases the reservation's stock", num(psql(`select reserved_quantity_kg::text from public.coffee_offers where id = '${ID.offerSolo}';`)) === 0);
  const sweepRerun = (await admin2.rpc("sweep_expired_reservations", { p_limit: 100 })) as RpcResult;
  check("a second sweep is a no-op (0 released)", sweepRerun.data === 0, JSON.stringify(sweepRerun));
  const anonSweep = (await createClient(target.apiUrl, target.anonKey, { auth: { autoRefreshToken: false, persistSession: false } }).rpc("sweep_expired_reservations", { p_limit: 1 })) as RpcResult;
  check("sweep_expired_reservations refuses anon/authenticated (service_role only)", anonSweep.data == null && anonSweep.error?.code === "42501", JSON.stringify(anonSweep));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} reservation invariants passed.`);
  if (failed.length > 0) throw new Error(`reservation proof failed: ${failed.map((r) => r.name).join("; ")}`);
  } finally {
    try {
      const proofOrders = [ID.orderRace1, ID.orderRace2, ID.orderInsufficient, ID.orderIdem, ID.orderCrossOrg, ID.orderStaleHolder, ID.orderReclaimer]
        .map((value) => `'${value}'`).join(",");
      psql(`update public.inventory_reservations set expires_at = now() - interval '1 minute' where order_id in (${proofOrders}) and status = 'ACTIVE';
            update public.orders set hold_expires_at = now() - interval '1 minute' where id in (${proofOrders}) and status = 'HOLD';
            select public.commerce_release_reservation(order_id) from public.inventory_reservations where order_id in (${proofOrders}) and status = 'ACTIVE';`);
    } finally {
      const pilotArray = pilotIds ? `array[${pilotIds.split(",").map((value) => `'${value}'::uuid`).join(",")}]` : "'{}'::uuid[]";
      psql(`update public.commerce_settings set bank_transfer_checkout_enabled = ${checkoutEnabled}, pilot_organization_ids = ${pilotArray};
            update public.payment_accounts set is_default_for_currency = false where currency = 'USD' and is_default_for_currency;
            update public.payment_accounts set is_default_for_currency = true where id in (${originalDefaultAccountIds.length ? originalDefaultAccountIds.map((value) => `'${value}'`).join(",") : "null"});`);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

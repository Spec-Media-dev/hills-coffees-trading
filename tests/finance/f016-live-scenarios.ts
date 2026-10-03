/* Feature 016 approved-remote scenario implementation. Never imported by application code. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINANCE_EMAIL,
  sql,
  runSql,
  LiveFixture,
  cleanupLiveFixture,
  withLiveFixture,
  withFixtureFamily,
  withOwnedMutation,
  actorSql,
  assertManifestAbsent,
} from "./f016-live-fixtures";

import { openLiveSession, withLiveSession, LiveDatabaseError } from "./f016-live-session";

export type LiveScenarioHandler = () => Promise<void>;

/** Legacy fixture cleanup alias kept for harness contract assertions */
export async function cleanupFixture(f: LiveFixture): Promise<void> {
  await cleanupLiveFixture(f.manifest);
}

/** Legacy wrapper alias kept for scenario compatibility */
export async function withFixture(fn: (f: LiveFixture) => Promise<void>, groups = 1): Promise<void> {
  await withLiveFixture(fn, groups);
}

/**
 * Executes finance_review_bank_transfer_v1 with actor credentials.
 * If expectError is provided, fails unless the EXACT expected database error is raised.
 * Cannot false-pass on success or on an unexpected error.
 */
export function normalizeDomainToken(value: string): string { return value.trim().toLowerCase(); }
export function assertExpectedDomainError(actual: unknown, expected: string): void {
  if (actual === undefined) throw new Error("f016_expected_error_not_raised");
  if (!(actual instanceof LiveDatabaseError) || actual.sqlState !== "P0001" ||
      normalizeDomainToken(actual.domain) !== normalizeDomainToken(expected)) throw new Error("f016_unexpected_error_raised");
}
export async function financeCall(
  f: LiveFixture, decision: "CONFIRMED" | "REJECTED", requestId = f.manifest.request(), expectError?: string, failpoint = false
): Promise<Record<string, unknown> | undefined> {
  f.manifest.request(requestId);
  return withLiveSession(async session => {
    await session.query("begin;");
    await session.query(actorSql(FINANCE_EMAIL));
    if (failpoint) await session.query("select set_config('app.f016_test_failpoint','after_review_mutations',true);");
    let actual: unknown;
    let payload: Record<string, unknown> | undefined;
    try {
      const rows = await session.query(`select public.finance_review_bank_transfer_v1(${sql(f.orderId)}::uuid,${sql(f.paymentId)}::uuid,${sql(decision)},${sql(decision === "REJECTED" ? "F016 rejection" : "F016 confirmation")},${sql(requestId)}::uuid)::text;`);
      payload = JSON.parse(rows[0][0]!);
    } catch (error) { actual = error; }
    if (expectError) { assertExpectedDomainError(actual, expectError); await session.query("rollback;"); }
    else { if (actual !== undefined) throw actual; await session.query("commit;"); }
    return payload;
  });
}

type StockSnapshot = { positions: Array<Record<string, unknown>>; offers: Array<Record<string, unknown>> };
export async function inventorySnapshot(f: LiveFixture): Promise<StockSnapshot> {
  return withLiveSession(async s=>{
    const lots=f.manifest.sellers.map(x=>sql(x.lotId)).join(",");
    const offers=f.manifest.sellers.map(x=>sql(x.offerId)).join(",");
    const rows=await s.query(`select jsonb_build_object(
      'positions',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.inventory_positions p where lot_id in (${lots})), '[]'::jsonb),
      'offers',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from public.coffee_offers o where id in (${offers})), '[]'::jsonb))::text;`);
    return JSON.parse(rows[0][0]!);
  });
}
export function assertSnapshotEqual(before: unknown, after: unknown): void {
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error("f016_replay_or_rollback_state_changed");
}
export function assertStableResults(a: Record<string,unknown>,b: Record<string,unknown>,sameKey=true): void {
  // Initial DTO timestamps use clock_timestamp(); replay uses review.created_at. Compare the stable DTO fields.
  for(const key of ["orderId","order_id","orderCode","order_code","paymentId","payment_id","decision",
    "orderStatus","order_status","paymentStatus","payment_status","reservationStatus","reservation_status",
    ...(a.decision==="CONFIRMED"?["taxInvoiceNumber","tax_invoice_number","shipmentIds","shipment_ids"]:[]),
    ...(sameKey?["requestId","request_id"]:[])]) {
    if(a[key]===undefined || b[key]===undefined)throw new Error("f016_rpc_payload_field_missing");
    const normalize=(value:unknown)=>Array.isArray(value)?[...value].sort():value;
    assertSnapshotEqual(normalize(a[key]),normalize(b[key]));
  }
}
async function replaySnapshot(f: LiveFixture): Promise<unknown> {
  const inventory=await inventorySnapshot(f);
  const artifacts=await withLiveSession(async s=>{
    const scopes: Record<string,string>={
      payment_reviews:`payment_id=${sql(f.paymentId)}`,
      tax_invoices:`order_id=${sql(f.orderId)}`,
      inventory_ownership_events:`correlation_id=${sql(f.orderId)}`,
      order_shipments:`order_id=${sql(f.orderId)}`,
      shipment_items:`shipment_id in(select id from public.order_shipments where order_id=${sql(f.orderId)})`,
      notifications:`entity_id=${sql(f.orderId)} or entity_id in(select id from public.order_shipments where order_id=${sql(f.orderId)})`,
      notification_events:`aggregate_id=${sql(f.orderId)} or aggregate_id in(select id from public.order_shipments where order_id=${sql(f.orderId)})`,
    };
    const snapshot: Record<string,unknown>={};
    for(const [table,where] of Object.entries(scopes)){
      const rows=await s.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text from public.${table} t where ${where};`);
      snapshot[table]=JSON.parse(rows[0][0]!);
    }
    return snapshot;
  });
  return {inventory,artifacts};
}
async function assertRaceArtifacts(f: LiveFixture,decision:"CONFIRMED"|"REJECTED",before:StockSnapshot) {
  const confirmed=decision==="CONFIRMED";
  await runSql(`do $$ begin
    if(select count(*) from public.payment_reviews where payment_id=${sql(f.paymentId)})<>1
      or(select count(*) from public.inventory_ownership_events where correlation_id=${sql(f.orderId)})<>${confirmed?f.quantity:0}
      or(select count(*) from public.order_shipments where order_id=${sql(f.orderId)} and shipment_kind='FULFILLMENT')<>${confirmed?f.quantity:0}
      or(select count(*) from public.notifications where entity_id=${sql(f.orderId)} and notification_type=${sql(confirmed?"PAYMENT_CONFIRMED":"PAYMENT_REJECTED")})<>1
      or exists(select 1 from public.notifications where entity_id=${sql(f.orderId)} or entity_id in(select id from public.order_shipments where order_id=${sql(f.orderId)}) group by entity_id,notification_type,user_id having count(*)>1)
      then raise exception 'f016_race_duplicate_or_mixed_artifacts'; end if;
  end $$;`);
  const after=await inventorySnapshot(f);
  for(const seller of f.manifest.sellers){
    const p=before.positions.find(p=>p.id===seller.positionId)!;
    const q=after.positions.find(p=>p.id===seller.positionId)!;
    const o=before.offers.find(o=>o.id===seller.offerId)!;
    const n=after.offers.find(o=>o.id===seller.offerId)!;
    const buyer=(snapshot:StockSnapshot)=>snapshot.positions.filter(p=>p.owner_organization_id===f.buyerOrganizationId && p.lot_id===seller.lotId).reduce((sum,p)=>sum+Number(p.available_quantity_kg),0);
    if(Number(q.available_quantity_kg)!==Number(p.available_quantity_kg)-(confirmed?1:0) ||
      Number(q.reserved_quantity_kg)!==Number(p.reserved_quantity_kg)-1 ||
      buyer(after)!==buyer(before)+(confirmed?1:0) ||
      Number(n.reserved_quantity_kg)!==Number(o.reserved_quantity_kg)-1 ||
      Number(n.filled_quantity_kg)!==Number(o.filled_quantity_kg)+(confirmed?1:0) ||
      n.quantity_kg!==o.quantity_kg)throw new Error("f016_race_inventory_delta");
  }
}

async function assertTerminal(f: LiveFixture, decision: "CONFIRMED" | "REJECTED") {
  const confirmed = decision === "CONFIRMED";
  await runSql(`do $$ begin
    if not exists (select 1 from public.payments where id = ${sql(f.paymentId)} and status = '${confirmed ? "CONFIRMED" : "REJECTED"}') then
      raise exception 'f016_payment_state';
    end if;
    if not exists (select 1 from public.orders where id = ${sql(f.orderId)} and status = '${confirmed ? "PAID" : "PAYMENT_REJECTED"}') then
      raise exception 'f016_order_state';
    end if;
    if not exists (select 1 from public.inventory_reservations where id = ${sql(f.reservationId)} and status = '${confirmed ? "CONSUMED" : "RELEASED"}') then
      raise exception 'f016_reservation_state';
    end if;
    if not exists (select 1 from public.payment_proofs where id = ${sql(f.proofId)} and status = '${confirmed ? "ACCEPTED" : "REJECTED"}') then
      raise exception 'f016_proof_state';
    end if;
    if ${confirmed ? "(select count(*) from public.tax_invoices where order_id = " + sql(f.orderId) + ") <> 1" : "exists (select 1 from public.tax_invoices where order_id = " + sql(f.orderId) + ")"} then
      raise exception 'f016_invoice_state';
    end if;
  end $$;`);
}

// Live scenarios.

async function confirmHappy() {
  await withFixture(async (f) => {
    await financeCall(f, "CONFIRMED");
    await assertTerminal(f, "CONFIRMED");
    await runSql(`do $$ begin
      if (select count(*) from public.payment_reviews where payment_id = ${sql(f.paymentId)}) <> 1
         or (select count(*) from public.inventory_ownership_events where correlation_id = ${sql(f.orderId)}) <> ${f.quantity}
         or (select count(*) from public.order_shipments where order_id = ${sql(f.orderId)} and shipment_kind = 'FULFILLMENT') = 0 then
        raise exception 'f016_confirm_artifacts';
      end if;
    end $$;`);
  });
}

async function rejectHappy() {
  await withFixture(async (f) => {
    await financeCall(f, "REJECTED");
    await assertTerminal(f, "REJECTED");
    await runSql(`do $$ begin
      if exists (select 1 from public.inventory_ownership_events where correlation_id = ${sql(f.orderId)})
         or exists (select 1 from public.order_shipments where order_id = ${sql(f.orderId)} and shipment_kind = 'FULFILLMENT') then
        raise exception 'f016_reject_artifacts';
      end if;
    end $$;`);
  });
}

export async function concurrent(decisionA: "CONFIRMED" | "REJECTED", decisionB: "CONFIRMED" | "REJECTED") {
  await withFixture(async (f) => {
    const before = await inventorySnapshot(f);
    const a = await openLiveSession();
    let b: Awaited<ReturnType<typeof openLiveSession>> | undefined;
    let controller: Awaited<ReturnType<typeof openLiveSession>> | undefined;
    try {
      b = await openLiveSession(); controller = await openLiveSession();
      if (new Set([a.pid,b.pid,controller.pid]).size !== 3) throw new Error("f016_backends_not_independent");
      for (const session of [a,b]) {
        await session.query("begin;");
        await session.query(actorSql(FINANCE_EMAIL));
        const ready = await session.query("select pg_backend_pid(),'ready';");
        if (Number(ready[0][0]) !== session.pid || ready[0][1] !== "ready") throw new Error("f016_barrier_ready_ack_missing");
      }
      await controller.query("begin;");
      await controller.query(`select id from public.orders where id=${sql(f.orderId)} for update;`);
      const invoke = (decision: string) => `select public.finance_review_bank_transfer_v1(${sql(f.orderId)}::uuid,${sql(f.paymentId)}::uuid,${sql(decision)},'F016 race',${sql(f.manifest.request())}::uuid)::text; commit;`;
      const calls = Promise.allSettled([a.query(invoke(decisionA)),b.query(invoke(decisionB))]);
      await controller.query(`do $$ declare deadline timestamptz:=clock_timestamp()+interval '8 seconds'; n int;
        begin loop perform pg_stat_clear_snapshot();
          select count(*) into n from pg_stat_activity where pid in (${a.pid},${b.pid})
            and state='active' and wait_event_type='Lock' and xact_start is not null
            and position('finance_review_bank_transfer_v1' in query)>0;
          exit when n=2;
          if clock_timestamp()>deadline then raise exception 'f016_barrier_overlap_ack_timeout'; end if;
          perform pg_sleep(0.025);
        end loop; end $$;`);
      await controller.query("commit;");
      const results = await calls;
      const successes = results.filter(r=>r.status==="fulfilled");
      let winner: "CONFIRMED" | "REJECTED";
      if (decisionA === decisionB) {
        if (successes.length !== 2) throw new Error("f016_same_decision_race_failed");
        const payloads = successes.map(r=>JSON.parse(r.value[0][0]!));
        if (payloads.some(p=>p.decision!==decisionA)) throw new Error("f016_race_terminal_payload");
        assertStableResults(payloads[0],payloads[1]);
        winner=decisionA;
      } else {
        if(successes.length!==1)throw new Error("f016_mixed_race_outcome");
        const loser=results.find(r=>r.status==="rejected");
        if(!loser || loser.status!=="rejected")throw new Error("f016_mixed_race_missing_conflict");
        assertExpectedDomainError(loser.reason,"order_already_finalized");
        winner=JSON.parse(successes[0].value[0][0]!).decision;
        if(winner!=="CONFIRMED" && winner!=="REJECTED")throw new Error("f016_mixed_race_terminal_payload");
      }
      await assertTerminal(f,winner);
      await assertRaceArtifacts(f,winner,before);
    } finally { controller?.close(); b?.close(); a.close(); }
  });
}

async function nullLocationConcurrency() {
  await withFixtureFamily(2, 1, async ([first, second]) => {
    const seller = first.manifest.sellers[0];
    const a = await openLiveSession();
    let b: Awaited<ReturnType<typeof openLiveSession>> | undefined;
    let controller: Awaited<ReturnType<typeof openLiveSession>> | undefined;
    try {
      b = await openLiveSession(); controller = await openLiveSession();
      if (new Set([a.pid, b.pid, controller.pid]).size !== 3) throw new Error("f016_backends_not_independent");
      await a.query("begin;"); await b.query("begin;");
      await a.query(actorSql(FINANCE_EMAIL)); await b.query(actorSql(FINANCE_EMAIL));
      const ackA = await a.query("select pg_backend_pid(),'ready';");
      const ackB = await b.query("select pg_backend_pid(),'ready';");
      if (Number(ackA[0][0]) !== a.pid || Number(ackB[0][0]) !== b.pid) throw new Error("f016_barrier_ready_ack_missing");
      await controller.query("begin;");
      await controller.query(`select id from public.coffee_offers where id=${sql(seller.offerId)} for update;`);
      const baseline = await controller.query(`select
        (select available_quantity_kg from public.inventory_positions where id=${sql(seller.positionId)}),
        coalesce((select sum(available_quantity_kg) from public.inventory_positions where lot_id=${sql(seller.lotId)} and owner_organization_id=${sql(first.buyerOrganizationId)} and warehouse_id=${sql(seller.warehouseId)} and warehouse_location_id is null),0);`);
      const invoke = (f: LiveFixture) => `select public.finance_review_bank_transfer_v1(${sql(f.orderId)}::uuid,${sql(f.paymentId)}::uuid,'CONFIRMED','F016 barrier',${sql(f.manifest.request())}::uuid); commit;`;
      const calls = Promise.allSettled([a.query(invoke(first)), b.query(invoke(second))]);
      await controller.query(`do $$ declare deadline timestamptz := clock_timestamp()+interval '8 seconds'; n int;
        begin loop perform pg_stat_clear_snapshot();
          select count(*) into n from pg_stat_activity where pid in (${a.pid},${b.pid})
            and state='active' and wait_event_type='Lock' and xact_start is not null
            and position('finance_review_bank_transfer_v1' in query)>0;
          exit when n=2;
          if clock_timestamp()>deadline then raise exception 'f016_barrier_overlap_ack_timeout'; end if;
          perform pg_sleep(0.025);
        end loop; end $$;`);
      await controller.query("commit;");
      const results = await calls;
      if (results.some(r => r.status !== "fulfilled")) throw new Error("f016_overlapped_review_failed");
      const sellerBefore = Number(baseline[0][0]); const buyerBefore = Number(baseline[0][1]);
      await controller.query(`do $$ begin
        if (select count(*) from public.inventory_positions where lot_id=${sql(seller.lotId)} and owner_organization_id=${sql(first.buyerOrganizationId)} and warehouse_id=${sql(seller.warehouseId)} and warehouse_location_id is null) <> 1
          or (select sum(available_quantity_kg) from public.inventory_positions where lot_id=${sql(seller.lotId)} and owner_organization_id=${sql(first.buyerOrganizationId)} and warehouse_id=${sql(seller.warehouseId)} and warehouse_location_id is null) <> ${buyerBefore}+2
          or (select available_quantity_kg from public.inventory_positions where id=${sql(seller.positionId)}) <> ${sellerBefore}-2
          or (select reserved_quantity_kg from public.inventory_positions where id=${sql(seller.positionId)}) <> 0
          or (select count(*) from public.inventory_ownership_events where correlation_id in (${sql(first.orderId)},${sql(second.orderId)})) <> 2
          or (select sum(quantity_kg) from public.inventory_ownership_events where correlation_id in (${sql(first.orderId)},${sql(second.orderId)})) <> 2
          or exists (select 1 from public.inventory_ownership_events where correlation_id in (${sql(first.orderId)},${sql(second.orderId)}) and
            (lot_id is distinct from ${sql(seller.lotId)}::uuid or from_organization_id is distinct from ${sql(seller.organizationId)}::uuid
             or to_organization_id is distinct from ${sql(first.buyerOrganizationId)}::uuid or warehouse_id is distinct from ${sql(seller.warehouseId)}::uuid
             or warehouse_location_id is not null or quantity_kg <> 1 or event_type <> 'SALE' or reason <> 'FINANCE_CONFIRMATION'))
        then raise exception 'f016_null_location_conservation_failed'; end if;
      end $$;`);
    } finally { controller?.close(); b?.close(); a.close(); }
  });
}

async function assertFailedReviewRollback(f: LiveFixture, kind: "confirm" | "reject") {
  await runSql(`do $$ begin
    if not exists (select 1 from public.orders where id = ${sql(f.orderId)} and status = 'PAYMENT_PROOF_SUBMITTED')
       or not exists (select 1 from public.payments where id = ${sql(f.paymentId)} and status = 'PROOF_SUBMITTED')
       or not exists (select 1 from public.inventory_reservations where id = ${sql(f.reservationId)} and status = 'REVIEW_HOLD')
       or not exists (select 1 from public.payment_proofs where id = ${sql(f.proofId)} and status = 'SUBMITTED') then
      raise exception 'f016_${kind}_rollback_state';
    end if;

    if exists (select 1 from public.payment_reviews where payment_id = ${sql(f.paymentId)})
       or exists (select 1 from public.audit_logs where entity_id = ${sql(f.orderId)} and action = 'FINANCE_PAYMENT_REVIEW')
       or exists (select 1 from public.tax_invoices where order_id = ${sql(f.orderId)})
       or exists (select 1 from public.inventory_ownership_events where correlation_id = ${sql(f.orderId)})
       or exists (select 1 from public.storage_allocations sa join public.order_items oi on oi.id = sa.order_item_id where oi.order_id = ${sql(f.orderId)})
       or exists (select 1 from public.order_shipments where order_id = ${sql(f.orderId)} and shipment_kind = 'FULFILLMENT')
       or exists (select 1 from public.notifications where entity_id = ${sql(f.orderId)} and notification_type in ('PAYMENT_CONFIRMED', 'PAYMENT_REJECTED')) then
      raise exception 'f016_${kind}_rollback_artifact';
    end if;
  end $$;`);
}

/**
 * Blocker B3: Notification Recipients (DELIVERY_HANDOFF_REQUESTED)
 * Derives exact active warehouse recipient set from actual schema.
 * Asserts each expected warehouse recipient receives the event, unrelated users do not,
 * correct order/shipment linkage, and replay creates no duplicate recipient/event rows.
 */
async function warehouseHandoffNotification() {
  await withFixture(async (f) => {
    const replayKey = f.manifest.request();
    await financeCall(f, "CONFIRMED", replayKey);

    await runSql(`
      do $$
      declare
        v_order_id uuid := ${sql(f.orderId)};
        v_shipment record;
        v_expected_users uuid[];
        v_actual_users uuid[];
        v_buyer_user_id uuid;
      begin
        select created_by into v_buyer_user_id from public.orders where id = v_order_id;

        for v_shipment in
          select id, fulfillment_warehouse_id
          from public.order_shipments
          where order_id = v_order_id and shipment_kind = 'FULFILLMENT' and status = 'REQUESTED'
        loop
          -- Derive exact active warehouse recipient set from actual schema
          select coalesce(array_agg(om.user_id order by om.user_id), array[]::uuid[]) into v_expected_users
          from public.warehouses w
          join public.organization_members om
            on om.organization_id = w.owner_organization_id
           and om.is_active = true
          where w.id = v_shipment.fulfillment_warehouse_id;

          -- Query actual notifications for this shipment
          select coalesce(array_agg(user_id order by user_id), array[]::uuid[]) into v_actual_users
          from public.notifications
          where entity_id = v_shipment.id
            and entity_type = 'order_shipments'
            and notification_type = 'DELIVERY_HANDOFF_REQUESTED';

          -- Assert each expected warehouse recipient receives the event
          if v_actual_users is distinct from v_expected_users then
            raise exception 'f016_warehouse_recipients_mismatch: expected %, got %', v_expected_users, v_actual_users;
          end if;

          -- Assert unrelated users (such as the buyer who created the order) do not receive it
          if exists (
            select 1 from public.notifications
            where entity_id = v_shipment.id
              and entity_type = 'order_shipments'
              and notification_type = 'DELIVERY_HANDOFF_REQUESTED'
              and user_id = v_buyer_user_id
              and v_buyer_user_id <> all(v_expected_users)
          ) then
            raise exception 'f016_warehouse_handoff_sent_to_buyer';
          end if;
        end loop;
      end $$;
    `);

    // Replay creates no duplicate recipient/event rows
    await financeCall(f, "CONFIRMED", replayKey);

    await runSql(`
      do $$
      declare
        v_order_id uuid := ${sql(f.orderId)};
        v_shipment record;
        v_expected_count int;
        v_actual_count int;
        v_expected_users uuid[];
        v_actual_users uuid[];
      begin
        for v_shipment in
          select id, fulfillment_warehouse_id
          from public.order_shipments
          where order_id = v_order_id and shipment_kind = 'FULFILLMENT'
        loop
          select count(*) into v_expected_count
          from public.warehouses w
          join public.organization_members om
            on om.organization_id = w.owner_organization_id
           and om.is_active = true
          where w.id = v_shipment.fulfillment_warehouse_id;

          select count(*) into v_actual_count
          from public.notifications
          where entity_id = v_shipment.id
            and entity_type = 'order_shipments'
            and notification_type = 'DELIVERY_HANDOFF_REQUESTED';

          if v_actual_count <> v_expected_count then
            raise exception 'f016_warehouse_notification_replay_duplicate: expected %, got %', v_expected_count, v_actual_count;
          end if;
          select array_agg(om.user_id order by om.user_id) into v_expected_users
          from public.warehouses w join public.organization_members om on om.organization_id=w.owner_organization_id and om.is_active
          where w.id=v_shipment.fulfillment_warehouse_id;
          select array_agg(n.user_id order by n.user_id) into v_actual_users from public.notifications n
          where n.entity_id=v_shipment.id and n.notification_type='DELIVERY_HANDOFF_REQUESTED';
          if v_actual_users is distinct from v_expected_users or exists (
            select 1 from public.notifications n join public.warehouses w on w.id=v_shipment.fulfillment_warehouse_id
            where n.entity_id=v_shipment.id and n.notification_type='DELIVERY_HANDOFF_REQUESTED'
              and (n.entity_type<>'order_shipments' or n.organization_id is distinct from w.owner_organization_id)
          ) then raise exception 'f016_warehouse_replay_recipient_integrity'; end if;
        end loop;
      end $$;
    `);
  });
}

async function inventoryConservation() {
  await withFixture(async (f) => {
    await runSql(`
      begin;
      select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = ${sql(FINANCE_EMAIL)}), true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      do $$
      declare
        r record;
        s_available numeric;
        s_reserved numeric;
        b_available numeric;
      begin
        select ri.quantity_kg, ip.id, ip.lot_id, ip.warehouse_id, ip.warehouse_location_id
        into r
        from public.inventory_reservation_items ri
        join public.inventory_positions ip on ip.id = ri.inventory_position_id
        where ri.reservation_id = ${sql(f.reservationId)}
        order by ri.offer_id
        limit 1;

        select available_quantity_kg, reserved_quantity_kg into s_available, s_reserved
        from public.inventory_positions
        where id = r.id;

        select coalesce(sum(available_quantity_kg), 0) into b_available
        from public.inventory_positions
        where owner_organization_id = ${sql(f.buyerOrganizationId)}
          and lot_id = r.lot_id
          and warehouse_id = r.warehouse_id
          and warehouse_location_id is not distinct from r.warehouse_location_id;

        perform public.finance_review_bank_transfer_v1(
          ${sql(f.orderId)}::uuid,
          ${sql(f.paymentId)}::uuid,
          'CONFIRMED',
          'F016 conservation',
          ${sql(f.manifest.request())}::uuid
        );

        if (select available_quantity_kg from public.inventory_positions where id = r.id) <> s_available - r.quantity_kg
           or (select reserved_quantity_kg from public.inventory_positions where id = r.id) <> s_reserved - r.quantity_kg then
          raise exception 'f016_seller_conservation';
        end if;

        if (select coalesce(sum(available_quantity_kg), 0) from public.inventory_positions where owner_organization_id = ${sql(f.buyerOrganizationId)} and lot_id = r.lot_id and warehouse_id = r.warehouse_id and warehouse_location_id is not distinct from r.warehouse_location_id) <> b_available + r.quantity_kg then
          raise exception 'f016_buyer_conservation';
        end if;

        if exists (
          select 1 from public.inventory_positions
          where owner_organization_id = ${sql(f.buyerOrganizationId)}
          group by lot_id, owner_organization_id, warehouse_id, warehouse_location_id
          having count(*) > 1
        ) then
          raise exception 'f016_duplicate_buyer_position';
        end if;
      end $$;
      commit;
    `);
  });
}

async function noDuplicateShipments() {
  await withFixture(async (f) => {
    const key = f.manifest.request();
    await financeCall(f, "CONFIRMED", key);
    const before = await replaySnapshot(f);
    await runSql(`do $$ declare c int; ids uuid[]; begin
      select count(*), array_agg(id order by id) into c, ids from public.order_shipments where order_id = ${sql(f.orderId)} and shipment_kind = 'FULFILLMENT';
      if c <> (select count(*) from public.proforma_fulfillment_groups pg join public.payments p on p.proforma_id = pg.proforma_id where p.id = ${sql(f.paymentId)}) then
        raise exception 'f016_initial_shipment_groups';
      end if;
    end $$;`);
    await financeCall(f, "CONFIRMED", key);
    assertSnapshotEqual(before, await replaySnapshot(f));
    await runSql(`do $$ begin
      if (select count(*) from public.order_shipments where order_id = ${sql(f.orderId)} and shipment_kind = 'FULFILLMENT') <> (select count(*) from public.proforma_fulfillment_groups pg join public.payments p on p.proforma_id = pg.proforma_id where p.id = ${sql(f.paymentId)}) then
        raise exception 'f016_duplicate_shipment';
      end if;
    end $$;`);
  });
}

async function invoiceExactOnce() {
  await withFixture(async (f) => {
    const key = f.manifest.request();
    await financeCall(f, "CONFIRMED", key);
    const before = await replaySnapshot(f);
    await runSql(`do $$ declare invoice_id uuid; begin
      select id into invoice_id from public.tax_invoices where order_id = ${sql(f.orderId)};
      if invoice_id is null or (select count(*) from public.tax_invoices where order_id = ${sql(f.orderId)}) <> 1
         or exists (select 1 from public.tax_invoices ti join public.payments p on p.id = ${sql(f.paymentId)} where ti.id = invoice_id and (ti.proforma_id <> p.proforma_id or ti.status = 'VOID' or (ti.snapshot->>'buyer_total')::numeric <> (select buyer_total from public.proforma_invoices where id = p.proforma_id))) then
        raise exception 'f016_invoice_exact_once';
      end if;
    end $$;`);
    await financeCall(f, "CONFIRMED", key);
    assertSnapshotEqual(before, await replaySnapshot(f));
    await runSql(`do $$ begin
      if (select count(*) from public.tax_invoices where order_id = ${sql(f.orderId)}) <> 1 then
        raise exception 'f016_invoice_replay_duplicate';
      end if;
    end $$;`);
  });
}

async function noInvoiceOnReject() {
  await withFixture(async (f) => {
    const key = f.manifest.request();
    await financeCall(f, "REJECTED", key);
    await assertTerminal(f, "REJECTED");
    await financeCall(f, "REJECTED", key);
    await runSql(`do $$ begin
      if exists (select 1 from public.tax_invoices where order_id = ${sql(f.orderId)}) then
        raise exception 'f016_reject_invoice';
      end if;
    end $$;`);
  });
}

async function ownershipExactOnce() {
  await withFixture(async (f) => {
    const key = f.manifest.request();
    await financeCall(f, "CONFIRMED", key);
    await runSql(`do $$ begin
      if exists (
        select 1 from public.inventory_reservation_items ri
        join public.inventory_positions ip on ip.id = ri.inventory_position_id
        join public.coffee_offers co on co.id = ri.offer_id
        join public.proforma_invoice_items pii on pii.offer_id = ri.offer_id
        join public.payments p on p.id = ${sql(f.paymentId)}
        where ri.reservation_id = ${sql(f.reservationId)}
          and pii.proforma_id = p.proforma_id
          and not exists (
            select 1 from public.inventory_ownership_events e
            join public.orders o on o.id = ${sql(f.orderId)}
            where e.correlation_id = o.id
              and e.lot_id = ip.lot_id
              and e.from_organization_id = co.seller_organization_id
              and e.to_organization_id = o.buyer_organization_id
              and e.warehouse_id = ip.warehouse_id
              and e.warehouse_location_id is not distinct from ip.warehouse_location_id
              and e.quantity_kg = ri.quantity_kg
              and e.event_type = case when pii.seller_type_snapshot = 'HILLS' then 'SALE' else 'RESALE' end
          )
      ) or (select count(*) from public.inventory_ownership_events where correlation_id = ${sql(f.orderId)} and reason = 'FINANCE_CONFIRMATION') <> (select count(*) from public.inventory_reservation_items where reservation_id = ${sql(f.reservationId)}) then
        raise exception 'f016_ownership_exact_once';
      end if;
    end $$;`);
    await financeCall(f, "CONFIRMED", key);
    await runSql(`do $$ begin
      if (select count(*) from public.inventory_ownership_events where correlation_id = ${sql(f.orderId)} and reason = 'FINANCE_CONFIRMATION') <> (select count(*) from public.inventory_reservation_items where reservation_id = ${sql(f.reservationId)}) then
        raise exception 'f016_ownership_replay_duplicate';
      end if;
    end $$;`);
  });
}

async function noOwnershipOnReject() {
  await withFixture(async (f) => {
    const key = f.manifest.request();
    await financeCall(f, "REJECTED", key);
    await financeCall(f, "REJECTED", key);
    await runSql(`do $$ begin
      if exists (select 1 from public.inventory_ownership_events where correlation_id = ${sql(f.orderId)})
         or exists (select 1 from public.inventory_ownership_events e join public.orders o on o.id = ${sql(f.orderId)} where e.to_organization_id = o.buyer_organization_id and e.reason = 'FINANCE_CONFIRMATION') then
        raise exception 'f016_reject_ownership';
      end if;
    end $$;`);
  });
}

// Live scenarios.

const migrationPath="supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql";
const rollbackPath="supabase/rollback/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.rollback.sql";
const postflightPath="supabase/maintenance/20261002_feature_016_review_postflight.sql";
const sourceAt=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
async function featureApplied():Promise<boolean>{
  return withLiveSession(async s=>{
    const rows=await s.query("select to_regprocedure('public.finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)') is not null;");
    return rows[0][0]==="t";
  });
}
async function inspectFeatureState(applied:boolean):Promise<void>{
  await runSql(`do $$ begin
    if (to_regprocedure('public.finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)') is not null) is distinct from ${applied}
      or (to_regprocedure('public.finance_terminal_review_integrity(uuid,uuid,text)') is not null) is distinct from ${applied}
      or (to_regprocedure('public.finance_payment_proof_projection(uuid)') is not null) is distinct from ${applied}
      or (to_regprocedure('public.finance_payment_proof_asset_projection(uuid)') is not null) is distinct from ${applied}
      or (to_regclass('public.uq_inventory_positions_null_safe') is not null) is distinct from ${applied}
      or to_regprocedure('public.admin_review_payment(uuid,boolean,text)') is null
      or to_regprocedure('public.validate_order_transition()') is null
      or to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)') is null
      or to_regprocedure('public.prepare_payment_proof_upload(uuid,uuid,text)') is null
      or to_regprocedure('public.finalize_payment_proof(uuid,uuid,numeric,date,text,text,uuid)') is null
      then raise exception 'f016_feature_or_015_state_invalid'; end if;
    if exists(select 1 from (values
      ('order_shipments','trg_shipment_transition','validate_shipment_transition'),
      ('order_shipments','trg_order_shipments_fulfillment_guard','guard_fulfillment_shipment_fields'),
      ('shipment_items','trg_shipment_item_validate','validate_shipment_item'),
      ('orders','trg_order_transition','validate_order_transition'),
      ('orders','trg_notify_order_status_change','commerce_notify_order_status_change')
    ) expected(relation_name,trigger_name,function_name) where not exists(
      select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
      where c.relnamespace='public'::regnamespace and p.pronamespace='public'::regnamespace
        and c.relname=expected.relation_name and t.tgname=expected.trigger_name and p.proname=expected.function_name
        and not t.tgisinternal and t.tgenabled='O'))
      then raise exception 'f016_009_014_015_binding_invalid'; end if;
  end $$;`);
}
/** Injectable lifecycle permits local recovery tests without opening a connection. */
export async function rollbackReapplyLifecycle(
  execute:(sql:string)=>Promise<void>, applied:()=>Promise<boolean>, inspect:(applied:boolean)=>Promise<void>,
  sources:{rollback:string;forward:string;postflight:string}
):Promise<void>{
  await inspect(true);
  let complete=false;
  let primary:unknown;
  try {
    await execute(sources.rollback);
    await inspect(false);
    await execute(sources.forward);
    await execute(sources.postflight);
    await inspect(true);
    complete=true;
  } catch(error){primary=error;throw error;}
  finally {
    if(!complete){
      try {
        // The forward migration is guarded: never reapply it to an already-applied schema.
        if(!await applied())await execute(sources.forward);
        await execute(sources.postflight);
        await inspect(true);
      } catch(recovery){
        throw new Error("F016_FATAL_RESTORATION_FAILED: Stop live verification. An operator must inspect the approved target, restore "+migrationPath+" if absent, and run "+postflightPath+" successfully before resuming.",{cause:new AggregateError([primary,recovery],"F016 original and restoration failures")});
      }
    }
  }
}

export const F016_LIVE_SCENARIOS: ReadonlyArray<{id:number;name:string;handler:LiveScenarioHandler}> = [
{id:1,name:"Confirm happy path",handler:confirmHappy},
{id:2,name:"Reject happy path",handler:rejectHappy},
{id:3,name:"Confirm vs Confirm race",handler:() => concurrent("CONFIRMED", "CONFIRMED")},
{id:4,name:"Reject vs Reject race",handler:() => concurrent("REJECTED", "REJECTED")},
{id:5,name:"Confirm vs Reject race",handler:() => concurrent("CONFIRMED", "REJECTED")},
{id:6,name:"Same-key replay",handler:() =>
    withFixture(async (f) => {
      const k = f.manifest.request();
      const first = await financeCall(f, "CONFIRMED", k);
      const before = await replaySnapshot(f);
      const replay = await financeCall(f, "CONFIRMED", k);
      assertStableResults(first!, replay!);
      assertSnapshotEqual(before, await replaySnapshot(f));
      await assertTerminal(f, "CONFIRMED");
    })},
{id:7,name:"Same-key opposite decision",handler:() =>
    withFixture(async (f) => {
      const k = f.manifest.request();
      await financeCall(f, "CONFIRMED", k);
      await financeCall(f, "REJECTED", k, "request_id_conflict");
    })},
{id:8,name:"Same-key different payment",handler:() => withFixtureFamily(2,1,async([f,second])=>{const k=f.manifest.request();await financeCall(f,"CONFIRMED",k);await financeCall(second,"CONFIRMED",k,"request_id_conflict");})},
{id:9,name:"Different-key same terminal decision",handler:() =>
    withFixture(async (f) => {
      await financeCall(f, "CONFIRMED");
      await financeCall(f, "CONFIRMED");
    })},
{id:10,name:"Different-key opposite terminal decision",handler:() =>
    withFixture(async (f) => {
      await financeCall(f, "CONFIRMED");
      await financeCall(f, "REJECTED", f.manifest.request(), "order_already_finalized");
    })},
{id:11,name:"Missing payment review replay",handler:() => withFixture(async f=>{
const key=f.manifest.request();await financeCall(f,"CONFIRMED",key);await financeCall(f,"CONFIRMED",key);
await withOwnedMutation(f.manifest,async session=>{await session.query(`delete from public.payment_reviews where payment_id=${sql(f.paymentId)};`);});
await financeCall(f,"CONFIRMED",f.manifest.request(),"persisted_review_integrity_error");
})},
{id:12,name:"Corrupt invoice replay",handler:() => withFixture(async f=>{
const key=f.manifest.request();await financeCall(f,"CONFIRMED",key);await financeCall(f,"CONFIRMED",key);
await withOwnedMutation(f.manifest,async session=>{await session.query(`delete from public.tax_invoices where order_id=${sql(f.orderId)};`);});
await financeCall(f,"CONFIRMED",key,"persisted_review_integrity_error");
})},
{id:13,name:"Corrupt ownership replay",handler:() => withFixture(async f=>{
const key=f.manifest.request();await financeCall(f,"CONFIRMED",key);await financeCall(f,"CONFIRMED",key);
await withOwnedMutation(f.manifest,async session=>{await session.query(`delete from public.inventory_ownership_events where correlation_id=${sql(f.orderId)};`);});
await financeCall(f,"CONFIRMED",key,"persisted_review_integrity_error");
})},
{id:14,name:"Corrupt shipment replay",handler:() => withFixture(async f=>{
const key=f.manifest.request();await financeCall(f,"CONFIRMED",key);await financeCall(f,"CONFIRMED",key);
await withOwnedMutation(f.manifest,async session=>{await session.query(`delete from public.shipment_items where shipment_id in(select id from public.order_shipments where order_id=${sql(f.orderId)});`);await session.query(`delete from public.order_shipments where order_id=${sql(f.orderId)};`);});
await financeCall(f,"CONFIRMED",key,"persisted_review_integrity_error");
})},
{id:15,name:"Inventory conservation",handler:inventoryConservation},
{id:16,name:"NULL-location buyer-position concurrency",handler:nullLocationConcurrency},
{id:17,name:"Multi-fulfillment-group shipment membership",handler:()=>withFixture(async f=>{
await financeCall(f,"CONFIRMED");await assertTerminal(f,"CONFIRMED");
await runSql(`do $$ declare g record; shipment uuid; begin
if(select count(*) from public.proforma_fulfillment_groups where proforma_id=(select proforma_id from public.payments where id=${sql(f.paymentId)}))<2 then raise exception 'f016_multigroup_fixture_invalid'; end if;
for g in select * from public.proforma_fulfillment_groups where proforma_id=(select proforma_id from public.payments where id=${sql(f.paymentId)}) loop
if(select count(*) from public.order_shipments where order_id=${sql(f.orderId)} and shipment_kind='FULFILLMENT' and proforma_fulfillment_group_id=g.id)<>1 then raise exception 'f016_group_shipment_count'; end if;
select id into shipment from public.order_shipments where order_id=${sql(f.orderId)} and proforma_fulfillment_group_id=g.id;
if exists(select 1 from public.order_shipments where id=shipment and (fulfillment_seller_organization_id is distinct from g.seller_organization_id or fulfillment_warehouse_id is distinct from g.warehouse_id)) then raise exception 'f016_group_provenance'; end if;
if(select jsonb_agg(jsonb_build_array(order_item_id,planned_quantity_kg) order by order_item_id) from public.shipment_items where shipment_id=shipment)
is distinct from(select jsonb_agg(jsonb_build_array(order_item_id,quantity_kg) order by order_item_id) from public.proforma_invoice_items where fulfillment_group_id=g.id) then raise exception 'f016_exact_group_membership_or_quantity'; end if;
end loop;
if(select count(*) from public.order_shipments where order_id=${sql(f.orderId)} and shipment_kind='FULFILLMENT')<>(select count(*) from public.proforma_fulfillment_groups where proforma_id=(select proforma_id from public.payments where id=${sql(f.paymentId)})) then raise exception 'f016_extra_shipment'; end if;
end $$;`);
},2)},
{id:18,name:"No duplicate shipments",handler:noDuplicateShipments},
{id:19,name:"Invoice exact-once",handler:invoiceExactOnce},
{id:20,name:"No invoice on reject",handler:noInvoiceOnReject},
{id:21,name:"Ownership exact-once",handler:ownershipExactOnce},
{id:22,name:"No ownership on reject",handler:noOwnershipOnReject},
{id:23,name:"Payment-proof-submitted notification",handler:() =>
    withFixture(async (f) => {
      await runSql(`do $$ begin
        if (select count(*) from public.notifications where entity_id = ${sql(f.orderId)} and notification_type = 'PAYMENT_PROOF_SUBMITTED') <> 1 then
          raise exception 'f016_pending_notification';
        end if;
      end $$;`);
    })},
{id:24,name:"Confirmed/rejected buyer notification",handler:async()=>{
for(const decision of ["CONFIRMED","REJECTED"] as const) await withFixture(async f=>{
const key=f.manifest.request(),event=decision==="CONFIRMED"?"PAYMENT_CONFIRMED":"PAYMENT_REJECTED";
await financeCall(f,decision,key);
const check=()=>runSql(`do $$ declare expected uuid; actual uuid[]; begin
select created_by into expected from public.orders where id=${sql(f.orderId)};
select array_agg(user_id order by user_id) into actual from public.notifications where entity_id=${sql(f.orderId)} and notification_type=${sql(event)};
if actual is distinct from array[expected] or exists(select 1 from public.notifications where entity_id=${sql(f.orderId)} and notification_type=${sql(event)} and(entity_type<>'orders' or organization_id is distinct from ${sql(f.buyerOrganizationId)}::uuid)) then raise exception 'f016_buyer_recipient_or_tenant_or_duplicate'; end if;
end $$;`);
await check();await financeCall(f,decision,key);await check();
});
}},
{id:25,name:"Warehouse handoff notification",handler:warehouseHandoffNotification},
{id:26,name:"Injected CONFIRM rollback",handler:async () => {
    await withFixture(async (f) => {
      const before = await inventorySnapshot(f);
      await financeCall(f, "CONFIRMED", f.manifest.request(), "f016_test_failpoint_after_review_mutations", true);
      await assertFailedReviewRollback(f, "confirm");
      assertSnapshotEqual(before, await inventorySnapshot(f));
    });
  }},
{id:27,name:"Injected REJECT rollback",handler:async () => {
    await withFixture(async (f) => {
      const before = await inventorySnapshot(f);
      await financeCall(f, "REJECTED", f.manifest.request(), "f016_test_failpoint_after_review_mutations", true);
      await assertFailedReviewRollback(f, "reject");
      assertSnapshotEqual(before, await inventorySnapshot(f));
    });
  }},
{id:28,name:"Rollback, reapply, and postflight",handler:async () => {
    await rollbackReapplyLifecycle(runSql,featureApplied,inspectFeatureState,{
      rollback:sourceAt(rollbackPath),forward:sourceAt(migrationPath),postflight:sourceAt(postflightPath)
    });
  }},
{id:29,name:"Fixture cleanup and final state",handler:()=>withFixture(async f=>{
  await financeCall(f,"CONFIRMED");
  await cleanupLiveFixture(f.manifest);
  await cleanupLiveFixture(f.manifest);
  await assertManifestAbsent(f.manifest);
  await runSql(sourceAt(postflightPath));
  await inspectFeatureState(true);
})},
];
export async function runF016LiveScenario(id:number):Promise<void>{const scenario=F016_LIVE_SCENARIOS.find(s=>s.id===id);if(!scenario)throw new Error('Unknown F016 live scenario');await scenario.handler();}


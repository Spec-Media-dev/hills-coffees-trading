/**
 * Feature 013 T055 (MP-6) — the M2e live proof as ONE PostgreSQL `DO` block, executed against the linked project by
 * `tests/commerce/outbox-table.live.test.ts` (F013_LIVE=1) through `supabase db query --linked`.
 *
 * Same method as T037/T043/T049 (T035 F4, owner-approved one-transaction setup). No client role and not even service_role
 * can write the outbox or execute the emitter (by design), so events are emitted by the owner session and by a temporary
 * owner-run SECURITY DEFINER "commerce step" created inside the transaction. The block always ends in
 * `raise exception 'T055_RESULT:<base64 json>'`, so every event, the temporary function and the temporary platform-admin
 * grant roll back atomically. Nothing persists except possibly sequence/xid consumption.
 *
 * Identities (existing Foundation fixtures, read-only outside the transaction): the buyer-only user (authorized buyer) and
 * the buyer-and-seller user (seller; a platform admin only inside one savepoint). Fixture aggregate ids: 13000000-…-0000000006xx.
 */
import { sqlLiteral as q, t037Check as check, t037Refused as refused } from "./t037-snapshot-proof";
import { T049_EXISTING } from "./t049-pricing-inputs-proof";

export const T055 = {
  aggregate: "13000000-0000-4000-8000-000000000601",
  aggregateOther: "13000000-0000-4000-8000-000000000602",
  aggregateDefiner: "13000000-0000-4000-8000-000000000603",
  aggregateProbe: "13000000-0000-4000-8000-000000000604",
} as const;
export const T055_EXISTING = { buyerUser: T049_EXISTING.buyerUser, sellerUser: T049_EXISTING.sellerUser } as const;
/** Values that must never reach the outbox. */
export const T055_SECRETS = ["AE070331234567890123456", "payment-proofs/t055.pdf", "T055 call the finance desk"];

const X = T055;
const E = T055_EXISTING;
const EMIT = "public.emit_notification_event(text,text,uuid,text,jsonb,text,jsonb)";
const STEP = "public.__t055_commerce_step(uuid, text)";

export function buildT055ProofSql(): string {
  const claims = (uid: string) => `perform set_config('request.jwt.claims', ${q(JSON.stringify({ sub: uid, role: "authenticated" }))}, true);`;
  const emit = (o: { type?: string; agg?: string; id?: string; key?: string; audience?: string; template?: string; params?: string | null } = {}) =>
    `public.emit_notification_event(${q(o.type ?? "order.awaiting_transfer")}, ${q(o.agg ?? "order")}, ${o.id === "null" ? "null" : `'${o.id ?? X.aggregateProbe}'`}, ${q(o.key ?? "T055-probe")},
       ${q(o.audience ?? '{"rule": "buyer_org_members"}')}::jsonb, ${q(o.template ?? "awaiting_transfer")}, ${o.params === null ? "null" : `${q(o.params ?? '{"order_code": "ORD-T055"}')}::jsonb`})`;
  const grantAdmin = `insert into public.platform_admins (user_id, role, is_active, created_by) values ('${E.sellerUser}', 'ADMIN', true, '${E.sellerUser}');`;
  /** The statement must be refused with `permission denied` for the given role. */
  const denied = (name: string, who: string, sql: string, extraSetup = "") => `
  begin
    ${extraSetup}
    ${who === "anon" || who === "service_role" ? "" : claims(who)}
    execute 'set local role ${who === "anon" ? "anon" : who === "service_role" ? "service_role" : "authenticated"}';
    execute ${q(sql)};
    raise exception 'T055_NO_ERROR';
  exception when others then
    r := r || jsonb_build_array(jsonb_build_object('case', ${q(name)}, 'ok', position('permission denied' in sqlerrm) > 0, 'got', sqlerrm));
  end;`;
  const everyRole: [string, string, string][] = [
    ["ANON", "anon", ""],
    ["BUYER (authenticated)", E.buyerUser, ""],
    ["SELLER (authenticated)", E.sellerUser, ""],
    ["PLATFORM ADMIN (authenticated, temporary grant)", E.sellerUser, grantAdmin],
    ["SERVICE_ROLE", "service_role", ""],
  ];
  const accessCases = everyRole.map(([label, who, setup]) => [
    denied(`${label}: SELECT from notification_events is refused`, who, "select * from public.notification_events", setup),
    denied(`${label}: COUNT on notification_events is refused`, who, "select count(*) from public.notification_events", setup),
    denied(`${label}: INSERT into notification_events is refused`, who,
      `insert into public.notification_events (event_type, aggregate_type, aggregate_id, dedupe_key, audience, template_key) values ('order.expired', 'order', '${X.aggregateProbe}', 'T055-direct', '{}', 'order_expired')`, setup),
    denied(`${label}: UPDATE on notification_events is refused`, who, "update public.notification_events set status = 'PENDING'", setup),
    denied(`${label}: DELETE from notification_events is refused`, who, "delete from public.notification_events", setup),
    denied(`${label}: EXECUTE emit_notification_event directly is refused`, who, `select ${emit({ key: "T055-client" })}`, setup),
  ].join("\n")).join("\n");

  return `do $t055$
declare
  r jsonb := '[]'::jsonb;
  v_got text;
  v_detail text;
  v_constraint text;
  v_first uuid;
  v_second uuid;
  v_other uuid;
  v_step1 uuid;
  v_step2 uuid;
  v_pre_events bigint := (select count(*) from public.notification_events);
begin
  -- 0. Starting point.
  ${check("STATE: the outbox is empty before the proof", "v_pre_events = 0", "v_pre_events")}
  ${check("STATE: bank_transfer_checkout_enabled is false", "not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)")}

  -- 1. Privilege catalogue: no API role holds anything on the outbox or the emitter.
  ${check("GRANTS: anon, authenticated and service_role hold no table privilege on notification_events",
    `not exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) g where has_table_privilege(g, 'public.notification_events', 'select, insert, update, delete, truncate, references, trigger'))`)}
  ${check("GRANTS: anon, authenticated and service_role cannot EXECUTE emit_notification_event; it is SECURITY INVOKER",
    `not exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) g where has_function_privilege(g, '${EMIT}', 'execute'))
     and not (select prosecdef from pg_proc where oid = '${EMIT}'::regprocedure)`)}
  ${check("GRANTS: RLS enabled + forced and no policy on notification_events",
    `(select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.notification_events'::regclass) and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_events')`)}

  -- 2. Duplicate emission is a no-op (owner session = the internal path).
  v_first := ${emit({ id: X.aggregate, key: "T055-v1", params: '{"order_code": "ORD-T055", "deadline": "2026-10-01T00:00:00Z"}' })};
  v_second := ${emit({ id: X.aggregate, key: "T055-v1", params: '{"order_code": "ORD-T055-CHANGED"}' })};
  ${check("DEDUPE: a second emit with the same (event_type, aggregate_id, dedupe_key) returns the SAME event id", "v_first is not null and v_first = v_second", "coalesce(v_first::text, 'null') || ' / ' || coalesce(v_second::text, 'null')")}
  ${check("DEDUPE: exactly one event exists for that key", `(select count(*) from public.notification_events where event_type = 'order.awaiting_transfer' and aggregate_id = '${X.aggregate}' and dedupe_key = 'T055-v1') = 1`,
    `(select count(*) from public.notification_events where aggregate_id = '${X.aggregate}')`)}
  ${check("DEDUPE: the duplicate did not overwrite the stored params; the event is PENDING with 0 attempts",
    `(select params ->> 'order_code' = 'ORD-T055' and status = 'PENDING' and attempts = 0 and processed_at is null and claimed_at is null from public.notification_events where id = v_first)`,
    `(select params::text || ' ' || status from public.notification_events where id = v_first)`)}
  v_other := ${emit({ id: X.aggregate, key: "T055-v2" })};
  ${check("DEDUPE: a different dedupe_key for the same aggregate is a new event", `v_other is not null and v_other <> v_first and (select count(*) from public.notification_events where aggregate_id = '${X.aggregate}') = 2`)}
  perform ${emit({ id: X.aggregate, key: "T055-v1", type: "order.expired", template: "order_expired" })};
  ${check("DEDUPE: a different event_type with the same aggregate and key is a new event", `(select count(*) from public.notification_events where aggregate_id = '${X.aggregate}') = 3`)}
  ${refused("DEDUPE: the unique constraint refuses a direct duplicate row", `insert into public.notification_events (event_type, aggregate_type, aggregate_id, dedupe_key, audience, template_key) values ('order.awaiting_transfer', 'order', '${X.aggregate}', 'T055-v1', '{}', 'awaiting_transfer');`, "notification_events_dedupe_key")}

  -- 3. The designed path: an owner-run SECURITY DEFINER commerce function, called by an authenticated member, emits.
  create function public.__t055_commerce_step(p_order uuid, p_key text) returns uuid
    language plpgsql security definer set search_path = pg_catalog, public
    as $f$ begin return public.emit_notification_event('order.cancelled', 'order', p_order, p_key, '{"rule": "buyer_org_members"}'::jsonb, 'order_cancelled', '{"order_code": "ORD-T055"}'::jsonb); end $f$;
  revoke all on function ${STEP} from public, anon;
  grant execute on function ${STEP} to authenticated;
  begin
    ${claims(E.buyerUser)}
    execute 'set local role authenticated';
    v_step1 := public.__t055_commerce_step('${X.aggregateDefiner}', 'T055-step');
    v_step2 := public.__t055_commerce_step('${X.aggregateDefiner}', 'T055-step');
    execute 'reset role';
  exception when others then
    r := r || jsonb_build_array(jsonb_build_object('case', 'INTERNAL: the definer call raised', 'ok', false, 'got', sqlerrm));
  end;
  perform set_config('request.jwt.claims', '', true);
  ${check("INTERNAL: an authenticated buyer calling an owner-run definer commerce function emits an event", "v_step1 is not null", "coalesce(v_step1::text, 'null')")}
  ${check("INTERNAL: the same call twice is deduplicated through the definer path too (one event)", `v_step1 = v_step2 and (select count(*) from public.notification_events where aggregate_id = '${X.aggregateDefiner}') = 1`)}
  ${denied("INTERNAL: the buyer who triggered the event cannot SELECT it", E.buyerUser, `select id from public.notification_events where aggregate_id = '${X.aggregateDefiner}'`)}

  -- 4. Every client role, and service_role, is refused read/write/execute.
  ${accessCases}
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 5. Params and sensitive-data protections (as the owner: even the internal path cannot queue them).
  ${refused("PARAMS: a bank identifier (iban) is refused", `perform ${emit({ key: "T055-p1", params: `{"order_code": "ORD-T055", "iban": "${T055_SECRETS[0]}"}` })};`, "notification_events_params_check")}
  ${refused("PARAMS: a proof path is refused", `perform ${emit({ key: "T055-p2", params: `{"proof_path": "${T055_SECRETS[1]}"}` })};`, "notification_events_params_check")}
  ${refused("PARAMS: a free-text finance note is refused", `perform ${emit({ key: "T055-p3", params: `{"note": "${T055_SECRETS[2]}"}` })};`, "notification_events_params_check")}
  ${refused("PARAMS: a seller-economics key (seller_payout) is refused", `perform ${emit({ key: "T055-p4", params: '{"order_code": "ORD-T055", "seller_payout": "90.00"}' })};`, "notification_events_params_check")}
  ${refused("PARAMS: a nested object under an allowed key is refused", `perform ${emit({ key: "T055-p5", params: `{"amount": {"iban": "${T055_SECRETS[0]}"}}` })};`, "notification_events_params_check")}
  ${refused("PARAMS: an array under an allowed key is refused (strict scalar-only)", `perform ${emit({ key: "T055-p6", params: '{"order_code": ["ORD-1", "ORD-2"]}' })};`, "notification_events_params_check")}
  ${refused("PARAMS: params that are not an object are refused", `perform ${emit({ key: "T055-p7", params: '["order_code"]' })};`, "notification_events_params_check")}
  ${refused("AUDIENCE: a user list (array) instead of resolution rules is refused", `perform ${emit({ key: "T055-p8", audience: `["${E.buyerUser}"]` })};`, "notification_events_audience_check")}
  ${refused("CATALOGUE: an event_type outside the catalogue is refused", `perform ${emit({ key: "T055-p9", type: "order.shipped" })};`, "notification_events_event_type_check")}
  ${refused("CATALOGUE: a template_key outside the catalogue is refused", `perform ${emit({ key: "T055-p10", template: "custom_html" })};`, "notification_events_template_key_check")}
  ${refused("CATALOGUE: an aggregate_type outside the catalogue is refused", `perform ${emit({ key: "T055-p11", agg: "user" })};`, "notification_events_aggregate_type_check")}
  ${refused("KEY: a blank dedupe_key is refused", `perform ${emit({ key: "  " })};`, "notification_events_dedupe_key_check")}
  ${refused("KEY: a null aggregate_id is refused", `perform ${emit({ id: "null", key: "T055-p12" })};`, "null value")}
  ${refused("IMMUTABLE: an event's params cannot be changed once queued", `update public.notification_events set params = '{"order_code": "ORD-OTHER"}' where id = v_first;`, "notification_event_immutable")}
  ${refused("IMMUTABLE: an event's audience cannot be changed once queued", `update public.notification_events set audience = '{"rule": "all_users"}' where id = v_first;`, "notification_event_immutable")}
  ${refused("LIFECYCLE: PROCESSED without processed_at is refused", "update public.notification_events set status = 'PROCESSED' where id = v_first;", "notification_events_lifecycle_check")}
  ${refused("LIFECYCLE: an over-long last_error (a provider payload) is refused", "update public.notification_events set last_error = repeat('x', 501) where id = v_first;", "notification_events_last_error_check")}
  ${check("SECRETS: no refused value reached the outbox", `not exists (select 1 from public.notification_events e where (e.params::text || e.audience::text) ~ ${q(T055_SECRETS.join("|"))})`)}
  ${check("STATE: only the proof's own events exist inside the transaction (4)", `(select count(*) from public.notification_events) = 4 and not exists (select 1 from public.notification_events where aggregate_id::text not like '13000000-0000-4000-8000-0000000006%')`,
    "(select count(*) from public.notification_events)")}

  -- 6. Always roll back.
  raise exception 'T055_RESULT:%', replace(encode(convert_to(r::text, 'UTF8'), 'base64'), chr(10), '');
end
$t055$;`;
}

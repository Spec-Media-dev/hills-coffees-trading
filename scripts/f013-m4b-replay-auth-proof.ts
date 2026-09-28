/**
 * H1/B3 rollback-only proof on the pinned F013 LOCAL database: `issue_proforma` must re-authorize BEFORE an
 * idempotent replay can return a stored response. The dynamic cases cover authorization, replay, membership removal,
 * organization capability, MFA and actor isolation; the same run also structurally verifies every M4a H1 redefinition.
 *
 * ONE transaction per variant, always ROLLBACK. Only `issue_proforma` is created, EXTRACTED FROM THE MIGRATION (and, as
 * the control, the same body with the pre-fix prefix restored). No other M4b object, trigger or policy is created, and
 * no case reaches a snapshot or audit write: replays return before any write, and a first call stops at the business
 * gate (`checkout_disabled`, the global switch stays off). The stored replay response is a synthetic marker. Only case
 * labels and outcome classes (REPLAY / error code) are printed.
 */
import { readFileSync } from "node:fs";

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();
const migration = readFileSync("supabase/migrations/20260926103000_feature_013_quote_and_proforma_issuance.sql", "utf8");
const start = migration.indexOf("create or replace function public.issue_proforma(");
const end = migration.indexOf("$function$;", start);
if (start < 0 || end < 0) throw new Error("issue_proforma not found in M4b");
const fixed = migration.slice(start, end + "$function$;".length);

// The exact pre-fix prefix (reviewed SHA 3e039b07…), used only as the negative control.
const FIXED_PREFIX = `  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.commerce_flow <> 'BANK_TRANSFER_V1'
     or not public.is_org_member(v_order.buyer_organization_id) then
    raise exception 'order_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);
  v_replay := public.commerce_request_begin(p_request_id, 'issue_proforma', p_order_id);
  if v_replay is not null then return v_replay; end if;
`;
const OLD_PREFIX = `  v_replay := public.commerce_request_begin(p_request_id, 'issue_proforma', p_order_id);
  if v_replay is not null then return v_replay; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.commerce_flow <> 'BANK_TRANSFER_V1' then
    raise exception 'order_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);
`;
if (fixed.split(FIXED_PREFIX).length !== 2) throw new Error("fixed issue_proforma prefix not found exactly once");
const control = fixed.replace(FIXED_PREFIX, OLD_PREFIX);

const USERS = {
  BUYER: "debffa4e-5105-400d-b6a5-6d9c4887250a", // buyer-a, member of org …0001
  OTHER_BUYER: "919526c7-0e6b-4b9f-9a63-568da9516e1d", // buyer-b, org …0002 only
  CO_MEMBER: "a006f18f-51a8-4267-8a05-23b72b1c2465", // seller-s1, given a TEMPORARY org …0001 membership
} as const;
const ORG_A = "13000000-0000-4000-8000-000000000001";
const ID = {
  order: "13000000-0000-4000-8000-00000000b301", missingOrder: "13000000-0000-4000-8000-00000000b3ff",
  firstRequest: "13000000-0000-4000-8000-00000000b311", storedRequest: "13000000-0000-4000-8000-00000000b312",
  factor: "13000000-0000-4000-8000-00000000b321", destination: "13000000-0000-4000-8000-00000000b331",
} as const;
const MARKER = "F013_B3_SYNTHETIC_STORED_RESPONSE";

type Case = { label: string; setup?: string; uid: string; aal?: string; order?: string; request: string; teardown?: string; fixed: string; old: string };
const CASES: Case[] = [
  { label: "A  authorized buyer, first call (passes auth; stops at the off checkout switch)", uid: USERS.BUYER, request: ID.firstRequest, fixed: "checkout_disabled", old: "checkout_disabled" },
  { label: "B  same still-authorized buyer replays", uid: USERS.BUYER, request: ID.storedRequest, fixed: "REPLAY", old: "REPLAY" },
  { label: "C  buyer's membership deactivated, replays",
    setup: `update public.organization_members set is_active = false where organization_id = '${ORG_A}' and user_id = '${USERS.BUYER}';`,
    teardown: `update public.organization_members set is_active = true where organization_id = '${ORG_A}' and user_id = '${USERS.BUYER}';`,
    uid: USERS.BUYER, request: ID.storedRequest, fixed: "order_not_found", old: "REPLAY" },
  { label: "C2 buyer organization suspended (no longer can-buy), replays",
    setup: `update public.organizations set status = 'SUSPENDED' where id = '${ORG_A}';`,
    teardown: `update public.organizations set status = 'ACTIVE' where id = '${ORG_A}';`,
    uid: USERS.BUYER, request: ID.storedRequest, fixed: "buyer_not_authorized", old: "REPLAY" },
  { label: "D  buyer has a verified factor but an aal1 session, replays",
    setup: `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values ('${ID.factor}', '${USERS.BUYER}', 'f013-b3-proof', 'totp', 'verified', now(), now());`,
    teardown: `delete from auth.mfa_factors where id = '${ID.factor}';`,
    uid: USERS.BUYER, aal: "aal1", request: ID.storedRequest, fixed: "mfa_step_up_required", old: "REPLAY" },
  { label: "D2 same verified factor with an aal2 session, replays",
    setup: `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values ('${ID.factor}', '${USERS.BUYER}', 'f013-b3-proof', 'totp', 'verified', now(), now());`,
    teardown: `delete from auth.mfa_factors where id = '${ID.factor}';`,
    uid: USERS.BUYER, aal: "aal2", request: ID.storedRequest, fixed: "REPLAY", old: "REPLAY" },
  { label: "E1 other organization's buyer replays the stored request id", uid: USERS.OTHER_BUYER, request: ID.storedRequest, fixed: "order_not_found", old: "request_id_conflict" },
  { label: "E2 co-member of the same organization replays the stored request id",
    setup: `insert into public.organization_members (organization_id, user_id, is_active) values ('${ORG_A}', '${USERS.CO_MEMBER}', true);`,
    teardown: `delete from public.organization_members where organization_id = '${ORG_A}' and user_id = '${USERS.CO_MEMBER}';`,
    uid: USERS.CO_MEMBER, request: ID.storedRequest, fixed: "request_id_conflict", old: "request_id_conflict" },
  { label: "N  nonexistent order (same code as E1: non-enumeration)", uid: USERS.OTHER_BUYER, order: ID.missingOrder, request: ID.storedRequest, fixed: "order_not_found", old: "request_id_conflict" },
];

const call = (c: Case, index: number) => `${c.setup ?? ""}
insert into pg_temp.b3_result values (${index}, pg_temp.b3_call('${c.uid}', '${c.aal ?? "aal1"}', '${c.order ?? ID.order}', '${c.request}'));
${c.teardown ?? ""}`;

function run(variant: "fixed" | "old"): Map<number, string> {
  const body = variant === "fixed" ? fixed : control;
  const sql = `begin;
set local lock_timeout = '5s';
do $identity$ begin
  if to_regclass('f013_local.identity') is null then raise exception 'f013_b3_proof_not_local_target'; end if;
  if to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is not null then raise exception 'f013_b3_proof_m4b_already_present'; end if;
  if exists (select 1 from public.commerce_settings where id and bank_transfer_checkout_enabled) then raise exception 'f013_b3_proof_checkout_enabled'; end if;
end $identity$;
create temp table b3_result (probe int, outcome text) on commit drop;
create function pg_temp.b3_call(p_uid uuid, p_aal text, p_order uuid, p_request uuid) returns text language plpgsql as $f$
declare v_out text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    v_out := public.issue_proforma(p_order, '${ID.destination}', null, p_request)::text;
    v_out := case when v_out like '%${MARKER}%' then 'REPLAY' else 'OTHER_RESULT' end;
  exception when others then v_out := sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end $f$;

${body}
revoke all on function public.issue_proforma(uuid,uuid,text,uuid) from public, anon, service_role;
grant execute on function public.issue_proforma(uuid,uuid,text,uuid) to authenticated;

insert into public.orders (id, buyer_organization_id, created_by) values ('${ID.order}', '${ORG_A}', '${USERS.BUYER}');
insert into public.commerce_request_log (request_id, actor_user_id, operation, target_id, response)
  values ('${ID.storedRequest}', '${USERS.BUYER}', 'issue_proforma', '${ID.order}', jsonb_build_object('stored', '${MARKER}'));

${CASES.map(call).join("\n")}
\\pset format unaligned
\\pset tuples_only on
select 'RESULT', probe, outcome from pg_temp.b3_result order by probe;
rollback;
`;
  const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
  if (!/ROLLBACK\s*$/m.test(result.stdout)) throw new Error(`B3 ${variant} proof did not roll back`);
  return new Map(result.stdout.split(/\r?\n/).filter((line) => line.startsWith("RESULT|"))
    .map((line) => line.split("|")).map(([, probe, outcome]) => [Number(probe), outcome!]));
}

let failed = false;
for (const variant of ["fixed", "old"] as const) {
  const outcomes = run(variant);
  if (outcomes.size !== CASES.length) throw new Error(`B3 ${variant} proof returned ${outcomes.size}/${CASES.length} results`);
  console.log(variant === "fixed" ? "M4b issue_proforma (fixed):" : "Negative control (pre-fix authorization order):");
  CASES.forEach((c, index) => {
    const got = outcomes.get(index)!;
    const want = c[variant];
    const ok = got === want;
    failed ||= !ok;
    console.log(`  ${ok ? "PASS" : "FAIL"} ${c.label}: ${got} (expected ${want})`);
  });
}

const after = runF013DockerPsqlStdin(Buffer.from(`begin read only;
\\pset format unaligned
\\pset tuples_only on
select 'CLEAN', to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is null
  and not exists (select 1 from public.orders where id = '${ID.order}')
  and not exists (select 1 from public.commerce_request_log where request_id in ('${ID.firstRequest}', '${ID.storedRequest}'))
  and not exists (select 1 from auth.mfa_factors where id = '${ID.factor}')
  and exists (select 1 from public.organization_members where organization_id = '${ORG_A}' and user_id = '${USERS.BUYER}' and is_active)
  and not exists (select 1 from public.organization_members where organization_id = '${ORG_A}' and user_id = '${USERS.CO_MEMBER}')
  and exists (select 1 from public.organizations where id = '${ORG_A}' and status = 'ACTIVE' and can_buy);
rollback;
`, "utf8"), process.env.F013_DOCKER_PATH, process.env);
const clean = after.stdout.includes("CLEAN|t");
failed ||= !clean;
console.log(`${clean ? "PASS" : "FAIL"} both transactions rolled back: no function, order, request-log row, factor or membership change remains`);
if (failed) throw new Error("B3 replay-authorization proof failed");

function functionBody(name: string): string {
  const functionStart = migration.indexOf(`create or replace function public.${name}(`);
  const functionEnd = migration.indexOf("$function$;", functionStart);
  if (functionStart < 0 || functionEnd < 0) throw new Error(`H1 function ${name} not found in M4b`);
  return migration.slice(functionStart, functionEnd);
}
const h1Requirements: Array<[string, string]> = [
  ["add_cart_line", "commerce_assert_buyer_member"],
  ["upsert_delivery_destination", "commerce_assert_buyer_member"],
  ["retire_delivery_destination", "commerce_assert_buyer_member"],
  ["update_commerce_settings", "is_platform_admin"],
  ["set_default_payment_account", "is_platform_admin"],
  ["admin_convert_legacy_draft", "is_platform_admin"],
  ["issue_proforma", "commerce_assert_buyer_member"],
];
for (const [name, authorization] of h1Requirements) {
  const definition = functionBody(name);
  const authAt = definition.indexOf(authorization);
  const replayAt = definition.indexOf("commerce_request_begin");
  const oneReplay = (definition.match(/commerce_request_begin\(/g) ?? []).length === 1;
  const ok = authAt >= 0 && replayAt >= 0 && authAt < replayAt && oneReplay;
  console.log(`${ok ? "PASS" : "FAIL"} H1 ${name}: current authorization precedes the only replay lookup`);
  failed ||= !ok;
}
if (failed) throw new Error("H1/B3 replay-authorization proof failed");
console.log("H1/B3 proven on LOCAL: replay requires current authorization; every protected M4a/M4b replay path places it before the request log; the pre-fix order leaked the stored response.");

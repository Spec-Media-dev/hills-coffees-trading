/**
 * H1 applied-state LOCAL proof. Every call below invokes an already-applied protected RPC; the
 * transaction creates only synthetic request-log fixtures and always rolls back. No function body,
 * policy, view, migration, or fixture baseline is installed or changed.
 */
import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();

const USER = {
  buyer: "debffa4e-5105-400d-b6a5-6d9c4887250a",
  otherBuyer: "919526c7-0e6b-4b9f-9a63-568da9516e1d",
  admin: "e50e4106-41f4-44f5-891a-46ec8ffb1abe",
} as const;
const ID = {
  org: "13000000-0000-4000-8000-000000000001",
  offer: "13000000-0000-4000-8000-000000000063",
  account: "13000000-0000-4000-8000-000000000071",
  destination: "13000000-0000-4000-8000-00000000b331",
  order: "13000000-0000-4000-8000-00000000b301",
  buyerFactor: "13000000-0000-4000-8000-00000000b321",
  adminFactor: "13000000-0000-4000-8000-00000000b322",
} as const;
const REQUEST = {
  add: "13000000-0000-4000-8000-00000000b311",
  upsert: "13000000-0000-4000-8000-00000000b312",
  retire: "13000000-0000-4000-8000-00000000b313",
  settings: "13000000-0000-4000-8000-00000000b314",
  payment: "13000000-0000-4000-8000-00000000b315",
  convert: "13000000-0000-4000-8000-00000000b316",
} as const;
type Operation = keyof typeof REQUEST;
type Expected = "REPLAY" | "buyer_not_authorized" | "destination_not_found" | "mfa_step_up_required" | "forbidden";
type Probe = { label: string; operation: Operation; user: keyof typeof USER; aal: "aal1" | "aal2"; expected: Expected };

const buyerOperations: Operation[] = ["add", "upsert", "retire"];
const adminOperations: Operation[] = ["settings", "payment", "convert"];
const probes: Probe[] = [];
for (const operation of buyerOperations) {
  probes.push(
    { label: `${operation}: authorized buyer replay`, operation, user: "buyer", aal: "aal2", expected: "REPLAY" },
    { label: `${operation}: removed membership cannot replay`, operation, user: "buyer", aal: "aal2", expected: operation === "retire" ? "destination_not_found" : "buyer_not_authorized" },
    { label: `${operation}: suspended organization cannot replay`, operation, user: "buyer", aal: "aal2", expected: "buyer_not_authorized" },
    { label: `${operation}: insufficient MFA cannot replay`, operation, user: "buyer", aal: "aal1", expected: "mfa_step_up_required" },
    { label: `${operation}: another actor cannot retrieve replay`, operation, user: "otherBuyer", aal: "aal2", expected: operation === "retire" ? "destination_not_found" : "buyer_not_authorized" },
  );
}
for (const operation of adminOperations) {
  probes.push(
    { label: `${operation}: authorized admin replay`, operation, user: "admin", aal: "aal2", expected: "REPLAY" },
    { label: `${operation}: insufficient MFA cannot replay`, operation, user: "admin", aal: "aal1", expected: "mfa_step_up_required" },
    { label: `${operation}: another actor cannot retrieve replay`, operation, user: "otherBuyer", aal: "aal2", expected: "forbidden" },
  );
}

const invoke = (probe: Probe, index: number) => `insert into pg_temp.h1_results values (${index}, pg_temp.h1_call('${probe.operation}', '${USER[probe.user]}', '${probe.aal}', '${REQUEST[probe.operation]}'));`;
const byOperation = (operation: Operation, predicate: (probe: Probe) => boolean) => probes
  .map((probe, index) => ({ probe, index })).filter(({ probe }) => probe.operation === operation && predicate(probe))
  .map(({ probe, index }) => invoke(probe, index)).join("\n");
const ordinary = (operation: Operation) => byOperation(operation, (probe) => probe.label.includes("authorized") || probe.label.includes("another actor") || probe.label.includes("insufficient MFA"));
const membership = (operation: Operation) => byOperation(operation, (probe) => probe.label.includes("removed membership"));
const suspended = (operation: Operation) => byOperation(operation, (probe) => probe.label.includes("suspended organization"));

const sql = `begin;
set local lock_timeout = '5s';
do $identity$ begin
  if to_regclass('f013_local.identity') is null then raise exception 'f013_h1_proof_not_local_target'; end if;
  if not (to_regprocedure('public.add_cart_line(uuid,uuid,numeric,uuid)') is not null
    and to_regprocedure('public.upsert_delivery_destination(uuid,uuid,jsonb,uuid)') is not null
    and to_regprocedure('public.retire_delivery_destination(uuid,uuid)') is not null
    and to_regprocedure('public.update_commerce_settings(integer,boolean,boolean,uuid,uuid[])') is not null
    and to_regprocedure('public.set_default_payment_account(uuid,uuid)') is not null
    and to_regprocedure('public.admin_convert_legacy_draft(uuid,uuid)') is not null) then
    raise exception 'f013_h1_proof_m4b_not_applied';
  end if;
end $identity$;
create temp table h1_results (probe int, outcome text) on commit drop;
create function pg_temp.h1_call(p_operation text, p_uid uuid, p_aal text, p_request uuid)
returns text language plpgsql as $f$
declare value text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    case p_operation
      when 'add' then value := public.add_cart_line('${ID.org}', '${ID.offer}', 1, p_request)::text;
      when 'upsert' then value := public.upsert_delivery_destination(null, '${ID.org}', jsonb_build_object('label', 'SYNTHETIC'), p_request)::text;
      when 'retire' then perform public.retire_delivery_destination('${ID.destination}', p_request); value := 'REPLAY';
      when 'settings' then value := public.update_commerce_settings(null, null, null, p_request, null)::text;
      when 'payment' then value := public.set_default_payment_account('${ID.account}', p_request)::text;
      when 'convert' then value := public.admin_convert_legacy_draft('${ID.order}', p_request)::text;
      else raise exception 'unknown operation';
    end case;
    if p_operation <> 'retire' and value not like '%H1_APPLIED_REPLAY%' and value <> '${ID.destination}' then value := 'OTHER_RESULT';
    elsif p_operation <> 'retire' then value := 'REPLAY'; end if;
  exception when others then value := sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return value;
end $f$;

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('${ID.buyerFactor}', '${USER.buyer}', 'f013-h1-buyer', 'totp', 'verified', now(), now()),
  ('${ID.adminFactor}', '${USER.admin}', 'f013-h1-admin', 'totp', 'verified', now(), now());
insert into public.delivery_destinations (id, organization_id, label, country_code, city, address_line_1, contact_name, contact_phone, delivery_method, created_by)
  values ('${ID.destination}', '${ID.org}', 'SYNTHETIC', 'AE', 'SYNTHETIC', 'SYNTHETIC', 'SYNTHETIC', '+97140000001', 'Courier', '${USER.buyer}');
insert into public.orders (id, buyer_organization_id, created_by, commerce_flow) values ('${ID.order}', '${ID.org}', '${USER.buyer}', 'LEGACY');
insert into public.commerce_request_log (request_id, actor_user_id, operation, target_id, response) values
  ('${REQUEST.add}', '${USER.buyer}', 'add_cart_line', '${ID.org}', jsonb_build_object('marker', 'H1_APPLIED_REPLAY')),
  ('${REQUEST.upsert}', '${USER.buyer}', 'upsert_delivery_destination', '${ID.org}', jsonb_build_object('destination_id', '${ID.destination}')),
  ('${REQUEST.retire}', '${USER.buyer}', 'retire_delivery_destination', '${ID.destination}', jsonb_build_object('marker', 'H1_APPLIED_REPLAY')),
  ('${REQUEST.settings}', '${USER.admin}', 'update_commerce_settings', null, jsonb_build_object('marker', 'H1_APPLIED_REPLAY')),
  ('${REQUEST.payment}', '${USER.admin}', 'set_default_payment_account', '${ID.account}', jsonb_build_object('marker', 'H1_APPLIED_REPLAY')),
  ('${REQUEST.convert}', '${USER.admin}', 'admin_convert_legacy_draft', '${ID.order}', jsonb_build_object('marker', 'H1_APPLIED_REPLAY'));

${ordinary("add")}
update public.organization_members set is_active = false where organization_id = '${ID.org}' and user_id = '${USER.buyer}';
${membership("add")}
update public.organization_members set is_active = true where organization_id = '${ID.org}' and user_id = '${USER.buyer}';
update public.organizations set status = 'SUSPENDED' where id = '${ID.org}';
${suspended("add")}
update public.organizations set status = 'ACTIVE' where id = '${ID.org}';

${ordinary("upsert")}
update public.organization_members set is_active = false where organization_id = '${ID.org}' and user_id = '${USER.buyer}';
${membership("upsert")}
update public.organization_members set is_active = true where organization_id = '${ID.org}' and user_id = '${USER.buyer}';
update public.organizations set status = 'SUSPENDED' where id = '${ID.org}';
${suspended("upsert")}
update public.organizations set status = 'ACTIVE' where id = '${ID.org}';

${ordinary("retire")}
update public.organization_members set is_active = false where organization_id = '${ID.org}' and user_id = '${USER.buyer}';
${membership("retire")}
update public.organization_members set is_active = true where organization_id = '${ID.org}' and user_id = '${USER.buyer}';
update public.organizations set status = 'SUSPENDED' where id = '${ID.org}';
${suspended("retire")}
update public.organizations set status = 'ACTIVE' where id = '${ID.org}';

${ordinary("settings")}
${ordinary("payment")}
${ordinary("convert")}
\\pset format unaligned
\\pset tuples_only on
select 'RESULT', probe, outcome from pg_temp.h1_results order by probe;
rollback;
`;

const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!/ROLLBACK\s*$/m.test(result.stdout)) throw new Error("H1 applied-state proof did not roll back");
const outcomes = new Map(result.stdout.split(/\r?\n/).filter((line) => line.startsWith("RESULT|"))
  .map((line) => line.split("|")).map(([, index, outcome]) => [Number(index), outcome!]));
if (outcomes.size !== probes.length) throw new Error(`H1 applied-state proof returned ${outcomes.size}/${probes.length} results`);

let failed = false;
for (const [index, probe] of probes.entries()) {
  const got = outcomes.get(index);
  const ok = got === probe.expected;
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"} ${probe.label}: ${got} (expected ${probe.expected})`);
}
for (const operation of [...buyerOperations, ...adminOperations]) {
  const stored = probes.findIndex((probe) => probe.operation === operation && probe.label.includes("another actor"));
  const expected = probes[stored]!.expected;
  const opaque = outcomes.get(stored) === expected;
  failed ||= !opaque;
  console.log(`${opaque ? "PASS" : "FAIL"} ${operation}: unauthorized caller receives the normal authorization result before replay lookup`);
}
if (failed) throw new Error("H1 applied-state proof failed");
console.log("H1 proven against the six applied LOCAL RPCs: current authorization (including MFA and organization state) precedes replay; all synthetic fixtures rolled back.");

/**
 * H2 applied-state LOCAL proof. It exercises the already-applied projection functions and grants,
 * using synthetic rows in one rolled-back transaction. It never installs, replaces, or extracts M4b objects.
 */

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();

const USERS = {
  buyer: "debffa4e-5105-400d-b6a5-6d9c4887250a",
  otherBuyer: "919526c7-0e6b-4b9f-9a63-568da9516e1d",
  seller: "a006f18f-51a8-4267-8a05-23b72b1c2465",
  finance: "99acd238-aa3b-4a59-8aeb-1b6cc5c2e191",
  admin: "e50e4106-41f4-44f5-891a-46ec8ffb1abe",
  auditor: "f265ec5f-81ed-4fc8-b77a-2fb15803a327",
} as const;
const ORG = "13000000-0000-4000-8000-000000000001";
const ORDER = "13000000-0000-4000-8000-00000000b401";

type Probe = { label: string; role: "anon" | "authenticated" | "service_role"; uid: string | null; relation: string; expected: string };
const probes: Probe[] = [
  { label: "buyer direct table", role: "authenticated", uid: USERS.buyer, relation: "public.order_financials", expected: "DENIED" },
  { label: "buyer safe projection", role: "authenticated", uid: USERS.buyer, relation: "public.v_buyer_order_financials", expected: "1" },
  { label: "buyer internal projection", role: "authenticated", uid: USERS.buyer, relation: "public.v_internal_order_financials", expected: "0" },
  { label: "other buyer safe projection", role: "authenticated", uid: USERS.otherBuyer, relation: "public.v_buyer_order_financials", expected: "0" },
  { label: "seller safe projection", role: "authenticated", uid: USERS.seller, relation: "public.v_buyer_order_financials", expected: "0" },
  { label: "seller internal projection", role: "authenticated", uid: USERS.seller, relation: "public.v_internal_order_financials", expected: "0" },
  { label: "finance internal projection", role: "authenticated", uid: USERS.finance, relation: "public.v_internal_order_financials", expected: "1" },
  { label: "admin internal projection", role: "authenticated", uid: USERS.admin, relation: "public.v_internal_order_financials", expected: "1" },
  { label: "auditor internal projection", role: "authenticated", uid: USERS.auditor, relation: "public.v_internal_order_financials", expected: "1" },
  { label: "anon direct table", role: "anon", uid: null, relation: "public.order_financials", expected: "DENIED" },
  { label: "anon safe projection", role: "anon", uid: null, relation: "public.v_buyer_order_financials", expected: "DENIED" },
  { label: "service role direct table", role: "service_role", uid: null, relation: "public.order_financials", expected: "1" },
];

const invoke = (probe: Probe, index: number) => `insert into pg_temp.h2_result values (${index}, pg_temp.h2_probe('${probe.role}', ${probe.uid ? `'${probe.uid}'` : "null"}, '${probe.relation}'));`;
const sql = `begin;
set local lock_timeout = '5s';
do $identity$ begin
  if to_regclass('f013_local.identity') is null then raise exception 'f013_h2_proof_not_local_target'; end if;
  if to_regclass('public.v_buyer_order_financials') is null
     or to_regclass('public.v_internal_order_financials') is null then
    raise exception 'f013_h2_proof_m4b_not_applied';
  end if;
end $identity$;
create temp table h2_result (probe int, seen text) on commit drop;
create function pg_temp.h2_probe(p_role text, p_uid uuid, p_relation text) returns text language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role, 'aal', 'aal1')::text, true);
  perform set_config('role', p_role, true);
  begin execute format('select count(*) from %s where order_id = %L', p_relation, '${ORDER}') into n;
  exception when insufficient_privilege then n := null; end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return coalesce(n::text, 'DENIED');
end $f$;
-- The existing immutable financials trigger permits the legacy snapshot shape without a proforma.
-- A local role switch lets the M4a insert trigger retain that synthetic LEGACY row; the transaction rolls back.
select set_config('role', 'service_role', true);
insert into public.orders (id, buyer_organization_id, created_by, commerce_flow) values ('${ORDER}', '${ORG}', '${USERS.buyer}', 'LEGACY');
select set_config('role', 'postgres', true);
insert into public.order_financials (order_id, base_subtotal, shipping_amount, vat_amount, commission_amount,
  seller_net_amount, buyer_total_amount, total_quantity_kg, currency)
values ('${ORDER}', 10, 2, 1, 3, 7, 13, 1, 'USD');
${probes.map(invoke).join("\n")}
\\pset format unaligned
\\pset tuples_only on
select 'RESULT', probe, seen from pg_temp.h2_result order by probe;
select 'BUYER_KEYS', string_agg(column_name, ',' order by column_name)
from information_schema.columns where table_schema = 'public' and table_name = 'v_buyer_order_financials';
rollback;
`;

const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!/ROLLBACK\s*$/m.test(result.stdout)) throw new Error("H2 financial-privacy proof did not roll back");
const seen = new Map(result.stdout.split(/\r?\n/).filter((line) => line.startsWith("RESULT|"))
  .map((line) => line.split("|")).map(([, index, value]) => [Number(index), value!]));
let failed = false;
probes.forEach((probe, index) => {
  const ok = seen.get(index) === probe.expected;
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"} ${probe.label}: ${seen.get(index)} (expected ${probe.expected})`);
});
const keys = result.stdout.split(/\r?\n/).find((line) => line.startsWith("BUYER_KEYS|"))?.slice("BUYER_KEYS|".length) ?? "";
const expectedKeys = "base_subtotal,buyer_total_amount,calculated_at,currency,order_id,shipping_amount,total_quantity_kg,vat_amount";
const keyOk = keys === expectedKeys;
failed ||= !keyOk;
console.log(`${keyOk ? "PASS" : "FAIL"} buyer projection key allow-list only: ${keys}`);
if (failed) throw new Error("H2 financial privacy proof failed");
console.log("H2 proven on the applied LOCAL database: direct table access is denied to API roles; buyer sees only payment totals; finance/admin/auditor receive the internal projection; transaction rolled back.");

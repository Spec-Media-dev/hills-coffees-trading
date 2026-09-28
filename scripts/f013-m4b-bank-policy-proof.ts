/**
 * Review B2 (RLS-008) applied-state proof on the pinned F013 LOCAL database.
 *
 * ONE transaction that always ends in ROLLBACK: synthetic BANK_TRANSFER_V1 orders/proformas/bank-instruction rows
 * (synthetic bank values only), then row visibility per real LOCAL fixture identity across proforma states. It tests the
 * policy already applied to LOCAL; it never installs, extracts, or replaces that policy. Only labels and row counts are
 * printed. Nothing else of M4b is executed (the row-94 guard is not involved).
 */
import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();

// LOCAL fixture identities (tests/auth/fixture-session.ts F013_FIXTURES; ids resolved on hills-f013-local).
const USERS = {
  BUYER: "debffa4e-5105-400d-b6a5-6d9c4887250a", // buyer-a, member of org …0001
  OTHER_BUYER: "919526c7-0e6b-4b9f-9a63-568da9516e1d", // buyer-b, org …0002
  SELLER: "a006f18f-51a8-4267-8a05-23b72b1c2465", // seller-s1, org …0003
  FINANCE: "99acd238-aa3b-4a59-8aeb-1b6cc5c2e191",
  ADMIN: "e50e4106-41f4-44f5-891a-46ec8ffb1abe",
  AUDITOR: "f265ec5f-81ed-4fc8-b77a-2fb15803a327",
  WAREHOUSE: "c6d4cd3c-51aa-404b-a55c-0b50c89e582a",
} as const;
const ORG_A = "13000000-0000-4000-8000-000000000001";
const PAYMENT_ACCOUNT = "13000000-0000-4000-8000-000000000071";
const ID = {
  order1: "13000000-0000-4000-8000-00000000b201", proforma1: "13000000-0000-4000-8000-00000000b211",
  order2: "13000000-0000-4000-8000-00000000b202", proforma2: "13000000-0000-4000-8000-00000000b212",
  factor: "13000000-0000-4000-8000-00000000b221",
} as const;

type Probe = { phase: string; who: string; role: string; uid: string | null; aal: string; proforma: string; expected: number };
const probes: Probe[] = [];
const add = (phase: string, proforma: string, expectations: Record<string, number>) => {
  for (const [who, expected] of Object.entries(expectations)) {
    const [identity, aal = "aal1"] = who.split("@");
    const role = identity === "ANON" ? "anon" : identity === "SERVICE_ROLE" ? "service_role" : "authenticated";
    const uid = role === "authenticated" ? USERS[identity as keyof typeof USERS] : null;
    probes.push({ phase, who, role, uid, aal, proforma, expected });
  }
};
// -1 = permission denied (no table privilege).
const DENIED = -1;
const all = (buyer: number) => ({ BUYER: buyer, OTHER_BUYER: 0, SELLER: 0, FINANCE: 1, ADMIN: 1, AUDITOR: 0, WAREHOUSE: 0, ANON: DENIED, SERVICE_ROLE: 1 });

const seen = (p: Probe) => `insert into pg_temp.b2_result values (${probes.indexOf(p)}, pg_temp.b2_seen('${p.role}', ${p.uid ? `'${p.uid}'` : "null"}, '${p.aal}', '${p.proforma}'));`;
const block = (phase: string) => probes.filter((p) => p.phase === phase).map(seen).join("\n");

add("ISSUED", ID.proforma1, all(0));
add("CONFIRMED", ID.proforma1, all(1));
add("CONFIRMED_MFA", ID.proforma1, { "BUYER@aal1": 0, "BUYER@aal2": 1 });
add("PAID", ID.proforma1, all(1));
add("EXPIRED_UNCONFIRMED", ID.proforma2, all(0));

const sql = `begin;
set local lock_timeout = '5s';
do $identity$ begin
  if to_regclass('f013_local.identity') is null then raise exception 'f013_b2_proof_not_local_target'; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proforma_bank_instructions'
                 and policyname = 'proforma_bank_instructions_read' and qual like '%CONFIRMED%PAID%') then
    raise exception 'f013_b2_proof_m4b_policy_not_applied';
  end if;
end $identity$;
create temp table b2_result (probe int, seen int) on commit drop;
create function pg_temp.b2_seen(p_role text, p_uid uuid, p_aal text, p_proforma uuid) returns int language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role, 'aal', p_aal)::text, true);
  perform set_config('role', p_role, true);
  begin
    select count(*) into n from public.proforma_bank_instructions where proforma_id = p_proforma;
  exception when insufficient_privilege then n := -1;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return n;
end $f$;
create function pg_temp.b2_masked_keys(p_uid uuid, p_proforma uuid) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
  select coalesce(string_agg(k, ',' order by k), 'NO_ROW') into v
  from public.proforma_invoices pi, jsonb_object_keys(pi.bank_account_masked) k where pi.id = p_proforma;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end $f$;

insert into public.orders (id, buyer_organization_id, created_by) values
  ('${ID.order1}', '${ORG_A}', '${USERS.BUYER}'), ('${ID.order2}', '${ORG_A}', '${USERS.BUYER}');
insert into public.proforma_invoices (id, order_id, version, status, issued_at, valid_until, validity_hours_snapshot, currency,
  tax_rule_id, tax_rate_snapshot, tax_base_snapshot, buyer_snapshot, destination_snapshot, bank_account_masked, issued_by)
select v.id, v.order_id, 1, 'ISSUED', now(), now() + make_interval(hours => 24), 24, 'USD',
  '${ID.factor}', 5, 'MERCHANDISE_ONLY',
  jsonb_build_object('legal_name', 'SYNTHETIC', 'display_name', 'SYNTHETIC', 'tax_number', null, 'country_code', 'AE'),
  jsonb_build_object('label', 'SYNTHETIC', 'country_code', 'AE', 'city', 'SYNTHETIC', 'address_lines', jsonb_build_array('SYNTHETIC'),
                     'contact_name', 'SYNTHETIC', 'contact_phone', 'SYNTHETIC', 'delivery_method', 'SYNTHETIC'),
  jsonb_build_object('bank_name', 'SYNTHETIC', 'account_name', 'SYNTHETIC', 'swift_code', 'SYNTHXXX', 'account_number_last4', '****', 'iban_last4', null),
  '${USERS.BUYER}'
from (values ('${ID.proforma1}'::uuid, '${ID.order1}'::uuid), ('${ID.proforma2}'::uuid, '${ID.order2}'::uuid)) as v(id, order_id);
insert into public.proforma_bank_instructions (proforma_id, payment_account_id, account_name, bank_name, account_number, iban, swift_code, currency, payment_reference) values
  ('${ID.proforma1}', '${PAYMENT_ACCOUNT}', 'SYNTHETIC', 'SYNTHETIC', 'SYNTHETIC00', null, 'SYNTHXXX', 'USD', 'SYNTHETIC-REF-1'),
  ('${ID.proforma2}', '${PAYMENT_ACCOUNT}', 'SYNTHETIC', 'SYNTHETIC', 'SYNTHETIC00', null, 'SYNTHXXX', 'USD', 'SYNTHETIC-REF-2');

\\pset format unaligned
\\pset tuples_only on
${block("ISSUED")}
select 'MASKED_HEADER_ISSUED', pg_temp.b2_masked_keys('${USERS.BUYER}', '${ID.proforma1}');

select set_config('app.internal_transition', 'true', true);
update public.proforma_invoices set status = 'CONFIRMED', confirmed_at = clock_timestamp(), confirmed_by = '${USERS.BUYER}' where id = '${ID.proforma1}';
select set_config('app.internal_transition', 'false', true);
${block("CONFIRMED")}

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values ('${ID.factor}', '${USERS.BUYER}', 'f013-b2-proof', 'totp', 'verified', now(), now());
${block("CONFIRMED_MFA")}
delete from auth.mfa_factors where id = '${ID.factor}';

select set_config('app.internal_transition', 'true', true);
update public.proforma_invoices set status = 'PAID' where id = '${ID.proforma1}';
update public.proforma_invoices set status = 'EXPIRED', expired_at = clock_timestamp() where id = '${ID.proforma2}';
select set_config('app.internal_transition', 'false', true);
${block("PAID")}
${block("EXPIRED_UNCONFIRMED")}

select 'RESULT', probe, seen from pg_temp.b2_result order by probe;
rollback;
`;
const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!/ROLLBACK\s*$/m.test(result.stdout)) throw new Error("B2 proof did not roll back");
const results = new Map(result.stdout.split(/\r?\n/).filter((line) => line.startsWith("RESULT|"))
  .map((line) => line.split("|")).map(([, probe, count]) => [Number(probe), Number(count)]));
if (results.size !== probes.length) throw new Error(`B2 proof produced unexpected output:\n${result.stdout}`);

let failed = false;
console.log("PASS applied M4b policy was present before synthetic probe rows were created");
const masked = result.stdout.split(/\r?\n/).find((line) => line.startsWith("MASKED_HEADER_ISSUED|"));
const maskedOk = masked === "MASKED_HEADER_ISSUED|account_name,account_number_last4,bank_name,iban_last4,swift_code";
failed ||= !maskedOk;
console.log(`${maskedOk ? "PASS" : "FAIL"} ISSUED: buyer reads only the five masked header keys (data-model §3.1), not the instructions`);
for (const [index, probe] of probes.entries()) {
  const got = results.get(index);
  const ok = got === probe.expected;
  failed ||= !ok;
  const show = (n: number | undefined) => (n === DENIED ? "denied" : `${n} row(s)`);
  console.log(`${ok ? "PASS" : "FAIL"} ${probe.phase.padEnd(20)} ${probe.who.padEnd(12)} ${show(got)} (expected ${show(probe.expected)})`);
}

const after = runF013DockerPsqlStdin(Buffer.from(`begin read only;
\\pset format unaligned
\\pset tuples_only on
select 'CLEAN', not exists (select 1 from public.orders where id in ('${ID.order1}', '${ID.order2}'))
  and not exists (select 1 from public.proforma_invoices where id in ('${ID.proforma1}', '${ID.proforma2}'))
  and not exists (select 1 from auth.mfa_factors where id = '${ID.factor}')
  and exists (select 1 from pg_policies where tablename = 'proforma_bank_instructions' and policyname = 'proforma_bank_instructions_read'
              and qual like '%CONFIRMED%PAID%');
rollback;
`, "utf8"), process.env.F013_DOCKER_PATH, process.env);
const clean = after.stdout.includes("CLEAN|t");
failed ||= !clean;
console.log(`${clean ? "PASS" : "FAIL"} rollback left no synthetic row and the live policy remains the M4b rule`);
if (failed) throw new Error("B2 bank-instruction policy proof failed");
console.log("B2 (RLS-008) proven against the applied LOCAL policy in one rolled-back transaction; no bank value printed.");

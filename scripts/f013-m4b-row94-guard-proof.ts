/**
 * Review B4 fail-closed proof for the row-94 redaction guards (pinned F013 LOCAL database only).
 *
 * Each case is ONE transaction that always ends without commit: it perturbs the expected state (JSON null, missing key,
 * SQL NULL, wrong value) and then runs the hash-pinned redaction body. The case passes only if psql stops with the
 * expected guard code. No payload value is printed; the final read-only fingerprint must equal the starting one.
 */
import { readFileSync } from "node:fs";

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";
import { ROW94_REDACTION_FILE, verifyRow94Pins } from "./f013-row94-redaction-pins";

requireF013LocalTarget();
const { dryRun } = verifyRow94Pins(readFileSync(ROW94_REDACTION_FILE, "utf8"));
const bodyStart = dryRun.indexOf("lock table public.audit_logs");
const bodyEnd = dryRun.lastIndexOf("\nrollback;");
if (bodyStart < 0 || bodyEnd < 0) throw new Error("redaction body not found");
const body = dryRun.slice(bodyStart, bodyEnd);
const ORDER = "13000000-0000-4000-8000-000000001f01";
const setKey = (path: string, value: string) => `update public.audit_logs set new_data = jsonb_set(new_data, '{${path}}', '${value}'::jsonb) where id = 94;`;

const CASES: Array<[string, string, string]> = [
  ["order_code is JSON null", setKey("order_code", "null"), "identity values"],
  ["commerce_flow is JSON null", setKey("commerce_flow", "null"), "identity values"],
  ["id is JSON null", setKey("id", "null"), "identity values"],
  ["id is a JSON number, not a string", setKey("id", "1"), "identity values"],
  ["order_code key missing", "update public.audit_logs set new_data = new_data - 'order_code' where id = 94;", "new_data keys"],
  ["extra unexpected key", setKey("unexpected", "true"), "new_data keys"],
  ["destination_snapshot is JSON null (leak count drops to 0)", setKey("destination_snapshot", "null"), "expected_exactly_one_leak (found 0)"],
  ["destination_snapshot is a JSON array, still a leak by key", "update public.audit_logs set new_data = jsonb_set(new_data, '{destination_snapshot}', '[1]'::jsonb) where id = 94;", "snapshot type"],
  ["snapshot key missing", "update public.audit_logs set new_data = new_data #- '{destination_snapshot,label}' where id = 94;", "snapshot keys"],
  ["correlation_id SQL NULL", "update public.audit_logs set correlation_id = null where id = 94;", "columns"],
  ["new_data SQL NULL", "update public.audit_logs set new_data = null where id = 94;", "expected_exactly_one_leak (found 0)"],
  ["order destination snapshot SQL NULL (leak is no longer an order copy)",
    // Triggers off for this one statement only, so the generic orders audit cannot add a second leak first.
    `set local session_replication_role = replica; update public.orders set destination_snapshot = null, delivery_destination_id = null where id = '${ORDER}'; set local session_replication_role = origin;`,
    "not_fixture_order_copy"],
  ["a second leak appears", "update public.audit_logs set old_data = jsonb_build_object('address_lines', 1) where id = (select min(id) from public.audit_logs where id <> 94);",
    "expected_exactly_one_leak (found 2)"],
];

const FINGERPRINT = `begin read only;
\\pset format unaligned
\\pset tuples_only on
select 'FP', md5(coalesce(string_agg(a::text, '|' order by a.id), '')), count(*) from public.audit_logs a;
select 'ORDER', md5(o::text) from public.orders o where o.id = '${ORDER}';
rollback;
`;
const psql = (sql: string) => runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
const fingerprint = () => psql(FINGERPRINT).stdout.split(/\r?\n/).filter((line) => /^(FP|ORDER)\|/.test(line)).join("\n");

const before = fingerprint();
let failed = false;
for (const [label, perturbation, expected] of CASES) {
  const sql = `begin;
do $identity$ begin if to_regclass('f013_local.identity') is null then raise exception 'f013_guard_proof_not_local_target'; end if; end $identity$;
${perturbation}
${body}
rollback;
`;
  let outcome: string;
  try {
    psql(sql);
    outcome = "NO_ERROR (guard passed)";
  } catch (error) {
    const message = String((error as Error).message);
    outcome = message.match(/ERROR:\s+(f013_[a-z_]+(?: \([^)]*\))?)/)?.[1] ?? "UNEXPECTED_ERROR";
  }
  const ok = outcome.includes(expected);
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${outcome}`);
}
const restored = fingerprint() === before;
failed ||= !restored;
console.log(`${restored ? "PASS" : "FAIL"} every case rolled back (audit_logs and fixture order fingerprints unchanged)`);
if (failed) throw new Error("row-94 guard fail-closed proof failed");
console.log("B4 guards fail closed on JSON null, missing/extra keys, SQL NULL and extra leaks; nothing committed.");

/**
 * Full M4b compile/postflight proof on the pinned LOCAL database without applying either M4b or
 * row-94 remediation. It removes the known key only inside the enclosing transaction, executes the
 * reviewed migration body, checks all postflight rows, then ROLLBACK restores the exact LOCAL state.
 */
import { readFileSync } from "node:fs";

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();
const migration = readFileSync("supabase/migrations/20260926103000_feature_013_quote_and_proforma_issuance.sql", "utf8");
const postflight = readFileSync("supabase/maintenance/20260926_feature_013_quote_and_proforma_issuance_postflight.sql", "utf8");
const beginAt = migration.indexOf("\nbegin;");
if (beginAt < 0 || !/\ncommit;\s*$/i.test(migration)) throw new Error("M4b transaction boundaries are not canonical");
const body = migration.slice(beginAt + "\nbegin;".length).replace(/\ncommit;\s*$/i, "");
const sql = `begin;
set local lock_timeout = '5s';
do $identity$ begin
  if to_regclass('f013_local.identity') is null then raise exception 'f013_m4b_transient_dry_run_not_local'; end if;
end $identity$;
update public.audit_logs set new_data = new_data - 'destination_snapshot'
where id = 94 and entity_type = 'orders' and new_data ? 'destination_snapshot';
do $guard$ begin
  if (select count(*) from public.audit_logs where id = 94 and not (new_data ? 'destination_snapshot')) <> 1
     or (select count(*) from public.audit_logs a where (a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
       or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)) <> 0 then
    raise exception 'f013_m4b_transient_dry_run_row94_state_unexpected';
  end if;
end $guard$;
${body}
\\pset format unaligned
\\pset tuples_only on
${postflight}
rollback;
`;
const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!/ROLLBACK\s*$/m.test(result.stdout)) throw new Error("transient M4b dry run did not roll back");
const checks = result.stdout.split(/\r?\n/).filter((line) => /^[1-9]\|[^|]+\|[tf]$/.test(line));
if (checks.length !== 9 || checks.some((line) => line.endsWith("|f"))) {
  throw new Error(`transient M4b postflight failed: ${checks.join("; ")}`);
}
const clean = runF013DockerPsqlStdin(Buffer.from(`begin read only;
\\pset format unaligned
\\pset tuples_only on
select 'CLEAN', to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is null
  and to_regclass('public.v_buyer_order_financials') is null
  and (select new_data ? 'destination_snapshot' from public.audit_logs where id = 94)
  and not (select bank_transfer_checkout_enabled from public.commerce_settings where id);
rollback;`, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!clean.stdout.includes("CLEAN|t")) throw new Error("transient M4b dry run left local schema/data changed");
console.log("Transient sanitized M4b dry run passed: 9/9 postflight checks, then ROLLBACK restored row 94, schema and checkout state.");

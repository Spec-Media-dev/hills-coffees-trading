/** M4b schema/SQL dry run on the pinned F013 LOCAL database; always rolls back. */
import { readFileSync } from "node:fs";

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();
const migration = readFileSync("supabase/migrations/20260926103000_feature_013_quote_and_proforma_issuance.sql", "utf8");
const postflight = readFileSync("supabase/maintenance/20260926_feature_013_quote_and_proforma_issuance_postflight.sql", "utf8");
if (!/^begin;\s/.test(migration.replace(/^--[^\n]*\n/gm, "").trimStart())) throw new Error("M4b must start with BEGIN");
if (!/\ncommit;\s*$/i.test(migration) || (migration.match(/\ncommit;/gi) ?? []).length !== 1) {
  throw new Error("M4b must have exactly one terminal COMMIT");
}
const dryRun = migration.replace(/\ncommit;\s*$/i,
  `\n\\pset format unaligned\n\\pset tuples_only on\n${postflight}\nrollback;\n`);
const result = runF013DockerPsqlStdin(Buffer.from(dryRun, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!/ROLLBACK\s*$/m.test(result.stdout)) throw new Error("M4b dry-run did not roll back");
const checks = result.stdout.split(/\r?\n/).filter((line) => /^[1-9]\|[^|]+\|[tf]$/.test(line));
if (checks.length !== 9 || checks.some((line) => line.endsWith("|f"))) {
  const auditCounts = runF013DockerPsqlStdin(Buffer.from(`
    select count(*) filter (where old_data -> 'destination_snapshot' is not null and old_data -> 'destination_snapshot' <> 'null'::jsonb)::text as old_snapshot,
           count(*) filter (where new_data -> 'destination_snapshot' is not null and new_data -> 'destination_snapshot' <> 'null'::jsonb)::text as new_snapshot,
           count(*) filter (where coalesce(old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines'])::text as old_direct_pii_keys,
           count(*) filter (where coalesce(new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines'])::text as new_direct_pii_keys
    from public.audit_logs where entity_type = 'orders';
  `, "utf8"), process.env.F013_DOCKER_PATH, process.env);
  console.error("Pre-existing LOCAL orders-audit PII-key counts (no values):\n" + auditCounts.stdout);
  throw new Error(`M4b transaction postflight failed: ${checks.join("; ")}`);
}
const verify = runF013DockerPsqlStdin(Buffer.from(
  "select case when to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is null and not (select bank_transfer_checkout_enabled from public.commerce_settings where id) then 'm4b_dry_run_clean' else 'm4b_dry_run_dirty' end as result;",
  "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!verify.stdout.includes("m4b_dry_run_clean") || verify.stdout.includes("m4b_dry_run_dirty")) {
  throw new Error("M4b dry-run left a schema object or enabled checkout");
}
console.log("M4b pinned LOCAL dry-run and nine postflight checks passed; transaction rolled back; checkout remains disabled.");

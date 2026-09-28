/** T081 LOCAL-only M4b postflight runner: executes the approved SQL bytes and parses its nine result rows. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

const POSTFLIGHT_FILE = "supabase/maintenance/20260926_feature_013_quote_and_proforma_issuance_postflight.sql";
const APPROVED_POSTFLIGHT_SHA256 = "1853552de80c3f83c0ba7a5766432e6bc75938709a0b8cb370220db3846259e6";

requireF013LocalTarget();

const postflight = readFileSync(POSTFLIGHT_FILE);
if (createHash("sha256").update(postflight).digest("hex") !== APPROVED_POSTFLIGHT_SHA256) {
  throw new Error("approved M4b postflight SHA-256 mismatch");
}

const precheck = `begin read only;
select case when
  to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is not null
  and exists (select 1 from public.commerce_settings where id and not bank_transfer_checkout_enabled)
  and (select count(*) from public.audit_logs a where
    (a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
    or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
    or coalesce(a.old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
    or coalesce(a.new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']) = 0
  and (select count(*) from public.audit_logs where action = 'PII_REDACTION'
    and entity_type = 'audit_logs' and metadata ->> 'audit_log_id' = '94') = 1
then 'T081_CURRENT_STATE_OK' else 'T081_CURRENT_STATE_INVALID' end;
rollback;
`;
const state = runF013DockerPsqlStdin(Buffer.from(precheck, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!state.stdout.includes("T081_CURRENT_STATE_OK")) throw new Error("T081 current LOCAL state precheck failed");
console.log("PASS current LOCAL state: M4b present, checkout off, audit leaks zero, one correction event.");

const result = runF013DockerPsqlStdin(postflight, process.env.F013_DOCKER_PATH, process.env);
const rows = result.stdout.split(/\r?\n/).flatMap((line) => {
  const match = /^\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(t|f|true|false)\s*$/.exec(line);
  return match ? [{ ordinal: Number(match[1]), invariant: match[2]!, passed: /^(?:t|true)$/.test(match[3]!)}] : [];
});
const checks = rows.filter((row) => row.ordinal >= 1 && row.ordinal <= 9).sort((a, b) => a.ordinal - b.ordinal);

if (checks.length !== 9 || checks.some((row, index) => row.ordinal !== index + 1)) {
  throw new Error("M4b postflight output did not contain the expected nine checks");
}
for (const row of checks) console.log(`${row.passed ? "PASS" : "FAIL"} ${row.ordinal}/9 — ${row.invariant}`);
if (checks.some((row) => !row.passed)) {
  throw new Error(`M4b postflight failed: ${checks.filter((row) => !row.passed).map((row) => `${row.ordinal}:${row.invariant}`).join(", ")}`);
}
console.log("M4b approved postflight passed: 9/9.");

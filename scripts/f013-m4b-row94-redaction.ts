/**
 * Feature 013 T081 step 1 — row-94 LOCAL audit redaction runner (pinned F013 LOCAL database only).
 *
 * Default: DRY RUN. The hash-pinned file runs in BEGIN … ROLLBACK; every in-transaction check must report through its
 * F013_ROW94 notices, and a read-only fingerprint of the whole audit_logs table and the fixture order taken before and
 * after must be identical (rollback restores the starting state). No payload value is ever printed: a failing psql call
 * is reduced to its ERROR line (Postgres DETAIL/CONTEXT lines can quote row values and are dropped).
 *
 * `--apply` (T081 OPERATOR ONLY): requires F013_T081_ROW94_APPLY_APPROVED=1 AND F013_ROW94_APPLY_SHA256 equal to the
 * pinned apply-variant hash; it re-runs the dry run first, executes the pinned COMMIT variant once, and verifies the
 * committed result (key gone, zero leaks, exactly one correction event, order unchanged, no other audit row changed).
 * A rerun after a successful apply stops before any SQL runs (the target key is absent) and changes nothing.
 * There is no remote target: requireF013LocalTarget() verifies the LOCAL nonce identity, the SQL re-checks the
 * LOCAL-only `f013_local.identity` marker, and psql runs only inside the pinned local container.
 */
import { readFileSync } from "node:fs";

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";
import { ROW94_APPLY_SHA256, ROW94_EXPECTED_NOTICES, ROW94_REDACTION_FILE, verifyRow94Pins } from "./f013-row94-redaction-pins";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply")) throw new Error("unknown argument(s)");
const apply = args.includes("--apply");
if (apply && (process.env.F013_T081_ROW94_APPLY_APPROVED !== "1" || process.env.F013_ROW94_APPLY_SHA256 !== ROW94_APPLY_SHA256)) {
  throw new Error("row-94 apply refused: T081 operator approval and the exact pinned apply SHA-256 are both required");
}

requireF013LocalTarget();
const variants = verifyRow94Pins(readFileSync(ROW94_REDACTION_FILE, "utf8"));

/** psql through the pinned container; on failure only the first ERROR line survives (never DETAIL/CONTEXT/row data). */
function psql(sql: string): { stdout: string; stderr: string } {
  try {
    return runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
  } catch (error) {
    const line = String((error as Error).message).split(/\r?\n/).find((candidate) => /\bERROR:/.test(candidate));
    throw new Error(`row-94 psql step failed: ${line ? line.slice(line.indexOf("ERROR:")).slice(0, 200) : "no ERROR line (psql/docker failure)"}`);
  }
}

const ORDER = "13000000-0000-4000-8000-000000001f01";
const LEAK_PREDICATE = `(a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
     or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
     or a.metadata ? 'destination_snapshot'
     or coalesce(a.old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
     or coalesce(a.new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']`;
const STATE_SQL = `begin read only;
\\pset format unaligned
\\pset tuples_only on
select 'FP', md5(coalesce(string_agg(a::text, '|' order by a.id), '')), count(*), max(a.id) from public.audit_logs a;
select 'OTHERS', md5(coalesce(string_agg(a::text, '|' order by a.id), '')) from public.audit_logs a where a.id <> 94 and a.action <> 'PII_REDACTION';
select 'ORDER', md5(o::text) from public.orders o where o.id = '${ORDER}';
select 'ROW94_KEY', coalesce((select new_data ? 'destination_snapshot' from public.audit_logs where id = 94), false);
select 'LEAKS', count(*) from public.audit_logs a where ${LEAK_PREDICATE};
select 'EVENTS', count(*) from public.audit_logs where action = 'PII_REDACTION' and entity_type = 'audit_logs' and metadata ->> 'audit_log_id' = '94';
rollback;
`;
type State = Record<"FP" | "OTHERS" | "ORDER" | "ROW94_KEY" | "LEAKS" | "EVENTS", string>;
function state(): State {
  const rows = psql(STATE_SQL).stdout.split(/\r?\n/).map((line) => line.split("|"))
    .filter(([key]) => ["FP", "OTHERS", "ORDER", "ROW94_KEY", "LEAKS", "EVENTS"].includes(key!));
  const result = Object.fromEntries(rows.map(([key, ...rest]) => [key, rest.join("|")])) as State;
  if (Object.keys(result).length !== 6) throw new Error("row-94 state read incomplete");
  return result;
}
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) throw new Error(`row-94 runner: ${label}`);
};

function dryRun(): State {
  const before = state();
  check(before.ROW94_KEY === "t" && before.LEAKS === "1" && before.EVENTS === "0",
    "pre-state: row-94 key present, exactly one leak, no prior correction event (otherwise already remediated or unexpected)");
  const result = psql(variants.dryRun);
  check(/ROLLBACK\s*$/m.test(result.stdout), "dry run ended in ROLLBACK");
  const notices = result.stderr.split(/\r?\n/).map((line) => line.match(/F013_ROW94\|(.+)$/)?.[1]).filter(Boolean);
  for (const expected of ROW94_EXPECTED_NOTICES) check(notices.includes(expected), `in-transaction ${expected}`);
  const after = state();
  check(JSON.stringify(after) === JSON.stringify(before),
    "rollback restored the audit_logs table and fixture order byte-for-byte (fingerprint before = after)");
  return before;
}

const before = dryRun();
if (!apply) {
  console.log("row-94 redaction DRY RUN passed on the pinned LOCAL target; nothing committed.");
} else {
  check(/COMMIT\s*$/m.test(psql(variants.apply).stdout), "apply variant committed");
  const after = state();
  check(after.ROW94_KEY === "f", "committed: row-94 destination_snapshot key removed");
  check(after.LEAKS === "0", "committed: zero leaks remain");
  check(after.EVENTS === "1", "committed: exactly one PII-free correction event for row 94");
  check(after.ORDER === before.ORDER, "committed: fixture order unchanged");
  check(after.OTHERS === before.OTHERS, "committed: every other audit row unchanged");
  console.log("row-94 redaction APPLIED on the pinned LOCAL target (T081 step 1).");
}

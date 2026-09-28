/**
 * Review B1 (R-8) engine proof on the pinned F013 LOCAL database. READ ONLY: no table is read or written.
 * The exact shipping-rule WHERE/ORDER BY text of M4b `compute_order_quote` runs over an in-query VALUES set, so the
 * migration's own precedence clause is evaluated by the real PostgreSQL engine before M4b is applied.
 */
import { readFileSync } from "node:fs";

import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();
const migration = readFileSync("supabase/migrations/20260926103000_feature_013_quote_and_proforma_issuance.sql", "utf8");
const start = migration.indexOf("select * into v_shipping from public.shipping_rules");
const end = migration.indexOf("limit 1;", start);
if (start < 0 || end < 0) throw new Error("M4b shipping-rule selection not found");
const clause = migration.slice(start + "select * into v_shipping from public.shipping_rules".length, end)
  .replace(/^\s*--[^\n]*$/gm, "")
  .replaceAll("v_destination.delivery_method", "'COURIER'::text")
  .replaceAll("v_destination.country_code", "'AE'::text");
if (/v_[a-z_]+/.test(clause)) throw new Error("unsubstituted PL/pgSQL variable in the extracted clause");

// Rules: exact AE vs NULL-country fallback, both active; the fallback is deliberately NEWER, so recency cannot mask the bug.
const rules = (rows: string): string => `with shipping_rules(id, country_code, delivery_method, currency, is_active, effective_from, effective_until) as (
  values ${rows}) select id from shipping_rules ${clause} limit 1`;
const exact = "('exact-AE', 'AE', 'COURIER', 'USD', true, statement_timestamp() - interval '30 days', null::timestamptz)";
const fallback = "('general-fallback', null::text, 'COURIER', 'USD', true, statement_timestamp() - interval '1 day', null::timestamptz)";
const exactInactive = "('exact-AE', 'AE', 'COURIER', 'USD', false, statement_timestamp() - interval '30 days', null::timestamptz)";
const cases: Array<[string, string, string]> = [
  ["UAE destination + UAE-specific rule + general fallback rule, both active", `${exact}, ${fallback}`, "exact-AE"],
  ["UAE destination + general fallback only", fallback, "general-fallback"],
  ["UAE destination + inactive UAE rule + general fallback", `${exactInactive}, ${fallback}`, "general-fallback"],
];
const sql = ["begin read only;", "\\pset format unaligned", "\\pset tuples_only on",
  ...cases.map(([, rows]) => `${rules(rows)};`), "rollback;", ""].join("\n");
const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
const selected = result.stdout.split(/\r?\n/).map((line) => line.trim())
  .filter((line) => line === "exact-AE" || line === "general-fallback");
if (!/ROLLBACK\s*$/m.test(result.stdout) || selected.length !== cases.length) {
  throw new Error(`shipping precedence proof produced unexpected output:\n${result.stdout}`);
}
let failed = false;
cases.forEach(([name, , expected], index) => {
  const ok = selected[index] === expected;
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: selected ${selected[index]} (expected ${expected})`);
});
if (failed) throw new Error("M4b shipping precedence violates R-8");
console.log("M4b shipping precedence (R-8) proven on the LOCAL engine; read-only transaction rolled back.");

import { readdirSync, readFileSync } from "node:fs";

/**
 * Feature 007 DB blocker run (2026-09-13) — TEST-ONLY source of database function bodies for static
 * assertions. Starts from the approved baseline report (`docs/database/database-schema-report.json`,
 * generated 2026-09-07) and overlays every function (re)defined by a Feature 007 forward migration in
 * `supabase/migrations/` (rollback files excluded), in filename order — so a test reads the definition
 * the repository's migrations say is current, not a stale snapshot. Live behaviour is still proven by
 * the live tests; this is only for source-level checks.
 */
export function loadFunctionDefinitions(): Map<string, string> {
  const report = JSON.parse(JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"))[0].database_schema_report) as {
    functions: Array<{ function_name: string; definition: string }>;
  };
  const definitions = new Map<string, string>();
  for (const fn of report.functions) definitions.set(fn.function_name, fn.definition);

  const migrations = readdirSync("supabase/migrations")
    .filter((file) => /feature_007.*\.sql$/.test(file) && !file.endsWith(".rollback.sql"))
    .sort();
  for (const file of migrations) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace(/\r\n/g, "\n");
    const pattern = /create\s+or\s+replace\s+function\s+public\.([a-z_]+)\s*\(([\s\S]*?)(\$[a-z_]*\$)([\s\S]*?)\3/gi;
    for (const match of sql.matchAll(pattern)) {
      definitions.set(match[1]!.toLowerCase(), match[0]);
    }
  }
  return definitions;
}

/** Every `raise exception '<text>'` literal in the named functions (current definitions). */
export function raisesOf(names: readonly string[]): Set<string> {
  const definitions = loadFunctionDefinitions();
  return new Set(
    names.flatMap((name) => {
      const body = definitions.get(name);
      if (!body) throw new Error(`no definition for ${name}`);
      return [...body.matchAll(/raise\s+exception\s+'([^']+)'/gi)].map((match) => match[1]!);
    })
  );
}

/** Explicit local-only regeneration: npx tsx scripts/f017-capture-policy-baseline.ts */
import { readFileSync, writeFileSync } from "node:fs";
import {
  captureCanonicalPolicies, createHistoricalPolicyDatabase, POLICY_BASELINE_END,
  POLICY_BASELINE_START, POLICY_POSTFLIGHT_PATH, renderCanonicalPolicyManifest,
} from "./f017-policy-baseline";

async function main() {
  const db = await createHistoricalPolicyDatabase();
  try {
    const policies = await captureCanonicalPolicies(db);
    const source = readFileSync(POLICY_POSTFLIGHT_PATH, "utf8");
    const start = source.indexOf(POLICY_BASELINE_START);
    const end = source.indexOf(POLICY_BASELINE_END, start);
    if (start < 0 || end < 0) throw new Error("Missing canonical policy capture markers");
    writeFileSync(POLICY_POSTFLIGHT_PATH, source.slice(0, start) + renderCanonicalPolicyManifest(policies) + source.slice(end + POLICY_BASELINE_END.length));
    console.log(`Captured ${policies.length} historical policies using local PostgreSQL`);
  } finally {
    await db.close();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

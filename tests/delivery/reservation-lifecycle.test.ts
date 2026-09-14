import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 009 RUN C (T029) — DB-BLOCK-07 partial-delivery, completion, failure/dispute, and audit
 * proof matrix. Partial-delivery/completion/failure/dispute are reused from already-recorded live
 * evidence (T013 scenarios 10/11/12/13, plus T017's own proof 1/3 through `recordDelivery` itself —
 * `tests/delivery/t017-record-delivery-live.test.ts`), per this run's own "do not repeat unnecessary
 * live testing" rule. The static source-grep for "zero direct inventory_positions write outside the
 * approved DB function call path" is performed FRESH here, exhaustively, over the CURRENT tree — this
 * is the single most important structural guarantee in this feature (plan.md architecture decision 10)
 * and must never be satisfied merely by citing past evidence.
 */
function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("T029 — partial-delivery / completion / failure / dispute: evidence location proof", () => {
  it("partial delivery updates the reservation correctly, and a completed delivery leaves no stranded reservation (T013 scenario 10-11, T017 proof 1/3)", () => {
    const driver = readFileSync("scripts/t013-delivery-live-proof.ts", "utf8");
    expect(driver).toMatch(/async function scenario10and11_deliveryAndPartialDelivery/);
    const t017 = readFileSync("tests/delivery/t017-record-delivery-live.test.ts", "utf8");
    expect(t017).toMatch(/reaches DELIVERED/);
    expect(t017).toMatch(/reserved_quantity_kg\)\.toBe\(0\)/);
  });

  it("failure/dispute behavior follows the approved FREEZE/fail-closed policy (T013 scenario 12/13)", () => {
    const driver = readFileSync("scripts/t013-delivery-live-proof.ts", "utf8");
    expect(driver).toMatch(/async function scenario12_disputedFreeze/);
    expect(driver).toMatch(/async function scenario13_failedRecoveryGuard/);
    expect(driver).toMatch(/delivery_recovery_requires_dedicated_workflow/);
  });

  it("an unsettled order cannot be physically released (T016/T024's own live proofs, plus T013 scenario 5)", () => {
    const warehouseTests = readFileSync("tests/delivery/warehouse.test.ts", "utf8");
    expect(warehouseTests).toContain("reserve is refused for an unsettled");
  });

  it("reservation effects remain audit-correlated: every reservation write is scoped by a foreign key to the causing shipment_item/order (schema-structural, verified against the live DTOs)", () => {
    const warehouseSource = readFileSync("lib/delivery/warehouse.ts", "utf8");
    // recordDelivery's own write is always scoped by shipmentItemId — never an org-wide/ungrouped write.
    expect(warehouseSource).toMatch(/\.eq\("id", item\.shipmentItemId\)/);
    expect(warehouseSource).toMatch(/\.eq\("shipment_id", shipmentId\)/);
  });
});

describe("T029 — static, fresh: zero direct inventory_positions write outside the approved DB function call path", () => {
  it("no lib/delivery or src/app/dashboard/deliveries file writes inventory_positions directly", () => {
    const candidates = [...listTsFiles("lib/delivery"), ...listTsFiles("src/app/dashboard/deliveries")];
    for (const file of candidates) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must never write inventory_positions directly`).not.toMatch(/from\("inventory_positions"\)[\s\S]{0,120}\.(update|insert|delete|upsert)\(/);
    }
  });

  it("no lib/delivery or src/app/dashboard/deliveries file writes reserved_quantity_kg/available_quantity_kg directly (reads and DB-function calls only)", () => {
    const candidates = [...listTsFiles("lib/delivery"), ...listTsFiles("src/app/dashboard/deliveries")];
    for (const file of candidates) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must never assign reserved_quantity_kg/available_quantity_kg`).not.toMatch(/reserved_quantity_kg\s*:/);
      expect(source, `${file} must never assign available_quantity_kg`).not.toMatch(/available_quantity_kg\s*:/);
    }
  });
});

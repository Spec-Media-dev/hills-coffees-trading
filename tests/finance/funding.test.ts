import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { listRuntimeFiles, stripComments } from "./runtime-absence-helpers";

/**
 * Feature 017: T006 — Retired Funding Seam Absence & Bank-Transfer Protection Tests
 *
 * Replaces obsolete Feature 008 provider-funding assertions.
 * Proves that:
 * 1. The funding seam is retired from all production callers.
 * 2. lib/finance/funding.ts is absent.
 * 3. Bank-transfer payment journey is independent of any provider funding seam.
 */

describe("T006 — Provider funding seam retirement contract", () => {
  it("lib/finance/funding.ts is absent from the repository", () => {
    expect(existsSync("lib/finance/funding.ts")).toBe(false);
  });

  it("zero production runtime files import or call requestFunding", () => {
    const runtimeFiles = listRuntimeFiles();
    const violations: { file: string; line: string }[] = [];

    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      const lines = source.split("\n");
      for (const line of lines) {
        if (/\brequestFunding\b|from\s+["'].*\/lib\/finance\/funding["']/.test(line)) {
          violations.push({ file, line: line.trim() });
        }
      }
    }

    expect(violations, `requestFunding found in runtime: ${JSON.stringify(violations)}`).toEqual([]);
  });

  it("bank-transfer payment and checkout paths are protected without provider funding", () => {
    // Proves that bank transfer checkout, proforma, and proof paths exist independently
    expect(existsSync("lib/orders/checkout.ts")).toBe(true);
    expect(existsSync("lib/finance/read.ts")).toBe(true);

    const checkoutSource = stripComments(readFileSync("lib/orders/checkout.ts", "utf8"));
    expect(checkoutSource).not.toMatch(/\brequestFunding\b/);
    expect(checkoutSource).not.toMatch(/STRIPE/);
  });
});

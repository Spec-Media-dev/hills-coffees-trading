import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 002 T036 verification — RTL and long-string resilience across all public layouts,
 * logical properties only. Structural half of the proof; the real-browser `dir="rtl"` rendering
 * half is recorded in `IMPLEMENTATION-HANDOFF.md`'s Phase 10 section (this exact task's own Verify
 * condition explicitly requires both).
 */

const PHYSICAL_DIRECTION_PATTERN = /text-left|text-right|[^-]pl-|[^-]pr-|margin-left|margin-right/;

function sourceFiles(...roots: string[]): string[] {
  const files: string[] = [];
  for (const root of roots) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(root, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) files.push(...sourceFiles(full));
      else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
    }
  }
  return files;
}

describe("T036 — RTL / logical-property resilience", () => {
  it("no physical-direction utility class appears anywhere in the public layout tree", () => {
    const files = sourceFiles("src/app/(public)", "components/public");
    files.push("src/app/page.tsx");
    const offenders = files
      .map((file) => ({ file, source: readFileSync(file, "utf8") }))
      .filter(({ source }) => PHYSICAL_DIRECTION_PATTERN.test(source));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it("this check also covers the new Phase 9/10 files (error boundaries, cache-proof route)", () => {
    for (const file of [
      "src/app/(public)/error.tsx",
      "src/app/error.tsx",
      "components/public/route-error.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(PHYSICAL_DIRECTION_PATTERN);
    }
  });

  it("the RFQ form uses no physical-direction utility (T036 regression for Phase 6)", () => {
    const source = readFileSync("components/public/rfq-form.tsx", "utf8");
    expect(source).not.toMatch(PHYSICAL_DIRECTION_PATTERN);
  });
});

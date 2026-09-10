import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 002 T035 verification — every `"use client"` in the public route tree has a genuine,
 * stated interaction reason; no page tree became a Client Component; no Client Component receives
 * more public DTO data than it renders.
 */

function findClientFiles(...roots: string[]): string[] {
  const hits: string[] = [];
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
      if (stat.isDirectory()) hits.push(...findClientFiles(full));
      else if (/\.(ts|tsx)$/.test(entry)) {
        const firstLine = readFileSync(full, "utf8").split("\n")[0]?.trim();
        if (firstLine === '"use client";' || firstLine === "'use client';") hits.push(full);
      }
    }
  }
  return hits;
}

describe("T035 — client-island audit", () => {
  it("no page.tsx or layout.tsx in the public tree is a Client Component", () => {
    const clientFiles = findClientFiles("src/app/(public)", "src/app/page.tsx", "src/app/layout.tsx");
    const pageOrLayout = clientFiles.filter((f) => /page\.tsx$|layout\.tsx$/.test(f));
    expect(pageOrLayout).toEqual([]);
  });

  it("every genuine client island in components/public/ is one of the documented, reconciled set", () => {
    const clientFiles = findClientFiles("components/public").map((f) => path.basename(f));
    const documented = new Set([
      "animated-hero.tsx",
      "catalogue-filter.tsx",
      "interactive-story-section.tsx",
      "mobile-nav.tsx",
      "origins-showcase.tsx",
      "rfq-form.tsx",
      "route-error.tsx",
      "search-control.tsx",
    ]);
    for (const file of clientFiles) {
      expect(documented.has(file), `${file} is a client island but not in the documented set`).toBe(true);
    }
  });

  it("process-journey.tsx is NOT a client island (still static, per contract §16 item 10)", () => {
    const firstLine = readFileSync("components/public/process-journey.tsx", "utf8").split("\n")[0]?.trim();
    expect(firstLine).not.toMatch(/use client/);
  });

  it("Next-mandated error boundaries and their shared implementation are documented as such, not as a new numbered island", () => {
    const contract = readFileSync("specs/002-public-website/contracts/product-ui-foundation.md", "utf8");
    expect(contract).toContain("src/app/(public)/error.tsx");
    expect(contract).toContain("src/app/error.tsx");
    expect(contract).toContain("components/public/route-error.tsx");
  });

  it("CatalogueFilter receives only the summary DTO the index page already renders — no extra hydration", () => {
    const source = readFileSync("components/public/catalogue-filter.tsx", "utf8");
    expect(source).toMatch(/coffees:\s*PublicCoffeeSummary\[\]/);
    expect(source).not.toMatch(/import\s*\{[^}]*PublicCoffeeDetail/); // the richer detail DTO is never imported here
  });

  it("no client component in the public tree imports the auth DAL or resolves a request identity", () => {
    const clientFiles = findClientFiles("components/public", "src/app/(public)", "src/app/page.tsx");
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not import the auth DAL`).not.toMatch(/from ["']@\/lib\/auth\/dal["']/);
      expect(source, `${file} must not call getRequestIdentity`).not.toMatch(/getRequestIdentity\(/);
    }
  });

  it("this session's diff touched no page.tsx/layout.tsx to add a client directive", () => {
    const diff = execFileSync(
      "git",
      ["diff", "--unified=0", "--", "src/app/(public)", "src/app/page.tsx", "src/app/layout.tsx"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    const addedClientDirective = diff
      .split("\n")
      .some((line) => /^\+/.test(line) && /use client/.test(line));
    expect(addedClientDirective).toBe(false);
  });
});

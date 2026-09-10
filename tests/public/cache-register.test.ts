import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 002 T030 verification — every exported `lib/public/*` read declares its tag(s) and
 * `revalidate` ceiling, and the register in `contracts/public-cache-policy.md` §3 matches both the
 * code and the platform-wide table in `specs/001-platform-foundation/contracts/
 * cache-policy-contract.md`, which that contract designates as the index every later feature adds a
 * row to (§0).
 */

const TAGS = [
  "public-coffees",
  "public-coffee:{slug}",
  "public-origins",
  "public-origin:{slug}",
  "public-taxonomy",
] as const;

describe("T030 — cache register reconciliation", () => {
  it("every lib/public/* cached read declares a tag and a revalidate ceiling in source", () => {
    for (const file of ["lib/public/coffees.ts", "lib/public/origins.ts", "lib/public/taxonomy.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must use unstable_cache`).toMatch(/unstable_cache\(/);
      expect(source, `${file} must declare a tag`).toMatch(/tags:\s*\[/);
      expect(source, `${file} must declare a revalidate ceiling`).toMatch(/revalidate:/);
    }
  });

  it("every registered tag appears in Feature 002's own register (§3)", () => {
    const contract = readFileSync("specs/002-public-website/contracts/public-cache-policy.md", "utf8");
    for (const tag of TAGS) {
      expect(contract, `002's register is missing ${tag}`).toContain(tag);
    }
  });

  it("every Feature-002 tag also appears in Feature 001's platform-wide table", () => {
    const platform = readFileSync(
      "specs/001-platform-foundation/contracts/cache-policy-contract.md",
      "utf8"
    );
    for (const tag of TAGS) {
      expect(platform, `001's platform table is missing ${tag}`).toContain(tag);
    }
  });

  it("Feature 001's contract is extended additively — its API/category rules are untouched", () => {
    const platform = readFileSync(
      "specs/001-platform-foundation/contracts/cache-policy-contract.md",
      "utf8"
    );
    // The original rule/category text must still be present verbatim, proving 002 did not rewrite it.
    expect(platform).toContain("Next.js-native caching is the **only** caching mechanism");
    expect(platform).toContain("## Categories");
    expect(platform).toContain("## Adding a new cache entry (for later features)");
  });

  it("no fictitious invalidation is claimed — every 002 tag is honestly TTL-only today", () => {
    const contract = readFileSync("specs/002-public-website/contracts/public-cache-policy.md", "utf8");
    const platform = readFileSync(
      "specs/001-platform-foundation/contracts/cache-policy-contract.md",
      "utf8"
    );
    expect(contract).toMatch(/no on-demand invalidation of these tags happens anywhere/i);
    expect(platform).toMatch(/TTL only/);
  });

  it("cache tag/TTL constants used by the code match the register's stated values", () => {
    const cache = readFileSync("lib/public/cache.ts", "utf8");
    expect(cache).toContain('"public-coffees"');
    expect(cache).toContain('"public-origins"');
    expect(cache).toContain('"public-taxonomy"');
    expect(cache).toMatch(/CATALOGUE_REVALIDATE_SECONDS\s*=\s*3600/);
    expect(cache).toMatch(/TAXONOMY_REVALIDATE_SECONDS\s*=\s*86400/);
  });
});

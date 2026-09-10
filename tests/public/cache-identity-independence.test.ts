import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 002 T032 verification — every public cache entry remains identity-independent
 * (`contracts/public-cache-policy.md` §2, §4). Structural checks over the actual source tree, not
 * assertions about intent.
 */

function grep(pattern: RegExp, ...roots: string[]): string[] {
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
      if (stat.isDirectory()) {
        hits.push(...grep(pattern, full));
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const source = readFileSync(full, "utf8");
        // Match actual invocations only — a comment naming the function/word is not a call site.
        for (const line of source.split("\n")) {
          if (pattern.test(line) && !/^\s*\*|^\s*\/\//.test(line)) {
            hits.push(`${full}: ${line.trim()}`);
          }
        }
      }
    }
  }
  return hits;
}

describe("T032 — identity-independent public cache", () => {
  it("no public route/read calls getRequestIdentity()", () => {
    const hits = grep(/getRequestIdentity\(/, "src/app/(public)", "lib/public");
    const homepageHit = readFileSync("src/app/page.tsx", "utf8")
      .split("\n")
      .filter((line) => /getRequestIdentity\(/.test(line) && !/^\s*\*|^\s*\/\//.test(line.trim()));
    expect([...hits, ...homepageHit]).toEqual([]);
  });

  it("no protected surface (dashboard/dashboard-admin) uses unstable_cache", () => {
    const hits = grep(/unstable_cache\(/, "src/app/dashboard", "src/app/dashboard-admin");
    expect(hits).toEqual([]);
  });

  it("no cache key or tag builder incorporates a user/session/org/member/role value", () => {
    const codeLines = readFileSync("lib/public/cache.ts", "utf8")
      .split("\n")
      .filter((line) => !/^\s*\*|^\s*\/\//.test(line));
    const offending = codeLines.filter((line) =>
      /user[Ii]d|session[Ii]d|org(anization)?[Ii]d|member[Ii]d|\brole\b/.test(line)
    );
    expect(offending).toEqual([]);
  });

  it("no external cache/store package is referenced anywhere in the product source", () => {
    const packageJson = readFileSync("package.json", "utf8");
    expect(packageJson).not.toMatch(/"redis"|"ioredis"|"@upstash/i);
  });

  it("the Cache Components directive-based API is not adopted anywhere", () => {
    const nextConfig = readFileSync("next.config.ts", "utf8");
    expect(nextConfig).not.toMatch(/cacheComponents/);
    const hits = grep(/["']use cache["']|cacheLife\(|cacheTag\(|updateTag\(/, "src", "lib");
    expect(hits).toEqual([]);
  });

  it("git diff on the cache tag/register files touches only additive rows (T030 discipline)", () => {
    // Confirms the platform contract's original rule text is byte-present in the current diff's
    // context lines, not merely present in the final file (which a full rewrite could also satisfy).
    const diff = execFileSync(
      "git",
      ["diff", "--unified=3", "--", "specs/001-platform-foundation/contracts/cache-policy-contract.md"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    const removedLines = diff.split("\n").filter((line) => /^-[^-]/.test(line));
    expect(removedLines, "the platform contract's existing rules must not be removed/rewritten").toEqual([]);
  });
});

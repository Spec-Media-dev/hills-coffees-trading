import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ADMIN_AREAS } from "@/lib/admin/areas";

/**
 * Feature 010 T005 — every `/dashboard-admin` surface is private and non-indexable, and nothing
 * public advertises an operational route.
 */

const root = process.cwd();
const ADMIN_APP = path.join(root, "src", "app", "dashboard-admin");
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("T005 — /dashboard-admin is non-indexable everywhere", () => {
  const files = walk(ADMIN_APP).filter((file) => /\.(tsx|ts)$/.test(file));

  it("the root console layout declares robots { index: false, follow: false } (inherited by every nested segment)", () => {
    const layout = source("src", "app", "dashboard-admin", "layout.tsx");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it("no nested layout or page under /dashboard-admin overrides robots or exports its own metadata", () => {
    const nested = files.filter((file) => path.relative(ADMIN_APP, file) !== "layout.tsx");
    expect(nested.length).toBeGreaterThan(20);
    for (const file of nested) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/export const metadata|generateMetadata|robots:/);
    }
  });

  it("robots.txt disallows /dashboard-admin and the public sitemap excludes every console route", () => {
    const robots = source("src", "app", "robots.ts");
    expect(robots).toContain('"/dashboard-admin"');
    const sitemap = source("src", "app", "sitemap.ts");
    for (const area of ADMIN_AREAS) expect(sitemap).not.toContain(area.href);
    expect(sitemap).not.toMatch(/url:\s*[^\n]*dashboard-admin/);
  });

  it("no PUBLIC navigation or public copy links an operational route (only the authenticated account menus do)", () => {
    const publicCopy = walk(path.join(root, "lib", "public")).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const file of publicCopy) {
      expect(readFileSync(file, "utf8"), file).not.toContain("/dashboard-admin/");
    }
    for (const area of ADMIN_AREAS) {
      for (const file of walk(path.join(root, "components", "public")).filter((f) => /\.tsx$/.test(f))) {
        expect(readFileSync(file, "utf8"), file).not.toContain(area.href);
      }
    }
  });

  it("no console page is statically prerendered — every route reads the request identity (dynamic), so no operational content lands in static output", () => {
    for (const file of files.filter((f) => f.endsWith("page.tsx") || f.endsWith("layout.tsx"))) {
      const src = readFileSync(file, "utf8");
      const dynamic = /getRequestIdentity|checkGroupAccess|checkRoleFunctionAccess|checkAreaAccess|AdminAreaPlaceholder/.test(src);
      expect(dynamic, file).toBe(true);
      expect(src, file).not.toMatch(/generateStaticParams|export const dynamic = "force-static"|unstable_cache|"use cache"|cacheTag/);
    }
  });
});

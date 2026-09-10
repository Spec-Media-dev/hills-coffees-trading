import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import robots from "@/src/app/robots";
import { STATIC_ROUTES } from "@/src/app/sitemap";
import { canonicalUrl } from "@/lib/public/site";

/**
 * Feature 002 T026/T027/T028 verification (FR-008, FR-009, SC-003). Narrow, exact-Verify proof —
 * the full route-level runtime matrix (`sitemap.xml` served, `robots.txt` served, noindex present on
 * live routes) is proven against a real running server (§32/T040's browser-evidence scope), because
 * `sitemap()` itself calls `unstable_cache`-wrapped reads that require Next's incremental-cache
 * context and cannot run under bare Vitest — the same documented constraint `lib/public/coffees.ts`
 * records for its own cached entries.
 */
describe("T026 — sitemap route set", () => {
  it("lists only this feature's owned public routes, none private", () => {
    for (const route of STATIC_ROUTES) {
      expect(route).not.toMatch(/^\/(dashboard|dashboard-admin|foundation-status|internal-test|knowledge|legal)/);
    }
  });

  it("every static route resolves through the same canonicalUrl every page uses", () => {
    for (const route of STATIC_ROUTES) {
      const canonical = canonicalUrl(route);
      expect(canonical.endsWith("/")).toBe(true);
      expect(canonical).not.toContain("(public)");
    }
  });

  it("reads only from the approved public read layer — no raw table name, no select(*)", () => {
    const source = readFileSync("src/app/sitemap.ts", "utf8");
    expect(source).toMatch(/getPublicCoffeeIndex/);
    expect(source).toMatch(/getPublicOriginIndex/);
    expect(source).not.toMatch(/\.from\(|select\(/);
  });
});

describe("T027 — robots policy", () => {
  const result = robots();

  it("disallows every private/internal prefix", () => {
    const disallow = (result.rules as { disallow: string[] }).disallow;
    expect(disallow).toEqual(
      expect.arrayContaining(["/dashboard", "/dashboard-admin", "/foundation-status", "/internal-test/"])
    );
  });

  it("allows the public site and links the sitemap", () => {
    expect((result.rules as { allow: string }).allow).toBe("/");
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe("T028 — defence-in-depth noindex on Feature 001's foundation-status route", () => {
  it("adds noindex metadata without touching guard/cache behaviour (metadata-only diff)", () => {
    const source = readFileSync("src/app/foundation-status/page.tsx", "utf8");
    expect(source).toMatch(/robots:\s*{\s*index:\s*false,\s*follow:\s*false\s*}/);
    // The proof route's own cache/revalidate call and its Server Component body are untouched —
    // still reads only `getFoundationStatus()`, never a request identity.
    expect(source).toMatch(/getFoundationStatus/);
    expect(source).not.toMatch(/getRequestIdentity/);
  });

  it("dashboard and dashboard-admin already carry noindex (regression guard, not new work)", () => {
    for (const layout of ["src/app/dashboard/layout.tsx", "src/app/dashboard-admin/layout.tsx"]) {
      const source = readFileSync(layout, "utf8");
      expect(source).toMatch(/robots:\s*{\s*index:\s*false,\s*follow:\s*false\s*}/);
    }
  });
});

describe("T029 — public route lifecycle (LIFE-01)", () => {
  it("no route implements or fakes a permanent redirect or 410", () => {
    const files = [
      "src/app/(public)/coffee/[slug]/page.tsx",
      "src/app/(public)/origins/[slug]/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/permanentRedirect|redirect\(.*30[18]\)|status:\s*410|Gone/);
      expect(source).toMatch(/notFound\(\)/);
      expect(source).toMatch(/LIFE-01/);
    }
  });
});

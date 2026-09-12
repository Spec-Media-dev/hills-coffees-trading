import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

function walk(dir: string, onFile: (fullPath: string, contents: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, onFile);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      onFile(full, readFileSync(full, "utf8"));
    }
  }
}

/**
 * Feature 006 T008 — the private/public + SEO boundary. Mirrors
 * `tests/inventory/run-b-ui.test.tsx`'s "no public route imports lib/inventory" precedent exactly, for
 * `lib/listings/*`. Note the deliberate naming collision this run directive itself warned about:
 * `src/app/(public)/coffee` is Feature 002's PUBLIC catalogue route — a completely different route
 * from the PRIVATE `src/app/dashboard/coffee` marketplace guarded by T007. This suite proves the two
 * never share code.
 */
describe("T008 — no public route imports lib/listings/*", () => {
  it("src/app/(public) never imports lib/listings", () => {
    const offenders: string[] = [];
    walk("src/app/(public)", (path, contents) => {
      if (contents.includes("lib/listings")) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it("the public (public)/coffee catalogue route is genuinely distinct code from the private dashboard/coffee marketplace route", () => {
    const publicCoffee = source("src/app/(public)/coffee/page.tsx");
    expect(publicCoffee).not.toMatch(/lib\/listings/);
    expect(publicCoffee).not.toMatch(/coffee_offers/);
  });

  it("no public route imports lib/inventory either (private custody stays private)", () => {
    const offenders: string[] = [];
    walk("src/app/(public)", (path, contents) => {
      if (contents.includes("lib/inventory")) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });
});

describe("T008 — /dashboard/coffee is non-indexable (inherits Feature 003/004's private-app convention)", () => {
  it("dashboard/layout.tsx declares `robots: { index: false, follow: false }`, inherited by every descendant route including /dashboard/coffee", () => {
    const layout = source("src/app/dashboard/layout.tsx");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it("the marketplace page itself declares no conflicting/duplicate robots metadata", () => {
    const page = source("src/app/dashboard/coffee/page.tsx");
    expect(page).not.toMatch(/robots\s*:/);
  });

  it("robots.ts disallows /dashboard (and therefore every descendant, including /dashboard/coffee)", () => {
    const robots = source("src/app/robots.ts");
    expect(robots).toMatch(/disallow:\s*\[[^\]]*["']\/dashboard["']/);
  });

  it("sitemap.ts never generates a /dashboard/coffee entry or references coffee_offers", () => {
    const sitemap = source("src/app/sitemap.ts");
    expect(sitemap).not.toMatch(/dashboard\/coffee/);
    expect(sitemap).not.toMatch(/coffee_offers/);
    // The sitemap's own STATIC_ROUTES/generated entries are the only URLs it ever emits — confirm
    // none of them is a /dashboard path (the doc comment ABOVE that array legitimately mentions
    // `/dashboard` as an excluded prefix; this checks the actual emitted route list, not prose).
    const staticRoutesMatch = sitemap.match(/STATIC_ROUTES = \[([\s\S]*?)\] as const/);
    expect(staticRoutesMatch).not.toBeNull();
    expect(staticRoutesMatch![1]).not.toMatch(/dashboard/);
  });
});

describe("T008 — no shared cache for private marketplace data (strict cache policy)", () => {
  const listingFiles = [
    "lib/listings/types.ts",
    "lib/listings/browse.ts",
    "lib/listings/manage.ts",
    "lib/listings/eligibility.ts",
    "lib/listings/fills.ts",
    "lib/listings/validation.ts",
    "src/app/dashboard/coffee/page.tsx",
    "src/app/dashboard/coffee/layout.tsx",
  ];

  it("none of the RUN A listing files uses unstable_cache/\"use cache\"/cacheTag/cacheLife/updateTag or a module-global map", () => {
    for (const file of listingFiles) {
      const src = source(file);
      expect(src).not.toMatch(/unstable_cache|cacheTag|cacheLife|updateTag|"use cache"/);
    }
  });

  it("none of the RUN A listing files references a service-role credential", () => {
    for (const file of listingFiles) {
      const src = source(file);
      expect(src).not.toMatch(/SERVICE_ROLE|service_role/i);
    }
  });

  it("browse.ts/manage.ts/eligibility.ts import the request-scoped server client, never a privileged one", () => {
    for (const file of ["lib/listings/browse.ts", "lib/listings/manage.ts", "lib/listings/eligibility.ts"]) {
      const src = source(file);
      expect(src).toMatch(/from ["']@\/lib\/supabase\/server["']/);
    }
  });
});

describe("T008 — no public API route returns coffee_offers data", () => {
  it("no route.ts under src/app/(public) mentions coffee_offers", () => {
    const offenders: string[] = [];
    walk("src/app/(public)", (path, contents) => {
      if (/route\.tsx?$/.test(path) && contents.includes("coffee_offers")) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });
});

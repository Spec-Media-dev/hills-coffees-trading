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
 * Feature 006 RUN C (T026) — confirms zero private marketplace/listing data is reachable from any
 * public surface. Extends `tests/listings/boundary.test.ts`'s (T008) established checks to cover the
 * RUN C additions (`lib/listings/sales.ts`, `dashboard/listings/*`, `dashboard/sales/*`) — public
 * product/catalogue content (Feature 002) remains explicitly allowed and untouched.
 */
describe("T026 — no public route imports any Feature 006 private module", () => {
  it("src/app/(public) never imports lib/listings or lib/inventory (including the new lib/listings/sales.ts)", () => {
    const offenders: string[] = [];
    walk("src/app/(public)", (path, contents) => {
      if (contents.includes("lib/listings") || contents.includes("lib/inventory")) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it("no public route.ts mentions coffee_offers, order_items, or listing_status_history", () => {
    const offenders: string[] = [];
    walk("src/app/(public)", (path, contents) => {
      if (/route\.tsx?$/.test(path) && /(coffee_offers|order_items|listing_status_history)/.test(contents)) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });
});

describe("T026 — /dashboard/listings/* and /dashboard/sales are non-indexable", () => {
  it("dashboard/layout.tsx's robots metadata covers every descendant, including the new routes", () => {
    const layout = source("src/app/dashboard/layout.tsx");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it("none of the new RUN C pages declares conflicting/duplicate robots metadata", () => {
    for (const file of ["src/app/dashboard/listings/page.tsx", "src/app/dashboard/listings/[offerId]/page.tsx", "src/app/dashboard/sales/page.tsx"]) {
      expect(source(file)).not.toMatch(/robots\s*:/);
    }
  });

  it("sitemap.ts never generates a /dashboard/listings or /dashboard/sales entry", () => {
    const sitemap = source("src/app/sitemap.ts");
    expect(sitemap).not.toMatch(/dashboard\/(listings|sales)/);
    const staticRoutesMatch = sitemap.match(/STATIC_ROUTES = \[([\s\S]*?)\] as const/);
    expect(staticRoutesMatch).not.toBeNull();
    expect(staticRoutesMatch![1]).not.toMatch(/dashboard/);
  });

  it("robots.ts still disallows /dashboard (covers every descendant, including the new routes)", () => {
    const robots = source("src/app/robots.ts");
    expect(robots).toMatch(/disallow:\s*\[[^\]]*["']\/dashboard["']/);
  });
});

describe("T026 — no shared cache / no service-role in any RUN C file", () => {
  const files = [
    "lib/listings/sales.ts",
    "src/app/dashboard/listings/page.tsx",
    "src/app/dashboard/listings/[offerId]/page.tsx",
    "src/app/dashboard/listings/[offerId]/actions.ts",
    "src/app/dashboard/sales/page.tsx",
  ];

  it("no unstable_cache/\"use cache\"/cacheTag/cacheLife/updateTag anywhere", () => {
    for (const file of files) {
      expect(source(file)).not.toMatch(/unstable_cache|cacheTag|cacheLife|updateTag|"use cache"/);
    }
  });

  it("no service-role reference anywhere", () => {
    for (const file of files) {
      expect(source(file)).not.toMatch(/SERVICE_ROLE|service_role/i);
    }
  });
});

describe("T026 — public catalogue (Feature 002) remains distinct and untouched", () => {
  it("the public /coffee catalogue route still never references coffee_offers or lib/listings", () => {
    const publicCoffee = source("src/app/(public)/coffee/page.tsx");
    expect(publicCoffee).not.toMatch(/lib\/listings/);
    expect(publicCoffee).not.toMatch(/coffee_offers/);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 009 RUN C (T032) — cross-cutting security audit: no service-role usage, no shared cache of
 * delivery data, no public exposure of warehouse locations/addresses/private contact details, no
 * unsafe logging. Repository-search based, over the CURRENT tree — every file this feature owns.
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

const DELIVERY_APPLICATION_PATHS = ["lib/delivery", "components/delivery", "src/app/dashboard/deliveries"];
const DELIVERY_FILES = DELIVERY_APPLICATION_PATHS.flatMap((dir) => listTsFiles(dir));

describe("T032 — no service-role usage in the delivery application surface", () => {
  it("no file references the service-role env var or constructs a service-role client (actual usage, not prose explaining its absence)", () => {
    for (const file of DELIVERY_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must never use the service-role key`).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|createServiceRoleClient/);
    }
  });
});

describe("T032 — no shared cache of private delivery data", () => {
  it('no file INVOKES unstable_cache(...)/"use cache"/cacheTag(...)/cacheLife(...)/updateTag(...) (actual usage, not prose explaining their absence)', () => {
    for (const file of DELIVERY_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must never cache private delivery data`).not.toMatch(/unstable_cache\(|^\s*["']use cache["'];?\s*$|cacheTag\(|cacheLife\(|updateTag\(/m);
    }
  });
});

describe("T032 — no public exposure of the delivery module", () => {
  it("no file under src/app/(public) or src/app root imports lib/delivery — structurally proves warehouse locations/addresses/private contact details can never reach a public route, since no public file even touches this feature's own data layer", () => {
    const publicCandidates = listTsFiles("src/app").filter((file) => !file.includes(`${join("src", "app", "dashboard")}`) && !file.includes(join("src", "app", "dashboard-admin")));
    for (const file of publicCandidates) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} is outside /dashboard and must never import lib/delivery`).not.toMatch(/from ["']@\/lib\/delivery/);
    }
  });

  it("no file under src/app/(public) or src/app root imports components/delivery either", () => {
    const publicCandidates = listTsFiles("src/app").filter((file) => !file.includes(`${join("src", "app", "dashboard")}`) && !file.includes(join("src", "app", "dashboard-admin")));
    for (const file of publicCandidates) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} is outside /dashboard and must never import components/delivery`).not.toMatch(/from ["']@\/components\/delivery/);
    }
  });
});

describe("T032 — no unsafe logging of private delivery data", () => {
  it("no file logs address/contact/phone fields to the console", () => {
    for (const file of DELIVERY_FILES) {
      const source = readFileSync(file, "utf8");
      const consoleCalls = source.match(/console\.(log|error|warn|info)\([^)]*\)/g) ?? [];
      for (const call of consoleCalls) {
        expect(call, `${file} logs a private field: ${call}`).not.toMatch(/addressLine|contactPhone|contactName|contact_phone|contact_name|address_line/);
      }
    }
  });

  it("lib/delivery/errors.ts logs only the SQLSTATE-shaped diagnostic, never the raw message or row data (reuses lib/orders/errors.ts's own established, already-audited logger)", () => {
    const source = readFileSync("lib/orders/errors.ts", "utf8");
    expect(source).toMatch(/function logUnmappedOrderError/);
    expect(source).toMatch(/sqlstate: code/);
  });
});

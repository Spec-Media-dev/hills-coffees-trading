import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 011 T011 / T012 / T013 / T021 (FR-007, FR-009, FR-011, FR-012, SEC-001, SEC-002, SEC-003) — STATIC boundary
 * proofs for the integration and for the constitutional limits of the pricing layer.
 *
 *   T011  Feature 002's public price surface renders through the presentation contract; no public page queries a price
 *         table directly.
 *   T012  Reference prices never appear in executable contexts (checkout, order, listing price, finance, delivery).
 *   T013  The `reference-prices` tag is registered in Feature 001's cache-policy contract; TTL in the register = code.
 *   T021  No unlicensed data path, no service-role usage, no ingestion integration, no mutation, no identity read.
 */

const root = process.cwd();
const rel = (p: string) => p.split(path.sep).join("/");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function walk(dir: string, out: string[] = []): string[] {
  if (!statSync(path.join(root, dir), { throwIfNoEntry: false })) return out;
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = rel(path.join(dir, entry.name));
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const appCode = ["lib", "src", "components"].flatMap((d) => walk(d));
const pricingCode = [...walk("lib/pricing"), ...walk("components/pricing")];

describe("T011 — Feature 002's price surface renders through the presentation contract", () => {
  const home = read("src/app/page.tsx");

  it("the homepage mounts ReferencePriceSection (the contract's server component) and no longer the locked unavailable-only stage", () => {
    expect(home).toMatch(/import \{ ReferencePriceSection \} from "@\/components\/pricing\/reference-price-section";/);
    expect(home).toMatch(/<ReferencePriceSection \/>/);
    expect(home).not.toMatch(/components\/public\/reference-price/);
    expect(home).not.toMatch(/<ReferencePrice\s*\/>/);
  });

  it("NO public page or component queries a price table directly — only lib/pricing (public reads) and Feature 010's admin layer (lib/admin/prices.ts) may name them", () => {
    const offenders = appCode.filter((f) => !f.startsWith("lib/pricing/") && f !== "lib/admin/prices.ts" && /price_(sources|observations|differentials)/.test(strip(read(f))));
    expect(offenders).toEqual([]);
  });

  it("the admin price layer is reachable ONLY from Feature 010's price-administration routes and its field declarations — never from a public page", () => {
    const importers = appCode.filter((f) => /from\s+["']@\/lib\/admin\/prices["']/.test(read(f))).sort();
    expect(importers.length).toBeGreaterThan(0);
    for (const file of importers) expect(file.startsWith("src/app/dashboard-admin/(catalogue)/prices/") || file === "components/admin/catalogue/price-fields.ts", file).toBe(true);
  });

  it("the stage component makes no data query and holds no price-table knowledge", () => {
    const stage = strip(read("components/pricing/reference-price-section.tsx"));
    expect(stage).not.toMatch(/\.from\(|createClient|createPublicReadClient|supabase/i);
    expect(stage).toMatch(/getReferencePresentation/);
  });

  it("Feature 002's own (unavailable-only) component is untouched — its closed contract and tests stand", () => {
    const legacy = read("components/public/reference-price.tsx");
    expect(legacy).toMatch(/ONLY THE UNAVAILABLE STATE IS IMPLEMENTED/);
    expect(legacy).not.toMatch(/lib\/pricing/);
  });
});

describe("T012 — reference prices never appear in executable contexts", () => {
  const importsPricing = (text: string) => /from\s+["']@\/(lib|components)\/pricing\//.test(text);
  const executableRoots = ["lib/orders", "lib/listings", "lib/finance", "lib/delivery", "lib/inventory", "lib/disputes", "lib/notifications", "src/app/dashboard", "src/app/dashboard-admin", "components/orders", "components/listings", "components/finance", "components/delivery", "components/dashboard"];

  it("no checkout / order / listing / finance / delivery / dashboard module imports the pricing layer or its components", () => {
    const offenders = executableRoots.flatMap((r) => walk(r)).filter((f) => importsPricing(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the ONLY importers of the pricing layer outside lib/pricing are the homepage, components/pricing and Feature 010's two admin price modules", () => {
    const importers = appCode.filter((f) => !f.startsWith("lib/pricing/") && importsPricing(read(f))).sort();
    expect(importers).toEqual(["components/pricing/basis-breakdown.tsx", "components/pricing/reference-price-section.tsx", "components/pricing/reference-price.tsx", "components/pricing/stale-state.tsx", "components/pricing/unavailable-state.tsx", "lib/admin/price-validation.ts", "lib/admin/prices.ts", "src/app/page.tsx"].sort());
  });

  it("Feature 010's admin price modules import ONLY the cache seam (prices.ts) and the vocabularies (price-validation.ts) — never a read, presentation or component module", () => {
    const pricingImports = (file: string) => [...read(file).matchAll(/from\s+["']@\/(?:lib|components)\/pricing\/([\w-]+)["']/g)].map((m) => m[1]);
    expect(pricingImports("lib/admin/prices.ts")).toEqual(["cache"]);
    expect(pricingImports("lib/admin/price-validation.ts")).toEqual(["types"]);
    expect(read("lib/admin/prices.ts")).toMatch(/import \{ revalidateReferencePrices \} from "@\/lib\/pricing\/cache";/);
  });

  it("the pricing layer imports NO executable-price module (listings / orders / finance / delivery) — the concepts stay separate in code", () => {
    const offenders = pricingCode.filter((f) => /from\s+["']@\/lib\/(orders|listings|finance|delivery|inventory|admin)\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the reference components render no purchase / quote / checkout affordance (no button, link, form or input)", () => {
    for (const file of walk("components/pricing")) {
      const text = strip(read(file));
      expect(text, file).not.toMatch(/<(button|a|form|input|select|textarea)\b|<Link\b|<Button\b|onClick|href=/);
    }
  });

  it("no executable price type carries a reference-shaped field, and the executable union excludes ReferencePrice", () => {
    const types = read("lib/pricing/types.ts");
    expect(types).toMatch(/export type ExecutablePrice = ListingPrice \| ExecutedPrice \| HillsQuotePrice;/);
    const listingBlock = types.slice(types.indexOf("export type ListingPrice"), types.indexOf("export type ExecutedPrice"));
    expect(listingBlock).not.toMatch(/observedAt|delayType|rawValue|referenceOnly|source:/);
  });
});

describe("T013 — the `reference-prices` tag is registered and revalidated by Feature 010's price administration", () => {
  const platform = read("specs/001-platform-foundation/contracts/cache-policy-contract.md");
  const cache = read("lib/pricing/cache.ts");

  it("Feature 001's platform-wide table has the row (TTL 300s) and an ADDITIVE status update naming Feature 010 T049 as the invalidation owner", () => {
    expect(platform).toMatch(/\| `reference-prices` \| 011 \|/);
    expect(platform).toMatch(/revalidateReferencePrices\(\)/);
    const lines = platform.split("\n");
    const rowIndex = lines.findIndex((l) => l.startsWith("| `reference-prices`"));
    expect(lines[rowIndex]).toMatch(/\| 300s \|/);
    // The contract changes additively only (Feature 002 T030 discipline): the original row stays byte-identical and the
    // status change is an explicit supersession note directly beneath the table.
    const note = lines.slice(rowIndex + 1, rowIndex + 9).join("\n");
    expect(note).toMatch(/Status update — 2026-09-21 \(Feature 010 T049; additive, supersedes the "Invalidation owner" and "Status today" cells/);
    expect(note).toMatch(/`lib\/admin\/prices\.ts`\) calls `revalidateReferencePrices\(\)`/);
    expect(note).toMatch(/Revalidated on administrative\s*>?\s*change/);
    expect(note).toMatch(/300s TTL remains the fallback/);
  });

  it("the code constants match the register (tag name, TTL) and use the mandatory { expire: 0 } form", () => {
    expect(cache).toMatch(/TAG_REFERENCE_PRICES\s*=\s*"reference-prices"/);
    expect(cache).toMatch(/REFERENCE_PRICES_REVALIDATE_SECONDS\s*=\s*300/);
    expect(cache).toMatch(/revalidateTag\(TAG_REFERENCE_PRICES,\s*\{\s*expire:\s*0\s*\}\)/);
  });

  it("every cached pricing read carries the tag and a finite TTL", () => {
    for (const file of ["lib/pricing/sources.ts", "lib/pricing/differentials.ts"]) {
      const text = read(file);
      const caches = text.match(/unstable_cache\(/g) ?? [];
      expect(caches.length, file).toBeGreaterThan(0);
      expect(text.match(/tags:\s*\[TAG_REFERENCE_PRICES\]/g)?.length, file).toBe(caches.length);
      expect(text.match(/revalidate:\s*REFERENCE_PRICES_REVALIDATE_SECONDS/g)?.length, file).toBe(caches.length);
    }
  });

  it("the tag is invalidated ONLY through revalidateReferencePrices — no public page or public action holds a revalidation capability", () => {
    for (const file of ["src/app/page.tsx", "components/pricing/reference-price-section.tsx"]) expect(read(file), file).not.toMatch(/revalidateTag|revalidatePath/);
    const callers = appCode.filter((f) => f !== "lib/pricing/cache.ts" && /revalidateReferencePrices/.test(strip(read(f))));
    expect(callers).toEqual(["lib/admin/prices.ts"]); // Feature 010 T049's price administration is the ONLY caller
  });

  it("Feature 002's cache-proof allow-list is intentionally NOT extended (its five-entry contract stays pinned)", () => {
    const route = read("src/app/internal-test/cache-proof/route.ts");
    expect(route).not.toContain("reference-prices");
  });
});

describe("T021 / SEC-001..003 / FR-012 — constitutional limits of the pricing layer", () => {
  const sources = pricingCode.map((f) => [f, strip(read(f))] as const);

  it("no service-role client and no privileged key anywhere in the layer or its components", () => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(/service[_-]?role|SUPABASE_SECRET|createAdminClient|SERVICE_KEY/i);
  });

  it("reads use ONLY the anonymous, session-free client (createPublicReadClient) — never the request-scoped client", () => {
    for (const file of ["lib/pricing/sources.ts", "lib/pricing/differentials.ts"]) {
      const text = strip(read(file));
      expect(text, file).toMatch(/createPublicReadClient\(\)/);
      expect(text, file).not.toMatch(/lib\/supabase\/server|createClient\(|next\/headers|cookies\(|headers\(/);
    }
  });

  it("no identity, role, session, organization or user id enters the layer or any cache key (entries are identity-independent)", () => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(/getRequestIdentity|auth\.getUser|getSession|organizationId|user_id|actingOrg|cookies\(/);
  });

  it("the layer performs NO mutation and no RPC (reference data is read-only here; administration belongs to Feature 010)", () => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });

  it("no ingestion integration: no network fetch, no provider URL, no scheduler (FR-012)", () => {
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/\bfetch\s*\(|axios|XMLHttpRequest|WebSocket|setInterval|cron|\.schedule\(|https?:\/\//);
    }
  });

  it("every read in the layer applies the licence gate (approved + active) — sources by query AND by mapper", () => {
    const text = read("lib/pricing/sources.ts");
    const sourceReads = text.match(/\.from\("price_sources"\)/g) ?? [];
    expect(sourceReads.length).toBe(2);
    expect(text.match(/\.eq\("is_active", true\)\s*\n\s*\.eq\("licence_status", APPROVED\)/g)?.length).toBe(2);
    expect(text).toMatch(/row\.licence_status === APPROVED && row\.is_active === true/);
    // observations are only ever requested for ids that passed the gate
    expect(text).toMatch(/\.in\("price_source_id", sources\.map\(\(s\) => s\.id\)\)/);
    expect(text).toMatch(/\.eq\("price_source_id", source\.id\)/);
  });

  it("no client component in the pricing surface (Server Components only — no client JavaScript, no client-side authorization)", () => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(/["']use client["']/);
  });

  it("the components make no authorization decision of their own (no role / capability / session check in the UI)", () => {
    for (const [file, text] of pricingCode.filter((f) => f.startsWith("components/")).map((f) => [f, strip(read(f))] as const)) {
      expect(text, file).not.toMatch(/isPlatformAdmin|is_platform_admin|hasRole|canBuy|isAuthorized|useSession|useUser/);
    }
  });
});

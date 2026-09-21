import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ADMIN_AREAS, ADMIN_GROUP_ROLE_FUNCTIONS } from "@/lib/admin/areas";
import {
  PRICE_OBSERVATION_COMMODITIES,
  PRICE_SOURCE_TYPES,
  PriceDifferentialCreateInput,
  PriceDifferentialUpdateInput,
  PriceObservationInput,
  PriceSourceCreateInput,
  parseUtcInstant,
} from "@/lib/admin/price-validation";
import { REFERENCE_COMMODITIES } from "@/lib/pricing/types";

/**
 * Feature 010 T049 — STATIC proofs for reference-price administration: platform-admin gating on every page and every
 * write (checked BEFORE any database access), revalidation only on the success path, no delete / service role / shared
 * cache / RPC, and input contracts that store exact decimals, refuse exchange-rate data and read instants as UTC.
 * The live behaviour (real sessions, real RLS, real rows) is `price-admin-live.test.tsx`; the running-server cache
 * round trip is `tests/browser/feature010-price-admin.browser.mjs`.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
function walk(dir: string, out: string[] = []): string[] {
  if (!statSync(path.join(root, dir), { throwIfNoEntry: false })) return out;
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const LAYER = "lib/admin/prices.ts";
const ROUTES = walk("src/app/dashboard-admin/(catalogue)/prices");
const PAGES = ROUTES.filter((f) => f.endsWith("page.tsx"));
const T049_FILES = [LAYER, "lib/admin/price-validation.ts", "components/admin/catalogue/price-fields.ts", "components/admin/catalogue/price-parts.tsx", ...ROUTES];

/** Each exported async write function's body, by name. */
function writeBodies(): Map<string, string> {
  const src = strip(read(LAYER));
  const out = new Map<string, string>();
  const re = /export async function (\w+)\(input: unknown\)[^{]*\{/g;
  const starts = [...src.matchAll(re)];
  starts.forEach((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index! : src.length;
    out.set(match[1], src.slice(match.index!, end));
  });
  return out;
}

describe("T049 — the area is declared once, platform-admin only, inside the catalogue group", () => {
  it("`prices` is a live catalogue area requiring is_platform_admin (the price_*_admin RLS truth), and the group guard is the same function", () => {
    expect(ADMIN_AREAS.find((a) => a.key === "prices")).toMatchObject({ group: "catalogue", href: "/dashboard-admin/prices", roleFunction: "is_platform_admin", availability: "live" });
    expect(ADMIN_GROUP_ROLE_FUNCTIONS.catalogue).toBe("is_platform_admin");
  });

  it("every price page re-verifies its own area server-side and renders the denial — never the page — when refused", () => {
    expect(PAGES.length).toBe(5);
    for (const file of PAGES) {
      const src = read(file);
      expect(src, file).toContain('checkAreaAccess("prices")');
      expect(src, file).toMatch(/if \(!access\.ok\) return <AdminAccessDenied denial=\{access\.denial\} requiredFunction="is_platform_admin" \/>;/);
      // the guard is the FIRST awaited call in the page — before params, and before any read
      const firstAwait = src.search(/await (?!checkAreaAccess)/);
      if (firstAwait !== -1) expect(src.indexOf('await checkAreaAccess("prices")'), file).toBeLessThan(firstAwait);
    }
  });

  it("the Server Actions only delegate to the layer — no client, no table, no RPC, no public-cache call of their own", () => {
    const actions = strip(read("src/app/dashboard-admin/(catalogue)/prices/actions.ts"));
    expect(actions).toMatch(/^"use server";/);
    expect(actions).not.toMatch(/createClient|\.from\(|\.rpc\(|revalidateTag|revalidateReferencePrices/);
    expect(actions).toMatch(/from "@\/lib\/admin\/prices"/);
  });
});

describe("T049 — every write is gated first and revalidates only on success", () => {
  const bodies = writeBodies();

  it("the five writes exist and nothing else writes", () => {
    expect([...bodies.keys()].sort()).toEqual(["createPriceDifferential", "createPriceSource", "recordPriceObservation", "updatePriceDifferential", "updatePriceSource"]);
  });

  it("each write validates, then calls requirePriceAdmin() (a LIVE is_platform_admin() check) BEFORE it opens a database client", () => {
    expect(strip(read(LAYER))).toContain('checkRoleFunctionAccess("is_platform_admin")');
    for (const [name, body] of bodies) {
      const parse = body.indexOf(".safeParse(input)");
      const gate = body.indexOf("await requirePriceAdmin()");
      const client = body.indexOf("await createClient()");
      expect(parse, name).toBeGreaterThan(-1);
      expect(gate, name).toBeGreaterThan(parse);
      expect(client, name).toBeGreaterThan(gate);
      expect(body.slice(gate, client), name).toMatch(/if \(!access\.ok\) return \{ ok: false, code: access\.code \};/);
    }
  });

  it("revalidation happens ONLY through saved(), exactly once, as the final success return — every failure branch returns before it", () => {
    const src = strip(read(LAYER));
    expect(src.match(/revalidateReferencePrices\(\)/g)).toHaveLength(1);
    expect(src).toMatch(/function saved\(id: string\)[^{]*\{\s*return \{ ok: true, data: \{ id, revalidatedTags: revalidateReferencePrices\(\) \}/);
    for (const [name, body] of bodies) {
      expect(body.match(/saved\(/g), name).toHaveLength(1);
      const savedAt = body.indexOf("return saved(");
      // no statement after the success return, and every error check precedes it
      expect(body.slice(savedAt).trim().split("\n").length, name).toBeLessThanOrEqual(2);
      for (const failure of [...body.matchAll(/return (writeFailure|validationFailure|\{ ok: false)/g)]) expect(failure.index!, name).toBeLessThan(savedAt);
    }
  });

  it("no delete, no service role, no RPC, no shared cache, no raw error text anywhere in the T049 files", () => {
    for (const file of T049_FILES) {
      const src = strip(read(file));
      expect(src, file).not.toMatch(/\.delete\(|service[_-]?role|SERVICE_ROLE|createAdminClient|\.rpc\(|unstable_cache|"use cache"|cacheTag|cacheLife|error\.message/);
    }
  });

  it("observations are append-only: the layer never updates or upserts price_observations", () => {
    const src = strip(read(LAYER));
    expect(src).not.toMatch(/from\("price_observations"\)\s*\.(update|upsert)\(/);
    expect(src.match(/from\("price_observations"\)\s*\.insert\(/g)).toHaveLength(1);
  });

  it("the source update never touches code / source_type, and the differential update never touches amount / currency / unit / type / scope", () => {
    const bodies = writeBodies();
    const sourceUpdate = bodies.get("updatePriceSource")!;
    const sourcePayload = sourceUpdate.slice(sourceUpdate.indexOf(".update("), sourceUpdate.indexOf(".eq(", sourceUpdate.indexOf(".update(")));
    expect(sourcePayload).toMatch(/licence_status: parsed\.data\.licenceStatus/);
    expect(sourcePayload).not.toMatch(/\bcode:|source_type:|created_by:/);
    const diffUpdate = bodies.get("updatePriceDifferential")!;
    const payload = diffUpdate.slice(diffUpdate.indexOf(".update("), diffUpdate.indexOf(".eq(", diffUpdate.indexOf(".update(")));
    expect(payload).not.toMatch(/amount|currency|unit|differential_type|coffee_id|origin_id|lot_id|created_by/);
  });
});

describe("T049 — price integrity: exact decimals, no exchange-rate data, UTC instants", () => {
  const observation = { sourceId: "f0110000-0000-4000-8000-000000000001", symbol: "KC", commodityType: "ARABICA", rawValue: "187.4321", rawCurrency: "usd", rawUnit: "cents/lb", observedAt: "2026-09-01T12:00" };

  it("an observation keeps the entered decimal TEXT (never a float) and upper-cases only the currency code", () => {
    const parsed = PriceObservationInput.parse(observation);
    expect(parsed.rawValue).toBe("187.4321");
    expect(typeof parsed.rawValue).toBe("string");
    expect(parsed.rawCurrency).toBe("USD");
    expect(parsed.rawUnit).toBe("cents/lb");
    expect(parsed.isStale).toBe(false);
  });

  it.each([
    ["1.1234567", "more than the column scale — would be silently rounded"],
    ["1,234.5", "thousands separator"],
    ["1e3", "exponent"],
    ["-5", "negative benchmark"],
    ["0", "zero"],
    ["0.000000", "zero"],
    ["abc", "not a number"],
    ["", "empty"],
  ])("refuses the observation value %s (%s)", (rawValue) => {
    const result = PriceObservationInput.safeParse({ ...observation, rawValue });
    expect(result.success).toBe(false);
  });

  it("only the benchmark commodities Feature 011 displays can be recorded — the exchange-rate and OTHER types are refused", () => {
    expect(PRICE_OBSERVATION_COMMODITIES).toBe(REFERENCE_COMMODITIES);
    for (const commodityType of ["FX", "OTHER"]) {
      const result = PriceObservationInput.safeParse({ ...observation, commodityType });
      expect(result.success, commodityType).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toBe("COMMODITY_INVALID");
    }
    expect(PRICE_SOURCE_TYPES).not.toContain("FX");
    expect(PriceSourceCreateInput.safeParse({ name: "X source", code: "F010P-X", sourceType: "FX", licenceStatus: "PENDING", delayType: "DELAYED" }).success).toBe(false);
  });

  it("instants without a zone are UTC — never the server's local zone — and an observation cannot be in the future", () => {
    expect(parseUtcInstant("2026-09-01T12:00")).toBe("2026-09-01T12:00:00.000Z");
    expect(parseUtcInstant("2026-09-01T12:00:30Z")).toBe("2026-09-01T12:00:30.000Z");
    expect(parseUtcInstant("2026-09-01T14:00+02:00")).toBe("2026-09-01T12:00:00.000Z");
    expect(parseUtcInstant("01/09/2026 12:00")).toBeNull();
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const result = PriceObservationInput.safeParse({ ...observation, observedAt: future });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((i) => i.message)).toContain("DATE_IN_FUTURE");
  });

  it("a differential keeps its exact (possibly negative) decimal text; one scope at most; effective-until must follow effective-from", () => {
    const base = { differentialType: "ORIGIN", amount: "-1.25", currency: "USD", unit: "KG", effectiveFrom: "2026-09-01T00:00" };
    expect(PriceDifferentialCreateInput.parse(base).amount).toBe("-1.25");
    expect(PriceDifferentialCreateInput.safeParse({ ...base, amount: "1.1234567" }).success).toBe(false);
    const both = PriceDifferentialCreateInput.safeParse({ ...base, coffeeId: "f0110000-0000-4000-8000-000000000001", originId: "f0110000-0000-4000-8000-000000000002" });
    expect(both.success).toBe(false);
    if (!both.success) expect(both.error.issues.map((i) => i.message)).toContain("SCOPE_SINGLE");
    const window = PriceDifferentialCreateInput.safeParse({ ...base, effectiveUntil: "2026-08-01T00:00" });
    expect(window.success).toBe(false);
    if (!window.success) expect(window.error.issues.map((i) => i.message)).toContain("EFFECTIVE_UNTIL_BEFORE_FROM");
    // the lifecycle update carries no value fields at all
    expect(Object.keys(PriceDifferentialUpdateInput.shape).sort()).toEqual(["differentialId", "effectiveUntil", "isActive", "notes"]);
  });

  it("no conversion, rate or arithmetic exists in the admin price layer or its contracts (DB-OPEN-08)", () => {
    for (const file of [LAYER, "lib/admin/price-validation.ts", "components/admin/catalogue/price-fields.ts", "components/admin/catalogue/price-parts.tsx"]) {
      const src = strip(read(file));
      expect(src, file).not.toMatch(/convert|toUsd|perKg\(|exchangeRate|fxRate|parseFloat|Number\(\w*[vV]alue|Number\(\w*amount|toFixed|Math\.round|\* ?100\b|Intl\.NumberFormat/);
    }
  });
});

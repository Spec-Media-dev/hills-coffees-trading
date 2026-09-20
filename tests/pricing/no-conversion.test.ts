import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as pricingCache from "@/lib/pricing/cache";
import * as differentials from "@/lib/pricing/differentials";
import * as freshness from "@/lib/pricing/freshness";
import * as presentation from "@/lib/pricing/presentation";
import * as sources from "@/lib/pricing/sources";
import * as types from "@/lib/pricing/types";

/**
 * Feature 011 T018 / T006 (FR-006, SC-005) — NO CURRENCY OR UNIT CONVERSION exists anywhere in the pricing layer while
 * DB-OPEN-08 stands (the approved schema has no exchange-rate storage, so an auditable cents/lb → USD/MT → USD/kg
 * conversion is impossible — PX-03).
 *
 * The guard is layered so it would FAIL if a conversion helper were added:
 *   1. the T006 grep (`convert|toUsd|perKg(|fx`) over `lib/pricing` and `components/pricing` is empty;
 *   2. no export of any pricing module is named like a conversion/exchange/arithmetic helper;
 *   3. no arithmetic is applied to a price value in the layer (no `parseFloat`/`Number(`/`toFixed`/`Math.` on a value);
 *   4. no exchange-rate observation is ever read, and no rate table is queried;
 *   5. the recorded limitation (DB-OPEN-08) is cited in the source.
 * The mutation block runs the SAME detector over synthetic "bad" sources and proves it fires.
 */

const roots = ["lib/pricing", "components/pricing"];
const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const files = roots.flatMap(filesUnder);
const sourceOf = (file: string) => readFileSync(file, "utf8");

/** The T006 Verify pattern, verbatim. */
const T006_PATTERN = /convert|toUsd|perKg\(|fx/i;
const ARITHMETIC_ON_VALUES = /\b(parseFloat|parseInt|toFixed|toPrecision|toLocaleString|Math\.(round|floor|ceil|trunc|abs|min|max|pow))\b|\bNumber\(|\bnew Intl\.NumberFormat|\bIntl\.NumberFormat/;
const CONVERSION_EXPORT = /(convert|conversion|toUsd|toUSD|toEur|perKg|perMt|perLb|exchange|rate|fx|normali[sz]e.*(price|value|unit|currency))/i;

function violations(fileName: string, text: string): string[] {
  const found: string[] = [];
  if (T006_PATTERN.test(text)) found.push(`${fileName}: matches the T006 grep`);
  if (ARITHMETIC_ON_VALUES.test(text)) found.push(`${fileName}: applies arithmetic/rounding/locale formatting`);
  if (/from\("[a-z_]*(fx|rate|exchange)[a-z_]*"\)/i.test(text)) found.push(`${fileName}: queries a rate table`);
  if (/(?:commodity_type|commodity)[^\n]*['"]FX['"]/.test(text)) found.push(`${fileName}: reads an exchange-rate observation`);
  return found;
}

describe("T018 — no conversion / exchange-rate helper exists", () => {
  it("the T006 grep over lib/pricing and components/pricing returns nothing", () => {
    expect(files.length).toBeGreaterThan(8);
    const offenders = files.filter((f) => T006_PATTERN.test(sourceOf(f)));
    expect(offenders).toEqual([]);
  });

  it("no exported binding of any pricing module is named like a conversion / exchange / unit-normalisation helper", () => {
    const names = Object.entries({ types, sources, differentials, freshness, presentation, pricingCache }).flatMap(([mod, exp]) => Object.keys(exp).map((k) => `${mod}.${k}`));
    expect(names.length).toBeGreaterThan(15);
    expect(names.filter((n) => CONVERSION_EXPORT.test(n.split(".")[1]))).toEqual([]);
  });

  it("no arithmetic, rounding or locale formatting is applied to a price value anywhere in the layer or its components", () => {
    const offenders = files.filter((f) => ARITHMETIC_ON_VALUES.test(sourceOf(f)));
    expect(offenders).toEqual([]);
  });

  it("no exchange-rate observation is read and no rate table is queried", () => {
    const all = violations("all", files.map(sourceOf).join("\n"));
    expect(all).toEqual([]);
    // the displayable commodity list is exactly the coffee benchmarks — no exchange-rate type, no OTHER
    expect([...types.REFERENCE_COMMODITIES]).toEqual(["ARABICA", "ROBUSTA", "ICO_INDICATOR"]);
  });

  it("the limitation is recorded at the point of use: DB-OPEN-08 is cited in the layer", () => {
    expect(sourceOf("lib/pricing/types.ts")).toMatch(/DB-OPEN-08/);
    expect(sourceOf("lib/pricing/sources.ts")).toMatch(/DB-OPEN-08/);
    expect(sourceOf("lib/pricing/differentials.ts")).toMatch(/DB-OPEN-08/);
  });

  it("the surface states the limitation to the reader (raw-values note on every benchmark, not-summed note on the basis)", () => {
    const copy = readFileSync("lib/public/copy/en.ts", "utf8");
    expect(copy).toMatch(/No currency or unit conversion is applied/);
    expect(copy).toMatch(/not added together, netted or converted/);
    expect(sourceOf("components/pricing/reference-price.tsx")).toContain("data-raw-values-note");
    expect(sourceOf("components/pricing/basis-breakdown.tsx")).toContain("data-not-summed");
  });

  it("the value is never parsed to a number on its way to the screen (it is text end to end)", () => {
    const sourcesText = sourceOf("lib/pricing/sources.ts");
    expect(sourcesText).toContain("raw_value::text");
    expect(sourceOf("lib/pricing/differentials.ts")).toContain("amount::text");
    expect(sourceOf("lib/pricing/types.ts")).toMatch(/readonly rawValue: string;/);
  });
});

describe("T018 — the detector WOULD FAIL if a conversion helper were added (mutation)", () => {
  const bad: Array<[string, string]> = [
    ["a convert helper", "export function convertToUsdPerKg(value: string) { return value; }"],
    ["a cents→dollars helper", "export const toUsd = (cents: string) => cents;"],
    ["an fx table read", 'const r = await client.from("fx_rates").select("rate");'],
    ["float parsing of a price value", "const v = parseFloat(price.rawValue) * 0.01;"],
    ["locale formatting of a value (rounds to 3 decimals by default)", "new Intl.NumberFormat('en-US').format(Number(price.rawValue));"],
    ["a per-kg helper", "export function perKg(x: string) { return x; }"],
    ["reading an exchange-rate observation", "const rows = data.filter((r) => r.commodity_type === 'FX');"],
  ];
  it.each(bad)("flags %s", (_label, snippet) => {
    expect(violations("synthetic.ts", snippet).length).toBeGreaterThan(0);
  });
  it("does not flag the real layer (the detector is not simply always-true)", () => {
    expect(violations("lib/pricing/sources.ts", sourceOf("lib/pricing/sources.ts"))).toEqual([]);
  });
});

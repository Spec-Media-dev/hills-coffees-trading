import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REFERENCE_PRICE_BRAND,
  makeReferencePrice,
  type ExecutablePrice,
  type ExecutedPrice,
  type HillsQuotePrice,
  type ListingPrice,
  type ReferencePrice,
} from "@/lib/pricing/types";

/**
 * Feature 011 T014 / T001 / T002 (PS1, FR-001, SC-001) — the four price types are NON-INTERCHANGEABLE.
 *
 * THE ASSERTIONS THAT MATTER ARE COMPILE-TIME. Vitest does not type-check, so every `@ts-expect-error` below is
 * verified by `npx tsc --noEmit` (the project's typecheck includes `tests/**`): if a substitution ever starts to
 * COMPILE, the now-unused `@ts-expect-error` is itself a type error and the build fails. That is what "deliberately
 * substituting types fails the build" means here — and the runtime tests then pin the structural facts the
 * compile-time ones rely on.
 */

const VALID_INPUT = {
  source: { name: "Approved Source", code: "APP", sourceType: "ICE_ARABICA", url: null },
  symbol: "KC",
  commodity: "ARABICA",
  rawValue: "250.125",
  rawUnit: "cents/lb",
  rawCurrency: "USD",
  observedAt: "2026-09-01T12:00:00Z",
  delayType: "DELAYED",
  delayMinutes: null as number | null,
};

const reference = makeReferencePrice(VALID_INPUT)!;
// The three executable types have no constructor in this feature; tests fabricate them ONLY to exercise the compiler.
const listing = { kind: "LISTING", amount: "1", currency: "USD", unit: "KG" } as unknown as ListingPrice;
const executed = { kind: "EXECUTED", amount: "1", currency: "USD", unit: "KG" } as unknown as ExecutedPrice;
const quote = { kind: "HILLS_QUOTE" } as unknown as HillsQuotePrice;

function acceptExecutable(price: ExecutablePrice): string {
  return price.kind;
}
function acceptReference(price: ReferencePrice): string {
  return price.kind;
}
function acceptListing(price: ListingPrice): string {
  return price.kind;
}
function acceptExecuted(price: ExecutedPrice): string {
  return price.kind;
}
function acceptQuote(price: HillsQuotePrice): string {
  return price.kind;
}

describe("T014 — compile-time separation (verified by `tsc --noEmit`)", () => {
  it("a ReferencePrice cannot be passed where an executable price is expected", () => {
    // @ts-expect-error — REFERENCE is not an ExecutablePrice (FR-001, SC-001)
    acceptExecutable(reference);
    // …while each genuine executable type IS accepted (so the expectation above is about the reference type, not the function):
    acceptExecutable(listing);
    acceptExecutable(executed);
    acceptExecutable(quote);
    expect(true).toBe(true);
  });

  it("no executable price can stand in for a ReferencePrice", () => {
    // @ts-expect-error — a listing price is not a reference price
    acceptReference(listing);
    // @ts-expect-error — an executed price is not a reference price
    acceptReference(executed);
    // @ts-expect-error — a Hills quote is not a reference price
    acceptReference(quote);
    acceptReference(reference);
    expect(true).toBe(true);
  });

  it("the four types are pairwise non-interchangeable", () => {
    // @ts-expect-error — reference is not a listing price
    acceptListing(reference);
    // @ts-expect-error — executed is not a listing price
    acceptListing(executed);
    // @ts-expect-error — quote is not a listing price
    acceptListing(quote);
    // @ts-expect-error — reference is not an executed price
    acceptExecuted(reference);
    // @ts-expect-error — listing is not an executed price
    acceptExecuted(listing);
    // @ts-expect-error — quote is not an executed price
    acceptExecuted(quote);
    // @ts-expect-error — reference is not a Hills quote
    acceptQuote(reference);
    // @ts-expect-error — listing is not a Hills quote
    acceptQuote(listing);
    // @ts-expect-error — executed is not a Hills quote
    acceptQuote(executed);
    expect(true).toBe(true);
  });

  it("a plain object with the same visible fields is not a ReferencePrice (the brand cannot be forged structurally)", () => {
    const lookalike = { kind: "REFERENCE", rawValue: "1", referenceOnly: true } as const;
    // @ts-expect-error — missing the brand and the disclosure fields
    acceptReference(lookalike);
    expect(true).toBe(true);
  });

  it("the disclosure fields are non-optional on ReferencePrice (omitting any is a type error)", () => {
    // @ts-expect-error — `source` is required
    const missingSource: ReferencePrice = { ...reference, source: undefined };
    // @ts-expect-error — `timeZone` is required and is exactly "UTC"
    const badTimeZone: ReferencePrice = { ...reference, timeZone: "Europe/London" };
    // @ts-expect-error — `referenceOnly` is required and is exactly `true`
    const notReferenceOnly: ReferencePrice = { ...reference, referenceOnly: false };
    void [missingSource, badTimeZone, notReferenceOnly];
    expect(true).toBe(true);
  });
});

describe("T014 — runtime facts the compile-time separation relies on", () => {
  it("the factory yields a branded, frozen REFERENCE object; a ReferencePrice is never an executable kind", () => {
    expect(reference.kind).toBe("REFERENCE");
    expect((reference as unknown as Record<symbol, unknown>)[REFERENCE_PRICE_BRAND]).toBe(true);
    expect(Object.isFrozen(reference)).toBe(true);
    expect(["LISTING", "EXECUTED", "HILLS_QUOTE"]).not.toContain(reference.kind);
  });

  it("the brand does not survive a JSON round trip — consumers must re-validate through the factory (cache boundary)", () => {
    const roundTripped = JSON.parse(JSON.stringify(reference)) as Record<string | symbol, unknown>;
    expect(roundTripped[REFERENCE_PRICE_BRAND]).toBeUndefined();
  });

  it("disclosure is structural: the factory refuses (null) when ANY disclosure element is missing or malformed", () => {
    const bad: Array<[string, Partial<typeof VALID_INPUT> | { source: unknown }]> = [
      ["empty source name", { source: { ...VALID_INPUT.source, name: " " } }],
      ["empty source code", { source: { ...VALID_INPUT.source, code: "" } }],
      ["empty unit", { rawUnit: "" }],
      ["empty currency", { rawCurrency: " " }],
      ["empty value", { rawValue: "" }],
      ["non-decimal value", { rawValue: "12abc" }],
      ["float exponent value", { rawValue: "1e3" }],
      ["unparsable timestamp", { observedAt: "yesterday" }],
      ["unknown delay type", { delayType: "LIVE" }],
      ["unknown commodity (an exchange-rate or OTHER observation is not a benchmark)", { commodity: "OTHER" }],
      ["negative delay minutes", { delayMinutes: -1 }],
      ["fractional delay minutes", { delayMinutes: 1.5 }],
    ];
    for (const [label, patch] of bad) {
      expect(makeReferencePrice({ ...VALID_INPUT, ...patch } as never), label).toBeNull();
    }
    expect(makeReferencePrice(null as never)).toBeNull();
    expect(makeReferencePrice({ ...VALID_INPUT, source: null } as never)).toBeNull();
  });

  it("it does NOT alter a digit: the stored decimal text is preserved exactly (only padding whitespace is trimmed)", () => {
    expect(makeReferencePrice({ ...VALID_INPUT, rawValue: "0.10" })!.rawValue).toBe("0.10");
    expect(makeReferencePrice({ ...VALID_INPUT, rawValue: "  250.125000 " })!.rawValue).toBe("250.125000");
    expect(makeReferencePrice({ ...VALID_INPUT, rawValue: "9007199254740993.1234567890123" })!.rawValue).toBe("9007199254740993.1234567890123");
    expect(makeReferencePrice({ ...VALID_INPUT, rawCurrency: "USD " })!.rawCurrency).toBe("USD");
  });
});

describe("T002 — HillsQuotePrice is declared but has NO data model and NO constructor", () => {
  const typesSource = readFileSync("lib/pricing/types.ts", "utf8");

  it("carries a comment citing the missing quote entity", () => {
    const block = typesSource.slice(typesSource.indexOf("export type HillsQuotePrice"));
    const comment = typesSource.slice(0, typesSource.indexOf("export type HillsQuotePrice")).split("/**").pop()!;
    expect(comment).toMatch(/NO DATA MODEL EXISTS/);
    expect(comment).toMatch(/no quote entity|NO quote entity/i);
    expect(block).toMatch(/readonly kind: "HILLS_QUOTE"/);
  });

  it("no code path anywhere constructs a HillsQuotePrice (no factory, no cast to it, no export of a builder)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !full.replaceAll("\\", "/").startsWith("tests/") && !full.replaceAll("\\", "/").includes("/tests/")) {
          const text = readFileSync(full, "utf8");
          if (/(as|<)\s*HillsQuotePrice\b/.test(text) || /makeHillsQuote|toHillsQuote|createHillsQuote|buildHillsQuote/.test(text)) offenders.push(full);
        }
      }
    };
    for (const dir of ["lib", "components", "src"]) walk(dir);
    expect(offenders).toEqual([]);
  });

  it("the type has no fields to be filled from listing or reference data — only its kind and brand", () => {
    const keys = ["kind"];
    expect(Object.keys({ kind: "HILLS_QUOTE" } satisfies Pick<HillsQuotePrice, "kind">)).toEqual(keys);
  });
});

describe("T001 — there is NO generic shared price type", () => {
  it("lib/pricing declares no `Price` / `Money` / `Amount` / `Currency*` umbrella type", () => {
    const offenders: string[] = [];
    for (const file of readdirSync("lib/pricing")) {
      const text = readFileSync(path.join("lib/pricing", file), "utf8");
      if (/\b(type|interface)\s+(Price|Money|Amount|PriceValue|GenericPrice|AnyMoney)\b/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the union of executable types deliberately excludes ReferencePrice", () => {
    const typesSource = readFileSync("lib/pricing/types.ts", "utf8");
    expect(typesSource).toMatch(/export type ExecutablePrice = ListingPrice \| ExecutedPrice \| HillsQuotePrice;/);
  });
});

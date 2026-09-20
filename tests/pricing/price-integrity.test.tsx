import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/locale/locale-provider";
import { ReferencePriceStage } from "@/components/pricing/reference-price-section";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { buildReferencePresentation } from "@/lib/pricing/presentation";
import { fetchBenchmarkSnapshot } from "@/lib/pricing/sources";

import { SOURCE_IDS, createFakePriceClient, observation, source } from "./fake-price-client";

/**
 * Feature 011 PRICE INTEGRITY (FR-006, SC-002, SC-004, SC-005) — end to end, from a stored row to the rendered DOM:
 *
 *   - the stored amount and currency are rendered EXACTLY (digit for digit; no rounding, grouping, float drift);
 *   - no invented conversion / no hidden arithmetic: every digit on screen comes from a stored input;
 *   - licence_status is respected; unlicensed sources never reach the DOM;
 *   - missing / unknown reference data produces an honest state.
 */

beforeAll(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList);
});
afterEach(cleanup);

const NOW = new Date("2026-09-20T12:00:00Z");
const wrap = (node: React.ReactNode) => render(<ThemeProvider><LocaleProvider>{node}</LocaleProvider></ThemeProvider>);

async function renderRows(observations: Record<string, unknown>[], sources = [source(SOURCE_IDS.approved)], diffs: Parameters<typeof buildReferencePresentation>[1] = []) {
  const snapshot = await fetchBenchmarkSnapshot(createFakePriceClient({ price_sources: sources, price_observations: observations }).client, "2026-09-20T11:00:00Z");
  const presentation = buildReferencePresentation(snapshot, diffs, NOW);
  return { presentation, ...wrap(<ReferencePriceStage presentation={presentation} />) };
}

describe("exact rendering — the stored decimal, digit for digit", () => {
  const CASES: Array<[string, string]> = [
    ["a plain decimal", "250.125"],
    ["a trailing zero (a float would print 0.1)", "0.10"],
    ["trailing zeros that carry precision", "250.125000"],
    ["a value beyond double precision (a float would print 9007199254740992)", "9007199254740993"],
    ["many decimals", "0.1234567890123456"],
    ["a large integer with no grouping separators added", "1234567.891"],
    ["a negative differential-style value", "-3.5"],
  ];

  it.each(CASES)("%s: %s is rendered exactly", async (_label, value) => {
    const { container } = await renderRows([observation(SOURCE_IDS.approved, { raw_value: value })]);
    expect(container.querySelector("[data-reference-value] data")?.textContent).toBe(value);
    expect(container.querySelector("[data-reference-value] data")?.getAttribute("value")).toBe(value);
  });

  it("a number-typed value from a legacy client is stringified with no digit lost (numeric → text, no arithmetic)", async () => {
    const { container } = await renderRows([observation(SOURCE_IDS.approved, { raw_value: 250.125 })]);
    expect(container.querySelector("[data-reference-value] data")?.textContent).toBe("250.125");
  });

  it("currency and unit are the stored strings, verbatim — whatever they are (no normalisation to a preferred unit)", async () => {
    for (const [currency, unit] of [["USD", "cents/lb"], ["USD", "USD/MT"], ["EUR", "EUR/kg"], ["USc", "US cents per pound"]]) {
      cleanup();
      const { container } = await renderRows([observation(SOURCE_IDS.approved, { raw_currency: currency, raw_unit: unit })]);
      expect(container.querySelector('[data-disclosure="currency"]')?.textContent).toBe(currency);
      expect(container.querySelector('[data-disclosure="unit"]')?.textContent).toBe(unit);
    }
  });

  it("character(n) padding on the currency is trimmed and nothing else is altered", async () => {
    const { container } = await renderRows([observation(SOURCE_IDS.approved, { raw_currency: "USD " })]);
    expect(container.querySelector('[data-disclosure="currency"]')?.textContent).toBe("USD");
  });
});

describe("no invented conversion, no hidden arithmetic", () => {
  it("two observations in DIFFERENT units/currencies are shown side by side as recorded — never compared, ranked, normalised or combined", async () => {
    const { container, presentation } = await renderRows([
      observation(SOURCE_IDS.approved, { symbol: "KC", raw_value: "250.125", raw_currency: "USD", raw_unit: "cents/lb" }),
      observation(SOURCE_IDS.approved, { symbol: "RC", commodity_type: "ROBUSTA", raw_value: "4100", raw_currency: "USD", raw_unit: "USD/MT" }),
    ]);
    expect(presentation.status).toBe("ready");
    const values = [...container.querySelectorAll("[data-reference-value] data")].map((el) => el.textContent);
    expect(values).toEqual(["250.125", "4100"]);
    const text = container.textContent ?? "";
    // No derived figure: e.g. 4100 MT → per lb (1.859…), cents/lb → USD/kg (5.514…), the ratio of the two, or their sum.
    for (const derived of ["5.51", "1.85", "4350", "4350.125", "0.0625", "16.39", "per kg", "per lb", "USD/kg"]) expect(text, derived).not.toContain(derived);
    // no "comparison" language either
    expect(text).not.toMatch(/\b(higher|lower|cheaper|premium|discount|spread)\b/i);
  });

  it("every digit on screen traces back to a stored input (value, timestamp, delay minutes) — the DOM contains no computed number", async () => {
    const stored = { value: "250.125", observedAt: "2026-09-01T12:05:00+00:00", delayMinutes: 15 };
    const snapshot = await fetchBenchmarkSnapshot(createFakePriceClient({ price_sources: [source(SOURCE_IDS.approved, { delay_minutes: stored.delayMinutes, name: "Approved Source", code: "APP" })], price_observations: [observation(SOURCE_IDS.approved, { raw_value: stored.value, observed_at: stored.observedAt })] }).client, "t");
    const presentation = buildReferencePresentation(snapshot, [{ type: "ORIGIN", amount: "12.50", currency: "USD", unit: "KG", effectiveFrom: "2026-08-01T00:00:00Z", effectiveUntil: null }], NOW);
    const { container } = wrap(<ReferencePriceStage presentation={presentation} />);
    // strip the elements whose digits come from a stored input, then require NO digit to remain except those allowed sources
    const allowed = ["250.125", "12.50", "15", "2026-09-01 12:05", "2026-08-01", "KC"];
    let text = container.textContent ?? "";
    for (const a of allowed) text = text.split(a).join("·");
    expect(text.match(/\d+/g) ?? [], text).toEqual([]);
  });

  it("the basis shows its components separately and the amounts are not summed even when currency and unit MATCH", async () => {
    const { container } = await renderRows([observation(SOURCE_IDS.approved)], [source(SOURCE_IDS.approved)], [
      { type: "ORIGIN", amount: "12.5", currency: "USD", unit: "KG", effectiveFrom: "2026-08-01T00:00:00Z", effectiveUntil: null },
      { type: "QUALITY", amount: "0.75", currency: "USD", unit: "KG", effectiveFrom: "2026-08-01T00:00:00Z", effectiveUntil: null },
    ]);
    expect(container.textContent).not.toContain("13.25");
    expect([...container.querySelectorAll("[data-differential-amount]")].map((e) => e.textContent)).toEqual(["12.5", "0.75"]);
  });
});

describe("licence state is respected in the rendered output", () => {
  it("an unlicensed / inactive source's value never reaches the DOM (all four states + inactive)", async () => {
    const sources = [
      source(SOURCE_IDS.approved),
      source(SOURCE_IDS.pending, { licence_status: "PENDING", name: "Pending Feed" }),
      source(SOURCE_IDS.restricted, { licence_status: "RESTRICTED", name: "Restricted Feed" }),
      source(SOURCE_IDS.disabled, { licence_status: "DISABLED", name: "Disabled Feed" }),
      source(SOURCE_IDS.inactive, { is_active: false, name: "Inactive Feed" }),
    ];
    const observations = [
      observation(SOURCE_IDS.approved, { raw_value: "250.125" }),
      observation(SOURCE_IDS.pending, { raw_value: "111.111" }),
      observation(SOURCE_IDS.restricted, { raw_value: "222.222" }),
      observation(SOURCE_IDS.disabled, { raw_value: "333.333" }),
      observation(SOURCE_IDS.inactive, { raw_value: "444.444" }),
    ];
    const { container } = await renderRows(observations, sources);
    const html = container.innerHTML;
    expect(html).toContain("250.125");
    for (const leaked of ["111.111", "222.222", "333.333", "444.444", "Pending Feed", "Restricted Feed", "Disabled Feed", "Inactive Feed"]) expect(html, leaked).not.toContain(leaked);
  });

  it("when nothing is licensed the surface states that reference pricing is not published — an honest unavailable state, no empty widget", async () => {
    const { container } = await renderRows([observation(SOURCE_IDS.pending)], [source(SOURCE_IDS.pending, { licence_status: "PENDING" })]);
    expect(container.querySelector('[data-reference-price="unavailable"]')?.getAttribute("data-unavailable-reason")).toBe("no_approved_source");
    expect(container.querySelector("[data-reference-value], data")).toBeNull();
  });

  it("nothing in the rendered output can be mistaken for an offer, quote or executable price", async () => {
    const { container } = await renderRows([observation(SOURCE_IDS.approved)]);
    expect(container.querySelector('[data-price-type="REFERENCE"]')).not.toBeNull();
    expect(container.querySelector("button, a, form, input")).toBeNull();
    expect(container.textContent).toMatch(/Reference information, not an offer\./);
  });
});

describe("missing or unknown reference data → an honest state", () => {
  it("no observation for an approved source → 'no observation available', no number", async () => {
    const { container } = await renderRows([]);
    expect(container.querySelector('[data-reference-price="unavailable"]')?.getAttribute("data-unavailable-reason")).toBe("no_observation");
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("an unknown commodity / delay type from the database is withheld — never coerced into a known one", async () => {
    const { container } = await renderRows([observation(SOURCE_IDS.approved, { commodity_type: "ARABICA" })], [source(SOURCE_IDS.approved, { delay_type: "STREAMING" })]);
    expect(container.querySelector('[data-unavailable-reason="incomplete_disclosure"]')).not.toBeNull();
    expect(container.textContent).not.toContain("250.125");
  });
});

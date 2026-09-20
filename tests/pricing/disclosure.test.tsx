import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { LocaleProvider } from "@/components/locale/locale-provider";
import { BasisBreakdown } from "@/components/pricing/basis-breakdown";
import { ReferencePriceView } from "@/components/pricing/reference-price";
import { ReferencePriceStage } from "@/components/pricing/reference-price-section";
import { StaleState } from "@/components/pricing/stale-state";
import { UnavailableState } from "@/components/pricing/unavailable-state";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { copy } from "@/lib/public/copy";
import { getCopy } from "@/lib/public/copy";
import { unavailable } from "@/lib/pricing/freshness";
import { buildReferencePresentation } from "@/lib/pricing/presentation";
import { makeReferencePrice, type ReferencePrice } from "@/lib/pricing/types";

/**
 * Feature 011 T015 / T008 / T009 (PS2, FR-003, FR-004, SC-002, AC-06) — EVERY required disclosure element renders
 * with a benchmark, and incomplete data withholds the value.
 */

beforeAll(() => {
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList);
});
afterEach(cleanup);

const wrap = (node: React.ReactNode) => render(<ThemeProvider><LocaleProvider>{node}</LocaleProvider></ThemeProvider>);

const INPUT = {
  source: { name: "Approved Source", code: "APP", sourceType: "ICE_ARABICA", url: null },
  symbol: "KC",
  commodity: "ARABICA",
  rawValue: "250.125",
  rawUnit: "cents/lb",
  rawCurrency: "USD",
  observedAt: "2026-09-01T12:05:00Z",
  delayType: "DELAYED",
  delayMinutes: 15 as number | null,
};
const price = makeReferencePrice(INPUT)!;

const EN = getCopy("en");
const AR = getCopy("ar");

describe("T015 — a complete benchmark renders all seven disclosure elements (+ the value)", () => {
  it("source, raw unit, raw currency, observation timestamp, time zone, delay type and the reference-only statement", () => {
    const { container } = wrap(<ReferencePriceView price={price} />);
    const disclosure = (name: string) => container.querySelector(`[data-disclosure="${name}"]`);

    expect(disclosure("source")?.textContent).toContain("Approved Source");
    expect(disclosure("unit")?.textContent).toBe("cents/lb");
    expect(disclosure("currency")?.textContent).toBe("USD");
    expect(disclosure("observed")?.textContent).toBe("2026-09-01 12:05 UTC");
    expect(disclosure("time-zone")?.textContent).toBe("UTC");
    expect(disclosure("delay-type")?.textContent).toContain(EN.pricing.delayTypes.DELAYED);
    expect(disclosure("delay-type")?.getAttribute("data-delay-type")).toBe("DELAYED");
    expect(disclosure("reference-only")?.textContent).toContain(EN.pricing.referenceOnly);
    // the value itself, exactly as stored
    expect(container.querySelector("[data-reference-value] data")?.textContent).toBe("250.125");
    expect(container.querySelector("[data-reference-value] data")?.getAttribute("value")).toBe("250.125");
  });

  it("the observation timestamp is a machine-readable <time> carrying the stored instant", () => {
    const { container } = wrap(<ReferencePriceView price={price} />);
    expect(container.querySelector('[data-disclosure="observed"] time')?.getAttribute("datetime")).toBe("2026-09-01T12:05:00Z");
  });

  it("the delay minutes, when recorded, are shown next to the delay type (and only then)", () => {
    const withMinutes = wrap(<ReferencePriceView price={price} />);
    expect(withMinutes.container.querySelector('[data-disclosure="delay-type"]')?.textContent).toContain("15");
    cleanup();
    const noMinutes = wrap(<ReferencePriceView price={makeReferencePrice({ ...INPUT, delayMinutes: null })!} />);
    expect(noMinutes.container.querySelector('[data-disclosure="delay-type"]')?.textContent).not.toMatch(/\d/);
  });

  it("all four delay types are labelled honestly (REAL_TIME only ever appears when the source's record says so)", () => {
    for (const [type, label] of Object.entries(EN.pricing.delayTypes)) {
      cleanup();
      const { container } = wrap(<ReferencePriceView price={makeReferencePrice({ ...INPUT, delayType: type })!} />);
      expect(container.querySelector('[data-disclosure="delay-type"]')?.textContent).toContain(label);
    }
    // a DELAYED source is never labelled real-time
    cleanup();
    const { container } = wrap(<ReferencePriceView price={price} />);
    expect(container.textContent).not.toContain(EN.pricing.delayTypes.REAL_TIME);
  });

  it("the reference-only statement and the raw-values note are present, and no action/quote/offer control exists (FR-009)", () => {
    const { container } = wrap(<ReferencePriceView price={price} />);
    expect(container.querySelector("[data-disclosure='reference-only']")).not.toBeNull();
    expect(container.querySelector("[data-raw-values-note]")?.textContent).toContain(EN.pricing.rawValuesNote);
    expect(container.querySelector("button, a, input, form, select")).toBeNull();
    expect(container.querySelector('[data-price-type="REFERENCE"]')).not.toBeNull();
  });

  it("the Arabic rendition of every disclosure label exists (RTL surface) and the figure is an isolated LTR run", () => {
    const { container } = wrap(<ReferencePriceView price={price} />);
    const text = container.textContent ?? "";
    for (const label of [AR.pricing.fields.source, AR.pricing.fields.unit, AR.pricing.fields.currency, AR.pricing.fields.observed, AR.pricing.fields.timeZone, AR.pricing.fields.delay, AR.pricing.referenceOnly]) {
      expect(text).toContain(label);
    }
    for (const el of container.querySelectorAll("[data-reference-value] bdi")) expect(el.getAttribute("dir")).toBe("ltr");
    expect(container.querySelector('[data-disclosure="observed"] time')?.getAttribute("dir")).toBe("ltr");
  });

  it("the value is programmatically associated with its disclosure (aria-describedby → the reference-only statement)", () => {
    const { container } = wrap(<ReferencePriceView price={price} />);
    const describedBy = container.querySelector("[data-reference-value]")?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(container.querySelector(`[id="${describedBy}"]`)?.getAttribute("data-disclosure")).toBe("reference-only");
    const labelledBy = container.querySelector("article")?.getAttribute("aria-labelledby");
    expect(container.querySelector(`[id="${labelledBy}"]`)?.textContent).toBe("Approved Source");
  });
});

describe("T015 — incomplete data WITHHOLDS the value", () => {
  it("passing an incomplete object is a TYPE ERROR (verified by tsc)", () => {
    // @ts-expect-error — a bare number / partial disclosure is not a ReferencePrice
    void (() => <ReferencePriceView price={{ rawValue: "250.125" }} />);
    // @ts-expect-error — a string is not a ReferencePrice
    void (() => <ReferencePriceView price="250.125" />);
    expect(true).toBe(true);
  });

  it("a hand-forged object that skipped the factory (cast) renders the withheld state — never the bare figure", () => {
    const forged = { kind: "REFERENCE", rawValue: "250.125", rawUnit: "cents/lb", rawCurrency: "USD", referenceOnly: true } as unknown as ReferencePrice;
    const { container } = wrap(<ReferencePriceView price={forged} />);
    expect(container.textContent).not.toContain("250.125");
    expect(container.querySelector('[data-reference-price="unavailable"]')?.getAttribute("data-unavailable-reason")).toBe("incomplete_disclosure");
    expect(container.querySelector("[data-reference-value]")).toBeNull();
  });

  it("a JSON round-tripped price (brand lost at the cache boundary) is withheld too — consumers must rebuild through the factory", () => {
    const roundTripped = JSON.parse(JSON.stringify(price)) as ReferencePrice;
    const { container } = wrap(<ReferencePriceView price={roundTripped} />);
    expect(container.textContent).not.toContain("250.125");
    expect(container.querySelector('[data-unavailable-reason="incomplete_disclosure"]')).not.toBeNull();
  });

  it("at the presentation layer an observation with an empty unit / currency / source is WITHHELD, not shown bare", () => {
    const base = { sourceId: "s", source: { name: "Approved Source", code: "APP", sourceType: "ICE_ARABICA", url: null }, symbol: "KC", commodity: "ARABICA", rawValue: "250.125", rawUnit: "cents/lb", rawCurrency: "USD", observedAt: "2026-09-01T12:00:00Z", receivedAt: "2026-09-01T12:05:00Z", isStale: false, delayType: "DELAYED", delayMinutes: null };
    for (const patch of [{ rawUnit: "" }, { rawCurrency: " " }, { source: { ...base.source, name: "" } }, { delayType: "LIVE" }, { observedAt: "not-a-date" }]) {
      const presentation = buildReferencePresentation({ readAt: "2026-09-20T00:00:00Z", approvedSourceCount: 1, records: [{ ...base, ...patch }] }, [], new Date("2026-09-20T00:00:00Z"));
      expect(presentation.status).toBe("unavailable");
      if (presentation.status === "unavailable") expect(presentation.unavailable.reason).toBe("incomplete_disclosure");
      const { container } = wrap(<ReferencePriceStage presentation={presentation} />);
      expect(container.textContent).not.toContain("250.125");
      cleanup();
    }
  });

  it("the unavailable state renders NO number/value and always carries the reference-only statement", () => {
    for (const reason of ["no_approved_source", "no_observation", "incomplete_disclosure", "read_failed"] as const) {
      const { container } = wrap(<UnavailableState unavailable={unavailable(reason)} />);
      expect(container.textContent).not.toMatch(/\d/);
      expect(container.querySelector("[data-reference-value], data")).toBeNull();
      expect(container.querySelector('[data-disclosure="reference-only"]')?.textContent).toContain(EN.pricing.referenceOnly);
      expect(container.querySelector("section")?.getAttribute("data-unavailable-reason")).toBe(reason);
      cleanup();
    }
  });

  it("each unavailable reason has its own distinct headline (a failed read never reads as 'nothing exists')", () => {
    const titles = new Set<string>();
    for (const reason of ["no_approved_source", "no_observation", "incomplete_disclosure", "read_failed"] as const) {
      const { container } = wrap(<UnavailableState unavailable={unavailable(reason)} />);
      titles.add(container.querySelector("p.font-heading")?.textContent ?? "");
      cleanup();
    }
    expect(titles.size).toBe(4);
    expect(copy.pricing.unavailable.readFailed.title).not.toBe(copy.pricing.unavailable.noSource.title);
  });
});

describe("T009 / T010 — the other states carry their own honesty rules", () => {
  it("the stale state shows source + last-success timestamp and NO value field", () => {
    const stale = { kind: "STALE_REFERENCE" as const, source: { name: "Approved Source", code: "APP", sourceType: "ICE_ARABICA", url: null }, symbol: "KC", freshness: { state: "stale" as const, observedAt: "2026-08-30T09:30:00Z", receivedAt: "2026-08-30T09:35:00Z", timeZone: "UTC" as const, lastSuccessAt: "2026-08-30T09:30:00Z" } };
    const { container } = wrap(<StaleState reference={stale} />);
    expect(container.querySelector('[data-reference-price="stale"]')).not.toBeNull();
    expect(container.querySelector("[data-last-success] time")?.textContent).toBe("2026-08-30 09:30 UTC");
    expect(container.querySelector("[data-reference-value], data")).toBeNull();
    expect(container.textContent).not.toMatch(/250|\bcents\b/);
    expect(container.textContent).toContain(EN.pricing.stale.title);
    expect(container.querySelector('[data-disclosure="reference-only"]')).not.toBeNull();
  });

  it("the basis breakdown is labelled EXPLANATORY, shows type/amount/currency/unit/period per component, and has no total", () => {
    const basis = {
      benchmarks: [price],
      components: [
        { type: "ORIGIN" as const, amount: "12.5", currency: "USD", unit: "KG", effectiveFrom: "2026-08-01T00:00:00Z", effectiveUntil: "2026-12-31T00:00:00Z" },
        { type: "QUALITY" as const, amount: "0.75", currency: "USD", unit: "KG", effectiveFrom: "2026-08-01T00:00:00Z", effectiveUntil: null },
      ],
      explanatoryOnly: true as const,
    };
    const { container } = wrap(<BasisBreakdown basis={basis} />);
    expect(container.querySelector("[data-basis-breakdown]")?.getAttribute("data-explanatory-only")).toBe("true");
    expect(container.textContent).toContain(EN.pricing.basis.lead);
    const components = [...container.querySelectorAll("[data-basis-component]")];
    expect(components.map((c) => c.getAttribute("data-differential-type"))).toEqual(["ORIGIN", "QUALITY"]);
    expect(components[0].querySelector("[data-differential-amount]")?.textContent).toBe("12.5");
    expect(components[0].querySelector("[data-differential-unit]")?.textContent).toBe("USD · KG");
    expect(components[0].querySelector("[data-differential-period]")?.textContent).toContain("2026-08-01");
    expect(components[0].querySelector("[data-differential-period]")?.textContent).toContain("2026-12-31");
    expect(components[1].querySelector("[data-differential-period]")?.textContent).toContain(EN.pricing.basis.openEnded);
    // never summed, never an executable quote
    expect(container.querySelector("[data-not-summed]")?.textContent).toContain(EN.pricing.basis.notSummed);
    expect(container.textContent).not.toContain("13.25"); // 12.5 + 0.75 — the total that must never appear
    expect(container.textContent).not.toMatch(/\btotal\b|\bsum\b|\bquote\b.*\bprice\b/i);
    expect(container.querySelector("button, a, input, form")).toBeNull();
  });
});

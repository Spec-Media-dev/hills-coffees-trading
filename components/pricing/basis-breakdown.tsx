import { useId } from "react";

import { Bilingual } from "@/components/locale/bilingual";
import { formatObservationInstant } from "@/lib/pricing/freshness";
import type { BasisBreakdown as BasisBreakdownData } from "@/lib/pricing/presentation";

/**
 * Feature 011 basis breakdown (T010 — FR-010, PS5).
 *
 * THE BENCHMARK PLUS ITS RECORDED DIFFERENTIALS, LABELLED AS A BASIS EXPLANATION — NEVER AN EXECUTABLE QUOTE. Each
 * differential shows its type, amount, currency, unit and effective period — exactly as stored. The block:
 *
 *   - is headed and led as "explanation only" (`data-explanatory-only`), and says it is not a quote or an offer;
 *   - never adds, nets or transforms anything: benchmark and differentials are in different units/currencies (cents/lb
 *     vs USD/kg, for example) and DB-OPEN-08 means no auditable exchange-rate arithmetic exists — so there is no
 *     total, and the note says the amounts are not combined;
 *   - carries no purchase affordance.
 *
 * Numerals, currency codes, units and dates are isolated LTR runs with tabular figures (RTL-safe, FR-013).
 * Server Component; no client JavaScript.
 */

const date = (iso: string): string => formatObservationInstant(iso)?.slice(0, 10) ?? iso;

export function BasisBreakdown({ basis }: { basis: BasisBreakdownData }) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      data-basis-breakdown
      data-explanatory-only={basis.explanatoryOnly ? "true" : "false"}
      className="flex flex-col gap-6 rounded-[var(--radius-2xl)] border border-border bg-secondary p-6 text-foreground sm:p-8"
    >
      <header className="flex flex-col gap-2">
        <h3 id={titleId} className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)]">
          <Bilingual pick={(c) => c.pricing.basis.title} />
        </h3>
        <p className="max-w-[60ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          <Bilingual pick={(c) => c.pricing.basis.lead} />
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <h4 className="hc-eyebrow text-muted-foreground"><Bilingual pick={(c) => c.pricing.basis.benchmarkHeading} /></h4>
        <ul className="flex flex-col gap-2" data-basis-benchmarks>
          {basis.benchmarks.map((price) => (
            <li key={`${price.source.code}:${price.symbol}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[length:var(--text-small)]" data-basis-benchmark>
              <span className="font-medium">{price.source.name}</span>
              <bdi dir="ltr" className="tabular-nums">{price.symbol}</bdi>
              <bdi dir="ltr" className="font-semibold tabular-nums">{price.rawValue}</bdi>
              <bdi dir="ltr" className="text-muted-foreground">{price.rawCurrency} · {price.rawUnit}</bdi>
              <time dateTime={price.observedAt} dir="ltr" className="text-muted-foreground tabular-nums">{formatObservationInstant(price.observedAt)}</time>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="hc-eyebrow text-muted-foreground"><Bilingual pick={(c) => c.pricing.basis.differentialsHeading} /></h4>
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-card" data-basis-components>
          {basis.components.map((component) => (
            <li
              key={`${component.type}:${component.effectiveFrom}:${component.amount}:${component.currency}:${component.unit}`}
              className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              data-basis-component
              data-differential-type={component.type}
            >
              <span className="font-medium"><Bilingual pick={(c) => c.pricing.basis.types[component.type]} /></span>
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <bdi dir="ltr" className="font-semibold tabular-nums" data-differential-amount>{component.amount}</bdi>
                <bdi dir="ltr" className="text-muted-foreground" data-differential-unit>{component.currency} · {component.unit}</bdi>
              </span>
              <span className="text-[length:var(--text-small)] text-muted-foreground" data-differential-period>
                <Bilingual pick={(c) => c.pricing.basis.effective} />
                <span aria-hidden="true">: </span>
                <Bilingual pick={(c) => c.pricing.basis.from} /> <bdi dir="ltr" className="tabular-nums">{date(component.effectiveFrom)}</bdi>{" "}
                {component.effectiveUntil ? (
                  <>
                    <Bilingual pick={(c) => c.pricing.basis.until} /> <bdi dir="ltr" className="tabular-nums">{date(component.effectiveUntil)}</bdi>
                  </>
                ) : (
                  <Bilingual pick={(c) => c.pricing.basis.openEnded} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty" data-not-summed>
        <Bilingual pick={(c) => c.pricing.basis.notSummed} />
      </p>
      <p className="border-t border-border pt-3 text-[length:var(--text-small)] font-semibold" data-disclosure="reference-only">
        <Bilingual pick={(c) => c.pricing.referenceOnly} />
      </p>
    </section>
  );
}

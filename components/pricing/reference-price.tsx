import { useId } from "react";

import { Bilingual } from "@/components/locale/bilingual";
import { UnavailableState } from "@/components/pricing/unavailable-state";
import { formatObservationInstant, unavailable } from "@/lib/pricing/freshness";
import { isReferencePrice, type ReferencePrice } from "@/lib/pricing/types";

/**
 * Feature 011 reference-price display (T008 — FR-003, FR-004, SC-002; T019 RTL/a11y).
 *
 * THE LAST LINE OF DEFENCE FOR A RELEASE-BLOCKING DISCLOSURE REQUIREMENT (AC-06). The component takes the WHOLE
 * `ReferencePrice` — never a bare number — so passing an incomplete object is a TYPE ERROR
 * (`tests/pricing/disclosure.test.tsx` pins it). It also re-validates at runtime (`isReferencePrice`): a value that
 * skipped the factory through a cast renders the honest "withheld" unavailable state instead of a bare figure.
 *
 * ALL SEVEN ELEMENTS RENDER TOGETHER: source, raw unit, raw currency, observation timestamp, time zone, delay type,
 * and the reference-only statement — each as a labelled `<dt>/<dd>` pair (`data-disclosure="…"`), plus the value.
 *
 * NEVER EXECUTABLE-LOOKING: the block is headed by the commodity + symbol, states "Reference information, not an
 * offer", and carries no button, link-to-buy or price-action affordance of any kind (FR-009).
 *
 * EXACT VALUES: the figure is the stored decimal text, rendered as-is — no `Intl`, no rounding, no grouping, no
 * arithmetic, no currency or unit transformation (DB-OPEN-08). The raw-values note says so on the surface.
 *
 * RTL (FR-013): numerals, currency codes, units and timestamps are isolated LTR runs (`dir="ltr"` inside `<bdi>`)
 * with tabular figures, so they stay readable — and unmirrored — inside a right-to-left layout. The value is
 * programmatically associated with its disclosure through `aria-describedby`. Server Component; no client JavaScript.
 */

const FIELD = "flex flex-col gap-1 border-t border-border pt-3 first:border-t-0 first:pt-0 sm:[&:nth-child(-n+2)]:border-t-0 sm:[&:nth-child(-n+2)]:pt-0";
const LABEL = "hc-eyebrow text-muted-foreground";
const VALUE = "text-[length:var(--text-small)] font-medium text-foreground break-words [overflow-wrap:anywhere]";

export function ReferencePriceView({ price }: { price: ReferencePrice }) {
  const id = useId();
  const titleId = `${id}-title`;
  const disclosureId = `${id}-disclosure`;

  if (!isReferencePrice(price)) return <UnavailableState unavailable={unavailable("incomplete_disclosure")} />;

  const observed = formatObservationInstant(price.observedAt);
  if (observed === null) return <UnavailableState unavailable={unavailable("incomplete_disclosure")} />;

  return (
    <article
      aria-labelledby={titleId}
      data-reference-price="current"
      data-price-type="REFERENCE"
      className="flex flex-col gap-6 rounded-[var(--radius-2xl)] border border-border bg-card p-6 text-card-foreground shadow-[var(--shadow-lg)] sm:p-8 dark:shadow-none"
    >
      <header className="flex flex-col gap-2">
        <p className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          <Bilingual pick={(c) => c.pricing.commodities[price.commodity]} />
          <span aria-hidden="true"> · </span>
          <bdi dir="ltr">{price.symbol}</bdi>
        </p>
        <h3 id={titleId} className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)] break-words">
          {price.source.name}
        </h3>
      </header>

      {/* The figure — exactly as stored, an isolated LTR run, tabular figures. */}
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-describedby={disclosureId} data-reference-value>
        <bdi dir="ltr" className="font-heading text-[length:var(--text-h2)] font-semibold leading-none tabular-nums [overflow-wrap:anywhere]">
          <data value={price.rawValue}>{price.rawValue}</data>
        </bdi>
        <bdi dir="ltr" className="text-[length:var(--text-body)] text-muted-foreground">
          {price.rawCurrency} · {price.rawUnit}
        </bdi>
      </p>

      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <div className={FIELD}>
          <dt className={LABEL}><Bilingual pick={(c) => c.pricing.fields.source} /></dt>
          <dd className={VALUE} data-disclosure="source">
            {price.source.name}
            <span aria-hidden="true"> · </span>
            <bdi dir="ltr">{price.source.code}</bdi>
          </dd>
        </div>
        <div className={FIELD}>
          <dt className={LABEL}><Bilingual pick={(c) => c.pricing.fields.unit} /></dt>
          <dd className={VALUE} data-disclosure="unit"><bdi dir="ltr">{price.rawUnit}</bdi></dd>
        </div>
        <div className={FIELD}>
          <dt className={LABEL}><Bilingual pick={(c) => c.pricing.fields.currency} /></dt>
          <dd className={VALUE} data-disclosure="currency"><bdi dir="ltr">{price.rawCurrency}</bdi></dd>
        </div>
        <div className={FIELD}>
          <dt className={LABEL}><Bilingual pick={(c) => c.pricing.fields.observed} /></dt>
          <dd className={VALUE} data-disclosure="observed">
            <time dateTime={price.observedAt} dir="ltr" className="tabular-nums">{observed}</time>
          </dd>
        </div>
        <div className={FIELD}>
          <dt className={LABEL}><Bilingual pick={(c) => c.pricing.fields.timeZone} /></dt>
          <dd className={VALUE} data-disclosure="time-zone"><bdi dir="ltr">{price.timeZone}</bdi></dd>
        </div>
        <div className={FIELD}>
          <dt className={LABEL}><Bilingual pick={(c) => c.pricing.fields.delay} /></dt>
          <dd className={VALUE} data-disclosure="delay-type" data-delay-type={price.delayType}>
            <Bilingual pick={(c) => c.pricing.delayTypes[price.delayType]} />
            {price.delayMinutes !== null ? (
              <>
                <span aria-hidden="true"> · </span>
                <bdi dir="ltr" className="tabular-nums">{price.delayMinutes}</bdi> <Bilingual pick={(c) => c.pricing.delayMinutes} />
              </>
            ) : null}
          </dd>
        </div>
      </dl>

      <footer className="flex flex-col gap-2 border-t border-border pt-4">
        <p id={disclosureId} className="text-[length:var(--text-small)] font-semibold" data-disclosure="reference-only">
          <Bilingual pick={(c) => c.pricing.referenceOnly} />
        </p>
        <p className="text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty" data-raw-values-note>
          <Bilingual pick={(c) => c.pricing.rawValuesNote} />
        </p>
      </footer>
    </article>
  );
}

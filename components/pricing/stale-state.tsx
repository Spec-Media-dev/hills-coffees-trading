import { useId } from "react";

import { Bilingual } from "@/components/locale/bilingual";
import { unavailable, formatObservationInstant } from "@/lib/pricing/freshness";
import type { StaleReference } from "@/lib/pricing/presentation";
import { UnavailableState } from "@/components/pricing/unavailable-state";

/**
 * Feature 011 stale state (T009 — FR-005, FR-008, SC-004).
 *
 * A STALE FEED IS NEVER PRESENTED AS CURRENT. The `StaleReference` it takes has no value field at all, so this
 * component cannot render a current-looking figure — it says WHO (source, symbol), WHAT (stale) and WHEN (the last
 * successful observation, with its time zone). The verdict came from the stored `is_stale` flag and travels with the
 * cached record, so a cache hit renders exactly the same honest state (T017).
 *
 * The mandatory reference-only statement is present. Server Component; no client JavaScript.
 */
export function StaleState({ reference }: { reference: StaleReference }) {
  const titleId = useId();
  const lastSuccess = formatObservationInstant(reference.freshness.lastSuccessAt);

  // A stale record whose timestamp cannot be shown would say nothing useful: withhold, do not improvise.
  if (lastSuccess === null) return <UnavailableState unavailable={unavailable("incomplete_disclosure")} />;

  return (
    <section
      aria-labelledby={titleId}
      data-reference-price="stale"
      className="flex flex-col gap-4 rounded-[var(--radius-2xl)] border border-dashed border-border bg-card p-6 text-card-foreground sm:p-8"
    >
      <p className="hc-eyebrow text-muted-foreground">
        <bdi dir="ltr">{reference.symbol}</bdi>
        <span aria-hidden="true"> · </span>
        {reference.source.name}
      </p>
      <h3 id={titleId} className="font-heading text-[length:var(--text-h3)] font-semibold leading-[var(--lh-heading)]">
        <Bilingual pick={(c) => c.pricing.stale.title} />
      </h3>
      <p className="max-w-[56ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
        <Bilingual pick={(c) => c.pricing.stale.body} />
      </p>
      <p className="text-[length:var(--text-small)]" data-last-success>
        <span className="hc-eyebrow text-muted-foreground"><Bilingual pick={(c) => c.pricing.stale.lastSuccess} /></span>
        <span aria-hidden="true">: </span>
        <time dateTime={reference.freshness.lastSuccessAt} dir="ltr" className="font-medium tabular-nums">{lastSuccess}</time>
      </p>
      <p className="border-t border-border pt-3 text-[length:var(--text-small)] font-semibold" data-disclosure="reference-only">
        <Bilingual pick={(c) => c.pricing.referenceOnly} />
      </p>
    </section>
  );
}

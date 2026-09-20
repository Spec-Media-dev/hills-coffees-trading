import { useId } from "react";

import { Bilingual } from "@/components/locale/bilingual";
import { formatObservationInstant, type Unavailable } from "@/lib/pricing/freshness";

/**
 * Feature 011 unavailable state (T009 — FR-005, SC-004).
 *
 * THE EXPLICIT "THERE IS NOTHING TO SHOW" STATE. It renders NO value — not a number, not a placeholder, not an
 * example — and the copy says nothing is estimated in its place. Its DISTINCT reasons keep the surface honest about
 * WHY: no approved source, an approved source without an observation, a withheld incomplete record, or a failed read
 * (which must never read as "nothing exists"). The last-success timestamp appears only where one is genuinely known.
 *
 * The mandatory reference-only statement is always present. Same ruled-ground presentation as Feature 002's locked
 * stage, so the section reads as one designed object whether or not data exists. Server Component.
 */

const RULED_GROUND =
  "bg-[linear-gradient(to_right,color-mix(in_srgb,var(--border)_42%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--border)_42%,transparent)_1px,transparent_1px)] bg-[size:2.75rem_2.75rem] [mask-image:linear-gradient(90deg,transparent_0%,black_35%,black_100%)] rtl:[mask-image:linear-gradient(270deg,transparent_0%,black_35%,black_100%)]";

export function UnavailableState({ unavailable }: { unavailable: Unavailable }) {
  const labelId = useId();
  const lastSuccess = unavailable.lastSuccessAt ? formatObservationInstant(unavailable.lastSuccessAt) : null;

  return (
    <section
      aria-labelledby={labelId}
      data-reference-price="unavailable"
      data-unavailable-reason={unavailable.reason}
      className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card text-card-foreground shadow-[var(--shadow-lg)] dark:shadow-none"
    >
      <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${RULED_GROUND}`} />
      <div className="relative flex flex-col gap-5 p-7 sm:p-9 lg:p-12">
        <p id={labelId} className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
          <Bilingual pick={(c) => c.pricing.unavailable.label} />
        </p>
        <p className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] text-balance">
          {unavailable.reason === "no_approved_source" ? <Bilingual pick={(c) => c.pricing.unavailable.noSource.title} /> : null}
          {unavailable.reason === "no_observation" ? <Bilingual pick={(c) => c.pricing.unavailable.noObservation.title} /> : null}
          {unavailable.reason === "incomplete_disclosure" ? <Bilingual pick={(c) => c.pricing.unavailable.incomplete.title} /> : null}
          {unavailable.reason === "read_failed" ? <Bilingual pick={(c) => c.pricing.unavailable.readFailed.title} /> : null}
        </p>
        <p className="max-w-[56ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
          {unavailable.reason === "no_approved_source" ? <Bilingual pick={(c) => c.pricing.unavailable.noSource.body} /> : null}
          {unavailable.reason === "no_observation" ? <Bilingual pick={(c) => c.pricing.unavailable.noObservation.body} /> : null}
          {unavailable.reason === "incomplete_disclosure" ? <Bilingual pick={(c) => c.pricing.unavailable.incomplete.body} /> : null}
          {unavailable.reason === "read_failed" ? <Bilingual pick={(c) => c.pricing.unavailable.readFailed.body} /> : null}
        </p>
        {lastSuccess ? (
          <p className="text-[length:var(--text-small)] text-muted-foreground" data-last-success>
            <Bilingual pick={(c) => c.pricing.unavailable.lastSuccess} />
            <span aria-hidden="true">: </span>
            <time dateTime={unavailable.lastSuccessAt ?? undefined} dir="ltr" className="tabular-nums">{lastSuccess}</time>
          </p>
        ) : null}
        <p className="max-w-[56ch] border-t border-border pt-4 text-[length:var(--text-small)] font-semibold" data-disclosure="reference-only">
          <Bilingual pick={(c) => c.pricing.referenceOnly} />
        </p>
      </div>
    </section>
  );
}

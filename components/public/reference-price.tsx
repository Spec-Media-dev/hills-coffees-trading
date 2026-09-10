import { Bilingual } from "@/components/locale/bilingual";

/**
 * Reference-price presentation (Feature 002, T023 — FR-012, FR-013, SC-004; PS5; visually rebuilt
 * as a data stage by the public design convergence pass).
 *
 * ONLY THE UNAVAILABLE STATE IS IMPLEMENTED. Feature 011 owns real reference-price data — a numeric
 * value, source identity, observation timestamp, licence state, unit and currency. None of it exists
 * in a form this feature may present, and this component deliberately queries none of the three
 * price-data tables named in `contracts/reference-price-presentation.md` §1. PRICE-011 remains an
 * open sub-flow blocker; this component does not work around it, and it renders no fixture or
 * example numeric price anywhere.
 *
 * THE DISCRIMINATED UNION IS THE SAFETY MECHANISM. `ReferencePriceState` is shaped so an
 * `"unavailable"` value can never be mistaken for a numeric one — the unavailable branch carries no
 * optional `value` field to fall back to by accident. Only the `unavailable` branch is implemented
 * today; `available` is declared as an empty shape for Feature 011 to define when it exists.
 *
 * NEVER RENDERED: a number, a sample or placeholder price, a source name, an observation timestamp,
 * a freshness or staleness badge, a licence status, a currency, or a chart line. The stage behind
 * the text is an abstract ruled grid — no axis, no series, no tick values — so it cannot be read as
 * market data. The mandatory disclosure — "reference information, not an offer" — is always present.
 *
 * WHY IT IS BIGGER NOW: the previous small centred card read as a missing-feature notice. The state
 * is intentional and permanent until Feature 011, so it is presented as a designed, locked stage:
 * an editorial split with the label and the state on the inline-start and the disclosure held on
 * the ruled ground. Server Component; no client JavaScript.
 */

export type ReferencePriceState =
  | { status: "unavailable"; reason?: string }
  | {
      // Intentionally unspecified: Feature 011 defines this branch's fields when it exists. Feature
      // 002 must not guess at, stub, or partially implement them (contract §1, §3).
      status: "available";
    };

export type ReferencePriceProps = {
  state?: ReferencePriceState;
};

const DEFAULT_STATE: ReferencePriceState = { status: "unavailable" };

export function ReferencePrice({ state = DEFAULT_STATE }: ReferencePriceProps) {
  switch (state.status) {
    case "unavailable":
      return <UnavailableReferencePrice />;
    case "available":
      // Feature 002 implements no caller that can produce this state today — Feature 011 fills in
      // the real rendering when it exists. Falling back to the honest unavailable state is safer
      // than rendering nothing.
      return <UnavailableReferencePrice />;
  }
}

/**
 * The ruled ground: fine hairlines on both axes, fading toward the inline-end. Purely decorative and
 * deliberately featureless — there is no axis label, no baseline, no series and no value anywhere
 * on it, so it cannot imply a market figure (PRICE-011).
 */
const RULED_GROUND =
  "bg-[linear-gradient(to_right,color-mix(in_srgb,var(--border)_42%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--border)_42%,transparent)_1px,transparent_1px)] bg-[size:2.75rem_2.75rem] [mask-image:linear-gradient(90deg,transparent_0%,black_35%,black_100%)] rtl:[mask-image:linear-gradient(270deg,transparent_0%,black_35%,black_100%)]";

function UnavailableReferencePrice() {
  return (
    <aside className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card text-card-foreground shadow-[var(--shadow-lg)] dark:shadow-none">
      <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${RULED_GROUND}`} />
      <div className="relative grid gap-10 p-7 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:p-12">
        <div className="flex flex-col gap-5">
          <p className="hc-eyebrow text-[var(--gold-on-light)] dark:text-[var(--gold-on-dark)]">
            <Bilingual pick={(c) => c.referencePrice.label} />
          </p>
          {/* The state, set in the display face: the "figure" position is occupied by words, on
              purpose, so nothing here can be mistaken for a number. */}
          <p className="font-heading text-[length:var(--text-h2)] font-semibold leading-[var(--lh-heading)] tracking-[var(--tracking-heading)] text-balance">
            <Bilingual pick={(c) => c.referencePrice.unavailableTitle} />
          </p>
          <p className="max-w-[48ch] text-[length:var(--text-body)] leading-[1.7] text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.referencePrice.unavailableBody} />
          </p>
        </div>

        <div className="flex flex-col justify-end gap-6 lg:border-s lg:border-border lg:ps-12">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex size-2.5 shrink-0 rounded-full border border-[var(--gold-on-light)] dark:border-[var(--gold-on-dark)]"
            />
            <span className="hc-eyebrow text-muted-foreground">
              <Bilingual pick={(c) => c.home.reference.stageLabel} />
              <span aria-hidden="true"> · </span>
              <span className="text-foreground">
                <Bilingual pick={(c) => c.home.reference.stageState} />
              </span>
            </span>
          </div>
          <p className="max-w-[44ch] text-[length:var(--text-small)] leading-[1.7] text-muted-foreground text-pretty">
            <Bilingual pick={(c) => c.home.reference.stageNote} />
          </p>
          <p className="border-t border-border pt-4 text-[length:var(--text-small)] font-semibold">
            <Bilingual pick={(c) => c.referencePrice.disclosure} />
          </p>
        </div>
      </div>
    </aside>
  );
}

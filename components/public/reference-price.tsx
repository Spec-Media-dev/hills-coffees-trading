import { copy } from "@/lib/public/copy";

/**
 * Reference-price presentation (Feature 002, T023 — FR-012, FR-013, SC-004; PS5).
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
 * today; `available` is declared as an empty shape for Feature 011 to define when it exists, and this
 * component does not guess at, stub, or partially render that branch's eventual fields.
 *
 * NEVER RENDERED: a number, a sample or placeholder price, a source name, an observation timestamp,
 * a freshness or staleness badge, a licence status, or a currency conversion. The mandatory
 * disclosure — "reference information, not an offer" — is always present, so a visitor never mistakes
 * this section for a Hills executable quote or a member listing price (SRS §9, MKT-06).
 *
 * Server Component; no client JavaScript; no props required to render today's only reachable state.
 */

/**
 * Feature 011's eventual presentation contract. Only `unavailable` is implemented here; `available`
 * is declared so the union exists for Feature 011 to extend without this component's call sites
 * changing shape.
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

function UnavailableReferencePrice() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-6">
      <p className="text-sm font-medium text-foreground">
        {copy.referencePrice.unavailableTitle}
      </p>
      <p className="text-[0.8125rem] leading-[1.6] text-muted-foreground">
        {copy.referencePrice.unavailableBody}
      </p>
      <p className="text-[0.75rem] font-medium text-muted-foreground">
        {copy.referencePrice.disclosure}
      </p>
    </div>
  );
}

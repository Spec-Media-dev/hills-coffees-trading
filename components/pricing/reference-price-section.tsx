import { BasisBreakdown } from "@/components/pricing/basis-breakdown";
import { ReferencePriceView } from "@/components/pricing/reference-price";
import { StaleState } from "@/components/pricing/stale-state";
import { UnavailableState } from "@/components/pricing/unavailable-state";
import { getReferencePresentation, type ReferencePresentation } from "@/lib/pricing/presentation";

/**
 * Feature 011 → Feature 002 integration (T011 — FR-007, FR-009, SEC-001).
 *
 * `ReferencePriceStage` renders a `ReferencePresentation` and NOTHING ELSE: it makes no data query and holds no
 * price-table knowledge, so no public page queries the price tables directly — every public price surface renders
 * through the presentation contract, where the licence gate lives. `ReferencePriceSection` is the async Server
 * Component a page mounts; it reads the contract (public, anonymous, cached under the `reference-prices` tag, freshness
 * carried with each record) and never throws — a failed read is the explicit `read_failed` state.
 *
 * Reference data here is INFORMATION ONLY (FR-009): the section renders no purchase, quote or price-action control,
 * and the type system keeps a `ReferencePrice` out of every executable price position. It replaces Feature 002's
 * locked "unavailable only" stage on the public homepage (PRICE-011).
 */

export function ReferencePriceStage({ presentation }: { presentation: ReferencePresentation }) {
  if (presentation.status === "unavailable") return <UnavailableState unavailable={presentation.unavailable} />;

  return (
    <div className="flex flex-col gap-6" data-reference-price-stage data-reference-read-at={presentation.readAt}>
      <ul className="grid list-none gap-6 p-0 lg:grid-cols-2" data-reference-entries>
        {presentation.entries.map((entry) => (
          <li key={entry.state === "current" ? `${entry.price.source.code}:${entry.price.symbol}` : `${entry.stale.source.code}:${entry.stale.symbol}`} className="min-w-0">
            {entry.state === "current" ? <ReferencePriceView price={entry.price} /> : <StaleState reference={entry.stale} />}
          </li>
        ))}
      </ul>
      {presentation.basis ? <BasisBreakdown basis={presentation.basis} /> : null}
    </div>
  );
}

export async function ReferencePriceSection() {
  return <ReferencePriceStage presentation={await getReferencePresentation()} />;
}

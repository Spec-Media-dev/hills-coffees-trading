import Link from "next/link";

import { MediaPlaceholder } from "@/components/public/media-placeholder";
import type { PublicCoffeeSummary } from "@/lib/public/coffees";
import { copy } from "@/lib/public/copy";

/**
 * A published coffee, as it appears in a listing (Feature 002, Phases 3–4 — FR-022, FR-024).
 *
 * WHAT THIS CARD DELIBERATELY DOES NOT SHOW. The approved design kit's listing card carries grade,
 * harvest, quantity and price — but that card belongs to the authorised member marketplace. On the
 * public surface those are private trading data, and the source-priority order puts the database
 * baseline and the SRS above the design kit. So this card is built from the public DTO alone: name,
 * origin, coffee type and processing method. There is no grade, no cup score, no crop year, no
 * quantity, no MOQ, no availability, no seller and no price anywhere in it — and none of those
 * fields exists on `PublicCoffeeSummary` to render even by accident.
 *
 * The whole card is one link target, so the hit area matches what a visitor perceives as clickable.
 * Server Component; a real anchor, traversable with JavaScript disabled.
 */
export function CoffeeCard({ coffee }: { coffee: PublicCoffeeSummary }) {
  const origin = coffee.origin;

  return (
    <li className="group">
      <Link
        href={`/coffee/${coffee.slug}/`}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <MediaPlaceholder aspectRatio="3 / 2" className="rounded-none border-0 border-b" />

        <div className="flex flex-1 flex-col gap-2 p-6">
          {origin ? (
            <span className="text-[0.8125rem] font-medium text-accent">
              {origin.name}
              {origin.countryCode ? ` (${origin.countryCode})` : ""}
            </span>
          ) : null}

          <h3 className="text-lg font-semibold leading-snug tracking-[-0.015em] text-foreground">
            {coffee.name}
          </h3>

          {/*
            Type and process are the two specification facts a professional buyer scans for first,
            and both are public taxonomy. Rendered as a definition list so the label/value pairing
            survives without a screen reader having to infer it from layout.
          */}
          {coffee.coffeeType || coffee.processingMethod ? (
            <dl className="mt-auto flex flex-wrap gap-x-6 gap-y-1 pt-3 text-[0.8125rem] text-muted-foreground">
              {coffee.coffeeType ? (
                <div className="flex gap-2">
                  <dt className="sr-only">{copy.coffee.detail.coffeeType}</dt>
                  <dd>{coffee.coffeeType.name}</dd>
                </div>
              ) : null}
              {coffee.processingMethod ? (
                <div className="flex gap-2">
                  <dt className="sr-only">{copy.coffee.detail.processingMethod}</dt>
                  <dd>{coffee.processingMethod.name}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

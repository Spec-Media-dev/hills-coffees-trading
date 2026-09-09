import Link from "next/link";

import { MediaPlaceholder } from "@/components/public/media-placeholder";
import type { PublicOriginSummary } from "@/lib/public/origins";

/**
 * An active origin, as it appears in a listing (Feature 002, Phases 3–4 — FR-005).
 *
 * Built from the public origin DTO alone: name, region and country. No raw identifier and no
 * private field can appear here, because `PublicOriginSummary` does not carry one.
 *
 * The approved kit's origin card shows a lot count ("42 lots in stock"). That is member inventory
 * truth, not public catalogue data, so it is deliberately absent — a public origin card must not
 * imply a live order book (SRS MKT-06).
 *
 * Server Component; a real anchor.
 */
export function OriginCard({ origin }: { origin: PublicOriginSummary }) {
  return (
    <li>
      <Link
        href={`/origins/${origin.slug}/`}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_38px_rgba(23,60,50,0.045)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_18px_46px_rgba(23,60,50,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none motion-reduce:transition-none dark:shadow-none"
      >
        <MediaPlaceholder aspectRatio="3 / 2" className="rounded-none border-0 border-b" />

        <div className="flex flex-1 flex-col gap-2 p-6">
          <h3 className="text-xl font-semibold leading-snug tracking-[-0.015em] text-foreground">
            {origin.name}
          </h3>
          {origin.region ? (
            <span className="text-[0.8125rem] text-muted-foreground">
              {origin.region.name}
            </span>
          ) : null}
          {origin.countryCode ? (
            <span className="text-[0.8125rem] font-medium text-accent">
              {origin.countryCode}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
